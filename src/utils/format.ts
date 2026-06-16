import { formatDistanceToNow, format, isValid, parseISO } from 'date-fns';

export function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return 'Never';
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return 'Unknown';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

export function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return 'N/A';
    return format(date, 'dd MMM yyyy, HH:mm:ss');
  } catch {
    return 'N/A';
  }
}

export function formatBatteryV(v: number): string {
  return `${v.toFixed(1)}V`;
}

export function formatSignal(strength: number): string {
  return `${Math.round(strength)}%`;
}

export function formatPosition(pct: number): string {
  return `${Math.round(pct)}%`;
}

export function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function getSignalStrengthBars(strength: number): number {
  if (strength >= 75) return 4;
  if (strength >= 50) return 3;
  if (strength >= 25) return 2;
  if (strength > 0) return 1;
  return 0;
}

export function isStale(lastSeenAt: string | undefined, thresholdSec = 60): boolean {
  if (!lastSeenAt) return true;
  const elapsed = (Date.now() - new Date(lastSeenAt).getTime()) / 1000;
  return elapsed > thresholdSec;
}
