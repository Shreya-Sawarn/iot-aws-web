// ============================================================
// LTE DEVICE SIMULATOR — Hardened v2
// Pure LTE simulation — no WiFi assumptions
// Source: SW-SIM-001, DOC#6.9, Combined_DOC6 RevA1, 23_MQTT_Topic_Map
// Modes: demo_mode | dev_mode | test_mode | fault_mode | gateway_mode | replay_mode
// ============================================================

import type {
  TelemetryPayload, AckPayload, EventPayload, AvailabilityPayload,
  ValveState, BatteryState, FirmwareState, AvailabilityState,
  CommandPayload, AckStage, EventCode, FaultCode, ReasonCode,
  EventSeverity, SimulatorMode, SimulatorConfig,
} from '@/types';
import { MQTT_SCHEMA, MQTT_SCHEMA_VERSION, STALE_MULTIPLIER, BATTERY_CRITICAL_V, BATTERY_LOW_V } from '@/constants/mqtt';
import { MOCK_DEVICES, MOCK_LATEST_STATE } from '@/mock-data/seed';

// ─── SIMULATOR STATE ──────────────────────────────────────────

interface DeviceSimState {
  device_id: string;
  tenant_id: string;
  site_id: string;
  // LTE
  is_lte_connected: boolean;
  signal_strength: number;
  reconnect_countdown_ms: number;
  last_reconnect_at: number;
  // Telemetry
  valve_state: ValveState;
  valve_position_pct: number;
  target_position_pct: number;
  battery_v: number;
  battery_state: BatteryState;
  firmware_state: FirmwareState;
  manual_active: boolean;
  wet_active: boolean;
  wet_cooldown_ticks: number;   // prevents rapid wet toggle
  motor_current_a: number;
  temperature_c: number;
  fault_codes: FaultCode[];
  // Simulator
  seq: number;
  availability: AvailabilityState;
  stale_flag: boolean;
  stale_age_sec?: number;
  last_seen_at: string;
  buffered_messages: (TelemetryPayload | EventPayload | AckPayload | AvailabilityPayload)[];
  pending_command?: CommandPayload;
  ack_stage?: AckStage;
  is_moving: boolean;
  move_progress_pct: number;
  move_start_time?: number;
  move_direction?: 'opening' | 'closing';
  command_timeout_handle?: ReturnType<typeof setTimeout>;
  tick_count: number;
}

export type SimulatorEventType =
  | 'telemetry'
  | 'event'
  | 'ack'
  | 'availability'
  | 'lte_connect'
  | 'lte_disconnect'
  | 'state_change';

export interface SimulatorEvent {
  type: SimulatorEventType;
  device_id: string;
  payload: TelemetryPayload | EventPayload | AckPayload | AvailabilityPayload | null;
  state: Partial<DeviceSimState>;
  timestamp: string;
}

type SimulatorListener = (event: SimulatorEvent) => void;

// ─── MODE CONFIGS ─────────────────────────────────────────────

const MODE_CONFIGS: Record<SimulatorMode, SimulatorConfig> = {
  demo_mode: {
    mode: 'demo_mode',
    telemetry_interval_ms: 5000,
    lte_signal_min: 60,
    lte_signal_max: 95,
    lte_disconnect_probability: 0.02,
    reconnect_delay_ms: 8000,
    ack_delay_ms: 2000,
    fault_probability: 0.005,
  },
  dev_mode: {
    mode: 'dev_mode',
    telemetry_interval_ms: 3000,
    lte_signal_min: 40,
    lte_signal_max: 95,
    lte_disconnect_probability: 0.05,
    reconnect_delay_ms: 5000,
    ack_delay_ms: 1500,
    fault_probability: 0.02,
  },
  test_mode: {
    mode: 'test_mode',
    telemetry_interval_ms: 2000,
    lte_signal_min: 80,
    lte_signal_max: 95,
    lte_disconnect_probability: 0.0,
    reconnect_delay_ms: 1000,
    ack_delay_ms: 500,
    fault_probability: 0.0,
  },
  fault_mode: {
    mode: 'fault_mode',
    telemetry_interval_ms: 5000,
    lte_signal_min: 20,
    lte_signal_max: 70,
    lte_disconnect_probability: 0.15,
    reconnect_delay_ms: 15000,
    ack_delay_ms: 3000,
    fault_probability: 0.2,
  },
  gateway_mode: {
    mode: 'gateway_mode',
    telemetry_interval_ms: 5000,
    lte_signal_min: 50,
    lte_signal_max: 90,
    lte_disconnect_probability: 0.03,
    reconnect_delay_ms: 6000,
    ack_delay_ms: 2500,
    fault_probability: 0.01,
  },
  replay_mode: {
    mode: 'replay_mode',
    telemetry_interval_ms: 1000,
    lte_signal_min: 70,
    lte_signal_max: 90,
    lte_disconnect_probability: 0.0,
    reconnect_delay_ms: 1000,
    ack_delay_ms: 500,
    fault_probability: 0.0,
  },
};

