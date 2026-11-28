import type { AttendanceSubject } from './types';

export const DEFAULT_MIN_ATTENDANCE_PERCENT = 80;
export const BORDERLINE_MARGIN_POINTS = 3;

export type AttendanceColorBand = 'green' | 'amber' | 'red' | 'neutral';

export interface AttendanceCalculationResult {
  attended: number;
  total: number;
  absent: number;
  hasClasses: boolean;
  percentage: number;
  formattedPercentage: string;
  targetPercent: number;
  canSkip: number;
  mustAttend: number;
  band: AttendanceColorBand;
  statusLabel: 'Safe' | 'Borderline' | 'Shortage' | 'No Classes';
  guidanceText: string;
}

export interface OverallAttendanceCalculationSummary {
  attended: number;
  total: number;
  absent: number;
  stats: AttendanceCalculationResult;
  greenCount: number;
  amberCount: number;
  redCount: number;
  neutralCount: number;
}

export interface ManualAttendanceEntryInput {
  courseCode: string;
  courseName: string;
  attended: string | number;
  total: string | number;
  credits?: string | number;
  faculty?: string;
}

export type ManualAttendanceValidationResult =
  | { ok: true; subject: AttendanceSubject }
  | { ok: false; error: string };

function sanitizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function sanitizeTargetPercent(targetPercent: number): number {
  if (!Number.isFinite(targetPercent)) return DEFAULT_MIN_ATTENDANCE_PERCENT;
  return Math.min(99, Math.max(1, Math.round(targetPercent)));
}

/**
 * Formats an attendance percentage strictly to two decimal places (e.g. "87.50%").
 */
export function formatAttendancePercent2dp(percentage: number): string {
  if (!Number.isFinite(percentage)) return '0.00%';
  const clamped = Math.min(100, Math.max(0, percentage));
  return `${clamped.toFixed(2)}%`;
}

/**
 * Exact integer-arithmetic attendance engine with zero floating-point drift at boundaries.
 *
 * For the standard 80% minimum threshold:
 * - Attendance Percentage = (attended / total) * 100
 * - Absent Classes = total - attended
 * - Meets 80% iff 5 * attended >= 4 * total
 * - If >= 80%: canSkip = Math.floor((5 * attended - 4 * total) / 4)
 * - If < 80%:  mustAttend = 4 * total - 5 * attended
 * - Color bands:
 *   - Green: strictly above 83%  (100 * attended > 83 * total)
 *   - Amber: 80% to 83% inclusive (5 * attended >= 4 * total && 100 * attended <= 83 * total)
 *   - Red:   below 80%           (5 * attended < 4 * total)
 */
