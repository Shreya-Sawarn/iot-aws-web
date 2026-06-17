// ============================================================
// ORBIPULSE / ORBIDRIVE - COMPLETE TYPE SYSTEM
// Source: SW-DATA-001, SW-ENUM-001, DOC#6.9, DOC-SW-APP-001
// Future-compatible with AWS Cognito, AppSync, DynamoDB, IoT Core
// ============================================================

// ─── ENUMS (from SW-ENUM-001) ────────────────────────────────

export type ValveState = 'open' | 'closed' | 'opening' | 'closing' | 'stopped' | 'fault' | 'unknown';

export type PositionConfidence = 'valid' | 'invalid' | 'stale' | 'not_calibrated' | 'initialising';

export type BatteryState = 'good' | 'low' | 'critical' | 'charging' | 'unknown';

export type FirmwareState = 'healthy' | 'fault' | 'degraded' | 'updating' | 'unknown';

export type AvailabilityState = 'online' | 'offline' | 'stale' | 'unknown';

export type CommandType = 'open' | 'close' | 'stop' | 'set_position' | 'calibrate' | 'reboot' | 'ping';

export type AckStage =
  | 'command_requested'
  | 'accepted'
  | 'rejected'
  | 'blocked'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'safety_stopped';

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export type ScheduleStatus = 'planned' | 'attempted' | 'confirmed' | 'failed' | 'skipped' | 'rescheduled';

export type ScheduleType = 'one_time' | 'daily' | 'weekly' | 'custom';

export type ServiceStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated';

export type ServicePriority = 'low' | 'medium' | 'high' | 'critical';

export type OtaStatus = 'pending' | 'downloading' | 'validating' | 'installing' | 'completed' | 'failed' | 'rollback';

export type SimulatorMode = 'demo_mode' | 'dev_mode' | 'test_mode' | 'fault_mode' | 'gateway_mode' | 'replay_mode';

export type UserRole =
  | 'founder_admin'
  | 'manufacturer_admin'
  | 'district_authority'
  | 'taluk_manager'
  | 'municipal_operator'
  | 'farmer'
  | 'installer'
  | 'service_technician'
  | 'dealer'
  | 'read_only_auditor';

export type AccountStatus = 'active' | 'suspended' | 'pending' | 'deactivated';

export type TenantType = 'agriculture' | 'municipal' | 'industrial' | 'demo';

export type ProvisioningState = 'unprovisioned' | 'provisioning' | 'provisioned' | 'decommissioned';

export type OwnershipState = 'unassigned' | 'assigned' | 'transferred' | 'returned';

export type CertificateStatus = 'active' | 'inactive' | 'revoked' | 'expired';

// ─── EVENT / FAULT / REASON CODES ────────────────────────────

export type EventCode =
  | 'EVT_VALVE_OPENED'
  | 'EVT_VALVE_CLOSED'
  | 'EVT_VALVE_STOPPED'
  | 'EVT_POSITION_REACHED'
  | 'EVT_MANUAL_ACTIVATED'
  | 'EVT_MANUAL_DEACTIVATED'
  | 'EVT_WET_DETECTED'
  | 'EVT_WET_CLEARED'
  | 'EVT_LOW_BATTERY'
  | 'EVT_BATTERY_RECOVERED'
  | 'EVT_DEVICE_ONLINE'
  | 'EVT_DEVICE_OFFLINE'
  | 'EVT_DEVICE_STALE'
  | 'EVT_COMMAND_RECEIVED'
  | 'EVT_COMMAND_COMPLETED'
  | 'EVT_COMMAND_FAILED'
  | 'EVT_FIRMWARE_UPDATE'
  | 'EVT_CALIBRATION_DONE'
  | 'EVT_FAULT_DETECTED'
  | 'EVT_FAULT_CLEARED'
  | 'EVT_OTA_STARTED'
  | 'EVT_OTA_COMPLETED'
  | 'EVT_SCHEDULE_STARTED'
  | 'EVT_SCHEDULE_COMPLETED';

