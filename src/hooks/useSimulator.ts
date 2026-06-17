'use client';

import { useSimulatorStore } from '@/store/simulatorStore';
import { getSimulator } from '@/simulator/lteSimulator';
import type { SimulatorMode } from '@/types';

/**
 * Simulator control hook.
 * Phase-2: simulator is replaced by real AWS IoT Core subscription;
 * this hook becomes a no-op or development-only feature.
 */
export function useSimulator() {
  const { mode, isRunning, eventLog, startSimulator, stopSimulator, setMode, clearLog } = useSimulatorStore();

  function switchMode(newMode: SimulatorMode) {
    setMode(newMode);
    if (!isRunning) startSimulator(newMode);
  }

  function toggleRunning() {
    if (isRunning) stopSimulator();
    else startSimulator();
  }

  return { mode, isRunning, eventLog, switchMode, toggleRunning, clearLog, setMode };
}

/**
 * Direct simulator access for device overrides (manual, wet toggles).
 * Phase-2: these become AppSync mutations that Lambda propagates to device.
 */
export function useSimulatorDevice(device_id: string) {
  const sim = getSimulator();

  return {
    setManualOverride: (active: boolean) => sim.setManualOverride(device_id, active),
    setWetActive:      (active: boolean) => sim.setWetActive(device_id, active),
    injectFault:       (code: import('@/types').FaultCode) => sim.injectFault(device_id, code),
    clearFault:        (code: import('@/types').FaultCode) => sim.clearFault(device_id, code),
  };
}
