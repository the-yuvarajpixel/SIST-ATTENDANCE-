import type {
  AttendanceSubject,
  CaeStanding,
  CaeTermTrendPoint,
  CourseGrade,
  DeadlineItem,
  GradeLetter,
  NotificationItem,
  PlannedCourse,
  ResultsPayload,
  SemesterResult,
  StudentProfile,
  SubjectCaeMark,
  TimetableSlot,
  Weekday,
} from './types';

export class SchemaValidationError extends Error {
  readonly issues: string[];
  constructor(section: string, issues: string[]) {
    super(`Validation failed for ${section}: ${issues.join('; ')}`);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

const VALID_DAYS = new Set<Weekday>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const VALID_GRADES = new Set<GradeLetter>(['O', 'A+', 'A', 'B+', 'B', 'C', 'RA']);
const VALID_CAE_STANDINGS = new Set<CaeStanding>(['strong', 'on-track', 'needs-improvement', 'pending']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(val: unknown, field: string, issues: string[]): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    issues.push(`${field} must be a non-empty string`);
    return '';
  }
  return val.trim();
}

function assertFiniteNumber(val: unknown, field: string, issues: string[], min = -Infinity, max = Infinity): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || val < min || val > max) {
    issues.push(`${field} must be a number between ${min} and ${max}`);
    return 0;
  }
  return val;
}

export function validateProfile(input: unknown): StudentProfile {
  const issues: string[] = [];
  if (!isRecord(input)) {
    throw new SchemaValidationError('profile', ['payload must be an object']);
  }
  const profile: StudentProfile = {
    registerNumber: assertNonEmptyString(input.registerNumber, 'registerNumber', issues),
    name: assertNonEmptyString(input.name, 'name', issues),
    program: assertNonEmptyString(input.program, 'program', issues),
    department: assertNonEmptyString(input.department, 'department', issues),
    semester: assertFiniteNumber(input.semester, 'semester', issues, 1, 12),
    batch: assertNonEmptyString(input.batch, 'batch', issues),
    section: assertNonEmptyString(input.section, 'section', issues),
    email: assertNonEmptyString(input.email, 'email', issues),
    advisor: assertNonEmptyString(input.advisor, 'advisor', issues),
    erpConnected: Boolean(input.erpConnected),
    lmsConnected: Boolean(input.lmsConnected),
  };
  if (issues.length > 0) throw new SchemaValidationError('profile', issues);
  return profile;
}

export function validateAttendance(input: unknown): AttendanceSubject[] {
  if (!Array.isArray(input)) {
    throw new SchemaValidationError('attendance', ['payload must be an array']);
  }
  const issues: string[] = [];
  const rows: AttendanceSubject[] = input.map((item, idx) => {
    if (!isRecord(item)) {
      issues.push(`[${idx}] must be an object`);
      return {
        courseCode: '',
        courseName: '',
        faculty: '',
        credits: 0,
        attended: 0,
        total: 0,
        lastUpdated: '',
      };
    }
    const attended = assertFiniteNumber(item.attended, `[${idx}].attended`, issues, 0, 500);
    const total = assertFiniteNumber(item.total, `[${idx}].total`, issues, 0, 500);
    if (attended > total) {
      issues.push(`[${idx}].attended (${attended}) cannot exceed total (${total})`);
    }
    return {
      courseCode: assertNonEmptyString(item.courseCode, `[${idx}].courseCode`, issues),
      courseName: assertNonEmptyString(item.courseName, `[${idx}].courseName`, issues),
      faculty: assertNonEmptyString(item.faculty, `[${idx}].faculty`, issues),
      credits: assertFiniteNumber(item.credits, `[${idx}].credits`, issues, 0, 12),
      attended,
      total,
      lastUpdated: assertNonEmptyString(item.lastUpdated, `[${idx}].lastUpdated`, issues),
    };
  });
  if (issues.length > 0) throw new SchemaValidationError('attendance', issues);
  return rows;
}

