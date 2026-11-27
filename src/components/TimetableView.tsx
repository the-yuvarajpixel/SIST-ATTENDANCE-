import { useMemo, useState } from 'react';
import { computeAttendanceStats } from '../core/attendance';
import { findNextClass } from '../core/schedule';
import type { AttendanceSubject, TimetableSlot, Weekday } from '../core/types';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

const DAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FULL_DAY_NAMES: Record<Weekday, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
};

function getDefaultDay(): Weekday {
  const map: Record<number, Weekday> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
  return map[new Date().getDay()] ?? 'Mon';
}

interface TimetableViewProps {
  timetable: SectionState<TimetableSlot[]>;
  attendance: SectionState<AttendanceSubject[]>;
  attendanceTarget: number;
  onRetry: () => void;
}

export function TimetableView({
  timetable,
  attendance,
  attendanceTarget,
  onRetry,
}: TimetableViewProps) {
  const [selectedDay, setSelectedDay] = useState<Weekday | 'All'>(getDefaultDay);

  const slots = timetable.envelope?.data ?? [];
  const subjects = attendance.envelope?.data ?? [];
  const attendanceMap = useMemo(() => new Map(subjects.map((s) => [s.courseCode, s])), [subjects]);
  const nextClass = useMemo(
    () => findNextClass(slots, subjects, new Date(), attendanceTarget),
    [slots, subjects, attendanceTarget]
  );

  const visibleDays: Weekday[] = selectedDay === 'All' ? DAYS : [selectedDay];

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={timetable.envelope?.warning}
        fetchedAt={timetable.envelope?.fetchedAt}
        onRetry={onRetry}
        retrying={timetable.loading}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              Weekly Timetable
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {nextClass ? `Next up: ${nextClass.headline}` : 'Semester VI class schedule'}
            </p>
          </div>

          <div
            role="group"
            aria-label="Filter timetable by day"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
          >
            {([...DAYS, 'All'] as const).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                aria-pressed={selectedDay === day}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  selectedDay === day
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {day === 'All' ? 'Full week' : day}
              </button>
            ))}
          </div>
        </div>
      </section>

      {timetable.loading && !timetable.envelope ? (
        <SectionSkeleton rows={5} />
      ) : timetable.error && !timetable.envelope ? (
        <SectionError sectionName="Timetable" message={timetable.error} onRetry={onRetry} />
      ) : (
        <div className="space-y-6">
          {visibleDays.map((day) => {
            const daySlots = slots
              .filter((s) => s.day === day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            return (
              <section
                key={day}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {FULL_DAY_NAMES[day]}
                  </h3>
                  <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {daySlots.length} {daySlots.length === 1 ? 'session' : 'sessions'}
                  </span>
                </div>

                {daySlots.length === 0 ? (
                  <div className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
                    No classes scheduled for {FULL_DAY_NAMES[day]}.
                  </div>
                ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {daySlots.map((slot) => {
                    const subj = attendanceMap.get(slot.courseCode);
                    const stats = subj
                      ? computeAttendanceStats(subj.attended, subj.total, attendanceTarget)
                      : null;
                    const isNext = nextClass?.slot.id === slot.id;

                    return (
                      <div
                        key={slot.id}
                        className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isNext ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5 min-w-0">
                          <div className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 w-28 shrink-0">
                            {slot.startTime} – {slot.endTime}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {slot.courseName}
                              {isNext ? (
                                <span className="ml-2 text-xs font-medium text-blue-700 dark:text-blue-400">
                                  Next class
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-mono">{slot.courseCode}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{slot.room}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{slot.kind}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{slot.faculty}</span>
                            </p>
                          </div>
                        </div>

                        {stats ? (
                          <div className="sm:text-right shrink-0">
                            <p className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
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
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
