'use client';

import { useDeviceStore } from '@/store/deviceStore';
import { useAlertStore } from '@/store/alertStore';
import { useAuthStore } from '@/store/authStore';
import { useSimulatorStore } from '@/store/simulatorStore';
import { MOCK_WEATHER, MOCK_SITES } from '@/mock-data/seed';
import { AvailabilityBadge, SeverityBadge } from '@/components/ui/StatusBadge';
import { formatRelativeTime, formatBatteryV } from '@/utils/format';
import { IRRIGATION_ADVISORY_LABELS } from '@/constants/enums';
import {
  Radio, Wifi, WifiOff, AlertTriangle, Battery,
  CloudRain, Activity, ArrowRight, Clock, Signal
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/cn';
import type { SimulatorMode } from '@/types';

function StatCard({ label, value, sub, icon: Icon, color, href }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; href?: string;
}) {
  const content = (
    <div className={cn(
      'bg-[#111827] border rounded-xl p-4 flex items-start gap-4 transition-all duration-200',
      href ? 'cursor-pointer hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/5 card-hover' : '',
      'border-slate-800/60'
    )}>
      <div className={cn('p-2.5 rounded-lg', color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 mb-0.5">{label}</div>
        <div className="text-2xl font-bold text-white">{value}</div>
        {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const SIM_MODES: { value: SimulatorMode; label: string; desc: string }[] = [
  { value: 'demo_mode', label: 'Demo', desc: 'Stable, rare drops' },
  { value: 'dev_mode', label: 'Dev', desc: 'More LTE variation' },
  { value: 'fault_mode', label: 'Fault', desc: 'Frequent faults' },
  { value: 'test_mode', label: 'Test', desc: 'Deterministic' },
];

export default function DashboardPage() {
  const { session } = useAuthStore();
  const { devices, latestStates } = useDeviceStore();
  const { faults, events } = useAlertStore();
  const { isRunning, mode, eventLog, setMode, startSimulator, stopSimulator } = useSimulatorStore();

  const tenantId = session?.user.tenant_id;
  const tenantDevices = (() => {
    const byTenant = tenantId ? devices.filter(d => d.tenant_id === tenantId) : devices;
    if (session?.user.role === 'farmer' && session.user.assigned_site_ids?.length) {
      return byTenant.filter(d => session.user.assigned_site_ids!.includes(d.site_id));
    }
    return byTenant;
  })();

  const onlineCount = tenantDevices.filter(d => latestStates[d.device_id]?.availability === 'online').length;
  const staleCount = tenantDevices.filter(d => latestStates[d.device_id]?.availability === 'stale').length;
  const offlineCount = tenantDevices.filter(d => {
    const s = latestStates[d.device_id];
    return s?.availability === 'offline' || s?.availability === 'stale';
  }).length;
  const activeFaults = faults.filter(f => f.is_active && (!tenantId || f.tenant_id === tenantId));
  const lowBattery = tenantDevices.filter(d => {
    const s = latestStates[d.device_id];
    return s?.battery_state === 'low' || s?.battery_state === 'critical';
  });
  const manualActiveCount = tenantDevices.filter(d => latestStates[d.device_id]?.manual_active).length;

  const tenantWeather = MOCK_WEATHER.filter(w => !tenantId || w.tenant_id === tenantId)[0];
  const recentEvents = events
    .filter(e => !tenantId || e.tenant_id === tenantId)
    .sort((a, b) => new Date(b.ts_cloud).getTime() - new Date(a.ts_cloud).getTime())
    .slice(0, 6);

  const recentSimEvents = eventLog.slice(0, 8);

  const userName = session?.user.user_name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  function handleModeChange(newMode: SimulatorMode) {
    if (newMode === mode && isRunning) return;
    setMode(newMode);
    if (!isRunning) startSimulator(newMode);
  }

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">{greeting}, {userName}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {/* Simulator Mode Switcher */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Simulator Mode</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SIM_MODES.map(m => (
              <button
                key={m.value}
                onClick={() => handleModeChange(m.value)}
                title={m.desc}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all',
                  mode === m.value && isRunning
                    ? 'bg-blue-600/25 text-blue-300 border-blue-500/40'
                    : 'bg-slate-800/50 text-slate-400 border-slate-700/40 hover:text-slate-200 hover:border-slate-600/50'
                )}
              >
                {mode === m.value && isRunning && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                )}
                {m.label}
              </button>
            ))}
            <button
              onClick={() => isRunning ? stopSimulator() : startSimulator(mode)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all',
                isRunning
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
              )}
            >
              {isRunning ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Devices Online"
          value={onlineCount}
          sub={`of ${tenantDevices.length} total`}
          icon={Wifi}
          color="bg-emerald-500/20 text-emerald-400"
          href="/devices"
        />
        <StatCard
          label="Offline / Stale"
          value={offlineCount}
          sub={staleCount > 0 ? `${staleCount} stale · need attention` : 'need attention'}
          icon={WifiOff}
          color="bg-red-500/20 text-red-400"
          href="/devices?filter=offline"
        />
        <StatCard
          label="Active Faults"
          value={activeFaults.length}
          sub={activeFaults.filter(f => f.severity === 'critical').length + ' critical'}
          icon={AlertTriangle}
          color="bg-orange-500/20 text-orange-400"
          href="/alerts"
        />
        <StatCard
          label="Low Battery"
          value={lowBattery.length}
          sub="devices need battery check"
          icon={Battery}
          color="bg-yellow-500/20 text-yellow-400"
          href="/devices?filter=low_battery"
        />
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device Status List */}
        <div className="lg:col-span-2 bg-[#111827] border border-slate-800/60 rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-400" />
              Device Overview
            </h3>
            <Link href="/devices" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-800/40">
            {tenantDevices.slice(0, 5).map(device => {
              const state = latestStates[device.device_id];
              if (!state) return null;
              return (
                <Link
                  key={device.device_id}
                  href={`/devices/${device.device_id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="relative">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                      state.availability === 'online' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-slate-500'
                    )}>
                      {device.device_id.replace('D', '')}
                    </div>
                    {state.availability === 'online' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#111827]" />
                    )}
                    {state.availability === 'stale' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-yellow-400 border-2 border-[#111827]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{device.device_name}</div>
                    <div className="text-[11px] text-slate-500">{device.device_id} · {MOCK_SITES.find(s => s.site_id === device.site_id)?.site_name}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[140px] sm:max-w-none">
                    <AvailabilityBadge state={state.availability} />
                    {state.manual_active && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded border bg-orange-500/10 text-orange-400 border-orange-500/20 font-medium hidden sm:inline">MANUAL</span>
                    )}
                    {(state.active_fault_codes?.length ?? 0) > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded border bg-red-500/10 text-red-400 border-red-500/20 font-medium">FAULT</span>
                    )}
                    <div className="text-xs text-slate-500 hidden sm:block">{formatBatteryV(state.battery_v)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Weather card */}
          {tenantWeather && (
            <Link href="/weather" className="block">
              <div className="bg-[#111827] border border-slate-800/60 rounded-xl p-4 hover:border-blue-500/30 transition-all">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <CloudRain className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-white">Weather Advisory</h3>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                </div>
                <div className="text-xs text-slate-400 mb-3 leading-relaxed">{tenantWeather.weather_description}</div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-slate-800/40 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-500">Rain Probability</div>
                    <div className="text-lg font-bold text-blue-400">{tenantWeather.rain_probability_pct}%</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-500">Forecast</div>
                    <div className="text-lg font-bold text-blue-400">{tenantWeather.rain_forecast_mm}mm</div>
                  </div>
                </div>
                <div className={cn(
                  'px-3 py-2 rounded-lg border text-xs font-medium',
                  tenantWeather.irrigation_advisory === 'proceed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                  tenantWeather.irrigation_advisory === 'caution' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                  tenantWeather.irrigation_advisory === 'hold' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                  'bg-red-500/10 border-red-500/20 text-red-400'
                )}>
                  <div className="font-semibold">{IRRIGATION_ADVISORY_LABELS[tenantWeather.irrigation_advisory]}</div>
                  {tenantWeather.advisory_reason && <div className="opacity-80 mt-0.5">{tenantWeather.advisory_reason}</div>}
                </div>
                <p className="text-[10px] text-slate-600 mt-2">
                  Advisory only — weather does not auto-control irrigation
                </p>
              </div>
            </Link>
          )}

          {/* Quick stats */}
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              Quick Stats
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Manual Override</span>
                <span className={cn('text-xs font-semibold', manualActiveCount > 0 ? 'text-orange-400' : 'text-slate-400')}>
                  {manualActiveCount} device{manualActiveCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Stale Devices</span>
                <span className={cn('text-xs font-semibold', staleCount > 0 ? 'text-yellow-400' : 'text-slate-400')}>
                  {staleCount} device{staleCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Critical Battery</span>
                <span className={cn('text-xs font-semibold', lowBattery.filter(d => latestStates[d.device_id]?.battery_state === 'critical').length > 0 ? 'text-red-400' : 'text-slate-400')}>
                  {lowBattery.filter(d => latestStates[d.device_id]?.battery_state === 'critical').length} device{lowBattery.filter(d => latestStates[d.device_id]?.battery_state === 'critical').length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Total Faults</span>
                <span className={cn('text-xs font-semibold', activeFaults.length > 0 ? 'text-orange-400' : 'text-emerald-400')}>
                  {activeFaults.length} active
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Fleet Size</span>
                <span className="text-xs font-semibold text-white">{tenantDevices.length} devices</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            Recent Events
          </h3>
          <Link href="/alerts" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {recentEvents.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">No events recorded</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {recentEvents.map(event => (
              <Link key={event.event_id} href={`/devices/${event.device_id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/20 transition-colors">
                <SeverityBadge severity={event.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200">{event.event_code.replace(/^EVT_/, '').replace(/_/g, ' ')}</div>
                  <div className="text-[11px] text-slate-500">{event.device_id}</div>
                </div>
                <div className="text-[11px] text-slate-500 shrink-0">{formatRelativeTime(event.ts_cloud)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* LTE Simulator Activity */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Signal className="w-4 h-4 text-emerald-400" />
            LTE Simulator Activity
            <span className="text-[10px] text-slate-500 font-normal">Real-time MQTT feed</span>
          </h3>
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border',
            isRunning
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          )}>
            {isRunning ? `LIVE · ${mode.replace('_', ' ')}` : 'STOPPED'}
          </span>
        </div>
        <div className="px-4 py-2 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
          {recentSimEvents.length === 0 ? (
            <div className="py-4 text-slate-500 text-center">
              {isRunning ? 'Starting simulator...' : 'Simulator stopped. Click Start above.'}
            </div>
          ) : (
            recentSimEvents.map((evt, i) => (
              <div key={i} className="flex items-start gap-3 py-1">
                <span className="text-slate-600 shrink-0">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                <span className={cn(
                  'shrink-0 min-w-[90px]',
                  evt.type === 'telemetry' ? 'text-blue-400' :
                  evt.type === 'lte_disconnect' ? 'text-red-400' :
                  evt.type === 'lte_connect' ? 'text-emerald-400' :
                  evt.type === 'ack' ? 'text-purple-400' : 'text-yellow-400'
                )}>{evt.type.toUpperCase()}</span>
                <span className="text-slate-400">{evt.device_id}</span>
                {evt.type === 'telemetry' && evt.payload && (
                  <span className="text-slate-500">
                    valve={(evt.payload as import('@/types').TelemetryPayload).valve_state}
                    {' '}sig={(evt.payload as import('@/types').TelemetryPayload).signal_strength?.toFixed(0)}%
                    {' '}bat={(evt.payload as import('@/types').TelemetryPayload).battery_v?.toFixed(1)}V
                  </span>
                )}
                {evt.type === 'ack' && evt.payload && (
                  <span className="text-purple-300">
                    stage={(evt.payload as import('@/types').AckPayload).ack_stage}
                  </span>
                )}
                {(evt.type === 'lte_connect' || evt.type === 'lte_disconnect') && (
                  <span className={evt.type === 'lte_connect' ? 'text-emerald-300' : 'text-red-300'}>
                    {evt.type === 'lte_connect' ? '↑ reconnected' : '↓ disconnected'}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