export function calculateAttendance(
  attendedInput: number,
  totalInput: number,
  targetPercent = DEFAULT_MIN_ATTENDANCE_PERCENT
): AttendanceCalculationResult {
  const safeTarget = sanitizeTargetPercent(targetPercent);
  const total = sanitizeNonNegativeInt(totalInput);
  const attended = Math.min(total, sanitizeNonNegativeInt(attendedInput));

  if (total === 0) {
    return {
      attended: 0,
      total: 0,
      absent: 0,
      hasClasses: false,
      percentage: 0,
      formattedPercentage: '0.00%',
      targetPercent: safeTarget,
      canSkip: 0,
      mustAttend: 0,
      band: 'neutral',
      statusLabel: 'No Classes',
      guidanceText: 'No classes conducted yet',
    };
  }

  const absent = total - attended;
  const rawPercentage = (attended / total) * 100;
  const percentage = Math.round(rawPercentage * 100) / 100;
  const formattedPercentage = rawPercentage.toFixed(2) + '%';

  let meetsTarget: boolean;
  let canSkip = 0;
  let mustAttend = 0;

  if (safeTarget === 80) {
    // Exact integer formulas requested for 80% threshold:
    // canSkip = floor((5 * attended - 4 * total) / 4)
    // mustAttend = 4 * total - 5 * attended
    meetsTarget = 5 * attended >= 4 * total;
    if (meetsTarget) {
      canSkip = Math.floor((5 * attended - 4 * total) / 4);
    } else {
      mustAttend = 4 * total - 5 * attended;
    }
  } else {
    meetsTarget = 100 * attended >= safeTarget * total;
    if (meetsTarget) {
      canSkip = Math.floor((100 * attended - safeTarget * total) / safeTarget);
    } else {
      const numerator = safeTarget * total - 100 * attended;
      const denominator = 100 - safeTarget;
      // Exact integer ceil(numerator / denominator)
      mustAttend = Math.floor((numerator + denominator - 1) / denominator);
    }
  }

  const greenCutoff = Math.min(100, safeTarget + BORDERLINE_MARGIN_POINTS);
  let band: AttendanceColorBand;
  let statusLabel: AttendanceCalculationResult['statusLabel'];

  if (!meetsTarget) {
    band = 'red';
    statusLabel = 'Shortage';
  } else if (100 * attended <= greenCutoff * total) {
    band = 'amber';
    statusLabel = 'Borderline';
  } else {
    band = 'green';
    statusLabel = 'Safe';
  }

  let guidanceText: string;
  if (meetsTarget) {
    guidanceText =
      canSkip === 1 ? 'You can skip 1 class' : `You can skip ${canSkip} classes`;
  } else {
    guidanceText =
      mustAttend === 1
        ? `You must attend 1 more consecutive class to reach ${safeTarget}%.`
        : `You must attend ${mustAttend} more consecutive classes to reach ${safeTarget}%.`;
  }

  return {
    attended,
    total,
    absent,
    hasClasses: true,
    percentage,
    formattedPercentage,
    targetPercent: safeTarget,
    canSkip,
    mustAttend,
    band,
    statusLabel,
    guidanceText,
  };
}

/**
 * Non-destructive What-If simulation: adds simulated present and absent classes
 * without mutating the underlying ERP subject record.
 */
export function calculateSimulatedAttendance(
  baseAttended: number,
  baseTotal: number,
  deltaPresent: number,
  deltaAbsent: number,
  targetPercent = DEFAULT_MIN_ATTENDANCE_PERCENT
): AttendanceCalculationResult {
  const safeBaseTotal = sanitizeNonNegativeInt(baseTotal);
  const safeBaseAttended = Math.min(safeBaseTotal, sanitizeNonNegativeInt(baseAttended));
  const safePresent = sanitizeNonNegativeInt(deltaPresent);
  const safeAbsent = sanitizeNonNegativeInt(deltaAbsent);

  const nextAttended = safeBaseAttended + safePresent;
  const nextTotal = safeBaseTotal + safePresent + safeAbsent;
  return calculateAttendance(nextAttended, nextTotal, targetPercent);
}

/**
 * Computes overall attendance strictly as sum(attended) / sum(conducted) across all subjects,
 * alongside per-subject Green (>83%), Amber (80%–83%), Red (<80%), and Neutral (0 classes) counts.
 */
export function calculateOverallAttendanceSummary(
  subjects: Array<Pick<AttendanceSubject, 'attended' | 'total'>>,
  targetPercent = DEFAULT_MIN_ATTENDANCE_PERCENT
): OverallAttendanceCalculationSummary {
  let totalAttended = 0;
  let totalConducted = 0;
  let greenCount = 0;
  let amberCount = 0;
  let redCount = 0;
  let neutralCount = 0;

  for (const subject of subjects) {
    const calc = calculateAttendance(subject.attended, subject.total, targetPercent);
    totalAttended += calc.attended;
    totalConducted += calc.total;
    if (calc.band === 'green') greenCount += 1;
    else if (calc.band === 'amber') amberCount += 1;
    else if (calc.band === 'red') redCount += 1;
    else neutralCount += 1;
  }

  const stats = calculateAttendance(totalAttended, totalConducted, targetPercent);
  return {
    attended: stats.attended,
    total: stats.total,
    absent: stats.absent,
    stats,
    greenCount,
    amberCount,
    redCount,
    neutralCount,
  };
}