export function validateTimetable(input: unknown): TimetableSlot[] {
  if (!Array.isArray(input)) {
    throw new SchemaValidationError('timetable', ['payload must be an array']);
  }
  const issues: string[] = [];
  const timePattern = /^\d{2}:\d{2}$/;
  const slots: TimetableSlot[] = input.map((item, idx) => {
    if (!isRecord(item)) {
      issues.push(`[${idx}] must be an object`);
      return {
        id: '',
        day: 'Mon',
        startTime: '09:00',
        endTime: '10:00',
        courseCode: '',
        courseName: '',
        room: '',
        faculty: '',
        kind: 'Lecture',
      };
    }
    const day = item.day as Weekday;
    if (!VALID_DAYS.has(day)) {
      issues.push(`[${idx}].day must be Mon..Fri`);
    }
    const startTime = assertNonEmptyString(item.startTime, `[${idx}].startTime`, issues);
    const endTime = assertNonEmptyString(item.endTime, `[${idx}].endTime`, issues);
    if (startTime && !timePattern.test(startTime)) issues.push(`[${idx}].startTime invalid HH:MM`);
    if (endTime && !timePattern.test(endTime)) issues.push(`[${idx}].endTime invalid HH:MM`);
    const kind = item.kind === 'Lab' || item.kind === 'Tutorial' ? item.kind : 'Lecture';
    return {
      id: assertNonEmptyString(item.id, `[${idx}].id`, issues),
      day,
      startTime,
      endTime,
      courseCode: assertNonEmptyString(item.courseCode, `[${idx}].courseCode`, issues),
      courseName: assertNonEmptyString(item.courseName, `[${idx}].courseName`, issues),
      room: assertNonEmptyString(item.room, `[${idx}].room`, issues),
      faculty: assertNonEmptyString(item.faculty, `[${idx}].faculty`, issues),
      kind,
    };
  });
  if (issues.length > 0) throw new SchemaValidationError('timetable', issues);
  return slots;
}

