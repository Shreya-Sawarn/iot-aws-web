// ============================================================
// OPERATIONAL: Command Service
// Phase-1: routes to LTE simulator
// Phase-2: swap for AWS AppSync mutation → Lambda → IoT Core
// ============================================================

import type { CommandType } from '@/types';
import { useCommandStore } from '@/store/commandStore';

export interface SubmitCommandParams {
  tenant_id: string;
  site_id: string;
  device_id: string;
  command_type: CommandType;
  issued_by: string;
  target_position_pct?: number;
}

export interface CommandServiceResult {
  command_id: string;
  success: boolean;
  error?: string;
}

/**
 * Submit a command through the operational layer.
 * Phase-1: delegates to commandStore (simulator).
 * Phase-2: replace body with AppSync mutation call.
 */
export async function submitCommand(params: SubmitCommandParams): Promise<CommandServiceResult> {
  try {
    const command_id = await useCommandStore.getState().submitCommand(params);
    return { command_id, success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Command submission failed';
    return { command_id: '', success: false, error };
  }
}

/**
 * Get command history for a device.
 * Phase-2: replace with AppSync query.
 */
export function getCommandHistory(device_id: string) {
  return useCommandStore.getState().getCommandsByDevice(device_id);
}

/**
 * Get the active (in-flight) command for a device.
 * Phase-2: replace with AppSync subscription.
 */
export function getActiveCommand(device_id: string) {
  return useCommandStore.getState().getActiveCommand(device_id);
}
