'use client';

import { useDeviceStore } from '@/store/deviceStore';
import { useAuthStore } from '@/store/authStore';
import { useMemo } from 'react';

/**
 * Returns devices and latest states scoped to the current user's tenant + role.
 * Phase-2: replace store reads with AppSync subscription hooks.
 */
export function useDevice(device_id?: string) {
  const { devices, latestStates } = useDeviceStore();
  const { session } = useAuthStore();

  const device = useMemo(
    () => (device_id ? devices.find(d => d.device_id === device_id) : undefined),
    [devices, device_id]
  );

  const state = device_id ? latestStates[device_id] : undefined;

  return { device, state };
}

/**
 * Returns all devices visible to current user, respecting farmer role scoping.
 */
export function useDeviceList() {
  const { devices, latestStates } = useDeviceStore();
  const { session } = useAuthStore();

  const visibleDevices = useMemo(() => {
    const tenantId = session?.user.tenant_id;
    const byTenant = tenantId ? devices.filter(d => d.tenant_id === tenantId) : devices;
    if (session?.user.role === 'farmer' && session.user.assigned_site_ids?.length) {
      return byTenant.filter(d => session.user.assigned_site_ids!.includes(d.site_id));
    }
    return byTenant;
  }, [devices, session]);

  return { devices: visibleDevices, latestStates };
}

/**
 * Fleet summary counts for current tenant.
 */
export function useFleetSummary() {
  const { devices, latestStates } = useDeviceStore();
  const { session } = useAuthStore();
  const tenantId = session?.user.tenant_id;

  return useMemo(() => {
    const tenantDevices = tenantId ? devices.filter(d => d.tenant_id === tenantId) : devices;
    let online = 0, offline = 0, stale = 0, faults = 0, lowBattery = 0;
    for (const d of tenantDevices) {
      const s = latestStates[d.device_id];
      if (!s) continue;
      if (s.availability === 'online') online++;
      else if (s.availability === 'offline') offline++;
      else if (s.availability === 'stale') stale++;
      if ((s.active_fault_codes?.length ?? 0) > 0) faults++;
      if (s.battery_state === 'low' || s.battery_state === 'critical') lowBattery++;
    }
    return { total: tenantDevices.length, online, offline, stale, faults, lowBattery };
  }, [devices, latestStates, tenantId]);
}
