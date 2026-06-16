// ============================================================
// ORBIPULSE ENUM DISPLAY MAPS
// Source: SW-ENUM-001 RevA0
// ============================================================

import type {
  ValveState, BatteryState, FirmwareState, AvailabilityState,
  AckStage, EventSeverity, UserRole, FaultCode, ReasonCode, EventCode, CommandType
} from '@/types';

export const VALVE_STATE_LABELS: Record<ValveState, string> = {
  open: 'Open',
  closed: 'Closed',
  opening: 'Opening...',
  closing: 'Closing...',
  stopped: 'Stopped',
  fault: 'Fault',
  unknown: 'Unknown',
};

export const VALVE_STATE_COLORS: Record<ValveState, string> = {
  open: 'text-emerald-500',
  closed: 'text-slate-400',
  opening: 'text-blue-400',
  closing: 'text-orange-400',
  stopped: 'text-yellow-400',
  fault: 'text-red-500',
  unknown: 'text-gray-400',
};

export const BATTERY_STATE_LABELS: Record<BatteryState, string> = {
  good: 'Good',
  low: 'Low Battery',
  critical: 'Critical Battery',
  charging: 'Charging',
  unknown: 'Unknown',
};

export const BATTERY_STATE_COLORS: Record<BatteryState, string> = {
  good: 'text-emerald-500',
  low: 'text-yellow-500',
  critical: 'text-red-500',
  charging: 'text-blue-400',
  unknown: 'text-gray-400',
};

export const FIRMWARE_STATE_LABELS: Record<FirmwareState, string> = {
  healthy: 'Healthy',
  fault: 'Fault',
  degraded: 'Degraded',
  updating: 'Updating',
  unknown: 'Unknown',
};

export const AVAILABILITY_LABELS: Record<AvailabilityState, string> = {
  online: 'Online',
  offline: 'Offline',
  stale: 'Stale',
  unknown: 'Unknown',
};

export const AVAILABILITY_COLORS: Record<AvailabilityState, string> = {
  online: 'text-emerald-500',
  offline: 'text-red-500',
  stale: 'text-yellow-500',
  unknown: 'text-gray-400',
};

export const ACK_STAGE_LABELS: Record<AckStage, string> = {
  command_requested: 'Request Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  blocked: 'Blocked',
  executing: 'Executing',
  completed: 'Completed',
  failed: 'Failed',
  timeout: 'Timed Out',
  safety_stopped: 'Safety Stopped',
};

export const ACK_STAGE_COLORS: Record<AckStage, string> = {
  command_requested: 'text-blue-400',
  accepted: 'text-blue-500',
  rejected: 'text-red-500',
  blocked: 'text-orange-500',
  executing: 'text-purple-500',
  completed: 'text-emerald-500',
  failed: 'text-red-600',
  timeout: 'text-orange-600',
  safety_stopped: 'text-red-700',
};

export const SEVERITY_LABELS: Record<EventSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  critical: 'Critical',
};

export const SEVERITY_COLORS: Record<EventSeverity, string> = {
  info: 'text-blue-400',
  warning: 'text-yellow-500',
  error: 'text-orange-500',
  critical: 'text-red-600',
};

export const SEVERITY_BG_COLORS: Record<EventSeverity, string> = {
  info: 'bg-blue-500/10 border-blue-500/20',
  warning: 'bg-yellow-500/10 border-yellow-500/20',
  error: 'bg-orange-500/10 border-orange-500/20',
  critical: 'bg-red-500/10 border-red-500/20',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  founder_admin: 'Founder / Admin',
  manufacturer_admin: 'Manufacturer Admin',
  district_authority: 'District Authority',
  taluk_manager: 'Taluk Manager',
  municipal_operator: 'Municipal Operator',
  farmer: 'Farmer',
  installer: 'Installer',
  service_technician: 'Service Technician',
  dealer: 'Dealer',
  read_only_auditor: 'Read-only Auditor',
};

