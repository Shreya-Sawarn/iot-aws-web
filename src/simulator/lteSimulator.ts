// ============================================================
// LTE DEVICE SIMULATOR
// Pure LTE communication simulation — no WiFi assumptions
// Source: SW-SIM-001, DOC#6.9, Combined DOC#6 RevA1
// Modes: demo_mode | dev_mode | test_mode | fault_mode | gateway_mode | replay_mode
// ============================================================

import type {
  TelemetryPayload, AckPayload, EventPayload, AvailabilityPayload,
  ValveState, BatteryState, FirmwareState, AvailabilityState,
  CommandPayload, AckStage, EventCode, FaultCode, ReasonCode,
  SimulatorMode, SimulatorConfig
} from '@/types';
import { MOCK_DEVICES, MOCK_LATEST_STATE } from '@/mock-data/seed';

// ─── SIMULATOR STATE ──────────────────────────────────────────

interface DeviceSimState {
  device_id: string;
  tenant_id: string;
  site_id: string;
  // LTE connectivity
  is_lte_connected: boolean;
  signal_strength: number;
  reconnect_countdown_ms: number;
  last_reconnect_at: number;
  // Telemetry state
  valve_state: ValveState;
  valve_position_pct: number;
  target_position_pct: number;
  battery_v: number;
  battery_state: BatteryState;
  firmware_state: FirmwareState;
  manual_active: boolean;
  wet_active: boolean;
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
  // Command timeout handle
  command_timeout_handle?: ReturnType<typeof setTimeout>;
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

// ─── DEFAULT CONFIG PER MODE ──────────────────────────────────

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

// Stale threshold: 5× reconnect_delay. Device transitions offline→stale after this.
const STALE_MULTIPLIER = 5;

// ─── LTE SIMULATOR CLASS ──────────────────────────────────────

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
      const seedState = MOCK_LATEST_STATE.find(s => s.device_id === device.device_id);
      if (!seedState) continue;