export type FaultCode =
  | 'FLT_MOTOR_JAM'
  | 'FLT_MOTOR_OVERCURRENT'
  | 'FLT_MOTOR_STALL'
  | 'FLT_POSITION_INVALID'
  | 'FLT_POSITION_TIMEOUT'
  | 'FLT_BATTERY_CRITICAL'
  | 'FLT_BATTERY_LOW'
  | 'FLT_WET_DETECTED'
  | 'FLT_SENSOR_MISSING'
  | 'FLT_COMMUNICATION_LOST'
  | 'FLT_LTE_DISCONNECTED'
  | 'FLT_FIRMWARE_CORRUPT'
  | 'FLT_CALIBRATION_LOST'
  | 'FLT_SAFETY_TRIP'
  | 'FLT_RELAY_FAULT';

export type ReasonCode =
  | 'RSN_MANUAL_ACTIVE'
  | 'RSN_WET_ACTIVE'
  | 'RSN_LOW_BATTERY'
  | 'RSN_CRITICAL_BATTERY'
  | 'RSN_POSITION_INVALID'
  | 'RSN_CALIBRATION_REQUIRED'
  | 'RSN_COMMAND_EXPIRED'
  | 'RSN_ROLE_DENIED'
  | 'RSN_OWNERSHIP_DENIED'
  | 'RSN_DEVICE_OFFLINE'
  | 'RSN_DEVICE_STALE'
  | 'RSN_FAULT_ACTIVE'
  | 'RSN_SAFETY_BLOCKED'
  | 'RSN_TIMEOUT'
  | 'RSN_NETWORK_ERROR';

// ─── MQTT PAYLOAD TYPES (DOC#6.9 Contract) ───────────────────

export interface MqttEnvelope {
  schema: string;
  schema_version: number;
  msg_type: 'telemetry' | 'command' | 'ack' | 'event' | 'diagnostic' | 'availability' | 'provisioning_event' | 'ota_status';
  tenant_id: string;
  site_id: string;
  device_id?: string;
  gateway_id?: string;
  ts_device: string;
  ts_cloud?: string;
  seq: number;
  fw_version?: string;
  protocol_version?: string;
}

export interface TelemetryPayload extends MqttEnvelope {
  msg_type: 'telemetry';
  valve_state: ValveState;
  valve_position_pct: number;
  position_confidence: PositionConfidence;
  battery_v: number;
  battery_state: BatteryState;
  firmware_state: FirmwareState;
  manual_active: boolean;
  wet_active: boolean;
  signal_strength: number;
  motor_current_a?: number;
  temperature_c?: number;
}

export interface CommandPayload {
  schema: string;
  schema_version: number;
  msg_type: 'command';
  tenant_id: string;
  site_id: string;
  device_id: string;
  command_id: string;
  command_type: CommandType;
  command_payload?: {
    target_position_pct?: number;
  };
  issued_by: string;
  issued_at: string;
  expires_at: string;
}

export interface AckPayload extends MqttEnvelope {
  msg_type: 'ack';
  command_id: string;
  ack_stage: AckStage;
  result: 'success' | 'failure' | 'pending';
  reason_code?: ReasonCode | null;
  fault_code?: FaultCode | null;
  current_state?: ValveState;
  final_position_pct?: number;
  execution_duration_ms?: number;
}

export interface EventPayload extends MqttEnvelope {
  msg_type: 'event';
  event_code: EventCode;
  severity: EventSeverity;
  state_before?: string;
  state_after?: string;
  reason_code?: ReasonCode;
  fault_code?: FaultCode;
}

export interface AvailabilityPayload extends MqttEnvelope {
  msg_type: 'availability';
  availability_state: AvailabilityState;
  last_seen_at: string;
  stale_age_sec?: number;
}

// ─── DATABASE MODELS (DynamoDB-compatible) ────────────────────

