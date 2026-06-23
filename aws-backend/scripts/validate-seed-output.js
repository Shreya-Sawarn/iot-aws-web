'use strict';

// ============================================================
// Pre-import integrity audit for DynamoDB seed files.
// Read-only: never modifies ./output/*.json. Produces a report only.
// ============================================================

const path = require('path');
const fs = require('fs-extra');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

const FILES = [
  'CoreRegistry.json',
  'AccessControl.json',
  'State.json',
  'TelemetryHistory.json',
  'Operations.json',
  'Schedule.json',
  'Service.json',
];

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const SUSPICIOUS_LITERALS = new Set(['undefined', 'NaN', 'Infinity', '-Infinity']);

function isTimestampField(key) {
  const k = key.toLowerCase();
  return k.endsWith('_at') || k.startsWith('ts_');
}

function isValidIsoUtc(value) {
  if (typeof value !== 'string') return false;
  if (!ISO_UTC_RE.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function loadFile(fileName) {
  const filePath = path.join(OUTPUT_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}` };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { error: `${fileName} does not contain a JSON array at the top level.` };
    }
    return { records: parsed };
  } catch (err) {
    return { error: `${fileName} is not valid JSON: ${err.message}` };
  }
}

// ─── Rule 1 — Invalid values ───────────────────────────────────

function auditInvalidValues(fileName, records, findings) {
  records.forEach((record, idx) => {
    const recordNo = idx + 1;
    if (record === null || typeof record !== 'object') {
      findings.push({ rule: 1, file: fileName, record: recordNo, reason: 'Record is not an object.' });
      return;
    }
    for (const key of Object.keys(record)) {
      if (key === '') {
        findings.push({ rule: 1, file: fileName, record: recordNo, reason: 'Empty string key found.' });
      }
      const value = record[key];

      if (value === undefined) {
        findings.push({ rule: 1, file: fileName, record: recordNo, reason: `Field ${key} = undefined` });
        continue;
      }
      if (typeof value === 'number' && Number.isNaN(value)) {
        findings.push({ rule: 1, file: fileName, record: recordNo, reason: `Field ${key} = NaN` });
        continue;
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        findings.push({ rule: 1, file: fileName, record: recordNo, reason: `Field ${key} = ${value}` });
        continue;
      }
      if (typeof value === 'string' && SUSPICIOUS_LITERALS.has(value)) {
        findings.push({
          rule: 1, file: fileName, record: recordNo,
          reason: `Field ${key} holds the literal string "${value}" (likely a stringified bug artifact)`,
        });
        continue;
      }
      if (isTimestampField(key) && value !== null && !isValidIsoUtc(value)) {
        findings.push({
          rule: 1, file: fileName, record: recordNo,
          reason: `Malformed timestamp: ${key} = ${JSON.stringify(value)}`,
        });
      }
    }
  });
}

// ─── Rule 2 — Required keys ────────────────────────────────────

function auditRequiredKeys(fileName, records, findings) {
  records.forEach((record, idx) => {
    const recordNo = idx + 1;
    for (const required of ['PK', 'SK', 'entity_type']) {
      if (!(required in record) || record[required] === null || record[required] === '') {
        findings.push({ rule: 2, file: fileName, record: recordNo, reason: `Missing or empty ${required}` });
      }
    }
  });
}

// ─── Rule 3 — PK/SK format validation ──────────────────────────

function expectPk(actual, expected, fileName, recordNo, findings) {
  if (actual !== expected) {
    findings.push({
      rule: 3, file: fileName, record: recordNo,
      reason: `PK mismatch: expected "${expected}", found "${actual}"`,
    });
  }
}
function expectSk(actual, expected, fileName, recordNo, findings) {
  if (actual !== expected) {
    findings.push({
      rule: 3, file: fileName, record: recordNo,
      reason: `SK mismatch: expected "${expected}", found "${actual}"`,
    });
  }
}
function expectSkPrefix(actual, prefix, fileName, recordNo, findings) {
  if (typeof actual !== 'string' || !actual.startsWith(prefix)) {
    findings.push({
      rule: 3, file: fileName, record: recordNo,
      reason: `SK should start with "${prefix}", found "${actual}"`,
    });
  }
}

function auditPkSkFormat(fileName, records, findings) {
  records.forEach((record, idx) => {
    const recordNo = idx + 1;
    const { PK, SK, entity_type } = record;
    if (PK === undefined || SK === undefined || entity_type === undefined) return; // already reported under Rule 2

    switch (fileName) {
      case 'CoreRegistry.json':
        switch (entity_type) {
          case 'TENANT':
            expectPk(PK, `TENANT#${record.tenant_id}`, fileName, recordNo, findings);
            expectSk(SK, 'METADATA', fileName, recordNo, findings);
            break;
          case 'SITE':
            expectPk(PK, `TENANT#${record.tenant_id}`, fileName, recordNo, findings);
            expectSk(SK, `SITE#${record.site_id}`, fileName, recordNo, findings);
            break;
          case 'ZONE':
            expectPk(PK, `SITE#${record.site_id}`, fileName, recordNo, findings);
            expectSk(SK, `ZONE#${record.zone_id}`, fileName, recordNo, findings);
            break;
          case 'GATEWAY':
            expectPk(PK, `ZONE#${record.zone_id}`, fileName, recordNo, findings);
            expectSk(SK, `GATEWAY#${record.gateway_id}`, fileName, recordNo, findings);
            break;
          case 'DEVICE':
            expectPk(PK, `ZONE#${record.zone_id}`, fileName, recordNo, findings);
            expectSk(SK, `DEVICE#${record.device_id}`, fileName, recordNo, findings);
            break;
          default:
            findings.push({ rule: 3, file: fileName, record: recordNo, reason: `Unknown entity_type "${entity_type}" for CoreRegistry` });
        }
        break;

      case 'AccessControl.json':
        expectPk(PK, `USER#${record.user_id}`, fileName, recordNo, findings);
        expectSk(SK, 'ACCESS', fileName, recordNo, findings);
        break;

      case 'State.json':
        expectPk(PK, `DEVICE#${record.device_id}`, fileName, recordNo, findings);
        expectSk(SK, 'LATEST_STATE', fileName, recordNo, findings);
        break;

      case 'TelemetryHistory.json':
        expectPk(PK, `DEVICE#${record.device_id}`, fileName, recordNo, findings);
        expectSkPrefix(SK, 'TS#', fileName, recordNo, findings);
        break;

      case 'Operations.json':
        expectPk(PK, `DEVICE#${record.device_id}`, fileName, recordNo, findings);
        if (entity_type === 'COMMAND') expectSkPrefix(SK, 'CMD#', fileName, recordNo, findings);
        else if (entity_type === 'ACK') expectSkPrefix(SK, 'ACK#', fileName, recordNo, findings);
        else if (entity_type === 'EVENT') expectSkPrefix(SK, 'EVT#', fileName, recordNo, findings);
        else findings.push({ rule: 3, file: fileName, record: recordNo, reason: `Unknown entity_type "${entity_type}" for Operations` });
        break;

      case 'Schedule.json':
        // Source sheet has no literal device_id column; the generator
        // denormalizes the fan-out target onto `target_device_id`.
        expectPk(PK, `DEVICE#${record.target_device_id}`, fileName, recordNo, findings);
        expectSkPrefix(SK, 'SCH#', fileName, recordNo, findings);
        break;

      case 'Service.json':
        expectPk(PK, `DEVICE#${record.device_id}`, fileName, recordNo, findings);
        expectSkPrefix(SK, 'SRV#', fileName, recordNo, findings);
        break;
    }
  });
}

