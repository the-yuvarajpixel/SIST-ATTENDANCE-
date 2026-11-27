import {
  buildDailyAttendanceLog,
  computeOverallAttendance,
  normalizeAttendanceEndDate,
  shiftAttendanceDateKey,
  type DailyAttendanceDayRecord,
} from './attendance';
import type { AttendanceSubject, TimetableSlot } from './types';

export interface DailySubjectSnapshot {
  courseCode: string;
  courseName: string;
  dayPresent: number;
  dayTotal: number;
  dayPercentage: number | null;
  cumulativePercentage: number;
}

export interface DailyAttendanceSnapshot {
  dateKey: string; // YYYY-MM-DD
  shortDate: string; // e.g. 27 Nov
  dayName: string; // Mon..Sat
  capturedAt: string; // ISO timestamp
  source: 'live-snapshot' | 'backfill';
  dayPresent: number;
  dayTotal: number;
  dayPercentage: number;
  overallPercentage: number;
  subjects: DailySubjectSnapshot[];
}

export interface DailyTrendPoint {
  dateKey: string;
  shortDate: string;
  dayName: string;
  dayPresent: number;
  dayTotal: number;
  dailyPercentage: number | null;
  overallPercentage: number;
  isBelowTarget: boolean;
  source: 'live-snapshot' | 'backfill';
  capturedAt: string;
}

export interface ThirtyDayTrendSummary {
  points: DailyTrendPoint[];
  windowStartDate: string | null;
  windowEndDate: string | null;
  startOverallPct: number;
  latestOverallPct: number;
  deltaPts: number;
  averageDailyPct: number;
  bestDay: DailyTrendPoint | null;
  lowestDay: DailyTrendPoint | null;
  daysBelowTarget: number;
  activeDaysCount: number;
  liveSnapshotCount: number;
  totalStoredCount: number;
}

const MAX_STORED_SNAPSHOTS = 90;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const STORAGE_PREFIX = 'usp_daily_attendance_snapshots_v1:';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clampPct(n: unknown): number {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return round1(Math.max(0, Math.min(100, num)));
}

function clampNonNegInt(n: unknown): number {
  const num = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.max(0, Math.min(50, num));
}

export function getAttendanceSnapshotStorageKey(registerNumber: string): string {
  const safeReg = registerNumber.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32) || 'STUDENT';
  return `${STORAGE_PREFIX}${safeReg}`;
}

export function sanitizeSnapshotStore(raw: unknown): DailyAttendanceSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, DailyAttendanceSnapshot>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const dateKey = typeof obj.dateKey === 'string' ? obj.dateKey.trim() : '';
    if (!DATE_KEY_RE.test(dateKey)) continue;

    const shortDate =
      typeof obj.shortDate === 'string' && obj.shortDate.trim()
        ? obj.shortDate.trim().slice(0, 20)
        : dateKey;
    const dayName =
      typeof obj.dayName === 'string' && obj.dayName.trim()
        ? obj.dayName.trim().slice(0, 12)
        : '';
    const capturedAt =
      typeof obj.capturedAt === 'string' && !Number.isNaN(Date.parse(obj.capturedAt))
        ? obj.capturedAt
        : new Date().toISOString();
    const source: 'live-snapshot' | 'backfill' =
      obj.source === 'live-snapshot' ? 'live-snapshot' : 'backfill';

    const dayTotal = clampNonNegInt(obj.dayTotal);
    const dayPresent = Math.min(dayTotal, clampNonNegInt(obj.dayPresent));
    const dayPercentage =
      dayTotal > 0 ? round1((dayPresent / dayTotal) * 100) : clampPct(obj.dayPercentage);
    const overallPercentage = clampPct(obj.overallPercentage);

    const rawSubjects = Array.isArray(obj.subjects) ? obj.subjects : [];
    const subjects: DailySubjectSnapshot[] = [];
    for (const s of rawSubjects) {
      if (!s || typeof s !== 'object') continue;
      const so = s as Record<string, unknown>;
      const courseCode = typeof so.courseCode === 'string' ? so.courseCode.trim().slice(0, 24) : '';
      const courseName = typeof so.courseName === 'string' ? so.courseName.trim().slice(0, 120) : '';
      if (!courseCode) continue;
      const sTotal = clampNonNegInt(so.dayTotal);
      const sPresent = Math.min(sTotal, clampNonNegInt(so.dayPresent));
      subjects.push({
        courseCode,
        courseName: courseName || courseCode,
        dayPresent: sPresent,
        dayTotal: sTotal,
        dayPercentage: sTotal > 0 ? round1((sPresent / sTotal) * 100) : null,
        cumulativePercentage: clampPct(so.cumulativePercentage),
      });
    }

    byDate.set(dateKey, {
      dateKey,
      shortDate,
      dayName,
      capturedAt,
      source,
      dayPresent,
      dayTotal,
      dayPercentage,
      overallPercentage,
      subjects,
    });
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-MAX_STORED_SNAPSHOTS);
}

