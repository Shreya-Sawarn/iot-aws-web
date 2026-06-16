import { cn } from '@/utils/cn';
import type { AvailabilityState, ValveState, BatteryState, AckStage, EventSeverity } from '@/types';
import {
  AVAILABILITY_LABELS, VALVE_STATE_LABELS, BATTERY_STATE_LABELS,
  ACK_STAGE_LABELS, SEVERITY_LABELS
} from '@/constants/enums';

interface BadgeProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function AvailabilityBadge({ state, className, size = 'sm' }: { state: AvailabilityState } & BadgeProps) {
  const colors = {
    online: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    offline: 'bg-red-500/15 text-red-400 border-red-500/25',
    stale: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  };
  const dots = {
    online: 'bg-emerald-400 animate-pulse',
    offline: 'bg-red-400',
    stale: 'bg-yellow-400',
    unknown: 'bg-slate-400',
  };
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-md border font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      colors[state], className
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dots[state])} />
      {AVAILABILITY_LABELS[state]}
    </span>
  );
}

export function ValveStateBadge({ state, className, size = 'sm' }: { state: ValveState } & BadgeProps) {
  const colors: Record<ValveState, string> = {
    open: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    closed: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
    opening: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    closing: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    stopped: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    fault: 'bg-red-500/15 text-red-400 border-red-500/25',
    unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  };
  return (
    <span className={cn(
      'inline-flex items-center rounded-md border font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      colors[state], className
    )}>
      {VALVE_STATE_LABELS[state]}
    </span>
  );
}

export function AckStageBadge({ stage, className, size = 'sm' }: { stage: AckStage } & BadgeProps) {
  const colors: Record<AckStage, string> = {
    command_requested: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    accepted: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
    rejected: 'bg-red-500/15 text-red-400 border-red-500/25',
    blocked: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    executing: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    failed: 'bg-red-600/15 text-red-500 border-red-600/25',
    timeout: 'bg-orange-600/15 text-orange-500 border-orange-600/25',
    safety_stopped: 'bg-red-700/15 text-red-600 border-red-700/25',
  };
  return (
    <span className={cn(
      'inline-flex items-center rounded-md border font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      colors[stage], className
    )}>
      {ACK_STAGE_LABELS[stage]}
    </span>
  );
}

export function SeverityBadge({ severity, className, size = 'sm' }: { severity: EventSeverity } & BadgeProps) {
  const colors: Record<EventSeverity, string> = {
    info: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    warning: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    error: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    critical: 'bg-red-500/15 text-red-400 border-red-500/25',
  };
  return (
    <span className={cn(
      'inline-flex items-center rounded-md border font-medium uppercase tracking-wide',
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
      colors[severity], className
    )}>
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

export function BatteryBadge({ state, voltage, className }: { state: BatteryState; voltage?: number } & BadgeProps) {
  const colors: Record<BatteryState, string> = {
    good: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    low: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    critical: 'bg-red-500/15 text-red-400 border-red-500/25',
    charging: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border font-medium', colors[state], className)}>
      {BATTERY_STATE_LABELS[state]}
      {voltage !== undefined && <span className="opacity-70">({voltage.toFixed(1)}V)</span>}
    </span>
  );
}
