// ============================================================
// ALERT / FAULT / EVENT STORE
// Future: AppSync subscription to Events/Faults DynamoDB tables
// ============================================================

import { create } from 'zustand';
import type { DeviceEvent, Fault } from '@/types';
import { MOCK_EVENTS, MOCK_FAULTS } from '@/mock-data/seed';

interface AlertState {
  events: DeviceEvent[];
  faults: Fault[];
  unreadCount: number;

  initialize: () => void;
  addEvent: (event: DeviceEvent) => void;
  clearFault: (fault_id: string, cleared_by: string) => void;
  getActiveFaults: (tenant_id?: string) => Fault[];
  getActiveEvents: (tenant_id?: string) => DeviceEvent[];
  getDeviceEvents: (device_id: string) => DeviceEvent[];
  getDeviceFaults: (device_id: string) => Fault[];
  markAllRead: () => void;
}

export const useAlertStore = create<AlertState>()((set, get) => ({
  events: [],
  faults: [],
  unreadCount: 0,

  initialize: () => {
    const activeCount = MOCK_FAULTS.filter(f => f.is_active).length +
      MOCK_EVENTS.filter(e => e.is_active && ['critical', 'error'].includes(e.severity)).length;
    set({
      events: MOCK_EVENTS,
      faults: MOCK_FAULTS,
      unreadCount: activeCount,
    });
  },

  addEvent: (event: DeviceEvent) => {
    set(state => ({
      events: [event, ...state.events],
      unreadCount: state.unreadCount + 1,
    }));
  },

  clearFault: (fault_id: string, cleared_by: string) => {
    set(state => ({
      faults: state.faults.map(f =>
        f.fault_id === fault_id
          ? { ...f, is_active: false, cleared_at: new Date().toISOString(), cleared_by }
          : f
      ),
    }));
  },

  getActiveFaults: (tenant_id?: string) => {
    const { faults } = get();
    return faults.filter(f => f.is_active && (!tenant_id || f.tenant_id === tenant_id));
  },

  getActiveEvents: (tenant_id?: string) => {
    const { events } = get();
    return events.filter(e => e.is_active && (!tenant_id || e.tenant_id === tenant_id));
  },

  getDeviceEvents: (device_id: string) =>
    get().events.filter(e => e.device_id === device_id).sort(
      (a, b) => new Date(b.ts_cloud).getTime() - new Date(a.ts_cloud).getTime()
    ),

  getDeviceFaults: (device_id: string) =>
    get().faults.filter(f => f.device_id === device_id),

  markAllRead: () => set({ unreadCount: 0 }),
}));
