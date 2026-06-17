// ============================================================
// SIMULATOR STORE — Connect LTE simulator to React state
// ============================================================

import { create } from 'zustand';
import type { SimulatorMode, DeviceEvent, Fault, EventPayload, FaultCode, EventSeverity } from '@/types';
import { getSimulator, resetSimulator, type SimulatorEvent } from '@/simulator/lteSimulator';
import { useDeviceStore } from './deviceStore';
import { useAlertStore } from './alertStore';
import type { TelemetryPayload, AvailabilityPayload } from '@/types';

const FAULT_EVENT_CODES = new Set(['EVT_FAULT_DETECTED']);
const FAULT_CLEAR_EVENT_CODES = new Set(['EVT_FAULT_CLEARED']);

const FAULT_DESCRIPTIONS: Partial<Record<FaultCode, string>> = {
  FLT_MOTOR_JAM:         'Motor jammed — physical obstruction detected',
  FLT_MOTOR_OVERCURRENT: 'Motor overcurrent — electrical fault detected',
  FLT_MOTOR_STALL:       'Motor stall — unable to complete movement',
  FLT_POSITION_INVALID:  'Valve position sensor reading invalid',
  FLT_POSITION_TIMEOUT:  'Position encoder did not respond in time',
  FLT_SENSOR_MISSING:    'Required sensor not found during boot',
  FLT_RELAY_FAULT:       'Relay driver circuit failure',
  FLT_SAFETY_TRIP:       'Hardware safety trip triggered',
  FLT_CALIBRATION_LOST:  'Calibration data corrupted or lost',
  FLT_FIRMWARE_CORRUPT:  'Firmware checksum failed — OTA required',
  FLT_BATTERY_LOW:       'Battery voltage below low threshold (11V)',
  FLT_BATTERY_CRITICAL:  'Battery voltage critical — operation suspended',
  FLT_WET_DETECTED:      'Moisture sensor triggered — valve unsafe to operate',
  FLT_LTE_DISCONNECTED:  'LTE modem lost carrier signal',
  FLT_COMMUNICATION_LOST:'Device-to-server communication lost for extended period',
};

let simEventSeq = 20000;
let simFaultSeq = 20000;
function genEventId() { return `EVT-SIM-${Date.now()}-${++simEventSeq}`; }
function genFaultId() { return `FLT-SIM-${Date.now()}-${++simFaultSeq}`; }

interface SimulatorState {
  mode: SimulatorMode;
  isRunning: boolean;
  eventLog: SimulatorEvent[];
  maxLogSize: number;

  startSimulator: (mode?: SimulatorMode) => void;
  stopSimulator: () => void;
  setMode: (mode: SimulatorMode) => void;
  clearLog: () => void;
}

