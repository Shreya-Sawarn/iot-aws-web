'use strict';

/**
 * One-time migration: backfill GSI1PK / GSI1SK attributes onto existing
 * items in AccessControl, Schedule, Service, and Operations, without
 * deleting, recreating, or re-importing any data.
 *
 * - Scans each table in full (paginated).
 * - Adds GSI1PK / GSI1SK via UpdateCommand (additive SET only -- PK, SK,
 *   and every existing attribute are left untouched).
 * - Idempotent: an item that already carries both GSI1PK and GSI1SK is
 *   skipped.
 * - Operations contains mixed entity types (COMMAND/ACK/EVENT); any other
 *   entity_type is logged as a warning and skipped, never failing the
 *   migration.
 * - Does not create tables or GSIs -- assumes they already exist.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * Per-table rule: how to compute GSI1PK/GSI1SK for an item, and how to
 * label it in logs.
 *
 * `compute` returns:
 *   - { GSI1PK, GSI1SK } when the item has everything needed
 *   - null                when a required identifier field is missing (treated as a failure)
 *   - 'UNKNOWN_ENTITY'    when entity_type doesn't match any known case (Operations only;
 *                          logged as a warning and skipped, never a failure)
 */
const TABLE_RULES = {
  AccessControl: {
    compute: (item) => {
      if (!item.user_id) return null;
      return { GSI1PK: `USER#${item.user_id}`, GSI1SK: 'ACCESS' };
    },
    describe: (item) => `USER ${item.user_id || item.PK}`,
  },
  Schedule: {
    compute: (item) => {
      if (!item.schedule_id) return null;
      return { GSI1PK: `SCHEDULE#${item.schedule_id}`, GSI1SK: 'METADATA' };
    },
    describe: (item) => `SCHEDULE ${item.schedule_id || item.PK}`,
  },
  Service: {
    compute: (item) => {
      if (!item.service_ticket_id) return null;
      return { GSI1PK: `SERVICE#${item.service_ticket_id}`, GSI1SK: 'METADATA' };
    },
    describe: (item) => `SERVICE ${item.service_ticket_id || item.PK}`,
  },
  Operations: {
    compute: (item) => {
      switch (item.entity_type) {
        case 'COMMAND':
          if (!item.command_id) return null;
          return { GSI1PK: `COMMAND#${item.command_id}`, GSI1SK: 'METADATA' };
        case 'ACK':
          if (!item.ack_id) return null;
          return { GSI1PK: `ACK#${item.ack_id}`, GSI1SK: 'METADATA' };
        case 'EVENT':
          if (!item.event_id) return null;
          return { GSI1PK: `EVENT#${item.event_id}`, GSI1SK: 'METADATA' };
        default:
          return 'UNKNOWN_ENTITY';
      }
    },
    describe: (item) => `${item.entity_type || 'UNKNOWN'} ${item.command_id || item.ack_id || item.event_id || item.PK}`,
  },
};

const TABLES = ['AccessControl', 'Schedule', 'Service', 'Operations'];

/**
 * Scans an entire table, following LastEvaluatedKey until exhausted.
 * @param {DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @returns {Promise<object[]>}
 */
async function scanAllItems(docClient, tableName) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const response = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if (response.Items) items.push(...response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`[SCAN] ${tableName} loaded ${items.length} items`);
  return items;
}

/**
 * Applies the GSI1 backfill to a single item, if needed.
 * Never touches PK/SK or any other existing attribute.
 *
 * @param {DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @param {object} item
 * @param {{ compute: Function, describe: Function }} rule
 * @returns {Promise<'updated' | 'skipped'>}
 */
async function migrateItem(docClient, tableName, item, rule) {
  const computed = rule.compute(item);

  if (computed === 'UNKNOWN_ENTITY') {
    console.warn(`[WARN] ${tableName} -- unknown entity_type "${item.entity_type}" for PK=${item.PK} SK=${item.SK} -- skipping`);
    return 'skipped';
  }

  if (computed === null) {
    throw new Error(`${rule.describe(item)} is missing a required identifier field -- cannot compute GSI1PK`);
  }

  const { GSI1PK, GSI1SK } = computed;

  if (Object.prototype.hasOwnProperty.call(item, 'GSI1PK') && Object.prototype.hasOwnProperty.call(item, 'GSI1SK')) {
    console.log(`[SKIP] ${rule.describe(item)} already migrated`);
    return 'skipped';
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: 'SET #pk = :pk, #sk = :sk',
      // PK/SK are never referenced here -- only the new GSI attributes are set.
      ExpressionAttributeNames: { '#pk': 'GSI1PK', '#sk': 'GSI1SK' },
      ExpressionAttributeValues: { ':pk': GSI1PK, ':sk': GSI1SK },
    })
  );

  console.log(`[UPDATE] ${rule.describe(item)}`);
  return 'updated';
}

/**
 * Migrates a single table end-to-end: scan, then process every item,
 * tolerating per-item failures without stopping the table.
 *
 * @param {DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @returns {Promise<{ scanned: number, updated: number, skipped: number, failed: number }>}
 */
async function migrateTable(docClient, tableName) {
  const rule = TABLE_RULES[tableName];
  const items = await scanAllItems(docClient, tableName);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const result = await migrateItem(docClient, tableName, item, rule);
      if (result === 'updated') updated++;
      else skipped++;
    } catch (err) {
      failed++;
      console.error(`[ERROR] ${tableName} -- ${rule.describe(item)} -- ${err.message}`);
      // Continue with the remaining items regardless of this failure.
    }
  }

  console.log(`[DONE] ${tableName}`);
  return { scanned: items.length, updated, skipped, failed };
}

/**
 * Migration entry point.
 */
async function main() {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
  });
  const docClient = DynamoDBDocumentClient.from(client);

  let totalScanned = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const tableName of TABLES) {
    try {
      const result = await migrateTable(docClient, tableName);
      totalScanned += result.scanned;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalFailed += result.failed;
    } catch (err) {
      // Table-level failure (e.g. scan itself failed) -- log and continue
      // with the remaining tables rather than aborting the whole migration.
      console.error(`[ERROR] ${tableName} -- table-level failure -- ${err.message}`);
      totalFailed += 1;
    }
  }

  console.log('\n' + '='.repeat(48));
  console.log('Migration complete');
  console.log('='.repeat(18));
  console.log(`Total scanned: ${totalScanned}`);
  console.log(`Total updated: ${totalUpdated}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Total failed: ${totalFailed}`);

  process.exitCode = totalFailed > 0 ? 1 : 0;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL: Unhandled error during migration.');
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { scanAllItems, migrateItem, migrateTable, main, TABLE_RULES };
