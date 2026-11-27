import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookmarkCheck,
  CalendarDays,
  CheckCircle2,
  Database,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  compute30DayTrendSummary,
  selectLast30DaySnapshots,
  type DailyAttendanceSnapshot,
  type DailyTrendPoint,
} from '../core/attendanceSnapshots';
import { formatAttendanceDateDisplay } from '../core/attendance';
import type { AttendanceSubject, NavSection } from '../core/types';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface AttendanceTrendsViewProps {
  section: SectionState<AttendanceSubject[]>;
  snapshots: DailyAttendanceSnapshot[];
  targetPercent: number;
  endDate: string;
  onChangeTarget: (target: number) => void;
  onCaptureSnapshot: () => void;
  onResetSnapshots: () => void;
  onInspectDate: (dateKey: string) => void;
  onNavigate: (section: NavSection) => void;
  onRetry: () => void;
}

type SeriesDisplayMode = 'both' | 'overall' | 'daily';

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyTrendPoint }>;
  targetPercent: number;
}

function DailyTrendTooltip({ active, payload, targetPercent }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 max-w-[270px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-display font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">
          {pt.dayName ? `${pt.dayName}, ${pt.shortDate}` : pt.shortDate}
        </span>
        <span
          className={`text-[11px] font-medium ${
            pt.source === 'live-snapshot'
              ? 'text-blue-700 dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {pt.source === 'live-snapshot' ? 'Live snapshot' : 'History'}
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 font-mono tabular-nums">
        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Day Classes</span>
        <span className="text-right font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">
          {pt.dayTotal > 0 ? `${pt.dayPresent}/${pt.dayTotal}` : 'No class'}
        </span>

        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Daily Rate</span>
        <span
          className={`text-right font-semibold whitespace-nowrap ${
            pt.dailyPercentage === null
              ? 'text-slate-500 dark:text-slate-400'
              : pt.dailyPercentage < targetPercent
                ? 'text-red-700 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {pt.dailyPercentage === null ? '—' : `${pt.dailyPercentage.toFixed(1)}%`}
        </span>

        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Overall %</span>
        <span
          className={`text-right font-semibold whitespace-nowrap ${
            pt.overallPercentage < targetPercent
              ? 'text-red-700 dark:text-red-400'
              : 'text-slate-900 dark:text-slate-50'
          }`}
        >
          {pt.overallPercentage.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: DailyTrendPoint;
  targetPercent: number;
}

function OverallLineDot({ cx, cy, payload, targetPercent }: CustomDotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null;
  if (payload.overallPercentage < targetPercent) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--chart-warning)"
        stroke="var(--chart-dot-fill)"
        strokeWidth={1.75}
      />
    );
  }
  if (payload.source === 'live-snapshot') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--chart-actual)"
        stroke="var(--chart-dot-fill)"
        strokeWidth={1.75}
      />
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={2.5}
      fill="var(--chart-dot-fill)"
      stroke="var(--chart-actual)"
      strokeWidth={1.5}
    />
  );
}