export function readStoredAttendanceSnapshots(registerNumber: string): DailyAttendanceSnapshot[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(getAttendanceSnapshotStorageKey(registerNumber));
    if (!raw) return [];
    return sanitizeSnapshotStore(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeStoredAttendanceSnapshots(
  registerNumber: string,
  snapshots: DailyAttendanceSnapshot[]
): DailyAttendanceSnapshot[] {
  const clean = sanitizeSnapshotStore(snapshots);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        getAttendanceSnapshotStorageKey(registerNumber),
        JSON.stringify(clean)
      );
    }
  } catch {
    // Ignore storage quota or privacy-mode errors gracefully
  }
  return clean;
}

export function clearStoredAttendanceSnapshots(registerNumber: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(getAttendanceSnapshotStorageKey(registerNumber));
    }
  } catch {
    // Ignore storage errors gracefully
  }
}

function buildSnapshotFromLogRecord(
  day: DailyAttendanceDayRecord,
  allSubjects: AttendanceSubject[],
  latestSubjectPct: Map<string, number>,
  source: 'live-snapshot' | 'backfill',
  capturedAt: string
): DailyAttendanceSnapshot {
  // Aggregate multiple slots of the same course on the same day into dayPresent / dayTotal
  const dayByCourse = new Map<
    string,
    { courseName: string; dayPresent: number; dayTotal: number; cumulativePct: number }
  >();

  for (const entry of day.entries) {
    const existing = dayByCourse.get(entry.courseCode);
    const addPresent = entry.status === 'present' ? 1 : 0;
    if (existing) {
      existing.dayPresent += addPresent;
      existing.dayTotal += 1;
      existing.cumulativePct = entry.subjectPercentageSoFar;
    } else {
      dayByCourse.set(entry.courseCode, {
        courseName: entry.courseName,
        dayPresent: addPresent,
        dayTotal: 1,
        cumulativePct: entry.subjectPercentageSoFar,
      });
    }
    latestSubjectPct.set(entry.courseCode, entry.subjectPercentageSoFar);
  }

  const subjects: DailySubjectSnapshot[] = allSubjects.map((subj) => {
    const rec = dayByCourse.get(subj.courseCode);
    const fallbackPct =
      latestSubjectPct.get(subj.courseCode) ??
      (subj.total > 0 ? round1((subj.attended / subj.total) * 100) : 100);
    if (rec) {
      return {
        courseCode: subj.courseCode,
        courseName: subj.courseName,
        dayPresent: rec.dayPresent,
        dayTotal: rec.dayTotal,
        dayPercentage: rec.dayTotal > 0 ? round1((rec.dayPresent / rec.dayTotal) * 100) : null,
        cumulativePercentage: round1(rec.cumulativePct),
      };
    }
    return {
      courseCode: subj.courseCode,
      courseName: subj.courseName,
      dayPresent: 0,
      dayTotal: 0,
      dayPercentage: null,
      cumulativePercentage: round1(fallbackPct),
    };
  });

  return {
    dateKey: day.dateKey,
    shortDate: day.shortDate,
    dayName: day.dayName,
    capturedAt,
    source,
    dayPresent: day.presentCount,
    dayTotal: day.totalCount,
    dayPercentage: round1(day.dailyPercentage),
    overallPercentage: round1(day.cumulativePercentage),
    subjects,
  };
}

