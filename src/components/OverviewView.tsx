import { ArrowRight, CalendarClock } from 'lucide-react';
import { computeAttendanceStats, computeOverallAttendance } from '../core/attendance';
import { computeCgpaSummary } from '../core/gpa';
import { findNextClass } from '../core/schedule';
import type {
  AttendanceSubject,
  DeadlineItem,
  NavSection,
  NotificationItem,
  ResultsPayload,
  SectionEnvelope,
  StudentProfile,
  TimetableSlot,
} from '../core/types';
import { formatInr, formatRelativeDue, formatShortDate } from '../lib/format';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

export interface SectionState<T> {
  envelope: SectionEnvelope<T> | null;
  loading: boolean;
  error: string | null;
}

interface OverviewViewProps {
  profile: SectionState<StudentProfile>;
  attendance: SectionState<AttendanceSubject[]>;
  timetable: SectionState<TimetableSlot[]>;
  results: SectionState<ResultsPayload>;
  deadlines: SectionState<DeadlineItem[]>;
  notifications: SectionState<NotificationItem[]>;
  completedDeadlineIds: Set<string>;
  readNotificationIds: Set<string>;
  attendanceTarget: number;
  onNavigate: (section: NavSection) => void;
  onRetrySection: (section: 'profile' | 'attendance' | 'timetable' | 'results' | 'deadlines' | 'notifications') => void;
}

export function OverviewView({
  profile,
  attendance,
  timetable,
  results,
  deadlines,
  notifications,
  completedDeadlineIds,
  readNotificationIds,
  attendanceTarget,
  onNavigate,
  onRetrySection,
}: OverviewViewProps) {
  const attendanceList = attendance.envelope?.data ?? [];
  const timetableList = timetable.envelope?.data ?? [];
  const deadlineList = deadlines.envelope?.data ?? [];
  const notificationList = notifications.envelope?.data ?? [];
  const resultsData = results.envelope?.data ?? null;

  const nextClass = findNextClass(timetableList, attendanceList, new Date(), attendanceTarget);
  const overallAttendance = computeOverallAttendance(attendanceList, attendanceTarget);
  const cgpaSummary = resultsData ? computeCgpaSummary(resultsData.semesters) : null;

  const openDeadlines = deadlineList.filter((d) => !completedDeadlineIds.has(d.id));
  const unreadNotices = notificationList.filter((n) => n.unread && !readNotificationIds.has(n.id));
  const lowAttendanceSubjects = attendanceList
    .map((s) => ({ subject: s, stats: computeAttendanceStats(s.attended, s.total, attendanceTarget) }))
    .filter((x) => x.stats.status !== 'safe')
    .sort((a, b) => a.stats.percentage - b.stats.percentage);

  const staleErpWarning =
    attendance.envelope?.warning || timetable.envelope?.warning || profile.envelope?.warning;
  const staleErpFetchedAt =
    attendance.envelope?.fetchedAt || timetable.envelope?.fetchedAt || profile.envelope?.fetchedAt;

  return (
    <div className="space-y-8">
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

      {/* Focal Anchor: Next Class Hero Surface */}
      <section
        aria-label="Next scheduled class"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7"
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
                <span className="font-medium text-blue-700 dark:text-blue-400">Next class</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {nextClass.dayLabel} {nextClass.slot.startTime}–{nextClass.slot.endTime}
                </span>
                <span aria-hidden="true">·</span>
                <span>{nextClass.slot.room}</span>
                <span aria-hidden="true">·</span>
                <span>{nextClass.slot.kind}</span>
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {nextClass.slot.courseName}
              </h2>

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

            <div className="flex flex-wrap items-center gap-3 shrink-0">
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
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
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
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overall Attendance</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {attendance.loading && !attendance.envelope ? '—' : `${overallAttendance.overallPercentage.toFixed(1)}%`}
          </p>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
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
        </button>

        <button
          type="button"
          onClick={() => onNavigate('results')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Estimated CGPA</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {results.loading && !results.envelope ? '—' : cgpaSummary ? cgpaSummary.cgpa.toFixed(2) : '—'}
          </p>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            {cgpaSummary?.bestSemester
              ? `Best ${cgpaSummary.bestSemester.sgpa.toFixed(2)} (Sem ${cgpaSummary.bestSemester.semester}) · ${cgpaSummary.completedCredits} cr`
              : 'Grade history'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('deadlines')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Deadlines</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {deadlines.loading && !deadlines.envelope ? '—' : openDeadlines.length}
          </p>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 truncate">
            {openDeadlines[0]
              ? `Next: ${formatRelativeDue(openDeadlines[0].dueAt).label}`
              : 'All caught up'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('notifications')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Unread Notices</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {notifications.loading && !notifications.envelope ? '—' : unreadNotices.length}
          </p>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            ERP circulars &amp; Moodle LMS
          </p>
        </button>
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

        {/* Right: Recent Notifications */}
        <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
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
  );
}
