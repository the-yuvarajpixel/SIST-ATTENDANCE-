import { computeAttendanceStats } from './attendance';
import type { AttendanceSubject, DeadlineItem, NextClassSummary, TimetableSlot, Weekday } from './types';

const JS_DAY_TO_WEEKDAY: Record<number, Weekday | null> = {
  0: null, // Sun
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Resolves the next upcoming class from the weekly timetable combined with attendance bunk status.
 * Example headline: "Tomorrow, Mon 09:00 · Computer Networks · 87.5% · Can skip 6"
 */
export function findNextClass(
  slots: TimetableSlot[],
  attendance: AttendanceSubject[],
  now: Date = new Date(),
  targetPercent = 75
): NextClassSummary | null {
  if (slots.length === 0) return null;

  const attendanceByCode = new Map(attendance.map((s) => [s.courseCode, s]));
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset < 7; offset += 1) {
    const candidateDate = new Date(now);
    candidateDate.setDate(now.getDate() + offset);
    const weekday = JS_DAY_TO_WEEKDAY[candidateDate.getDay()];
    if (!weekday) continue;

    const daySlots = slots
      .filter((s) => s.day === weekday)
      .sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime));

    for (const slot of daySlots) {
      const startMins = parseMinutes(slot.startTime);
      if (offset === 0 && startMins <= currentMinutes) continue;

      const dayLabel =
        offset === 0 ? `Today, ${weekday}` : offset === 1 ? `Tomorrow, ${weekday}` : weekday;

      let startsInLabel = `${dayLabel} ${slot.startTime}`;
      if (offset === 0) {
        const diff = startMins - currentMinutes;
        if (diff < 60) {
          startsInLabel = `in ${diff} min`;
        } else {
          const hrs = Math.floor(diff / 60);
          const mins = diff % 60;
          startsInLabel = mins > 0 ? `in ${hrs}h ${mins}m` : `in ${hrs}h`;
        }
      }

      const subject = attendanceByCode.get(slot.courseCode);
      const stats = subject ? computeAttendanceStats(subject.attended, subject.total, targetPercent) : null;

      const headlineParts = [
        `${dayLabel} ${slot.startTime}`,
        slot.courseName,
        stats ? `${stats.percentage.toFixed(1)}%` : null,
        stats ? stats.verdict : null,
      ].filter(Boolean);

      return {
        slot,
        dayLabel,
        startsInLabel,
        attendancePercent: stats ? stats.percentage : null,
        verdict: stats ? stats.verdict : null,
        status: stats ? stats.status : null,
        headline: headlineParts.join(' · '),
      };
    }
  }

  return null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * De-duplicates overlapping deadlines reported by both ERP and LMS
 * (e.g., an exam or assignment listed in both portals within the same calendar day).
 */
export function deduplicateDeadlines(items: DeadlineItem[]): {
  items: DeadlineItem[];
  duplicatesMerged: number;
} {
  const byKey = new Map<string, DeadlineItem>();
  let duplicatesMerged = 0;

  for (const item of items) {
    const dayKey = item.dueAt.slice(0, 10);
    const key = `${item.kind}|${(item.courseCode ?? '').toUpperCase()}|${normalizeTitle(item.title)}|${dayKey}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...item, mergedCount: item.mergedCount ?? 1 });
      continue;
    }

    duplicatesMerged += 1;
    const mergedOrigin =
      existing.origin === item.origin ? existing.origin : 'ERP + LMS';

    byKey.set(key, {
      ...existing,
      origin: mergedOrigin,
      // Prefer earlier due time if one portal has an earlier cutoff
      dueAt: Date.parse(item.dueAt) < Date.parse(existing.dueAt) ? item.dueAt : existing.dueAt,
      notes: existing.notes && item.notes && existing.notes !== item.notes
        ? `${existing.notes} · ${item.notes}`
        : existing.notes ?? item.notes,
      amountInr: existing.amountInr ?? item.amountInr,
      mergedCount: (existing.mergedCount ?? 1) + 1,
    });
  }

  const sorted = Array.from(byKey.values()).sort(
    (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)
  );

  return { items: sorted, duplicatesMerged };
}

export type ExamCountdownUrgency = 'today' | 'soon' | 'upcoming';

export interface ExamCountdownEntry {
  item: DeadlineItem;
  daysRemaining: number;
  hoursRemaining: number;
  countdownLabel: string;
  urgency: ExamCountdownUrgency;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function startOfLocalDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Extracts upcoming exam deadlines originating from ERP (including merged ERP + LMS entries),
 * excludes completed or already-passed exams, computes calendar days remaining, and sorts earliest-first.
 */
export function getUpcomingErpExams(
  deadlines: DeadlineItem[],
  options?: { now?: Date; completedIds?: Set<string> }
): ExamCountdownEntry[] {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const todayStartMs = startOfLocalDayMs(now);
  const completedIds = options?.completedIds;

  const entries: ExamCountdownEntry[] = [];

  for (const item of deadlines) {
    if (item.kind !== 'exam') continue;
    if (item.origin !== 'ERP' && item.origin !== 'ERP + LMS') continue;
    if (completedIds?.has(item.id)) continue;

    const dueMs = Date.parse(item.dueAt);
    if (Number.isNaN(dueMs) || dueMs < nowMs) continue;

    const dueDate = new Date(dueMs);
    const daysRemaining = Math.max(
      0,
      Math.round((startOfLocalDayMs(dueDate) - todayStartMs) / MS_PER_DAY)
    );
    const hoursRemaining = Math.max(1, Math.ceil((dueMs - nowMs) / MS_PER_HOUR));

    const urgency: ExamCountdownUrgency =
      daysRemaining === 0 ? 'today' : daysRemaining <= 3 ? 'soon' : 'upcoming';

    const countdownLabel =
      daysRemaining === 0
        ? hoursRemaining === 1
          ? 'Today · 1h left'
          : `Today · ${hoursRemaining}h left`
        : daysRemaining === 1
          ? '1 day left'
          : `${daysRemaining} days left`;

    entries.push({
      item,
      daysRemaining,
      hoursRemaining,
      countdownLabel,
      urgency,
    });
  }

  entries.sort((a, b) => Date.parse(a.item.dueAt) - Date.parse(b.item.dueAt));
  return entries;
}

