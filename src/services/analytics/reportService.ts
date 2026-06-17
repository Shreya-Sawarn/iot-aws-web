// ============================================================
// ANALYTICS: Report Service — Hostinger authority
// Phase-1: aggregates from local mock data
// Phase-2: swap for Hostinger analytics backend API
//          (NOT AWS — analytics is Hostinger-owned per architecture)
// ============================================================

import { useDeviceStore } from '@/store/deviceStore';
import { useCommandStore } from '@/store/commandStore';
import { useAlertStore } from '@/store/alertStore';
import type { Device } from '@/types';

export interface CommandSummary {
  total: number;
  completed: number;
  failed: number;
  successRate: number;
}

export interface BatterySummary {
  device_id: string;
  device_name: string;
  battery_v: number;
  battery_state: string;
}

/**
 * Get command success/failure analytics.
 * Phase-2: Hostinger analytics backend query.
 */
export function getCommandAnalytics(tenant_id: string): CommandSummary {
  const commands = useCommandStore.getState().commands.filter(c => c.tenant_id === tenant_id);
  const completed = commands.filter(c => c.current_ack_stage === 'completed').length;
  const failed = commands.filter(c =>
    ['failed', 'timeout', 'blocked', 'safety_stopped'].includes(c.current_ack_stage)
  ).length;
  return {
    total: commands.length,
    completed,
    failed,
    successRate: commands.length > 0 ? Math.round((completed / commands.length) * 100) : 0,
  };
}

/**
 * Get battery status analytics across fleet.
 * Phase-2: Hostinger analytics backend query (trend + history).
 */
export function getBatteryAnalytics(devices: Device[]): BatterySummary[] {
  const states = useDeviceStore.getState().latestStates;
  return devices
    .map(d => ({
      device_id: d.device_id,
      device_name: d.device_name,
      battery_v: states[d.device_id]?.battery_v ?? 0,
      battery_state: states[d.device_id]?.battery_state ?? 'unknown',
    }))
    .sort((a, b) => a.battery_v - b.battery_v);
}

/**
 * Get fault analytics for reporting.
 * Phase-2: Hostinger analytics backend — historical fault trends.
 */
export function getFaultAnalytics(tenant_id: string) {
  const faults = useAlertStore.getState().faults.filter(f => f.tenant_id === tenant_id);
  const byCode: Record<string, number> = {};
  for (const f of faults) {
    byCode[f.fault_code] = (byCode[f.fault_code] ?? 0) + 1;
  }
  return { faults, byCode };
}
