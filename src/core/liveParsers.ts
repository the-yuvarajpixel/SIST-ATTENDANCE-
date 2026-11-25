import { GRADE_POINTS } from './gpa';
import {
  validateAttendance,
  validateDeadlines,
  validateNotifications,
  validateProfile,
  validateResults,
  validateTimetable,
} from './schemas';
import type {
  AttendanceSubject,
  CourseGrade,
  DeadlineItem,
  DeadlineKind,
  GradeLetter,
  NotificationItem,
  PlannedCourse,
  ResultsPayload,
  SemesterResult,
  StudentProfile,
  TimetableSlot,
  Weekday,
} from './types';

export class LiveUpstreamError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly field?: 'erpToken' | 'lmsToken';

  constructor(
    status: number,
    message: string,
    options?: { code?: string; field?: 'erpToken' | 'lmsToken' }
  ) {
    super(message);
    this.name = 'LiveUpstreamError';
    this.status = status;
    this.code = options?.code;
    this.field = options?.field;
  }
}

export interface MoodleSiteInfo {
  userid: number;
  username: string;
  fullname: string;
  sitename: string;
  siteurl?: string;
}

export interface MoodleCourseSummary {
  id: number;
  shortname: string;
  fullname: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrivateOrBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!lower) return true;
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::' ||
    lower === '::1' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower === 'metadata.google.internal'
  ) {
    return true;
  }

  // IPv4 literal checks
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    if (octets.some((n) => n < 0 || n > 255)) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }

  // IPv6 private / link-local / loopback / IPv4-mapped checks
  if (lower.includes(':')) {
    if (
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb') ||
      lower.startsWith('::ffff:')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validates and normalizes an upstream ERP or LMS base URL.
 * Enforces HTTPS and blocks loopback, private, and cloud metadata addresses.
 */
export function validateUpstreamBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Upstream URL is empty.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid upstream URL: "${trimmed}"`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Upstream URL must use https://.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Upstream URL must not embed credentials.');
  }
  if (isPrivateOrBlockedHostname(parsed.hostname)) {
    throw new Error(`Blocked private or loopback upstream host: "${parsed.hostname}"`);
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${normalizedPath}`;
}

/**
 * Validates a relative endpoint path configured via environment variable.
 */
export function validateRelativePath(rawPath: string, fallback: string): string {
  const value = rawPath.trim() || fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('..') || /\s/.test(value)) {
    throw new Error(`Invalid upstream endpoint path: "${value}"`);
  }
  return value;
}

/**
 * Strips HTML markup from Moodle/ERP text fields into safe plain text.
 */
