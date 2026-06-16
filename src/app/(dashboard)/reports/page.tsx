'use client';

import { useState } from 'react';
import { useDeviceStore } from '@/store/deviceStore';
import { useCommandStore } from '@/store/commandStore';
import { useAlertStore } from '@/store/alertStore';
import { useAuthStore } from '@/store/authStore';
import { MOCK_DEVICES, MOCK_LATEST_STATE, MOCK_SERVICE_RECORDS, generateTelemetryHistory } from '@/mock-data/seed';
import { FAULT_CODE_MESSAGES, COMMAND_TYPE_LABELS, ACK_STAGE_LABELS } from '@/constants/enums';
import { AckStageBadge, SeverityBadge } from '@/components/ui/StatusBadge';
import { formatRelativeTime, formatDateTime, formatBatteryV, formatDurationMs } from '@/utils/format';
import {
  BarChart3, Download, Activity, Battery, AlertTriangle, Radio,
  Wrench, Calendar, TrendingDown, Clock, CheckCircle, XCircle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import { cn } from '@/utils/cn';

type ReportType = 'activity' | 'battery' | 'faults' | 'commands' | 'service';

const REPORT_TABS: { value: ReportType; label: string; icon: React.ElementType }[] = [
  { value: 'activity', label: 'Activity', icon: Activity },
  { value: 'commands', label: 'Commands', icon: Terminal },
  { value: 'battery', label: 'Battery Trends', icon: Battery },
  { value: 'faults', label: 'Fault History', icon: AlertTriangle },
  { value: 'service', label: 'Service Records', icon: Wrench },
];

function Terminal({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"></polyline>
      <line x1="12" y1="19" x2="20" y2="19"></line>
    </svg>
  );
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('activity');
  const { session } = useAuthStore();
  const { devices, latestStates } = useDeviceStore();
  const { commands } = useCommandStore();
  const { faults, events } = useAlertStore();

  const tenantId = session?.user.tenant_id;
  const tenantDevices = tenantId ? devices.filter(d => d.tenant_id === tenantId) : devices;

  // Activity data — commands per day
  const activityData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const dayStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const dayCommands = commands.filter(c => {
      const cd = new Date(c.created_at);
      return cd.toDateString() === d.toDateString();
    });
    return {
      day: dayStr,
      total: dayCommands.length,
      success: dayCommands.filter(c => c.current_ack_stage === 'completed').length,
      failed: dayCommands.filter(c => ['failed', 'rejected', 'timeout'].includes(c.current_ack_stage)).length,
    };
  });

  // Battery data per device
  const batteryData = tenantDevices.map(d => {
    const state = latestStates[d.device_id];
    return {
      name: d.device_name.slice(0, 12),
      battery_v: state?.battery_v ?? 0,
      threshold: 11.0,
    };
  });

  // Fault breakdown
  const faultBreakdown = Object.entries(
    faults
      .filter(f => !tenantId || f.tenant_id === tenantId)
      .reduce((acc, f) => { acc[f.fault_code] = (acc[f.fault_code] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: name.replace('FLT_', ''), value }));

  // Command success rate
  const cmdMetrics = {
    total: commands.length,
    completed: commands.filter(c => c.current_ack_stage === 'completed').length,
    failed: commands.filter(c => ['failed', 'timeout', 'safety_stopped'].includes(c.current_ack_stage)).length,
    rejected: commands.filter(c => ['rejected', 'blocked'].includes(c.current_ack_stage)).length,
    pending: commands.filter(c => !['completed', 'failed', 'rejected', 'blocked', 'timeout', 'safety_stopped'].includes(c.current_ack_stage)).length,
  };

  const cmdPieData = [
    { name: 'Completed', value: cmdMetrics.completed, color: '#10b981' },
    { name: 'Failed', value: cmdMetrics.failed, color: '#ef4444' },
    { name: 'Rejected', value: cmdMetrics.rejected, color: '#f59e0b' },
    { name: 'Pending', value: cmdMetrics.pending, color: '#3b82f6' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-4 fade-in">
      {/* Report Tabs */}
      <div className="flex gap-1 flex-wrap bg-[#111827] p-1 rounded-xl border border-slate-800/60 w-fit">
        {REPORT_TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setActiveReport(value)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
              activeReport === value
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Activity Report */}
      {activeReport === 'activity' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Devices', value: tenantDevices.length, color: 'text-blue-400' },
              { label: 'Online Now', value: tenantDevices.filter(d => latestStates[d.device_id]?.availability === 'online').length, color: 'text-emerald-400' },
              { label: 'Active Faults', value: faults.filter(f => f.is_active && (!tenantId || f.tenant_id === tenantId)).length, color: 'text-red-400' },
              { label: 'Commands (7d)', value: commands.length, color: 'text-purple-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#111827] border border-slate-800/60 rounded-xl p-4">
                <div className={cn('text-2xl font-bold', color)}>{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="bg-[#111827] border border-slate-800/60 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Command Activity (Last 7 Days)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="success" name="Completed" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Device status table */}
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <h3 className="text-sm font-semibold text-white">Device Status Summary</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800/60 bg-slate-800/20">
                    {['Device', 'Status', 'Valve', 'Battery', 'Signal', 'Last Seen'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {tenantDevices.map(d => {
                    const s = latestStates[d.device_id];
                    if (!s) return null;
                    return (
                      <tr key={d.device_id} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-white">{d.device_name}</div>
                          <div className="text-slate-500">{d.device_id}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium',
                            s.availability === 'online' ? 'bg-emerald-500/15 text-emerald-400' :
                            s.availability === 'offline' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'
                          )}>{s.availability}</span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{s.valve_state} ({s.valve_position_pct}%)</td>
                        <td className="px-4 py-2.5">
                          <span className={cn(s.battery_state === 'good' ? 'text-emerald-400' : s.battery_state === 'low' ? 'text-yellow-400' : 'text-red-400')}>
                            {formatBatteryV(s.battery_v)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{Math.round(s.signal_strength)}%</td>
                        <td className="px-4 py-2.5 text-slate-500">{formatRelativeTime(s.last_seen_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Commands Report */}
      {activeReport === 'commands' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Commands', value: cmdMetrics.total, color: 'text-blue-400' },
              { label: 'Completed', value: cmdMetrics.completed, color: 'text-emerald-400' },
              { label: 'Failed / Timeout', value: cmdMetrics.failed, color: 'text-red-400' },
              { label: 'Rejected / Blocked', value: cmdMetrics.rejected, color: 'text-orange-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#111827] border border-slate-800/60 rounded-xl p-4">
                <div className={cn('text-2xl font-bold', color)}>{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#111827] border border-slate-800/60 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Success Rate</h3>
              {cmdPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={cmdPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                      {cmdPieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-slate-500 text-sm">No commands yet</div>
              )}
            </div>

            <div className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60">
                <h3 className="text-sm font-semibold text-white">Recent Commands</h3>
              </div>
              <div className="divide-y divide-slate-800/40 max-h-80 overflow-y-auto">
                {commands.slice(0, 20).map(cmd => (
                  <div key={cmd.command_id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">{COMMAND_TYPE_LABELS[cmd.command_type]}</div>
                      <div className="text-[10px] text-slate-500">{cmd.device_id} · {formatRelativeTime(cmd.created_at)}</div>
                    </div>
                    <AckStageBadge stage={cmd.current_ack_stage} />
                  </div>
                ))}
                {commands.length === 0 && (
                  <div className="px-4 py-8 text-center text-slate-500 text-sm">No commands recorded</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Battery Report */}
      {activeReport === 'battery' && (
        <div className="space-y-4">
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Battery className="w-4 h-4 text-yellow-400" />
              Battery Voltage by Device
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={batteryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" domain={[8, 14]} tick={{ fontSize: 11, fill: '#475569' }} unit="V" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} width={80} />
                <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="battery_v" name="Battery (V)" radius={[0, 4, 4, 0]}>
                  {batteryData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.battery_v < 10 ? '#ef4444' : entry.battery_v < 11 ? '#f59e0b' : '#10b981'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" />Good (&gt;11V)</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-500" />Low (10–11V)</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" />Critical (&lt;10V)</div>
            </div>
          </div>

          {/* Battery table */}
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <h3 className="text-sm font-semibold text-white">Battery Status Table</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800/60 bg-slate-800/20">
                    {['Device', 'Voltage', 'State', 'Last Reading'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {tenantDevices
                    .map(d => ({ device: d, state: latestStates[d.device_id] }))
                    .filter(({ state }) => state)
                    .sort((a, b) => (a.state!.battery_v ?? 0) - (b.state!.battery_v ?? 0))
                    .map(({ device, state }) => (
                      <tr key={device.device_id} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-white">{device.device_name}</div>
                          <div className="text-slate-500">{device.device_id}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('font-bold', state!.battery_state === 'good' ? 'text-emerald-400' : state!.battery_state === 'low' ? 'text-yellow-400' : 'text-red-400')}>
                            {formatBatteryV(state!.battery_v)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium',
                            state!.battery_state === 'good' ? 'bg-emerald-500/15 text-emerald-400' :
                            state!.battery_state === 'low' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'
                          )}>{state!.battery_state}</span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{formatRelativeTime(state!.last_seen_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Faults Report */}
      {activeReport === 'faults' && (
        <div className="space-y-4">
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              Fault Distribution
            </h3>
            {faultBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={faultBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" name="Occurrences" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-500" /> No faults recorded
              </div>
            )}
          </div>

          <div className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <h3 className="text-sm font-semibold text-white">Fault History</h3>
            </div>
            <div className="divide-y divide-slate-800/40">
              {faults.filter(f => !tenantId || f.tenant_id === tenantId).length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-500 text-sm">No faults recorded</div>
              ) : (
                faults.filter(f => !tenantId || f.tenant_id === tenantId).map(fault => (
                  <div key={fault.fault_id} className="px-4 py-3 flex items-start gap-3">
                    <SeverityBadge severity={fault.severity} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-bold text-white">{fault.fault_code}</div>
                      <div className="text-[11px] text-slate-400">{fault.description}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{fault.device_id} · Detected {formatRelativeTime(fault.detected_at)}</div>
                    </div>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                      fault.is_active ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
                    )}>
                      {fault.is_active ? 'ACTIVE' : 'CLEARED'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Service Records */}
      {activeReport === 'service' && (
        <div className="space-y-4">
          <div className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                Service Records
              </h3>
              <span className="text-xs text-slate-500">{MOCK_SERVICE_RECORDS.length} records</span>
            </div>
            {MOCK_SERVICE_RECORDS.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">No service records</div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {MOCK_SERVICE_RECORDS.map(record => (
                  <div key={record.service_ticket_id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="text-xs font-mono text-slate-500">{record.service_ticket_id}</div>
                        <div className="text-sm font-semibold text-white mt-0.5">{record.service_description}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-md font-medium border',
                          record.service_priority === 'critical' ? 'bg-red-500/15 text-red-400 border-red-500/25' :
                          record.service_priority === 'high' ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' :
                          'bg-yellow-500/15 text-yellow-400 border-yellow-500/25'
                        )}>
                          {record.service_priority.toUpperCase()}
                        </span>
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-md font-medium border',
                          record.service_status === 'open' ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' :
                          record.service_status === 'resolved' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                          'bg-slate-500/15 text-slate-400 border-slate-500/25'
                        )}>
                          {record.service_status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {record.fault_codes && record.fault_codes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {record.fault_codes.map(fc => (
                          <span key={fc} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{fc}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-slate-500">
                      <span>{record.device_id}</span>
                      <span>Created {formatRelativeTime(record.created_at)}</span>
                      {record.assigned_to_user_id && <span>Assigned to {record.assigned_to_user_id}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Future analytics note */}
      <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/30 text-xs text-slate-500">
        <strong className="text-slate-400">Analytics Architecture:</strong> Advanced analytics (irrigation trends, predictive maintenance, municipal KPIs,
        water usage reports, PDF/Excel exports) will be hosted on Hostinger analytics engine as per DOC-CLD-012.
        Current data is from local mock database. Future deployment will connect to DynamoDB historical data via Hostinger analytics pipeline.
      </div>
    </div>
  );
}