/**
 * Generates/updates up to 30 calendar days of daily attendance snapshots ending at `endDate`,
 * preserving previously captured live snapshots for earlier dates while always refreshing
 * the active `endDate` snapshot with current day-by-day class counts.
 */
export function seedAndMerge30DaySnapshots(
  existingSnapshots: DailyAttendanceSnapshot[],
  subjects: AttendanceSubject[],
  timetable: TimetableSlot[],
  endDate: string,
  targetPercent = 75,
  now: Date = new Date()
): DailyAttendanceSnapshot[] {
  const cleanExisting = sanitizeSnapshotStore(existingSnapshots);
  if (subjects.length === 0) return cleanExisting;

  const effectiveEnd = normalizeAttendanceEndDate(endDate, now);
  const windowStart = shiftAttendanceDateKey(effectiveEnd, -29, now);
  const capturedAt = now.toISOString();

  const dailyLog = buildDailyAttendanceLog(subjects, timetable, {
    endDate: effectiveEnd,
    targetPercent,
    subjectCode: 'all',
    now,
  });

  // Process chronologically (oldest -> newest) so each subject's running percentage carries forward on off-days
  const chronologicalDays = [...dailyLog.days].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const mergedMap = new Map<string, DailyAttendanceSnapshot>();
  for (const snap of cleanExisting) {
    mergedMap.set(snap.dateKey, snap);
  }

  const runningSubjectPct = new Map<string, number>();
  for (const day of chronologicalDays) {
    const isInWindow = day.dateKey >= windowStart && day.dateKey <= effectiveEnd;
    const isActiveEndDay = day.dateKey === effectiveEnd;
    const existing = mergedMap.get(day.dateKey);

    // Update running map even before window so initial percentages inside window are accurate
    if (!isInWindow) {
      for (const entry of day.entries) {
        runningSubjectPct.set(entry.courseCode, entry.subjectPercentageSoFar);
      }
      continue;
    }

    const built = buildSnapshotFromLogRecord(
      day,
      subjects,
      runningSubjectPct,
      isActiveEndDay ? 'live-snapshot' : 'backfill',
      capturedAt
    );

    if (isActiveEndDay) {
      // Always capture/refresh active end date as a fresh live snapshot
      mergedMap.set(day.dateKey, built);
    } else if (!existing || existing.source === 'backfill') {
      // Keep user's historical live-snapshots intact; refresh backfilled days
      mergedMap.set(day.dateKey, built);
    }
  }

  // If the active endDate had no scheduled classes (e.g., Sunday), still record a live snapshot for that date
  if (!mergedMap.has(effectiveEnd)) {
    const overall = computeOverallAttendance(subjects, targetPercent);
    const [y, m, d] = effectiveEnd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const shortDate = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const dayName = dt.toLocaleDateString('en-IN', { weekday: 'short' });

    mergedMap.set(effectiveEnd, {
      dateKey: effectiveEnd,
      shortDate,
      dayName,
      capturedAt,
      source: 'live-snapshot',
      dayPresent: 0,
      dayTotal: 0,
      dayPercentage: 100,
      overallPercentage: round1(overall.overallPercentage),
      subjects: subjects.map((subj) => ({
        courseCode: subj.courseCode,
        courseName: subj.courseName,
        dayPresent: 0,
        dayTotal: 0,
        dayPercentage: null,
        cumulativePercentage:
          subj.total > 0 ? round1((subj.attended / subj.total) * 100) : 100,
      })),
    });
  }

  return Array.from(mergedMap.values())
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-MAX_STORED_SNAPSHOTS);
}