export function stripHtmlToText(input: string): string {
  if (!input) return '';
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function assertMoodleResponseOk(raw: unknown): void {
  if (!isRecord(raw)) return;
  if (typeof raw.exception === 'string' || typeof raw.errorcode === 'string') {
    const code = typeof raw.errorcode === 'string' ? raw.errorcode : 'moodle_error';
    const message =
      typeof raw.message === 'string' && raw.message.trim().length > 0
        ? stripHtmlToText(raw.message)
        : 'Moodle LMS returned an error.';
    const isAuthError =
      code === 'invalidtoken' ||
      code === 'accessexception' ||
      code === 'servicenotavailable' ||
      code === 'invalidlogin' ||
      /invalid token/i.test(message);
    throw new LiveUpstreamError(
      isAuthError ? 401 : 502,
      isAuthError
        ? `Moodle rejected the web-service token (${code}): ${message}`
        : `Moodle LMS error (${code}): ${message}`,
      { code, field: isAuthError ? 'lmsToken' : undefined }
    );
  }
}

export function parseMoodleSiteInfo(raw: unknown): MoodleSiteInfo {
  assertMoodleResponseOk(raw);
  if (!isRecord(raw)) {
    throw new LiveUpstreamError(502, 'Unexpected response from Moodle site info endpoint.', {
      field: 'lmsToken',
    });
  }
  const userid = typeof raw.userid === 'number' ? raw.userid : Number(raw.userid);
  const username = typeof raw.username === 'string' ? raw.username.trim() : '';
  const fullname = typeof raw.fullname === 'string' ? raw.fullname.trim() : '';
  const sitename = typeof raw.sitename === 'string' ? raw.sitename.trim() : 'Moodle LMS';

  if (!Number.isFinite(userid) || userid <= 0 || (!username && !fullname)) {
    throw new LiveUpstreamError(502, 'Moodle site info response did not contain a valid user profile.', {
      field: 'lmsToken',
    });
  }

  return {
    userid,
    username: username || String(userid),
    fullname: fullname || username,
    sitename,
    siteurl: typeof raw.siteurl === 'string' ? raw.siteurl : undefined,
  };
}

export function buildProfileFromMoodle(
  siteInfo: MoodleSiteInfo,
  registerNumber: string,
  displayNameOverride?: string,
  erpConnected = false
): StudentProfile {
  const cleanReg = registerNumber.trim().toUpperCase();
  const displayName = (displayNameOverride?.trim() || siteInfo.fullname || cleanReg).slice(0, 100);
  const email = siteInfo.username.includes('@')
    ? siteInfo.username
    : `${cleanReg.toLowerCase()}@sathyabama.ac.in`;

  return validateProfile({
    registerNumber: cleanReg,
    name: displayName,
    program: siteInfo.sitename || 'Sathyabama Moodle LMS',
    department: 'Connected via Moodle LMS',
    semester: 1,
    batch: 'Live Session',
    section: 'LMS',
    email,
    advisor: 'ERP not connected',
    erpConnected,
    lmsConnected: true,
  });
}

export function parseMoodleCourses(raw: unknown): Map<number, MoodleCourseSummary> {
  assertMoodleResponseOk(raw);
  const map = new Map<number, MoodleCourseSummary>();
  if (!Array.isArray(raw)) return map;
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'number' ? item.id : Number(item.id);
    if (!Number.isFinite(id)) continue;
    const shortname = typeof item.shortname === 'string' ? item.shortname.trim() : '';
    const fullname = typeof item.fullname === 'string' ? stripHtmlToText(item.fullname) : '';
    if (shortname || fullname) {
      map.set(id, { id, shortname: shortname || fullname, fullname: fullname || shortname });
    }
  }
  return map;
}

function inferDeadlineKindFromMoodle(moduleName: string, title: string): DeadlineKind {
  const combined = `${moduleName} ${title}`.toLowerCase();
  if (/(quiz|exam|test|midterm|cat|cae|viva)/.test(combined)) return 'exam';
  if (/(fee|tuition|payment|invoice)/.test(combined)) return 'fee';
  return 'assignment';
}

export function parseMoodleDeadlines(
  raw: unknown,
  courseMap: Map<number, MoodleCourseSummary> = new Map()
): DeadlineItem[] {
  assertMoodleResponseOk(raw);
  const events = isRecord(raw) && Array.isArray(raw.events)
    ? raw.events
    : Array.isArray(raw)
      ? raw
      : [];

  const items: DeadlineItem[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (!isRecord(ev)) continue;

    const title = stripHtmlToText(String(ev.name ?? ev.title ?? ''));
    if (!title) continue;

    const epochSec =
      typeof ev.timesort === 'number'
        ? ev.timesort
        : typeof ev.timestart === 'number'
          ? ev.timestart
          : Number(ev.timesort ?? ev.timestart);
    if (!Number.isFinite(epochSec) || epochSec <= 0) continue;

    const courseObj = isRecord(ev.course) ? ev.course : null;
    const courseId =
      typeof ev.courseid === 'number'
        ? ev.courseid
        : courseObj && typeof courseObj.id === 'number'
          ? courseObj.id
          : undefined;
    const mappedCourse = courseId !== undefined ? courseMap.get(courseId) : undefined;

    const courseCode =
      (courseObj && typeof courseObj.shortname === 'string' && courseObj.shortname.trim()) ||
      mappedCourse?.shortname ||
      undefined;
    const courseName =
      (courseObj && typeof courseObj.fullname === 'string' && stripHtmlToText(courseObj.fullname)) ||
      mappedCourse?.fullname ||
      undefined;

    const moduleName = typeof ev.modulename === 'string' ? ev.modulename : '';
    const notes = typeof ev.description === 'string' ? stripHtmlToText(ev.description).slice(0, 280) : undefined;

    items.push({
      id: `moodle-ev-${ev.id ?? i}`,
      title,
      courseCode,
      courseName,
      dueAt: new Date(epochSec * 1000).toISOString(),
      kind: inferDeadlineKindFromMoodle(moduleName, title),
      origin: 'LMS',
      notes: notes || undefined,
    });
  }

  return validateDeadlines(items);
}