// All 15 injectable fault codes (per DOC#14 / SW-ENUM-001)
const INJECTABLE_FAULTS: FaultCode[] = [
  'FLT_MOTOR_JAM',
  'FLT_MOTOR_OVERCURRENT',
  'FLT_MOTOR_STALL',
  'FLT_POSITION_INVALID',
  'FLT_POSITION_TIMEOUT',
  'FLT_SENSOR_MISSING',
  'FLT_RELAY_FAULT',
  'FLT_SAFETY_TRIP',
  'FLT_CALIBRATION_LOST',
  'FLT_FIRMWARE_CORRUPT',
];

// Faults that block motor commands
const MOTOR_BLOCKING_FAULTS: FaultCode[] = [
  'FLT_MOTOR_JAM', 'FLT_MOTOR_OVERCURRENT', 'FLT_RELAY_FAULT',
];

// Faults that trigger safety_stopped during motion
const SAFETY_STOP_FAULTS: FaultCode[] = [
  'FLT_MOTOR_JAM', 'FLT_MOTOR_OVERCURRENT', 'FLT_MOTOR_STALL',
  'FLT_RELAY_FAULT', 'FLT_SAFETY_TRIP',
];

// ─── LTE SIMULATOR ────────────────────────────────────────────

export class LteDeviceSimulator {
  private config: SimulatorConfig;
  private deviceStates: Map<string, DeviceSimState> = new Map();
  private listeners: SimulatorListener[] = [];
  private intervalRef: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private tickCount = 0;

  constructor(mode: SimulatorMode = 'demo_mode') {
    this.config = { ...MODE_CONFIGS[mode] };
    this.initializeDevices();
  }

