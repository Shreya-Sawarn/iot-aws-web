'use strict';

// ============================================================
// OrbiPulse/OrbiDrive seed dataset transformation pipeline
// Excel (SW-SEED-001, Zone-updated) -> DynamoDB-ready JSON
//
// Approved hierarchy: Tenant -> Site -> Zone -> Gateway -> Device
// Target tables: CoreRegistry, AccessControl, State, TelemetryHistory,
//                Operations, Schedule, Service
// ============================================================

const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs-extra');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const WORKBOOK_PATH = path.join(
  PROJECT_ROOT,
  'seed-data',
  'DOC6_Appendix_C_SW_SEED_001_OrbiPulse_OrbiDrive_Demo_Seed_Dataset_RevA1_Zone_Updated.xlsx'
);
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');

// ─── 1. Workbook loader ───────────────────────────────────────

function loadWorkbook(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workbook not found at: ${filePath}`);
  }
  // cellDates: true -> date/time cells come back as JS Date objects
  // instead of raw Excel serial numbers, so timestamps are preserved
  // as the same instant in time, not reinterpreted.
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  console.log('Loaded workbook successfully.');
  return workbook;
}

// ─── 2. Generic sheet reader ──────────────────────────────────

function readSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.warn(`WARNING: Sheet "${sheetName}" not found in workbook. Skipping.`);
    return null;
  }
  // defval: null ensures every row object carries every header column,
  // even where the cell is blank, satisfying "preserve every source column".
  return xlsx.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

// ─── 3. Generic row cleaner ───────────────────────────────────

// Columns named like a timestamp (ends in `_at`, or starts with `ts_`)
// sometimes survive sheet_to_json as a raw Excel date serial number
// instead of a JS Date, because cellDates only converts cells whose
// number format SheetJS recognizes as date-like. Detecting by column
// name and converting via SSF.parse_date_code preserves the exact same
// instant in time without touching any other numeric column (lat, lon,
// battery_v, position_pct, etc.).
function isTimestampColumn(key) {
  const k = key.toLowerCase();
  return k.endsWith('_at') || k.startsWith('ts_');
}

function excelSerialToISO(serial) {
  const parsed = xlsx.SSF.parse_date_code(serial);
  if (!parsed) return serial; // not a valid date serial — leave value untouched
  const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.round(parsed.S)));
  return date.toISOString();
}

function cleanValue(key, value) {
  if (value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && isTimestampColumn(key)) return excelSerialToISO(value);
  return value;
}

function cleanRow(row) {
  const cleaned = {};
  for (const key of Object.keys(row)) {
    cleaned[key] = cleanValue(key, row[key]);
  }
  return cleaned;
}

function isRowEmpty(cleanedRow) {
  return Object.values(cleanedRow).every((value) => value === null);
}

// Source workbook intentionally contains date-only created_at/updated_at
// values (e.g. "2026-06-15"). These are valid dates, not malformed
// timestamps -- normalize to midnight UTC so they pass strict ISO-8601
// validation. Only created_at/updated_at are touched; every other field
// (including other *_at/ts_* columns) passes through unchanged.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ONLY_FIELDS = new Set(['created_at', 'updated_at']);

function normalizeDateOnlyTimestamps(row) {
  const result = { ...row };
  for (const field of DATE_ONLY_FIELDS) {
    const value = result[field];
    if (typeof value === 'string' && DATE_ONLY_RE.test(value)) {
      result[field] = `${value}T00:00:00.000Z`;
    }
  }
  return result;
}

// ─── 4. Generic item transformer ──────────────────────────────

function buildItem(cleanedRow, keyEntry) {
  return {
    PK: keyEntry.pk,
    SK: keyEntry.sk,
    entity_type: keyEntry.entityType,
    ...cleanedRow,
    ...(keyEntry.extra || {}),
  };
}

function processSheet(workbook, sheetName, keyBuilder) {
  const rows = readSheet(workbook, sheetName);
  if (rows === null) return [];

  const items = [];
  for (const rawRow of rows) {
    const cleaned = normalizeDateOnlyTimestamps(cleanRow(rawRow));
    if (isRowEmpty(cleaned)) continue;

    const built = keyBuilder(cleaned);
    if (built === null) continue; // missing required identifier(s) for this row

    if (Array.isArray(built)) {
      for (const entry of built) {
        items.push(buildItem(cleaned, entry));
      }
    } else {
      items.push(buildItem(cleaned, built));
    }
  }
  return items;
}

// ─── 5. File writer utility ───────────────────────────────────

function writeOutput(tableName, items) {
  const filePath = path.join(OUTPUT_DIR, `${tableName}.json`);
  fs.writeJsonSync(filePath, items, { spaces: 2 });
  console.log(`Generated ${tableName}.json (${items.length} records)`);
}

// ─── Sheet -> table mapping rules ─────────────────────────────
// PK/SK rules follow the frozen Tenant -> Site -> Zone -> Gateway -> Device
// hierarchy exactly as specified. No fields are invented; every keyBuilder
// only uses columns that actually exist in the source workbook.

const SHEET_DEFINITIONS = [
  {
    sheet: '01_Tenants',
    table: 'CoreRegistry',
    label: 'tenants',
    keyBuilder: (row) => {
      if (!row.tenant_id) return null;
      return { pk: `TENANT#${row.tenant_id}`, sk: 'METADATA', entityType: 'TENANT' };
    },
  },
  {
    sheet: '03_Sites_Hierarchy',
    table: 'CoreRegistry',
    label: 'sites',
    keyBuilder: (row) => {
      if (!row.tenant_id || !row.site_id) return null;
      return {
        pk: `TENANT#${row.tenant_id}`, sk: `SITE#${row.site_id}`, entityType: 'SITE',
        // Governance-approved GSI3 -- direct site lookup by site_id.
        extra: { GSI3PK: `SITE#${row.site_id}`, GSI3SK: 'METADATA' },
      };
    },
  },
  {
    sheet: '03B_Zones',
    table: 'CoreRegistry',
    label: 'zones',
    keyBuilder: (row) => {
      if (!row.site_id || !row.zone_id) return null;
      return {
        pk: `SITE#${row.site_id}`, sk: `ZONE#${row.zone_id}`, entityType: 'ZONE',
        // Governance-approved GSI2 -- direct zone lookup by zone_id.
        extra: { GSI2PK: `ZONE#${row.zone_id}`, GSI2SK: 'METADATA' },
      };
    },
  },
  {
    sheet: '04_Gateways',
    table: 'CoreRegistry',
    label: 'gateways',
    keyBuilder: (row) => {
      if (!row.zone_id || !row.gateway_id) return null;
      return {
        pk: `ZONE#${row.zone_id}`, sk: `GATEWAY#${row.gateway_id}`, entityType: 'GATEWAY',
        // Governance-approved GSI4 -- direct gateway lookup by gateway_id.
        extra: { GSI4PK: `GATEWAY#${row.gateway_id}`, GSI4SK: 'METADATA' },
      };
    },
  },
  {
    sheet: '05_Devices',
    table: 'CoreRegistry',
    label: 'devices',
    keyBuilder: (row) => {
      if (!row.zone_id || !row.device_id) return null;
      return {
        pk: `ZONE#${row.zone_id}`, sk: `DEVICE#${row.device_id}`, entityType: 'DEVICE',
        // Governance-approved GSI1 -- direct device lookup by device_id.
        extra: { GSI1PK: `DEVICE#${row.device_id}`, GSI1SK: 'METADATA' },
      };
    },
  },
  {
    sheet: '02_Users_Roles',
    table: 'AccessControl',
    label: 'user access records',
    keyBuilder: (row) => {
      if (!row.user_id) return null;
      return {
        pk: `USER#${row.user_id}`, sk: 'ACCESS', entityType: 'USER_ACCESS',
        extra: { GSI1PK: `USER#${row.user_id}`, GSI1SK: 'ACCESS' },
      };
    },
  },
  {
    sheet: '07_Latest_State',
    table: 'State',
    label: 'latest state records',
    keyBuilder: (row) => {
      if (!row.device_id) return null;
      return { pk: `DEVICE#${row.device_id}`, sk: 'LATEST_STATE', entityType: 'LATEST_STATE' };
    },
  },
  {
    sheet: '08_Telemetry_Samples',
    table: 'TelemetryHistory',
    label: 'telemetry samples',
    keyBuilder: (row) => {
      if (!row.device_id || !row.ts_device) return null;
      return { pk: `DEVICE#${row.device_id}`, sk: `TS#${row.ts_device}`, entityType: 'TELEMETRY' };
    },
  },
  {
    sheet: '09_Commands',
    table: 'Operations',
    label: 'commands',
    keyBuilder: (row) => {
      if (!row.device_id || !row.command_id) return null;
      return {
        pk: `DEVICE#${row.device_id}`, sk: `CMD#${row.command_id}`, entityType: 'COMMAND',
        extra: { GSI1PK: `COMMAND#${row.command_id}`, GSI1SK: 'METADATA' },
      };
    },
  },
  {
    sheet: '10_ACK_Samples',
    table: 'Operations',
    label: 'ACK samples',
    keyBuilder: (row) => {
      if (!row.device_id || !row.ack_id) return null;
      return {
        pk: `DEVICE#${row.device_id}`, sk: `ACK#${row.ack_id}`, entityType: 'ACK',
        extra: { GSI1PK: `ACK#${row.ack_id}`, GSI1SK: 'METADATA' },
      };
    },
  },
  {
    sheet: '11_Events_Faults',
    table: 'Operations',
    label: 'events/faults',
    keyBuilder: (row) => {
      if (!row.device_id || !row.event_id) return null;
      return {
        pk: `DEVICE#${row.device_id}`, sk: `EVT#${row.event_id}`, entityType: 'EVENT',
        extra: { GSI1PK: `EVENT#${row.event_id}`, GSI1SK: 'METADATA' },
      };
    },
  },
  {
    // NOTE: 12_Schedules has no single `device_id` column in the source
    // workbook — only a comma-separated `target_device_ids` column. The
    // instructed rule (PK = DEVICE#{device_id}) is honored by fanning out
    // one Schedule item per target device rather than inventing a
    // device_id field that does not exist in the source. Logged at runtime
    // whenever a schedule targets more than one device.
    sheet: '12_Schedules',
    table: 'Schedule',
    label: 'schedules',
    keyBuilder: (row) => {
      if (!row.schedule_id || !row.target_device_ids) return null;
      const deviceIds = String(row.target_device_ids)
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (deviceIds.length === 0) return null;
      if (deviceIds.length > 1) {
        console.warn(
          `NOTE: schedule_id=${row.schedule_id} targets ${deviceIds.length} devices ` +
          `(${deviceIds.join(', ')}) -- fanning out into ${deviceIds.length} Schedule items, one per device.`
        );
      }
      return deviceIds.map((deviceId) => ({
        pk: `DEVICE#${deviceId}`,
        sk: `SCH#${row.schedule_id}`,
        entityType: 'SCHEDULE',
        extra: {
          target_device_id: deviceId,
          GSI1PK: `SCHEDULE#${row.schedule_id}`,
          GSI1SK: 'METADATA',
        },
      }));
    },
  },
  {
    sheet: '16_Service_Records',
    table: 'Service',
    label: 'service records',
    keyBuilder: (row) => {
      if (!row.device_id || !row.service_ticket_id) return null;
      return {
        pk: `DEVICE#${row.device_id}`, sk: `SRV#${row.service_ticket_id}`, entityType: 'SERVICE_RECORD',
        extra: { GSI1PK: `SERVICE#${row.service_ticket_id}`, GSI1SK: 'METADATA' },
      };
    },
  },
];

const OUTPUT_TABLES = [
  'CoreRegistry',
  'AccessControl',
  'State',
  'TelemetryHistory',
  'Operations',
  'Schedule',
  'Service',
];

// ─── 6 & 7. Orchestration, error handling, progress logging ──

function run() {
  const workbook = loadWorkbook(WORKBOOK_PATH);
  fs.ensureDirSync(OUTPUT_DIR);

  const tableItems = {};
  for (const tableName of OUTPUT_TABLES) {
    tableItems[tableName] = [];
  }

  for (const def of SHEET_DEFINITIONS) {
    const items = processSheet(workbook, def.sheet, def.keyBuilder);
    tableItems[def.table].push(...items);
    console.log(`Processed ${items.length} ${def.label}.`);
  }

  for (const tableName of OUTPUT_TABLES) {
    writeOutput(tableName, tableItems[tableName]);
  }

  console.log('Transformation complete.');
}

if (require.main === module) {
  try {
    run();
  } catch (err) {
    console.error('FATAL: Seed transformation failed.');
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = {
  loadWorkbook,
  readSheet,
  cleanRow,
  isRowEmpty,
  buildItem,
  processSheet,
  writeOutput,
  run,
};
