import type { AttendanceStats, AttendanceStatus, AttendanceSubject, TimetableSlot } from './types';

/**
 * Computes attendance percentage and bunk-calculator guidance for a given target threshold.
 * - If current % >= target: returns max consecutive classes you can skip while staying >= target.
 * - If current % < target: returns min consecutive classes you must attend to reach >= target.
 */
export function computeAttendanceStats(
  attended: number,
  total: number,
  targetPercent = 75
): AttendanceStats {
  const safeTarget = Math.min(99, Math.max(1, targetPercent));
  if (total <= 0) {
    return {
      percentage: 100,
      canSkip: 0,
      mustAttend: 0,
      status: 'safe',
      verdict: 'No classes held yet',
    };
  }

  const clampedAttended = Math.max(0, Math.min(attended, total));
  const rawPct = (clampedAttended / total) * 100;
  const percentage = Math.round(rawPct * 10) / 10;

  // Floating-point safe check: attended * 100 >= target * total
  const meetsTarget = clampedAttended * 100 >= safeTarget * total;

  if (meetsTarget) {
    // Max k such that attended / (total + k) >= target / 100
    // => k <= (attended * 100) / target - total
    const canSkip = Math.max(0, Math.floor((clampedAttended * 100) / safeTarget - total + 1e-9));
    const status: AttendanceStatus = canSkip >= 2 ? 'safe' : 'borderline';
    const verdict =
      canSkip === 0
        ? 'On the edge — attend next'
        : canSkip === 1
          ? 'Can skip 1'
          : `Can skip ${canSkip}`;

    return {
      percentage,
      canSkip,
      mustAttend: 0,
      status,
      verdict,
    };
  }

  // Min k such that (attended + k) / (total + k) >= target / 100
  // => k >= (target * total - 100 * attended) / (100 - target)
  const numerator = safeTarget * total - 100 * clampedAttended;
  const denominator = 100 - safeTarget;
  const mustAttend = Math.max(1, Math.ceil(numerator / denominator - 1e-9));

  const verdict =
    mustAttend === 1
      ? 'Attend the next class'
      : `Attend next ${mustAttend} in a row`;

  return {
    percentage,
    canSkip: 0,
    mustAttend,
    status: 'shortage',
    verdict,
  };
}

export function simulateAttendance(
  subject: Pick<AttendanceSubject, 'attended' | 'total'>,
  deltaPresent: number,
  deltaAbsent: number,
  targetPercent = 75
): AttendanceStats & { attended: number; total: number } {
  const safePresent = Math.max(0, Math.floor(deltaPresent));
  const safeAbsent = Math.max(0, Math.floor(deltaAbsent));
  const nextAttended = subject.attended + safePresent;
  const nextTotal = subject.total + safePresent + safeAbsent;
  return {
    attended: nextAttended,
    total: nextTotal,
    ...computeAttendanceStats(nextAttended, nextTotal, targetPercent),
  };
}

export function computeOverallAttendance(
  subjects: AttendanceSubject[],
  targetPercent = 75
): {
  totalAttended: number;
  totalHeld: number;
  overallPercentage: number;
  shortageCount: number;
  borderlineCount: number;
  safeCount: number;
} {
  let totalAttended = 0;
  let totalHeld = 0;
  let shortageCount = 0;
  let borderlineCount = 0;
  let safeCount = 0;

  for (const s of subjects) {
    totalAttended += s.attended;
    totalHeld += s.total;
    const stats = computeAttendanceStats(s.attended, s.total, targetPercent);
    if (stats.status === 'shortage') shortageCount += 1;
    else if (stats.status === 'borderline') borderlineCount += 1;
    else safeCount += 1;
  }

  const overallPercentage =
    totalHeld > 0 ? Math.round((totalAttended / totalHeld) * 1000) / 10 : 100;

  return {
    totalAttended,
    totalHeld,
    overallPercentage,
    shortageCount,
    borderlineCount,
    safeCount,
  };
}

export type CoursePriorityLevel = 'urgent' | 'watch' | 'maintain';
export type AttendanceTrendStatus = 'on-track' | 'watch' | 'at-risk';

export interface PriorityCourseInsight {
  subject: AttendanceSubject;
  stats: AttendanceStats;
  priorityLevel: CoursePriorityLevel;
  gapFromTarget: number;
  weeklySessions: number;
  estimatedWeeksToRecover: number | null;
  nextMissPercentage: number;
  oneWeekAttendPercentage: number;
  recoversInOneWeek: boolean;
  recommendation: string;
}