      const state: DeviceSimState = {
        device_id: device.device_id,
        tenant_id: device.tenant_id,
        site_id: device.site_id,
        is_lte_connected: seedState.availability === 'online',
        signal_strength: seedState.signal_strength,
        reconnect_countdown_ms: 0,
        last_reconnect_at: Date.now(),
        valve_state: seedState.valve_state,
        valve_position_pct: seedState.valve_position_pct,
        target_position_pct: seedState.valve_position_pct,
        battery_v: seedState.battery_v,
        battery_state: seedState.battery_state,
        firmware_state: seedState.firmware_state,
        manual_active: seedState.manual_active,
        wet_active: seedState.wet_active,
        motor_current_a: seedState.motor_current_a ?? 0,
        temperature_c: 28 + Math.random() * 8,
        fault_codes: [...(seedState.active_fault_codes ?? [])],
        seq: seedState.last_telemetry_seq,
        availability: seedState.availability,
        stale_flag: seedState.stale_flag,
        last_seen_at: seedState.last_seen_at,
        buffered_messages: [],
        is_moving: false,
        move_progress_pct: 0,
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
    // Clear all pending command timeouts
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
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: SimulatorEvent) {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore listener errors */ }
    }
  }

  // ─── MAIN TICK ─────────────────────────────────────────────

  private tick() {
    this.tickCount++;
    const now = Date.now();

    for (const [device_id, state] of this.deviceStates) {
      if (!state.is_lte_connected) {
        // Stale transition: after STALE_MULTIPLIER × reconnect_delay, mark stale
        const offlineDuration = now - state.last_reconnect_at;
        const staleThresholdMs = this.config.reconnect_delay_ms * STALE_MULTIPLIER;
        if (offlineDuration > staleThresholdMs && state.availability === 'offline') {
          state.availability = 'stale';
          state.stale_flag = true;
          state.stale_age_sec = Math.round(offlineDuration / 1000);
          const staleAvail: AvailabilityPayload = {
            schema: 'orbipulse.availability.v1',
            schema_version: 1,
            msg_type: 'availability',
            tenant_id: state.tenant_id,
            site_id: state.site_id,
            device_id: state.device_id,
            ts_device: new Date(now).toISOString(),
            seq: state.seq,
            availability_state: 'stale',
            last_seen_at: state.last_seen_at,
            stale_age_sec: state.stale_age_sec,
          };
          this.emit({ type: 'lte_disconnect', device_id, payload: staleAvail, state: { ...state }, timestamp: new Date(now).toISOString() });
        } else if (state.availability === 'stale') {
          state.stale_age_sec = Math.round(offlineDuration / 1000);
        }

        this.handleLteReconnect(state, now);
        continue;
      }

      // LTE fluctuation
      this.updateLteSignal(state);

      // Random LTE disconnect
      if (Math.random() < this.config.lte_disconnect_probability / (1000 / this.config.telemetry_interval_ms)) {
        this.triggerLteDisconnect(state, now);
        continue;
      }

      // Battery drain simulation
      this.updateBattery(state);

      // Temperature drift
      state.temperature_c = Math.max(20, Math.min(55, state.temperature_c + (Math.random() - 0.5) * 0.5));

      // Valve motion simulation
      if (state.is_moving) {
        this.updateValveMotion(state, now);
      }

      // Random fault injection (fault_mode only)
      if (this.config.mode === 'fault_mode' && Math.random() < this.config.fault_probability) {
        this.injectRandomFault(state);
      }

      // Emit telemetry
      const telemetry = this.buildTelemetry(state);
      state.seq++;
      state.last_seen_at = new Date(now).toISOString();

      this.emit({
        type: 'telemetry',
        device_id,
        payload: telemetry,
        state: { ...state },
        timestamp: new Date(now).toISOString(),
      });
    }
  }

  private updateLteSignal(state: DeviceSimState) {
    const { lte_signal_min, lte_signal_max } = this.config;
    const drift = (Math.random() - 0.5) * 8;
    state.signal_strength = Math.max(lte_signal_min, Math.min(lte_signal_max, state.signal_strength + drift));
  }

  private updateBattery(state: DeviceSimState) {
    const drain = state.is_moving ? 0.002 : 0.0005;
    state.battery_v = Math.max(8.0, state.battery_v - drain);
    if (state.battery_v < 10.0) state.battery_state = 'critical';
    else if (state.battery_v < 11.0) state.battery_state = 'low';
    else state.battery_state = 'good';
  }

  private triggerLteDisconnect(state: DeviceSimState, now: number) {
    state.is_lte_connected = false;
    state.signal_strength = 0;
    state.availability = 'offline';
    state.stale_flag = false; // reset — will become stale later
    state.reconnect_countdown_ms = this.config.reconnect_delay_ms + Math.random() * 5000;
    state.last_reconnect_at = now;
    if (!state.fault_codes.includes('FLT_LTE_DISCONNECTED')) {
      state.fault_codes.push('FLT_LTE_DISCONNECTED');
    }

    const avail: AvailabilityPayload = {
      schema: 'orbipulse.availability.v1',
      schema_version: 1,
      msg_type: 'availability',
      tenant_id: state.tenant_id,
      site_id: state.site_id,
      device_id: state.device_id,
      ts_device: new Date(Date.now()).toISOString(),
      seq: state.seq,
      availability_state: 'offline',
      last_seen_at: state.last_seen_at,
    };

    this.emit({ type: 'lte_disconnect', device_id: state.device_id, payload: avail, state: { ...state }, timestamp: new Date().toISOString() });
  }

  private handleLteReconnect(state: DeviceSimState, now: number) {
    const elapsed = now - state.last_reconnect_at;
    if (elapsed >= state.reconnect_countdown_ms) {
      state.is_lte_connected = true;
      state.signal_strength = this.config.lte_signal_min + Math.random() * (this.config.lte_signal_max - this.config.lte_signal_min);
      state.availability = 'online';
      state.stale_flag = false;
      state.stale_age_sec = undefined;
      state.fault_codes = state.fault_codes.filter(f => f !== 'FLT_LTE_DISCONNECTED');
      state.last_seen_at = new Date(now).toISOString();

      const avail: AvailabilityPayload = {
        schema: 'orbipulse.availability.v1',
        schema_version: 1,
        msg_type: 'availability',
        tenant_id: state.tenant_id,
        site_id: state.site_id,
        device_id: state.device_id,
        ts_device: new Date(now).toISOString(),
        seq: state.seq,
        availability_state: 'online',
        last_seen_at: new Date(now).toISOString(),
      };
      this.emit({ type: 'lte_connect', device_id: state.device_id, payload: avail, state: { ...state }, timestamp: new Date(now).toISOString() });
    }
  }

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
      this.processAckStage(state, 'completed', { final_position_pct: state.valve_position_pct });
    }
  }

  private injectRandomFault(state: DeviceSimState) {
    const faults: FaultCode[] = ['FLT_MOTOR_JAM', 'FLT_POSITION_INVALID', 'FLT_SENSOR_MISSING'];
    const fault = faults[Math.floor(Math.random() * faults.length)];
    if (!state.fault_codes.includes(fault)) {
      state.fault_codes.push(fault);
      state.firmware_state = 'fault';
      // If a command is executing during motion, trigger safety_stopped
      if (state.pending_command && state.is_moving) {
        state.is_moving = false;
        state.motor_current_a = 0;
        state.valve_state = 'stopped';
        this.processAckStage(state, 'safety_stopped', {
          fault_code: fault,
          reason_code: 'RSN_SAFETY_BLOCKED',
        });
      }
    }
  }

  // ─── COMMAND PROCESSING ────────────────────────────────────

  async processCommand(command: CommandPayload): Promise<void> {
    const state = this.deviceStates.get(command.device_id);
    if (!state) return;

    state.pending_command = command;

    // Check for blocking conditions — emits 'blocked', not 'rejected'
    const blockReason = this.checkCommandBlocked(state, command);
    if (blockReason) {
      await this.delayMs(500);
      this.processAckStage(state, 'blocked', { reason_code: blockReason });
      return;
    }

    // Simulate LTE round-trip delay before accepted
    await this.delayMs(this.config.ack_delay_ms);

    // Check if device went offline during the delay
    if (!state.is_lte_connected) {
      this.processAckStage(state, 'timeout', { reason_code: 'RSN_TIMEOUT' });
      return;
    }

    this.processAckStage(state, 'accepted');

    // Delay before executing
    await this.delayMs(this.config.ack_delay_ms);

    // Check again after executing delay
    if (!state.is_lte_connected) {
      this.processAckStage(state, 'timeout', { reason_code: 'RSN_TIMEOUT' });
      return;
    }

    this.processAckStage(state, 'executing');

    // Set a command expiry timeout — fires at expires_at
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

    // Start motion
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
      await this.delayMs(1000);
      this.processAckStage(state, 'completed', { final_position_pct: state.valve_position_pct });
    } else if (command.command_type === 'calibrate') {
      await this.delayMs(3000);
      state.valve_state = 'closed';
      state.valve_position_pct = 0;
      this.processAckStage(state, 'completed', { final_position_pct: 0 });
    } else if (command.command_type === 'reboot') {
      // Simulate reboot: go offline briefly then reconnect
      await this.delayMs(1000);
      this.processAckStage(state, 'completed');
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
    if (state.manual_active && ['open', 'close', 'set_position'].includes(command.command_type)) return 'RSN_MANUAL_ACTIVE';
    if (state.wet_active) return 'RSN_WET_ACTIVE';
    if (state.battery_state === 'critical' && ['open', 'close', 'set_position'].includes(command.command_type)) return 'RSN_CRITICAL_BATTERY';
    if (state.fault_codes.some(f => ['FLT_MOTOR_JAM', 'FLT_MOTOR_OVERCURRENT', 'FLT_RELAY_FAULT'].includes(f))) return 'RSN_FAULT_ACTIVE';
    return null;
  }

  private processAckStage(state: DeviceSimState, stage: AckStage, extras?: Partial<AckPayload>) {
    if (!state.pending_command) return;

    state.ack_stage = stage;
    const ack: AckPayload = {
      schema: 'orbipulse.ack.v1',
      schema_version: 1,
      msg_type: 'ack',
      tenant_id: state.tenant_id,
      site_id: state.site_id,
      device_id: state.device_id,
      command_id: state.pending_command.command_id,
      ack_stage: stage,
      result: stage === 'completed' ? 'success' : ['rejected', 'failed', 'blocked', 'timeout', 'safety_stopped'].includes(stage) ? 'failure' : 'pending',
      current_state: state.valve_state,
      ts_device: new Date().toISOString(),
      seq: state.seq++,
      ...extras,
    };

    this.emit({ type: 'ack', device_id: state.device_id, payload: ack, state: { ...state }, timestamp: new Date().toISOString() });

    // Terminal stages: clean up command and timeout
    if (['completed', 'failed', 'rejected', 'blocked', 'timeout', 'safety_stopped'].includes(stage)) {
      if (state.command_timeout_handle) {
        clearTimeout(state.command_timeout_handle);
        state.command_timeout_handle = undefined;
      }
      state.pending_command = undefined;
      state.ack_stage = undefined;
    }
  }

  private buildTelemetry(state: DeviceSimState): TelemetryPayload {
    return {
      schema: 'orbipulse.telemetry.v1',
      schema_version: 1,
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

  // ─── MANUAL CONTROLS ───────────────────────────────────────

  setManualOverride(device_id: string, active: boolean) {
    const state = this.deviceStates.get(device_id);
    if (!state) return;
    state.manual_active = active;
    this.emit({ type: 'state_change', device_id, payload: null, state: { manual_active: active }, timestamp: new Date().toISOString() });
  }

  setWetActive(device_id: string, active: boolean) {
    const state = this.deviceStates.get(device_id);
    if (!state) return;
    state.wet_active = active;
    this.emit({ type: 'state_change', device_id, payload: null, state: { wet_active: active }, timestamp: new Date().toISOString() });
  }

  injectFault(device_id: string, fault_code: FaultCode) {
    const state = this.deviceStates.get(device_id);
    if (!state) return;
    if (!state.fault_codes.includes(fault_code)) {
      state.fault_codes.push(fault_code);
    }
    state.firmware_state = 'fault';
    this.emit({ type: 'state_change', device_id, payload: null, state: { fault_codes: state.fault_codes }, timestamp: new Date().toISOString() });
  }

  clearFault(device_id: string, fault_code: FaultCode) {
    const state = this.deviceStates.get(device_id);
    if (!state) return;
    state.fault_codes = state.fault_codes.filter(f => f !== fault_code);
    if (state.fault_codes.length === 0) state.firmware_state = 'healthy';
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

// ─── SINGLETON INSTANCE ───────────────────────────────────────

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
