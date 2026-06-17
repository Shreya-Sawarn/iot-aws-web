// ============================================================
// OPERATIONAL: Device Service
// Phase-1: reads from Zustand deviceStore (seeded mock data)
// Phase-2: swap for DynamoDB via AppSync queries
// ============================================================

import { useDeviceStore } from '@/store/deviceStore';
import type { Device, LatestState } from '@/types';

/**
 * Get all devices for a tenant.
 * Phase-2: AppSync query → DynamoDB Device table.
 */
export function getDevicesForTenant(tenant_id: string): Device[] {
  return useDeviceStore.getState().getDevicesForTenant(tenant_id);
}

/**
 * Get a single device by ID.
 * Phase-2: AppSync query → DynamoDB Device table.
 */
export function getDeviceById(device_id: string): Device | undefined {
  return useDeviceStore.getState().getDeviceById(device_id);
}

/**
 * Get latest telemetry state for a device.
 * Phase-2: AppSync query → DynamoDB LatestState table.
 */
export function getLatestState(device_id: string): LatestState | undefined {
  return useDeviceStore.getState().getLatestState(device_id);
}

/**
 * Get fleet summary counts for a tenant.
 * Phase-2: AppSync query with aggregation Lambda.
 */
export function getFleetSummary(tenant_id: string) {
  const store = useDeviceStore.getState();
  const devices = store.getDevicesForTenant(tenant_id);
  return {
    total: devices.length,
    online: store.getOnlineCount(tenant_id),
    offline: store.getOfflineCount(tenant_id),
    faults: store.getFaultCount(tenant_id),
    lowBattery: store.getLowBatteryCount(tenant_id),
  };
}
