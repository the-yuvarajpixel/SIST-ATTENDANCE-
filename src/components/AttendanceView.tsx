import { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  buildDailyAttendanceLog,
  buildTodayHourWiseLog,
  computeAttendanceStats,
  formatAttendanceDateDisplay,
  formatSmartSkipAttendText,
  getTodayLocalDateKey,
  normalizeAttendanceEndDate,
  shiftAttendanceDateKey,
  simulateAttendance,
} from '../core/attendance';
import type { AttendanceSubject, NavSection, TimetableSlot } from '../core/types';
import { AttendanceRing } from './AttendanceRing';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface AttendanceViewProps {
  section: SectionState<AttendanceSubject[]>;
  timetable: TimetableSlot[];
  targetPercent: number;
  endDate: string;
  onChangeEndDate: (nextDate: string) => void;
  onChangeTarget: (next: number) => void;
  onNavigate?: (section: NavSection) => void;
  onRetry: () => void;
}

interface SimDelta {
  present: number;
  absent: number;
}

const TARGET_PRESETS = [75, 80, 85] as const;

export function AttendanceView({
  section,
  timetable,
  targetPercent,
  endDate,
  onChangeEndDate,
  onChangeTarget,
  onNavigate,
  onRetry,
}: AttendanceViewProps) {
  const [simMap, setSimMap] = useState<Record<string, SimDelta>>({});
  const [logCourseFilter, setLogCourseFilter] = useState<string>('all');
  const [showAllDays, setShowAllDays] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<'all' | 'below' | 'safe'>('all');

  const subjects = section.envelope?.data ?? [];
  const todayDateKey = getTodayLocalDateKey();
  const activeEndDate = normalizeAttendanceEndDate(endDate);
  const isAtToday = activeEndDate >= todayDateKey;

  const hasSimulations = Object.values(simMap).some((d) => d.present > 0 || d.absent > 0);

  function bumpSim(code: string, field: 'present' | 'absent', delta: number) {
    setSimMap((prev) => {
      const current = prev[code] ?? { present: 0, absent: 0 };
      const nextVal = Math.max(0, Math.min(30, current[field] + delta));
      return {
        ...prev,
        [code]: { ...current, [field]: nextVal },
      };
    });
  }

  function setSliderSim(code: string, sliderValue: number) {
    const val = Math.trunc(sliderValue);
    setSimMap((prev) => {
      if (val === 0) {
        const next = { ...prev };
        delete next[code];
        return next;
      }
      return {
        ...prev,
        [code]: val > 0 ? { present: val, absent: 0 } : { present: 0, absent: Math.abs(val) },
      };
    });
  }

  function resetSubjectSim(code: string) {
    setSimMap((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }

  function resetAllSim() {
    setSimMap({});
  }

  const rows = useMemo(() => {
    return subjects.map((subject) => {
      const sim = simMap[subject.courseCode] ?? { present: 0, absent: 0 };
      const base = computeAttendanceStats(subject.attended, subject.total, targetPercent);
      const effective = simulateAttendance(subject, sim.present, sim.absent, targetPercent);
      const isSimulated = sim.present > 0 || sim.absent > 0;
      const netSlider = Math.max(-8, Math.min(10, sim.present - sim.absent));
      return { subject, sim, base, effective, isSimulated, netSlider };
    });
  }, [subjects, simMap, targetPercent]);

  const filteredRows = useMemo(() => {
    if (subjectFilter === 'below') {
      return rows.filter((r) => r.effective.status === 'shortage' || r.effective.status === 'borderline');
    }
    if (subjectFilter === 'safe') {
      return rows.filter((r) => r.effective.status === 'safe');
    }
    return rows;
  }, [rows, subjectFilter]);

  const overallEffective = useMemo(() => {
    let attended = 0;
    let total = 0;
    let shortage = 0;
    let borderline = 0;
    let safe = 0;

    for (const r of rows) {
      attended += r.effective.attended;
      total += r.effective.total;
      if (r.effective.status === 'shortage') shortage += 1;
      else if (r.effective.status === 'borderline') borderline += 1;
      else safe += 1;
    }

    const pct = total > 0 ? Math.round((attended / total) * 1000) / 10 : 100;
    const stats = computeAttendanceStats(attended, total, targetPercent);
    return { attended, total, pct, shortage, borderline, safe, stats };
  }, [rows, targetPercent]);

  const todayHourWiseLog = useMemo(
    () =>
      buildTodayHourWiseLog(subjects, timetable, {
        endDate: activeEndDate,
        targetPercent,
      }),
    [subjects, timetable, activeEndDate, targetPercent]
  );

  const todayStatusByCode = useMemo(() => {
    const map = new Map<string, 'present' | 'absent' | 'not-marked'>();
    for (const period of todayHourWiseLog.periods) {
      map.set(period.courseCode.trim().toUpperCase(), period.status);
    }
    return map;
  }, [todayHourWiseLog]);

  const activeLogFilter =
    logCourseFilter === 'all' || subjects.some((s) => s.courseCode === logCourseFilter)
      ? logCourseFilter
      : 'all';

  const dailyLog = useMemo(
    () =>
      buildDailyAttendanceLog(subjects, timetable, {
        endDate: activeEndDate,
        targetPercent,
        subjectCode: activeLogFilter,
      }),
    [subjects, timetable, activeEndDate, targetPercent, activeLogFilter]
  );

  const visibleDays = showAllDays ? dailyLog.days : dailyLog.days.slice(0, 7);

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={section.envelope?.warning}
        fetchedAt={section.envelope?.fetchedAt}
        onRetry={onRetry}
        retrying={section.loading}
      />

      {/* Top Hero Card: Overall 80% Attendance Ring + Target & Date Controls */}
      <section
        aria-label="Overall attendance summary"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 min-w-0">
            <AttendanceRing
              percentage={overallEffective.pct}
              targetPercent={targetPercent}
              size={118}
              strokeWidth={10}
              label="Overall"
            />

            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  Attendance Tracker
                </h2>
                {hasSimulations ? (
                  <span className="font-mono text-xs font-medium text-blue-700 dark:text-blue-400">
                    · What-If Active
                  </span>
                ) : null}
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-400">
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {overallEffective.attended} / {overallEffective.total}
                </span>{' '}
                classes attended{' '}
                <span aria-hidden="true">·</span>{' '}
                <span
                  className={
                    overallEffective.stats.status === 'shortage'
                      ? 'font-medium text-rose-700 dark:text-rose-400'
                      : overallEffective.stats.status === 'borderline'
                        ? 'font-medium text-amber-700 dark:text-amber-400'
                        : 'font-medium text-emerald-700 dark:text-emerald-400'
                  }
                >
                  {formatSmartSkipAttendText(overallEffective.stats, targetPercent)}
                </span>
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums pt-0.5">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  {overallEffective.safe} Safe (&ge;{targetPercent}%)
                </span>
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  {overallEffective.borderline} Borderline
                </span>
                <span className="text-rose-700 dark:text-rose-400 font-medium">
                  {overallEffective.shortage} Below {targetPercent}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Minimum attendance threshold"
                className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
              >
                {TARGET_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChangeTarget(preset)}
                    aria-pressed={targetPercent === preset}
                    className={`rounded-md px-2.5 py-1.5 font-mono text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                      targetPercent === preset
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>

              {onNavigate ? (
                <button
                  type="button"
                  onClick={() => onNavigate('attendance-trends')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  30-Day Trends
                </button>
              ) : null}

              {hasSimulations ? (
                <button
                  type="button"
                  onClick={resetAllSim}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset All
                </button>
              ) : null}
            </div>

            {/* Day-by-Day End Date Selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-0.5">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                End Date
              </span>
              <button
                type="button"
                onClick={() => onChangeEndDate(shiftAttendanceDateKey(activeEndDate, -1))}
                aria-label="Previous day"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <label htmlFor="attendance-end-date" className="sr-only">
                Attendance end date
              </label>
              <input
                id="attendance-end-date"
                type="date"
                max={todayDateKey}
                value={activeEndDate}
                onChange={(e) => {
                  if (e.target.value) onChangeEndDate(e.target.value);
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
              <button
                type="button"
                disabled={isAtToday}
                onClick={() => onChangeEndDate(shiftAttendanceDateKey(activeEndDate, 1))}
                aria-label="Next day"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {!isAtToday ? (
                <button
                  type="button"
                  onClick={() => onChangeEndDate(todayDateKey)}
                  className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline px-1 cursor-pointer"
                >
                  Today
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {section.loading && !section.envelope ? (
        <SectionSkeleton rows={5} />
      ) : section.error && !section.envelope ? (
        <SectionError sectionName="Attendance" message={section.error} onRetry={onRetry} />
      ) : subjects.length === 0 ? (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No attendance records available for this term.
          </p>
        </section>
      ) : (
        <>
          {/* Today's Log: Daily & Hour-Wise Period Status */}
          <section
            aria-label="Today's daily and hour-wise attendance log"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                    {todayHourWiseLog.isToday ? "Today's Log" : `Day Log · ${todayHourWiseLog.displayDate}`}
                  </h3>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {todayHourWiseLog.dayName}, {todayHourWiseLog.displayDate}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Daily summary &amp; hour-wise attendance status (Present / Absent / Not Marked)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums shrink-0">
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {todayHourWiseLog.presentCount} Present
                </span>
                <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-medium">
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {todayHourWiseLog.absentCount} Absent
                </span>
                <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {todayHourWiseLog.notMarkedCount} Not Marked
                </span>
              </div>
            </div>

            {/* Compact Periods 1–6 (P / A / —) Hour-wise Strip */}
            <div
              aria-label="Today's periods 1 to 6 hour-wise status strip"
              className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3"
            >
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Periods 1–6 Hour-wise Strip
              </span>
              <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                {[1, 2, 3, 4, 5, 6].map((slotNum) => {
                  const period = todayHourWiseLog.periods[slotNum - 1];
                  const mark =
                    period?.status === 'present'
                      ? 'P'
                      : period?.status === 'absent'
                        ? 'A'
                        : '—';
                  const cellClass =
                    mark === 'P'
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-700 dark:text-emerald-400'
                      : mark === 'A'
                        ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/35 text-rose-700 dark:text-rose-400'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500';
                  return (
                    <div
                      key={slotNum}
                      title={
                        period
                          ? `Period ${slotNum}: ${period.courseCode} (${period.status})`
                          : `Period ${slotNum}: Not scheduled / Not marked`
                      }
                      className={`rounded-md border px-2 py-1 text-center font-mono text-xs font-bold tabular-nums min-w-[38px] ${cellClass}`}
                    >
                      <span className="block text-[9px] font-medium opacity-70">P{slotNum}</span>
                      <span>{mark}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {todayHourWiseLog.periods.length === 0 ? (
              <div className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
                No periods scheduled on {todayHourWiseLog.dayName} ({todayHourWiseLog.displayDate}). Switch the End Date above to inspect any working day.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:gap-px bg-slate-200 dark:bg-slate-800">
                {todayHourWiseLog.periods.map((period) => {
                  const statusColor =
                    period.status === 'present'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : period.status === 'absent'
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400';

                  const statusBorder =
                    period.status === 'present'
                      ? 'border-l-emerald-600 dark:border-l-emerald-500'
                      : period.status === 'absent'
                        ? 'border-l-rose-600 dark:border-l-rose-500'
                        : 'border-l-slate-300 dark:border-l-slate-700';

                  const statusLabel =
                    period.status === 'present'
                      ? 'Present'
                      : period.status === 'absent'
                        ? 'Absent'
                        : 'Not Marked';

                  return (
                    <div
                      key={period.id}
                      className={`bg-white dark:bg-slate-900 p-4 border-l-4 ${statusBorder} flex flex-col justify-between gap-2`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                          Hr {period.periodNumber} · {period.slotTime}
                        </span>
                        <span className={`text-xs font-semibold ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {period.courseName}
                        </p>
                        <p className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {period.courseCode} · {period.room}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Subject-Wise Breakdown & Interactive Bunk Calculator */}
          <section aria-label="Subject-wise attendance breakdown and bunk calculator" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-50">
                  Subject-Wise Breakdown &amp; Bunk Calculator
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Test future skips or attendance streaks with +1 Present / +1 Absent or the interactive What-If slider on each subject.
                </p>
              </div>

              <div
                role="group"
                aria-label="Filter subjects by standing"
                className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto"
              >
                {(
                  [
                    { id: 'all', label: `All (${rows.length})` },
                    {
                      id: 'below',
                      label: `Watch / Below (${overallEffective.shortage + overallEffective.borderline})`,
                    },
                    { id: 'safe', label: `Safe (${overallEffective.safe})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSubjectFilter(tab.id)}
                    aria-pressed={subjectFilter === tab.id}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      subjectFilter === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No subjects match the selected filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filteredRows.map(({ subject, sim, base, effective, isSimulated, netSlider }) => {
                  const isShortage = effective.status === 'shortage';
                  const isBorderline = effective.status === 'borderline';

                  const barColorClass = isShortage
                    ? 'bg-rose-600 dark:bg-rose-500'
                    : isBorderline
                      ? 'bg-amber-500 dark:bg-amber-400'
                      : 'bg-emerald-600 dark:bg-emerald-500';

                  const pctColorClass = isShortage
                    ? 'text-rose-700 dark:text-rose-400'
                    : isBorderline
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400';

                  const smartText = formatSmartSkipAttendText(effective, targetPercent);
                  const todayCodeStatus = todayStatusByCode.get(
                    subject.courseCode.trim().toUpperCase()
                  );

                  return (
                    <article
                      key={subject.courseCode}
                      className={`rounded-xl border bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4 transition-colors ${
                        isSimulated
                          ? 'border-blue-300 dark:border-blue-800'
                          : isShortage
                            ? 'border-rose-200/90 dark:border-rose-900/60'
                            : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {/* Header: Subject Name, Code, Attended/Total, Percentage */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {subject.courseCode}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{subject.credits} cr</span>
                            {todayCodeStatus ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    todayCodeStatus === 'present'
                                      ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                      : todayCodeStatus === 'absent'
                                        ? 'text-rose-700 dark:text-rose-400 font-medium'
                                        : 'text-slate-500 dark:text-slate-400'
                                  }
                                >
                                  Today:{' '}
                                  {todayCodeStatus === 'present'
                                    ? 'Present'
                                    : todayCodeStatus === 'absent'
                                      ? 'Absent'
                                      : 'Not Marked'}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <h4 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                            {subject.courseName}
                          </h4>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                            {subject.faculty}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className={`font-mono text-2xl font-bold tabular-nums leading-none ${pctColorClass}`}>
                            {effective.percentage.toFixed(1)}%
                          </p>
                          <p className="mt-1 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                            {effective.attended} / {effective.total} classes
                          </p>
                          {isSimulated ? (
                            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-blue-700 dark:text-blue-400">
                              was {base.percentage.toFixed(1)}%
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Progress Bar with 80% Benchmark Marker & Smart Skip/Attend Verdict */}
                      <div className="space-y-2">
                        <div className="relative h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-visible">
                          <div
                            className={`h-full rounded-full transition-all duration-200 ${barColorClass}`}
                            style={{ width: `${Math.min(100, Math.max(0, effective.percentage))}%` }}
                          />
                          <div
                            className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-slate-900 dark:bg-slate-100 rounded-full"
                            style={{ left: `${targetPercent}%` }}
                            title={`${targetPercent}% minimum line`}
                            aria-hidden="true"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs">
                          <p className={`font-medium ${pctColorClass}`}>{smartText}</p>
                          <span className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                            Min {targetPercent}%
                          </span>
                        </div>
                      </div>

                      {/* Interactive What-If Simulator Controls (+1 Present / +1 Absent + Slider) */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            <span>What-If Simulator</span>
                            {isSimulated ? (
                              <span className="font-mono text-[11px] text-blue-700 dark:text-blue-400 tabular-nums">
                                ({sim.present > 0 ? `+${sim.present}P` : ''}
                                {sim.present > 0 && sim.absent > 0 ? ' ' : ''}
                                {sim.absent > 0 ? `+${sim.absent}A` : ''})
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => bumpSim(subject.courseCode, 'present', 1)}
                              aria-label={`Simulate +1 Present for ${subject.courseCode}`}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer"
                            >
                              <Plus className="h-3 w-3" aria-hidden="true" />
                              1 Present
                            </button>
                            <button
                              type="button"
                              onClick={() => bumpSim(subject.courseCode, 'absent', 1)}
                              aria-label={`Simulate +1 Absent for ${subject.courseCode}`}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 px-2.5 py-1 text-xs font-medium text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                            >
                              <Minus className="h-3 w-3" aria-hidden="true" />
                              1 Absent
                            </button>
                            {isSimulated ? (
                              <button
                                type="button"
                                onClick={() => resetSubjectSim(subject.courseCode)}
                                aria-label={`Reset simulation for ${subject.courseCode}`}
                                className="inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] tabular-nums text-rose-600 dark:text-rose-400 whitespace-nowrap">
                            Skip 8
                          </span>
                          <label htmlFor={`whatif-slider-${subject.courseCode}`} className="sr-only">
                            Simulate future classes for {subject.courseName}
                          </label>
                          <input
                            id={`whatif-slider-${subject.courseCode}`}
                            type="range"
                            min={-8}
                            max={10}
                            step={1}
                            value={netSlider}
                            onChange={(e) => setSliderSim(subject.courseCode, Number(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none bg-slate-200 dark:bg-slate-800 accent-emerald-600 dark:accent-emerald-500 cursor-pointer"
                          />
                          <span className="font-mono text-[11px] tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            Attend 10
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Day-by-Day Attendance History Ledger */}
          <section
            aria-label="Day-by-day attendance history"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                  Day-by-Day Attendance History
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  End-of-day records up to {formatAttendanceDateDisplay(activeEndDate)} ·{' '}
                  {dailyLog.fullAttendanceDays} full-attendance days · {dailyLog.daysWithAbsences} days with absences
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="daily-log-course-filter" className="sr-only">
                  Filter day-by-day history by subject
                </label>
                <select
                  id="daily-log-course-filter"
                  value={activeLogFilter}
                  onChange={(e) => setLogCourseFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                >
                  <option value="all">All subjects ({subjects.length})</option>
                  {subjects.map((s) => (
                    <option key={s.courseCode} value={s.courseCode}>
                      {s.courseCode} — {s.courseName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {visibleDays.length === 0 ? (
              <div className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
                No recorded attendance days up to {formatAttendanceDateDisplay(activeEndDate)}.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleDays.map((day) => {
                  const pctTone =
                    day.dailyPercentage < targetPercent
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400';

                  return (
                    <div
                      key={day.dateKey}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-baseline gap-3 min-w-0">
                        <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100 w-24 shrink-0">
                          {day.dayName}, {day.shortDate}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {day.entries.map((entry) => (
                            <span
                              key={`${day.dateKey}-${entry.courseCode}-${entry.slotTime ?? ''}`}
                              className="inline-flex items-center gap-1 font-mono"
                            >
                              <span
                                className={
                                  entry.status === 'present'
                                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                    : 'text-rose-700 dark:text-rose-400 font-semibold'
                                }
                              >
                                {entry.status === 'present' ? 'P' : 'A'}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {entry.courseCode}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0">
                        <span className={`font-semibold ${pctTone}`}>
                          {day.presentCount}/{day.totalCount} ({day.dailyPercentage.toFixed(0)}%)
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Cum {day.cumulativePercentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {dailyLog.days.length > 7 ? (
              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAllDays((v) => !v)}
                  className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  {showAllDays
                    ? 'Show recent 7 days'
                    : `Show all ${dailyLog.days.length} recorded days`}
                </button>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
