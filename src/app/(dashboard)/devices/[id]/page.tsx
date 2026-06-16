'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useDeviceStore } from '@/store/deviceStore';
import { useCommandStore } from '@/store/commandStore';
import { useAlertStore } from '@/store/alertStore';
import { useAuthStore } from '@/store/authStore';
import { MOCK_SITES } from '@/mock-data/seed';
import { getSimulator } from '@/simulator/lteSimulator';
import { AvailabilityBadge, ValveStateBadge, AckStageBadge, BatteryBadge, SeverityBadge } from '@/components/ui/StatusBadge';
import { formatRelativeTime, formatDateTime, formatBatteryV, formatPosition, formatDurationMs } from '@/utils/format';
import {
  FAULT_CODE_MESSAGES, REASON_CODE_MESSAGES, COMMAND_TYPE_LABELS, ACK_STAGE_LABELS
} from '@/constants/enums';
import {
  ArrowLeft, Radio, Battery, Signal, Activity, Terminal,
  CheckCircle2, XCircle, Clock, AlertTriangle, Zap, Settings, Thermometer,
  ToggleLeft, ToggleRight, Wrench, RefreshCw, Wifi
} from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import type { CommandType, AckStage, UserRole } from '@/types';
import type { CommandAck } from '@/types';
import Link from 'next/link';

// Roles that may issue commands
const COMMAND_ROLES: UserRole[] = [
  'founder_admin', 'manufacturer_admin', 'municipal_operator',
  'taluk_manager', 'farmer', 'service_technician',
];

function MetricCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="bg-slate-800/40 rounded-xl p-3.5 border border-slate-700/40">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn('w-3.5 h-3.5', color)} />
        <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── ACK TIMELINE ─────────────────────────────────────────────
// Maps which failure ACK stages are "failures at" each timeline step:
//   Step 2 (Accepted): blocked / rejected mean never accepted
//   Step 4 (Done):     failed / timeout / safety_stopped mean completed with failure
const STEP_FAILURE_STAGES: Record<number, AckStage[]> = {
  1: ['blocked', 'rejected'],
  3: ['failed', 'timeout', 'safety_stopped'],
};

