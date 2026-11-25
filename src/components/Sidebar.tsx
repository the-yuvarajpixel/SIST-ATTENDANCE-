import {
  Activity,
  Bell,
  BookOpen,
  CalendarClock,
  CheckSquare,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import type { NavSection, SessionUser, StudentProfile } from '../core/types';

interface SidebarProps {
  activeSection: NavSection;
  onSelect: (section: NavSection) => void;
  user: SessionUser;
  profile: StudentProfile | null;
  unreadCount: number;
  shortageCount: number;
  erpDegraded: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'attendance', label: 'Attendance', icon: CheckSquare },
  { id: 'timetable', label: 'Timetable', icon: CalendarClock },
  { id: 'results', label: 'Results & CGPA', icon: TrendingUp },
  { id: 'deadlines', label: 'Deadlines', icon: GraduationCap },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'sync', label: 'Sync LMS & ERP', icon: RefreshCw },
  { id: 'live-guide', label: 'Live Login Guide', icon: BookOpen },
  { id: 'setup', label: 'Setup & Health', icon: Activity },
];

export function Sidebar({
  activeSection,
  onSelect,
  user,
  profile,
  unreadCount,
  shortageCount,
  erpDegraded,
  mobileOpen,
  onCloseMobile,
  onSignOut,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex h-14 items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            onSelect('overview');
            onCloseMobile();
          }}
          className="text-left font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap cursor-pointer"
        >
          SIST Student Portal
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden rounded-md p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          let countHint: string | null = null;
          if (item.id === 'notifications' && unreadCount > 0) countHint = String(unreadCount);
          if (item.id === 'attendance' && shortageCount > 0) countHint = `${shortageCount} low`;
          if (item.id === 'sync') {
            if (user.mode === 'live') {
              countHint =
                user.erpTokenPresent && user.lmsTokenPresent
                  ? 'Both'
                  : user.lmsTokenPresent
                    ? 'LMS'
                    : 'ERP';
            } else {
              countHint = 'Sample';
            }
          }
          if (item.id === 'setup' && erpDegraded) countHint = 'Cached';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id);
                onCloseMobile();
              }}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </span>
              {countHint ? (
                <span
                  className={`font-mono text-xs tabular-nums shrink-0 ${
                    item.id === 'attendance'
                      ? 'text-red-700 dark:text-red-400'
                      : item.id === 'setup'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {countHint}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {profile?.name ?? user.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            {user.registerNumber} · {profile ? `Sem ${profile.semester}` : user.mode}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">{navContent}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            aria-hidden="true"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-72 max-w-[82vw] h-full">{navContent}</aside>
        </div>
      ) : null}
    </>
  );
}