function inferNotificationCategory(text: string): NotificationItem['category'] {
  const lower = text.toLowerCase();
  if (/(exam|quiz|hall ticket|grade|result|cat|cae)/.test(lower)) return 'Exam';
  if (/(fee|payment|tuition|scholarship)/.test(lower)) return 'Fee';
  if (/(circular|holiday|notice|announcement)/.test(lower)) return 'Circular';
  if (/(assignment|submission|course|lecture|lab|forum)/.test(lower)) return 'Course';
  return 'Academic';
}

export function parseMoodleNotifications(raw: unknown): NotificationItem[] {
  assertMoodleResponseOk(raw);
  const rows = isRecord(raw) && Array.isArray(raw.notifications)
    ? raw.notifications
    : isRecord(raw) && Array.isArray(raw.messages)
      ? raw.messages
      : Array.isArray(raw)
        ? raw
        : [];

  const items: NotificationItem[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isRecord(row)) continue;

    const subject = stripHtmlToText(String(row.subject ?? row.title ?? row.shortenedsubject ?? ''));
    const fullText = stripHtmlToText(
      String(row.fullmessage ?? row.fullmessagehtml ?? row.text ?? row.smallmessage ?? subject)
    );
    const title = subject || fullText.slice(0, 90) || 'Moodle LMS notification';
    const summarySource = stripHtmlToText(String(row.smallmessage ?? fullText));
    const summary = (summarySource || title).slice(0, 180);
    const body = (fullText || summary || title).slice(0, 1500);

    const timeCreated =
      typeof row.timecreated === 'number' ? row.timecreated : Number(row.timecreated);
    const publishedAt =
      Number.isFinite(timeCreated) && timeCreated > 0
        ? new Date(timeCreated * 1000).toISOString()
        : new Date().toISOString();

    const unread =
      typeof row.read === 'boolean'
        ? !row.read
        : row.timeread === null || row.timeread === 0 || row.timeread === undefined;

    items.push({
      id: `moodle-notif-${row.id ?? i}`,
      title,
      summary,
      body,
      publishedAt,
      origin: 'LMS',
      category: inferNotificationCategory(`${title} ${summary}`),
      unread,
      courseCode: typeof row.coursecode === 'string' ? row.coursecode : undefined,
    });
  }

  return validateNotifications(items);
}

function unwrapArray(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    for (const key of keys) {
      if (Array.isArray(raw[key])) return raw[key] as unknown[];
    }
    if (isRecord(raw.data)) {
      for (const key of keys) {
        if (Array.isArray(raw.data[key])) return raw.data[key] as unknown[];
      }
    }
  }
  return [];
}

function unwrapRecord(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) {
    if (isRecord(raw.data)) return raw.data;
    if (isRecord(raw.profile)) return raw.profile;
    if (isRecord(raw.student)) return raw.student;
    return raw;
  }
  return {};
}

function pickString(obj: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return stripHtmlToText(val);
    }
  }
  return fallback;
}