function AckTimeline({ cmd, acks }: { cmd: { current_ack_stage: AckStage }, acks: CommandAck[] }) {
  const steps: { key: AckStage; label: string }[] = [
    { key: 'command_requested', label: 'Requested' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'executing', label: 'Executing' },
    { key: 'completed', label: 'Done' },
  ];

  const isTerminalFail = ['rejected', 'failed', 'blocked', 'timeout', 'safety_stopped'].includes(cmd.current_ack_stage);
  const isSuccess = cmd.current_ack_stage === 'completed';

  return (
    <div className="mt-3">
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const reached = acks.some(a => a.ack_stage === step.key);
          const failedHere = STEP_FAILURE_STAGES[i]?.includes(cmd.current_ack_stage);
          const isCurrent = cmd.current_ack_stage === step.key && !isTerminalFail;
          const isSuccessHere = isSuccess && step.key === 'completed';

          let circleClass = 'bg-slate-700 text-slate-500';
          let icon: string | number = i + 1;

          if (failedHere) {
            circleClass = 'bg-red-500 text-white';
            icon = '✗';
          } else if (isSuccessHere) {
            circleClass = 'bg-emerald-500 text-white';
            icon = '✓';
          } else if (reached && !isTerminalFail) {
            circleClass = 'bg-blue-500 text-white';
          } else if (reached && isTerminalFail && !failedHere) {
            circleClass = 'bg-blue-500 text-white';
          } else if (isCurrent) {
            circleClass = 'bg-blue-400 text-white animate-pulse';
          }

          const lineActive = reached && !failedHere && i < 3;

          return (
            <div key={step.key} className="flex items-center flex-1">
              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-all', circleClass)}>
                {icon}
              </div>
              {i < 3 && (
                <div className={cn('flex-1 h-0.5', lineActive ? 'bg-blue-500' : 'bg-slate-700')} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        {steps.map((s, i) => {
          const failedHere = STEP_FAILURE_STAGES[i]?.includes(cmd.current_ack_stage);
          return (
            <span key={s.key} className={cn('text-[10px] text-center', failedHere ? 'text-red-400 font-medium' : 'text-slate-600')} style={{ width: '25%' }}>
              {failedHere ? ACK_STAGE_LABELS[cmd.current_ack_stage] : s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: deviceId } = use(params);
  const router = useRouter();
  const { session, hasRole } = useAuthStore();
  const { devices, latestStates, telemetryHistory, loadTelemetryHistory } = useDeviceStore();
  const { submitCommand, getCommandsByDevice, getCommandAcks, getActiveCommand, isSubmitting } = useCommandStore();
  const { getDeviceFaults, getDeviceEvents } = useAlertStore();

  const [targetPosition, setTargetPosition] = useState(50);
  const [activeTab, setActiveTab] = useState<'overview' | 'commands' | 'events' | 'charts'>('overview');
  const [commandSuccess, setCommandSuccess] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const device = devices.find(d => d.device_id === deviceId);
  const state = latestStates[deviceId];
  const commands = getCommandsByDevice(deviceId);
  const activeCommand = getActiveCommand(deviceId);
  const deviceFaults = getDeviceFaults(deviceId);
  const deviceEvents = getDeviceEvents(deviceId);
  const history = telemetryHistory[deviceId] ?? [];
  const site = device ? MOCK_SITES.find(s => s.site_id === device.site_id) : null;

  // Role-based command permission
  const canSendCommands = hasRole(COMMAND_ROLES);
  const isOnline = state?.availability === 'online';
  const positionValid = state?.position_confidence === 'valid';
  const canCommand = isOnline && !state?.manual_active && !state?.wet_active && !isSubmitting && !activeCommand && canSendCommands;
  const canSetPosition = canCommand && positionValid;
  const hasFault = (state?.active_fault_codes?.length ?? 0) > 0;
  const isStale = state?.stale_flag;

  useEffect(() => {
    if (deviceId) loadTelemetryHistory(deviceId);
  }, [deviceId, loadTelemetryHistory]);

  async function handleCommand(type: CommandType) {
    if (!device || !session) return;
    setCommandSuccess(null);

    const command_id = await submitCommand({
      tenant_id: device.tenant_id,
      site_id: device.site_id,
      device_id: deviceId,
      command_type: type,
      issued_by: session.user.user_id,
      target_position_pct: type === 'set_position' ? targetPosition : undefined,
    });

    const checkInterval = setInterval(() => {
      const cmds = getCommandsByDevice(deviceId);
      const cmd = cmds.find(c => c.command_id === command_id);
      if (cmd && ['completed', 'failed', 'rejected', 'blocked', 'timeout', 'safety_stopped'].includes(cmd.current_ack_stage)) {
        clearInterval(checkInterval);
        if (cmd.current_ack_stage === 'completed') setCommandSuccess(command_id);
      }
    }, 500);
    setTimeout(() => clearInterval(checkInterval), 60000);
  }

  function toggleManualOverride() {
    if (!state) return;
    getSimulator().setManualOverride(deviceId, !state.manual_active);
  }

  function toggleWetActive() {
    if (!state) return;
    getSimulator().setWetActive(deviceId, !state.wet_active);
  }

  if (!device || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Radio className="w-12 h-12 mb-3 text-slate-700" />
        <div>Device {deviceId} not found</div>
        <Link href="/devices" className="text-blue-400 text-sm mt-2">← Back to devices</Link>
      </div>
    );
  }

  const chartData = history.map(h => ({
    time: new Date(h.ts_device).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    position: h.valve_position_pct,
    battery: h.battery_v,
    signal: h.signal_strength,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-4 fade-in">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">{device.device_name}</h2>
              <div className="text-sm text-slate-500 mt-0.5">{device.device_id} · {device.dsn} · {site?.site_name}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <AvailabilityBadge state={state.availability} size="md" />
              {isStale && (
                <span className="px-2.5 py-1 text-xs rounded-lg border bg-yellow-500/10 text-yellow-400 border-yellow-500/20 font-medium">
                  STALE {state.stale_age_sec ? `(${Math.floor(state.stale_age_sec / 60)}m ago)` : ''}
                </span>
              )}
              {state.manual_active && (
                <span className="px-2.5 py-1 text-xs rounded-lg border bg-orange-500/10 text-orange-400 border-orange-500/20 font-medium">MANUAL OVERRIDE</span>
              )}
              {state.wet_active && (
                <span className="px-2.5 py-1 text-xs rounded-lg border bg-blue-500/10 text-blue-400 border-blue-500/20 font-medium">WET ACTIVE</span>
              )}
              {hasFault && (
                <span className="px-2.5 py-1 text-xs rounded-lg border bg-red-500/10 text-red-400 border-red-500/20 font-medium">FAULT ACTIVE</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stale warning banner */}
      {isStale && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-yellow-400">Device data is stale</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Last seen {formatRelativeTime(state.last_seen_at)}. The device may be offline or unreachable. Displayed values may not reflect current conditions.
            </div>
          </div>
        </div>
      )}

      {/* Role restriction notice */}
      {!canSendCommands && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
          <AlertTriangle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div className="text-xs text-slate-400">
            Your role <strong className="text-slate-300">({session?.user.role})</strong> is read-only. Command panel is visible but commands are disabled.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left — Telemetry + Tabs */}
        <div className="xl:col-span-2 space-y-4">
          {/* Live Metrics */}
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Live Telemetry
              <span className="text-[10px] text-slate-500 font-normal">Updated {formatRelativeTime(state.last_seen_at)}</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              <MetricCard label="Valve State" value={state.valve_state.toUpperCase()} icon={Zap} color="text-blue-400" />
              <MetricCard
                label="Position"
                value={formatPosition(state.valve_position_pct)}
                icon={Settings}
                color="text-purple-400"
                sub={`Confidence: ${state.position_confidence}`}
              />
              <MetricCard
                label="Battery"
                value={formatBatteryV(state.battery_v)}
                icon={Battery}
                color={state.battery_state === 'good' ? 'text-emerald-400' : state.battery_state === 'low' ? 'text-yellow-400' : 'text-red-400'}
                sub={state.battery_state}
              />
              <MetricCard label="Signal" value={`${Math.round(state.signal_strength)}%`} icon={Signal} color="text-cyan-400" sub="LTE strength" />
              {state.motor_current_a !== undefined && (
                <MetricCard label="Motor Current" value={`${state.motor_current_a.toFixed(2)}A`} icon={Zap} color="text-orange-400" />
              )}
              <MetricCard
                label="Firmware"
                value={state.firmware_state}
                icon={Terminal}
                color={state.firmware_state === 'healthy' ? 'text-emerald-400' : 'text-orange-400'}
                sub={state.fw_version}
              />
            </div>

            {/* Position confidence warning */}
            {state.position_confidence !== 'valid' && state.position_confidence !== 'initialising' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span className="text-xs text-yellow-400">
                  Position confidence: <strong>{state.position_confidence}</strong> — Set Position command disabled
                </span>
              </div>
            )}

            {/* Safety flags */}
            {(state.manual_active || state.wet_active) && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {state.manual_active && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 flex-1 min-w-[200px]">
                    <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-orange-400">Manual Override Active</div>
                      <div className="text-[11px] text-slate-500">Remote commands (open/close/position) are blocked</div>
                    </div>
                  </div>
                )}
                {state.wet_active && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 flex-1 min-w-[200px]">
                    <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-blue-400">Wet Ingress Detected</div>
                      <div className="text-[11px] text-slate-500">All commands blocked for safety</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Active faults */}
            {hasFault && (
              <div className="mt-3 space-y-2">
                {state.active_fault_codes?.map(fc => (
                  <div key={fc} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-mono font-semibold text-red-400">{fc}</div>
                      <div className="text-[11px] text-slate-400">{FAULT_CODE_MESSAGES[fc]}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl">
            <div className="flex border-b border-slate-800/60">
              {(['overview', 'commands', 'events', 'charts'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-4 py-3 text-xs font-medium capitalize transition-all border-b-2',
                    activeTab === tab
                      ? 'text-blue-400 border-blue-500'
                      : 'text-slate-500 border-transparent hover:text-slate-300'
                  )}
                >
                  {tab === 'commands' ? `Commands (${commands.length})` :
                   tab === 'events' ? `Events (${deviceEvents.length})` : tab}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Device Info</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    ['Device ID', device.device_id],
                    ['Serial (DSN)', device.dsn],
                    ['Product', device.product_variant],
                    ['HW Revision', device.hw_revision],
                    ['FW Baseline', device.fw_baseline_id],
                    ['Site', site?.site_name ?? device.site_id],
                    ['Commissioned', device.commissioning_date ?? 'N/A'],
                    ['Provisioning', device.provisioning_state],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-slate-800/30 rounded-lg p-2.5">
                      <div className="text-slate-500 mb-0.5">{k}</div>
                      <div className="text-white font-medium truncate">{v}</div>
                    </div>
                  ))}
                </div>
                {device.sensor_fitted_map && (
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Fitted Sensors</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(device.sensor_fitted_map).map(([sensor, fitted]) => (
                        <span key={sensor} className={cn(
                          'px-2.5 py-1 rounded-lg border text-xs font-medium',
                          fitted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700/40 text-slate-500 border-slate-700/40'
                        )}>
                          {sensor.replace(/_/g, ' ')} {fitted ? '✓' : '—'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Commands Tab */}
            {activeTab === 'commands' && (
              <div className="divide-y divide-slate-800/40">
                {commands.length === 0 ? (
                  <div className="px-4 py-8 text-center text-slate-500 text-sm">No commands yet</div>
                ) : (
                  commands.map(cmd => {
                    const acks = getCommandAcks(cmd.command_id);
                    const isActive = activeCommand?.command_id === cmd.command_id;
                    return (
                      <div key={cmd.command_id} className={cn('p-4', isActive ? 'bg-blue-500/5' : '')}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="text-xs font-mono text-slate-400">{cmd.command_id}</div>
                            <div className="text-sm font-semibold text-white mt-0.5">
                              {COMMAND_TYPE_LABELS[cmd.command_type]}
                              {cmd.command_payload?.target_position_pct !== undefined && (
                                <span className="text-slate-400 font-normal"> → {cmd.command_payload.target_position_pct}%</span>
                              )}
                            </div>
                          </div>
                          <AckStageBadge stage={cmd.current_ack_stage} size="sm" />
                        </div>

                        {/* Improved ACK Timeline */}
                        <AckTimeline cmd={cmd} acks={acks} />

                        {(cmd.reason_code || cmd.fault_code) && (
                          <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs">
                            {cmd.reason_code && <div className="text-orange-400">{REASON_CODE_MESSAGES[cmd.reason_code]}</div>}
                            {cmd.fault_code && <div className="text-red-400 mt-0.5">{FAULT_CODE_MESSAGES[cmd.fault_code]}</div>}
                          </div>
                        )}
                        <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
                          <span>Issued {formatRelativeTime(cmd.issued_at)}</span>
                          {cmd.execution_duration_ms && <span>Duration: {formatDurationMs(cmd.execution_duration_ms)}</span>}
                          {cmd.final_position_pct !== undefined && <span>Final: {cmd.final_position_pct}%</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Events Tab */}
            {activeTab === 'events' && (
              <div className="divide-y divide-slate-800/40">
                {deviceEvents.length === 0 ? (
                  <div className="px-4 py-8 text-center text-slate-500 text-sm">No events recorded</div>
                ) : (
                  deviceEvents.map(ev => (
                    <div key={ev.event_id} className="flex items-start gap-3 p-3.5">
                      <SeverityBadge severity={ev.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white">{ev.event_code.replace(/^EVT_/, '').replace(/_/g, ' ')}</div>
                        <div className="text-[10px] font-mono text-slate-500">{ev.event_code}</div>
                        {(ev.state_before || ev.state_after) && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{ev.state_before} → {ev.state_after}</div>
                        )}
                        {ev.fault_code && <div className="text-[11px] text-red-400 mt-0.5 font-mono">{ev.fault_code}</div>}
                        {ev.reason_code && <div className="text-[11px] text-orange-400 mt-0.5">{REASON_CODE_MESSAGES[ev.reason_code]}</div>}
                      </div>
                      <div className="text-[11px] text-slate-500 shrink-0">{formatRelativeTime(ev.ts_cloud)}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Charts Tab */}
            {activeTab === 'charts' && (
              <div className="p-4 space-y-5">
                {chartData.length > 0 ? (
                  <>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 mb-3">Valve Position (%) — Last 4 hours</h4>
                      <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#475569' }} interval="preserveStartEnd" />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#475569' }} />
                          <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                          <Area type="monotone" dataKey="position" stroke="#3b82f6" fill="url(#posGrad)" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 mb-3">Battery Voltage (V)</h4>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#475569' }} interval="preserveStartEnd" />
                          <YAxis domain={[9, 14]} tick={{ fontSize: 10, fill: '#475569' }} />
                          <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="battery" stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 mb-3">LTE Signal Strength (%)</h4>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#475569' }} interval="preserveStartEnd" />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#475569' }} />
                          <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="signal" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-slate-500 text-sm">Loading telemetry history...</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right — Command Panel */}
        <div className="space-y-4">
          {/* Command Panel */}
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-purple-400" />
                Command Panel
              </h3>
              {!canSendCommands && (
                <p className="text-[11px] text-slate-500 mt-1">Read-only: your role cannot send commands</p>
              )}
              {canSendCommands && !isOnline && (
                <p className="text-[11px] text-red-400 mt-1">Device offline — commands blocked</p>
              )}
              {canSendCommands && isOnline && state.manual_active && (
                <p className="text-[11px] text-orange-400 mt-1">Manual override active — open/close blocked</p>
              )}
              {canSendCommands && isOnline && state.wet_active && (
                <p className="text-[11px] text-blue-400 mt-1">Wet ingress active — all commands blocked</p>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* Active command status */}
              {activeCommand && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-xs font-semibold text-blue-400">Command in progress</span>
                  </div>
                  <div className="text-sm font-medium text-white">{COMMAND_TYPE_LABELS[activeCommand.command_type]}</div>
                  <div className="mt-2">
                    <AckStageBadge stage={activeCommand.current_ack_stage} size="md" />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2">{ACK_STAGE_LABELS[activeCommand.current_ack_stage]}</div>
                  <p className="text-[10px] text-slate-600 mt-2">⚠ Success only confirmed after &quot;Completed&quot; ACK</p>
                </div>
              )}

              {commandSuccess && !activeCommand && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-400 font-medium">Command completed successfully</span>
                </div>
              )}

              {/* Primary actions */}
              <div className="grid grid-cols-3 gap-2">
                {(['open', 'close', 'stop'] as const).map(type => (
                  <button
                    key={type}
                    disabled={!canCommand}
                    onClick={() => handleCommand(type)}
                    className={cn(
                      'py-2.5 rounded-xl text-xs font-semibold border transition-all duration-200',
                      !canCommand ? 'opacity-40 cursor-not-allowed bg-slate-800/40 border-slate-700/40 text-slate-500' :
                      type === 'open' ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 active:scale-95' :
                      type === 'close' ? 'bg-slate-700/40 border-slate-600/40 text-slate-300 hover:bg-slate-700/60 active:scale-95' :
                      'bg-yellow-600/20 border-yellow-500/30 text-yellow-400 hover:bg-yellow-600/30 active:scale-95'
                    )}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>

              {/* Set Position */}
              <div className={cn('space-y-2', !canSetPosition ? 'opacity-40' : '')}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Set Position</span>
                  <span className="text-sm font-bold text-white">{targetPosition}%</span>
                </div>
                {!positionValid && isOnline && (
                  <div className="text-[10px] text-yellow-400">Position invalid — recalibrate first</div>
                )}
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={targetPosition}
                  onChange={e => setTargetPosition(Number(e.target.value))}
                  disabled={!canSetPosition}
                  className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
                <button
                  disabled={!canSetPosition}
                  onClick={() => handleCommand('set_position')}
                  className={cn(
                    'w-full py-2 rounded-xl text-xs font-semibold border transition-all duration-200',
                    !canSetPosition ? 'opacity-40 cursor-not-allowed bg-slate-800/40 border-slate-700/40 text-slate-500' :
                    'bg-blue-600/20 border-blue-500/30 text-blue-400 hover:bg-blue-600/30 active:scale-95'
                  )}
                >
                  Apply Position ({targetPosition}%)
                </button>
              </div>

              {/* Advanced Commands */}
              <div className="border-t border-slate-800/60 pt-3">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    Advanced Commands
                  </span>
                  <span>{showAdvanced ? '▲' : '▼'}</span>
                </button>
                {showAdvanced && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(['calibrate', 'ping', 'reboot'] as const).map(type => (
                      <button
                        key={type}
                        disabled={!canCommand}
                        onClick={() => handleCommand(type)}
                        className={cn(
                          'py-2 rounded-xl text-[11px] font-medium border transition-all duration-200',
                          !canCommand ? 'opacity-40 cursor-not-allowed bg-slate-800/40 border-slate-700/40 text-slate-500' :
                          type === 'reboot' ? 'bg-red-600/20 border-red-500/30 text-red-400 hover:bg-red-600/30 active:scale-95' :
                          'bg-slate-700/40 border-slate-600/40 text-slate-300 hover:bg-slate-700/60 active:scale-95'
                        )}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Simulator Toggles (demo/dev controls) */}
              <div className="border-t border-slate-800/60 pt-3">
                <div className="text-[10px] text-slate-600 mb-2 uppercase tracking-wider">Simulator Controls</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">Manual Override</div>
                      <div className="text-[10px] text-slate-600">Blocks remote open/close/position</div>
                    </div>
                    <button
                      onClick={toggleManualOverride}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-all',
                        state.manual_active
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                          : 'bg-slate-700/40 text-slate-400 border-slate-700/40'
                      )}
                    >
                      {state.manual_active
                        ? <ToggleRight className="w-4 h-4" />
                        : <ToggleLeft className="w-4 h-4" />
                      }
                      {state.manual_active ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">Wet Ingress</div>
                      <div className="text-[10px] text-slate-600">Blocks all remote commands</div>
                    </div>
                    <button
                      onClick={toggleWetActive}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-all',
                        state.wet_active
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : 'bg-slate-700/40 text-slate-400 border-slate-700/40'
                      )}
                    >
                      {state.wet_active
                        ? <ToggleRight className="w-4 h-4" />
                        : <ToggleLeft className="w-4 h-4" />
                      }
                      {state.wet_active ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/60 pt-3">
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  Commands follow the ACK lifecycle: Requested → Accepted → Executing → Completed.
                  Blocked and rejected commands show the exact failure reason. Timeout fires at command expiry.
                  Safety conditions block commands automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Active Faults */}
          {deviceFaults.filter(f => f.is_active).length > 0 && (
            <div className="bg-[#111827] border border-red-500/20 rounded-xl">
              <div className="px-4 py-3 border-b border-red-500/20">
                <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Active Faults
                </h3>
              </div>
              <div className="p-4 space-y-2">
                {deviceFaults.filter(f => f.is_active).map(fault => (
                  <div key={fault.fault_id} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="text-xs font-mono font-bold text-red-400">{fault.fault_code}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{fault.description}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Detected {formatRelativeTime(fault.detected_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
