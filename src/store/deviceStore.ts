// ============================================================
// DEVICE STORE — Latest state, telemetry, real-time updates
// Future: swap for AppSync GraphQL subscriptions
// ============================================================

import { create } from 'zustand';
import type { LatestState, Device, TelemetryHistory } from '@/types';
import { MOCK_DEVICES, MOCK_LATEST_STATE, generateTelemetryHistory } from '@/mock-data/seed';

interface DeviceState {
  devices: Device[];
  latestStates: Record<string, LatestState>;
  telemetryHistory: Record<string, TelemetryHistory[]>;
  selectedDeviceId: string | null;
  isLoading: boolean;
  lastSyncAt: string | null;

  initialize: () => void;
  updateLatestState: (device_id: string, update: Partial<LatestState>) => void;
  setSelectedDevice: (device_id: string | null) => void;
  getDeviceById: (device_id: string) => Device | undefined;
  getLatestState: (device_id: string) => LatestState | undefined;
  getDevicesForTenant: (tenant_id: string) => Device[];
  getOnlineCount: (tenant_id?: string) => number;
  getOfflineCount: (tenant_id?: string) => number;
  getFaultCount: (tenant_id?: string) => number;
  getLowBatteryCount: (tenant_id?: string) => number;
  loadTelemetryHistory: (device_id: string) => void;
}

export const useDeviceStore = create<DeviceState>()((set, get) => ({
  devices: [],
  latestStates: {},
  telemetryHistory: {},
  selectedDeviceId: null,
  isLoading: false,
  lastSyncAt: null,

  initialize: () => {
    const stateMap: Record<string, LatestState> = {};
    for (const state of MOCK_LATEST_STATE) {
      stateMap[state.device_id] = state;
    }
    set({
      devices: MOCK_DEVICES,
      latestStates: stateMap,
      lastSyncAt: new Date().toISOString(),
    });
  },

  updateLatestState: (device_id: string, update: Partial<LatestState>) => {
    set(state => ({
      latestStates: {
        ...state.latestStates,
        [device_id]: {
          ...state.latestStates[device_id],
          ...update,
          updated_at: new Date().toISOString(),
        },
      },
    }));
  },

  setSelectedDevice: (device_id: string | null) => set({ selectedDeviceId: device_id }),

  getDeviceById: (device_id: string) => get().devices.find(d => d.device_id === device_id),

  getLatestState: (device_id: string) => get().latestStates[device_id],

  getDevicesForTenant: (tenant_id: string) =>
    get().devices.filter(d => d.tenant_id === tenant_id),

  getOnlineCount: (tenant_id?: string) => {
    const { devices, latestStates } = get();
    const filtered = tenant_id ? devices.filter(d => d.tenant_id === tenant_id) : devices;
    return filtered.filter(d => latestStates[d.device_id]?.availability === 'online').length;
  },

  getOfflineCount: (tenant_id?: string) => {
    const { devices, latestStates } = get();
    const filtered = tenant_id ? devices.filter(d => d.tenant_id === tenant_id) : devices;
    return filtered.filter(d => {
      const s = latestStates[d.device_id];
      return s?.availability === 'offline' || s?.availability === 'stale';
    }).length;
  },

  getFaultCount: (tenant_id?: string) => {
    const { devices, latestStates } = get();
    const filtered = tenant_id ? devices.filter(d => d.tenant_id === tenant_id) : devices;
    return filtered.filter(d => {
      const s = latestStates[d.device_id];
      return s?.active_fault_codes && s.active_fault_codes.length > 0;
    }).length;
  },

  getLowBatteryCount: (tenant_id?: string) => {
    const { devices, latestStates } = get();
    const filtered = tenant_id ? devices.filter(d => d.tenant_id === tenant_id) : devices;
    return filtered.filter(d => {
      const s = latestStates[d.device_id];
      return s?.battery_state === 'low' || s?.battery_state === 'critical';
    }).length;
  },

  loadTelemetryHistory: (device_id: string) => {
    const device = get().devices.find(d => d.device_id === device_id);
    if (!device) return;
    const history = generateTelemetryHistory(device_id, device.tenant_id, device.site_id, 48);
    set(state => ({
      telemetryHistory: { ...state.telemetryHistory, [device_id]: history },
    }));
  },
}));
