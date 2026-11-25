import { useEffect, useMemo, useState } from 'react';
import { Calendar, Minus, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import {
  clampAttendanceDateToToday,
  computeOverallAttendance,
  formatAttendanceDateDisplay,
  getLatestAttendanceDate,
  getTodayLocalDateKey,
  normalizeAttendanceEndDate,
  simulateAttendance,
} from '../core/attendance';
import type { AttendanceSubject } from '../core/types';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface AttendanceViewProps {
  section: SectionState<AttendanceSubject[]>;
  targetPercent: number;
  endDate: string;
  onChangeEndDate: (nextDate: string) => void;
  onChangeTarget: (target: number) => void;
  onRetry: () => void;
}

type StatusFilter = 'all' | 'attention' | 'safe';

export function AttendanceView({
  section,
  targetPercent,
  endDate,
  onChangeEndDate,
  onChangeTarget,
  onRetry,
}: AttendanceViewProps) {
  const todayKey = useMemo(() => getTodayLocalDateKey(), []);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [draftEndDate, setDraftEndDate] = useState<string>(endDate);
  const [deltas, setDeltas] = useState<Record<string, { present: number; absent: number }>>({});

  useEffect(() => {
    setDraftEndDate(endDate);
  }, [endDate]);

  const subjects = section.envelope?.data ?? [];
  const isCustomPastDate = endDate !== todayKey;
  const activeCutoffDisplay = useMemo(() => formatAttendanceDateDisplay(endDate), [endDate]);
  const latestDateInfo = useMemo(() => getLatestAttendanceDate(subjects), [subjects]);

  const rows = useMemo(() => {
    return subjects.map((subject) => {
      const delta = deltas[subject.courseCode] ?? { present: 0, absent: 0 };
      const sim = simulateAttendance(subject, delta.present, delta.absent, targetPercent);
      const cappedDate = clampAttendanceDateToToday(subject.lastUpdated);
      return { subject, delta, sim, cappedDate };
    });
  }, [subjects, deltas, targetPercent]);

  const filteredRows = useMemo(() => {
    if (filter === 'attention') return rows.filter((r) => r.sim.status !== 'safe');
    if (filter === 'safe') return rows.filter((r) => r.sim.status === 'safe');
    return rows;
  }, [rows, filter]);

  const overall = useMemo(() => {
    const adjustedSubjects = rows.map((r) => ({
      ...r.subject,
      attended: r.sim.attended,
      total: r.sim.total,
    }));
    return computeOverallAttendance(adjustedSubjects, targetPercent);
  }, [rows, targetPercent]);

  const hasAnyDelta = Object.values(deltas).some((d) => d.present > 0 || d.absent > 0);

  function adjust(code: string, field: 'present' | 'absent', step: number) {
    setDeltas((prev) => {
      const current = prev[code] ?? { present: 0, absent: 0 };
      return {
        ...prev,
        [code]: {
          ...current,
          [field]: Math.max(0, current[field] + step),
        },
      };
    });
  }

  function applyEndDate(nextRaw: string) {
    const normalized = normalizeAttendanceEndDate(nextRaw);
    setDraftEndDate(normalized);
    setDeltas({});
    onChangeEndDate(normalized);
  }

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={section.envelope?.warning}
        fetchedAt={section.envelope?.fetchedAt}
        onRetry={onRetry}
        retrying={section.loading}
      />

      {/* Header Controls */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              Attendance &amp; Bunk Calculator
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Overall{' '}
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {overall.overallPercentage.toFixed(1)}%
              </span>{' '}
              ({overall.totalAttended}/{overall.totalHeld} classes) · {overall.shortageCount} below{' '}
              {targetPercent}% · {overall.safeCount} safe
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {isCustomPastDate
                  ? `End attendance date: ${activeCutoffDisplay}`
                  : `Updated till ${latestDateInfo.formattedDate ?? activeCutoffDisplay}`}
              </span>
              <span aria-hidden="true"> · </span>
              <span>Recorded classes up to selected end date only</span>
              {hasAnyDelta ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="text-blue-700 dark:text-blue-400 font-medium">
                    What-if simulation active
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Attendance target threshold"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
            >
              {[75, 80, 85].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => onChangeTarget(pct)}
                  aria-pressed={targetPercent === pct}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium font-mono tabular-nums transition-colors whitespace-nowrap cursor-pointer ${
                    targetPercent === pct
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {pct}% target
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label="Filter subjects"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'attention', label: 'Need attention' },
                  { id: 'safe', label: 'Safe' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  aria-pressed={filter === tab.id}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    filter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {hasAnyDelta ? (
              <button
                type="button"
                onClick={() => setDeltas({})}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset what-if
              </button>
            ) : null}
          </div>
        </div>

        {/* End Attendance Date Cutoff Bar */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <label
              htmlFor="attendanceEndDate"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
            >
              <Calendar className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              End Attendance Date
            </label>
            <input
              id="attendanceEndDate"
              type="date"
              max={todayKey}
              value={draftEndDate}
              onChange={(e) => {
                const next = e.target.value;
                setDraftEndDate(next);
                if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
                  applyEndDate(next);
                }
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            <button
              type="button"
              onClick={() => applyEndDate(draftEndDate)}
              disabled={section.loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${section.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Update by Date
            </button>
            {isCustomPastDate ? (
              <button
                type="button"
                onClick={() => applyEndDate(todayKey)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                Reset to Today
              </button>
            ) : null}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Future dates are locked to today ({formatAttendanceDateDisplay(todayKey)}).
          </p>
        </div>
      </section>

      {section.loading && !section.envelope ? (
        <SectionSkeleton rows={6} />
      ) : section.error && !section.envelope ? (
        <SectionError sectionName="Attendance" message={section.error} onRetry={onRetry} />
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            No courses match this filter at {targetPercent}% target.
          </p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="mt-3 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Show all subjects
          </button>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 pl-5 pr-4">Course</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Classes</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Current %</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Bunk Calculator Verdict</th>
                  <th className="py-3.5 pl-4 pr-5 text-right whitespace-nowrap">What-if Planner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredRows.map(({ subject, delta, sim, cappedDate }) => {
                  const barColor =
                    sim.status === 'shortage'
                      ? 'bg-red-600 dark:bg-red-500'
                      : sim.status === 'borderline'
                        ? 'bg-amber-500'
                        : 'bg-emerald-600 dark:bg-emerald-500';
                  const verdictColor =
                    sim.status === 'shortage'
                      ? 'text-red-700 dark:text-red-400'
                      : sim.status === 'borderline'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400';

                  return (
                    <tr
                      key={subject.courseCode}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-4 pl-5 pr-4 min-w-[220px]">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {subject.courseName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{subject.courseCode}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{subject.faculty}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">Till {cappedDate.displayDate}</span>
                        </p>
                        <div className="mt-2 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.min(100, sim.percentage)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-4 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {sim.attended} / {sim.total}
                        {delta.present > 0 || delta.absent > 0 ? (
                          <div className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                            {delta.present > 0 ? `+${delta.present}P` : ''}
                            {delta.present > 0 && delta.absent > 0 ? ' ' : ''}
                            {delta.absent > 0 ? `+${delta.absent}A` : ''}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-50 whitespace-nowrap">
                        {sim.percentage.toFixed(1)}%
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${verdictColor}`}>{sim.verdict}</span>
                      </td>

                      <td className="py-4 pl-4 pr-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => adjust(subject.courseCode, 'present', 1)}
                            aria-label={`Simulate attending 1 more class of ${subject.courseName}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                            Attend
                          </button>
                          <button
                            type="button"
                            onClick={() => adjust(subject.courseCode, 'absent', 1)}
                            aria-label={`Simulate skipping 1 class of ${subject.courseName}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Minus className="h-3 w-3" aria-hidden="true" />
                            Skip
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>
              Actual attendance counts include only classes conducted up to{' '}
              {isCustomPastDate ? activeCutoffDisplay : (latestDateInfo.formattedDate ?? activeCutoffDisplay)}.
            </span>
            <span>What-if controls simulate upcoming classes locally without changing recorded counts.</span>
          </div>
        </section>
      )}
    </div>
  );
}
