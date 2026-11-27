import type { GradeLetter, PlannedCourse, ResultsPayload, SubjectCaeMark } from './types';

export const SATHYABAMA_GRADE_POINTS: Record<GradeLetter, number> = {
  O: 10,
  'A+': 9,
  A: 8,
  'B+': 7,
  B: 6,
  C: 5,
  RA: 0,
};

export const SATHYABAMA_GRADES: GradeLetter[] = ['O', 'A+', 'A', 'B+', 'B', 'C', 'RA'];

export interface MarksEngineCourse {
  courseCode: string;
  courseName: string;
  credits: number;
  cae1: number | null;
  cae1Max: number;
  cae2: number | null;
  cae2Max: number;
  assignment: number | null;
  assignmentMax: number;
  internalTotal: number;
  internalMax: number;
  grade: GradeLetter;
  source: 'erp-cae' | 'erp-result' | 'fallback';
}

export interface MarksEngineSemester {
  id: string;
  semesterNumber: number;
  label: string;
  termLabel: string;
  isCaeTerm: boolean;
  sourceLabel: string;
  courses: MarksEngineCourse[];
}

export type SemanticTone = 'safe' | 'borderline' | 'risk';

/**
 * Computes weighted internal marks out of 50 from CAE 1 (/50 -> 20),
 * CAE 2 (/50 -> 20), and Assignment (/10 -> 10).
 */
export function computeInternalOutOf50(
  cae1: number,
  cae2: number,
  assignment: number
): number {
  const c1 = Math.max(0, Math.min(50, cae1));
  const c2 = Math.max(0, Math.min(50, cae2));
  const assign = Math.max(0, Math.min(10, assignment));
  const total = (c1 / 50) * 20 + (c2 / 50) * 20 + assign;
  return Math.round(total * 10) / 10;
}

/**
 * Fallback dataset used only if no ERP payload has been loaded yet.
 */
export const SATHYABAMA_MARKS_SEMESTERS: MarksEngineSemester[] = [
  {
    id: 'sem-5',
    semesterNumber: 5,
    label: 'Semester 5',
    termLabel: 'Odd 2025–26',
    isCaeTerm: true,
    sourceLabel: 'Sample Fallback',
    courses: [
      {
        courseCode: 'SCS1304',
        courseName: 'Operating Systems',
        credits: 4,
        cae1: 42,
        cae1Max: 50,
        cae2: 45,
        cae2Max: 50,
        assignment: 9,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(42, 45, 9),
        internalMax: 50,
        grade: 'A+',
        source: 'fallback',
      },
      {
        courseCode: 'SCS1305',
        courseName: 'Database Management Systems',
        credits: 4,
        cae1: 47,
        cae1Max: 50,
        cae2: 48,
        cae2Max: 50,
        assignment: 10,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(47, 48, 10),
        internalMax: 50,
        grade: 'O',
        source: 'fallback',
      },
      {
        courseCode: 'SCS1306',
        courseName: 'Computer Networks',
        credits: 4,
        cae1: 38,
        cae1Max: 50,
        cae2: 41,
        cae2Max: 50,
        assignment: 8.5,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(38, 41, 8.5),
        internalMax: 50,
        grade: 'A',
        source: 'fallback',
      },
      {
        courseCode: 'SMA1302',
        courseName: 'Probability & Queuing Theory',
        credits: 4,
        cae1: 31,
        cae1Max: 50,
        cae2: 34,
        cae2Max: 50,
        assignment: 7.5,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(31, 34, 7.5),
        internalMax: 50,
        grade: 'B+',
        source: 'fallback',
      },
      {
        courseCode: 'SCS4301',
        courseName: 'OS Lab',
        credits: 2,
        cae1: 48,
        cae1Max: 50,
        cae2: 49,
        cae2Max: 50,
        assignment: 10,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(48, 49, 10),
        internalMax: 50,
        grade: 'O',
        source: 'fallback',
      },
    ],
  },
  {
    id: 'sem-4',
    semesterNumber: 4,
    label: 'Semester 4',
    termLabel: 'Even 2024–25',
    isCaeTerm: false,
    sourceLabel: 'Sample Fallback',
    courses: [
      {
        courseCode: 'SCS1204',
        courseName: 'Design & Analysis of Algorithms',
        credits: 4,
        cae1: 43,
        cae1Max: 50,
        cae2: 44,
        cae2Max: 50,
        assignment: 9,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(43, 44, 9),
        internalMax: 50,
        grade: 'A+',
        source: 'fallback',
      },
      {
        courseCode: 'SCS1205',
        courseName: 'Computer Organization & Architecture',
        credits: 3,
        cae1: 39,
        cae1Max: 50,
        cae2: 40,
        cae2Max: 50,
        assignment: 8.5,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(39, 40, 8.5),
        internalMax: 50,
        grade: 'A',
        source: 'fallback',
      },
      {
        courseCode: 'SCS1206',
        courseName: 'Software Engineering',
        credits: 3,
        cae1: 46,
        cae1Max: 50,
        cae2: 47,
        cae2Max: 50,
        assignment: 9.5,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(46, 47, 9.5),
        internalMax: 50,
        grade: 'O',
        source: 'fallback',
      },
      {
        courseCode: 'SMA1203',
        courseName: 'Discrete Mathematics',
        credits: 4,
        cae1: 33,
        cae1Max: 50,
        cae2: 36,
        cae2Max: 50,
        assignment: 8,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(33, 36, 8),
        internalMax: 50,
        grade: 'B+',
        source: 'fallback',
      },
      {
        courseCode: 'SCS4201',
        courseName: 'Algorithms & Data Structures Lab',
        credits: 2,
        cae1: 49,
        cae1Max: 50,
        cae2: 48,
        cae2Max: 50,
        assignment: 10,
        assignmentMax: 10,
        internalTotal: computeInternalOutOf50(49, 48, 10),
        internalMax: 50,
        grade: 'O',
        source: 'fallback',
      },
    ],
  },
];

