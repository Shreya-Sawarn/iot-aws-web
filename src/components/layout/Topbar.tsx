'use client';

import { usePathname } from 'next/navigation';
import { Bell, Menu } from 'lucide-react';
import { useAlertStore } from '@/store/alertStore';
import { useDeviceStore } from '@/store/deviceStore';
import { formatRelativeTime } from '@/utils/format';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/devices': 'Device List',
  '/alerts': 'Alerts & Faults',
  '/weather': 'Weather Advisory',
  '/schedules': 'Schedules',
  '/reports': 'Reports',
};

function getTitle(pathname: string): string {
  if (pathname.startsWith('/devices/')) return 'Device Details';
  return PAGE_TITLES[pathname] ?? 'OrbiPulse';
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const { unreadCount, markAllRead } = useAlertStore();
  const { lastSyncAt } = useDeviceStore();

  return (
    <header className="h-14 bg-[#0f1629] border-b border-slate-800/60 flex items-center px-5 gap-4 shrink-0">
      {onMenuClick && (
        <button onClick={onMenuClick} className="lg:hidden text-slate-400 hover:text-white">
          <Menu className="w-5 h-5" />
        </button>
      )}

      <div className="flex-1">
        <h1 className="text-sm font-semibold text-white">{getTitle(pathname)}</h1>
        {lastSyncAt && (
          <p className="text-[10px] text-slate-500">Last sync: {formatRelativeTime(lastSyncAt)}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Alert bell */}
        <button
          onClick={markAllRead}
          className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
