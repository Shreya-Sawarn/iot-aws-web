'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useDeviceStore } from '@/store/deviceStore';
import { useAuthStore } from '@/store/authStore';
import { MOCK_SITES } from '@/mock-data/seed';
import { AvailabilityBadge, ValveStateBadge, BatteryBadge } from '@/components/ui/StatusBadge';
import { formatRelativeTime, formatBatteryV, formatSignal, formatPosition } from '@/utils/format';
import { Search, Radio, ArrowRight, Filter, Signal, Battery, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { AvailabilityState } from '@/types';

type FilterType = 'all' | 'online' | 'offline' | 'fault' | 'manual' | 'low_battery';

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All Devices' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline / Stale' },
  { value: 'fault', label: 'Has Fault' },
  { value: 'manual', label: 'Manual Active' },
  { value: 'low_battery', label: 'Low Battery' },
];

function SignalBars({ strength }: { strength: number }) {
  const bars = strength >= 75 ? 4 : strength >= 50 ? 3 : strength >= 25 ? 2 : strength > 0 ? 1 : 0;
  return (
    <div className="flex items-end gap-0.5">
      {[1, 2, 3, 4].map(b => (
        <div key={b} className={cn(
          'rounded-sm',
          b === 1 ? 'w-1 h-1.5' : b === 2 ? 'w-1 h-2.5' : b === 3 ? 'w-1 h-3.5' : 'w-1 h-4.5',
          b <= bars ? 'bg-emerald-400' : 'bg-slate-700'
        )} />
      ))}
    </div>
  );
}

export default function DevicesPage() {
  const { session } = useAuthStore();
  const { devices, latestStates } = useDeviceStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const tenantId = session?.user.tenant_id;
  const tenantDevices = useMemo(() => {
    const byTenant = tenantId ? devices.filter(d => d.tenant_id === tenantId) : devices;
    // Farmer role: restrict to assigned sites only
    if (session?.user.role === 'farmer' && session.user.assigned_site_ids?.length) {
      return byTenant.filter(d => session.user.assigned_site_ids!.includes(d.site_id));
    }
    return byTenant;
  }, [devices, tenantId, session]);

  const filtered = useMemo(() => {
    return tenantDevices.filter(device => {
      const state = latestStates[device.device_id];
      if (!state) return filter === 'all';

      // Text search
      const q = search.toLowerCase();
      if (q && !device.device_name.toLowerCase().includes(q) &&
          !device.device_id.toLowerCase().includes(q) &&
          !device.dsn.toLowerCase().includes(q)) {
        return false;
      }

      // Filter
      if (filter === 'online') return state.availability === 'online';
      if (filter === 'offline') return state.availability === 'offline' || state.availability === 'stale';
      if (filter === 'fault') return (state.active_fault_codes?.length ?? 0) > 0;
      if (filter === 'manual') return state.manual_active;
      if (filter === 'low_battery') return state.battery_state === 'low' || state.battery_state === 'critical';
      return true;
    });
  }, [tenantDevices, latestStates, search, filter]);

  const counts = useMemo(() => ({
    all: tenantDevices.length,
    online: tenantDevices.filter(d => latestStates[d.device_id]?.availability === 'online').length,
    offline: tenantDevices.filter(d => { const s = latestStates[d.device_id]; return s?.availability === 'offline' || s?.availability === 'stale'; }).length,
    fault: tenantDevices.filter(d => (latestStates[d.device_id]?.active_fault_codes?.length ?? 0) > 0).length,
    manual: tenantDevices.filter(d => latestStates[d.device_id]?.manual_active).length,
    low_battery: tenantDevices.filter(d => { const s = latestStates[d.device_id]; return s?.battery_state === 'low' || s?.battery_state === 'critical'; }).length,
  }), [tenantDevices, latestStates]);

  return (
    <div className="space-y-4 fade-in">
      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, or serial..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#111827] border border-slate-800/60 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                filter === opt.value
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:border-slate-600/50'
              )}
            >
              {opt.label}
              {(counts[opt.value] ?? 0) > 0 && (
                <span className="ml-1.5 opacity-60">{counts[opt.value]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="text-xs text-slate-500">
        {filtered.length} device{filtered.length !== 1 ? 's' : ''} {filter !== 'all' ? `(${FILTER_OPTIONS.find(f => f.value === filter)?.label})` : ''}
      </div>

      {/* Device Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(device => {
          const state = latestStates[device.device_id];
          if (!state) return null;
          const site = MOCK_SITES.find(s => s.site_id === device.site_id);
          const hasFault = (state.active_fault_codes?.length ?? 0) > 0;

          return (
            <Link key={device.device_id} href={`/devices/${device.device_id}`}>
              <div className={cn(
                'bg-[#111827] border rounded-xl p-4 transition-all duration-200 hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/5 card-hover',
                hasFault ? 'border-red-500/30' : 'border-slate-800/60'
              )}>
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                      state.availability === 'online' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-slate-500'
                    )}>
                      <Radio className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{device.device_name}</div>
                      <div className="text-[11px] text-slate-500">{device.device_id} · {site?.site_name ?? device.site_id}</div>
                    </div>
                  </div>
                  <AvailabilityBadge state={state.availability} />
                </div>

                {/* Valve state + position */}
                <div className="flex items-center gap-2 mb-3">
                  <ValveStateBadge state={state.valve_state} />
                  {state.valve_position_pct !== undefined && (
                    <span className="text-xs text-slate-400">{formatPosition(state.valve_position_pct)} open</span>
                  )}
                  {state.manual_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-orange-500/10 text-orange-400 border-orange-500/20 font-medium ml-auto">MANUAL</span>
                  )}
                </div>

                {/* Metrics row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Battery className={cn('w-3.5 h-3.5', state.battery_state === 'good' ? 'text-emerald-400' : state.battery_state === 'low' ? 'text-yellow-400' : 'text-red-400')} />
                      <span className="text-xs text-slate-400">{formatBatteryV(state.battery_v)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <SignalBars strength={state.signal_strength} />
                      <span className="text-xs text-slate-400">{formatSignal(state.signal_strength)}</span>
                    </div>
                  </div>
                  {hasFault && (
                    <div className="flex items-center gap-1 text-[11px] text-red-400">
                      <AlertTriangle className="w-3 h-3" />
                      {state.active_fault_codes?.length} fault{(state.active_fault_codes?.length ?? 0) !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {/* Last seen */}
                <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Last seen {formatRelativeTime(state.last_seen_at)}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Radio className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <div className="text-slate-500">No devices match your search/filter</div>
        </div>
      )}
    </div>
  );
}