// ─── Rule 4 — Duplicate primary keys ───────────────────────────

function auditDuplicates(fileName, records, findings) {
  const seen = new Map(); // "PK|SK" -> [recordNo, ...]
  records.forEach((record, idx) => {
    const recordNo = idx + 1;
    const compositeKey = `${record.PK}|${record.SK}`;
    if (!seen.has(compositeKey)) seen.set(compositeKey, []);
    seen.get(compositeKey).push(recordNo);
  });
  for (const [compositeKey, recordNos] of seen.entries()) {
    if (recordNos.length > 1) {
      const [pk, sk] = compositeKey.split('|');
      findings.push({
        rule: 4, file: fileName, record: recordNos.join(', '),
        reason: `Duplicate PK/SK across records ${recordNos.join(', ')} -- PK = ${pk}, SK = ${sk}`,
      });
    }
  }
}

// ─── Rule 5 — Referential integrity ────────────────────────────

function auditReferentialIntegrity(dataByFile, findings) {
  const core = dataByFile['CoreRegistry.json'] || [];
  const tenantIds = new Set(core.filter((r) => r.entity_type === 'TENANT').map((r) => r.tenant_id));
  const siteIds = new Set(core.filter((r) => r.entity_type === 'SITE').map((r) => r.site_id));
  const zoneIds = new Set(core.filter((r) => r.entity_type === 'ZONE').map((r) => r.zone_id));
  const deviceIds = new Set(core.filter((r) => r.entity_type === 'DEVICE').map((r) => r.device_id));

  // Iterates the FULL original array (not a filtered subset) so reported
  // record numbers always match the record's real position in the file.
  // `classify` lets a specific, documented orphan be downgraded to a
  // warning instead of an error -- default is always an error.
  function checkRef(fileName, records, applies, getParentId, parentSet, parentLabel, ownField, classify) {
    records.forEach((record, idx) => {
      if (!applies(record)) return;
      const recordNo = idx + 1;
      const refId = getParentId(record);
      if (refId === null || refId === undefined) {
        findings.push({ rule: 5, severity: 'error', file: fileName, record: recordNo, reason: `${ownField} is missing -- cannot validate ${parentLabel} reference` });
        return;
      }
      if (!parentSet.has(refId)) {
        const severity = classify ? classify(record, refId) : 'error';
        const reason = severity === 'warning'
          ? `Reserved/known orphan: ${ownField} = "${refId}" does not match any existing ${parentLabel} -- documented in source as "Reserved internal dev/test zone; create matching site only if used"`
          : `Orphan: ${ownField} = "${refId}" does not match any existing ${parentLabel}`;
        findings.push({ rule: 5, severity, file: fileName, record: recordNo, reason });
      }
    });
  }

  // CoreRegistry internal hierarchy references
  checkRef('CoreRegistry.json', core, (r) => r.entity_type === 'SITE', (r) => r.tenant_id, tenantIds, 'Tenant', 'tenant_id');
  checkRef(
    'CoreRegistry.json', core, (r) => r.entity_type === 'ZONE', (r) => r.site_id, siteIds, 'Site', 'site_id',
    (record, refId) => (record.zone_id === 'zone-eal-dev-test' && refId === 'site-dev-default' ? 'warning' : 'error')
  );
  checkRef('CoreRegistry.json', core, (r) => r.entity_type === 'GATEWAY', (r) => r.zone_id, zoneIds, 'Zone', 'zone_id');
  checkRef('CoreRegistry.json', core, (r) => r.entity_type === 'DEVICE', (r) => r.zone_id, zoneIds, 'Zone', 'zone_id');

  // Other tables referencing Device
  if (dataByFile['TelemetryHistory.json']) {
    checkRef('TelemetryHistory.json', dataByFile['TelemetryHistory.json'], () => true, (r) => r.device_id, deviceIds, 'Device', 'device_id');
  }
  if (dataByFile['State.json']) {
    checkRef('State.json', dataByFile['State.json'], () => true, (r) => r.device_id, deviceIds, 'Device', 'device_id');
  }
  if (dataByFile['Operations.json']) {
    checkRef('Operations.json', dataByFile['Operations.json'], (r) => r.entity_type === 'COMMAND', (r) => r.device_id, deviceIds, 'Device', 'device_id');
  }
  if (dataByFile['Schedule.json']) {
    // NOTE: Schedule records carry `target_device_id` (denormalized fan-out
    // target), not a literal `device_id` field -- see Rule 3 note.
    checkRef('Schedule.json', dataByFile['Schedule.json'], () => true, (r) => r.target_device_id, deviceIds, 'Device', 'target_device_id (no literal device_id field exists on Schedule records)');
  }
  if (dataByFile['Service.json']) {
    checkRef('Service.json', dataByFile['Service.json'], () => true, (r) => r.device_id, deviceIds, 'Device', 'device_id');
  }
}