export function validateResults(input: unknown): ResultsPayload {
  if (!isRecord(input) || !Array.isArray(input.semesters) || !Array.isArray(input.currentCourses)) {
    throw new SchemaValidationError('results', ['payload must contain semesters and currentCourses arrays']);
  }
  const issues: string[] = [];
  const semesters: SemesterResult[] = input.semesters.map((sem, sIdx) => {
    if (!isRecord(sem) || !Array.isArray(sem.courses)) {
      issues.push(`semesters[${sIdx}] must be an object with courses`);
      return { semester: 0, termLabel: '', sgpa: 0, credits: 0, courses: [] };
    }
    const courses: CourseGrade[] = sem.courses.map((c, cIdx) => {
      if (!isRecord(c)) {
        issues.push(`semesters[${sIdx}].courses[${cIdx}] invalid`);
        return { courseCode: '', courseName: '', credits: 0, grade: 'A', gradePoints: 8 };
      }
      const grade = c.grade as GradeLetter;
      if (!VALID_GRADES.has(grade)) {
        issues.push(`semesters[${sIdx}].courses[${cIdx}].grade invalid`);
      }
      return {
        courseCode: assertNonEmptyString(c.courseCode, `semesters[${sIdx}].courses[${cIdx}].courseCode`, issues),
        courseName: assertNonEmptyString(c.courseName, `semesters[${sIdx}].courses[${cIdx}].courseName`, issues),
        credits: assertFiniteNumber(c.credits, `semesters[${sIdx}].courses[${cIdx}].credits`, issues, 0, 12),
        grade,
        gradePoints: assertFiniteNumber(c.gradePoints, `semesters[${sIdx}].courses[${cIdx}].gradePoints`, issues, 0, 10),
      };
    });
    return {
      semester: assertFiniteNumber(sem.semester, `semesters[${sIdx}].semester`, issues, 1, 12),
      termLabel: assertNonEmptyString(sem.termLabel, `semesters[${sIdx}].termLabel`, issues),
      sgpa: assertFiniteNumber(sem.sgpa, `semesters[${sIdx}].sgpa`, issues, 0, 10),
      credits: assertFiniteNumber(sem.credits, `semesters[${sIdx}].credits`, issues, 0, 40),
      courses,
    };
  });

  const currentCourses: PlannedCourse[] = input.currentCourses.map((c, idx) => {
    if (!isRecord(c)) {
      issues.push(`currentCourses[${idx}] invalid`);
      return { courseCode: '', courseName: '', credits: 0, expectedGrade: 'A' };
    }
    const expectedGrade = c.expectedGrade as GradeLetter;
    if (!VALID_GRADES.has(expectedGrade)) {
      issues.push(`currentCourses[${idx}].expectedGrade invalid`);
    }
    return {
      courseCode: assertNonEmptyString(c.courseCode, `currentCourses[${idx}].courseCode`, issues),
      courseName: assertNonEmptyString(c.courseName, `currentCourses[${idx}].courseName`, issues),
      credits: assertFiniteNumber(c.credits, `currentCourses[${idx}].credits`, issues, 0, 12),
      expectedGrade,
    };
  });

  const currentSemester = assertFiniteNumber(input.currentSemester, 'currentSemester', issues, 1, 12);

  let caeMarks: SubjectCaeMark[] = [];
  if (input.caeMarks !== undefined) {
    if (!Array.isArray(input.caeMarks)) {
      issues.push('caeMarks must be an array when provided');
    } else {
      caeMarks = input.caeMarks.map((item, idx) => {
        if (!isRecord(item)) {
          issues.push(`caeMarks[${idx}] invalid`);
          return {
            courseCode: '',
            courseName: '',
            credits: 0,
            cae1: null,
            cae1Max: 50,
            cae2: null,
            cae2Max: 50,
            internalBonus: null,
            internalBonusMax: 10,
            internalTotal: 0,
            internalMax: 50,
            standing: 'pending',
          };
        }
        const cae1Max = assertFiniteNumber(item.cae1Max ?? 50, `caeMarks[${idx}].cae1Max`, issues, 1, 200);
        const cae2Max = assertFiniteNumber(item.cae2Max ?? 50, `caeMarks[${idx}].cae2Max`, issues, 1, 200);
        const internalBonusMax = assertFiniteNumber(
          item.internalBonusMax ?? 10,
          `caeMarks[${idx}].internalBonusMax`,
          issues,
          0,
          100
        );
        const internalMax = assertFiniteNumber(item.internalMax ?? 50, `caeMarks[${idx}].internalMax`, issues, 1, 200);
        const cae1 =
          item.cae1 === null || item.cae1 === undefined
            ? null
            : assertFiniteNumber(item.cae1, `caeMarks[${idx}].cae1`, issues, 0, cae1Max);
        const cae2 =
          item.cae2 === null || item.cae2 === undefined
            ? null
            : assertFiniteNumber(item.cae2, `caeMarks[${idx}].cae2`, issues, 0, cae2Max);
        const internalBonus =
          item.internalBonus === null || item.internalBonus === undefined
            ? null
            : assertFiniteNumber(
                item.internalBonus,
                `caeMarks[${idx}].internalBonus`,
                issues,
                0,
                Math.max(internalBonusMax, 100)
              );
        const internalTotal = assertFiniteNumber(
          item.internalTotal,
          `caeMarks[${idx}].internalTotal`,
          issues,
          0,
          internalMax
        );
        const rawStanding = item.standing as CaeStanding;
        const standing: CaeStanding = VALID_CAE_STANDINGS.has(rawStanding) ? rawStanding : 'pending';
        return {
          courseCode: assertNonEmptyString(item.courseCode, `caeMarks[${idx}].courseCode`, issues),
          courseName: assertNonEmptyString(item.courseName, `caeMarks[${idx}].courseName`, issues),
          credits: assertFiniteNumber(item.credits, `caeMarks[${idx}].credits`, issues, 0, 12),
          cae1,
          cae1Max,
          cae2,
          cae2Max,
          internalBonus,
          internalBonusMax,
          internalTotal,
          internalMax,
          standing,
          remarks: typeof item.remarks === 'string' && item.remarks.trim() ? item.remarks.trim() : undefined,
        };
      });
    }
  }

  let caeHistory: CaeTermTrendPoint[] = [];
  if (input.caeHistory !== undefined) {
    if (!Array.isArray(input.caeHistory)) {
      issues.push('caeHistory must be an array when provided');
    } else {
      caeHistory = input.caeHistory.map((item, idx) => {
        if (!isRecord(item)) {
          issues.push(`caeHistory[${idx}] invalid`);
          return {
            semester: 1,
            termLabel: '',
            cae1Avg: 0,
            cae2Avg: null,
            internalAvg: 0,
            internalMax: 50,
            subjectCount: 0,
          };
        }
        const internalMax = assertFiniteNumber(item.internalMax ?? 50, `caeHistory[${idx}].internalMax`, issues, 1, 200);
        const cae1Avg = assertFiniteNumber(item.cae1Avg, `caeHistory[${idx}].cae1Avg`, issues, 0, internalMax);
        const cae2Avg =
          item.cae2Avg === null || item.cae2Avg === undefined
            ? null
            : assertFiniteNumber(item.cae2Avg, `caeHistory[${idx}].cae2Avg`, issues, 0, internalMax);
        const internalAvg = assertFiniteNumber(item.internalAvg, `caeHistory[${idx}].internalAvg`, issues, 0, internalMax);
        return {
          semester: assertFiniteNumber(item.semester, `caeHistory[${idx}].semester`, issues, 1, 12),
          termLabel: assertNonEmptyString(item.termLabel, `caeHistory[${idx}].termLabel`, issues),
          cae1Avg,
          cae2Avg,
          internalAvg,
          internalMax,
          subjectCount: assertFiniteNumber(item.subjectCount ?? 0, `caeHistory[${idx}].subjectCount`, issues, 0, 30),
          isCurrent: Boolean(item.isCurrent),
        };
      });
    }
  }

  if (issues.length > 0) throw new SchemaValidationError('results', issues);
  return { semesters, currentSemester, currentCourses, caeMarks, caeHistory };
}