export const useSimulatorStore = create<SimulatorState>()((set, get) => ({
  mode: 'demo_mode',
  isRunning: false,
  eventLog: [],
  maxLogSize: 200,

  startSimulator: (mode?: SimulatorMode) => {
    const { mode: currentMode } = get();
    const targetMode = mode ?? currentMode;

    const sim = resetSimulator(targetMode);

    sim.subscribe((event: SimulatorEvent) => {
      // Update device latest state on telemetry
      if (event.type === 'telemetry' && event.payload) {
        const t = event.payload as TelemetryPayload;
        useDeviceStore.getState().updateLatestState(event.device_id, {
          valve_state: t.valve_state,
          valve_position_pct: t.valve_position_pct,
          position_confidence: t.position_confidence,
          battery_v: t.battery_v,
          battery_state: t.battery_state,
          firmware_state: t.firmware_state,
          manual_active: t.manual_active,
          wet_active: t.wet_active,
          signal_strength: t.signal_strength,
          motor_current_a: t.motor_current_a,
          temperature_c: t.temperature_c,
          last_seen_at: t.ts_device,
          last_telemetry_seq: t.seq,
          availability: 'online',
          stale_flag: false,
          updated_at: new Date().toISOString(),
        });
      }

      // Update availability on connect/disconnect
      if ((event.type === 'lte_connect' || event.type === 'lte_disconnect') && event.payload) {
        const a = event.payload as AvailabilityPayload;
        const simState = event.state;
        const signalUpdate = a.availability_state === 'offline' ? { signal_strength: 0 } :
          simState.signal_strength != null ? { signal_strength: simState.signal_strength } : {};
        useDeviceStore.getState().updateLatestState(event.device_id, {
          availability: a.availability_state,
          stale_flag: a.availability_state !== 'online',
          last_seen_at: a.last_seen_at,
          ...signalUpdate,
          updated_at: new Date().toISOString(),
        });
      }

      // Route EventPayload to alertStore
      if (event.type === 'event' && event.payload) {
        const ep = event.payload as EventPayload;
        const device_id = event.device_id; // always string from SimulatorEvent
        const now = new Date().toISOString();
        const isFaultEvent = FAULT_EVENT_CODES.has(ep.event_code);
        const isFaultClear = FAULT_CLEAR_EVENT_CODES.has(ep.event_code);

        const deviceEvent: DeviceEvent = {
          event_id: genEventId(),
          tenant_id: ep.tenant_id,
          site_id: ep.site_id,
          device_id,
          event_code: ep.event_code,
          severity: ep.severity,
          state_before: ep.state_before,
          state_after: ep.state_after,
          reason_code: ep.reason_code,
          fault_code: ep.fault_code ?? undefined,
          is_active: ['critical', 'error', 'warning'].includes(ep.severity),
          ts_device: ep.ts_device,
          ts_cloud: now,
          seq: ep.seq,
        };
        useAlertStore.getState().addEvent(deviceEvent);

        // Also create/clear a Fault record for fault lifecycle events
        if (isFaultEvent && ep.fault_code) {
          const faultCode = ep.fault_code;
          const fault: Fault = {
            fault_id: genFaultId(),
            tenant_id: ep.tenant_id,
            site_id: ep.site_id,
            device_id,
            fault_code: faultCode,
            severity: ep.severity as EventSeverity,
            description: FAULT_DESCRIPTIONS[faultCode] ?? faultCode,
            is_active: true,
            detected_at: now,
            related_event_id: deviceEvent.event_id,
          };
          useAlertStore.getState().addFault(fault);
          // Update active_fault_codes on device latest state
          const devState = useDeviceStore.getState().latestStates[device_id];
          if (devState) {
            const current = devState.active_fault_codes ?? [];
            if (!current.includes(faultCode)) {
              useDeviceStore.getState().updateLatestState(device_id, {
                active_fault_codes: [...current, faultCode],
                firmware_state: 'fault',
                updated_at: now,
              });
            }
          }
        }

        if (isFaultClear && ep.fault_code) {
          const faultCode = ep.fault_code;
          useAlertStore.getState().clearFaultByCode(device_id, faultCode);
          const devState = useDeviceStore.getState().latestStates[device_id];
          if (devState) {
            const updated = (devState.active_fault_codes ?? []).filter(f => f !== faultCode);
            useDeviceStore.getState().updateLatestState(device_id, {
              active_fault_codes: updated,
              firmware_state: updated.length === 0 ? 'healthy' : 'fault',
              updated_at: now,
            });
          }
        }
      }

      // Log the event
      set(state => {
        const newLog = [event, ...state.eventLog].slice(0, state.maxLogSize);
        return { eventLog: newLog };
      });
    });

    sim.start();
    set({ isRunning: true, mode: targetMode });
  },

  stopSimulator: () => {
    const sim = getSimulator();
    sim.stop();
    set({ isRunning: false });
  },

  setMode: (mode: SimulatorMode) => {
    const { isRunning } = get();
    const sim = getSimulator();
    sim.setMode(mode);
    set({ mode });
    if (!isRunning) get().startSimulator(mode);
  },

  clearLog: () => set({ eventLog: [] }),
}));
