// ============================================================
// MQTT CONTRACT — FROZEN
// Source: 23_MQTT_Topic_Map, Combined_DOC6 RevA1
// DO NOT modify topic patterns — AWS IoT Core rules depend on them
// ============================================================

export const MQTT_VERSION = 'v1';
export const MQTT_BASE = `orbipulse/${MQTT_VERSION}`;

// ─── SCHEMA IDENTIFIERS ───────────────────────────────────────

export const MQTT_SCHEMA = {
  telemetry:    'orbipulse.telemetry.v1',
  command:      'orbipulse.command.v1',
  ack:          'orbipulse.ack.v1',
  event:        'orbipulse.event.v1',
  availability: 'orbipulse.availability.v1',
  diagnostic:   'orbipulse.diagnostic.v1',
  ota_status:   'orbipulse.ota_status.v1',
} as const;

export const MQTT_SCHEMA_VERSION = 1;

// ─── TOPIC BUILDER ────────────────────────────────────────────

export interface MqttTopicParams {
  tenant_id: string;
  site_id: string;
  device_id: string;
}

export function buildTopic(params: MqttTopicParams, suffix: MqttTopicSuffix): string {
  return `${MQTT_BASE}/${params.tenant_id}/${params.site_id}/${params.device_id}/${suffix}`;
}

// All valid MQTT topic suffixes per 23_MQTT_Topic_Map
export type MqttTopicSuffix =
  | 'telemetry'
  | 'command'
  | 'ack'
  | 'event'
  | 'availability'
  | 'diagnostic'
  | 'ota/status';

// Pre-built topic helpers
export const topics = {
  telemetry:    (p: MqttTopicParams) => buildTopic(p, 'telemetry'),
  command:      (p: MqttTopicParams) => buildTopic(p, 'command'),
  ack:          (p: MqttTopicParams) => buildTopic(p, 'ack'),
  event:        (p: MqttTopicParams) => buildTopic(p, 'event'),
  availability: (p: MqttTopicParams) => buildTopic(p, 'availability'),
  diagnostic:   (p: MqttTopicParams) => buildTopic(p, 'diagnostic'),
  otaStatus:    (p: MqttTopicParams) => buildTopic(p, 'ota/status'),
} as const;

// ─── QoS MAP ──────────────────────────────────────────────────
// Per AWS IoT Core recommended QoS levels

export const MQTT_QOS: Record<MqttTopicSuffix, 0 | 1> = {
  'telemetry':    1,   // At-least-once — telemetry must arrive
  'command':      1,   // At-least-once — commands must arrive
  'ack':          1,   // At-least-once — ACKs must be recorded
  'event':        1,   // At-least-once — events must be recorded
  'availability': 1,   // At-least-once — availability changes are critical
  'diagnostic':   0,   // Best-effort — diagnostics are verbose, loss acceptable
  'ota/status':   1,   // At-least-once — OTA progress must be tracked
};

// ─── WILDCARD SUBSCRIPTION PATTERNS ──────────────────────────
// Used by Lambda / AppSync resolvers subscribing at tenant level

export function buildTenantWildcard(tenant_id: string, suffix: MqttTopicSuffix): string {
  return `${MQTT_BASE}/${tenant_id}/+/+/${suffix}`;
}

export function buildSiteWildcard(tenant_id: string, site_id: string, suffix: MqttTopicSuffix): string {
  return `${MQTT_BASE}/${tenant_id}/${site_id}/+/${suffix}`;
}

// ─── COMMAND DEFAULTS ─────────────────────────────────────────

export const COMMAND_EXPIRY_MS = 60_000;        // 60 seconds
export const COMMAND_MIN_EXPIRY_MS = 60_000;    // Min per contract
export const COMMAND_MAX_EXPIRY_MS = 3_600_000; // Max per contract (1 hour)

// ─── TELEMETRY CONSTRAINTS ────────────────────────────────────

export const TELEMETRY_MIN_INTERVAL_MS = 1_000;  // 1 second minimum
export const TELEMETRY_MAX_INTERVAL_MS = 10_000; // 10 seconds maximum

// ─── BATTERY THRESHOLDS (FROZEN — firmware contract) ──────────

export const BATTERY_CRITICAL_V = 10.0;
export const BATTERY_LOW_V      = 11.0;
export const BATTERY_GOOD_V     = 11.0; // > this = good

// ─── STALE THRESHOLD ──────────────────────────────────────────

export const STALE_MULTIPLIER = 5; // offline > 5 × reconnect_delay_ms → stale