function inferGradeFromInternal(internalOutOf50: number): GradeLetter {
  if (internalOutOf50 >= 45) return 'O';
  if (internalOutOf50 >= 40) return 'A+';
  if (internalOutOf50 >= 35) return 'A';
  if (internalOutOf50 >= 30) return 'B+';
  if (internalOutOf50 >= 25) return 'B';
  if (internalOutOf50 >= 20) return 'C';
  return 'RA';
}

function adaptErpCaeToCourses(
  caeMarks: SubjectCaeMark[],
  plannedCourses: PlannedCourse[]
): MarksEngineCourse[] {
  const expectedGradeByCode = new Map(
    plannedCourses.map((c) => [c.courseCode.trim().toUpperCase(), c.expectedGrade])
  );

  return caeMarks.map((m) => {
    const internalMax = m.internalMax > 0 ? m.internalMax : 50;
    const normalizedOutOf50 =
      Math.round(((m.internalTotal / internalMax) * 50) * 10) / 10;
    const mappedGrade =
      expectedGradeByCode.get(m.courseCode.trim().toUpperCase()) ??
      inferGradeFromInternal(normalizedOutOf50);

    return {
      courseCode: m.courseCode,
      courseName: m.courseName,
      credits: m.credits > 0 ? m.credits : 3,
      cae1: m.cae1,
      cae1Max: m.cae1Max > 0 ? m.cae1Max : 50,
      cae2: m.cae2,
      cae2Max: m.cae2Max > 0 ? m.cae2Max : 50,
      assignment: m.internalBonus,
      assignmentMax: m.internalBonusMax > 0 ? m.internalBonusMax : 10,
      internalTotal: Math.round(m.internalTotal * 10) / 10,
      internalMax,
      grade: mappedGrade,
      source: 'erp-cae',
    };
  });
}

/**
 * Builds the Marks & CGPA Engine semesters directly from the student's ERP Portal
 * CAE Result (`payload.caeMarks`) and published ERP semester results (`payload.semesters`).
 * Falls back to `SATHYABAMA_MARKS_SEMESTERS` only when no ERP payload is available.
 */