export function validateDeadlines(input: unknown): DeadlineItem[] {
  if (!Array.isArray(input)) {
    throw new SchemaValidationError('deadlines', ['payload must be an array']);
  }
  const issues: string[] = [];
  const items: DeadlineItem[] = input.map((item, idx) => {
    if (!isRecord(item)) {
      issues.push(`[${idx}] must be an object`);
      return { id: '', title: '', dueAt: '', kind: 'assignment', origin: 'LMS' };
    }
    const kind = item.kind === 'exam' || item.kind === 'fee' ? item.kind : 'assignment';
    const origin = item.origin === 'ERP' || item.origin === 'ERP + LMS' ? item.origin : 'LMS';
    const dueAt = assertNonEmptyString(item.dueAt, `[${idx}].dueAt`, issues);
    if (dueAt && Number.isNaN(Date.parse(dueAt))) {
      issues.push(`[${idx}].dueAt must be a valid ISO timestamp`);
    }
    return {
      id: assertNonEmptyString(item.id, `[${idx}].id`, issues),
      title: assertNonEmptyString(item.title, `[${idx}].title`, issues),
      courseCode: typeof item.courseCode === 'string' ? item.courseCode : undefined,
      courseName: typeof item.courseName === 'string' ? item.courseName : undefined,
      dueAt,
      kind,
      origin,
      amountInr: typeof item.amountInr === 'number' ? item.amountInr : undefined,
      notes: typeof item.notes === 'string' ? item.notes : undefined,
      mergedCount: typeof item.mergedCount === 'number' ? item.mergedCount : undefined,
    };
  });
  if (issues.length > 0) throw new SchemaValidationError('deadlines', issues);
  return items;
}

export function validateNotifications(input: unknown): NotificationItem[] {
  if (!Array.isArray(input)) {
    throw new SchemaValidationError('notifications', ['payload must be an array']);
  }
  const issues: string[] = [];
  const validCategories = new Set(['Circular', 'Exam', 'Course', 'Fee', 'Academic']);
  const items: NotificationItem[] = input.map((item, idx) => {
    if (!isRecord(item)) {
      issues.push(`[${idx}] must be an object`);
      return {
        id: '',
        title: '',
        summary: '',
        body: '',
        publishedAt: '',
        origin: 'ERP',
        category: 'Circular',
        unread: false,
      };
    }
    const publishedAt = assertNonEmptyString(item.publishedAt, `[${idx}].publishedAt`, issues);
    if (publishedAt && Number.isNaN(Date.parse(publishedAt))) {
      issues.push(`[${idx}].publishedAt must be a valid ISO timestamp`);
    }
    const origin = item.origin === 'LMS' ? 'LMS' : 'ERP';
    const rawCategory = typeof item.category === 'string' && validCategories.has(item.category)
      ? (item.category as NotificationItem['category'])
      : 'Academic';
    return {
      id: assertNonEmptyString(item.id, `[${idx}].id`, issues),
      title: assertNonEmptyString(item.title, `[${idx}].title`, issues),
      summary: assertNonEmptyString(item.summary, `[${idx}].summary`, issues),
      body: assertNonEmptyString(item.body, `[${idx}].body`, issues),
      publishedAt,
      origin,
      category: rawCategory,
      unread: Boolean(item.unread),
      courseCode: typeof item.courseCode === 'string' ? item.courseCode : undefined,
    };
  });
  if (issues.length > 0) throw new SchemaValidationError('notifications', issues);
  return items;
}