export const FAULT_CODE_MESSAGES: Record<FaultCode, string> = {
  FLT_MOTOR_JAM: 'Motor jam detected — physical obstruction',
  FLT_MOTOR_OVERCURRENT: 'Motor overcurrent — check mechanical load',
  FLT_MOTOR_STALL: 'Motor stall — motion not achieved',
  FLT_POSITION_INVALID: 'Position reading invalid — calibration may be required',
  FLT_POSITION_TIMEOUT: 'Position not reached in expected time',
  FLT_BATTERY_CRITICAL: 'Battery critically low — immediate attention needed',
  FLT_BATTERY_LOW: 'Battery low — schedule replacement',
  FLT_WET_DETECTED: 'Water/wet ingress detected — check enclosure',
  FLT_SENSOR_MISSING: 'Expected sensor not responding',
  FLT_COMMUNICATION_LOST: 'Communication with device lost',
  FLT_LTE_DISCONNECTED: 'LTE connection disconnected',
  FLT_FIRMWARE_CORRUPT: 'Firmware integrity check failed',
  FLT_CALIBRATION_LOST: 'Calibration data lost — recalibration required',
  FLT_SAFETY_TRIP: 'Safety trip activated — check conditions',
  FLT_RELAY_FAULT: 'Relay fault detected',
};

export const REASON_CODE_MESSAGES: Record<ReasonCode, string> = {
  RSN_MANUAL_ACTIVE: 'Manual override is active — remote commands blocked',
  RSN_WET_ACTIVE: 'Wet/water ingress signal active — commands blocked for safety',
  RSN_LOW_BATTERY: 'Battery level too low for safe operation',
  RSN_CRITICAL_BATTERY: 'Critical battery — device protecting itself',
  RSN_POSITION_INVALID: 'Position reading invalid — command cannot proceed safely',
  RSN_CALIBRATION_REQUIRED: 'Device calibration required before positioning commands',
  RSN_COMMAND_EXPIRED: 'Command expired before reaching device',
  RSN_ROLE_DENIED: 'Your role does not permit this action',
  RSN_OWNERSHIP_DENIED: 'Device not assigned to your account',
  RSN_DEVICE_OFFLINE: 'Device is currently offline',
  RSN_DEVICE_STALE: 'Device data is stale — connection uncertain',
  RSN_FAULT_ACTIVE: 'Active fault preventing command execution',
  RSN_SAFETY_BLOCKED: 'Safety condition blocking command',
  RSN_TIMEOUT: 'Command timed out waiting for device response',
  RSN_NETWORK_ERROR: 'Network error during command transmission',
};

export const EVENT_CODE_MESSAGES: Record<EventCode, string> = {
  EVT_VALVE_OPENED: 'Valve opened',
  EVT_VALVE_CLOSED: 'Valve closed',
  EVT_VALVE_STOPPED: 'Valve motion stopped',
  EVT_POSITION_REACHED: 'Target position reached',
  EVT_MANUAL_ACTIVATED: 'Manual override activated',
  EVT_MANUAL_DEACTIVATED: 'Manual override deactivated',
  EVT_WET_DETECTED: 'Wet/water ingress detected',
  EVT_WET_CLEARED: 'Wet/water ingress cleared',
  EVT_LOW_BATTERY: 'Low battery detected',
  EVT_BATTERY_RECOVERED: 'Battery level recovered',
  EVT_DEVICE_ONLINE: 'Device came online',
  EVT_DEVICE_OFFLINE: 'Device went offline',
  EVT_DEVICE_STALE: 'Device data became stale',
  EVT_COMMAND_RECEIVED: 'Command received',
  EVT_COMMAND_COMPLETED: 'Command completed successfully',
  EVT_COMMAND_FAILED: 'Command failed',
  EVT_FIRMWARE_UPDATE: 'Firmware update started',
  EVT_CALIBRATION_DONE: 'Calibration completed',
  EVT_FAULT_DETECTED: 'Fault detected',
  EVT_FAULT_CLEARED: 'Fault cleared',
  EVT_OTA_STARTED: 'OTA update started',
  EVT_OTA_COMPLETED: 'OTA update completed',
  EVT_SCHEDULE_STARTED: 'Scheduled operation started',
  EVT_SCHEDULE_COMPLETED: 'Scheduled operation completed',
};

export const COMMAND_TYPE_LABELS: Record<CommandType, string> = {
  open: 'Open Valve',
  close: 'Close Valve',
  stop: 'Stop Motion',
  set_position: 'Set Position',
  calibrate: 'Calibrate',
  reboot: 'Reboot Device',
  ping: 'Ping Device',
};

export const IRRIGATION_ADVISORY_LABELS = {
  proceed: 'Proceed with Irrigation',
  caution: 'Proceed with Caution',
  hold: 'Hold Irrigation',
  postpone: 'Postpone Irrigation',
} as const;

export const IRRIGATION_ADVISORY_COLORS = {
  proceed: 'text-emerald-500',
  caution: 'text-yellow-500',
  hold: 'text-orange-500',
  postpone: 'text-red-500',
} as const;