export function selectLast30DaySnapshots(
  snapshots: DailyAttendanceSnapshot[],
  endDate: string,
  now: Date = new Date()
): DailyAttendanceSnapshot[] {
  const effectiveEnd = normalizeAttendanceEndDate(endDate, now);
  const windowStart = shiftAttendanceDateKey(effectiveEnd, -29, now);
  return sanitizeSnapshotStore(snapshots)
    .filter((s) => s.dateKey >= windowStart && s.dateKey <= effectiveEnd)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function compute30DayTrendSummary(
  snapshots: DailyAttendanceSnapshot[],
  targetPercent = 75,
  subjectCode = 'all'
): ThirtyDayTrendSummary {
  const ordered = [...snapshots].sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const points: DailyTrendPoint[] = ordered.map((snap) => {
    if (subjectCode === 'all') {
      const hasClasses = snap.dayTotal > 0;
      const dailyPct = hasClasses ? round1((snap.dayPresent / snap.dayTotal) * 100) : null;
      return {
        dateKey: snap.dateKey,
        shortDate: snap.shortDate,
        dayName: snap.dayName,
        dayPresent: snap.dayPresent,
        dayTotal: snap.dayTotal,
        dailyPercentage: dailyPct,
        overallPercentage: round1(snap.overallPercentage),
        isBelowTarget:
          (dailyPct !== null && dailyPct < targetPercent) ||
          snap.overallPercentage < targetPercent,
        source: snap.source,
        capturedAt: snap.capturedAt,
      };
    }

    const subj = snap.subjects.find((s) => s.courseCode === subjectCode);
    const dayPresent = subj?.dayPresent ?? 0;
    const dayTotal = subj?.dayTotal ?? 0;
    const dailyPct = dayTotal > 0 ? round1((dayPresent / dayTotal) * 100) : null;
    const overallPct = subj ? round1(subj.cumulativePercentage) : round1(snap.overallPercentage);
    return {
      dateKey: snap.dateKey,
      shortDate: snap.shortDate,
      dayName: snap.dayName,
      dayPresent,
      dayTotal,
      dailyPercentage: dailyPct,
      overallPercentage: overallPct,
      isBelowTarget:
        (dailyPct !== null && dailyPct < targetPercent) || overallPct < targetPercent,
      source: snap.source,
      capturedAt: snap.capturedAt,
    };
  });

  const activeDays = points.filter((p) => p.dayTotal > 0 && p.dailyPercentage !== null);
  const startOverallPct = points.length > 0 ? points[0].overallPercentage : 0;
  const latestOverallPct = points.length > 0 ? points[points.length - 1].overallPercentage : 0;
  const deltaPts = round1(latestOverallPct - startOverallPct);
  const averageDailyPct =
    activeDays.length > 0
      ? round1(
          activeDays.reduce((sum, p) => sum + (p.dailyPercentage ?? 0), 0) / activeDays.length
        )
      : 0;

  let bestDay: DailyTrendPoint | null = null;
  let lowestDay: DailyTrendPoint | null = null;
  for (const day of activeDays) {
    const pct = day.dailyPercentage ?? 0;
    if (
      !bestDay ||
      pct > (bestDay.dailyPercentage ?? -1) ||
      (pct === (bestDay.dailyPercentage ?? -1) && day.dayTotal > bestDay.dayTotal)
    ) {
      bestDay = day;
    }
    if (
      !lowestDay ||
      pct < (lowestDay.dailyPercentage ?? 101) ||
      (pct === (lowestDay.dailyPercentage ?? 101) && day.dayTotal > lowestDay.dayTotal)
    ) {
      lowestDay = day;
    }
  }

  const daysBelowTarget = activeDays.filter(
    (p) => (p.dailyPercentage ?? 100) < targetPercent
  ).length;
  const liveSnapshotCount = points.filter((p) => p.source === 'live-snapshot').length;

  return {
    points,
    windowStartDate: points[0]?.dateKey ?? null,
    windowEndDate: points[points.length - 1]?.dateKey ?? null,
    startOverallPct,
    latestOverallPct,
    deltaPts,
    averageDailyPct,
    bestDay,
    lowestDay,
    daysBelowTarget,
    activeDaysCount: activeDays.length,
    liveSnapshotCount,
    totalStoredCount: points.length,
  };
}
