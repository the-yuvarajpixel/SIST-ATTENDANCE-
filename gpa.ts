import type { CourseGrade, GradeLetter, PlannedCourse, SemesterResult } from './types';

export const GRADE_POINTS: Record<GradeLetter, number> = {
  O: 10,
  'A+': 9,
  A: 8,
  'B+': 7,
  B: 6,
  C: 5,
  RA: 0,
};

export const ORDERED_GRADES: GradeLetter[] = ['O', 'A+', 'A', 'B+', 'B', 'C', 'RA'];

export function computeSemesterGpa(courses: Pick<CourseGrade, 'credits' | 'grade'>[]): {
  sgpa: number;
  credits: number;
} {
  let weighted = 0;
  let credits = 0;
  for (const c of courses) {
    if (c.credits <= 0) continue;
    credits += c.credits;
    weighted += c.credits * GRADE_POINTS[c.grade];
  }
  const sgpa = credits > 0 ? Math.round((weighted / credits) * 100) / 100 : 0;
  return { sgpa, credits };
}

export function computeCgpaSummary(semesters: SemesterResult[]): {
  cgpa: number;
  completedCredits: number;
  bestSemester: SemesterResult | null;
  latestSemester: SemesterResult | null;
} {
  if (semesters.length === 0) {
    return {
      cgpa: 0,
      completedCredits: 0,
      bestSemester: null,
      latestSemester: null,
    };
  }

  let totalWeighted = 0;
  let completedCredits = 0;
  let bestSemester = semesters[0];
  let latestSemester = semesters[0];

  for (const sem of semesters) {
    // Recompute accurately from course list when courses are present
    const semStats = sem.courses.length > 0 ? computeSemesterGpa(sem.courses) : { sgpa: sem.sgpa, credits: sem.credits };
    totalWeighted += semStats.sgpa * semStats.credits;
    completedCredits += semStats.credits;
    if (sem.sgpa > bestSemester.sgpa) bestSemester = sem;
    if (sem.semester > latestSemester.semester) latestSemester = sem;
  }

  const cgpa = completedCredits > 0 ? Math.round((totalWeighted / completedCredits) * 100) / 100 : 0;
  return {
    cgpa,
    completedCredits,
    bestSemester,
    latestSemester,
  };
}

export function planTargetCgpa(
  currentCgpa: number,
  completedCredits: number,
  upcomingCredits: number,
  targetCgpa: number
): {
  requiredSgpa: number;
  achievable: boolean;
  maxPossibleCgpa: number;
  message: string;
} {
  const safeUpcoming = Math.max(1, upcomingCredits);
  const safeCompleted = Math.max(0, completedCredits);
  const totalCredits = safeCompleted + safeUpcoming;
  const maxPossibleCgpa =
    Math.round(((currentCgpa * safeCompleted + 10 * safeUpcoming) / totalCredits) * 100) / 100;

  const rawRequired = (targetCgpa * totalCredits - currentCgpa * safeCompleted) / safeUpcoming;
  const requiredSgpa = Math.round(rawRequired * 100) / 100;

  if (rawRequired <= 0) {
    return {
      requiredSgpa: 0,
      achievable: true,
      maxPossibleCgpa,
      message: `Already above ${targetCgpa.toFixed(2)} CGPA even with minimum passing grades.`,
    };
  }

  if (rawRequired > 10) {
    return {
      requiredSgpa,
      achievable: false,
      maxPossibleCgpa,
      message: `Requires ${requiredSgpa.toFixed(2)} SGPA (above 10.00). Highest possible this semester is ${maxPossibleCgpa.toFixed(2)} CGPA.`,
    };
  }

  return {
    requiredSgpa,
    achievable: true,
    maxPossibleCgpa,
    message: `Need ${requiredSgpa.toFixed(2)} SGPA across ${safeUpcoming} credits this semester to reach ${targetCgpa.toFixed(2)} CGPA.`,
  };
}

export function computeProjectedCgpa(
  currentCgpa: number,
  completedCredits: number,
  plannedCourses: PlannedCourse[]
): {
  plannedSgpa: number;
  plannedCredits: number;
  projectedCgpa: number;
  deltaCgpa: number;
} {
  const { sgpa: plannedSgpa, credits: plannedCredits } = computeSemesterGpa(
    plannedCourses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
  );

  const totalCredits = completedCredits + plannedCredits;
  const projectedCgpa =
    totalCredits > 0
      ? Math.round(((currentCgpa * completedCredits + plannedSgpa * plannedCredits) / totalCredits) * 100) / 100
      : currentCgpa;

  const deltaCgpa = Math.round((projectedCgpa - currentCgpa) * 100) / 100;
  return {
    plannedSgpa,
    plannedCredits,
    projectedCgpa,
    deltaCgpa,
  };
}

