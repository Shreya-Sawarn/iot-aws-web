'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { MOCK_DEVICES, MOCK_SITES } from '@/mock-data/seed';
import { useDeviceStore } from '@/store/deviceStore';
import { formatRelativeTime } from '@/utils/format';
import { COMMAND_TYPE_LABELS } from '@/constants/enums';
import { CalendarDays, Plus, Clock, CheckCircle2, XCircle, AlertCircle, Pause, Radio } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Schedule, ScheduleStatus } from '@/types';

// Mock schedule data (future: fetched from DynamoDB via AppSync)
const now = Date.now();
const MOCK_SCHEDULES: Schedule[] = [
  {
    schedule_id: 'SCH-001',
    tenant_id: 'TENANT_DEMO_AGRI',
    site_id: 'SITE_FARM_001',
    device_id: 'D001',
    schedule_name: 'Morning Irrigation — Borewell 1',
    schedule_type: 'daily',
    command_type: 'open',
    planned_start_at: new Date(now + 6 * 3600000).toISOString(),
    planned_duration_min: 45,
    target_device_ids: ['D001', 'D002'],
    schedule_status: 'planned',
    water_confirmation_required: false,
    enabled: true,
    recurrence_rule: 'FREQ=DAILY;BYHOUR=6;BYMINUTE=0',
    created_by: 'USR_FARMER_001',
    created_at: new Date(now - 7 * 86400000).toISOString(),
    updated_at: new Date(now - 86400000).toISOString(),
  },
  {
    schedule_id: 'SCH-002',
    tenant_id: 'TENANT_DEMO_AGRI',
    site_id: 'SITE_FARM_001',
    device_id: 'D001',
    schedule_name: 'Evening Close — Borewell 1',
    schedule_type: 'daily',
    command_type: 'close',
    planned_start_at: new Date(now + 12 * 3600000).toISOString(),
    planned_duration_min: undefined,
    target_device_ids: ['D001', 'D002'],
    schedule_status: 'planned',
    water_confirmation_required: false,
    enabled: true,
    recurrence_rule: 'FREQ=DAILY;BYHOUR=18;BYMINUTE=30',
    created_by: 'USR_FARMER_001',
    created_at: new Date(now - 7 * 86400000).toISOString(),
    updated_at: new Date(now - 86400000).toISOString(),
  },
  {
    schedule_id: 'SCH-003',
    tenant_id: 'TENANT_DEMO_AGRI',
    site_id: 'SITE_FARM_002',
    device_id: 'D004',
    schedule_name: 'Drip Irrigation — South Field (50%)',
    schedule_type: 'weekly',
    command_type: 'set_position',
    target_position_pct: 50,
    planned_start_at: new Date(now + 2 * 86400000).toISOString(),
    planned_duration_min: 90,
    target_device_ids: ['D004', 'D005'],
    schedule_status: 'planned',
    water_confirmation_required: true,
    enabled: true,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    created_by: 'USR_FARMER_001',
    created_at: new Date(now - 3 * 86400000).toISOString(),
    updated_at: new Date(now - 3 * 86400000).toISOString(),
  },
  {
    schedule_id: 'SCH-004',
    tenant_id: 'TENANT_DEMO_AGRI',
    site_id: 'SITE_FARM_001',
    device_id: 'D002',
    schedule_name: 'One-time Emergency Open — Drip Line 2',
    schedule_type: 'one_time',
    command_type: 'open',
    planned_start_at: new Date(now - 3600000).toISOString(),
    planned_duration_min: 30,
    target_device_ids: ['D002'],
    schedule_status: 'confirmed',
    water_confirmation_required: false,
    enabled: false,
    created_by: 'USR_FARMER_001',
    created_at: new Date(now - 4 * 3600000).toISOString(),
    updated_at: new Date(now - 3500000).toISOString(),
  },
  {
    schedule_id: 'SCH-005',
    tenant_id: 'TENANT_DEMO_AGRI',
    site_id: 'SITE_FARM_002',
    device_id: 'D005',
    schedule_name: 'Weekly Calibration — Field South Valve',
    schedule_type: 'weekly',
    command_type: 'calibrate',
    planned_start_at: new Date(now - 86400000).toISOString(),
    target_device_ids: ['D005'],
    schedule_status: 'failed',
    water_confirmation_required: false,
    enabled: false,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=SU',
    created_by: 'USR_ADMIN_001',
    created_at: new Date(now - 14 * 86400000).toISOString(),
    updated_at: new Date(now - 86000000).toISOString(),
  },
];