function parseStrictNonNegativeInt(raw: string | number): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) return null;
    return raw;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Validates and normalizes a manual attendance entry before adding it to the local calculator.
 * Handles zero conducted classes (0/0) cleanly and rejects negative, decimal, NaN, or impossible values.
 */
export function validateManualAttendanceEntry(
  input: ManualAttendanceEntryInput,
  existingCodes?: Iterable<string>,
  todayIso = new Date().toISOString().slice(0, 10)
): ManualAttendanceValidationResult {
  const courseCode = input.courseCode.trim().toUpperCase().replace(/\s+/g, '');
  const courseName = input.courseName.trim();

  if (!courseCode) {
    return { ok: false, error: 'Enter a subject code (for example, SCSA1608).' };
  }
  if (courseCode.length > 20) {
    return { ok: false, error: 'Subject code must be 20 characters or fewer.' };
  }
  if (!/^[A-Z0-9_-]+$/.test(courseCode)) {
    return { ok: false, error: 'Subject code may only contain letters, numbers, hyphens, or underscores.' };
  }

  if (!courseName) {
    return { ok: false, error: 'Enter a subject name.' };
  }
  if (courseName.length > 100) {
    return { ok: false, error: 'Subject name must be 100 characters or fewer.' };
  }

  if (existingCodes) {
    for (const code of existingCodes) {
      if (code.trim().toUpperCase() === courseCode) {
        return {
          ok: false,
          error: `Subject ${courseCode} already exists. Use a different code or edit the existing manual entry.`,
        };
      }
    }
  }

  const total = parseStrictNonNegativeInt(input.total);
  if (total === null) {
    return { ok: false, error: 'Total conducted classes must be a whole number (0 or greater).' };
  }
  if (total > 500) {
    return { ok: false, error: 'Total conducted classes cannot exceed 500.' };
  }

  const attended = parseStrictNonNegativeInt(input.attended);
  if (attended === null) {
    return { ok: false, error: 'Present classes must be a whole number (0 or greater).' };
  }
  if (attended > total) {
    return { ok: false, error: 'Present classes cannot exceed total conducted classes.' };
  }

  const rawCredits = input.credits !== undefined && String(input.credits).trim() !== ''
    ? parseStrictNonNegativeInt(input.credits)
    : 3;
  if (rawCredits === null || rawCredits < 1 || rawCredits > 12) {
    return { ok: false, error: 'Credits must be a whole number between 1 and 12.' };
  }

  return {
    ok: true,
    subject: {
      courseCode,
      courseName,
      faculty: input.faculty?.trim() || 'Manual Entry',
      credits: rawCredits,
      attended,
      total,
      lastUpdated: todayIso,
    },
  };
}

const MANUAL_STORAGE_PREFIX = 'sist_manual_attendance_v1:';

export function readManualAttendanceSubjects(userKey: string): AttendanceSubject[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${MANUAL_STORAGE_PREFIX}${userKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: AttendanceSubject[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const res = validateManualAttendanceEntry(
        {
          courseCode: String(item.courseCode ?? ''),
          courseName: String(item.courseName ?? ''),
          attended: Number(item.attended),
          total: Number(item.total),
          credits: Number(item.credits ?? 3),
          faculty: typeof item.faculty === 'string' ? item.faculty : 'Manual Entry',
        },
        seen,
        typeof item.lastUpdated === 'string' ? item.lastUpdated : undefined
      );
      if (res.ok) {
        seen.add(res.subject.courseCode);
        valid.push(res.subject);
      }
    }
    return valid;
  } catch {
    return [];
  }
}

export function writeManualAttendanceSubjects(
  userKey: string,
  subjects: AttendanceSubject[]
): void {
  if (typeof window === 'undefined') return;
  try {
    if (subjects.length === 0) {
      window.localStorage.removeItem(`${MANUAL_STORAGE_PREFIX}${userKey}`);
    } else {
      window.localStorage.setItem(
        `${MANUAL_STORAGE_PREFIX}${userKey}`,
        JSON.stringify(subjects)
      );
    }
  } catch {
    // Ignore storage quota errors in restricted frames
  }
}