// ─── Rule 6 — Timestamp validation ─────────────────────────────

function auditTimestamps(fileName, records, findings) {
  records.forEach((record, idx) => {
    const recordNo = idx + 1;
    for (const key of Object.keys(record)) {
      if (!isTimestampField(key)) continue;
      const value = record[key];
      if (value === null) continue; // legitimately unset, not malformed
      if (!isValidIsoUtc(value)) {
        findings.push({
          rule: 6, file: fileName, record: recordNo,
          reason: `${key} = ${JSON.stringify(value)} is not a valid ISO-8601 UTC timestamp`,
        });
      }
    }
  });
}

// ─── Orchestration ──────────────────────────────────────────────

function run() {
  const findings = [];
  const dataByFile = {};
  let totalRecords = 0;
  let filesChecked = 0;

  for (const fileName of FILES) {
    const result = loadFile(fileName);
    if (result.error) {
      findings.push({ rule: 0, file: fileName, record: '-', reason: result.error });
      continue;
    }
    filesChecked++;
    dataByFile[fileName] = result.records;
    totalRecords += result.records.length;

    auditInvalidValues(fileName, result.records, findings);
    auditRequiredKeys(fileName, result.records, findings);
    auditPkSkFormat(fileName, result.records, findings);
    auditDuplicates(fileName, result.records, findings);
    auditTimestamps(fileName, result.records, findings);
  }

  auditReferentialIntegrity(dataByFile, findings);

  printReport(findings, filesChecked, totalRecords);
}

