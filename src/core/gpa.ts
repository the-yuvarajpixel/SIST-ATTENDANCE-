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
  courses?: PlannedCourse[];
}

export function resolveFutureSemesterStats(fut: SimulatedFutureSemester): {
  sgpa: number;
  credits: number;
  usingCourses: boolean;
} {
  if (fut.courses && fut.courses.length > 0) {
    const computed = computeSemesterGpa(
      fut.courses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
    );
    if (computed.credits > 0) {
      return {
        sgpa: computed.sgpa,
        credits: computed.credits,
        usingCourses: true,
      };
    }
  }
  return {
    sgpa: Math.min(10, Math.max(0, round2(fut.expectedSgpa))),
    credits: Math.max(0, Math.round(fut.credits)),
    usingCourses: false,
  };
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
    const resolved = resolveFutureSemesterStats(fut);
    if (resolved.credits <= 0) continue;

    cumulativeWeighted += resolved.sgpa * resolved.credits;
    cumulativeCredits += resolved.credits;
    const cgpa = round2(cumulativeWeighted / cumulativeCredits);

    points.push({
      semester: fut.semester,
      label: resolved.usingCourses ? `Sem ${fut.semester} (Grades)` : `Sem ${fut.semester} (Sim)`,
      shortLabel: `S${fut.semester}*`,
      kind: 'simulated',
      sgpa: round2(resolved.sgpa),
      credits: resolved.credits,
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

export interface GradeDistributionSubjectItem {
  courseCode: string;
  courseName: string;
  credits: number;
  grade: GradeLetter;
  gradePoints: number;
  semester: number;
  termLabel: string;
  isPlanned: boolean;
}

export interface GradeDistributionBucket {
  grade: GradeLetter;
  gradePoints: number;
  count: number;
  credits: number;
  sharePercent: number;
  creditSharePercent: number;
  subjects: GradeDistributionSubjectItem[];
}

export interface GradeDistributionResult {
  buckets: GradeDistributionBucket[];
  subjects: GradeDistributionSubjectItem[];
  totalSubjects: number;
  totalCredits: number;
  topTierCount: number;
  topTierPercent: number;
  dominantGrade: GradeLetter | null;
  dominantCount: number;
  averageGradePoints: number;
}

export type GradeDistributionScope = 'all' | 'with-planned' | number;

/**
 * Computes subject grade distribution across completed semesters (and optionally
 * the current semester's planned grades) for the ResultsView bar chart.
 */
export function buildGradeDistribution(
  semesters: SemesterResult[],
  options: {
    scope?: GradeDistributionScope;
    currentSemester?: number;
    plannedCourses?: PlannedCourse[];
  } = {}
): GradeDistributionResult {
  const scope = options.scope ?? 'all';
  const sortedSemesters = [...semesters].sort((a, b) => a.semester - b.semester);
  const subjects: GradeDistributionSubjectItem[] = [];

  for (const sem of sortedSemesters) {
    if (typeof scope === 'number' && sem.semester !== scope) continue;
    for (const c of sem.courses) {
      const gp = GRADE_POINTS[c.grade] ?? c.gradePoints;
      subjects.push({
        courseCode: c.courseCode,
        courseName: c.courseName,
        credits: c.credits,
        grade: c.grade,
        gradePoints: gp,
        semester: sem.semester,
        termLabel: sem.termLabel,
        isPlanned: false,
      });
    }
  }

  if (scope === 'with-planned' && options.plannedCourses && options.plannedCourses.length > 0) {
    const curSem = options.currentSemester ?? (sortedSemesters[sortedSemesters.length - 1]?.semester ?? 0) + 1;
    for (const c of options.plannedCourses) {
      subjects.push({
        courseCode: c.courseCode,
        courseName: c.courseName,
        credits: c.credits,
        grade: c.expectedGrade,
        gradePoints: GRADE_POINTS[c.expectedGrade],
        semester: curSem,
        termLabel: `Sem ${curSem} (Plan)`,
        isPlanned: true,
      });
    }
  }

  const byGrade = new Map<GradeLetter, GradeDistributionSubjectItem[]>();
  for (const g of ORDERED_GRADES) {
    byGrade.set(g, []);
  }
  for (const item of subjects) {
    const list = byGrade.get(item.grade);
    if (list) list.push(item);
  }

  const totalSubjects = subjects.length;
  const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0);
  const weightedPoints = subjects.reduce((sum, s) => sum + s.gradePoints * Math.max(1, s.credits), 0);
  const weightDenom = subjects.reduce((sum, s) => sum + Math.max(1, s.credits), 0);

  let dominantGrade: GradeLetter | null = null;
  let dominantCount = 0;

  const buckets: GradeDistributionBucket[] = ORDERED_GRADES.map((grade) => {
    const list = byGrade.get(grade) ?? [];
    const count = list.length;
    const credits = list.reduce((sum, s) => sum + s.credits, 0);
    if (count > dominantCount) {
      dominantCount = count;
      dominantGrade = grade;
    }
    return {
      grade,
      gradePoints: GRADE_POINTS[grade],
      count,
      credits,
      sharePercent: totalSubjects > 0 ? Math.round((count / totalSubjects) * 1000) / 10 : 0,
      creditSharePercent: totalCredits > 0 ? Math.round((credits / totalCredits) * 1000) / 10 : 0,
      subjects: list,
    };
  });

  const topTierCount = (byGrade.get('O')?.length ?? 0) + (byGrade.get('A+')?.length ?? 0);
  const topTierPercent = totalSubjects > 0 ? Math.round((topTierCount / totalSubjects) * 1000) / 10 : 0;
  const averageGradePoints = weightDenom > 0 ? round2(weightedPoints / weightDenom) : 0;

  return {
    buckets,
    subjects,
    totalSubjects,
    totalCredits,
    topTierCount,
    topTierPercent,
    dominantGrade,
    dominantCount,
    averageGradePoints,
  };
}

export interface OverviewCalculatorCourse {
  id: string;
  name: string;
  grade: GradeLetter;
  credits: number;
}

export interface OverviewCalculatorSemester {
  id: string;
  semester: number;
  inputMode: 'courses' | 'sgpa';
  sgpa: number;
  credits: number;
  courses: OverviewCalculatorCourse[];
}

export interface OverviewSemesterCalcBreakdown {
  id: string;
  semester: number;
  inputMode: 'courses' | 'sgpa';
  sgpa: number;
  credits: number;
  gradePoints: number;
  cumulativeCgpa: number;
  cumulativeCredits: number;
  courseCount: number;
  hasArrear: boolean;
}

export interface OverviewCgpaCalculationResult {
  overallCgpa: number;
  totalCredits: number;
  totalGradePoints: number;
  equivalentPercent: number;
  classification:
    | 'First Class with Distinction'
    | 'First Class'
    | 'Second Class'
    | 'Pass'
    | 'Incomplete';
  hasArrears: boolean;
  bestSemester: OverviewSemesterCalcBreakdown | null;
  semesters: OverviewSemesterCalcBreakdown[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes overall CGPA and running semester-by-semester progression from
 * user-editable semester grades and credit points (supporting both course-level
 * grade/credit entry and direct semester SGPA/credit entry).
 */
export function computeOverviewSemesterCgpa(
  semesters: OverviewCalculatorSemester[]
): OverviewCgpaCalculationResult {
  const ordered = [...semesters].sort((a, b) => a.semester - b.semester);
  const breakdowns: OverviewSemesterCalcBreakdown[] = [];
  let runningWeighted = 0;
  let runningCredits = 0;
  let anyArrear = false;
  let bestSemester: OverviewSemesterCalcBreakdown | null = null;

  for (const sem of ordered) {
    let semCredits = 0;
    let semWeighted = 0;
    let semSgpa = 0;
    let semHasArrear = false;
    let courseCount = 0;

    if (sem.inputMode === 'courses') {
      for (const course of sem.courses) {
        const cr = clamp(Number(course.credits) || 0, 0, 20);
        if (cr <= 0) continue;
        courseCount += 1;
        const gp = GRADE_POINTS[course.grade] ?? 0;
        if (course.grade === 'RA') semHasArrear = true;
        semCredits += cr;
        semWeighted += cr * gp;
      }
      semSgpa = semCredits > 0 ? round2(semWeighted / semCredits) : 0;
    } else {
      semCredits = clamp(Number(sem.credits) || 0, 0, 60);
      semSgpa = clamp(Number(sem.sgpa) || 0, 0, 10);
      semWeighted = semCredits * semSgpa;
      semHasArrear = semCredits > 0 && semSgpa === 0;
    }

    if (semHasArrear) anyArrear = true;
    runningCredits += semCredits;
    runningWeighted += semWeighted;
    const cumulativeCgpa = runningCredits > 0 ? round2(runningWeighted / runningCredits) : 0;

    const item: OverviewSemesterCalcBreakdown = {
      id: sem.id,
      semester: sem.semester,
      inputMode: sem.inputMode,
      sgpa: round2(semSgpa),
      credits: Math.round(semCredits * 10) / 10,
      gradePoints: round2(semWeighted),
      cumulativeCgpa,
      cumulativeCredits: Math.round(runningCredits * 10) / 10,
      courseCount,
      hasArrear: semHasArrear,
    };

    breakdowns.push(item);
    if (item.credits > 0 && (!bestSemester || item.sgpa > bestSemester.sgpa)) {
      bestSemester = item;
    }
  }

  const overallCgpa = runningCredits > 0 ? round2(runningWeighted / runningCredits) : 0;
  const equivalentPercent = round2(overallCgpa * 10);

  let classification: OverviewCgpaCalculationResult['classification'] = 'Incomplete';
  if (runningCredits > 0) {
    if (!anyArrear && overallCgpa >= 8.5) {
      classification = 'First Class with Distinction';
    } else if (overallCgpa >= 6.5) {
      classification = 'First Class';
    } else if (overallCgpa >= 5.5) {
      classification = 'Second Class';
    } else {
      classification = 'Pass';
    }
  }

  return {
    overallCgpa,
    totalCredits: Math.round(runningCredits * 10) / 10,
    totalGradePoints: round2(runningWeighted),
    equivalentPercent,
    classification,
    hasArrears: anyArrear,
    bestSemester,
    semesters: breakdowns,
  };
}

export function seedCalculatorFromSemesters(
  semesters: SemesterResult[]
): OverviewCalculatorSemester[] {
  return [...semesters]
    .sort((a, b) => a.semester - b.semester)
    .map((sem) => {
      const hasCourses = sem.courses.length > 0;
      return {
        id: `sem-${sem.semester}`,
        semester: sem.semester,
        inputMode: hasCourses ? 'courses' : 'sgpa',
        sgpa: round2(sem.sgpa),
        credits: Math.max(0, sem.credits),
        courses: sem.courses.map((c, idx) => ({
          id: `sem-${sem.semester}-c-${idx + 1}`,
          name: c.courseName || c.courseCode,
          grade: c.grade,
          credits: c.credits,
        })),
      };
    });
}

export function createDefaultCalculatorSemesters(): OverviewCalculatorSemester[] {
  return [
    {
      id: 'sem-1',
      semester: 1,
      inputMode: 'courses',
      sgpa: 9.0,
      credits: 16,
      courses: [
        { id: 'sem-1-c-1', name: 'Subject 1', grade: 'O', credits: 4 },
        { id: 'sem-1-c-2', name: 'Subject 2', grade: 'A+', credits: 4 },
        { id: 'sem-1-c-3', name: 'Subject 3', grade: 'A+', credits: 4 },
        { id: 'sem-1-c-4', name: 'Subject 4', grade: 'A', credits: 4 },
      ],
    },
    {
      id: 'sem-2',
      semester: 2,
      inputMode: 'courses',
      sgpa: 8.75,
      credits: 16,
      courses: [
        { id: 'sem-2-c-1', name: 'Subject 1', grade: 'A+', credits: 4 },
        { id: 'sem-2-c-2', name: 'Subject 2', grade: 'A+', credits: 4 },
        { id: 'sem-2-c-3', name: 'Subject 3', grade: 'A', credits: 4 },
        { id: 'sem-2-c-4', name: 'Subject 4', grade: 'O', credits: 4 },
      ],
    },
  ];
}

export interface TargetCgpaGradeMixItem {
  grade: GradeLetter;
  points: number;
  count: number;
}

export interface TargetCgpaMilestone {
  step: number;
  label: string;
  projectedCgpa: number;
  cumulativeCredits: number;
}

export interface TargetCgpaSimulationResult {
  targetCgpa: number;
  currentCgpa: number;
  completedCredits: number;
  remainingSemesters: number;
  creditsPerSemester: number;
  totalFutureCredits: number;
  requiredAverageSgpa: number;
  maxPossibleCgpa: number;
  minPassingCgpa: number;
  status: 'already-met' | 'achievable' | 'challenging' | 'unreachable';
  headline: string;
  detail: string;
  coursesPerSemesterEstimate: number;
  recommendedGradeMix: TargetCgpaGradeMixItem[];
  recommendedMixSgpa: number;
  milestones: TargetCgpaMilestone[];
}

const PASSING_GRADES: GradeLetter[] = ['C', 'B', 'B+', 'A', 'A+', 'O'];

/**
 * Simulates what average SGPA and subject-grade mix a student needs across
 * future semesters to reach a desired Target CGPA.
 */
export function simulateTargetCgpaPlan(
  currentCgpa: number,
  completedCredits: number,
  targetCgpa: number,
  remainingSemesters: number,
  creditsPerSemester = 20,
  startingSemesterNumber = 1
): TargetCgpaSimulationResult {
  const safeCurrent = clamp(Number(currentCgpa) || 0, 0, 10);
  const safeCompleted = Math.max(0, Number(completedCredits) || 0);
  const safeTarget = clamp(Number(targetCgpa) || 0, 0, 10);
  const safeSemesters = Math.min(8, Math.max(1, Math.round(Number(remainingSemesters) || 1)));
  const safeCreditsPerSem = Math.min(40, Math.max(4, Math.round(Number(creditsPerSemester) || 20)));
  const totalFutureCredits = safeSemesters * safeCreditsPerSem;
  const totalCredits = safeCompleted + totalFutureCredits;

  const maxPossibleCgpa = round2(
    (safeCurrent * safeCompleted + 10 * totalFutureCredits) / totalCredits
  );
  const minPassingCgpa = round2(
    (safeCurrent * safeCompleted + 5 * totalFutureCredits) / totalCredits
  );

  const rawRequired =
    (safeTarget * totalCredits - safeCurrent * safeCompleted) / totalFutureCredits;
  const requiredAverageSgpa = round2(Math.max(0, rawRequired));

  let status: TargetCgpaSimulationResult['status'];
  let headline: string;
  let detail: string;

  if (rawRequired <= 5.0 && safeCompleted > 0 && minPassingCgpa >= safeTarget) {
    status = 'already-met';
    headline = `Target ${safeTarget.toFixed(2)} CGPA is comfortably secured`;
    detail = `Even with minimum passing grades (5.00 SGPA), you finish at ${minPassingCgpa.toFixed(2)} CGPA across ${safeSemesters} remaining ${safeSemesters === 1 ? 'semester' : 'semesters'}.`;
  } else if (rawRequired > 10) {
    status = 'unreachable';
    headline = `Needs ${rawRequired.toFixed(2)} SGPA — exceeds 10.00 ceiling`;
    detail = `Scoring all O grades (10.00 SGPA) across ${safeSemesters} remaining ${safeSemesters === 1 ? 'semester' : 'semesters'} (${totalFutureCredits} cr) reaches a maximum of ${maxPossibleCgpa.toFixed(2)} CGPA.`;
  } else if (requiredAverageSgpa >= 9.25) {
    status = 'challenging';
    headline = `Need ${requiredAverageSgpa.toFixed(2)} avg SGPA across ${safeSemesters} ${safeSemesters === 1 ? 'semester' : 'semesters'}`;
    detail = `Requires mostly O and A+ grades over the next ${totalFutureCredits} credits to reach ${safeTarget.toFixed(2)} CGPA.`;
  } else {
    status = 'achievable';
    headline = `Need ${requiredAverageSgpa.toFixed(2)} avg SGPA across ${safeSemesters} ${safeSemesters === 1 ? 'semester' : 'semesters'}`;
    detail = `Maintain an average of ${requiredAverageSgpa.toFixed(2)} SGPA over the next ${totalFutureCredits} credits to hit ${safeTarget.toFixed(2)} CGPA.`;
  }

  // Construct an intuitive equal-credit subject grade mix per semester (~4 credits per course)
  const coursesPerSemesterEstimate = Math.min(8, Math.max(3, Math.round(safeCreditsPerSem / 4)));
  const goalSgpa = Math.min(10, Math.max(5, requiredAverageSgpa));
  // Start every subject at the floor passing grade (C = 5) and greedily upgrade subjects
  // until average grade points >= goalSgpa.
  const gradeIndices = Array.from({ length: coursesPerSemesterEstimate }, () => 0);
  const targetPointsSum = Math.ceil(goalSgpa * coursesPerSemesterEstimate - 1e-9);
  let currentPointsSum = coursesPerSemesterEstimate * GRADE_POINTS[PASSING_GRADES[0]];

  while (currentPointsSum < targetPointsSum) {
    // Upgrade the lowest-graded subject first so the mix stays balanced and realistic
    let lowestIdx = -1;
    let lowestVal = Infinity;
    for (let i = 0; i < gradeIndices.length; i += 1) {
      if (gradeIndices[i] < PASSING_GRADES.length - 1 && gradeIndices[i] < lowestVal) {
        lowestVal = gradeIndices[i];
        lowestIdx = i;
      }
    }
    if (lowestIdx === -1) break;
    gradeIndices[lowestIdx] += 1;
    currentPointsSum += 1;
  }

  const mixCounts = new Map<GradeLetter, number>();
  for (const idx of gradeIndices) {
    const g = PASSING_GRADES[idx];
    mixCounts.set(g, (mixCounts.get(g) ?? 0) + 1);
  }

  const recommendedGradeMix: TargetCgpaGradeMixItem[] = ORDERED_GRADES.filter(
    (g) => (mixCounts.get(g) ?? 0) > 0
  ).map((grade) => ({
    grade,
    points: GRADE_POINTS[grade],
    count: mixCounts.get(grade) ?? 0,
  }));

  const recommendedMixSgpa = round2(currentPointsSum / coursesPerSemesterEstimate);

  // Build future semester progression milestones using achievable pace (capped at 10.0)
  const paceSgpa = Math.min(10, Math.max(5, requiredAverageSgpa));
  const milestones: TargetCgpaMilestone[] = [];
  let runWeighted = safeCurrent * safeCompleted;
  let runCredits = safeCompleted;
  for (let i = 1; i <= safeSemesters; i += 1) {
    runWeighted += paceSgpa * safeCreditsPerSem;
    runCredits += safeCreditsPerSem;
    milestones.push({
      step: i,
      label: `Sem ${startingSemesterNumber + i - 1}`,
      projectedCgpa: round2(runWeighted / runCredits),
      cumulativeCredits: runCredits,
    });
  }

  return {
    targetCgpa: round2(safeTarget),
    currentCgpa: round2(safeCurrent),
    completedCredits: Math.round(safeCompleted * 10) / 10,
    remainingSemesters: safeSemesters,
    creditsPerSemester: safeCreditsPerSem,
    totalFutureCredits,
    requiredAverageSgpa,
    maxPossibleCgpa,
    minPassingCgpa,
    status,
    headline,
    detail,
    coursesPerSemesterEstimate,
    recommendedGradeMix,
    recommendedMixSgpa,
    milestones,
  };
}





