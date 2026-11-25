import { Menu, Moon, RefreshCw, Search, Sun } from 'lucide-react';
import type { NavSection } from '../core/types';

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Overview',
  attendance: 'Attendance',
  timetable: 'Timetable',
  results: 'Results & CGPA',
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
    <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
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
            Portal
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
            /
          </span>
          <h1 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-50 truncate">
            {SECTION_TITLES[activeSection]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open command palette"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Sync LMS &amp; ERP</span>
        </button>

        <button
          type="button"
          onClick={onRefreshAll}
          disabled={refreshing}
          aria-label="Refresh portal data"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
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
