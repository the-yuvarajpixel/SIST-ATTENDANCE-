import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Calculator,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Link2,
  RefreshCw,
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
  analyzeAttendanceInsights,
  buildWeeklyAttendanceTrend,
  computeAttendanceStats,
  computeOverallAttendance,
  getTodayLocalDateKey,
  shiftAttendanceDateKey,
  type WeeklyAttendancePoint,
} from '../core/attendance';
import { computeCgpaSummary } from '../core/gpa';
import { findNextClass, getUpcomingErpExams } from '../core/schedule';
import type {
  AttendanceSubject,
  DeadlineItem,
  NavSection,
  NotificationItem,
  PortalSyncReport,
  ResultsPayload,
  SectionEnvelope,
  SessionUser,
  StudentProfile,
  TimetableSlot,
} from '../core/types';
import { formatExamDateTime, formatInr, formatRelativeDue, formatShortDate } from '../lib/format';
import { OverviewCgpaCalculator } from './OverviewCgpaCalculator';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

export interface SectionState<T> {
  envelope: SectionEnvelope<T> | null;
  loading: boolean;
  error: string | null;
}

interface OverviewViewProps {
  user?: SessionUser;
  profile: SectionState<StudentProfile>;
  attendance: SectionState<AttendanceSubject[]>;
  timetable: SectionState<TimetableSlot[]>;
  results: SectionState<ResultsPayload>;
  deadlines: SectionState<DeadlineItem[]>;
  notifications: SectionState<NotificationItem[]>;
  completedDeadlineIds: Set<string>;
  readNotificationIds: Set<string>;
  attendanceTarget: number;
  attendanceEndDate?: string;
  onChangeAttendanceEndDate?: (nextDate: string) => void;
  syncingPortals?: boolean;
  lastSyncReport?: PortalSyncReport | null;
  onSyncPortals?: () => void;
  onChangeAttendanceTarget?: (target: number) => void;
  onNavigate: (section: NavSection) => void;
  onRetrySection: (section: 'profile' | 'attendance' | 'timetable' | 'results' | 'deadlines' | 'notifications') => void;
}

const TARGET_OPTIONS = [75, 80, 85] as const;

interface WeeklyAttendanceTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: WeeklyAttendancePoint }>;
  targetPercent: number;
}

