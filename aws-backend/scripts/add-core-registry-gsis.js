'use strict';

/**
 * One-time migration: backfill governance-approved GSI attributes onto
 * existing CoreRegistry items, without deleting, recreating, or
 * re-importing any data.
 *
 * - Scans the entire CoreRegistry table (paginated).
 * - For DEVICE/ZONE/SITE/GATEWAY items, adds the corresponding GSI*PK /
 *   GSI*SK attributes via UpdateCommand (additive SET only -- PK, SK, and
 *   every existing attribute are left untouched).
 * - TENANT items are left as-is (no GSI required).
 * - Idempotent: an item that already carries its GSI attribute is skipped.
 * - Does not create tables or GSIs -- assumes they already exist.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'CoreRegistry'; // frozen -- do not change

/**
 * entity_type -> how to derive its GSI attributes.
 * idField is the source-of-truth identifier already present on the item;
 * pkAttr/skAttr are the attribute names to add.
 */
const GSI_RULES = {
  DEVICE: { idField: 'device_id', pkAttr: 'GSI1PK', skAttr: 'GSI1SK', buildPk: (id) => `DEVICE#${id}` },
  ZONE: { idField: 'zone_id', pkAttr: 'GSI2PK', skAttr: 'GSI2SK', buildPk: (id) => `ZONE#${id}` },
  SITE: { idField: 'site_id', pkAttr: 'GSI3PK', skAttr: 'GSI3SK', buildPk: (id) => `SITE#${id}` },
  GATEWAY: { idField: 'gateway_id', pkAttr: 'GSI4PK', skAttr: 'GSI4SK', buildPk: (id) => `GATEWAY#${id}` },
};

/**
 * Scans the entire CoreRegistry table, following LastEvaluatedKey until
 * the scan is exhausted.
 * @param {DynamoDBDocumentClient} docClient
 * @returns {Promise<object[]>} Every item in the table.
 */
async function scanAllItems(docClient) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const response = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if (response.Items) items.push(...response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;
    console.log(`[SCAN] Loaded ${items.length} item(s) so far${lastEvaluatedKey ? ' (more pages remain)' : ''}`);
  } while (lastEvaluatedKey);

  return items;
}

/**
 * A short, human-readable label for log lines (entity_type + its natural id).
 * @param {object} item
 * @returns {string}
 */
function describeItem(item) {
  const rule = GSI_RULES[item.entity_type];
  const id = rule ? item[rule.idField] : undefined;
  return `${item.entity_type || 'UNKNOWN'} ${id || item.PK}`;
}

/**
 * Applies the GSI backfill to a single item, if needed.
 * Never touches PK/SK or any other existing attribute -- only adds the
 * missing GSI*PK / GSI*SK pair via an additive UpdateExpression.
 *
 * @param {DynamoDBDocumentClient} docClient
 * @param {object} item
 * @returns {Promise<'updated' | 'skipped'>}
 */
async function migrateItem(docClient, item) {
  if (item.entity_type === 'TENANT') {
    console.log(`[SKIP] TENANT ${item.tenant_id || item.PK} -- Tenant records do not require GSI attributes`);
    return 'skipped';
  }

  const rule = GSI_RULES[item.entity_type];
  if (!rule) {
    console.log(`[SKIP] Unknown entity_type "${item.entity_type}" for PK=${item.PK} SK=${item.SK} -- no GSI rule defined`);
    return 'skipped';
  }

  if (Object.prototype.hasOwnProperty.call(item, rule.pkAttr)) {
    console.log(`[SKIP] ${describeItem(item)} already migrated`);
    return 'skipped';
  }

  const idValue = item[rule.idField];
  if (!idValue) {
    throw new Error(`${describeItem(item)} is missing required field "${rule.idField}" -- cannot build ${rule.pkAttr}`);
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: 'SET #pk = :pk, #sk = :sk',
      // PK/SK are never referenced here -- only the new GSI attributes are set.
      ExpressionAttributeNames: { '#pk': rule.pkAttr, '#sk': rule.skAttr },
      ExpressionAttributeValues: { ':pk': rule.buildPk(idValue), ':sk': 'METADATA' },
    })
  );

  console.log(`[UPDATE] ${describeItem(item)}`);
  return 'updated';
}

/**
 * Migration entry point.
 */
async function main() {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
  });
  const docClient = DynamoDBDocumentClient.from(client);

  const items = await scanAllItems(docClient);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const result = await migrateItem(docClient, item);
      if (result === 'updated') updated++;
      else skipped++;
    } catch (err) {
      failed++;
      console.error(`[ERROR] ${describeItem(item)} -- ${err.message}`);
      // Continue with the remaining items regardless of this failure.
    }
  }

  console.log('\n' + '='.repeat(48));
  console.log('[DONE] Migration complete');
  console.log('='.repeat(48));
  console.log(`Total scanned: ${items.length}`);
  console.log(`Total updated: ${updated}`);
  console.log(`Total skipped: ${skipped}`);
  console.log(`Total failed: ${failed}`);
  console.log('='.repeat(48));

  process.exitCode = failed > 0 ? 1 : 0;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL: Unhandled error during migration.');
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { scanAllItems, migrateItem, describeItem, main, GSI_RULES };
