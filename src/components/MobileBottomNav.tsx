import {
  Award,
  Calendar,
  CheckSquare,
  LayoutDashboard,
  Menu,
} from 'lucide-react';
import type { NavSection } from '../core/types';

interface MobileBottomNavProps {
  activeSection: NavSection;
  shortageCount: number;
  onSelect: (section: NavSection) => void;
  onOpenMore: () => void;
}

const PRIMARY_TABS: {
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: 'overview', label: 'Home', icon: LayoutDashboard },
  { id: 'attendance', label: 'Attendance', icon: CheckSquare },
  { id: 'marks', label: 'Marks', icon: Award },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
];

export function MobileBottomNav({
  activeSection,
  shortageCount,
  onSelect,
  onOpenMore,
}: MobileBottomNavProps) {
  const isMoreActive =
    !PRIMARY_TABS.some((tab) => tab.id === activeSection) &&
    activeSection !== 'attendance-trends';

  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-16 max-w-xl mx-auto">
        {PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            activeSection === tab.id ||
            (tab.id === 'attendance' && activeSection === 'attendance-trends');

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
                active
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {active ? (
                <span
                  className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
                  aria-hidden="true"
                />
              ) : null}
              <span className="relative inline-flex">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {tab.id === 'attendance' && shortageCount > 0 ? (
                  <span
                    className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-[10px] font-mono font-bold text-white flex items-center justify-center tabular-nums"
                    aria-label={`${shortageCount} below threshold`}
                  >
                    {shortageCount}
                  </span>
                ) : null}
              </span>
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
            isMoreActive
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          {isMoreActive ? (
            <span
              className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
              aria-hidden="true"
            />
          ) : null}
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
