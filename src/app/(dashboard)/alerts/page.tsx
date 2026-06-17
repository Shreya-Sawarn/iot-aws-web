'use client';

import { useState } from 'react';
import { useAlertStore } from '@/store/alertStore';
import { useDeviceStore } from '@/store/deviceStore';
import { useAuthStore } from '@/store/authStore';
import { SeverityBadge } from '@/components/ui/StatusBadge';
import { FAULT_CODE_MESSAGES, EVENT_CODE_MESSAGES, REASON_CODE_MESSAGES } from '@/constants/enums';
import { formatRelativeTime, formatDateTime } from '@/utils/format';
import { AlertTriangle, Bell, CheckCircle, Filter, Radio } from 'lucide-react';
import { cn } from '@/utils/cn';
import Link from 'next/link';

type Tab = 'faults' | 'events';

export default function AlertsPage() {
  const [tab, setTab] = useState<Tab>('faults');
  const [showCleared, setShowCleared] = useState(false);
  const { session } = useAuthStore();
  const { faults, events, clearFault } = useAlertStore();
  const { devices } = useDeviceStore();

  const tenantId = session?.user.tenant_id;

  const filteredFaults = faults
    .filter(f => !tenantId || f.tenant_id === tenantId)
    .filter(f => showCleared || f.is_active)
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });

  const filteredEvents = events
    .filter(e => !tenantId || e.tenant_id === tenantId)
    .filter(e => showCleared || e.is_active)
    .sort((a, b) => new Date(b.ts_cloud).getTime() - new Date(a.ts_cloud).getTime());

  const activeFaultCount = faults.filter(f => f.is_active && (!tenantId || f.tenant_id === tenantId)).length;
  const activeEventCount = events.filter(e => e.is_active && (!tenantId || e.tenant_id === tenantId)).length;

  function getDeviceName(device_id: string) {
    return devices.find(d => d.device_id === device_id)?.device_name ?? device_id;
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Faults', value: activeFaultCount, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
          { label: 'Active Events', value: activeEventCount, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
          { label: 'Critical Faults', value: faults.filter(f => f.is_active && f.severity === 'critical' && (!tenantId || f.tenant_id === tenantId)).length, color: 'text-red-600', bg: 'bg-red-600/10 border-red-600/20' },
          { label: 'Resolved Today', value: faults.filter(f => !f.is_active && f.cleared_at && new Date(f.cleared_at) > new Date(Date.now() - 86400000) && (!tenantId || f.tenant_id === tenantId)).length, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn('rounded-xl border p-4', bg)}>
            <div className="text-2xl font-bold mb-0.5" style={{ color: color.replace('text-', '') }}>
              <span className={color}>{value}</span>
            </div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-xl overflow-hidden border border-slate-700/50 bg-[#111827]">
          <button
            onClick={() => setTab('faults')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all',
              tab === 'faults' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-white'
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Faults ({filteredFaults.length})
          </button>
          <button
            onClick={() => setTab('events')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all border-l border-slate-700/50',
              tab === 'events' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-white'
            )}
          >
            <Bell className="w-3.5 h-3.5" />
            Events ({filteredEvents.length})
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showCleared}
            onChange={e => setShowCleared(e.target.checked)}
            className="rounded accent-blue-500"
          />
          Show cleared/resolved
        </label>
      </div>

      {/* Faults */}
      {tab === 'faults' && (
        <div className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
          {filteredFaults.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-500/40" />
              <div>No active faults {!showCleared ? '— system healthy' : ''}</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/40">
              {filteredFaults.map(fault => (
                <div key={fault.fault_id} className={cn(
                  'p-4 transition-colors hover:bg-slate-800/20',
                  !fault.is_active ? 'opacity-60' : ''
                )}>
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <SeverityBadge severity={fault.severity} />
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-bold text-white break-all">{fault.fault_code}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{fault.description}</div>
                        {FAULT_CODE_MESSAGES[fault.fault_code] && (
                          <div className="text-[11px] text-slate-500 mt-1">{FAULT_CODE_MESSAGES[fault.fault_code]}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {fault.is_active ? (
                        <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[11px] font-medium border border-red-500/25">ACTIVE</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[11px] font-medium border border-emerald-500/25">CLEARED</span>
                      )}
                      {fault.is_active && (
                        <button
                          onClick={() => clearFault(fault.fault_id, session?.user.user_id ?? 'unknown')}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50 transition-all"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-500">
                    <Link href={`/devices/${fault.device_id}`} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                      <Radio className="w-3 h-3" />
                      {getDeviceName(fault.device_id)}
                    </Link>
                    <span>Detected {formatRelativeTime(fault.detected_at)}</span>
                    {fault.cleared_at && <span>Cleared {formatRelativeTime(fault.cleared_at)}</span>}
                    {fault.cleared_by && <span>by {fault.cleared_by}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Events */}
      {tab === 'events' && (
        <div className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
          {filteredEvents.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Bell className="w-10 h-10 mx-auto mb-3 text-slate-700" />
              <div>No events recorded</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/40">
              {filteredEvents.map(event => (
                <div key={event.event_id} className="p-4 hover:bg-slate-800/20 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <SeverityBadge severity={event.severity} />
                      <div>
                        <div className="text-xs font-semibold text-white">{event.event_code.replace(/^EVT_/, '').replace(/_/g, ' ')}</div>
                        <div className="text-[10px] font-mono text-slate-500">{event.event_code}</div>
                        {EVENT_CODE_MESSAGES[event.event_code] && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{EVENT_CODE_MESSAGES[event.event_code]}</div>
                        )}
                        {(event.state_before || event.state_after) && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {event.state_before && <span>{event.state_before}</span>}
                            {event.state_before && event.state_after && <span className="mx-1">→</span>}
                            {event.state_after && <span>{event.state_after}</span>}
                          </div>
                        )}
                        {event.reason_code && (
                          <div className="text-[11px] text-orange-400 mt-0.5">{REASON_CODE_MESSAGES[event.reason_code]}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 shrink-0">{formatRelativeTime(event.ts_cloud)}</div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                    <Link href={`/devices/${event.device_id}`} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                      <Radio className="w-3 h-3" />
                      {getDeviceName(event.device_id)}
                    </Link>
                    <span>{formatDateTime(event.ts_cloud)}</span>
                    {!event.is_active && <span className="text-emerald-400">Cleared</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
