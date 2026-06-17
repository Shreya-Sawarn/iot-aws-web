// ============================================================
// OPERATIONAL: Alert Service
// Phase-1: reads from Zustand alertStore
// Phase-2: swap for AppSync subscriptions → DynamoDB Fault + DeviceEvent tables
// ============================================================

import { useAlertStore } from '@/store/alertStore';
import type { FaultCode } from '@/types';

/**
 * Get active faults for a tenant or specific device.
 * Phase-2: AppSync subscription → DynamoDB Fault table.
 */
export function getActiveFaults(device_id?: string) {
  const store = useAlertStore.getState();
  return device_id ? store.getDeviceFaults(device_id) : store.getActiveFaults();
}

/**
 * Get active events for a tenant or specific device.
 * Phase-2: AppSync subscription → DynamoDB DeviceEvent table.
 */
export function getActiveEvents(device_id?: string) {
  const store = useAlertStore.getState();
  return device_id ? store.getDeviceEvents(device_id) : store.getActiveEvents();
}

/**
 * Clear a fault (manual operator action).
 * Phase-2: AppSync mutation → Lambda → DynamoDB update.
 */
export function clearFault(fault_id: string, cleared_by: string) {
  useAlertStore.getState().clearFault(fault_id, cleared_by);
}

/**
 * Get unread alert count.
 */
export function getUnreadCount(): number {
  return useAlertStore.getState().unreadCount;
}
