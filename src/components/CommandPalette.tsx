import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import type { AttendanceSubject, DeadlineItem, NavSection, NotificationItem } from '../core/types';
import { formatShortDate } from '../lib/format';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (section: NavSection) => void;
  onToggleTheme: () => void;
  onRefreshAll: () => void;
  subjects: AttendanceSubject[];
  deadlines: DeadlineItem[];
  notifications: NotificationItem[];
}

interface PaletteEntry {
  id: string;
  group: string;
  label: string;
  detail: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onToggleTheme,
  onRefreshAll,
  subjects,
  deadlines,
  notifications,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const base: PaletteEntry[] = [
      { id: 'nav-overview', group: 'Navigate', label: 'Overview Dashboard', detail: 'Next class, semester CGPA calculator, and daily summary', run: () => onNavigate('overview') },
      {
        id: 'nav-overview-cgpa',
        group: 'Tools',
        label: 'Semester-Wise CGPA Calculator',
        detail: 'Input semester grades and credit points in Overview',
        run: () => {
          onNavigate('overview');
          window.setTimeout(() => {
            document.getElementById('overview-cgpa-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        },
      },
      { id: 'nav-attendance', group: 'Navigate', label: 'Attendance & Bunk Calculator', detail: 'Check skippable classes and day-by-day updates', run: () => onNavigate('attendance') },
      { id: 'nav-attendance-trends', group: 'Navigate', label: '30-Day Daily Attendance Trends', detail: 'Line chart of daily attendance snapshots over the last 30 days', run: () => onNavigate('attendance-trends') },
      { id: 'nav-timetable', group: 'Navigate', label: 'Weekly Timetable', detail: 'Class schedule with attendance overlay', run: () => onNavigate('timetable') },
      { id: 'nav-marks', group: 'Navigate', label: 'Marks (CAE)', detail: 'Continuous assessment marks for the current term, subject by subject', run: () => onNavigate('marks') },
      { id: 'nav-results', group: 'Navigate', label: 'CGPA Planner & Results', detail: 'Target CGPA calculator, grade planner, and semester history', run: () => onNavigate('results') },
      { id: 'nav-deadlines', group: 'Navigate', label: 'Unified Deadlines', detail: 'LMS assignments, exams, and fee due dates', run: () => onNavigate('deadlines') },
      { id: 'nav-notifications', group: 'Navigate', label: 'Notifications & Circulars', detail: 'Searchable ERP and LMS feed', run: () => onNavigate('notifications') },
      { id: 'nav-sync', group: 'Navigate', label: 'Sync Moodle LMS & College ERP', detail: 'Connect portals in-place and force live sync', run: () => onNavigate('sync') },
      { id: 'nav-live-guide', group: 'Navigate', label: 'Live Login Guide', detail: 'Step-by-step Moodle LMS & College ERP setup', run: () => onNavigate('live-guide') },
      { id: 'nav-setup', group: 'Navigate', label: 'Setup & Health Diagnostics', detail: 'Check ERP/LMS readiness and resilience test', run: () => onNavigate('setup') },
      { id: 'act-theme', group: 'Action', label: 'Toggle Light / Dark Theme', detail: 'Switch portal color scheme', run: onToggleTheme },
      { id: 'act-refresh', group: 'Action', label: 'Refresh All Sections', detail: 'Re-fetch ERP and LMS data', run: onRefreshAll },
    ];

    for (const s of subjects) {
      base.push({
        id: `subj-${s.courseCode}`,
        group: 'Courses',
        label: `${s.courseName} (${s.courseCode})`,
        detail: `${s.attended}/${s.total} attended · ${s.faculty}`,
        run: () => onNavigate('attendance'),
      });
    }

    for (const d of deadlines.slice(0, 6)) {
      base.push({
        id: `dl-${d.id}`,
        group: 'Deadlines',
        label: d.title,
        detail: `${d.origin} · Due ${formatShortDate(d.dueAt)}`,
        run: () => onNavigate('deadlines'),
      });
    }

    for (const n of notifications.slice(0, 5)) {
      base.push({
        id: `nt-${n.id}`,
        group: 'Notices',
        label: n.title,
        detail: `${n.origin} · ${n.category}`,
        run: () => onNavigate('notifications'),
      });
    }

    return base;
  }, [subjects, deadlines, notifications, onNavigate, onToggleTheme, onRefreshAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 10);
    return entries
      .filter((e) => `${e.label} ${e.detail} ${e.group}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [entries, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  function executeEntry(entry: PaletteEntry | undefined) {
    if (!entry) return;
    entry.run();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/55 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                executeEntry(filtered[selectedIndex]);
              }
            }}
            placeholder="Jump to attendance, CAE marks, CGPA planner, or a deadline..."
            aria-label="Search portal commands and content"
            className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No matching views, courses, or notices for “{query}”.
            </p>
          ) : (
            <ul role="listbox" aria-label="Search results">
              {filtered.map((entry, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => executeEntry(entry)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600/10 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{entry.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {entry.group} · {entry.detail}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Use ↑ ↓ to select, Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