export function AttendanceTrendsView({
  section,
  snapshots,
  targetPercent,
  endDate,
  onChangeTarget,
  onCaptureSnapshot,
  onResetSnapshots,
  onInspectDate,
  onNavigate,
  onRetry,
}: AttendanceTrendsViewProps) {
  const [subjectScope, setSubjectScope] = useState<string>('all');
  const [seriesMode, setSeriesMode] = useState<SeriesDisplayMode>('both');
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);

  const subjects = section.envelope?.data ?? [];
  const effectiveSubject =
    subjectScope === 'all' || subjects.some((s) => s.courseCode === subjectScope)
      ? subjectScope
      : 'all';

  const window30 = useMemo(
    () => selectLast30DaySnapshots(snapshots, endDate),
    [snapshots, endDate]
  );

  const summary = useMemo(
    () => compute30DayTrendSummary(window30, targetPercent, effectiveSubject),
    [window30, targetPercent, effectiveSubject]
  );

  const yDomain = useMemo<[number, number]>(() => {
    if (summary.points.length === 0) return [40, 100];
    const values: number[] = [targetPercent];
    for (const pt of summary.points) {
      if (seriesMode !== 'daily') values.push(pt.overallPercentage);
      if (seriesMode !== 'overall' && pt.dailyPercentage !== null) {
        values.push(pt.dailyPercentage);
      }
    }
    const minVal = Math.min(...values);
    const floor = Math.max(0, Math.floor((minVal - 10) / 10) * 10);
    return [Math.min(floor, 60), 100];
  }, [summary.points, targetPercent, seriesMode]);

  const selectedCourseLabel = useMemo(() => {
    if (effectiveSubject === 'all') return 'Overall Attendance';
    const match = subjects.find((s) => s.courseCode === effectiveSubject);
    return match ? `${match.courseCode} · ${match.courseName}` : effectiveSubject;
  }, [effectiveSubject, subjects]);

  const newestFirstPoints = useMemo(
    () => [...summary.points].reverse(),
    [summary.points]
  );

  function handleSaveSnapshotNow() {
    onCaptureSnapshot();
    const stamp = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setCaptureFeedback(
      `Saved ${formatAttendanceDateDisplay(endDate)} snapshot to browser local storage at ${stamp}.`
    );
  }

  function handleResetHistory() {
    onResetSnapshots();
    setCaptureFeedback('Rebuilt the 30-day local storage snapshot history from current attendance records.');
  }

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={section.envelope?.warning}
        fetchedAt={section.envelope?.fetchedAt}
        onRetry={onRetry}
        retrying={section.loading}
      />

      {/* Header & Snapshot Actions */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              30-Day Daily Attendance Trends
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Visualizes day-by-day class attendance and overall progress over the last 30 days using historical snapshots saved in browser local storage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleSaveSnapshotNow}
              disabled={subjects.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Save Today&apos;s Snapshot
            </button>
            <button
              type="button"
              onClick={handleResetHistory}
              disabled={subjects.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh 30-Day History
            </button>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Day-by-Day Log</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {captureFeedback ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-3"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{captureFeedback}</span>
          </span>
          <button
            type="button"
            onClick={() => setCaptureFeedback(null)}
            className="font-medium underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {section.loading && !section.envelope ? (
        <SectionSkeleton rows={6} />
      ) : section.error && !section.envelope ? (
        <SectionError sectionName="30-Day Attendance Trends" message={section.error} onRetry={onRetry} />
      ) : summary.points.length === 0 ? (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            No attendance snapshots stored yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sync your attendance or click Save Today&apos;s Snapshot to begin tracking 30-day progress locally.
          </p>
        </section>
      ) : (
        <>
          {/* 4-column Summary KPI Strip */}
          <section
            aria-label="30-day attendance progress summary"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                30-Day Net Progress
              </p>
              <p
                className={`mt-2 font-mono text-2xl font-bold tabular-nums inline-flex items-center gap-1.5 ${
                  summary.deltaPts >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                {summary.deltaPts >= 0 ? (
                  <TrendingUp className="h-5 w-5 shrink-0" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-5 w-5 shrink-0" aria-hidden="true" />
                )}
                {summary.deltaPts >= 0 ? '+' : ''}
                {summary.deltaPts.toFixed(1)} pts
              </p>
              <p className="mt-1.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {summary.startOverallPct.toFixed(1)}% → {summary.latestOverallPct.toFixed(1)}%
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                30-Day Daily Class Avg
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {summary.averageDailyPct.toFixed(1)}%
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Across {summary.activeDaysCount} class {summary.activeDaysCount === 1 ? 'day' : 'days'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Days Below {targetPercent}% Target
              </p>
              <p
                className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                  summary.daysBelowTarget > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {summary.daysBelowTarget}
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                {summary.lowestDay
                  ? `Lowest: ${summary.lowestDay.dailyPercentage?.toFixed(0)}% (${summary.lowestDay.shortDate})`
                  : 'All active days on target'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Local Storage Snapshots
                </p>
                <Database className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {summary.totalStoredCount}
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {summary.liveSnapshotCount} live · {summary.totalStoredCount - summary.liveSnapshotCount} seeded
              </p>
            </div>
          </section>

          {/* Main 30-Day Line Chart Card */}
          <section
            aria-label="30-day daily attendance line chart"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                  Daily Attendance Trend Line — {selectedCourseLabel}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {summary.windowStartDate ? formatAttendanceDateDisplay(summary.windowStartDate) : '—'} to{' '}
                  {summary.windowEndDate ? formatAttendanceDateDisplay(summary.windowEndDate) : '—'} · Target {targetPercent}%
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  aria-label="Select subject for 30-day trend"
                  value={effectiveSubject}
                  onChange={(e) => setSubjectScope(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30 cursor-pointer max-w-[230px] truncate"
                >
                  <option value="all">Overall (All {subjects.length} subjects)</option>
                  {subjects.map((subj) => (
                    <option key={subj.courseCode} value={subj.courseCode}>
                      {subj.courseCode} · {subj.courseName}
                    </option>
                  ))}
                </select>

                <div
                  role="group"
                  aria-label="Chart line series"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700/70"
                >
                  {(
                    [
                      { id: 'both', label: 'Both' },
                      { id: 'overall', label: 'Overall %' },
                      { id: 'daily', label: 'Daily %' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={seriesMode === opt.id}
                      onClick={() => setSeriesMode(opt.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        seriesMode === opt.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div
                  role="group"
                  aria-label="Attendance target line"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700/70"
                >
                  {[75, 80, 85].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      aria-pressed={targetPercent === pct}
                      onClick={() => onChangeTarget(pct)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium font-mono tabular-nums transition-colors whitespace-nowrap cursor-pointer ${
                        targetPercent === pct
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5">
              {/* Inline Legend */}
              <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                {seriesMode !== 'daily' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-0.5 w-4 rounded-full bg-blue-700 dark:bg-blue-400 inline-block" aria-hidden="true" />
                    <span>Overall Attendance %</span>
                  </span>
                ) : null}
                {seriesMode !== 'overall' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-0.5 w-4 border-t-2 border-dashed border-emerald-600 dark:border-emerald-400 inline-block" aria-hidden="true" />
                    <span>Daily Classes % (day only)</span>
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-2">
                  <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-500 inline-block" aria-hidden="true" />
                  <span className="font-mono tabular-nums">{targetPercent}% Target</span>
                </span>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={summary.points}
                    margin={{ top: 12, right: 16, left: -8, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="dailyTrendOverallFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-actual)" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="var(--chart-actual)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--chart-grid)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="shortDate"
                      tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--chart-grid)' }}
                      minTickGap={24}
                    />
                    <YAxis
                      domain={yDomain}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={46}
                    />
                    <Tooltip content={<DailyTrendTooltip targetPercent={targetPercent} />} />
                    <ReferenceLine
                      y={targetPercent}
                      stroke="var(--chart-warning)"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                    {seriesMode !== 'daily' ? (
                      <Area
                        type="monotone"
                        dataKey="overallPercentage"
                        stroke="none"
                        fill="url(#dailyTrendOverallFill)"
                        isAnimationActive={false}
                      />
                    ) : null}
                    {seriesMode !== 'daily' ? (
                      <Line
                        type="monotone"
                        dataKey="overallPercentage"
                        name="Overall %"
                        stroke="var(--chart-actual)"
                        strokeWidth={2.5}
                        dot={(props) => (
                          <OverallLineDot
                            key={`dot-${props.payload?.dateKey ?? props.index}`}
                            cx={props.cx}
                            cy={props.cy}
                            payload={props.payload}
                            targetPercent={targetPercent}
                          />
                        )}
                        activeDot={{ r: 5, fill: 'var(--chart-actual)', stroke: 'var(--chart-dot-fill)', strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    ) : null}
                    {seriesMode !== 'overall' ? (
                      <Line
                        type="monotone"
                        dataKey="dailyPercentage"
                        name="Daily Classes %"
                        stroke="#059669"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        connectNulls
                        dot={{ r: 2.5, fill: 'var(--chart-dot-fill)', stroke: '#059669', strokeWidth: 1.5 }}
                        activeDot={{ r: 4.5, fill: '#059669', stroke: 'var(--chart-dot-fill)', strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* 30-Day Local Storage Snapshot Table */}
          <section
            aria-label="Stored 30-day attendance snapshots"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                    Historical Daily Snapshots (Last 30 Days)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Day-by-day class counts stored locally in your browser — click Inspect Day to view full subject breakdown.
                  </p>
                </div>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {newestFirstPoints.length} daily records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                    <th className="py-3 pl-5 pr-4 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium text-right whitespace-nowrap">Day Classes</th>
                    <th className="py-3 px-4 font-medium text-right whitespace-nowrap">Daily %</th>
                    <th className="py-3 px-4 font-medium text-right whitespace-nowrap">Overall %</th>
                    <th className="py-3 px-4 font-medium whitespace-nowrap">Snapshot Source</th>
                    <th className="py-3 pl-4 pr-5 font-medium text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {newestFirstPoints.map((pt) => {
                    const dailyTone =
                      pt.dailyPercentage === null
                        ? 'text-slate-400 dark:text-slate-500'
                        : pt.dailyPercentage < targetPercent
                          ? 'text-red-700 dark:text-red-400 font-semibold'
                          : pt.dailyPercentage === 100
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-amber-700 dark:text-amber-400 font-semibold';
                    const overallTone =
                      pt.overallPercentage < targetPercent
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-slate-900 dark:text-slate-100';

                    return (
                      <tr key={pt.dateKey} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pl-5 pr-4 whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                          {pt.dayName ? `${pt.dayName}, ${pt.shortDate}` : pt.shortDate}
                          <span className="ml-2 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                            {pt.dateKey}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          {pt.dayTotal > 0 ? `${pt.dayPresent} / ${pt.dayTotal}` : 'No class'}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap ${dailyTone}`}>
                          {pt.dailyPercentage === null ? '—' : `${pt.dailyPercentage.toFixed(1)}%`}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${overallTone}`}>
                          {pt.overallPercentage.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={
                              pt.source === 'live-snapshot'
                                ? 'font-medium text-blue-700 dark:text-blue-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            {pt.source === 'live-snapshot' ? 'Live snapshot' : 'Historical'}
                          </span>
                        </td>
                        <td className="py-3 pl-4 pr-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onInspectDate(pt.dateKey)}
                            className="font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Inspect Day
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
