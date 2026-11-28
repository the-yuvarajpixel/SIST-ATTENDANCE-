import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudCheck,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  buildDailyAttendanceLog,
  buildTodayHourWiseLog,
  formatAttendanceDateDisplay,
  getTodayLocalDateKey,
  normalizeAttendanceEndDate,
  shiftAttendanceDateKey,
} from '../core/attendance';
import {
  BORDERLINE_MARGIN_POINTS,
  calculateAttendance,
  calculateOverallAttendanceSummary,
  calculateSimulatedAttendance,
  readManualAttendanceSubjects,
  validateManualAttendanceEntry,
  writeManualAttendanceSubjects,
  type AttendanceColorBand,
} from '../core/attendanceCalculator';
import type { AttendanceSubject, NavSection, SessionUser, TimetableSlot } from '../core/types';
import { AttendanceRing } from './AttendanceRing';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface AttendanceViewProps {
  section: SectionState<AttendanceSubject[]>;
  timetable: TimetableSlot[];
  targetPercent: number;
  endDate: string;
  user?: SessionUser | null;
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

type BandFilter = 'all' | 'red' | 'amber' | 'green';

function bandTextClass(band: AttendanceColorBand): string {
  if (band === 'red') return 'text-rose-700 dark:text-rose-400';
  if (band === 'amber') return 'text-amber-700 dark:text-amber-400';
  if (band === 'green') return 'text-emerald-700 dark:text-emerald-400';
  return 'text-slate-600 dark:text-slate-400';
}

function bandBarClass(band: AttendanceColorBand): string {
  if (band === 'red') return 'bg-rose-600 dark:bg-rose-500';
  if (band === 'amber') return 'bg-amber-500 dark:bg-amber-400';
  if (band === 'green') return 'bg-emerald-600 dark:bg-emerald-500';
  return 'bg-slate-400 dark:bg-slate-600';
}

function bandBadgeClass(band: AttendanceColorBand): string {
  if (band === 'red') {
    return 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300';
  }
  if (band === 'amber') {
    return 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300';
  }
  if (band === 'green') {
    return 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300';
  }
  return 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
}

export function AttendanceView({
  section,
  timetable,
  targetPercent,
  endDate,
  user,
  onChangeEndDate,
  onChangeTarget,
  onNavigate,
  onRetry,
}: AttendanceViewProps) {
  const userStorageKey = user?.registerNumber || 'demo';
  const [simMap, setSimMap] = useState<Record<string, SimDelta>>({});
  const [logCourseFilter, setLogCourseFilter] = useState<string>('all');
  const [showAllDays, setShowAllDays] = useState(false);
  const [bandFilter, setBandFilter] = useState<BandFilter>('all');

  // Manual attendance entry state (stored strictly locally; never alters ERP records)
  const [manualSubjects, setManualSubjects] = useState<AttendanceSubject[]>(() =>
    readManualAttendanceSubjects(userStorageKey)
  );
  const [manualPanelOpen, setManualPanelOpen] = useState(false);
  const [calculatorScope, setCalculatorScope] = useState<'combined' | 'manual-only'>('combined');
  const [manualCode, setManualCode] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPresent, setManualPresent] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    setManualSubjects(readManualAttendanceSubjects(userStorageKey));
  }, [userStorageKey]);

  const erpSubjects = section.envelope?.data ?? [];
  const todayDateKey = getTodayLocalDateKey();
  const activeEndDate = normalizeAttendanceEndDate(endDate);
  const isAtToday = activeEndDate >= todayDateKey;
  const isLiveErp = Boolean(user?.mode === 'live' && user?.erpTokenPresent);
  const greenCutoff = Math.min(100, targetPercent + BORDERLINE_MARGIN_POINTS);

  // Merge ERP subjects with locally added manual subjects (manual entries never mutate ERP rows)
  const activeSubjects = useMemo(() => {
    const manualCodeSet = new Set(manualSubjects.map((s) => s.courseCode.toUpperCase()));
    if (calculatorScope === 'manual-only' && manualSubjects.length > 0) {
      return manualSubjects.map((subject) => ({ subject, isManual: true }));
    }
    const erpRows = erpSubjects
      .filter((s) => !manualCodeSet.has(s.courseCode.toUpperCase()))
      .map((subject) => ({ subject, isManual: false }));
    const manualRows = manualSubjects.map((subject) => ({ subject, isManual: true }));
    return [...erpRows, ...manualRows];
  }, [erpSubjects, manualSubjects, calculatorScope]);

  const hasSimulations = Object.values(simMap).some((d) => d.present > 0 || d.absent > 0);

  function bumpSim(code: string, field: 'present' | 'absent', delta: number) {
    setSimMap((prev) => {
      const current = prev[code] ?? { present: 0, absent: 0 };
      const nextVal = Math.max(0, Math.min(50, current[field] + delta));
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

  function handleAddManualSubject(e: FormEvent) {
    e.preventDefault();
    setManualError(null);
    const existingCodes = [
      ...erpSubjects.map((s) => s.courseCode),
      ...manualSubjects.map((s) => s.courseCode),
    ];
    const result = validateManualAttendanceEntry(
      {
        courseCode: manualCode,
        courseName: manualName,
        attended: manualPresent,
        total: manualTotal,
      },
      existingCodes,
      todayDateKey
    );

    if ('error' in result) {
      setManualError(result.error);
      return;
    }

    const next = [...manualSubjects, result.subject];
    setManualSubjects(next);
    writeManualAttendanceSubjects(userStorageKey, next);
    setManualCode('');
    setManualName('');
    setManualPresent('');
    setManualTotal('');
  }

  function handleRemoveManualSubject(courseCode: string) {
    const next = manualSubjects.filter((s) => s.courseCode !== courseCode);
    setManualSubjects(next);
    writeManualAttendanceSubjects(userStorageKey, next);
    resetSubjectSim(courseCode);
    if (next.length === 0) {
      setCalculatorScope('combined');
    }
  }

  function handleClearManualSubjects() {
    setManualSubjects([]);
    writeManualAttendanceSubjects(userStorageKey, []);
    setCalculatorScope('combined');
  }

  const rows = useMemo(() => {
    return activeSubjects.map(({ subject, isManual }) => {
      const sim = simMap[subject.courseCode] ?? { present: 0, absent: 0 };
      const base = calculateAttendance(subject.attended, subject.total, targetPercent);
      const effective = calculateSimulatedAttendance(
        subject.attended,
        subject.total,
        sim.present,
        sim.absent,
        targetPercent
      );
      const isSimulated = sim.present > 0 || sim.absent > 0;
      const netSlider = Math.max(-8, Math.min(10, sim.present - sim.absent));
      return { subject, isManual, sim, base, effective, isSimulated, netSlider };
    });
  }, [activeSubjects, simMap, targetPercent]);

  const filteredRows = useMemo(() => {
    if (bandFilter === 'all') return rows;
    return rows.filter((r) => r.effective.band === bandFilter);
  }, [rows, bandFilter]);

  // Overall attendance strictly computed as sum(attended) / sum(conducted)
  const overallSummary = useMemo(() => {
    return calculateOverallAttendanceSummary(
      rows.map((r) => ({ attended: r.effective.attended, total: r.effective.total })),
      targetPercent
    );
  }, [rows, targetPercent]);

  const todayHourWiseLog = useMemo(
    () =>
      buildTodayHourWiseLog(erpSubjects, timetable, {
        endDate: activeEndDate,
        targetPercent,
      }),
    [erpSubjects, timetable, activeEndDate, targetPercent]
  );

  const todayStatusByCode = useMemo(() => {
    const map = new Map<string, 'present' | 'absent' | 'not-marked'>();
    for (const period of todayHourWiseLog.periods) {
      map.set(period.courseCode.trim().toUpperCase(), period.status);
    }
    return map;
  }, [todayHourWiseLog]);

  const activeLogFilter =
    logCourseFilter === 'all' || erpSubjects.some((s) => s.courseCode === logCourseFilter)
      ? logCourseFilter
      : 'all';

  const dailyLog = useMemo(
    () =>
      buildDailyAttendanceLog(erpSubjects, timetable, {
        endDate: activeEndDate,
        targetPercent,
        subjectCode: activeLogFilter,
      }),
    [erpSubjects, timetable, activeEndDate, targetPercent, activeLogFilter]
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

      {/* Authorized ERP / Demo Source Strip + Manual Entry Trigger */}
      <section
        aria-label="Attendance data source and calculator controls"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs min-w-0">
          <CloudCheck
            className={`h-4 w-4 shrink-0 ${
              isLiveErp
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
            aria-hidden="true"
          />
          <span
            className={`font-semibold ${
              isLiveErp
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            {isLiveErp
              ? 'Live Sathyabama ERP (erp.sathyabama.ac.in)'
              : 'Demo Mode · Sample ERP Attendance'}
          </span>
          <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            What-If simulations &amp; manual entries never modify actual ERP records
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isLiveErp ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={section.loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${section.loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh ERP
            </button>
          ) : onNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate('sync')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Connect Live ERP
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setManualPanelOpen((open) => !open)}
            aria-expanded={manualPanelOpen}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              manualPanelOpen
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white'
            }`}
          >
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            {manualPanelOpen ? 'Close Manual Entry' : 'Manual Entry'}
            {manualSubjects.length > 0 ? ` (${manualSubjects.length})` : ''}
          </button>
        </div>
      </section>

      {/* Top Hero Card: Real-Time Overall Attendance Ring + Exact Totals + Controls */}
      <section
        aria-label="Overall attendance summary"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 min-w-0">
            <AttendanceRing
              percentage={overallSummary.stats.percentage}
              targetPercent={targetPercent}
              band={overallSummary.stats.band}
              hasClasses={overallSummary.stats.hasClasses}
              size={122}
              strokeWidth={10}
              label="Overall"
            />

            <div className="space-y-2.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  Attendance Calculator
                </h2>
                {hasSimulations ? (
                  <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                    · What-If Active
                  </span>
                ) : null}
              </div>

              <p className={`text-sm font-medium ${bandTextClass(overallSummary.stats.band)}`}>
                {overallSummary.stats.guidanceText}
              </p>

              {/* Explicit Overall Present / Absent / Total Breakdown */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <span>
                  Total:{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {overallSummary.total}
                  </strong>
                </span>
                <span>
                  Present:{' '}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {overallSummary.attended}
                  </strong>
                </span>
                <span>
                  Absent:{' '}
                  <strong className="text-rose-700 dark:text-rose-400">
                    {overallSummary.absent}
                  </strong>
                </span>
                <span>
                  Overall:{' '}
                  <strong className={bandTextClass(overallSummary.stats.band)}>
                    {overallSummary.stats.formattedPercentage}
                  </strong>
                </span>
              </div>

              {/* Exact Green / Amber / Red Band Legend Counts */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums pt-0.5">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  {overallSummary.greenCount} Above {greenCutoff}%
                </span>
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  {overallSummary.amberCount} {targetPercent}%–{greenCutoff}%
                </span>
                <span className="text-rose-700 dark:text-rose-400 font-medium">
                  {overallSummary.redCount} Below {targetPercent}%
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

      {/* Manual Attendance Entry Panel */}
      {manualPanelOpen ? (
        <section
          aria-label="Manual attendance entry"
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                Manual Attendance Entry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add custom subjects to calculate 80% skip/attend projections locally without altering ERP data. Zero conducted classes (0/0) are supported.
              </p>
            </div>
            {manualSubjects.length > 0 ? (
              <div className="flex items-center gap-2 shrink-0">
                <div
                  role="group"
                  aria-label="Calculator dataset scope"
                  className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
                >
                  <button
                    type="button"
                    onClick={() => setCalculatorScope('combined')}
                    aria-pressed={calculatorScope === 'combined'}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                      calculatorScope === 'combined'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    ERP + Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalculatorScope('manual-only')}
                    aria-pressed={calculatorScope === 'manual-only'}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                      calculatorScope === 'manual-only'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Manual Only
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleClearManualSubjects}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear Manual
                </button>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleAddManualSubject} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-2">
              <label
                htmlFor="manual-subject-code"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Subject Code
              </label>
              <input
                id="manual-subject-code"
                type="text"
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value);
                  if (manualError) setManualError(null);
                }}
                placeholder="SCSA1608"
                maxLength={20}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono uppercase text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div className="lg:col-span-4">
              <label
                htmlFor="manual-subject-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Subject Name
              </label>
              <input
                id="manual-subject-name"
                type="text"
                value={manualName}
                onChange={(e) => {
                  setManualName(e.target.value);
                  if (manualError) setManualError(null);
                }}
                placeholder="Cyber Security Fundamentals"
                maxLength={100}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="manual-present-classes"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Present Classes
              </label>
              <input
                id="manual-present-classes"
                type="number"
                inputMode="numeric"
                min={0}
                max={500}
                step={1}
                value={manualPresent}
                onChange={(e) => {
                  setManualPresent(e.target.value);
                  if (manualError) setManualError(null);
                }}
                placeholder="24"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="manual-total-classes"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Total Classes
              </label>
              <input
                id="manual-total-classes"
                type="number"
                inputMode="numeric"
                min={0}
                max={500}
                step={1}
                value={manualTotal}
                onChange={(e) => {
                  setManualTotal(e.target.value);
                  if (manualError) setManualError(null);
                }}
                placeholder="30"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 px-3 py-2 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Subject
              </button>
            </div>
          </form>

          {manualError ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{manualError}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {section.loading && !section.envelope && manualSubjects.length === 0 ? (
        <SectionSkeleton rows={5} />
      ) : section.error && !section.envelope && manualSubjects.length === 0 ? (
        <SectionError sectionName="Attendance" message={section.error} onRetry={onRetry} />
      ) : activeSubjects.length === 0 ? (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No attendance records available for this term yet.
          </p>
          <button
            type="button"
            onClick={() => setManualPanelOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer"
          >
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            Add Manual Subject
          </button>
        </section>
      ) : (
        <>
          {/* Today's Hour-Wise Attendance (Periods 1–6) */}
          <section
            aria-label="Today's daily and hour-wise attendance log"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                    {todayHourWiseLog.isToday ? "Today's Hour-Wise Attendance" : `Day Log · ${todayHourWiseLog.displayDate}`}
                  </h3>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {todayHourWiseLog.dayName}, {todayHourWiseLog.displayDate}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Periods 1–6 attendance status (Present / Absent / Not Marked)
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

            {/* Periods 1–6 Compact Status Strip */}
            <div
              aria-label="Today's periods 1 to 6 hour-wise status strip"
              className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3"
            >
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Periods 1–6 Strip
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
                {todayHourWiseLog.periods.slice(0, 6).map((period) => {
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
                          P{period.periodNumber} · {period.slotTime}
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

          {/* Subject-Wise Breakdown & Interactive What-If Attendance Calculator */}
          <section aria-label="Subject-wise attendance calculator" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-50">
                  Subject-Wise Breakdown &amp; What-If Simulator
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click + Present, + Absent, or Reset on any subject to recalculate both subject and overall attendance instantly.
                </p>
              </div>

              <div
                role="group"
                aria-label="Filter subjects by attendance color band"
                className="inline-flex flex-wrap items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto"
              >
                {(
                  [
                    { id: 'all', label: `All (${rows.length})` },
                    { id: 'red', label: `<${targetPercent}% (${overallSummary.redCount})` },
                    {
                      id: 'amber',
                      label: `${targetPercent}–${greenCutoff}% (${overallSummary.amberCount})`,
                    },
                    { id: 'green', label: `>${greenCutoff}% (${overallSummary.greenCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBandFilter(tab.id)}
                    aria-pressed={bandFilter === tab.id}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      bandFilter === tab.id
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
                No subjects match the selected standing filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filteredRows.map(({ subject, isManual, sim, base, effective, isSimulated, netSlider }) => {
                  const pctColorClass = bandTextClass(effective.band);
                  const barColorClass = bandBarClass(effective.band);
                  const todayCodeStatus = todayStatusByCode.get(
                    subject.courseCode.trim().toUpperCase()
                  );

                  return (
                    <article
                      key={subject.courseCode}
                      className={`rounded-xl border bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4 transition-colors ${
                        isSimulated
                          ? 'border-blue-300 dark:border-blue-800'
                          : effective.band === 'red'
                            ? 'border-rose-200/90 dark:border-rose-900/60'
                            : effective.band === 'amber'
                              ? 'border-amber-200/90 dark:border-amber-900/50'
                              : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {/* Header: Code, Name, Status & Percentage (2dp) */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {subject.courseCode}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{subject.credits} cr</span>
                            {isManual ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-blue-700 dark:text-blue-400 font-medium">
                                  Manual
                                </span>
                              </>
                            ) : null}
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

                        <div className="text-right shrink-0 flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <p className={`font-mono text-2xl font-bold tabular-nums leading-none ${pctColorClass}`}>
                              {effective.formattedPercentage}
                            </p>
                            {isManual ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveManualSubject(subject.courseCode)}
                                aria-label={`Remove manual subject ${subject.courseCode}`}
                                className="rounded-md p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${bandBadgeClass(
                              effective.band
                            )}`}
                          >
                            {effective.statusLabel}
                          </span>
                          {isSimulated ? (
                            <p className="font-mono text-[11px] tabular-nums text-blue-700 dark:text-blue-400">
                              was {base.formattedPercentage}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Explicit Total / Present / Absent Count Grid */}
                      <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
                        <div className="px-3 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Total
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {effective.total}
                          </p>
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Present
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {effective.attended}
                          </p>
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Absent
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                            {effective.absent}
                          </p>
                        </div>
                      </div>

                      {/* Dynamic Attendance Progress Bar + Exact Formula Verdict */}
                      <div className="space-y-2">
                        <div
                          role="progressbar"
                          aria-label={`${subject.courseName} attendance`}
                          aria-valuenow={Number(effective.percentage.toFixed(2))}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="relative h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-visible"
                        >
                          <div
                            className={`h-full rounded-full transition-all duration-200 ${barColorClass}`}
                            style={{
                              width: `${effective.hasClasses ? Math.min(100, Math.max(0, effective.percentage)) : 0}%`,
                            }}
                          />
                          <div
                            className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-slate-900 dark:bg-slate-100 rounded-full"
                            style={{ left: `${targetPercent}%` }}
                            title={`${targetPercent}% minimum line`}
                            aria-hidden="true"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs">
                          <p className={`font-medium ${pctColorClass}`}>
                            {effective.guidanceText}
                          </p>
                          <span className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                            Min {targetPercent}%
                          </span>
                        </div>
                      </div>

                      {/* Interactive What-If Controls: + Present, + Absent, Reset + Slider */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            <span>What-If</span>
                            {isSimulated ? (
                              <span className="font-mono text-[11px] text-blue-700 dark:text-blue-400 tabular-nums">
                                ({sim.present > 0 ? `+${sim.present}P` : ''}
                                {sim.present > 0 && sim.absent > 0 ? ' ' : ''}
                                {sim.absent > 0 ? `+${sim.absent}A` : ''})
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => bumpSim(subject.courseCode, 'present', 1)}
                              aria-label={`+ Present for ${subject.courseCode}`}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer"
                            >
                              + Present
                            </button>
                            <button
                              type="button"
                              onClick={() => bumpSim(subject.courseCode, 'absent', 1)}
                              aria-label={`+ Absent for ${subject.courseCode}`}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 px-2.5 py-1 text-xs font-medium text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                            >
                              + Absent
                            </button>
                            <button
                              type="button"
                              disabled={!isSimulated}
                              onClick={() => resetSubjectSim(subject.courseCode)}
                              aria-label={`Reset simulation for ${subject.courseCode}`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              Reset
                            </button>
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
          {erpSubjects.length > 0 ? (
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
                    <option value="all">All ERP subjects ({erpSubjects.length})</option>
                    {erpSubjects.map((s) => (
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
                            Cum {day.cumulativePercentage.toFixed(2)}%
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
          ) : null}
        </>
      )}
    </div>
  );
}
