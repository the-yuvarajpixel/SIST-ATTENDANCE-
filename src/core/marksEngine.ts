import type { GradeLetter, ResultsPayload, SubjectCaeMark } from './types';

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
  cae1: number; // out of 50
  cae2: number; // out of 50
  assignment: number; // out of 10
  internalTotal: number; // weighted out of 50
  grade: GradeLetter;
}

export interface MarksEngineSemester {
  id: string;
  semesterNumber: number;
  label: string;
  termLabel: string;
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
 * Default realistic Sathyabama University Semester 5 & Semester 4 datasets
 * with official-style subject codes for immediate demo & offline exploration.
 */
export const SATHYABAMA_MARKS_SEMESTERS: MarksEngineSemester[] = [
  {
    id: 'sem-5',
    semesterNumber: 5,
    label: 'Semester 5',
    termLabel: 'Odd 2025–26',
    courses: [
      {
        courseCode: 'SCS1304',
        courseName: 'Operating Systems',
        credits: 4,
        cae1: 42,
        cae2: 45,
        assignment: 9,
        internalTotal: computeInternalOutOf50(42, 45, 9),
        grade: 'A+',
      },
      {
        courseCode: 'SCS1305',
        courseName: 'Database Management Systems',
        credits: 4,
        cae1: 47,
        cae2: 48,
        assignment: 10,
        internalTotal: computeInternalOutOf50(47, 48, 10),
        grade: 'O',
      },
      {
        courseCode: 'SCS1306',
        courseName: 'Computer Networks',
        credits: 4,
        cae1: 38,
        cae2: 41,
        assignment: 8.5,
        internalTotal: computeInternalOutOf50(38, 41, 8.5),
        grade: 'A',
      },
      {
        courseCode: 'SMA1302',
        courseName: 'Probability & Queuing Theory',
        credits: 4,
        cae1: 31,
        cae2: 34,
        assignment: 7.5,
        internalTotal: computeInternalOutOf50(31, 34, 7.5),
        grade: 'B+',
      },
      {
        courseCode: 'SCS4301',
        courseName: 'OS Lab',
        credits: 2,
        cae1: 48,
        cae2: 49,
        assignment: 10,
        internalTotal: computeInternalOutOf50(48, 49, 10),
        grade: 'O',
      },
    ],
  },
  {
    id: 'sem-4',
    semesterNumber: 4,
    label: 'Semester 4',
    termLabel: 'Even 2024–25',
    courses: [
      {
        courseCode: 'SCS1204',
        courseName: 'Design & Analysis of Algorithms',
        credits: 4,
        cae1: 43,
        cae2: 44,
        assignment: 9,
        internalTotal: computeInternalOutOf50(43, 44, 9),
        grade: 'A+',
      },
      {
        courseCode: 'SCS1205',
        courseName: 'Computer Organization & Architecture',
        credits: 3,
        cae1: 39,
        cae2: 40,
        assignment: 8.5,
        internalTotal: computeInternalOutOf50(39, 40, 8.5),
        grade: 'A',
      },
      {
        courseCode: 'SCS1206',
        courseName: 'Software Engineering',
        credits: 3,
        cae1: 46,
        cae2: 47,
        assignment: 9.5,
        internalTotal: computeInternalOutOf50(46, 47, 9.5),
        grade: 'O',
      },
      {
        courseCode: 'SMA1203',
        courseName: 'Discrete Mathematics',
        credits: 4,
        cae1: 33,
        cae2: 36,
        assignment: 8,
        internalTotal: computeInternalOutOf50(33, 36, 8),
        grade: 'B+',
      },
      {
        courseCode: 'SCS4201',
        courseName: 'Algorithms & Data Structures Lab',
        credits: 2,
        cae1: 49,
        cae2: 48,
        assignment: 10,
        internalTotal: computeInternalOutOf50(49, 48, 10),
        grade: 'O',
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

function adaptLiveCaeToCourses(caeMarks: SubjectCaeMark[]): MarksEngineCourse[] {
  return caeMarks.map((m) => {
    const cae1 = m.cae1 ?? 0;
    const cae2 = m.cae2 ?? cae1;
    const assignment = m.internalBonus ?? 8;
    const internalTotal =
      m.internalMax > 0
        ? Math.round(((m.internalTotal / m.internalMax) * 50) * 10) / 10
        : computeInternalOutOf50(cae1, cae2, assignment);
    return {
      courseCode: m.courseCode,
      courseName: m.courseName,
      credits: m.credits,
      cae1,
      cae2,
      assignment,
      internalTotal,
      grade: inferGradeFromInternal(internalTotal),
    };
  });
}

/**
 * Resolves semester list for the Marks & CGPA Engine:
 * - In mock/demo mode (unless user uploaded custom CAE marks), serves the clean
 *   Sathyabama Semester 5 & Semester 4 dataset (SCS1304, SCS1305, SCS1306, SMA1302, SCS4301).
 * - In live ERP mode or when custom CAE marks are uploaded, adapts live records while
 *   keeping Semester 5 and Semester 4 selectable.
 */
export function buildMarksEngineSemesters(
  payload: ResultsPayload | null,
  isLiveMode: boolean
): MarksEngineSemester[] {
  if (!payload || (!isLiveMode && !payload.caeMarksUploaded)) {
    return SATHYABAMA_MARKS_SEMESTERS;
  }

  const adapted: MarksEngineSemester[] = [];
  const liveCae = payload.caeMarks ?? [];
  if (liveCae.length > 0) {
    const currentSemNum = payload.currentSemester || 6;
    adapted.push({
      id: `sem-${currentSemNum}`,
      semesterNumber: currentSemNum,
      label: `Semester ${currentSemNum}`,
      termLabel: 'Current ERP Term',
      courses: adaptLiveCaeToCourses(liveCae),
    });
  }

  const sortedHistorical = [...payload.semesters].sort((a, b) => b.semester - a.semester);
  for (const sem of sortedHistorical) {
    if (adapted.some((s) => s.semesterNumber === sem.semester)) continue;
    adapted.push({
      id: `sem-${sem.semester}`,
      semesterNumber: sem.semester,
      label: `Semester ${sem.semester}`,
      termLabel: sem.termLabel,
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
          cae2: estCae2,
          assignment: estAssign,
          internalTotal: computeInternalOutOf50(estCae1, estCae2, estAssign),
          grade: c.grade,
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
    internalSum += course.internalTotal;
  }

  const sgpa = totalCredits > 0 ? Math.round((weightedPoints / totalCredits) * 100) / 100 : 0;
  const averageInternal =
    courses.length > 0 ? Math.round((internalSum / courses.length) * 10) / 10 : 0;

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