  private initializeDevices() {
    for (const device of MOCK_DEVICES) {
      const seed = MOCK_LATEST_STATE.find(s => s.device_id === device.device_id);
      if (!seed) continue;
      const state: DeviceSimState = {
        device_id: device.device_id,
        tenant_id: device.tenant_id,
        site_id: device.site_id,
        is_lte_connected: seed.availability === 'online',
        signal_strength: seed.signal_strength,
        reconnect_countdown_ms: 0,
        last_reconnect_at: Date.now(),
        valve_state: seed.valve_state,
        valve_position_pct: seed.valve_position_pct,
        target_position_pct: seed.valve_position_pct,
        battery_v: seed.battery_v,
        battery_state: seed.battery_state,
        firmware_state: seed.firmware_state,
        manual_active: seed.manual_active,
        wet_active: seed.wet_active,
        wet_cooldown_ticks: 0,
        motor_current_a: seed.motor_current_a ?? 0,
        temperature_c: 28 + Math.random() * 8,
        fault_codes: [...(seed.active_fault_codes ?? [])],
        seq: seed.last_telemetry_seq,
        availability: seed.availability,
        stale_flag: seed.stale_flag,
        last_seen_at: seed.last_seen_at,
        buffered_messages: [],
        is_moving: false,
        move_progress_pct: 0,
        tick_count: 0,
      };
      this.deviceStates.set(device.device_id, state);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalRef = setInterval(() => this.tick(), this.config.telemetry_interval_ms);
  }

  stop() {
    if (this.intervalRef) clearInterval(this.intervalRef);
    this.isRunning = false;
    for (const state of this.deviceStates.values()) {
      if (state.command_timeout_handle) {
        clearTimeout(state.command_timeout_handle);
        state.command_timeout_handle = undefined;
      }
    }
  }

  setMode(mode: SimulatorMode) {
    const wasRunning = this.isRunning;
    if (wasRunning) this.stop();
    this.config = { ...MODE_CONFIGS[mode] };
    if (wasRunning) this.start();
  }

  subscribe(listener: SimulatorListener) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit(event: SimulatorEvent) {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* isolate listener errors */ }
    }
  }

  // ─── MAIN TICK ────────────────────────────────────────────

  private tick() {
    this.tickCount++;
    const now = Date.now();

    for (const [device_id, state] of this.deviceStates) {
      state.tick_count++;

      if (!state.is_lte_connected) {
        this.handleOfflineTick(state, now);
        continue;
      }

      // LTE fluctuation
      this.updateLteSignal(state);

      // Random LTE disconnect
      const disconnectProb = this.config.lte_disconnect_probability / (1000 / this.config.telemetry_interval_ms);
      if (Math.random() < disconnectProb) {
        this.triggerLteDisconnect(state, now);
        continue;
      }

      // Battery drain
      this.updateBattery(state);

      // Temperature drift (Brownian motion ±0.5°C/tick)
      state.temperature_c = Math.max(20, Math.min(55, state.temperature_c + (Math.random() - 0.5) * 0.5));

      // Wet sensor simulation — occasional random wet detection
      this.updateWetSensor(state);

      // Valve motion progress
      if (state.is_moving) {
        this.updateValveMotion(state, now);
      }

      // Fault injection (all modes use fault_probability, fault_mode has high prob)
      if (Math.random() < this.config.fault_probability) {
        this.injectRandomFault(state);
      }

      // Emit telemetry
      const telemetry = this.buildTelemetry(state);
      state.seq++;
      state.last_seen_at = new Date(now).toISOString();

      this.emit({ type: 'telemetry', device_id, payload: telemetry, state: { ...state }, timestamp: new Date(now).toISOString() });
    }
  }

  // ─── OFFLINE TICK ─────────────────────────────────────────

  private handleOfflineTick(state: DeviceSimState, now: number) {
    const offlineDuration = now - state.last_reconnect_at;
    const staleThreshold = this.config.reconnect_delay_ms * STALE_MULTIPLIER;

    if (offlineDuration > staleThreshold && state.availability === 'offline') {
      state.availability = 'stale';
      state.stale_flag = true;
      state.stale_age_sec = Math.round(offlineDuration / 1000);

      const payload = this.buildAvailabilityPayload(state, 'stale', now);
      this.emit({ type: 'lte_disconnect', device_id: state.device_id, payload, state: { ...state }, timestamp: new Date(now).toISOString() });

      // Emit EVT_DEVICE_STALE event
      this.emitEvent(state, 'EVT_DEVICE_STALE', 'warning', { state_before: 'offline', state_after: 'stale' });
    } else if (state.availability === 'stale') {
      state.stale_age_sec = Math.round(offlineDuration / 1000);
    }

    this.handleLteReconnect(state, now);
  }

  // ─── LTE ──────────────────────────────────────────────────

  private updateLteSignal(state: DeviceSimState) {
    const { lte_signal_min, lte_signal_max } = this.config;
    const drift = (Math.random() - 0.5) * 8;
    state.signal_strength = Math.max(lte_signal_min, Math.min(lte_signal_max, state.signal_strength + drift));
  }

  private triggerLteDisconnect(state: DeviceSimState, now: number) {
    const prevAvailability = state.availability;
    state.is_lte_connected = false;
    state.signal_strength = 0;
    state.availability = 'offline';
    state.stale_flag = false;
    state.reconnect_countdown_ms = this.config.reconnect_delay_ms + Math.random() * 5000;
    state.last_reconnect_at = now;

    if (!state.fault_codes.includes('FLT_LTE_DISCONNECTED')) {
      state.fault_codes.push('FLT_LTE_DISCONNECTED');
    }

    const payload = this.buildAvailabilityPayload(state, 'offline', now);
    this.emit({ type: 'lte_disconnect', device_id: state.device_id, payload, state: { ...state }, timestamp: new Date(now).toISOString() });

    // Emit EVT_DEVICE_OFFLINE
    this.emitEvent(state, 'EVT_DEVICE_OFFLINE', 'error', {
      state_before: prevAvailability,
      state_after: 'offline',
      fault_code: 'FLT_LTE_DISCONNECTED',
    });
  }

  private handleLteReconnect(state: DeviceSimState, now: number) {
    const elapsed = now - state.last_reconnect_at;
    if (elapsed < state.reconnect_countdown_ms) return;

    state.is_lte_connected = true;
    state.signal_strength = this.config.lte_signal_min + Math.random() * (this.config.lte_signal_max - this.config.lte_signal_min);
    state.availability = 'online';
    state.stale_flag = false;
    state.stale_age_sec = undefined;
    state.fault_codes = state.fault_codes.filter(f => f !== 'FLT_LTE_DISCONNECTED');
    state.last_seen_at = new Date(now).toISOString();

    const payload = this.buildAvailabilityPayload(state, 'online', now);
    this.emit({ type: 'lte_connect', device_id: state.device_id, payload, state: { ...state }, timestamp: new Date(now).toISOString() });

    // Emit EVT_DEVICE_ONLINE
    this.emitEvent(state, 'EVT_DEVICE_ONLINE', 'info', { state_before: 'offline', state_after: 'online' });
  }

  // ─── BATTERY ──────────────────────────────────────────────

  private updateBattery(state: DeviceSimState) {
    const prevState = state.battery_state;
    const drain = state.is_moving ? 0.002 : 0.0005;
    state.battery_v = Math.max(8.0, state.battery_v - drain);

    if (state.battery_v < BATTERY_CRITICAL_V) state.battery_state = 'critical';
    else if (state.battery_v < BATTERY_LOW_V) state.battery_state = 'low';
    else state.battery_state = 'good';

    // Emit event on battery state change
    if (prevState !== state.battery_state) {
      if (state.battery_state === 'low') {
        this.emitEvent(state, 'EVT_LOW_BATTERY', 'warning', {
          fault_code: 'FLT_BATTERY_LOW',
          state_before: prevState,
          state_after: 'low',
        });
        if (!state.fault_codes.includes('FLT_BATTERY_LOW')) {
          state.fault_codes.push('FLT_BATTERY_LOW');
        }
      } else if (state.battery_state === 'critical') {
        this.emitEvent(state, 'EVT_LOW_BATTERY', 'critical', {
          fault_code: 'FLT_BATTERY_CRITICAL',
          state_before: prevState,
          state_after: 'critical',
        });
        if (!state.fault_codes.includes('FLT_BATTERY_CRITICAL')) {
          state.fault_codes.push('FLT_BATTERY_CRITICAL');
        }
      } else if (state.battery_state === 'good' && (prevState === 'low' || prevState === 'critical')) {
        this.emitEvent(state, 'EVT_BATTERY_RECOVERED', 'info', { state_before: prevState, state_after: 'good' });
        state.fault_codes = state.fault_codes.filter(f => f !== 'FLT_BATTERY_LOW' && f !== 'FLT_BATTERY_CRITICAL');
      }
    }
  }

  // ─── WET SENSOR ───────────────────────────────────────────

  private updateWetSensor(state: DeviceSimState) {
    if (state.wet_cooldown_ticks > 0) {
      state.wet_cooldown_ticks--;
      return;
    }

    // Rare wet detection (0.3% per tick in normal modes, 2% in fault_mode)
    const wetProb = this.config.mode === 'fault_mode' ? 0.02 : 0.003;
    if (!state.wet_active && Math.random() < wetProb) {
      state.wet_active = true;
      state.wet_cooldown_ticks = 10; // stay wet for 10 ticks before possible clear
      if (!state.fault_codes.includes('FLT_WET_DETECTED')) {
        state.fault_codes.push('FLT_WET_DETECTED');
      }
      this.emitEvent(state, 'EVT_WET_DETECTED', 'error', { fault_code: 'FLT_WET_DETECTED' });
      this.emit({ type: 'state_change', device_id: state.device_id, payload: null, state: { wet_active: true }, timestamp: new Date().toISOString() });
    } else if (state.wet_active && Math.random() < 0.05) {
      state.wet_active = false;
      state.wet_cooldown_ticks = 5;
      state.fault_codes = state.fault_codes.filter(f => f !== 'FLT_WET_DETECTED');
      this.emitEvent(state, 'EVT_WET_CLEARED', 'info', { state_before: 'wet', state_after: 'clear' });
      this.emit({ type: 'state_change', device_id: state.device_id, payload: null, state: { wet_active: false }, timestamp: new Date().toISOString() });
    }
  }

  // ─── VALVE MOTION ─────────────────────────────────────────

  private updateValveMotion(state: DeviceSimState, now: number) {
    if (!state.move_start_time) return;
    const elapsed = now - state.move_start_time;
    const total_duration = 8000 + Math.random() * 4000;
    const progress = Math.min(1, elapsed / total_duration);

    if (state.move_direction === 'opening') {
      state.valve_position_pct = Math.round(progress * state.target_position_pct);
      state.valve_state = progress < 1 ? 'opening' : 'open';
      state.motor_current_a = progress < 1 ? 0.8 + Math.random() * 0.4 : 0;
    } else {
      state.valve_position_pct = Math.round((1 - progress) * state.move_progress_pct);
      state.valve_state = progress < 1 ? 'closing' : 'closed';
      state.motor_current_a = progress < 1 ? 0.8 + Math.random() * 0.4 : 0;
    }

    if (progress >= 1) {
      state.is_moving = false;
      state.motor_current_a = 0;

      // Emit valve state event
      const evtCode: EventCode = state.valve_state === 'open' ? 'EVT_VALVE_OPENED' : 'EVT_VALVE_CLOSED';
      this.emitEvent(state, evtCode, 'info', { final_position_pct: state.valve_position_pct } as never);

      this.processAckStage(state, 'completed', { final_position_pct: state.valve_position_pct });
    }
  }

  // ─── FAULT INJECTION ──────────────────────────────────────

  private injectRandomFault(state: DeviceSimState) {
    // Pick from all injectable faults, weighted toward motor faults
    const faults = this.config.mode === 'fault_mode' ? INJECTABLE_FAULTS : INJECTABLE_FAULTS.slice(0, 5);
    const fault = faults[Math.floor(Math.random() * faults.length)];

    if (state.fault_codes.includes(fault)) return;

    state.fault_codes.push(fault);
    state.firmware_state = 'fault';

    this.emitEvent(state, 'EVT_FAULT_DETECTED', 'error', { fault_code: fault });

    // Safety stop if executing motion
    if (state.pending_command && state.is_moving && SAFETY_STOP_FAULTS.includes(fault)) {
      state.is_moving = false;
      state.motor_current_a = 0;
      state.valve_state = 'stopped';
      this.processAckStage(state, 'safety_stopped', {
        fault_code: fault,
        reason_code: 'RSN_SAFETY_BLOCKED',
      });
    }
  }

  // ─── EVENT EMISSION ───────────────────────────────────────

  private emitEvent(
    state: DeviceSimState,
    event_code: EventCode,
    severity: EventSeverity,
    extras?: Partial<{ fault_code: FaultCode; reason_code: ReasonCode; state_before: string; state_after: string; final_position_pct: number }>
  ) {
    const payload: EventPayload = {
      schema: MQTT_SCHEMA.event,
      schema_version: MQTT_SCHEMA_VERSION,
      msg_type: 'event',
      tenant_id: state.tenant_id,
      site_id: state.site_id,
      device_id: state.device_id,
      ts_device: new Date().toISOString(),
      seq: state.seq,
      event_code,
      severity,
      state_before: extras?.state_before,
      state_after: extras?.state_after,
      reason_code: extras?.reason_code,
      fault_code: extras?.fault_code,
    };
    this.emit({
      type: 'event',
      device_id: state.device_id,
      payload,
      state: { ...state },
      timestamp: new Date().toISOString(),
    });
  }

  // ─── COMMAND PROCESSING ───────────────────────────────────

  async processCommand(command: CommandPayload): Promise<void> {
    const state = this.deviceStates.get(command.device_id);
    if (!state) return;

    state.pending_command = command;

    // Emit EVT_COMMAND_RECEIVED
    this.emitEvent(state, 'EVT_COMMAND_RECEIVED', 'info', { reason_code: undefined });

    // Blocking check
    const blockReason = this.checkCommandBlocked(state, command);
    if (blockReason) {
      await this.delayMs(500);
      this.processAckStage(state, 'blocked', { reason_code: blockReason });
      this.emitEvent(state, 'EVT_COMMAND_FAILED', 'warning', { reason_code: blockReason });
      return;
    }

    // LTE round-trip delay → accepted
    await this.delayMs(this.config.ack_delay_ms);
    if (!state.is_lte_connected) {
      this.processAckStage(state, 'timeout', { reason_code: 'RSN_TIMEOUT' });
      return;
    }
    this.processAckStage(state, 'accepted');

    // Executing delay
    await this.delayMs(this.config.ack_delay_ms);
    if (!state.is_lte_connected) {
      this.processAckStage(state, 'timeout', { reason_code: 'RSN_TIMEOUT' });
      return;
    }
    this.processAckStage(state, 'executing');

    // Command expiry timeout
    const expiresMs = new Date(command.expires_at).getTime();
    const timeoutDelay = Math.max(5000, expiresMs - Date.now());
    if (state.command_timeout_handle) clearTimeout(state.command_timeout_handle);
    state.command_timeout_handle = setTimeout(() => {
      if (state.pending_command?.command_id === command.command_id) {
        state.is_moving = false;
        state.motor_current_a = 0;
        this.processAckStage(state, 'timeout', { reason_code: 'RSN_COMMAND_EXPIRED' });
      }
    }, timeoutDelay);

    // Execute by command type
    if (command.command_type === 'open' || command.command_type === 'set_position') {
      const target = command.command_payload?.target_position_pct ?? 100;
      state.is_moving = true;
      state.move_start_time = Date.now();
      state.move_progress_pct = state.valve_position_pct;
      state.move_direction = 'opening';
      state.target_position_pct = target;
    } else if (command.command_type === 'close') {
      state.is_moving = true;
      state.move_start_time = Date.now();
      state.move_progress_pct = state.valve_position_pct;
      state.move_direction = 'closing';
      state.target_position_pct = 0;
    } else if (command.command_type === 'stop') {
      state.is_moving = false;
      state.valve_state = 'stopped';
      this.emitEvent(state, 'EVT_VALVE_STOPPED', 'info');
      await this.delayMs(1000);
      this.processAckStage(state, 'completed', { final_position_pct: state.valve_position_pct });
    } else if (command.command_type === 'calibrate') {
      await this.delayMs(3000);
      state.valve_state = 'closed';
      state.valve_position_pct = 0;
      this.emitEvent(state, 'EVT_CALIBRATION_DONE', 'info');
      this.processAckStage(state, 'completed', { final_position_pct: 0 });
    } else if (command.command_type === 'reboot') {
      await this.delayMs(1000);
      this.processAckStage(state, 'completed');
      this.emitEvent(state, 'EVT_FIRMWARE_UPDATE', 'info');
      this.triggerLteDisconnect(state, Date.now());
      state.reconnect_countdown_ms = 5000;
    } else if (command.command_type === 'ping') {
      await this.delayMs(500);
      this.processAckStage(state, 'completed');
    }
  }

  private checkCommandBlocked(state: DeviceSimState, command: CommandPayload): ReasonCode | null {
    if (!state.is_lte_connected) return 'RSN_DEVICE_OFFLINE';
    if (state.availability === 'stale') return 'RSN_DEVICE_STALE';
    const isMovementCmd = ['open', 'close', 'set_position'].includes(command.command_type);
    if (state.manual_active && isMovementCmd) return 'RSN_MANUAL_ACTIVE';
    if (state.wet_active && (isMovementCmd || command.command_type === 'calibrate')) return 'RSN_WET_ACTIVE';
    if (state.battery_state === 'critical' && isMovementCmd) return 'RSN_CRITICAL_BATTERY';
    if (state.fault_codes.some(f => MOTOR_BLOCKING_FAULTS.includes(f))) return 'RSN_FAULT_ACTIVE';
    return null;
  }

  private processAckStage(state: DeviceSimState, stage: AckStage, extras?: Partial<AckPayload>) {
    if (!state.pending_command) return;

    state.ack_stage = stage;
    const isFailure = ['rejected', 'failed', 'blocked', 'timeout', 'safety_stopped'].includes(stage);
    const ack: AckPayload = {
      schema: MQTT_SCHEMA.ack,
      schema_version: MQTT_SCHEMA_VERSION,
      msg_type: 'ack',
      tenant_id: state.tenant_id,
      site_id: state.site_id,
      device_id: state.device_id,
      command_id: state.pending_command.command_id,
      ack_stage: stage,
      result: stage === 'completed' ? 'success' : isFailure ? 'failure' : 'pending',
      current_state: state.valve_state,
      ts_device: new Date().toISOString(),
      seq: state.seq++,
      ...extras,
    };

    this.emit({ type: 'ack', device_id: state.device_id, payload: ack, state: { ...state }, timestamp: new Date().toISOString() });

    const isTerminal = ['completed', 'failed', 'rejected', 'blocked', 'timeout', 'safety_stopped'].includes(stage);
    if (isTerminal) {
      if (state.command_timeout_handle) {
        clearTimeout(state.command_timeout_handle);
        state.command_timeout_handle = undefined;
      }
      // Emit EVT_COMMAND_COMPLETED or EVT_COMMAND_FAILED
      if (stage === 'completed') {
        this.emitEvent(state, 'EVT_COMMAND_COMPLETED', 'info');
      } else {
        this.emitEvent(state, 'EVT_COMMAND_FAILED', isFailure ? 'warning' : 'error', {
          reason_code: extras?.reason_code as ReasonCode | undefined,
          fault_code: extras?.fault_code as FaultCode | undefined,
        });
      }
      state.pending_command = undefined;
      state.ack_stage = undefined;
    }
  }

  // ─── TELEMETRY BUILDER ────────────────────────────────────

  private buildTelemetry(state: DeviceSimState): TelemetryPayload {
    return {
      schema: MQTT_SCHEMA.telemetry,
      schema_version: MQTT_SCHEMA_VERSION,
      msg_type: 'telemetry',
      tenant_id: state.tenant_id,
      site_id: state.site_id,
      device_id: state.device_id,
      ts_device: new Date().toISOString(),
      seq: state.seq,
      valve_state: state.valve_state,
      valve_position_pct: state.valve_position_pct,
      position_confidence: state.fault_codes.includes('FLT_POSITION_INVALID') ? 'invalid' : 'valid',
      battery_v: parseFloat(state.battery_v.toFixed(2)),
      battery_state: state.battery_state,
      firmware_state: state.firmware_state,
      manual_active: state.manual_active,
      wet_active: state.wet_active,
      signal_strength: Math.round(state.signal_strength),
      motor_current_a: parseFloat(state.motor_current_a.toFixed(2)),
      temperature_c: parseFloat(state.temperature_c.toFixed(1)),
      fw_version: 'FW-AGRI-2.1.4',
      protocol_version: '1',
    };
  }

  private buildAvailabilityPayload(state: DeviceSimState, avail: AvailabilityState, now: number): AvailabilityPayload {
    return {
      schema: MQTT_SCHEMA.availability,
      schema_version: MQTT_SCHEMA_VERSION,
      msg_type: 'availability',
      tenant_id: state.tenant_id,
      site_id: state.site_id,
      device_id: state.device_id,
      ts_device: new Date(now).toISOString(),
      seq: state.seq,
      availability_state: avail,
      last_seen_at: state.last_seen_at,
      stale_age_sec: state.stale_age_sec,
    };
  }

  // ─── MANUAL CONTROLS ──────────────────────────────────────

  setManualOverride(device_id: string, active: boolean) {
    const state = this.deviceStates.get(device_id);
    if (!state) return;
    state.manual_active = active;
    const evtCode: EventCode = active ? 'EVT_MANUAL_ACTIVATED' : 'EVT_MANUAL_DEACTIVATED';
    this.emitEvent(state, evtCode, active ? 'warning' : 'info');
    this.emit({ type: 'state_change', device_id, payload: null, state: { manual_active: active }, timestamp: new Date().toISOString() });
  }

  setWetActive(device_id: string, active: boolean) {
    const state = this.deviceStates.get(device_id);
    if (!state) return;
    state.wet_active = active;
    state.wet_cooldown_ticks = active ? 8 : 3;
    const evtCode: EventCode = active ? 'EVT_WET_DETECTED' : 'EVT_WET_CLEARED';
    this.emitEvent(state, evtCode, active ? 'error' : 'info', { fault_code: active ? 'FLT_WET_DETECTED' : undefined });
    if (active && !state.fault_codes.includes('FLT_WET_DETECTED')) {
      state.fault_codes.push('FLT_WET_DETECTED');
    } else if (!active) {
      state.fault_codes = state.fault_codes.filter(f => f !== 'FLT_WET_DETECTED');
    }
    this.emit({ type: 'state_change', device_id, payload: null, state: { wet_active: active }, timestamp: new Date().toISOString() });
  }

  injectFault(device_id: string, fault_code: FaultCode) {
    const state = this.deviceStates.get(device_id);
    if (!state) return;
    if (!state.fault_codes.includes(fault_code)) {
      state.fault_codes.push(fault_code);
    }
    state.firmware_state = 'fault';
    this.emitEvent(state, 'EVT_FAULT_DETECTED', 'error', { fault_code });
    this.emit({ type: 'state_change', device_id, payload: null, state: { fault_codes: state.fault_codes }, timestamp: new Date().toISOString() });
  }

  clearFault(device_id: string, fault_code: FaultCode) {
    const state = this.deviceStates.get(device_id);
    if (!state) return;
    state.fault_codes = state.fault_codes.filter(f => f !== fault_code);
    if (state.fault_codes.length === 0) state.firmware_state = 'healthy';
    this.emitEvent(state, 'EVT_FAULT_CLEARED', 'info', { fault_code });
    this.emit({ type: 'state_change', device_id, payload: null, state: { fault_codes: state.fault_codes }, timestamp: new Date().toISOString() });
  }

  getDeviceState(device_id: string): DeviceSimState | undefined {
    return this.deviceStates.get(device_id);
  }

  getAllDeviceStates(): DeviceSimState[] {
    return Array.from(this.deviceStates.values());
  }

  private delayMs(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── SINGLETON ────────────────────────────────────────────────

let _simulator: LteDeviceSimulator | null = null;

export function getSimulator(mode?: SimulatorMode): LteDeviceSimulator {
  if (!_simulator) {
    _simulator = new LteDeviceSimulator(mode ?? 'demo_mode');
  }
  return _simulator;
}

export function resetSimulator(mode: SimulatorMode = 'demo_mode') {
  if (_simulator) _simulator.stop();
  _simulator = new LteDeviceSimulator(mode);
  return _simulator;
}
