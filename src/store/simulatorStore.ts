// ============================================================
// SIMULATOR STORE — Connect LTE simulator to React state
// ============================================================

import { create } from 'zustand';
import type { SimulatorMode } from '@/types';
import { getSimulator, resetSimulator, type SimulatorEvent } from '@/simulator/lteSimulator';
import { useDeviceStore } from './deviceStore';
import { useAlertStore } from './alertStore';
import type { TelemetryPayload, AvailabilityPayload } from '@/types';

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
        useDeviceStore.getState().updateLatestState(event.device_id, {
          availability: a.availability_state,
          stale_flag: a.availability_state !== 'online',
          last_seen_at: a.last_seen_at,
          signal_strength: a.availability_state === 'offline' ? 0 : undefined,
          updated_at: new Date().toISOString(),
        });
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
