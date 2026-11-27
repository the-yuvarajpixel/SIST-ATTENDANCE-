import { Menu, Moon, RefreshCw, Search, Sun } from 'lucide-react';
import type { NavSection } from '../core/types';

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Overview',
  attendance: 'Attendance',
  'attendance-trends': '30-Day Daily Attendance Trends',
  timetable: 'Timetable',
  marks: 'Marks (CAE)',
  results: 'CGPA Planner & Results',
  deadlines: 'Deadlines',
  notifications: 'Notifications',
  sync: 'Sync LMS & ERP',
  'live-guide': 'Live Login Guide',
  setup: 'Setup & Health',
};

interface TopBarProps {
  activeSection: NavSection;
  theme: 'light' | 'dark';
  refreshing: boolean;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onOpenSync: () => void;
  onRefreshAll: () => void;
  onOpenMobileMenu: () => void;
}

export function TopBar({
  activeSection,
  theme,
  refreshing,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenSync,
  onRefreshAll,
  onOpenMobileMenu,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer shrink-0"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
            SIST Portal
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
            /
          </span>
          <h1 className="font-display text-sm sm:text-[15px] font-semibold text-slate-900 dark:text-slate-50 truncate">
            {SECTION_TITLES[activeSection]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open command palette"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700/90 bg-slate-50/80 dark:bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden md:inline font-mono text-[11px] text-slate-400 dark:text-slate-500">
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={onOpenSync}
          aria-label="Sync Moodle LMS and College ERP"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Sync LMS &amp; ERP</span>
        </button>

        <button
          type="button"
          onClick={onRefreshAll}
          disabled={refreshing}
          aria-label="Refresh portal data"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="hidden md:inline">Refresh</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