export function buildMarksEngineSemesters(
  payload: ResultsPayload | null,
  isLiveMode: boolean
): MarksEngineSemester[] {
  if (!payload) {
    return SATHYABAMA_MARKS_SEMESTERS;
  }

  const adapted: MarksEngineSemester[] = [];
  const erpCae = payload.caeMarks ?? [];

  if (erpCae.length > 0) {
    const currentSemNum = payload.currentSemester || 6;
    const isSyncedErp = isLiveMode || Boolean(payload.caeErpSync?.synced);
    adapted.push({
      id: `erp-cae-sem-${currentSemNum}`,
      semesterNumber: currentSemNum,
      label: `Semester ${currentSemNum} (CAE)`,
      termLabel: isSyncedErp ? 'ERP Portal CAE Result' : 'Portal CAE Result',
      isCaeTerm: true,
      sourceLabel: isSyncedErp
        ? `Live ERP CAE (${payload.caeErpSync?.host ?? 'erp.sathyabama.ac.in'})`
        : 'Portal ERP CAE Preview',
      courses: adaptErpCaeToCourses(erpCae, payload.currentCourses ?? []),
    });
  }

  const sortedHistorical = [...(payload.semesters ?? [])].sort(
    (a, b) => b.semester - a.semester
  );
  for (const sem of sortedHistorical) {
    if (sem.courses.length === 0) continue;
    adapted.push({
      id: `erp-sem-${sem.semester}`,
      semesterNumber: sem.semester,
      label: `Semester ${sem.semester}`,
      termLabel: sem.termLabel || `Semester ${sem.semester}`,
      isCaeTerm: false,
      sourceLabel: isLiveMode ? 'Live ERP Result' : 'Portal ERP Result',
      courses: sem.courses.map((c) => {
        const pts = SATHYABAMA_GRADE_POINTS[c.grade] ?? 8;
        const estCae1 = Math.min(50, Math.max(18, Math.round(pts * 4.5)));
        const estCae2 = Math.min(50, Math.max(18, Math.round(pts * 4.7)));
        const estAssign = Math.min(10, Math.max(5, Math.round(pts * 0.95 * 2) / 2));
        return {
          courseCode: c.courseCode,
          courseName: c.courseName,
          credits: c.credits,
          cae1: estCae1,
          cae1Max: 50,
          cae2: estCae2,
          cae2Max: 50,
          assignment: estAssign,
          assignmentMax: 10,
          internalTotal: computeInternalOutOf50(estCae1, estCae2, estAssign),
          internalMax: 50,
          grade: c.grade,
          source: 'erp-result',
        };
      }),
    });
  }

  return adapted.length > 0 ? adapted : SATHYABAMA_MARKS_SEMESTERS;
}

export interface SemesterGpaStats {
  sgpa: number;
  totalCredits: number;
  passedCredits: number;
  arrearCount: number;
  averageInternal: number;
}

export function computeEngineSemesterStats(
  courses: MarksEngineCourse[],
  gradeOverrides: Record<string, GradeLetter> = {}
): SemesterGpaStats {
  let weightedPoints = 0;
  let totalCredits = 0;
  let passedCredits = 0;
  let arrearCount = 0;
  let internalSum = 0;
  let internalScoredCount = 0;

  for (const course of courses) {
    const effectiveGrade = gradeOverrides[course.courseCode] ?? course.grade;
    const gp = SATHYABAMA_GRADE_POINTS[effectiveGrade];
    if (course.credits > 0) {
      totalCredits += course.credits;
      weightedPoints += course.credits * gp;
      if (effectiveGrade === 'RA') {
        arrearCount += 1;
      } else {
        passedCredits += course.credits;
      }
    }
    if (course.internalMax > 0) {
      internalSum += (course.internalTotal / course.internalMax) * 50;
      internalScoredCount += 1;
    }
  }

  const sgpa = totalCredits > 0 ? Math.round((weightedPoints / totalCredits) * 100) / 100 : 0;
  const averageInternal =
    internalScoredCount > 0 ? Math.round((internalSum / internalScoredCount) * 10) / 10 : 0;

  return {
    sgpa,
    totalCredits,
    passedCredits,
    arrearCount,
    averageInternal,
  };
}

export function computeEngineCumulativeCgpa(
  semesters: MarksEngineSemester[],
  overridesBySemester: Record<string, Record<string, GradeLetter>> = {}
): {
  cgpa: number;
  totalCredits: number;
  totalArrears: number;
} {
  let weightedPoints = 0;
  let totalCredits = 0;
  let totalArrears = 0;

  for (const sem of semesters) {
    const overrides = overridesBySemester[sem.id] ?? {};
    for (const course of sem.courses) {
      const effectiveGrade = overrides[course.courseCode] ?? course.grade;
      const gp = SATHYABAMA_GRADE_POINTS[effectiveGrade];
      if (course.credits > 0) {
        totalCredits += course.credits;
        weightedPoints += course.credits * gp;
        if (effectiveGrade === 'RA') {
          totalArrears += 1;
        }
      }
    }
  }

  const cgpa = totalCredits > 0 ? Math.round((weightedPoints / totalCredits) * 100) / 100 : 0;
  return { cgpa, totalCredits, totalArrears };
}

export function getInternalStatusTone(internalOutOf50: number): SemanticTone {
  if (internalOutOf50 >= 40) return 'safe';
  if (internalOutOf50 >= 32) return 'borderline';
  return 'risk';
}

export function getGradeStatusTone(grade: GradeLetter): SemanticTone {
  if (grade === 'RA') return 'risk';
  if (grade === 'O' || grade === 'A+' || grade === 'A') return 'safe';
  return 'borderline';
}