function pickNumber(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string' && val.trim() !== '') {
      const parsed = Number(val);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

export function parseErpProfile(
  raw: unknown,
  fallbackRegisterNumber: string,
  fallbackName?: string,
  lmsConnected = false
): StudentProfile {
  const rec = unwrapRecord(raw);
  const regNo = pickString(rec, ['registerNumber', 'regNo', 'reg_no', 'rollNumber', 'id'], fallbackRegisterNumber)
    .toUpperCase();
  const name = pickString(rec, ['name', 'fullName', 'studentName'], fallbackName?.trim() || regNo);
  const semesterRaw = pickNumber(rec, ['semester', 'currentSemester', 'sem'], 1);
  const semester = Math.min(12, Math.max(1, Math.round(semesterRaw)));

  return validateProfile({
    registerNumber: regNo,
    name,
    program: pickString(rec, ['program', 'degree', 'course'], 'B.E. / B.Tech'),
    department: pickString(rec, ['department', 'branch', 'dept'], 'Sathyabama Institute of Science and Technology'),
    semester,
    batch: pickString(rec, ['batch', 'academicYear', 'year'], 'Live'),
    section: pickString(rec, ['section', 'sec'], 'A'),
    email: pickString(rec, ['email', 'mail'], `${regNo.toLowerCase()}@sathyabama.ac.in`),
    advisor: pickString(rec, ['advisor', 'facultyAdvisor', 'mentor'], 'Assigned Faculty'),
    erpConnected: true,
    lmsConnected,
  });
}

export function parseErpAttendance(raw: unknown): AttendanceSubject[] {
  const rows = unwrapArray(raw, ['attendance', 'subjects', 'courses', 'items', 'records', 'data']);
  const nowIso = new Date().toISOString();

  const mapped = rows
    .filter(isRecord)
    .map((item, idx) => {
      const attended = Math.max(0, Math.round(pickNumber(item, ['attended', 'present', 'classesAttended', 'hoursPresent'], 0)));
      const rawTotal = Math.max(0, Math.round(pickNumber(item, ['total', 'conducted', 'totalClasses', 'hoursConducted'], attended)));
      const total = Math.max(attended, rawTotal);
      const lastUpdatedRaw = pickString(item, ['lastUpdated', 'updatedAt', 'asOf'], nowIso);
      const lastUpdated = Number.isNaN(Date.parse(lastUpdatedRaw)) ? nowIso : lastUpdatedRaw;

      return {
        courseCode: pickString(item, ['courseCode', 'code', 'subjectCode'], `SUB${idx + 1}`),
        courseName: pickString(item, ['courseName', 'subjectName', 'subject', 'name'], `Course ${idx + 1}`),
        faculty: pickString(item, ['faculty', 'facultyName', 'instructor', 'staff'], 'Faculty'),
        credits: Math.min(12, Math.max(0, pickNumber(item, ['credits', 'credit'], 3))),
        attended,
        total,
        lastUpdated,
      };
    });

  return validateAttendance(mapped);
}

const DAY_ALIASES: Record<string, Weekday> = {
  mon: 'Mon',
  monday: 'Mon',
  tue: 'Tue',
  tues: 'Tue',
  tuesday: 'Tue',
  wed: 'Wed',
  wednesday: 'Wed',
  thu: 'Thu',
  thur: 'Thu',
  thurs: 'Thu',
  thursday: 'Thu',
  fri: 'Fri',
  friday: 'Fri',
};

function normalizeHHMM(input: string, fallback: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(input.trim());
  if (!match) return fallback;
  const hh = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function parseErpTimetable(raw: unknown): TimetableSlot[] {
  const rows = unwrapArray(raw, ['timetable', 'slots', 'schedule', 'items', 'data']);
  const mapped: TimetableSlot[] = [];

  rows.forEach((item, idx) => {
    if (!isRecord(item)) return;
    const rawDay = pickString(item, ['day', 'weekday', 'dayName'], '').toLowerCase();
    const day = DAY_ALIASES[rawDay];
    if (!day) return;

    const rawKind = pickString(item, ['kind', 'type', 'sessionType'], 'Lecture').toLowerCase();
    const kind: TimetableSlot['kind'] =
      rawKind.includes('lab') || rawKind.includes('practical')
        ? 'Lab'
        : rawKind.includes('tut')
          ? 'Tutorial'
          : 'Lecture';

    mapped.push({
      id: pickString(item, ['id', 'slotId'], `erp-slot-${day}-${idx}`),
      day,
      startTime: normalizeHHMM(pickString(item, ['startTime', 'start', 'from'], '09:00'), '09:00'),
      endTime: normalizeHHMM(pickString(item, ['endTime', 'end', 'to'], '10:00'), '10:00'),
      courseCode: pickString(item, ['courseCode', 'code', 'subjectCode'], `SUB${idx + 1}`),
      courseName: pickString(item, ['courseName', 'subjectName', 'subject', 'name'], `Course ${idx + 1}`),
      room: pickString(item, ['room', 'roomNo', 'venue', 'hall'], 'Campus'),
      faculty: pickString(item, ['faculty', 'facultyName', 'instructor'], 'Faculty'),
      kind,
    });
  });

  return validateTimetable(mapped);
}

const VALID_GRADES = new Set<GradeLetter>(['O', 'A+', 'A', 'B+', 'B', 'C', 'RA']);

function normalizeGrade(raw: string): GradeLetter {
  const upper = raw.trim().toUpperCase();
  if (VALID_GRADES.has(upper as GradeLetter)) return upper as GradeLetter;
  if (upper === 'S' || upper === 'A++') return 'O';
  if (upper === 'D' || upper === 'E' || upper === 'P') return 'C';
  if (upper === 'F' || upper === 'U' || upper === 'AB' || upper === 'W') return 'RA';
  return 'A';
}

export function parseErpResults(raw: unknown): ResultsPayload {
  const rec = unwrapRecord(raw);
  const rawSemesters = Array.isArray(rec.semesters)
    ? rec.semesters
    : Array.isArray(rec.results)
      ? rec.results
      : [];

  const semesters: SemesterResult[] = rawSemesters
    .filter(isRecord)
    .map((sem, sIdx) => {
      const rawCourses = Array.isArray(sem.courses)
        ? sem.courses
        : Array.isArray(sem.subjects)
          ? sem.subjects
          : [];
      const courses: CourseGrade[] = rawCourses.filter(isRecord).map((c, cIdx) => {
        const grade = normalizeGrade(pickString(c, ['grade', 'letterGrade'], 'A'));
        const gradePoints = pickNumber(c, ['gradePoints', 'points'], GRADE_POINTS[grade]);
        return {
          courseCode: pickString(c, ['courseCode', 'code', 'subjectCode'], `S${sIdx + 1}C${cIdx + 1}`),
          courseName: pickString(c, ['courseName', 'subjectName', 'name'], `Course ${cIdx + 1}`),
          credits: Math.min(12, Math.max(0, pickNumber(c, ['credits', 'credit'], 3))),
          grade,
          gradePoints: Math.min(10, Math.max(0, gradePoints)),
        };
      });

      const computedCredits = courses.reduce((sum, c) => sum + c.credits, 0);
      const computedSgpa =
        computedCredits > 0
          ? Math.round(
              (courses.reduce((sum, c) => sum + c.credits * c.gradePoints, 0) / computedCredits) * 100
            ) / 100
          : 0;
      const semNum = Math.min(12, Math.max(1, Math.round(pickNumber(sem, ['semester', 'sem'], sIdx + 1))));

      return {
        semester: semNum,
        termLabel: pickString(sem, ['termLabel', 'term', 'session'], `Semester ${semNum}`),
        sgpa: Math.min(10, Math.max(0, pickNumber(sem, ['sgpa', 'gpa'], computedSgpa))),
        credits: Math.min(40, Math.max(0, pickNumber(sem, ['credits', 'totalCredits'], computedCredits))),
        courses,
      };
    });

  const rawCurrent = Array.isArray(rec.currentCourses)
    ? rec.currentCourses
    : Array.isArray(rec.enrolledCourses)
      ? rec.enrolledCourses
      : [];

  const currentCourses: PlannedCourse[] = rawCurrent.filter(isRecord).map((c, idx) => ({
    courseCode: pickString(c, ['courseCode', 'code', 'subjectCode'], `CURR${idx + 1}`),
    courseName: pickString(c, ['courseName', 'subjectName', 'name'], `Course ${idx + 1}`),
    credits: Math.min(12, Math.max(0, pickNumber(c, ['credits', 'credit'], 3))),
    expectedGrade: normalizeGrade(pickString(c, ['expectedGrade', 'grade'], 'A')),
  }));

  const inferredSem = semesters.length > 0 ? Math.min(12, semesters[semesters.length - 1].semester + 1) : 1;
  const currentSemester = Math.min(
    12,
    Math.max(1, Math.round(pickNumber(rec, ['currentSemester', 'semester'], inferredSem)))
  );

  return validateResults({ semesters, currentSemester, currentCourses });
}

export function parseErpDeadlines(raw: unknown): DeadlineItem[] {
  const rows = unwrapArray(raw, ['deadlines', 'items', 'events', 'exams', 'fees', 'data']);
  const items: DeadlineItem[] = [];

  rows.forEach((item, idx) => {
    if (!isRecord(item)) return;
    const title = pickString(item, ['title', 'name', 'description']);
    const dueRaw = pickString(item, ['dueAt', 'dueDate', 'date', 'deadline']);
    if (!title || !dueRaw || Number.isNaN(Date.parse(dueRaw))) return;

    const rawKind = pickString(item, ['kind', 'type', 'category'], 'assignment').toLowerCase();
    const kind: DeadlineKind = rawKind.includes('exam')
      ? 'exam'
      : rawKind.includes('fee')
        ? 'fee'
        : 'assignment';
    const amount = pickNumber(item, ['amountInr', 'amount'], -1);

    items.push({
      id: pickString(item, ['id'], `erp-dl-${idx}`),
      title,
      courseCode: pickString(item, ['courseCode', 'code']) || undefined,
      courseName: pickString(item, ['courseName', 'subject']) || undefined,
      dueAt: new Date(dueRaw).toISOString(),
      kind,
      origin: 'ERP',
      amountInr: amount > 0 ? amount : undefined,
      notes: pickString(item, ['notes', 'remarks']) || undefined,
    });
  });

  return validateDeadlines(items);
}

export function parseErpNotifications(raw: unknown): NotificationItem[] {
  const rows = unwrapArray(raw, ['notifications', 'circulars', 'notices', 'items', 'data']);
  const nowIso = new Date().toISOString();
  const items: NotificationItem[] = [];

  rows.forEach((item, idx) => {
    if (!isRecord(item)) return;
    const title = pickString(item, ['title', 'subject', 'heading']);
    if (!title) return;
    const body = pickString(item, ['body', 'message', 'content', 'description'], title);
    const summary = pickString(item, ['summary', 'excerpt'], body.slice(0, 180));
    const publishedRaw = pickString(item, ['publishedAt', 'createdAt', 'date'], nowIso);
    const publishedAt = Number.isNaN(Date.parse(publishedRaw))
      ? nowIso
      : new Date(publishedRaw).toISOString();

    items.push({
      id: pickString(item, ['id'], `erp-notif-${idx}`),
      title,
      summary,
      body,
      publishedAt,
      origin: 'ERP',
      category: inferNotificationCategory(`${title} ${pickString(item, ['category'])}`),
      unread: typeof item.unread === 'boolean' ? item.unread : true,
      courseCode: pickString(item, ['courseCode', 'code']) || undefined,
    });
  });

  return validateNotifications(items);
}