export interface AttendanceInsights {
  targetPercent: number;
  overallPercentage: number;
  totalAttended: number;
  totalHeld: number;
  marginFromTarget: number;
  trendStatus: AttendanceTrendStatus;
  headline: string;
  summary: string;
  distribution: {
    safeCount: number;
    borderlineCount: number;
    shortageCount: number;
    totalCourses: number;
  };
  totalClassesNeededToRecover: number;
  totalSkippableBuffer: number;
  weeklyScheduledClasses: number;
  oneWeekProjection: {
    horizon: 'week' | 'session';
    projectedOverallPercentage: number;
    deltaPercentage: number;
    coursesRecoveredInOneWeek: number;
    projectedShortageCount: number;
  };
  priorityCourses: PriorityCourseInsight[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function priorityRank(level: CoursePriorityLevel): number {
  if (level === 'urgent') return 0;
  if (level === 'watch') return 1;
  return 2;
}

/**
 * Analyzes attendance trends against the active target threshold and ranks courses to prioritize,
 * combining attendance stats with weekly timetable frequency for recovery projections.
 */
export function analyzeAttendanceInsights(
  subjects: AttendanceSubject[],
  timetable: TimetableSlot[],
  targetPercent = 75
): AttendanceInsights {
  const safeTarget = Math.min(99, Math.max(1, targetPercent));

  if (subjects.length === 0) {
    return {
      targetPercent: safeTarget,
      overallPercentage: 100,
      totalAttended: 0,
      totalHeld: 0,
      marginFromTarget: 0,
      trendStatus: 'on-track',
      headline: 'No attendance records available yet',
      summary: 'Sync your ERP or LMS attendance to see trend projections and prioritized course guidance.',
      distribution: {
        safeCount: 0,
        borderlineCount: 0,
        shortageCount: 0,
        totalCourses: 0,
      },
      totalClassesNeededToRecover: 0,
      totalSkippableBuffer: 0,
      weeklyScheduledClasses: 0,
      oneWeekProjection: {
        horizon: 'week',
        projectedOverallPercentage: 100,
        deltaPercentage: 0,
        coursesRecoveredInOneWeek: 0,
        projectedShortageCount: 0,
      },
      priorityCourses: [],
    };
  }

  const weeklyCounts = new Map<string, number>();
  for (const slot of timetable) {
    const key = slot.courseCode.trim().toUpperCase();
    weeklyCounts.set(key, (weeklyCounts.get(key) ?? 0) + 1);
  }

  const overall = computeOverallAttendance(subjects, safeTarget);
  const marginFromTarget = round1(overall.overallPercentage - safeTarget);

  let weeklyScheduledClasses = 0;
  for (const subject of subjects) {
    weeklyScheduledClasses += weeklyCounts.get(subject.courseCode.trim().toUpperCase()) ?? 0;
  }

  const projectionHorizon: 'week' | 'session' = weeklyScheduledClasses > 0 ? 'week' : 'session';

  let totalClassesNeededToRecover = 0;
  let totalSkippableBuffer = 0;
  let projectedAttendedTotal = 0;
  let projectedHeldTotal = 0;
  let coursesRecoveredInOneWeek = 0;
  let projectedShortageCount = 0;

  const priorityCourses: PriorityCourseInsight[] = subjects.map((subject) => {
    const stats = computeAttendanceStats(subject.attended, subject.total, safeTarget);
    const weeklySessions = weeklyCounts.get(subject.courseCode.trim().toUpperCase()) ?? 0;
    const gapFromTarget = round1(stats.percentage - safeTarget);
    const nextMiss = simulateAttendance(subject, 0, 1, safeTarget);

    const projectedDelta = projectionHorizon === 'week' ? weeklySessions : 1;
    const oneWeekSim = simulateAttendance(subject, projectedDelta, 0, safeTarget);

    projectedAttendedTotal += oneWeekSim.attended;
    projectedHeldTotal += oneWeekSim.total;
    if (oneWeekSim.status === 'shortage') {
      projectedShortageCount += 1;
    }

    const recoversInOneWeek = stats.status === 'shortage' && oneWeekSim.status !== 'shortage';
    if (recoversInOneWeek) {
      coursesRecoveredInOneWeek += 1;
    }

    totalClassesNeededToRecover += stats.mustAttend;
    totalSkippableBuffer += stats.canSkip;

    const priorityLevel: CoursePriorityLevel =
      stats.status === 'shortage' ? 'urgent' : stats.status === 'borderline' ? 'watch' : 'maintain';

    const estimatedWeeksToRecover =
      stats.status === 'shortage' && weeklySessions > 0
        ? Math.ceil(stats.mustAttend / weeklySessions)
        : null;

    let recommendation: string;
    if (priorityLevel === 'urgent') {
      const streakLabel =
        stats.mustAttend === 1
          ? 'Attend the next class'
          : `Attend next ${stats.mustAttend} classes in a row`;
      if (estimatedWeeksToRecover !== null) {
        const weekWord = estimatedWeeksToRecover === 1 ? 'week' : 'weeks';
        recommendation = `${streakLabel} (~${estimatedWeeksToRecover} ${weekWord} at ${weeklySessions}/wk). Missing 1 drops it to ${nextMiss.percentage.toFixed(1)}%.`;
      } else {
        recommendation = `${streakLabel} to reach ${safeTarget}%. Missing 1 drops it to ${nextMiss.percentage.toFixed(1)}%.`;
      }
    } else if (priorityLevel === 'watch') {
      if (stats.canSkip === 0) {
        recommendation = `Zero skip buffer at ${safeTarget}% — missing the next class drops it to ${nextMiss.percentage.toFixed(1)}%.`;
      } else {
        const cadence =
          weeklySessions > 0 ? `your next ${weeklySessions} weekly classes` : 'the next couple of classes';
        recommendation = `Only 1 skippable class left — attend ${cadence} to lift it to ${oneWeekSim.percentage.toFixed(1)}%.`;
      }
    } else {
      recommendation = `On track (${stats.verdict.toLowerCase()}). Attending next ${
        projectionHorizon === 'week' && weeklySessions > 0 ? `${weeklySessions} scheduled classes` : 'class'
      } moves it to ${oneWeekSim.percentage.toFixed(1)}%.`;
    }

    return {
      subject,
      stats,
      priorityLevel,
      gapFromTarget,
      weeklySessions,
      estimatedWeeksToRecover,
      nextMissPercentage: nextMiss.percentage,
      oneWeekAttendPercentage: oneWeekSim.percentage,
      recoversInOneWeek,
      recommendation,
    };
  });

  priorityCourses.sort((a, b) => {
    const rankDiff = priorityRank(a.priorityLevel) - priorityRank(b.priorityLevel);
    if (rankDiff !== 0) return rankDiff;

    if (a.priorityLevel === 'urgent') {
      if (b.stats.mustAttend !== a.stats.mustAttend) {
        return b.stats.mustAttend - a.stats.mustAttend;
      }
      if (a.stats.percentage !== b.stats.percentage) {
        return a.stats.percentage - b.stats.percentage;
      }
      return b.subject.credits - a.subject.credits;
    }

    if (a.priorityLevel === 'watch') {
      if (a.stats.canSkip !== b.stats.canSkip) {
        return a.stats.canSkip - b.stats.canSkip;
      }
      if (a.stats.percentage !== b.stats.percentage) {
        return a.stats.percentage - b.stats.percentage;
      }
      return b.weeklySessions - a.weeklySessions;
    }

    if (a.stats.canSkip !== b.stats.canSkip) {
      return a.stats.canSkip - b.stats.canSkip;
    }
    return a.stats.percentage - b.stats.percentage;
  });

  const projectedOverallPercentage =
    projectedHeldTotal > 0 ? round1((projectedAttendedTotal / projectedHeldTotal) * 100) : 100;
  const deltaPercentage = round1(projectedOverallPercentage - overall.overallPercentage);

  const trendStatus: AttendanceTrendStatus =
    overall.shortageCount > 0 ? 'at-risk' : overall.borderlineCount > 0 ? 'watch' : 'on-track';

  let headline: string;
  let summary: string;

  if (overall.shortageCount > 0) {
    const courseWord = overall.shortageCount === 1 ? 'course' : 'courses';
    const classWord = totalClassesNeededToRecover === 1 ? 'class' : 'classes';
    headline = `${overall.shortageCount} ${courseWord} below ${safeTarget}% — ${totalClassesNeededToRecover} consecutive ${classWord} needed`;

    const leadCourse = priorityCourses[0];
    const recoveryNote =
      coursesRecoveredInOneWeek > 0
        ? ` Attending all scheduled classes next week recovers ${coursesRecoveredInOneWeek} ${coursesRecoveredInOneWeek === 1 ? 'course' : 'courses'} and lifts overall attendance to ${projectedOverallPercentage.toFixed(1)}%.`
        : ` A full week of attendance lifts overall standing from ${overall.overallPercentage.toFixed(1)}% to ${projectedOverallPercentage.toFixed(1)}%.`;

    summary = `Prioritize ${leadCourse.subject.courseName} first (${leadCourse.stats.percentage.toFixed(1)}%, needs ${leadCourse.stats.mustAttend} in a row).${recoveryNote}`;
  } else if (overall.borderlineCount > 0) {
    const courseWord = overall.borderlineCount === 1 ? 'course' : 'courses';
    headline = `All courses meet ${safeTarget}%, with ${overall.borderlineCount} ${courseWord} on a tight margin`;
    const leadCourse = priorityCourses[0];
    summary = `${leadCourse.subject.courseName} has the thinnest cushion (${leadCourse.stats.percentage.toFixed(1)}%, ${leadCourse.stats.verdict.toLowerCase()}). Attending next ${projectionHorizon === 'week' ? 'week’s classes' : 'session'} lifts overall attendance to ${projectedOverallPercentage.toFixed(1)}%.`;
  } else {
    headline = `All ${subjects.length} courses comfortably above ${safeTarget}%`;
    summary = `You hold a ${marginFromTarget >= 0 ? '+' : ''}${marginFromTarget.toFixed(1)} pt margin above ${safeTarget}% with ${totalSkippableBuffer} total skippable classes across your courses.`;
  }

  return {
    targetPercent: safeTarget,
    overallPercentage: overall.overallPercentage,
    totalAttended: overall.totalAttended,
    totalHeld: overall.totalHeld,
    marginFromTarget,
    trendStatus,
    headline,
    summary,
    distribution: {
      safeCount: overall.safeCount,
      borderlineCount: overall.borderlineCount,
      shortageCount: overall.shortageCount,
      totalCourses: subjects.length,
    },
    totalClassesNeededToRecover,
    totalSkippableBuffer,
    weeklyScheduledClasses,
    oneWeekProjection: {
      horizon: projectionHorizon,
      projectedOverallPercentage,
      deltaPercentage,
      coursesRecoveredInOneWeek,
      projectedShortageCount,
    },
    priorityCourses,
  };
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateAsLocalMidnight(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const isoDayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDayMatch) {
    const year = Number(isoDayMatch[1]);
    const month = Number(isoDayMatch[2]);
    const day = Number(isoDayMatch[3]);
    const dt = new Date(year, month - 1, day);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Clamps a recorded attendance date strictly to <= today so future scheduled sessions
 * never appear as recorded attendance dates.
 */
export function clampAttendanceDateToToday(
  rawDate: string,
  now = new Date()
): { dateKey: string; displayDate: string; wasFuture: boolean } {
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parsed = parseDateAsLocalMidnight(rawDate);
  if (!parsed) {
    return {
      dateKey: toLocalDateKey(todayMidnight),
      displayDate: todayMidnight.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      wasFuture: false,
    };
  }

  const wasFuture = parsed.getTime() > todayMidnight.getTime();
  const effective = wasFuture ? todayMidnight : parsed;
  return {
    dateKey: toLocalDateKey(effective),
    displayDate: effective.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    wasFuture,
  };
}

export interface LatestAttendanceDateInfo {
  latestDateKey: string | null;
  formattedDate: string | null;
  shortDate: string | null;
  cappedToToday: boolean;
}

/**
 * Computes the latest recorded attendance cutoff date across all subjects, strictly capped to today.
 */
export function getLatestAttendanceDate(
  subjects: AttendanceSubject[],
  now = new Date()
): LatestAttendanceDateInfo {
  if (subjects.length === 0) {
    return { latestDateKey: null, formattedDate: null, shortDate: null, cappedToToday: false };
  }

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let latest: Date | null = null;
  let cappedToToday = false;

  for (const subject of subjects) {
    const parsed = parseDateAsLocalMidnight(subject.lastUpdated);
    if (!parsed) continue;
    let effective = parsed;
    if (effective.getTime() > todayMidnight.getTime()) {
      effective = todayMidnight;
      cappedToToday = true;
    }
    if (!latest || effective.getTime() > latest.getTime()) {
      latest = effective;
    }
  }

  const finalDate = latest ?? todayMidnight;
  return {
    latestDateKey: toLocalDateKey(finalDate),
    formattedDate: finalDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    shortDate: finalDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    }),
    cappedToToday,
  };
}