const STATUS_CONFIG: Record<ScheduleStatus, { label: string; color: string; icon: React.ElementType }> = {
  planned: { label: 'Planned', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Clock },
  attempted: { label: 'Attempted', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: AlertCircle },
  confirmed: { label: 'Confirmed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle },
  skipped: { label: 'Skipped', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: Pause },
  rescheduled: { label: 'Rescheduled', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: CalendarDays },
};

export default function SchedulesPage() {
  const { session } = useAuthStore();
  const { devices } = useDeviceStore();
  const [showCompleted, setShowCompleted] = useState(false);

  const tenantId = session?.user.tenant_id;
  const userRole = session?.user.role;
  const canManageSchedules = ['founder_admin', 'manufacturer_admin', 'municipal_operator', 'taluk_manager', 'farmer'].includes(userRole ?? '');

  const schedules = MOCK_SCHEDULES
    .filter(s => !tenantId || s.tenant_id === tenantId)
    .filter(s => showCompleted || (s.schedule_status !== 'confirmed' && s.schedule_status !== 'failed'))
    .sort((a, b) => new Date(a.planned_start_at).getTime() - new Date(b.planned_start_at).getTime());

  function getDeviceName(device_id: string) {
    return devices.find(d => d.device_id === device_id)?.device_name ?? device_id;
  }

  function getSiteName(site_id: string) {
    return MOCK_SITES.find(s => s.site_id === site_id)?.site_name ?? site_id;
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-400" />
            Schedules
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Automated irrigation and valve operation schedules</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={e => setShowCompleted(e.target.checked)}
              className="rounded accent-blue-500"
            />
            Show completed/failed
          </label>
          {canManageSchedules && (
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all">
              <Plus className="w-3.5 h-3.5" />
              New Schedule
            </button>
          )}
        </div>
      </div>

      {/* Weather notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-blue-400">Phase-1 advisory:</strong> Weather data does not automatically skip or modify schedules.
          Operators must review weather advisory and manually pause schedules when needed. Auto-weather-skip planned for Phase-2.
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Upcoming', value: MOCK_SCHEDULES.filter(s => s.schedule_status === 'planned' && s.enabled).length, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Active Today', value: MOCK_SCHEDULES.filter(s => s.schedule_status === 'attempted').length, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
          { label: 'Confirmed Today', value: MOCK_SCHEDULES.filter(s => s.schedule_status === 'confirmed').length, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { label: 'Failed', value: MOCK_SCHEDULES.filter(s => s.schedule_status === 'failed').length, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn('rounded-xl border p-4', bg)}>
            <div className={cn('text-2xl font-bold mb-0.5', color)}>{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Schedule List */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
        {schedules.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <div>No schedules to display</div>
            {canManageSchedules && <div className="text-xs mt-1">Click &quot;New Schedule&quot; to create one</div>}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {schedules.map(schedule => {
              const StatusCfg = STATUS_CONFIG[schedule.schedule_status];
              const StatusIcon = StatusCfg.icon;
              const isUpcoming = new Date(schedule.planned_start_at) > new Date();

              return (
                <div key={schedule.schedule_id} className={cn(
                  'p-4 hover:bg-slate-800/20 transition-colors',
                  !schedule.enabled ? 'opacity-60' : ''
                )}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border', StatusCfg.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {StatusCfg.label}
                        </span>
                        {!schedule.enabled && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-slate-700/40 text-slate-400 border-slate-700/40">Disabled</span>
                        )}
                        {schedule.water_confirmation_required && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-blue-500/10 text-blue-400 border-blue-500/20">Confirm req.</span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-white">{schedule.schedule_name}</div>
                    </div>
                    {canManageSchedules && (
                      <button className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50 transition-all shrink-0">
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[11px]">
                    <div>
                      <div className="text-slate-500 mb-0.5">Command</div>
                      <div className="text-white font-medium">
                        {COMMAND_TYPE_LABELS[schedule.command_type]}
                        {schedule.target_position_pct !== undefined && ` (${schedule.target_position_pct}%)`}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-0.5">Scheduled</div>
                      <div className={cn('font-medium', isUpcoming ? 'text-blue-400' : 'text-slate-400')}>
                        {isUpcoming ? `In ${formatRelativeTime(schedule.planned_start_at).replace('in ', '')}` : formatRelativeTime(schedule.planned_start_at)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-0.5">Duration</div>
                      <div className="text-white">{schedule.planned_duration_min ? `${schedule.planned_duration_min} min` : 'Until stopped'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-0.5">Repeat</div>
                      <div className="text-white capitalize">{schedule.schedule_type.replace('_', ' ')}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Radio className="w-3 h-3" />
                      {schedule.target_device_ids.map(id => getDeviceName(id)).join(', ')}
                    </div>
                    <div>{getSiteName(schedule.site_id)}</div>
                    {schedule.recurrence_rule && (
                      <div className="font-mono text-slate-600">{schedule.recurrence_rule}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Future note */}
      <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/30 text-[11px] text-slate-500">
        <strong className="text-slate-400">Phase-1:</strong> Schedules are read-only with mock data.
        Phase-2 will integrate AWS EventBridge + Lambda for schedule execution, DynamoDB for storage, and AppSync subscriptions for real-time status updates.
      </div>
    </div>
  );
}