export interface SimulatedFutureSemester {
  semester: number;
  expectedSgpa: number;
  credits: number;
}

export interface CgpaTrajectoryPoint {
  semester: number;
  label: string;
  shortLabel: string;
  kind: 'completed' | 'planned' | 'simulated';
  sgpa: number;
  credits: number;
  cumulativeCredits: number;
  cgpa: number;
  completedCgpa: number | null;
  projectedCgpa: number | null;
}

export interface CgpaTrajectoryResult {
  points: CgpaTrajectoryPoint[];
  baselineCgpa: number;
  finalCgpa: number;
  finalCredits: number;
  deltaFromBaseline: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds an ordered semester-by-semester CGPA trajectory combining completed
 * semesters, the active semester's course-level grade plan, and any number of
 * simulated future semesters.
 */
export function buildCgpaTrajectory(
  completedSemesters: SemesterResult[],
  currentSemester: number,
  plannedCourses: PlannedCourse[],
  futureSemesters: SimulatedFutureSemester[]
): CgpaTrajectoryResult {
  const sortedCompleted = [...completedSemesters].sort((a, b) => a.semester - b.semester);
  const points: CgpaTrajectoryPoint[] = [];

  let cumulativeWeighted = 0;
  let cumulativeCredits = 0;

  for (const sem of sortedCompleted) {
    const semStats =
      sem.courses.length > 0
        ? computeSemesterGpa(sem.courses)
        : { sgpa: sem.sgpa, credits: sem.credits };
    cumulativeWeighted += semStats.sgpa * semStats.credits;
    cumulativeCredits += semStats.credits;
    const cgpa = cumulativeCredits > 0 ? round2(cumulativeWeighted / cumulativeCredits) : 0;

    points.push({
      semester: sem.semester,
      label: `Sem ${sem.semester}`,
      shortLabel: `S${sem.semester}`,
      kind: 'completed',
      sgpa: round2(semStats.sgpa),
      credits: semStats.credits,
      cumulativeCredits,
      cgpa,
      completedCgpa: cgpa,
      projectedCgpa: null,
    });
  }

  const baselineCgpa = points.length > 0 ? points[points.length - 1].cgpa : 0;
  const hasFuturePoints = plannedCourses.length > 0 || futureSemesters.length > 0;

  // Bridge the last completed semester so the projected line connects smoothly
  if (points.length > 0 && hasFuturePoints) {
    points[points.length - 1].projectedCgpa = points[points.length - 1].cgpa;
  }

  if (plannedCourses.length > 0) {
    const plannedStats = computeSemesterGpa(
      plannedCourses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
    );
    if (plannedStats.credits > 0) {
      cumulativeWeighted += plannedStats.sgpa * plannedStats.credits;
      cumulativeCredits += plannedStats.credits;
      const cgpa = round2(cumulativeWeighted / cumulativeCredits);

      points.push({
        semester: currentSemester,
        label: `Sem ${currentSemester} (Plan)`,
        shortLabel: `S${currentSemester}*`,
        kind: 'planned',
        sgpa: round2(plannedStats.sgpa),
        credits: plannedStats.credits,
        cumulativeCredits,
        cgpa,
        completedCgpa: null,
        projectedCgpa: cgpa,
      });
    }
  }

  const sortedFuture = [...futureSemesters].sort((a, b) => a.semester - b.semester);
  for (const fut of sortedFuture) {
    const safeCredits = Math.max(0, Math.round(fut.credits));
    const clampedSgpa = Math.min(10, Math.max(0, fut.expectedSgpa));
    if (safeCredits <= 0) continue;

    cumulativeWeighted += clampedSgpa * safeCredits;
    cumulativeCredits += safeCredits;
    const cgpa = round2(cumulativeWeighted / cumulativeCredits);

    points.push({
      semester: fut.semester,
      label: `Sem ${fut.semester} (Sim)`,
      shortLabel: `S${fut.semester}*`,
      kind: 'simulated',
      sgpa: round2(clampedSgpa),
      credits: safeCredits,
      cumulativeCredits,
      cgpa,
      completedCgpa: null,
      projectedCgpa: cgpa,
    });
  }

  const finalCgpa = points.length > 0 ? points[points.length - 1].cgpa : 0;
  return {
    points,
    baselineCgpa,
    finalCgpa,
    finalCredits: cumulativeCredits,
    deltaFromBaseline: round2(finalCgpa - baselineCgpa),
  };
}

export interface CgpaThresholdEvaluation {
  threshold: number;
  isBelowThreshold: boolean;
  finalBelow: boolean;
  shortfall: number;
  breachedSemesters: CgpaTrajectoryPoint[];
  lowestSimulatedPoint: CgpaTrajectoryPoint | null;
  remainingCredits: number;
  requiredAverageFutureSgpa: number | null;
  achievable: boolean;
  simulatedCredits: number;
  requiredSimulatedSgpa: number | null;
  simulatedAchievable: boolean;
}

/**
 * Evaluates a CGPA trajectory against a user-defined minimum CGPA threshold,
 * identifying any planned or simulated semesters that dip below the threshold
 * and computing both the average SGPA across all remaining semesters and the
 * exact SGPA needed across simulated future semesters alone to finish at or
 * above the threshold.
 */
export function evaluateCgpaThreshold(
  trajectory: CgpaTrajectoryResult,
  threshold: number
): CgpaThresholdEvaluation {
  const safeThreshold = round2(Math.min(10, Math.max(0, threshold)));
  const simulatedPoints = trajectory.points.filter((p) => p.kind !== 'completed');
  const breachedSemesters = simulatedPoints.filter((p) => p.cgpa < safeThreshold);

  let lowestSimulatedPoint: CgpaTrajectoryPoint | null = null;
  for (const pt of simulatedPoints) {
    if (!lowestSimulatedPoint || pt.cgpa < lowestSimulatedPoint.cgpa) {
      lowestSimulatedPoint = pt;
    }
  }

  const completedPoints = trajectory.points.filter((p) => p.kind === 'completed');
  const completedCredits =
    completedPoints.length > 0
      ? completedPoints[completedPoints.length - 1].cumulativeCredits
      : 0;
  const remainingCredits = Math.max(0, trajectory.finalCredits - completedCredits);

  const finalBelow = trajectory.finalCgpa < safeThreshold;
  const shortfall = finalBelow ? round2(safeThreshold - trajectory.finalCgpa) : 0;

  let requiredAverageFutureSgpa: number | null = null;
  let achievable = true;

  if (remainingCredits > 0) {
    const completedWeighted = trajectory.baselineCgpa * completedCredits;
    const rawNeeded =
      (safeThreshold * trajectory.finalCredits - completedWeighted) / remainingCredits;
    requiredAverageFutureSgpa = round2(Math.max(0, rawNeeded));
    achievable = rawNeeded <= 10;
  } else {
    achievable = !finalBelow;
  }

  // Compute SGPA required across strictly 'simulated' future semesters (holding completed + active planned constant)
  const nonSimulatedPoints = trajectory.points.filter((p) => p.kind !== 'simulated');
  const lockedCredits =
    nonSimulatedPoints.length > 0
      ? nonSimulatedPoints[nonSimulatedPoints.length - 1].cumulativeCredits
      : 0;
  const lockedCgpa =
    nonSimulatedPoints.length > 0
      ? nonSimulatedPoints[nonSimulatedPoints.length - 1].cgpa
      : 0;
  const simulatedCredits = Math.max(0, trajectory.finalCredits - lockedCredits);

  let requiredSimulatedSgpa: number | null = null;
  let simulatedAchievable = false;

  if (simulatedCredits > 0) {
    const rawSimNeeded =
      (safeThreshold * trajectory.finalCredits - lockedCgpa * lockedCredits) / simulatedCredits;
    requiredSimulatedSgpa = round2(Math.max(0, rawSimNeeded));
    simulatedAchievable = rawSimNeeded <= 10;
  }

  return {
    threshold: safeThreshold,
    isBelowThreshold: finalBelow || breachedSemesters.length > 0,
    finalBelow,
    shortfall,
    breachedSemesters,
    lowestSimulatedPoint,
    remainingCredits,
    requiredAverageFutureSgpa,
    achievable,
    simulatedCredits,
    requiredSimulatedSgpa,
    simulatedAchievable,
  };
}


