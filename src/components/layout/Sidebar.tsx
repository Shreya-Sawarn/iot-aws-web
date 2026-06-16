'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Radio, Bell, CloudRain, BarChart3,
  LogOut, ChevronRight, Zap, CalendarDays, X
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAlertStore } from '@/store/alertStore';
import { ROLE_LABELS } from '@/constants/enums';
import { cn } from '@/utils/cn';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Devices', icon: Radio },
  { href: '/alerts', label: 'Alerts', icon: Bell, badge: true },
  { href: '/weather', label: 'Weather', icon: CloudRain },
  { href: '/schedules', label: 'Schedules', icon: CalendarDays },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

interface SidebarProps {
  className?: string;
  mobileOpen?: boolean;
  onClose?: () => void;
}

function SidebarInner({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout } = useAuthStore();
  const { unreadCount } = useAlertStore();

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  const user = session?.user;

  return (
    <aside className="flex flex-col w-60 shrink-0 bg-[#0f1629] border-r border-slate-800/60 h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-white leading-none">OrbiPulse</div>
            <div className="text-[10px] text-slate-500 mt-0.5">IoT Control Platform</div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
          const isActive = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300')} />
              <span className="flex-1">{label}</span>
              {badge && unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              {isActive && <ChevronRight className="w-3 h-3 text-blue-400/60" />}
            </Link>
          );
        })}
      </nav>

      {/* Live Indicator */}
      <div className="mx-3 mb-3 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-60" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-emerald-400">Simulator Active</div>
            <div className="text-[10px] text-slate-500">LTE demo mode · 5s interval</div>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="border-t border-slate-800/60 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 text-xs font-bold text-white">
            {user?.user_name?.charAt(0) ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{user?.user_name ?? 'User'}</div>
            <div className="text-[10px] text-slate-500 truncate">{user?.role ? ROLE_LABELS[user.role] : ''}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function Sidebar({ className, mobileOpen = false, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <div className={cn('hidden lg:flex', className)}>
        <SidebarInner />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <div className="relative flex flex-col h-full shadow-2xl">
            <SidebarInner onClose={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
