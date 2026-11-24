import type { AttendanceStats, AttendanceStatus, AttendanceSubject } from './types';

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