function WeeklyAttendanceTooltip({
  active,
  payload,
  targetPercent,
}: WeeklyAttendanceTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 max-w-[300px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-display font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">
          {point.weekLabel} · {point.dateRangeLabel}
        </span>
        {point.isSignificantDrop ? (
          <span className="font-medium text-red-700 dark:text-red-400">Dip</span>
        ) : null}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 font-mono tabular-nums">
        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Weekly Rate</span>
        <span
          className={`text-right font-semibold whitespace-nowrap ${
            point.weeklyPercentage < targetPercent
              ? 'text-red-700 dark:text-red-400'
              : 'text-slate-900 dark:text-slate-50'
          }`}
        >
          {point.weeklyPercentage.toFixed(1)}%
        </span>

        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Classes</span>
        <span className="text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {point.attendedInWeek}/{point.heldInWeek} ({point.missedInWeek} missed)
        </span>

        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Cumulative</span>
        <span className="text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {point.cumulativePercentage.toFixed(1)}%
        </span>

        {point.deltaFromPrevWeek !== null ? (
          <>
            <span className="text-slate-500 dark:text-slate-400">vs Prior Week</span>
            <span
              className={`text-right font-medium ${
                point.deltaFromPrevWeek <= -8
                  ? 'text-red-700 dark:text-red-400'
                  : point.deltaFromPrevWeek < 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {point.deltaFromPrevWeek >= 0 ? '+' : ''}
              {point.deltaFromPrevWeek.toFixed(1)} pts
            </span>
          </>
        ) : null}
      </div>

      {point.dropReason ? (
        <p className="pt-1 border-t border-slate-100 dark:border-slate-800 text-red-700 dark:text-red-400 leading-relaxed">
          {point.dropReason}
        </p>
      ) : null}
    </div>
  );
}

interface WeeklyDotProps {
  cx?: number;
  cy?: number;
  payload?: WeeklyAttendancePoint;
}

function WeeklyTrendDot({ cx, cy, payload }: WeeklyDotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null;
  if (payload.isSignificantDrop) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill="var(--chart-warning)"
        stroke="var(--chart-dot-fill)"
        strokeWidth={2}
      />
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill="var(--chart-dot-fill)"
      stroke="var(--chart-actual)"
      strokeWidth={2}
    />
  );
}

export function OverviewView({
  user,
  profile,
  attendance,
  timetable,
  results,
  deadlines,
  notifications,
  completedDeadlineIds,
  readNotificationIds,
  attendanceTarget,
  attendanceEndDate,
  onChangeAttendanceEndDate,
  syncingPortals = false,
  lastSyncReport = null,
  onSyncPortals,
  onChangeAttendanceTarget,
  onNavigate,
  onRetrySection,
}: OverviewViewProps) {
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const [showAllExams, setShowAllExams] = useState(false);
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [trendCourseScope, setTrendCourseScope] = useState<string>('all');
  const [showCumulativeLine, setShowCumulativeLine] = useState(true);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const attendanceList = attendance.envelope?.data ?? [];
  const timetableList = timetable.envelope?.data ?? [];
  const deadlineList = deadlines.envelope?.data ?? [];
  const notificationList = notifications.envelope?.data ?? [];
  const resultsData = results.envelope?.data ?? null;

  const effectiveTrendScope =
    trendCourseScope === 'all' ||
    attendanceList.some((s) => s.courseCode === trendCourseScope)
      ? trendCourseScope
      : 'all';

  const weeklyTrend = useMemo(
    () =>
      buildWeeklyAttendanceTrend(
        attendanceList,
        timetableList,
        attendanceTarget,
        effectiveTrendScope,
        now
      ),
    [attendanceList, timetableList, attendanceTarget, effectiveTrendScope, now]
  );

  const weeklyYDomain = useMemo<[number, number]>(() => {
    if (weeklyTrend.points.length === 0) return [40, 100];
    const vals: number[] = [attendanceTarget];
    for (const pt of weeklyTrend.points) {
      vals.push(pt.weeklyPercentage);
      if (showCumulativeLine) vals.push(pt.cumulativePercentage);
    }
    const minVal = Math.min(...vals);
    const floor = Math.max(0, Math.floor((minVal - 10) / 10) * 10);
    return [Math.min(floor, 60), 100];
  }, [weeklyTrend, attendanceTarget, showCumulativeLine]);

  const nextClass = findNextClass(timetableList, attendanceList, now, attendanceTarget);
  const overallAttendance = computeOverallAttendance(attendanceList, attendanceTarget);
  const attendanceInsights = analyzeAttendanceInsights(attendanceList, timetableList, attendanceTarget);
  const cgpaSummary = resultsData ? computeCgpaSummary(resultsData.semesters) : null;

  const openDeadlines = deadlineList.filter((d) => !completedDeadlineIds.has(d.id));
  const upcomingErpExams = getUpcomingErpExams(deadlineList, {
    now,
    completedIds: completedDeadlineIds,
  });
  const completedErpExamCount = deadlineList.filter(
    (d) =>
      d.kind === 'exam' &&
      (d.origin === 'ERP' || d.origin === 'ERP + LMS') &&
      completedDeadlineIds.has(d.id)
  ).length;
  const leadExam = upcomingErpExams[0] ?? null;
  const followingExams = showAllExams
    ? upcomingErpExams.slice(1)
    : upcomingErpExams.slice(1, 4);

  const unreadNotices = notificationList.filter((n) => n.unread && !readNotificationIds.has(n.id));
  const lowAttendanceSubjects = attendanceList
    .map((s) => ({ subject: s, stats: computeAttendanceStats(s.attended, s.total, attendanceTarget) }))
    .filter((x) => x.stats.status !== 'safe')
    .sort((a, b) => a.stats.percentage - b.stats.percentage);

  const visiblePriorityCourses = showAllPriorities
    ? attendanceInsights.priorityCourses
    : attendanceInsights.priorityCourses.slice(0, 3);

  const staleErpWarning =
    attendance.envelope?.warning || timetable.envelope?.warning || profile.envelope?.warning;
  const staleErpFetchedAt =
    attendance.envelope?.fetchedAt || timetable.envelope?.fetchedAt || profile.envelope?.fetchedAt;

  const studentProfile = profile.envelope?.data ?? null;
  const firstName = studentProfile?.name?.trim().split(/\s+/)[0] ?? null;
  const hour = now.getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayDateKey = getTodayLocalDateKey();
  const activeAttendanceEndDate = attendanceEndDate || todayDateKey;
  const isAttendanceAtToday = activeAttendanceEndDate >= todayDateKey;
  const feeDues = deadlineList.filter((d) => d.kind === 'fee' && !completedDeadlineIds.has(d.id));
  const lmsDeadlinesCount = openDeadlines.filter((d) => d.origin === 'LMS' || d.origin === 'ERP + LMS').length;

  function scrollToCgpaCalculator() {
    const el = document.getElementById('overview-cgpa-calculator');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={staleErpWarning}
        fetchedAt={staleErpFetchedAt}
        onRetry={() => {
          onRetrySection('profile');
          onRetrySection('attendance');
          onRetrySection('timetable');
          onRetrySection('results');
        }}
      />

      {/* Contextual Academic Greeting Strip */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {firstName ? `${timeGreeting}, ${firstName}` : `${timeGreeting}`}
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {studentProfile ? (
              <>
                <span className="truncate">{studentProfile.program}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  Sem {studentProfile.semester}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  Reg {studentProfile.registerNumber}
                </span>
              </>
            ) : (
              <span>Daily academic overview across College ERP and Moodle LMS</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('marks')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
            CAE Result from ERP
          </button>
          <button
            type="button"
            onClick={scrollToCgpaCalculator}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Calculator className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
            CGPA Calculator
          </button>
        </div>
      </div>

      {/* Realistic College ERP & Moodle LMS Live Sync Strip */}
      {user ? (
        <section
          aria-label="ERP and Moodle LMS sync status"
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
              <Link2 className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
              Portal Sync
            </span>
            <span className="text-slate-600 dark:text-slate-400">
              ERP (<span className="font-mono">erp.sathyabama.ac.in</span>):{' '}
              <strong
                className={
                  user.mode === 'live' && user.erpTokenPresent
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-800 dark:text-slate-200'
                }
              >
                {user.mode === 'live' && user.erpTokenPresent
                  ? 'Live Connected'
                  : user.mode === 'live'
                    ? 'Token Required'
                    : 'Sample Preview'}
              </strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">·</span>
            <span className="text-slate-600 dark:text-slate-400">
              LMS (<span className="font-mono">sathyabama.cognibot.in</span>):{' '}
              <strong
                className={
                  user.mode === 'live' && user.lmsTokenPresent
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-800 dark:text-slate-200'
                }
              >
                {user.mode === 'live' && user.lmsTokenPresent
                  ? 'Live Connected'
                  : user.mode === 'live'
                    ? 'Optional'
                    : 'Sample Preview'}
              </strong>
            </span>
            {lastSyncReport ? (
              <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                Synced {new Date(lastSyncReport.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onSyncPortals ? (
              <button
                type="button"
                onClick={onSyncPortals}
                disabled={syncingPortals}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingPortals ? 'animate-spin' : ''}`} aria-hidden="true" />
                {syncingPortals ? 'Syncing ERP & LMS...' : 'Sync ERP & LMS'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onNavigate('sync')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              {user.mode === 'live' ? 'Manage Sync' : 'Connect Live ERP & LMS'}
            </button>
          </div>
        </section>
      ) : null}

      {/* Focal Anchor: Next Class Hero Surface */}
      <section
        aria-label="Next scheduled class"
        className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-gradient-to-br from-white via-white to-slate-50/90 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950/80 p-6 sm:p-7"
      >
        {timetable.loading && !timetable.envelope ? (
          <SectionSkeleton rows={2} />
        ) : timetable.error && !timetable.envelope ? (
          <SectionError
            sectionName="Next class"
            message={timetable.error}
            onRetry={() => onRetrySection('timetable')}
          />
        ) : nextClass ? (
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <CalendarClock className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
                <span className="font-semibold text-blue-700 dark:text-blue-400">Next class</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {nextClass.dayLabel} {nextClass.slot.startTime}–{nextClass.slot.endTime}
                </span>
                <span aria-hidden="true">·</span>
                <span>{nextClass.slot.room}</span>
                <span aria-hidden="true">·</span>
                <span>{nextClass.slot.kind}</span>
              </div>

              <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {nextClass.slot.courseName}
              </h3>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                <span className="font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {nextClass.slot.courseCode}
                </span>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                <span className="whitespace-nowrap">{nextClass.slot.faculty}</span>
                {nextClass.attendancePercent !== null && nextClass.verdict ? (
                  <>
                    <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {nextClass.attendancePercent.toFixed(1)}%
                    </span>
                    <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                    <span
                      className={`whitespace-nowrap ${
                        nextClass.status === 'shortage'
                          ? 'font-medium text-red-700 dark:text-red-400'
                          : nextClass.status === 'borderline'
                            ? 'font-medium text-amber-700 dark:text-amber-400'
                            : 'font-medium text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {nextClass.verdict}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-2.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                Open Bunk Calculator
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('timetable')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                Full Timetable
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">No upcoming classes scheduled.</p>
        )}
      </section>

      {/* 4-column KPI Summary Strip (2x2 on phones, 4-across on desktop) */}
      <section aria-label="Academic metrics summary" className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigate('attendance')}
          className="group text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-blue-300 dark:hover:border-blue-700/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overall Attendance</p>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
            {attendance.loading && !attendance.envelope ? '—' : `${overallAttendance.overallPercentage.toFixed(1)}%`}
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-full ${
                overallAttendance.shortageCount > 0
                  ? 'bg-amber-500 dark:bg-amber-400'
                  : 'bg-emerald-600 dark:bg-emerald-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, overallAttendance.overallPercentage))}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            {overallAttendance.shortageCount > 0 ? (
              <span className="text-red-700 dark:text-red-400 font-medium">
                {overallAttendance.shortageCount} subject{overallAttendance.shortageCount > 1 ? 's' : ''} below {attendanceTarget}%
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                All subjects meet {attendanceTarget}%
              </span>
            )}
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 truncate">
            EOD till {formatShortDate(activeAttendanceEndDate)}
          </p>
        </button>

        <button
          type="button"
          onClick={scrollToCgpaCalculator}
          className="group text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-blue-300 dark:hover:border-blue-700/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overall CGPA</p>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
            {results.loading && !results.envelope ? '—' : cgpaSummary ? cgpaSummary.cgpa.toFixed(2) : '—'}
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
            <div
              className="h-full rounded-full bg-blue-700 dark:bg-blue-500"
              style={{
                width: `${Math.min(100, Math.max(0, ((cgpaSummary?.cgpa ?? 0) / 10) * 100))}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums truncate">
            {cgpaSummary?.bestSemester
              ? `Best ${cgpaSummary.bestSemester.sgpa.toFixed(2)} (Sem ${cgpaSummary.bestSemester.semester}) · ${cgpaSummary.completedCredits} cr`
              : 'Calculate below'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('deadlines')}
          className="group text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-blue-300 dark:hover:border-blue-700/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Deadlines</p>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
            {deadlines.loading && !deadlines.envelope ? '—' : openDeadlines.length}
          </p>
          <p className="mt-3.5 text-xs text-slate-600 dark:text-slate-400 truncate">
            {openDeadlines[0]
              ? `Next: ${formatRelativeDue(openDeadlines[0].dueAt).label}`
              : 'All caught up'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('notifications')}
          className="group text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-blue-300 dark:hover:border-blue-700/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Unread Notices</p>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
            {notifications.loading && !notifications.envelope ? '—' : unreadNotices.length}
          </p>
          <p className="mt-3.5 text-xs text-slate-600 dark:text-slate-400 truncate">
            ERP circulars &amp; Moodle LMS
          </p>
        </button>
      </section>

      {/* Complete ERP Academic Profile & Direct ERP + Moodle LMS Feature Hub */}
      <section
        aria-label="Complete ERP academic profile and direct portal modules"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              College ERP &amp; Moodle LMS Direct Hub
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              All synced student profile details, end-of-day attendance updates, CAE results, and LMS coursework in one place.
            </p>
          </div>

          {onChangeAttendanceEndDate ? (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
                Attendance EOD:
              </span>
              <button
                type="button"
                onClick={() => onChangeAttendanceEndDate(shiftAttendanceDateKey(activeAttendanceEndDate, -1))}
                aria-label="Previous attendance day"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="font-mono text-xs tabular-nums font-medium text-slate-900 dark:text-slate-100 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 whitespace-nowrap">
                {formatShortDate(activeAttendanceEndDate)}
              </span>
              <button
                type="button"
                disabled={isAttendanceAtToday}
                onClick={() => onChangeAttendanceEndDate(shiftAttendanceDateKey(activeAttendanceEndDate, 1))}
                aria-label="Next attendance day"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {!isAttendanceAtToday ? (
                <button
                  type="button"
                  onClick={() => onChangeAttendanceEndDate(todayDateKey)}
                  className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline px-1.5 cursor-pointer whitespace-nowrap"
                >
                  Today
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ERP Student Profile Metadata Grid */}
        {studentProfile ? (
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2.5 text-xs">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Register No</p>
              <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate">
                {studentProfile.registerNumber}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Department</p>
              <p className="font-medium text-slate-900 dark:text-slate-100 truncate" title={studentProfile.department}>
                {studentProfile.department}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Batch &amp; Section</p>
              <p className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums truncate">
                {studentProfile.batch} · Sec {studentProfile.section}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Current Term</p>
              <p className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums truncate">
                Semester {studentProfile.semester}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Faculty Advisor</p>
              <p className="font-medium text-slate-900 dark:text-slate-100 truncate" title={studentProfile.advisor}>
                {studentProfile.advisor}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">College Email</p>
              <p className="font-mono text-slate-700 dark:text-slate-300 truncate" title={studentProfile.email}>
                {studentProfile.email}
              </p>
            </div>
          </div>
        ) : null}

        {/* Direct ERP & LMS Modules Directory */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:gap-px bg-slate-200 dark:bg-slate-800">
          {[
            {
              title: 'Subject & Overall Attendance',
              source: 'ERP · Day-by-Day EOD',
              metric: `${overallAttendance.overallPercentage.toFixed(1)}% · ${attendanceList.length} subjects`,
              section: 'attendance' as NavSection,
            },
            {
              title: 'Direct CAE 1 & CAE 2 Results',
              source: 'ERP · Pull & Deep-Dive',
              metric: `${resultsData?.caeMarks.length ?? 0} subjects synced`,
              section: 'marks' as NavSection,
            },
            {
              title: 'Mon–Sat Weekly Timetable',
              source: 'ERP · Live Schedule',
              metric: `${timetableList.length} weekly slots`,
              section: 'timetable' as NavSection,
            },
            {
              title: 'Semester Grades & CGPA',
              source: 'ERP · Grade Distribution',
              metric: cgpaSummary ? `CGPA ${cgpaSummary.cgpa.toFixed(2)} · ${cgpaSummary.completedCredits} cr` : 'View transcript',
              section: 'results' as NavSection,
            },
            {
              title: 'Moodle LMS Deadlines',
              source: 'LMS · Assignments & Labs',
              metric: `${lmsDeadlinesCount} active LMS task${lmsDeadlinesCount === 1 ? '' : 's'}`,
              section: 'deadlines' as NavSection,
            },
            {
              title: 'ERP Exam Dates & Fee Dues',
              source: 'ERP · Exam & Accounts',
              metric: `${upcomingErpExams.length} exams${feeDues.length > 0 ? ` · ${feeDues.length} fee due` : ' · No fee due'}`,
              section: 'deadlines' as NavSection,
            },
            {
              title: 'Circulars & LMS Notices',
              source: 'ERP + LMS · Unified Feed',
              metric: `${unreadNotices.length} unread of ${notificationList.length}`,
              section: 'notifications' as NavSection,
            },
            {
              title: 'Auto-Sync ERP & LMS Hub',
              source: 'ERP + LMS · Live Connector',
              metric: user?.mode === 'live' ? 'Live sync active' : 'Connect ERP & LMS',
              section: 'sync' as NavSection,
            },
          ].map((mod) => (
            <button
              key={mod.title}
              type="button"
              onClick={() => onNavigate(mod.section)}
              className="group text-left bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 px-4 py-3.5 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {mod.title}
                </p>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-700 dark:group-hover:text-blue-400 shrink-0 transition-colors" aria-hidden="true" />
              </div>
              <p className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {mod.source}
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300 truncate">
                {mod.metric}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Interactive Semester-Wise CGPA Calculator Tool */}
      <OverviewCgpaCalculator
        erpSemesters={resultsData?.semesters ?? []}
        erpCgpa={cgpaSummary?.cgpa ?? null}
        loading={results.loading && !results.envelope}
        onNavigate={onNavigate}
      />

      {/* Weekly Attendance Fluctuations Trend Line Chart */}
      <section
        aria-label="Weekly attendance trend"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              Weekly Attendance Trend
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
              {attendance.loading && !attendance.envelope ? (
                <span>Loading weekly attendance fluctuations...</span>
              ) : weeklyTrend.biggestDropWeek ? (
                <>
                  <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
                    <TrendingDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Significant dip in {weeklyTrend.biggestDropWeek.weekLabel} (
                    {weeklyTrend.biggestDropWeek.dateRangeLabel} ·{' '}
                    <span className="font-mono tabular-nums">
                      {weeklyTrend.biggestDropWeek.weeklyPercentage.toFixed(1)}%
                    </span>
                    {weeklyTrend.biggestDropWeek.deltaFromPrevWeek !== null ? (
                      <span className="font-mono tabular-nums">
                        , {weeklyTrend.biggestDropWeek.deltaFromPrevWeek.toFixed(1)} pts
                      </span>
                    ) : null}
                    )
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Avg {weeklyTrend.averageWeeklyPercent.toFixed(1)}%/wk
                  </span>
                </>
              ) : weeklyTrend.points.length > 0 ? (
                <>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    Steady weekly attendance — no sharp drops
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Avg {weeklyTrend.averageWeeklyPercent.toFixed(1)}%/wk
                  </span>
                </>
              ) : (
                <span>Track week-by-week attendance fluctuations and dip periods</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {attendanceList.length > 0 ? (
              <select
                aria-label="Filter weekly attendance trend by course"
                value={effectiveTrendScope}
                onChange={(e) => setTrendCourseScope(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30 cursor-pointer max-w-[230px] truncate"
              >
                <option value="all">All courses ({attendanceList.length})</option>
                {attendanceList.map((subject) => (
                  <option key={subject.courseCode} value={subject.courseCode}>
                    {subject.courseCode} · {subject.courseName}
                  </option>
                ))}
              </select>
            ) : null}

            <button
              type="button"
              onClick={() => setShowCumulativeLine((prev) => !prev)}
              aria-pressed={showCumulativeLine}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showCumulativeLine
                  ? 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              {showCumulativeLine ? 'Hide Cumulative' : 'Show Cumulative'}
            </button>
          </div>
        </div>

        {attendance.loading && !attendance.envelope ? (
          <div className="p-5">
            <SectionSkeleton rows={3} />
          </div>
        ) : attendance.error && !attendance.envelope ? (
          <div className="p-5">
            <SectionError
              sectionName="Weekly Attendance Trend"
              message={attendance.error}
              onRetry={() => onRetrySection('attendance')}
            />
          </div>
        ) : weeklyTrend.points.length === 0 ? (
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No weekly attendance data yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sync College ERP attendance to visualize week-over-week fluctuations and dip periods.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('sync')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sync ERP Portal
            </button>
          </div>
        ) : (
          <div>
            <div className="p-5 space-y-4">
              {/* Inline Legend */}
              <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-0.5 w-4 rounded-full"
                      style={{ backgroundColor: 'var(--chart-actual)' }}
                      aria-hidden="true"
                    />
                    Weekly Attendance %
                  </span>
                  {showCumulativeLine ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-0.5 w-4 border-t-2 border-dashed"
                        style={{ borderColor: 'var(--chart-projected)' }}
                        aria-hidden="true"
                      />
                      Cumulative Overall %
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-0.5 w-4 border-t-2 border-dotted"
                      style={{ borderColor: 'var(--chart-target)' }}
                      aria-hidden="true"
                    />
                    Target ({attendanceTarget}%)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: 'var(--chart-warning)' }}
                      aria-hidden="true"
                    />
                    Significant Drop
                  </span>
                </div>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {weeklyTrend.points.length} weeks · Current {weeklyTrend.currentCumulativePercent.toFixed(1)}%
                </span>
              </div>

              {/* Recharts Trend Line Chart */}
              <div className="h-[240px] sm:h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={weeklyTrend.points}
                    margin={{ top: 10, right: 16, left: -8, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="weeklyAttendanceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-actual)" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="var(--chart-actual)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--chart-grid)"
                    />
                    <XAxis
                      dataKey="weekLabel"
                      tick={{
                        fill: 'var(--chart-axis)',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                      }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--chart-grid)' }}
                      dy={6}
                    />
                    <YAxis
                      domain={weeklyYDomain}
                      tick={{
                        fill: 'var(--chart-axis)',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                      }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      content={<WeeklyAttendanceTooltip targetPercent={attendanceTarget} />}
                    />
                    <ReferenceLine
                      y={attendanceTarget}
                      stroke="var(--chart-target)"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="weeklyPercentage"
                      name="Weekly Attendance %"
                      stroke="var(--chart-actual)"
                      strokeWidth={2.5}
                      fill="url(#weeklyAttendanceFill)"
                      dot={<WeeklyTrendDot />}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                    {showCumulativeLine ? (
                      <Line
                        type="monotone"
                        dataKey="cumulativePercentage"
                        name="Cumulative Overall %"
                        stroke="var(--chart-projected)"
                        strokeWidth={1.75}
                        strokeDasharray="5 4"
                        dot={{
                          r: 2.5,
                          fill: 'var(--chart-dot-fill)',
                          stroke: 'var(--chart-projected)',
                          strokeWidth: 1.5,
                        }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quiet Flagged Drop Periods Strip */}
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
              <div className="min-w-0 text-slate-600 dark:text-slate-400">
                {weeklyTrend.significantDropWeeks.length > 0 ? (
                  <p className="leading-relaxed">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      Flagged drop {weeklyTrend.significantDropWeeks.length === 1 ? 'period' : 'periods'}:
                    </span>{' '}
                    {weeklyTrend.significantDropWeeks.map((pt, idx) => (
                      <span key={pt.weekLabel} className="font-mono tabular-nums">
                        {idx > 0 ? ' · ' : ''}
                        <span className="text-red-700 dark:text-red-400 font-medium">
                          {pt.weekLabel}
                        </span>{' '}
                        ({pt.dateRangeLabel}, {pt.weeklyPercentage.toFixed(1)}%
                        {pt.deltaFromPrevWeek !== null
                          ? `, ${pt.deltaFromPrevWeek.toFixed(1)} pts`
                          : ''}
                        )
                      </span>
                    ))}
                  </p>
                ) : (
                  <p>
                    No significant weekly attendance drops detected across {weeklyTrend.points.length} tracked weeks.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
              >
                Inspect in Attendance
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Attendance Trends & Prioritization Insights */}
      <section
        aria-label="Attendance insights"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                Insights
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {attendance.loading && !attendance.envelope
                ? 'Analyzing attendance trends and recovery targets...'
                : attendanceInsights.headline}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onChangeAttendanceTarget ? (
              <div
                role="group"
                aria-label="Attendance target threshold"
                className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200 dark:border-slate-700/70"
              >
                {TARGET_OPTIONS.map((target) => {
                  const active = attendanceTarget === target;
                  return (
                    <button
                      key={target}
                      type="button"
                      onClick={() => onChangeAttendanceTarget(target)}
                      aria-pressed={active}
                      className={`px-2.5 py-1 rounded-md font-mono text-xs font-medium tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {target}%
                    </button>
                  );
                })}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Simulate in Attendance
            </button>
          </div>
        </div>

        {attendance.loading && !attendance.envelope ? (
          <div className="p-5">
            <SectionSkeleton rows={3} />
          </div>
        ) : attendance.error && !attendance.envelope ? (
          <div className="p-5">
            <SectionError
              sectionName="Insights"
              message={attendance.error}
              onRetry={() => onRetrySection('attendance')}
            />
          </div>
        ) : attendanceInsights.priorityCourses.length === 0 ? (
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No attendance trends available yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {attendanceInsights.summary}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('sync')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sync LMS &amp; ERP
            </button>
          </div>
        ) : (
          <div>
            {/* 3-metric trend analysis strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800">
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Target Margin ({attendanceInsights.targetPercent}%)
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span
                    className={`font-mono text-lg font-semibold tabular-nums ${
                      attendanceInsights.marginFromTarget < 0
                        ? 'text-red-700 dark:text-red-400'
                        : attendanceInsights.marginFromTarget < 3
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {attendanceInsights.marginFromTarget >= 0 ? '+' : ''}
                    {attendanceInsights.marginFromTarget.toFixed(1)} pts
                  </span>
                  <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    ({attendanceInsights.overallPercentage.toFixed(1)}% overall)
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                  {attendanceInsights.distribution.shortageCount} shortage ·{' '}
                  {attendanceInsights.distribution.borderlineCount} borderline ·{' '}
                  {attendanceInsights.distribution.safeCount} safe
                </p>
              </div>

              <div className="px-5 py-4">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {attendanceInsights.oneWeekProjection.horizon === 'week'
                    ? '1-Week Attendance Trend'
                    : 'Next-Session Trend'}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                    {attendanceInsights.overallPercentage.toFixed(1)}% →{' '}
                    {attendanceInsights.oneWeekProjection.projectedOverallPercentage.toFixed(1)}%
                  </span>
                  <span className="font-mono text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                    {attendanceInsights.oneWeekProjection.deltaPercentage >= 0 ? '+' : ''}
                    {attendanceInsights.oneWeekProjection.deltaPercentage.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {attendanceInsights.oneWeekProjection.coursesRecoveredInOneWeek > 0
                    ? `${attendanceInsights.oneWeekProjection.coursesRecoveredInOneWeek} shortage ${
                        attendanceInsights.oneWeekProjection.coursesRecoveredInOneWeek === 1
                          ? 'course recovers'
                          : 'courses recover'
                      } if you attend all scheduled classes`
                    : attendanceInsights.weeklyScheduledClasses > 0
                      ? `Projected across ${attendanceInsights.weeklyScheduledClasses} scheduled weekly classes`
                      : 'Projected if you attend the next class per course'}
                </p>
              </div>

              <div className="px-5 py-4">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Recovery vs Buffer
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  {attendanceInsights.totalClassesNeededToRecover > 0 ? (
                    <span className="font-mono text-lg font-semibold tabular-nums text-red-700 dark:text-red-400">
                      {attendanceInsights.totalClassesNeededToRecover} needed
                    </span>
                  ) : (
                    <span className="font-mono text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {attendanceInsights.totalSkippableBuffer} skippable
                    </span>
                  )}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {attendanceInsights.totalClassesNeededToRecover > 0
                      ? 'consecutive classes'
                      : 'class buffer'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                  {attendanceInsights.totalClassesNeededToRecover > 0
                    ? `${attendanceInsights.totalSkippableBuffer} skippable buffer across safe courses`
                    : `0 recovery classes needed at ${attendanceInsights.targetPercent}% target`}
                </p>
              </div>
            </div>

            {/* Proportional distribution bar + plain-English trend takeaway */}
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 space-y-2.5">
              <div
                className="h-2 w-full rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800"
                role="img"
                aria-label={`${attendanceInsights.distribution.safeCount} safe, ${attendanceInsights.distribution.borderlineCount} borderline, ${attendanceInsights.distribution.shortageCount} shortage courses`}
              >
                {attendanceInsights.distribution.safeCount > 0 ? (
                  <div
                    className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all"
                    style={{
                      width: `${
                        (attendanceInsights.distribution.safeCount /
                          attendanceInsights.distribution.totalCourses) *
                        100
                      }%`,
                    }}
                  />
                ) : null}
                {attendanceInsights.distribution.borderlineCount > 0 ? (
                  <div
                    className="h-full bg-amber-500 dark:bg-amber-400 transition-all"
                    style={{
                      width: `${
                        (attendanceInsights.distribution.borderlineCount /
                          attendanceInsights.distribution.totalCourses) *
                        100
                      }%`,
                    }}
                  />
                ) : null}
                {attendanceInsights.distribution.shortageCount > 0 ? (
                  <div
                    className="h-full bg-red-600 dark:bg-red-500 transition-all"
                    style={{
                      width: `${
                        (attendanceInsights.distribution.shortageCount /
                          attendanceInsights.distribution.totalCourses) *
                        100
                      }%`,
                    }}
                  />
                ) : null}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {attendanceInsights.summary}
              </p>
            </div>

            {/* Prioritized Courses List */}
            <div>
              <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Courses to Prioritize
                </p>
                {attendanceInsights.priorityCourses.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllPriorities((prev) => !prev)}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {showAllPriorities
                      ? 'Show top 3'
                      : `Show all ${attendanceInsights.priorityCourses.length}`}
                  </button>
                ) : null}
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {visiblePriorityCourses.map((item, idx) => {
                  const priorityLabel =
                    item.priorityLevel === 'urgent'
                      ? 'High priority'
                      : item.priorityLevel === 'watch'
                        ? 'Watch closely'
                        : 'On track';
                  const priorityTone =
                    item.priorityLevel === 'urgent'
                      ? 'text-red-700 dark:text-red-400'
                      : item.priorityLevel === 'watch'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400';
                  const barTone =
                    item.priorityLevel === 'urgent'
                      ? 'bg-red-600 dark:bg-red-500'
                      : item.priorityLevel === 'watch'
                        ? 'bg-amber-500 dark:bg-amber-400'
                        : 'bg-emerald-600 dark:bg-emerald-500';

                  return (
                    <div
                      key={item.subject.courseCode}
                      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <span className="font-mono text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500 pt-0.5 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {item.subject.courseName}
                            </p>
                            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                              ·
                            </span>
                            <span className={`text-xs font-medium ${priorityTone}`}>
                              {priorityLabel}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {item.subject.courseCode} · {item.subject.attended}/{item.subject.total} classes
                            {item.weeklySessions > 0 ? ` · ${item.weeklySessions}/wk` : ''}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.recommendation}
                          </p>
                        </div>
                      </div>

                      <div className="sm:w-48 shrink-0 space-y-1.5 pl-7 sm:pl-0">
                        <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.stats.percentage.toFixed(1)}%
                          </span>
                          <span className={`text-xs font-medium ${priorityTone}`}>
                            {item.gapFromTarget >= 0 ? '+' : ''}
                            {item.gapFromTarget.toFixed(1)}% vs {attendanceInsights.targetPercent}%
                          </span>
                        </div>
                        <div
                          className="relative h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800"
                          aria-hidden="true"
                        >
                          <div
                            className={`h-full rounded-full transition-all ${barTone}`}
                            style={{ width: `${Math.min(100, Math.max(0, item.stats.percentage))}%` }}
                          />
                          <div
                            className="absolute -top-0.5 h-2.5 w-0.5 bg-slate-700 dark:bg-slate-200"
                            style={{ left: `${attendanceInsights.targetPercent}%` }}
                            title={`${attendanceInsights.targetPercent}% target`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Two balanced detail columns below */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Attendance Watchlist + Upcoming Deadlines */}
        <div className="xl:col-span-7 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                  Attendance Snapshot
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Target {attendanceTarget}% · Priority courses requiring attention first
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                View all {attendanceList.length}
              </button>
            </div>

            {attendance.loading && !attendance.envelope ? (
              <div className="p-5">
                <SectionSkeleton rows={3} />
              </div>
            ) : attendance.error && !attendance.envelope ? (
              <div className="p-5">
                <SectionError
                  sectionName="Attendance"
                  message={attendance.error}
                  onRetry={() => onRetrySection('attendance')}
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {(lowAttendanceSubjects.length > 0
                  ? lowAttendanceSubjects
                  : attendanceList
                      .slice(0, 4)
                      .map((subject) => ({
                        subject,
                        stats: computeAttendanceStats(subject.attended, subject.total, attendanceTarget),
                      }))
                ).map(({ subject, stats }) => (
                  <div
                    key={subject.courseCode}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {subject.courseName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {subject.courseCode} · {subject.attended}/{subject.total} classes
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {stats.percentage.toFixed(1)}%
                      </p>
                      <p
                        className={`text-xs font-medium ${
                          stats.status === 'shortage'
                            ? 'text-red-700 dark:text-red-400'
                            : stats.status === 'borderline'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {stats.verdict}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                  Upcoming Deadlines
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  De-duplicated across Moodle LMS, exam timetable, and ERP fees
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('deadlines')}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Full timeline
              </button>
            </div>

            {deadlines.loading && !deadlines.envelope ? (
              <div className="p-5">
                <SectionSkeleton rows={3} />
              </div>
            ) : deadlines.error && !deadlines.envelope ? (
              <div className="p-5">
                <SectionError
                  sectionName="Deadlines"
                  message={deadlines.error}
                  onRetry={() => onRetrySection('deadlines')}
                />
              </div>
            ) : openDeadlines.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
                No remaining deadlines. Everything is marked complete.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {openDeadlines.slice(0, 4).map((item) => {
                  const rel = formatRelativeDue(item.dueAt);
                  return (
                    <div
                      key={item.id}
                      className="px-5 py-3.5 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>{item.origin}</span>
                          {item.courseCode ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono">{item.courseCode}</span>
                            </>
                          ) : null}
                          {item.amountInr ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                {formatInr(item.amountInr)}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-xs font-medium ${
                            rel.urgency === 'overdue'
                              ? 'text-red-700 dark:text-red-400'
                              : rel.urgency === 'soon'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {rel.label}
                        </p>
                        <p className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500">
                          {formatShortDate(item.dueAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right: Exam Countdown + Recent Notifications */}
        <div className="xl:col-span-5 space-y-6">
          <section
            aria-label="Exam countdown"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                  Exam Countdown
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  {deadlines.loading && !deadlines.envelope
                    ? 'Syncing ERP exam schedule...'
                    : upcomingErpExams.length > 0
                      ? `ERP exam schedule · ${upcomingErpExams.length} upcoming`
                      : 'Upcoming exam dates from ERP'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('deadlines')}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Full schedule
              </button>
            </div>

            {deadlines.loading && !deadlines.envelope ? (
              <div className="p-5">
                <SectionSkeleton rows={3} />
              </div>
            ) : deadlines.error && !deadlines.envelope ? (
              <div className="p-5">
                <SectionError
                  sectionName="Exam Countdown"
                  message={deadlines.error}
                  onRetry={() => onRetrySection('deadlines')}
                />
              </div>
            ) : !leadExam ? (
              <div className="p-5 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {completedErpExamCount > 0
                      ? `All ${completedErpExamCount} scheduled ERP ${completedErpExamCount === 1 ? 'exam' : 'exams'} completed`
                      : 'No upcoming ERP exams scheduled'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {completedErpExamCount > 0
                      ? 'Marked exams are hidden from the countdown. Review or unmark them in Deadlines.'
                      : 'Upcoming exam dates published on Sathyabama ERP will count down here automatically.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(completedErpExamCount > 0 ? 'deadlines' : 'sync')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {completedErpExamCount > 0 ? 'Review in Deadlines' : 'Sync ERP Portal'}
                </button>
              </div>
            ) : (
              <div>
                {/* Spotlight: Next Upcoming ERP Exam */}
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5">
                      <span className="font-medium text-blue-700 dark:text-blue-400">Next exam</span>
                      {leadExam.item.courseCode ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            {leadExam.item.courseCode}
                          </span>
                        </>
                      ) : null}
                      <span aria-hidden="true">·</span>
                      <span>{leadExam.item.origin}</span>
                    </p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                      {leadExam.item.title}
                    </p>
                    <p className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {formatExamDateTime(leadExam.item.dueAt)}
                    </p>
                    {leadExam.item.notes ? (
                      <p className="pt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {leadExam.item.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right shrink-0 pl-2">
                    {leadExam.daysRemaining === 0 ? (
                      <>
                        <p className="font-mono text-2xl font-bold tracking-tight text-red-700 dark:text-red-400">
                          Today
                        </p>
                        <p className="mt-1 font-mono text-xs font-medium tabular-nums text-red-700 dark:text-red-400">
                          {leadExam.hoursRemaining}h left
                        </p>
                      </>
                    ) : (
                      <>
                        <p
                          className={`font-mono text-3xl font-bold tabular-nums leading-none tracking-tight ${
                            leadExam.urgency === 'soon'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-900 dark:text-slate-50'
                          }`}
                        >
                          {leadExam.daysRemaining}
                        </p>
                        <p
                          className={`mt-1 text-xs font-medium whitespace-nowrap ${
                            leadExam.urgency === 'soon'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {leadExam.daysRemaining === 1 ? 'day left' : 'days left'}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Subsequent ERP Exams */}
                {followingExams.length > 0 ? (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {followingExams.map((entry) => {
                      const isExpanded = expandedExamId === entry.item.id;
                      const countdownTone =
                        entry.urgency === 'today'
                          ? 'text-red-700 dark:text-red-400'
                          : entry.urgency === 'soon'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-900 dark:text-slate-100';
                      const canExpand = Boolean(entry.item.notes);

                      return (
                        <button
                          key={entry.item.id}
                          type="button"
                          onClick={() => {
                            if (!canExpand) return;
                            setExpandedExamId((prev) =>
                              prev === entry.item.id ? null : entry.item.id
                            );
                          }}
                          aria-expanded={canExpand ? isExpanded : undefined}
                          className={`w-full text-left px-5 py-3.5 transition-colors ${
                            canExpand
                              ? 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30 cursor-pointer'
                              : 'cursor-default'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                                {entry.item.title}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                {entry.item.courseCode ? `${entry.item.courseCode} · ` : ''}
                                {formatExamDateTime(entry.item.dueAt)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`font-mono text-sm font-semibold tabular-nums whitespace-nowrap ${countdownTone}`}>
                                {entry.daysRemaining === 0
                                  ? 'Today'
                                  : `${entry.daysRemaining}d`}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                {entry.countdownLabel}
                              </p>
                            </div>
                          </div>
                          {isExpanded && entry.item.notes ? (
                            <p className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                              {entry.item.notes}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  {upcomingErpExams.length > 4 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllExams((prev) => !prev)}
                      className="font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap cursor-pointer"
                    >
                      {showAllExams
                        ? 'Show fewer'
                        : `Show all ${upcomingErpExams.length} exams`}
                    </button>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">
                      Synced from ERP exam deadlines
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate('marks')}
                    className="font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    Review CAE Marks
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                  Recent Notices
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  ERP circulars and LMS announcements
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open feed
              </button>
            </div>

            {notifications.loading && !notifications.envelope ? (
              <div className="p-5">
                <SectionSkeleton rows={4} />
              </div>
            ) : notifications.error && !notifications.envelope ? (
              <div className="p-5">
                <SectionError
                  sectionName="Notifications"
                  message={notifications.error}
                  onRetry={() => onRetrySection('notifications')}
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {notificationList.slice(0, 5).map((notice) => {
                  const isUnread = notice.unread && !readNotificationIds.has(notice.id);
                  return (
                    <div key={notice.id} className="px-5 py-4 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          {notice.origin} · {notice.category}
                          {isUnread ? (
                            <span className="ml-2 font-semibold text-blue-700 dark:text-blue-400">
                              Unread
                            </span>
                          ) : null}
                        </span>
                        <span className="font-mono tabular-nums shrink-0">
                          {formatShortDate(notice.publishedAt)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                        {notice.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {notice.summary}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
