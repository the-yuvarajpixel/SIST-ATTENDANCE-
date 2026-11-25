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
  CaeStanding,
  CourseGrade,
  DeadlineItem,
  DeadlineKind,
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

export type LiveAuthField =
  | 'erpToken'
  | 'erpUsername'
  | 'erpPassword'
  | 'lmsToken'
  | 'lmsUsername'
  | 'lmsPassword';

export class LiveUpstreamError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly field?: LiveAuthField;

  constructor(
    status: number,
    message: string,
    options?: { code?: string; field?: LiveAuthField }
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

  const normalizedPath = parsed.pathname
    .replace(/\/+$/, '')
    .replace(
      /\/(account\/login|login\/index\.php|login\/token\.php|login|my\/courses\.php|my|student\/dashboard|dashboard|index\.php|index\.html|erp\/api\/v[0-9.]+)$/i,
      ''
    );
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
    // Only token/login/service failures are 401 session errors; accessexception is per-function permission (403)
    // so callers can fall back to alternative Moodle web-service functions without discarding a valid token.
    const isTokenInvalid =
      code === 'invalidtoken' ||
      code === 'tokenexpired' ||
      code === 'servicenotavailable' ||
      code === 'invalidlogin' ||
      /invalid token/i.test(message);
    const isAccessDenied = code === 'accessexception' || code === 'nopermissions';
    const status = isTokenInvalid ? 401 : isAccessDenied ? 403 : 502;
    throw new LiveUpstreamError(
      status,
      isTokenInvalid
        ? `Moodle rejected the web-service token (${code}): ${message}`
        : `Moodle LMS error (${code}): ${message}`,
      { code, field: isTokenInvalid ? 'lmsToken' : undefined }
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

export function parseMoodleAssignments(
  raw: unknown,
  courseMap: Map<number, MoodleCourseSummary> = new Map(),
  minEpochSec = Math.floor(Date.now() / 1000) - 14 * 86400
): DeadlineItem[] {
  assertMoodleResponseOk(raw);
  const courses = isRecord(raw) && Array.isArray(raw.courses) ? raw.courses : [];
  const items: DeadlineItem[] = [];

  for (const course of courses) {
    if (!isRecord(course) || !Array.isArray(course.assignments)) continue;
    const courseId = typeof course.id === 'number' ? course.id : Number(course.id);
    const mapped = Number.isFinite(courseId) ? courseMap.get(courseId) : undefined;
    const courseCode =
      (typeof course.shortname === 'string' && course.shortname.trim()) || mapped?.shortname || undefined;
    const courseName =
      (typeof course.fullname === 'string' && stripHtmlToText(course.fullname)) || mapped?.fullname || undefined;

    for (let i = 0; i < course.assignments.length; i += 1) {
      const assign = course.assignments[i];
      if (!isRecord(assign)) continue;
      const dueSec = typeof assign.duedate === 'number' ? assign.duedate : Number(assign.duedate);
      if (!Number.isFinite(dueSec) || dueSec <= 0 || dueSec < minEpochSec) continue;
      const title = stripHtmlToText(String(assign.name ?? ''));
      if (!title) continue;
      const notes =
        typeof assign.intro === 'string' ? stripHtmlToText(assign.intro).slice(0, 280) : undefined;

      items.push({
        id: `moodle-assign-${assign.id ?? `${courseId}-${i}`}`,
        title,
        courseCode,
        courseName,
        dueAt: new Date(dueSec * 1000).toISOString(),
        kind: inferDeadlineKindFromMoodle('assign', title),
        origin: 'LMS',
        notes: notes || undefined,
      });
    }
  }

  return validateDeadlines(items);
}

export function parseMoodleQuizzes(
  raw: unknown,
  courseMap: Map<number, MoodleCourseSummary> = new Map(),
  minEpochSec = Math.floor(Date.now() / 1000) - 14 * 86400
): DeadlineItem[] {
  assertMoodleResponseOk(raw);
  const quizzes = isRecord(raw) && Array.isArray(raw.quizzes) ? raw.quizzes : [];
  const items: DeadlineItem[] = [];

  for (let i = 0; i < quizzes.length; i += 1) {
    const quiz = quizzes[i];
    if (!isRecord(quiz)) continue;
    const dueSec =
      typeof quiz.timeclose === 'number' && quiz.timeclose > 0
        ? quiz.timeclose
        : typeof quiz.timeopen === 'number' && quiz.timeopen > 0
          ? quiz.timeopen
          : Number(quiz.timeclose ?? quiz.timeopen);
    if (!Number.isFinite(dueSec) || dueSec <= 0 || dueSec < minEpochSec) continue;
    const title = stripHtmlToText(String(quiz.name ?? ''));
    if (!title) continue;
    const courseId = typeof quiz.course === 'number' ? quiz.course : Number(quiz.course);
    const mapped = Number.isFinite(courseId) ? courseMap.get(courseId) : undefined;
    const notes = typeof quiz.intro === 'string' ? stripHtmlToText(quiz.intro).slice(0, 280) : undefined;

    items.push({
      id: `moodle-quiz-${quiz.id ?? i}`,
      title,
      courseCode: mapped?.shortname,
      courseName: mapped?.fullname,
      dueAt: new Date(dueSec * 1000).toISOString(),
      kind: 'exam',
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

export function parseMoodleForumDiscussions(
  raw: unknown,
  courseCode?: string
): NotificationItem[] {
  assertMoodleResponseOk(raw);
  const rows = isRecord(raw) && Array.isArray(raw.discussions) ? raw.discussions : [];
  const items: NotificationItem[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isRecord(row)) continue;
    const title = stripHtmlToText(String(row.name ?? row.subject ?? ''));
    if (!title) continue;
    const body = stripHtmlToText(String(row.message ?? title)).slice(0, 1500);
    const summary = (body || title).slice(0, 180);
    const epochSec =
      typeof row.timemodified === 'number'
        ? row.timemodified
        : typeof row.created === 'number'
          ? row.created
          : Number(row.timemodified ?? row.created);
    const publishedAt =
      Number.isFinite(epochSec) && epochSec > 0
        ? new Date(epochSec * 1000).toISOString()
        : new Date().toISOString();

    items.push({
      id: `moodle-forum-${row.discussion ?? row.id ?? i}`,
      title,
      summary,
      body: body || title,
      publishedAt,
      origin: 'LMS',
      category: inferNotificationCategory(`${title} ${summary}`),
      unread: true,
      courseCode,
    });
  }

  return validateNotifications(items);
}

function unwrapArray(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    if (Array.isArray(raw.responseData)) return raw.responseData as unknown[];
    if (isRecord(raw.responseData)) {
      for (const key of keys) {
        if (Array.isArray(raw.responseData[key])) return raw.responseData[key] as unknown[];
      }
      if (Array.isArray(raw.responseData.data)) return raw.responseData.data as unknown[];
    }
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
    if (isRecord(raw.responseData)) {
      if (Array.isArray(raw.responseData.StudentInfo) && isRecord(raw.responseData.StudentInfo[0])) {
        return raw.responseData.StudentInfo[0] as Record<string, unknown>;
      }
      if (Array.isArray(raw.responseData.studentInfo) && isRecord(raw.responseData.studentInfo[0])) {
        return raw.responseData.studentInfo[0] as Record<string, unknown>;
      }
      return raw.responseData;
    }
    if (Array.isArray(raw.responseData) && isRecord(raw.responseData[0])) {
      return raw.responseData[0] as Record<string, unknown>;
    }
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
    if (typeof val === 'number' && Number.isFinite(val)) {
      return String(val);
    }
  }
  return fallback;
}

function pickNumber(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string' && val.trim() !== '') {
      const cleaned = val.trim().replace(/%$/, '');
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function parseFlexibleDateToIso(rawDate: string, fallbackIso?: string): string | null {
  const trimmed = rawDate.trim();
  if (!trimmed) return fallbackIso ?? null;

  // Handle DD/MM/YYYY or DD-MM-YYYY (common in Sathyabama ERP responses)
  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(
    trimmed
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    let hour = dmyMatch[4] ? Number(dmyMatch[4]) : 9;
    const min = dmyMatch[5] ? Number(dmyMatch[5]) : 0;
    const sec = dmyMatch[6] ? Number(dmyMatch[6]) : 0;
    const ampm = dmyMatch[7]?.toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    const dt = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return fallbackIso ?? null;
}

export function parseErpProfile(
  raw: unknown,
  fallbackRegisterNumber: string,
  fallbackName?: string,
  lmsConnected = false
): StudentProfile {
  const rec = unwrapRecord(raw);
  const regNo = pickString(
    rec,
    ['registerNumber', 'RegisterNumber', 'regNo', 'RegNo', 'reg_no', 'rollNumber', 'id'],
    fallbackRegisterNumber
  ).toUpperCase();
  const name = pickString(
    rec,
    ['name', 'fullName', 'studentName', 'StudentName', 'FullName'],
    fallbackName?.trim() || regNo
  );
  const semesterRaw = pickNumber(rec, ['semester', 'Semester', 'currentSemester', 'CurrentSemester', 'sem'], 1);
  const semester = Math.min(12, Math.max(1, Math.round(semesterRaw)));

  return validateProfile({
    registerNumber: regNo,
    name,
    program: pickString(
      rec,
      ['program', 'degree', 'course', 'CourseName', 'DegreeName', 'ProgrammeName'],
      'B.E. / B.Tech'
    ),
    department: pickString(
      rec,
      ['department', 'branch', 'dept', 'ProgrammeName', 'DepartmentName', 'BranchName'],
      'Sathyabama Institute of Science and Technology'
    ),
    semester,
    batch: pickString(rec, ['batch', 'Batch', 'academicYear', 'AcademicYear', 'year', 'YearofStudy'], 'Live'),
    section: pickString(rec, ['section', 'SectionName', 'Section', 'sec'], 'A'),
    email: pickString(
      rec,
      ['email', 'OfficialEmail', 'Email', 'StudentEmail', 'mail'],
      `${regNo.toLowerCase()}@sathyabama.ac.in`
    ),
    advisor: pickString(
      rec,
      ['advisor', 'facultyAdvisor', 'mentor', 'MentorName', 'FacultyAdvisor', 'ClassAdvisor'],
      'Assigned Faculty'
    ),
    erpConnected: true,
    lmsConnected,
  });
}

export function parseErpAttendance(raw: unknown, now = new Date()): AttendanceSubject[] {
  const rows = unwrapArray(raw, [
    'attendance',
    'subjects',
    'courses',
    'items',
    'records',
    'AttendanceDetails',
    'data',
  ]);
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const mapped = rows
    .filter(isRecord)
    .map((item, idx) => {
      const attended = Math.max(
        0,
        Math.round(
          pickNumber(
            item,
            ['attended', 'present', 'classesAttended', 'hoursPresent', 'TotalPresent', 'PresentHours', 'Present'],
            0
          )
        )
      );
      const absent = Math.max(
        0,
        Math.round(pickNumber(item, ['absent', 'TotalAbsent', 'AbsentHours', 'Absent'], 0))
      );
      const rawTotal = Math.max(
        0,
        Math.round(
          pickNumber(
            item,
            ['total', 'conducted', 'totalClasses', 'hoursConducted', 'TotalHours', 'ConductedHours', 'Total'],
            attended + absent
          )
        )
      );
      const total = Math.max(attended, rawTotal);
      const lastUpdatedRaw = pickString(item, ['lastUpdated', 'updatedAt', 'asOf', 'UpdatedDate', 'AttendanceDate'], nowIso);
      const parsedIso = parseFlexibleDateToIso(lastUpdatedRaw, nowIso) ?? nowIso;
      const parsedMs = Date.parse(parsedIso);
      // Strictly cap attendance timestamp to <= now so future-dated entries are never shown as recorded.
      const lastUpdated = !Number.isNaN(parsedMs) && parsedMs > nowMs ? nowIso : parsedIso;

      return {
        courseCode: pickString(
          item,
          ['courseCode', 'code', 'subjectCode', 'SubjectCode', 'CourseCode'],
          `SUB${idx + 1}`
        ),
        courseName: pickString(
          item,
          ['courseName', 'subjectName', 'subject', 'name', 'SubjectName', 'CourseName'],
          `Course ${idx + 1}`
        ),
        faculty: pickString(
          item,
          ['faculty', 'facultyName', 'instructor', 'staff', 'StaffName', 'FacultyName'],
          'Faculty'
        ),
        credits: Math.min(12, Math.max(0, pickNumber(item, ['credits', 'credit', 'Credits', 'Credit'], 3))),
        attended,
        total,
        lastUpdated,
      };
    });

  return validateAttendance(mapped);
}

const DAY_ALIASES: Record<string, Weekday> = {
  '1': 'Mon',
  mon: 'Mon',
  monday: 'Mon',
  '2': 'Tue',
  tue: 'Tue',
  tues: 'Tue',
  tuesday: 'Tue',
  '3': 'Wed',
  wed: 'Wed',
  wednesday: 'Wed',
  '4': 'Thu',
  thu: 'Thu',
  thur: 'Thu',
  thurs: 'Thu',
  thursday: 'Thu',
  '5': 'Fri',
  fri: 'Fri',
  friday: 'Fri',
};

function normalizeHHMM(input: string, fallback: string): string {
  const trimmed = input.trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i.exec(trimmed);
  if (!match) return fallback;
  let hhNum = Number(match[1]);
  const mmNum = Math.min(59, Math.max(0, Number(match[2])));
  const ampm = match[3]?.toLowerCase();
  if (ampm === 'pm' && hhNum < 12) hhNum += 12;
  if (ampm === 'am' && hhNum === 12) hhNum = 0;
  const hh = String(Math.min(23, Math.max(0, hhNum))).padStart(2, '0');
  const mm = String(mmNum).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function parseErpTimetable(raw: unknown): TimetableSlot[] {
  const rows = unwrapArray(raw, ['timetable', 'slots', 'schedule', 'items', 'TimeTableArray', 'data']);
  const mapped: TimetableSlot[] = [];

  rows.forEach((item, idx) => {
    if (!isRecord(item)) return;
    const rawDay = pickString(item, ['day', 'weekday', 'dayName', 'DayName', 'DayId', 'dayId'], '').toLowerCase();
    const day = DAY_ALIASES[rawDay];
    if (!day) return;

    const courseCode = pickString(
      item,
      ['courseCode', 'code', 'subjectCode', 'SubjectCode', 'CourseCode'],
      ''
    );
    const courseName = pickString(
      item,
      ['courseName', 'subjectName', 'subject', 'name', 'SubjectName', 'CourseName'],
      ''
    );
    if (!courseCode && !courseName) return;

    const rawKind = pickString(item, ['kind', 'type', 'sessionType', 'HourType', 'SessionType'], 'Lecture').toLowerCase();
    const kind: TimetableSlot['kind'] =
      rawKind.includes('lab') || rawKind.includes('practical')
        ? 'Lab'
        : rawKind.includes('tut')
          ? 'Tutorial'
          : 'Lecture';

    mapped.push({
      id: pickString(item, ['id', 'slotId', 'TimeTableDetailId', 'TimeTableId'], `erp-slot-${day}-${idx}`),
      day,
      startTime: normalizeHHMM(pickString(item, ['startTime', 'start', 'from', 'TimeFrom'], '09:00'), '09:00'),
      endTime: normalizeHHMM(pickString(item, ['endTime', 'end', 'to', 'TimeTo'], '10:00'), '10:00'),
      courseCode: courseCode || `SUB${idx + 1}`,
      courseName: courseName || courseCode || `Course ${idx + 1}`,
      room: pickString(item, ['room', 'roomNo', 'RoomNo', 'ClassRoomName', 'venue', 'hall'], 'Campus'),
      faculty: pickString(item, ['faculty', 'facultyName', 'StaffName', 'FacultyName', 'instructor'], 'Faculty'),
      kind,
    });
  });

  return validateTimetable(mapped);
}

const VALID_GRADES = new Set<GradeLetter>(['O', 'A+', 'A', 'B+', 'B', 'C', 'RA']);

function normalizeGrade(raw: string, totalMark?: number, resultStatus?: string): GradeLetter {
  const upper = raw.trim().toUpperCase();
  if (VALID_GRADES.has(upper as GradeLetter)) return upper as GradeLetter;
  if (upper === 'S' || upper === 'A++') return 'O';
  if (upper === 'D' || upper === 'E' || upper === 'P') return 'C';
  if (upper === 'F' || upper === 'U' || upper === 'AB' || upper === 'W' || upper === 'FAIL' || upper === 'ARREAR') {
    return 'RA';
  }
  if (resultStatus && /^(ra|fail|ab|absent|arrear)$/i.test(resultStatus.trim())) {
    return 'RA';
  }
  if (typeof totalMark === 'number' && Number.isFinite(totalMark) && totalMark > 0) {
    if (totalMark >= 90) return 'O';
    if (totalMark >= 80) return 'A+';
    if (totalMark >= 70) return 'A';
    if (totalMark >= 60) return 'B+';
    if (totalMark >= 50) return 'B';
    if (totalMark >= 40) return 'C';
    return 'RA';
  }
  return 'A';
}

export function parseErpResults(raw: unknown): ResultsPayload {
  const rec = unwrapRecord(raw);
  const rawSemesters = Array.isArray(rec.semesters)
    ? rec.semesters
    : Array.isArray(rec.results)
      ? rec.results
      : [];

  let semesters: SemesterResult[] = [];

  if (rawSemesters.length > 0) {
    semesters = rawSemesters
      .filter(isRecord)
      .map((sem, sIdx) => {
        const rawCourses = Array.isArray(sem.courses)
          ? sem.courses
          : Array.isArray(sem.subjects)
            ? sem.subjects
            : [];
        const courses: CourseGrade[] = rawCourses.filter(isRecord).map((c, cIdx) => {
          const totalMark = pickNumber(c, ['TotalMark', 'totalMark', 'marks'], -1);
          const resultStatus = pickString(c, ['Result', 'result', 'status'], '');
          const grade = normalizeGrade(
            pickString(c, ['grade', 'Grade', 'letterGrade'], ''),
            totalMark >= 0 ? totalMark : undefined,
            resultStatus
          );
          const gradePoints = pickNumber(c, ['gradePoints', 'GradePoint', 'points'], GRADE_POINTS[grade]);
          return {
            courseCode: pickString(c, ['courseCode', 'code', 'subjectCode', 'SubjectCode'], `S${sIdx + 1}C${cIdx + 1}`),
            courseName: pickString(c, ['courseName', 'subjectName', 'SubjectName', 'name'], `Course ${cIdx + 1}`),
            credits: Math.min(12, Math.max(0, pickNumber(c, ['credits', 'credit', 'Credits', 'Credit'], 3))),
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
        const semNum = Math.min(12, Math.max(1, Math.round(pickNumber(sem, ['semester', 'Semester', 'sem'], sIdx + 1))));

        return {
          semester: semNum,
          termLabel: pickString(sem, ['termLabel', 'term', 'session', 'AcademicYear'], `Semester ${semNum}`),
          sgpa: Math.min(10, Math.max(0, pickNumber(sem, ['sgpa', 'SGPA', 'gpa'], computedSgpa))),
          credits: Math.min(40, Math.max(0, pickNumber(sem, ['credits', 'totalCredits', 'TotalCredits'], computedCredits))),
          courses,
        };
      });
  } else {
    // Support Sathyabama ERP flat SemResult / consolidateMarks arrays and group them by Semester
    const flatRows = unwrapArray(raw, ['SemResult', 'consolidateMarks', 'marks', 'data']);
    const bySemester = new Map<number, { termLabel: string; courses: CourseGrade[] }>();

    flatRows.filter(isRecord).forEach((row, idx) => {
      const semNum = Math.min(12, Math.max(1, Math.round(pickNumber(row, ['Semester', 'semester', 'Sem', 'sem'], 1))));
      const totalMark = pickNumber(row, ['TotalMark', 'totalMark', 'Total', 'MarkObtained'], -1);
      const resultStatus = pickString(row, ['Result', 'result', 'Status'], '');
      const grade = normalizeGrade(
        pickString(row, ['Grade', 'grade', 'MarkGrade', 'letterGrade'], ''),
        totalMark >= 0 ? totalMark : undefined,
        resultStatus
      );
      const gradePoints = pickNumber(row, ['GradePoint', 'gradePoints', 'points'], GRADE_POINTS[grade]);
      const course: CourseGrade = {
        courseCode: pickString(row, ['SubjectCode', 'courseCode', 'code'], `S${semNum}C${idx + 1}`),
        courseName: pickString(row, ['SubjectName', 'SubjectTitle', 'courseName', 'name'], `Course ${idx + 1}`),
        credits: Math.min(12, Math.max(0, pickNumber(row, ['Credit', 'Credits', 'MarkCredit', 'credits'], 3))),
        grade,
        gradePoints: Math.min(10, Math.max(0, gradePoints)),
      };

      const existing = bySemester.get(semNum);
      if (existing) {
        existing.courses.push(course);
      } else {
        const term = pickString(row, ['AcademicMonthYear', 'ExamSession', 'AcademicYear'], `Semester ${semNum}`);
        bySemester.set(semNum, { termLabel: term, courses: [course] });
      }
    });

    semesters = Array.from(bySemester.entries())
      .sort(([a], [b]) => a - b)
      .map(([semNum, entry]) => {
        const credits = entry.courses.reduce((sum, c) => sum + c.credits, 0);
        const sgpa =
          credits > 0
            ? Math.round(
                (entry.courses.reduce((sum, c) => sum + c.credits * c.gradePoints, 0) / credits) * 100
              ) / 100
            : 0;
        return {
          semester: semNum,
          termLabel: entry.termLabel,
          sgpa,
          credits,
          courses: entry.courses,
        };
      });
  }

  const rawCurrent = Array.isArray(rec.currentCourses)
    ? rec.currentCourses
    : Array.isArray(rec.enrolledCourses)
      ? rec.enrolledCourses
      : [];

  const currentCourses: PlannedCourse[] = rawCurrent.filter(isRecord).map((c, idx) => ({
    courseCode: pickString(c, ['courseCode', 'code', 'subjectCode', 'SubjectCode'], `CURR${idx + 1}`),
    courseName: pickString(c, ['courseName', 'subjectName', 'SubjectName', 'name'], `Course ${idx + 1}`),
    credits: Math.min(12, Math.max(0, pickNumber(c, ['credits', 'credit', 'Credits', 'Credit'], 3))),
    expectedGrade: normalizeGrade(pickString(c, ['expectedGrade', 'grade', 'Grade'], 'A')),
  }));

  const inferredSem = semesters.length > 0 ? Math.min(12, semesters[semesters.length - 1].semester + 1) : 1;
  const currentSemester = Math.min(
    12,
    Math.max(1, Math.round(pickNumber(rec, ['currentSemester', 'semester', 'Semester'], inferredSem)))
  );

  const caeMarks = Array.isArray(rec.caeMarks) ? parseErpCaeMarks(rec.caeMarks) : [];

  return validateResults({ semesters, currentSemester, currentCourses, caeMarks });
}

function pickOptionalNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string') {
      const cleaned = val.trim().replace(/%$/, '');
      if (cleaned !== '' && !/^(ab|absent|na|n\/a|-|null|pending)$/i.test(cleaned)) {
        const parsed = Number(cleaned);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

function deriveCaeStanding(
  internalTotal: number,
  internalMax: number,
  hasAnyScore: boolean
): CaeStanding {
  if (!hasAnyScore || internalMax <= 0) return 'pending';
  const pct = (internalTotal / internalMax) * 100;
  if (pct >= 80) return 'strong';
  if (pct >= 65) return 'on-track';
  return 'needs-improvement';
}

export function parseErpCaeMarks(raw: unknown): SubjectCaeMark[] {
  const rows = unwrapArray(raw, [
    'CAEResult',
    'caeResult',
    'caeMarks',
    'CAEMarks',
    'InternalMarks',
    'internalMarks',
    'marks',
    'items',
    'data',
  ]);

  const mapped: SubjectCaeMark[] = [];

  rows.filter(isRecord).forEach((item, idx) => {
    const courseCode = pickString(
      item,
      ['courseCode', 'SubjectCode', 'subjectCode', 'CourseCode', 'code'],
      `SUB${idx + 1}`
    );
    const courseName = pickString(
      item,
      ['courseName', 'SubjectName', 'SubjectTitle', 'subjectName', 'CourseName', 'name'],
      ''
    );
    if (!courseName && !courseCode) return;

    const cae1Max = Math.min(200, Math.max(1, pickNumber(item, ['cae1Max', 'CAE1Max', 'MaxCAE1', 'MaxMark'], 50)));
    const cae2Max = Math.min(200, Math.max(1, pickNumber(item, ['cae2Max', 'CAE2Max', 'MaxCAE2', 'MaxMark'], 50)));
    const internalBonusMax = Math.min(
      100,
      Math.max(0, pickNumber(item, ['internalBonusMax', 'AssignmentMax', 'BonusMax'], 10))
    );
    const internalMax = Math.min(
      200,
      Math.max(1, pickNumber(item, ['internalMax', 'InternalMax', 'MaxInternal', 'TotalInternalMax'], 50))
    );

    const rawCae1 = pickOptionalNumber(item, ['cae1', 'CAE1', 'CAE1Mark', 'Cae1', 'CAT1', 'Test1', 'Mid1']);
    const rawCae2 = pickOptionalNumber(item, ['cae2', 'CAE2', 'CAE2Mark', 'Cae2', 'CAT2', 'Test2', 'Mid2']);
    const rawBonus = pickOptionalNumber(item, [
      'internalBonus',
      'AssignmentMark',
      'assignmentMark',
      'QuizMark',
      'LabInternal',
      'ActivityMark',
    ]);
    const explicitTotal = pickOptionalNumber(item, [
      'internalTotal',
      'InternalTotal',
      'InternalMark',
      'TotalInternal',
      'TotalMark',
      'ObtainedInternal',
    ]);

    const cae1 = rawCae1 === null ? null : Math.min(cae1Max, Math.max(0, roundTo1(rawCae1)));
    const cae2 = rawCae2 === null ? null : Math.min(cae2Max, Math.max(0, roundTo1(rawCae2)));
    const internalBonus =
      rawBonus === null ? null : Math.min(Math.max(internalBonusMax, 100), Math.max(0, roundTo1(rawBonus)));

    const hasAnyScore = cae1 !== null || cae2 !== null || internalBonus !== null || explicitTotal !== null;

    let internalTotal = 0;
    if (explicitTotal !== null) {
      internalTotal = Math.min(internalMax, Math.max(0, roundTo1(explicitTotal)));
    } else if (hasAnyScore) {
      // Standard Sathyabama 50-mark internal weighting: CAE 1 (20) + CAE 2 (20) + Assignment/Lab (10)
      const caeWeightEach = internalBonus !== null ? (internalMax - internalBonusMax) / 2 : internalMax / 2;
      const part1 = cae1 !== null ? (cae1 / cae1Max) * caeWeightEach : 0;
      const part2 = cae2 !== null ? (cae2 / cae2Max) * caeWeightEach : 0;
      const bonusPart = internalBonus ?? 0;
      internalTotal = Math.min(internalMax, Math.max(0, roundTo1(part1 + part2 + bonusPart)));
    }

    const remarks = pickString(item, ['remarks', 'Remarks', 'Status', 'Result'], '') || undefined;

    mapped.push({
      courseCode,
      courseName: courseName || courseCode,
      credits: Math.min(12, Math.max(0, pickNumber(item, ['credits', 'credit', 'Credits', 'Credit'], 3))),
      cae1,
      cae1Max,
      cae2,
      cae2Max,
      internalBonus,
      internalBonusMax,
      internalTotal,
      internalMax,
      standing: deriveCaeStanding(internalTotal, internalMax, hasAnyScore),
      remarks,
    });
  });

  return mapped;
}

export function parseErpDeadlines(raw: unknown): DeadlineItem[] {
  const rows = unwrapArray(raw, ['deadlines', 'items', 'events', 'exams', 'fees', 'EventCalendar', 'data']);
  const items: DeadlineItem[] = [];

  rows.forEach((item, idx) => {
    if (!isRecord(item)) return;
    const title = pickString(item, ['title', 'name', 'EventTitle', 'EventDescription', 'description']);
    const dueRaw = pickString(item, ['dueAt', 'dueDate', 'EventDate', 'StartDate', 'date', 'deadline']);
    const dueIso = parseFlexibleDateToIso(dueRaw);
    if (!title || !dueIso) return;

    const rawKind = pickString(item, ['kind', 'type', 'category', 'EventType'], title).toLowerCase();
    const kind: DeadlineKind = /(exam|cat|cae|ese|test|viva)/.test(rawKind)
      ? 'exam'
      : /(fee|tuition|payment|invoice)/.test(rawKind)
        ? 'fee'
        : 'assignment';
    const amount = pickNumber(item, ['amountInr', 'amount', 'Amount'], -1);

    items.push({
      id: pickString(item, ['id', 'EventCalendarId'], `erp-dl-${idx}`),
      title,
      courseCode: pickString(item, ['courseCode', 'SubjectCode', 'code']) || undefined,
      courseName: pickString(item, ['courseName', 'SubjectName', 'subject']) || undefined,
      dueAt: dueIso,
      kind,
      origin: 'ERP',
      amountInr: amount > 0 ? amount : undefined,
      notes: pickString(item, ['notes', 'remarks', 'Remarks']) || undefined,
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
    const rawNotice = pickString(item, ['title', 'subject', 'heading', 'Title', 'NotificationTitle', 'Notification']);
    if (!rawNotice) return;
    const body = pickString(item, ['body', 'message', 'content', 'description', 'Notification', 'Message'], rawNotice);
    const title = rawNotice.length > 110 ? `${rawNotice.slice(0, 107)}...` : rawNotice;
    const summary = pickString(item, ['summary', 'excerpt'], body.slice(0, 180));
    const datePart = pickString(item, ['publishedAt', 'createdAt', 'CreatedDate', 'Date', 'date'], '');
    const timePart = pickString(item, ['Time', 'time'], '');
    const combinedDate = datePart && timePart ? `${datePart} ${timePart}` : datePart;
    const publishedAt = parseFlexibleDateToIso(combinedDate, nowIso) ?? nowIso;

    items.push({
      id: pickString(item, ['id', 'NotificationId'], `erp-notif-${idx}`),
      title,
      summary,
      body,
      publishedAt,
      origin: 'ERP',
      category: inferNotificationCategory(`${title} ${pickString(item, ['category', 'Category'])}`),
      unread: typeof item.unread === 'boolean' ? item.unread : item.IsViewed === 1 ? false : true,
      courseCode: pickString(item, ['courseCode', 'SubjectCode', 'code']) || undefined,
    });
  });

  return validateNotifications(items);
}
