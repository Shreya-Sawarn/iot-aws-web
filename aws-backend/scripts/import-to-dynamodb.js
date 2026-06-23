'use strict';

/**
 * OrbiPulse/OrbiDrive DynamoDB bulk importer.
 *
 * Reads the already-validated seed JSON files in ./output and bulk-writes
 * them into the corresponding (frozen-name) DynamoDB tables using
 * BatchWriteCommand, with chunking, UnprocessedItems retry, and
 * exponential backoff.
 *
 * This script does not modify any source JSON file and does not alter
 * table names, PK/SK structure, or entity mappings.
 */

const path = require('path');
const fs = require('fs-extra');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');
const BATCH_SIZE = 25; // DynamoDB BatchWriteItem hard limit
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000; // attempt 1 -> 1s, attempt 2 -> 2s, attempt 3 -> 4s, ...

/** file -> table name. Table names are frozen; do not change. */
const FILE_TABLE_MAP = [
  { file: 'CoreRegistry.json', table: 'CoreRegistry' },
  { file: 'AccessControl.json', table: 'AccessControl' },
  { file: 'State.json', table: 'State' },
  { file: 'TelemetryHistory.json', table: 'TelemetryHistory' },
  { file: 'Operations.json', table: 'Operations' },
  { file: 'Schedule.json', table: 'Schedule' },
  { file: 'Service.json', table: 'Service' },
];

/**
 * Reads and parses a JSON file from disk.
 * @param {string} filePath Absolute path to the JSON file.
 * @returns {any[]} Parsed array of records.
 * @throws {Error} If the file is missing or contains invalid JSON.
 */
function loadJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} does not contain a top-level JSON array.`);
  }
  return parsed;
}

/**
 * Splits an array into chunks of at most `size` elements.
 * @param {any[]} array
 * @param {number} size
 * @returns {any[][]}
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Validates that a record carries the mandatory key attributes.
 * @param {object} record
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    return { valid: false, reason: 'Record is not an object' };
  }
  if (!record.PK) return { valid: false, reason: 'Missing PK' };
  if (!record.SK) return { valid: false, reason: 'Missing SK' };
  if (!record.entity_type) return { valid: false, reason: 'Missing entity_type' };
  return { valid: true };
}

/**
 * Sleeps for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a single BatchWriteCommand for up to BATCH_SIZE items.
 * Network failures, throttling, and other thrown errors are caught and
 * treated as "every item in this batch is unprocessed" so the caller can
 * route them through the same retry/backoff path as explicit
 * UnprocessedItems, instead of crashing the whole import.
 *
 * @param {DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @param {object[]} items Plain item objects (already validated).
 * @returns {Promise<object[]>} Write requests that were not processed.
 */
async function writeBatch(docClient, tableName, items) {
  const requestItems = items.map((item) => ({ PutRequest: { Item: item } }));
  try {
    const response = await docClient.send(
      new BatchWriteCommand({ RequestItems: { [tableName]: requestItems } })
    );
    return (response.UnprocessedItems && response.UnprocessedItems[tableName]) || [];
  } catch (err) {
    console.warn(`  WARNING: BatchWriteCommand threw (${err.name || 'Error'}: ${err.message}) -- treating batch as unprocessed for retry.`);
    return requestItems;
  }
}

/**
 * Retries a set of unprocessed write requests with exponential backoff.
 * Attempt 1 waits 1s, attempt 2 waits 2s, attempt 3 waits 4s, etc.
 *
 * @param {DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @param {object[]} unprocessedItems Write requests returned by writeBatch.
 * @param {number} [maxRetries]
 * @returns {Promise<object[]>} Write requests that remain unprocessed after
 *   exhausting all retries (permanent failures for this batch).
 */
async function retryUnprocessedItems(docClient, tableName, unprocessedItems, maxRetries = MAX_RETRIES) {
  let remaining = unprocessedItems;
  let attempt = 0;

  while (remaining.length > 0 && attempt < maxRetries) {
    const waitMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
    attempt++;
    console.warn(`  Retrying ${remaining.length} unprocessed item(s) -- attempt ${attempt}/${maxRetries}, waiting ${waitMs}ms`);
    await sleep(waitMs);

    try {
      const response = await docClient.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: remaining } })
      );
      remaining = (response.UnprocessedItems && response.UnprocessedItems[tableName]) || [];
    } catch (err) {
      console.warn(`  WARNING: Retry attempt ${attempt} threw (${err.name || 'Error'}: ${err.message})`);
      // remaining stays as-is; loop will retry again until maxRetries is hit
    }
  }

  return remaining;
}

/**
 * Imports a single seed file into its corresponding DynamoDB table.
 *
 * @param {DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @param {string} filePath
 * @returns {Promise<{ table: string, imported: number, failed: number, skippedInvalid: number }>}
 */
async function importTable(docClient, tableName, filePath) {
  console.log('='.repeat(48));
  console.log(`Importing ${tableName}`);

  const records = loadJsonFile(filePath); // throws -> caller (main) handles file-level failure

  const validRecords = [];
  let skippedInvalid = 0;

  records.forEach((record, idx) => {
    const { valid, reason } = validateRecord(record);
    if (!valid) {
      skippedInvalid++;
      console.warn(`  SKIPPED invalid record at index ${idx} (${reason}): ${JSON.stringify(record)}`);
      return;
    }
    validRecords.push(record);
  });

  console.log(`Records: ${records.length} (valid: ${validRecords.length}, skipped invalid: ${skippedInvalid})`);

  const batches = chunkArray(validRecords, BATCH_SIZE);
  let imported = 0;
  let permanentlyFailed = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchLabel = `Batch ${i + 1}/${batches.length}`;

    let unprocessed = await writeBatch(docClient, tableName, batch);

    if (unprocessed.length > 0) {
      unprocessed = await retryUnprocessedItems(docClient, tableName, unprocessed);
    }

    const failedInBatch = unprocessed.length;
    const succeededInBatch = batch.length - failedInBatch;
    imported += succeededInBatch;
    permanentlyFailed += failedInBatch;

    if (failedInBatch === 0) {
      console.log(`${batchLabel} successful`);
    } else {
      console.error(`${batchLabel} FAILED for ${failedInBatch}/${batch.length} item(s) after ${MAX_RETRIES} retries`);
    }
  }

  console.log(`Completed ${tableName}`);
  console.log('='.repeat(48));

  return {
    table: tableName,
    imported,
    failed: permanentlyFailed + skippedInvalid,
    skippedInvalid,
  };
}

/**
 * Entry point: imports every mapped seed file into its DynamoDB table,
 * continuing past per-file failures, and prints a final summary.
 */
async function main() {
  const startTime = Date.now();

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
  });
  const docClient = DynamoDBDocumentClient.from(client);

  const results = [];
  let filesProcessed = 0;
  let filesFailedToLoad = 0;

  for (const { file, table } of FILE_TABLE_MAP) {
    const filePath = path.join(OUTPUT_DIR, file);
    try {
      const result = await importTable(docClient, table, filePath);
      results.push(result);
      filesProcessed++;
    } catch (err) {
      filesFailedToLoad++;
      console.error('='.repeat(48));
      console.error(`FAILED to import ${table} from ${file}`);
      console.error(`Reason: ${err.message}`);
      console.error('Continuing with remaining files...');
      console.error('='.repeat(48));
      results.push({ table, imported: 0, failed: 0, skippedInvalid: 0, fileLoadFailed: true });
    }
  }

  const totalImported = results.reduce((sum, r) => sum + r.imported, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '#'.repeat(48));
  console.log('IMPORT SUMMARY');
  console.log('#'.repeat(48));
  console.log(`Files processed: ${filesProcessed} / ${FILE_TABLE_MAP.length} (${filesFailedToLoad} failed to load)`);
  console.log(`Records imported: ${totalImported}`);
  console.log(`Records failed: ${totalFailed}`);
  console.log(`Total execution time: ${elapsedSec}s`);
  console.log('#'.repeat(48));

  const hasPermanentFailures = totalFailed > 0 || filesFailedToLoad > 0;
  process.exitCode = hasPermanentFailures ? 1 : 0;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL: Unhandled error during import.');
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  loadJsonFile,
  chunkArray,
  validateRecord,
  writeBatch,
  retryUnprocessedItems,
  importTable,
  main,
};