function printReport(findings, filesChecked, totalRecords) {
  const ruleNames = {
    0: 'File Load',
    1: 'Rule 1 — Invalid Values',
    2: 'Rule 2 — Required Keys',
    3: 'Rule 3 — PK/SK Format',
    4: 'Rule 4 — Duplicate Primary Keys',
    5: 'Rule 5 — Referential Integrity',
    6: 'Rule 6 — Timestamp Validation',
  };

  console.log('='.repeat(70));
  console.log('DYNAMODB SEED FILE INTEGRITY AUDIT');
  console.log('='.repeat(70));

  for (const ruleId of [0, 1, 2, 3, 4, 5, 6]) {
    const ruleFindings = findings.filter((f) => f.rule === ruleId);
    console.log(`\n--- ${ruleNames[ruleId]} ---`);
    if (ruleFindings.length === 0) {
      console.log(`PASS: No violations found.`);
    } else {
      for (const f of ruleFindings) {
        const tag = f.severity === 'warning' ? 'WARNING' : 'FAIL';
        console.log(`${tag}: ${f.file} | Record ${f.record} | ${f.reason}`);
      }
    }
  }

  const errorFindings = findings.filter((f) => f.severity !== 'warning');
  const warningFindings = findings.filter((f) => f.severity === 'warning');

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total files checked: ${filesChecked} / ${FILES.length}`);
  console.log(`Total records checked: ${totalRecords}`);
  console.log(`Total errors: ${errorFindings.length}`);
  console.log(`Total warnings: ${warningFindings.length}`);

  let overall;
  if (errorFindings.length === 0 && warningFindings.length === 0) overall = 'PASS';
  else if (errorFindings.length === 0) overall = 'PASS WITH WARNING';
  else overall = 'FAIL';

  console.log(`Overall Status: ${overall}`);
  if (overall === 'PASS') {
    console.log('Dataset is approved for DynamoDB BatchWriteItem import.');
  } else if (overall === 'PASS WITH WARNING') {
    console.log('Dataset approved for DynamoDB BatchWriteItem import (PASS WITH WARNING).');
  }
  console.log('='.repeat(70));
}

if (require.main === module) {
  run();
}

module.exports = { run };