export interface Tenant {
  tenant_id: string;
  tenant_name: string;
  tenant_type: TenantType;
  contact_email: string;
  contact_phone?: string;
  address?: string;
  subscription_plan: string;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface User {
  user_id: string;
  tenant_id: string;
  user_email: string;
  user_name: string;
  role: UserRole;
  account_status: AccountStatus;
  mfa_enabled: boolean;
  last_login_at?: string;
  assigned_site_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface Site {
  site_id: string;
  tenant_id: string;
  site_name: string;
  site_type: 'farm' | 'municipal' | 'industrial';
  location_address?: string;
  lat?: number;
  lon?: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Device {
  device_id: string;
  tenant_id: string;
  site_id: string;
  gateway_id?: string;
  device_name: string;
  product_variant: 'orbidrive_agriculture' | 'orbidrive_municipal' | 'orbidrive_industrial';
  hw_revision: string;
  fw_baseline_id: string;
  dsn: string;
  aws_thing_name?: string;
  certificate_status: CertificateStatus;
  provisioning_state: ProvisioningState;
  ownership_state: OwnershipState;
  lat?: number;
  lon?: number;
  sensor_fitted_map?: Record<string, boolean>;
  commissioning_date?: string;
  created_at: string;
  updated_at: string;
}

export interface LatestState {
  device_id: string;
  tenant_id: string;
  site_id: string;
  valve_state: ValveState;
  valve_position_pct: number;
  position_confidence: PositionConfidence;
  battery_v: number;
  battery_state: BatteryState;
  firmware_state: FirmwareState;
  manual_active: boolean;
  wet_active: boolean;
  signal_strength: number;
  availability: AvailabilityState;
  stale_flag: boolean;
  stale_age_sec?: number;
  motor_current_a?: number;
  temperature_c?: number;
  fault_code?: FaultCode | null;
  reason_code?: ReasonCode | null;
  active_fault_codes?: FaultCode[];
  last_seen_at: string;
  last_telemetry_seq: number;
  fw_version: string;
  updated_at: string;
}

export interface Command {
  command_id: string;
  tenant_id: string;
  site_id: string;
  device_id: string;
  command_type: CommandType;
  command_payload?: {
    target_position_pct?: number;
  };
  issued_by: string;
  issued_at: string;
  expires_at: string;
  current_ack_stage: AckStage;
  result?: 'success' | 'failure' | 'pending';
  reason_code?: ReasonCode | null;
  fault_code?: FaultCode | null;
  final_position_pct?: number;
  execution_duration_ms?: number;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CommandAck {
  ack_id: string;
  command_id: string;
  device_id: string;
  tenant_id: string;
  site_id: string;
  ack_stage: AckStage;
  result: 'success' | 'failure' | 'pending';
  reason_code?: ReasonCode | null;
  fault_code?: FaultCode | null;
  current_state?: ValveState;
  final_position_pct?: number;
  execution_duration_ms?: number;
  ts_device: string;
  ts_cloud: string;
}

export interface DeviceEvent {
  event_id: string;
  tenant_id: string;
  site_id: string;
  device_id: string;
  event_code: EventCode;
  severity: EventSeverity;
  state_before?: string;
  state_after?: string;
  reason_code?: ReasonCode;
  fault_code?: FaultCode;
  is_active: boolean;
  cleared_at?: string;
  ts_device: string;
  ts_cloud: string;
  seq: number;
}

export interface Fault {
  fault_id: string;
  tenant_id: string;
  site_id: string;
  device_id: string;
  fault_code: FaultCode;
  severity: EventSeverity;
  description: string;
  is_active: boolean;
  detected_at: string;
  cleared_at?: string;
  cleared_by?: string;
  related_event_id?: string;
}

export interface Schedule {
  schedule_id: string;
  tenant_id: string;
  site_id: string;
  device_id: string;
  schedule_name: string;
  schedule_type: ScheduleType;
  command_type: CommandType;
  target_position_pct?: number;
  planned_start_at: string;
  planned_duration_min?: number;
  recurrence_rule?: string;
  target_device_ids: string[];
  schedule_status: ScheduleStatus;
  water_confirmation_required: boolean;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TelemetryHistory {
  record_id: string;
  device_id: string;
  tenant_id: string;
  site_id: string;
  valve_state: ValveState;
  valve_position_pct: number;
  battery_v: number;
  signal_strength: number;
  motor_current_a?: number;
  ts_device: string;
  seq: number;
}

export interface WeatherCache {
  cache_id: string;
  tenant_id: string;
  site_id: string;
  lat: number;
  lon: number;
  rain_probability_pct: number;
  rain_forecast_mm: number;
  temperature_min_c: number;
  temperature_max_c: number;
  humidity_pct: number;
  wind_speed_kmh: number;
  weather_description: string;
  irrigation_advisory: 'proceed' | 'caution' | 'hold' | 'postpone';
  advisory_reason?: string;
  fetched_at: string;
  expires_at: string;
}

export interface ServiceRecord {
  service_ticket_id: string;
  tenant_id: string;
  site_id: string;
  device_id: string;
  service_status: ServiceStatus;
  service_priority: ServicePriority;
  service_description: string;
  assigned_to_user_id?: string;
  service_action_code?: string;
  fault_codes?: FaultCode[];
  before_photo_s3_key?: string;
  after_photo_s3_key?: string;
  created_at: string;
  resolved_at?: string;
  updated_at: string;
}

export interface AuditLog {
  log_id: string;
  tenant_id: string;
  actor_user_id: string;
  actor_role: UserRole;
  action_type: string;
  target_type: string;
  target_id: string;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string;
  created_at: string;
}

export interface CommissioningRecord {
  commissioning_id: string;
  device_id: string;
  tenant_id: string;
  site_id: string;
  installer_user_id: string;
  qr_claim_code: string;
  lat?: number;
  lon?: number;
  elevation_m?: number;
  sensor_fitted_map: Record<string, boolean>;
  calibration_result?: 'pass' | 'fail' | 'skipped';
  commissioning_result: 'success' | 'partial' | 'failed';
  notes?: string;
  created_at: string;
}

// ─── COMPOSED VIEW TYPES (for UI) ────────────────────────────

export interface DeviceWithState extends Device {
  latest_state: LatestState;
  active_faults?: Fault[];
  pending_command?: Command;
}

export interface DashboardSummary {
  tenant_id: string;
  site_id?: string;
  device_count_total: number;
  device_count_online: number;
  device_count_offline: number;
  device_count_stale: number;
  fault_count_active: number;
  fault_count_critical: number;
  low_battery_count: number;
  critical_battery_count: number;
  manual_active_count: number;
  commands_today: number;
  commands_success_today: number;
  last_update_at: string;
}

// ─── SIMULATOR TYPES ─────────────────────────────────────────

export interface SimulatorConfig {
  mode: SimulatorMode;
  telemetry_interval_ms: number;
  lte_signal_min: number;
  lte_signal_max: number;
  lte_disconnect_probability: number;
  reconnect_delay_ms: number;
  ack_delay_ms: number;
  fault_probability: number;
}

export interface SimulatorDeviceState {
  device_id: string;
  is_connected: boolean;
  signal_strength: number;
  reconnect_timer?: number;
  telemetry_seq: number;
  buffered_telemetry: TelemetryPayload[];
}

// ─── AUTH TYPES (Cognito-compatible) ────────────────────────

export interface AuthUser {
  user_id: string;
  user_email: string;
  user_name: string;
  role: UserRole;
  tenant_id: string;
  account_status: AccountStatus;
  mfa_enabled: boolean;
  last_login_at?: string;
  assigned_site_ids?: string[];
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  expires_at: string;
  is_authenticated: boolean;
}

// ─── MQTT TOPIC HELPERS ──────────────────────────────────────

export interface MqttTopics {
  telemetry: string;
  command: string;
  ack: string;
  event: string;
  availability: string;
  diagnostic: string;
  ota_status: string;
}

export function getMqttTopics(tenant_id: string, site_id: string, device_id: string): MqttTopics {
  const base = `orbipulse/v1/${tenant_id}/${site_id}/${device_id}`;
  return {
    telemetry: `${base}/telemetry`,
    command: `${base}/command`,
    ack: `${base}/ack`,
    event: `${base}/event`,
    availability: `${base}/availability`,
    diagnostic: `${base}/diagnostic`,
    ota_status: `${base}/ota/status`,
  };
}
