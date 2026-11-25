import { randomBytes } from 'node:crypto';
import {
  LiveUpstreamError,
  buildProfileFromMoodle,
  parseErpAttendance,
  parseErpCaeMarks,
  parseErpDeadlines,
  parseErpNotifications,
  parseErpProfile,
  parseErpResults,
  parseErpTimetable,
  parseMoodleAssignments,
  parseMoodleCourses,
  parseMoodleDeadlines,
  parseMoodleForumDiscussions,
  parseMoodleNotifications,
  parseMoodleQuizzes,
  parseMoodleSiteInfo,
  validateRelativePath,
  validateUpstreamBaseUrl,
  type MoodleCourseSummary,
  type MoodleSiteInfo,
} from '../core/liveParsers';
import { normalizeAttendanceEndDate } from '../core/attendance';
import { deduplicateDeadlines } from '../core/schedule';
import type {
  AttendanceSubject,
  DeadlineItem,
  ErpUserRole,
  NotificationItem,
  ResultsPayload,
  StudentProfile,
  SubjectCaeMark,
  TimetableSlot,
} from '../core/types';
import type { StoredSession } from './session';

const DEFAULT_ERP_BASE_URL = 'https://erp.sathyabama.ac.in';
const DEFAULT_LMS_BASE_URL = 'https://sathyabama.cognibot.in';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB cap per upstream JSON response

const DEFAULT_ERP_PATHS = {
  login: '/erp/api/v1.0/MasterStudent/login_sec',
  staffLogin: '/erp/api/v1.0/MasterStaff/login_sec',
  admissionLogin: '/erp/api/v1.0/MasterStudent/login_sec',
  parentLogin: '/erp/api/v1.0/MasterStudent/login_sec',
  studentLookup: '/erp/api/v1.0/MasterStudent/StudentRegNoAutoSuggest',
  profile: '/erp/api/v1.0/MasterStudent/view',
  attendance: '/erp/api/v1.0/StudentAttendanceHourly/getStudentAcademicHourwise',
  timetableId: '/erp/api/v1.0/TimetableDetails/getProgrammeSectionAndTimeSetbyCourse',
  timetable: '/erp/api/v1.0/TimetableDetails/getdatabyprogramme',
  semesterList: '/erp/api/v1.0/MasterStudent/studentSemesterListByRegNo',
  results: '/erp/api/v1.0/ResultMark/studentResult',
  caeResults: '/erp/api/v1.0/CAEResult/studentCAEResult',
  deadlines: '/erp/api/v1.0/EventCalendar/listStudent',
  notifications: '/erp/api/v1.0/Notifications/student',
} as const;

export interface LiveAdapterConfig {
  erpBaseUrl: string | null;
  erpHost: string | null;
  erpConfigError: string | null;
  lmsBaseUrl: string | null;
  lmsHost: string | null;
  lmsConfigError: string | null;
  erpPaths: {
    login: string;
    staffLogin: string;
    admissionLogin: string;
    parentLogin: string;
    studentLookup: string;
    profile: string;
    attendance: string;
    timetableId: string;
    timetable: string;
    semesterList: string;
    results: string;
    caeResults: string;
    deadlines: string;
    notifications: string;
  };
  customErpPaths: {
    profile: boolean;
    attendance: boolean;
    timetable: boolean;
    results: boolean;
    caeResults: boolean;
    deadlines: boolean;
    notifications: boolean;
  };
}

export interface LiveAdapterDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  role?: ErpUserRole;
  endDate?: string;
}

export function getLiveAdapterConfig(env: NodeJS.ProcessEnv = process.env): LiveAdapterConfig {
  const rawErp = (env.ERP_BASE_URL ?? DEFAULT_ERP_BASE_URL).trim();
  let erpBaseUrl: string | null = null;
  let erpHost: string | null = null;
  let erpConfigError: string | null = null;

  if (rawErp) {
    try {
      erpBaseUrl = validateUpstreamBaseUrl(rawErp);
      erpHost = new URL(erpBaseUrl).host;
    } catch (err) {
      erpConfigError = err instanceof Error ? err.message : 'Invalid ERP_BASE_URL configuration.';
    }
  }

  const rawLms = (env.LMS_BASE_URL ?? DEFAULT_LMS_BASE_URL).trim();
  let lmsBaseUrl: string | null = null;
  let lmsHost: string | null = null;
  let lmsConfigError: string | null = null;

  if (rawLms) {
    try {
      lmsBaseUrl = validateUpstreamBaseUrl(rawLms);
      lmsHost = new URL(lmsBaseUrl).host;
    } catch (err) {
      lmsConfigError = err instanceof Error ? err.message : 'Invalid LMS_BASE_URL configuration.';
    }
  }

  const safePath = (raw: string | undefined, fallback: string) => {
    try {
      return validateRelativePath(raw ?? '', fallback);
    } catch {
      return fallback;
    }
  };

  const isCustom = (raw: string | undefined) => Boolean(raw && raw.trim().length > 0);

  return {
    erpBaseUrl,
    erpHost,
    erpConfigError,
    lmsBaseUrl,
    lmsHost,
    lmsConfigError,
    erpPaths: {
      login: safePath(env.ERP_LOGIN_PATH, DEFAULT_ERP_PATHS.login),
      staffLogin: safePath(env.ERP_STAFF_LOGIN_PATH, DEFAULT_ERP_PATHS.staffLogin),
      admissionLogin: safePath(env.ERP_ADMISSION_LOGIN_PATH, DEFAULT_ERP_PATHS.admissionLogin),
      parentLogin: safePath(env.ERP_PARENT_LOGIN_PATH, DEFAULT_ERP_PATHS.parentLogin),
      studentLookup: safePath(env.ERP_STUDENT_LOOKUP_PATH, DEFAULT_ERP_PATHS.studentLookup),
      profile: safePath(env.ERP_PROFILE_PATH, DEFAULT_ERP_PATHS.profile),
      attendance: safePath(env.ERP_ATTENDANCE_PATH, DEFAULT_ERP_PATHS.attendance),
      timetableId: safePath(env.ERP_TIMETABLE_ID_PATH, DEFAULT_ERP_PATHS.timetableId),
      timetable: safePath(env.ERP_TIMETABLE_PATH, DEFAULT_ERP_PATHS.timetable),
      semesterList: safePath(env.ERP_SEMESTER_LIST_PATH, DEFAULT_ERP_PATHS.semesterList),
      results: safePath(env.ERP_RESULTS_PATH, DEFAULT_ERP_PATHS.results),
      caeResults: safePath(env.ERP_CAE_RESULTS_PATH, DEFAULT_ERP_PATHS.caeResults),
      deadlines: safePath(env.ERP_DEADLINES_PATH, DEFAULT_ERP_PATHS.deadlines),
      notifications: safePath(env.ERP_NOTIFICATIONS_PATH, DEFAULT_ERP_PATHS.notifications),
    },
    customErpPaths: {
      profile: isCustom(env.ERP_PROFILE_PATH),
      attendance: isCustom(env.ERP_ATTENDANCE_PATH),
      timetable: isCustom(env.ERP_TIMETABLE_PATH),
      results: isCustom(env.ERP_RESULTS_PATH),
      caeResults: isCustom(env.ERP_CAE_RESULTS_PATH),
      deadlines: isCustom(env.ERP_DEADLINES_PATH),
      notifications: isCustom(env.ERP_NOTIFICATIONS_PATH),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely inspects non-secret identity claims (e.g. StudentId) inside a pasted ERP JWT payload.
 * Never grants trust on its own; upstream ERP still validates the token signature on every request.
 */
export function extractErpStudentIdFromToken(erpToken: string): string | undefined {
  const raw = erpToken.trim().replace(/^bearer\s+/i, '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const claims = JSON.parse(json) as unknown;
    if (!isRecord(claims)) return undefined;
    for (const key of ['StudentId', 'studentId', 'student_id', 'IdentityId', 'identityId', 'UserId', 'userId', 'id', 'sub']) {
      const val = claims[key];
      if (typeof val === 'number' && Number.isFinite(val) && val > 0) return String(val);
      if (typeof val === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(val.trim())) return val.trim();
    }
  } catch {
    // Non-JWT or malformed payload — fall back to ERP lookup endpoint.
  }
  return undefined;
}

async function readBoundedJson(res: Response, sourceLabel: string): Promise<unknown> {
  const contentLength = Number(res.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new LiveUpstreamError(502, `${sourceLabel} response exceeded maximum allowed size.`);
  }
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new LiveUpstreamError(502, `${sourceLabel} response exceeded maximum allowed size.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LiveUpstreamError(
      502,
      `${sourceLabel} returned non-JSON data (HTTP ${res.status}). Check that the endpoint and token are valid.`
    );
  }
}

function buildErpAuthHeaders(
  erpToken: string,
  registerNumber: string,
  withJsonBody = false
): Record<string, string> {
  const trimmed = erpToken.trim();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Register-Number': registerNumber,
  };
  if (withJsonBody) {
    headers['Content-Type'] = 'application/json';
  }
  // Support both Bearer/Access-Token JWTs and browser session cookies (e.g. PHPSESSID=... or JSESSIONID=...)
  if (/^[A-Za-z0-9_.-]+=/.test(trimmed)) {
    headers.Cookie = trimmed;
  } else if (/^bearer\s+/i.test(trimmed)) {
    const rawToken = trimmed.replace(/^bearer\s+/i, '').trim();
    headers.Authorization = `Bearer ${rawToken}`;
    headers.Token = rawToken;
  } else {
    headers.Authorization = `Bearer ${trimmed}`;
    headers.Token = trimmed;
  }
  return headers;
}

async function requestErpJson(
  pathSuffix: string,
  erpToken: string,
  registerNumber: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {},
  deps: LiveAdapterDeps = {}
): Promise<unknown> {
  const config = getLiveAdapterConfig(deps.env);
  if (config.erpConfigError) {
    throw new LiveUpstreamError(503, `ERP configuration error: ${config.erpConfigError}`, {
      field: 'erpToken',
    });
  }
  if (!config.erpBaseUrl) {
    throw new LiveUpstreamError(
      503,
      'ERP_BASE_URL is not configured on the server. Set ERP_BASE_URL in environment variables to enable live ERP sync, or sign in with your Moodle LMS token only.',
      { field: 'erpToken' }
    );
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const targetUrl = `${config.erpBaseUrl}${pathSuffix}`;
  const method = options.method ?? 'GET';
  const hasBody = method === 'POST';

  let res: Response;
  try {
    res = await fetchImpl(targetUrl, {
      method,
      headers: buildErpAuthHeaders(erpToken, registerNumber, hasBody),
      body: hasBody ? JSON.stringify(options.body ?? {}) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new LiveUpstreamError(
      isTimeout ? 504 : 502,
      isTimeout
        ? `College ERP (${config.erpHost}) timed out after ${Math.round(timeoutMs / 1000)}s.`
        : `Unable to reach College ERP (${config.erpHost}). Check network access and ERP_BASE_URL.`,
      { field: 'erpToken' }
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new LiveUpstreamError(
      401,
      `College ERP rejected the session token (HTTP ${res.status}). Sign in again at ${config.erpHost} and paste a fresh Access-Token.`,
      { field: 'erpToken' }
    );
  }
  if (!res.ok) {
    throw new LiveUpstreamError(502, `College ERP returned HTTP ${res.status} for ${pathSuffix}.`, {
      field: 'erpToken',
    });
  }

  const parsed = await readBoundedJson(res, 'College ERP');
  if (isRecord(parsed)) {
    const failedStatus = parsed.status === 0 || parsed.status === false || parsed.success === false;
    const msg = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    if (failedStatus && /unauthori|expired|invalid token|jwt|not authenticated|forbidden/i.test(msg)) {
      throw new LiveUpstreamError(
        401,
        `College ERP session expired (${msg}). Sign in again at ${config.erpHost} and paste a fresh Access-Token.`,
        { field: 'erpToken' }
      );
    }
  }
  return parsed;
}

function shouldUseSathyabamaPost(pathSuffix: string, isCustomOverride: boolean): boolean {
  if (!isCustomOverride) return true;
  return pathSuffix.startsWith('/erp/api/');
}

async function resolveErpStudentId(
  erpToken: string,
  registerNumber: string,
  knownStudentId?: string,
  deps: LiveAdapterDeps = {}
): Promise<string | undefined> {
  if (knownStudentId && knownStudentId.trim()) return knownStudentId.trim();
  const fromJwt = extractErpStudentIdFromToken(erpToken);
  if (fromJwt) return fromJwt;

  const config = getLiveAdapterConfig(deps.env);
  try {
    const raw = await requestErpJson(
      config.erpPaths.studentLookup,
      erpToken,
      registerNumber,
      { method: 'POST', body: { RegNo: registerNumber.trim() } },
      deps
    );
    const list =
      isRecord(raw) && Array.isArray(raw.responseData)
        ? raw.responseData
        : Array.isArray(raw)
          ? raw
          : [];
    const targetUpper = registerNumber.trim().toUpperCase();
    const match =
      list.find(
        (item) =>
          isRecord(item) &&
          typeof item.RegisterNumber === 'string' &&
          item.RegisterNumber.trim().toUpperCase() === targetUpper
      ) ?? list[0];
    if (isRecord(match)) {
      const sid = match.StudentId ?? match.studentId ?? match.id;
      if (typeof sid === 'number' && Number.isFinite(sid) && sid > 0) return String(sid);
      if (typeof sid === 'string' && sid.trim()) return sid.trim();
    }
  } catch (err) {
    if (err instanceof LiveUpstreamError && err.status === 401) throw err;
  }
  return undefined;
}

async function fetchErpStudentViewRaw(
  erpToken: string,
  registerNumber: string,
  knownStudentId?: string,
  deps: LiveAdapterDeps = {}
): Promise<{ raw: unknown; studentId?: string }> {
  const config = getLiveAdapterConfig(deps.env);
  if (!shouldUseSathyabamaPost(config.erpPaths.profile, config.customErpPaths.profile)) {
    const raw = await requestErpJson(config.erpPaths.profile, erpToken, registerNumber, { method: 'GET' }, deps);
    return { raw, studentId: knownStudentId };
  }

  const studentId = await resolveErpStudentId(erpToken, registerNumber, knownStudentId, deps);
  const body: Record<string, unknown> = studentId
    ? { StudentId: /^\d+$/.test(studentId) ? Number(studentId) : studentId, RegisterNumber: registerNumber }
    : { RegisterNumber: registerNumber };

  const raw = await requestErpJson(
    config.erpPaths.profile,
    erpToken,
    registerNumber,
    { method: 'POST', body },
    deps
  );

  let resolvedId = studentId;
  if (!resolvedId && isRecord(raw) && isRecord(raw.responseData)) {
    const info = Array.isArray(raw.responseData.StudentInfo) ? raw.responseData.StudentInfo[0] : raw.responseData;
    if (isRecord(info)) {
      const sid = info.StudentId ?? info.studentId;
      if (typeof sid === 'number' && Number.isFinite(sid) && sid > 0) resolvedId = String(sid);
      else if (typeof sid === 'string' && sid.trim()) resolvedId = sid.trim();
    }
  }

  return { raw, studentId: resolvedId };
}

async function callMoodleFunction(
  lmsToken: string,
  wsFunction: string,
  params: Record<string, string | number> = {},
  deps: LiveAdapterDeps = {}
): Promise<unknown> {
  const config = getLiveAdapterConfig(deps.env);
  if (config.lmsConfigError) {
    throw new LiveUpstreamError(503, `Moodle LMS configuration error: ${config.lmsConfigError}`, {
      field: 'lmsToken',
    });
  }
  if (!config.lmsBaseUrl) {
    throw new LiveUpstreamError(503, 'LMS_BASE_URL is not configured on the server.', {
      field: 'lmsToken',
    });
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${config.lmsBaseUrl}/webservice/rest/server.php`;

  // Send wstoken in POST form body rather than query string so it is not recorded in access logs.
  const body = new URLSearchParams({
    wstoken: lmsToken.trim(),
    wsfunction: wsFunction,
    moodlewsrestformat: 'json',
  });
  for (const [k, v] of Object.entries(params)) {
    body.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new LiveUpstreamError(
      isTimeout ? 504 : 502,
      isTimeout
        ? `Moodle LMS (${config.lmsHost}) timed out after ${Math.round(timeoutMs / 1000)}s.`
        : `Unable to reach Moodle LMS (${config.lmsHost}). Check network connectivity or LMS_BASE_URL.`,
      { field: 'lmsToken' }
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new LiveUpstreamError(
      401,
      `Moodle LMS rejected the web-service token (HTTP ${res.status}).`,
      { field: 'lmsToken' }
    );
  }
  if (!res.ok) {
    throw new LiveUpstreamError(502, `Moodle LMS returned HTTP ${res.status} for ${wsFunction}.`, {
      field: 'lmsToken',
    });
  }

  return readBoundedJson(res, 'Moodle LMS');
}

export async function exchangeMoodleCredentialsForToken(
  username: string,
  password: string,
  deps: LiveAdapterDeps = {}
): Promise<string> {
  const config = getLiveAdapterConfig(deps.env);
  if (config.lmsConfigError) {
    throw new LiveUpstreamError(503, `Moodle LMS configuration error: ${config.lmsConfigError}`, {
      field: 'lmsUsername',
    });
  }
  if (!config.lmsBaseUrl) {
    throw new LiveUpstreamError(503, 'LMS_BASE_URL is not configured on the server.', {
      field: 'lmsUsername',
    });
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${config.lmsBaseUrl}/login/token.php`;

  // Send credentials strictly in POST form body (never query string); password is never stored or logged.
  const body = new URLSearchParams({
    username: username.trim(),
    password,
    service: 'moodle_mobile_app',
  });

  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new LiveUpstreamError(
      isTimeout ? 504 : 502,
      isTimeout
        ? `Moodle LMS (${config.lmsHost}) timed out after ${Math.round(timeoutMs / 1000)}s.`
        : `Unable to reach Moodle LMS (${config.lmsHost}).`,
      { field: 'lmsPassword' }
    );
  }

  if (!res.ok) {
    throw new LiveUpstreamError(502, `Moodle login endpoint returned HTTP ${res.status}.`, {
      field: 'lmsPassword',
    });
  }

  const parsed = await readBoundedJson(res, 'Moodle LMS');
  if (typeof parsed === 'object' && parsed !== null) {
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.token === 'string' && rec.token.trim().length >= 8) {
      return rec.token.trim();
    }
    if (typeof rec.error === 'string' && rec.error.trim().length > 0) {
      const code = typeof rec.errorcode === 'string' ? rec.errorcode : 'invalidlogin';
      const friendlyMessage =
        code === 'invalidlogin'
          ? `Moodle LMS rejected that username or password on ${config.lmsHost}. Check your login or sign in directly on ${config.lmsHost}.`
          : `Moodle sign-in failed (${code}): ${rec.error.trim()}`;
      throw new LiveUpstreamError(401, friendlyMessage, {
        code,
        field: 'lmsPassword',
      });
    }
  }

  throw new LiveUpstreamError(502, 'Moodle login endpoint did not return a web-service token.', {
    field: 'lmsPassword',
  });
}

function generateErpCaptchaKey(length = 48): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(length * 2);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    if (bytes[i] < 252) {
      out += alphabet[bytes[i] % alphabet.length];
    }
  }
  while (out.length < length) {
    out += alphabet[randomBytes(1)[0] % alphabet.length];
  }
  return out;
}

export interface ErpCredentialExchangeResult {
  token: string;
  studentName?: string;
  studentId?: string;
  role: ErpUserRole;
}

const ERP_USER_TYPE_LABELS: Record<ErpUserRole, string> = {
  student: 'Student',
  staff: 'Staff',
  'new-admission': 'NewAdmission',
  parent: 'Parent',
};

export async function exchangeErpCredentialsForToken(
  username: string,
  password: string,
  deps: LiveAdapterDeps = {}
): Promise<ErpCredentialExchangeResult> {
  const config = getLiveAdapterConfig(deps.env);
  if (config.erpConfigError) {
    throw new LiveUpstreamError(503, `College ERP configuration error: ${config.erpConfigError}`, {
      field: 'erpUsername',
    });
  }
  if (!config.erpBaseUrl) {
    throw new LiveUpstreamError(503, 'ERP_BASE_URL is not configured on the server.', {
      field: 'erpUsername',
    });
  }

  const role: ErpUserRole = deps.role ?? 'student';
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const loginPath =
    role === 'staff'
      ? config.erpPaths.staffLogin
      : role === 'new-admission'
        ? config.erpPaths.admissionLogin
        : role === 'parent'
          ? config.erpPaths.parentLogin
          : config.erpPaths.login;
  const endpoint = `${config.erpBaseUrl}${loginPath}`;
  const trimmedUser = username.trim();

  // Credentials are sent strictly in HTTPS POST JSON body and discarded immediately (never stored or logged).
  const payload: Record<string, unknown> = {
    RegisterNumber: trimmedUser,
    username: trimmedUser,
    Password: password,
    password,
    UserType: ERP_USER_TYPE_LABELS[role],
    Role: role,
    CapchaKey: generateErpCaptchaKey(48),
    TurnstileToken: '',
  };
  if (role === 'staff') {
    payload.StaffNumber = trimmedUser;
    payload.EmployeeCode = trimmedUser;
  } else if (role === 'new-admission') {
    payload.ApplicationNumber = trimmedUser;
  } else if (role === 'parent') {
    payload.ParentId = trimmedUser;
  }

  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new LiveUpstreamError(
      isTimeout ? 504 : 502,
      isTimeout
        ? `College ERP (${config.erpHost}) timed out after ${Math.round(timeoutMs / 1000)}s.`
        : `Unable to reach College ERP (${config.erpHost}).`,
      { field: 'erpPassword' }
    );
  }

  const browserLoginMessage = `Sathyabama ERP blocks automated password sign-in outside ${config.erpHost}. Sign in directly on ${config.erpHost} in your browser, then paste your Access-Token to sync attendance, timetable, and CGPA.`;

  const parsed = await readBoundedJson(res, 'College ERP').catch((err) => {
    if (!res.ok) {
      if (res.status === 403 || res.status === 405) {
        throw new LiveUpstreamError(403, browserLoginMessage, {
          code: 'erp_browser_login_required',
          field: 'erpPassword',
        });
      }
      throw new LiveUpstreamError(
        res.status === 401 ? 401 : 502,
        `College ERP login returned HTTP ${res.status}. Sign in directly at ${config.erpHost} and paste your Access-Token.`,
        {
          code: res.status === 401 ? undefined : 'erp_browser_login_required',
          field: 'erpPassword',
        }
      );
    }
    throw err;
  });

  if (typeof parsed === 'object' && parsed !== null) {
    const rec = parsed as Record<string, unknown>;
    const responseData =
      typeof rec.responseData === 'object' && rec.responseData !== null
        ? (rec.responseData as Record<string, unknown>)
        : null;
    const loginObj =
      responseData && typeof responseData.login === 'object' && responseData.login !== null
        ? (responseData.login as Record<string, unknown>)
        : typeof rec.data === 'object' && rec.data !== null
          ? (rec.data as Record<string, unknown>)
          : null;

    const rawToken =
      (loginObj &&
        (typeof loginObj.accessToken === 'string'
          ? loginObj.accessToken
          : typeof loginObj.token === 'string'
            ? loginObj.token
            : typeof loginObj.access_token === 'string'
              ? loginObj.access_token
              : null)) ||
      (typeof rec.accessToken === 'string'
        ? rec.accessToken
        : typeof rec.token === 'string'
          ? rec.token
          : typeof rec.access_token === 'string'
            ? rec.access_token
            : null);

    const statusOk = rec.status === undefined || rec.status === 1 || rec.status === true || rec.status === '1';

    if (res.ok && statusOk && rawToken && rawToken.trim().length >= 8) {
      const studentName =
        loginObj && typeof loginObj.StudentName === 'string' && loginObj.StudentName.trim()
          ? loginObj.StudentName.trim()
          : loginObj && typeof loginObj.name === 'string' && loginObj.name.trim()
            ? loginObj.name.trim()
            : undefined;
      const rawSid = loginObj ? loginObj.StudentId ?? loginObj.IdentityId ?? loginObj.studentId : undefined;
      const studentId =
        typeof rawSid === 'number' && Number.isFinite(rawSid)
          ? String(rawSid)
          : typeof rawSid === 'string' && rawSid.trim()
            ? rawSid.trim()
            : extractErpStudentIdFromToken(rawToken);
      return { token: rawToken.trim(), studentName, studentId, role };
    }

    const upstreamMsg =
      typeof rec.message === 'string' && rec.message.trim()
        ? rec.message.trim()
        : typeof rec.error === 'string' && rec.error.trim()
          ? rec.error.trim()
          : null;

    const needsBrowserLogin =
      res.status === 403 ||
      res.status === 405 ||
      (upstreamMsg !== null &&
        /turnstile|captcha|bot|verify|otp|not an official erp portal|official erp|method not allowed/i.test(
          upstreamMsg
        ));

    if (needsBrowserLogin) {
      throw new LiveUpstreamError(403, browserLoginMessage, {
        code: 'erp_browser_login_required',
        field: 'erpPassword',
      });
    }

    if (upstreamMsg) {
      throw new LiveUpstreamError(401, `College ERP sign-in failed: ${upstreamMsg}`, {
        field: 'erpPassword',
      });
    }
  }

  if (res.status === 403 || res.status === 405) {
    throw new LiveUpstreamError(403, browserLoginMessage, {
      code: 'erp_browser_login_required',
      field: 'erpPassword',
    });
  }

  if (!res.ok) {
    throw new LiveUpstreamError(
      res.status === 401 ? 401 : 502,
      `College ERP login rejected credentials (HTTP ${res.status}).`,
      {
        code: res.status === 401 ? undefined : 'erp_browser_login_required',
        field: 'erpPassword',
      }
    );
  }

  throw new LiveUpstreamError(
    502,
    `College ERP did not return an access token. Sign in directly at ${config.erpHost} and paste your Access-Token.`,
    { code: 'erp_browser_login_required', field: 'erpPassword' }
  );
}

export async function verifyMoodleToken(
  lmsToken: string,
  deps: LiveAdapterDeps = {}
): Promise<MoodleSiteInfo> {
  const raw = await callMoodleFunction(lmsToken, 'core_webservice_get_site_info', {}, deps);
  return parseMoodleSiteInfo(raw);
}

export interface VerifiedErpProfile extends StudentProfile {
  erpStudentId?: string;
}

export async function verifyErpToken(
  erpToken: string,
  registerNumber: string,
  displayName?: string,
  lmsConnected = false,
  deps: LiveAdapterDeps = {}
): Promise<VerifiedErpProfile> {
  const { raw, studentId } = await fetchErpStudentViewRaw(erpToken, registerNumber, undefined, deps);
  const profile = parseErpProfile(raw, registerNumber, displayName, lmsConnected);
  return { ...profile, erpStudentId: studentId };
}

export async function fetchLiveProfile(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<StudentProfile> {
  const config = getLiveAdapterConfig(deps.env);
  if (session.erpToken && config.erpBaseUrl) {
    const { raw } = await fetchErpStudentViewRaw(
      session.erpToken,
      session.registerNumber,
      session.erpStudentId,
      deps
    );
    return parseErpProfile(raw, session.registerNumber, session.name, Boolean(session.lmsToken));
  }
  if (session.lmsToken) {
    const siteInfo = await verifyMoodleToken(session.lmsToken, deps);
    return buildProfileFromMoodle(siteInfo, session.registerNumber, session.name, false);
  }
  throw new LiveUpstreamError(503, 'No live ERP or Moodle LMS token is attached to this session.');
}

export async function fetchLiveAttendance(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<AttendanceSubject[]> {
  if (!session.erpToken) {
    throw new LiveUpstreamError(
      503,
      'ERP session token is not connected for this live session. Sign in with an ERP token to sync attendance.'
    );
  }
  const config = getLiveAdapterConfig(deps.env);
  const now = new Date();
  const effectiveEndDate = normalizeAttendanceEndDate(deps.endDate, now);
  const [ey, em, ed] = effectiveEndDate.split('-').map(Number);
  const cutoffDate = new Date(ey, em - 1, ed);

  if (!shouldUseSathyabamaPost(config.erpPaths.attendance, config.customErpPaths.attendance)) {
    const queryJoiner = config.erpPaths.attendance.includes('?') ? '&' : '?';
    const raw = await requestErpJson(
      `${config.erpPaths.attendance}${queryJoiner}toDate=${encodeURIComponent(effectiveEndDate)}`,
      session.erpToken,
      session.registerNumber,
      { method: 'GET' },
      deps
    );
    return parseErpAttendance(raw, cutoffDate);
  }

  const studentId = await resolveErpStudentId(
    session.erpToken,
    session.registerNumber,
    session.erpStudentId,
    deps
  );
  const body: Record<string, unknown> = studentId
    ? {
        StudentId: /^\d+$/.test(studentId) ? Number(studentId) : studentId,
        RegisterNumber: session.registerNumber,
        ToDate: effectiveEndDate,
        EndDate: effectiveEndDate,
      }
    : {
        RegisterNumber: session.registerNumber,
        ToDate: effectiveEndDate,
        EndDate: effectiveEndDate,
      };
  const raw = await requestErpJson(
    config.erpPaths.attendance,
    session.erpToken,
    session.registerNumber,
    { method: 'POST', body },
    deps
  );
  return parseErpAttendance(raw, cutoffDate);
}

export async function fetchLiveTimetable(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<TimetableSlot[]> {
  if (!session.erpToken) {
    throw new LiveUpstreamError(
      503,
      'ERP session token is not connected for this live session. Sign in with an ERP token to sync your timetable.'
    );
  }
  const config = getLiveAdapterConfig(deps.env);
  if (!shouldUseSathyabamaPost(config.erpPaths.timetable, config.customErpPaths.timetable)) {
    const raw = await requestErpJson(
      config.erpPaths.timetable,
      session.erpToken,
      session.registerNumber,
      { method: 'GET' },
      deps
    );
    return parseErpTimetable(raw);
  }

  // Sathyabama ERP timetable flow: resolve student academic metadata -> getProgrammeSectionAndTimeSetbyCourse -> getdatabyprogramme
  const { raw: studentViewRaw } = await fetchErpStudentViewRaw(
    session.erpToken,
    session.registerNumber,
    session.erpStudentId,
    deps
  );
  const studentInfo =
    isRecord(studentViewRaw) && isRecord(studentViewRaw.responseData)
      ? Array.isArray(studentViewRaw.responseData.StudentInfo) && isRecord(studentViewRaw.responseData.StudentInfo[0])
        ? (studentViewRaw.responseData.StudentInfo[0] as Record<string, unknown>)
        : studentViewRaw.responseData
      : isRecord(studentViewRaw)
        ? studentViewRaw
        : {};

  const lookupPayload: Record<string, unknown> = {
    DegreeId: studentInfo.DegreeId,
    CourseId: studentInfo.CourseId,
    ProgrammeId: studentInfo.ProgrammeId,
    Batch: studentInfo.Batch,
    Semester: studentInfo.Semester,
    Year: studentInfo.YearofStudy ?? studentInfo.Year,
    SectionId: studentInfo.Section ?? studentInfo.SectionId,
  };

  let timetablePayload: Record<string, unknown> = lookupPayload;
  try {
    const idRaw = await requestErpJson(
      config.erpPaths.timetableId,
      session.erpToken,
      session.registerNumber,
      { method: 'POST', body: lookupPayload },
      deps
    );
    const idData =
      isRecord(idRaw) && Array.isArray(idRaw.responseData) && isRecord(idRaw.responseData[0])
        ? (idRaw.responseData[0] as Record<string, unknown>)
        : isRecord(idRaw) && isRecord(idRaw.responseData)
          ? idRaw.responseData
          : null;
    if (idData && (idData.TimeTableId !== undefined || idData.ProgrammeSectionId !== undefined)) {
      timetablePayload = {
        TimeTableId: idData.TimeTableId,
        ProgrammeSectionId: idData.ProgrammeSectionId,
      };
    }
  } catch (err) {
    if (err instanceof LiveUpstreamError && err.status === 401) throw err;
  }

  const raw = await requestErpJson(
    config.erpPaths.timetable,
    session.erpToken,
    session.registerNumber,
    { method: 'POST', body: timetablePayload },
    deps
  );
  return parseErpTimetable(raw);
}

export async function fetchLiveResults(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<ResultsPayload> {
  if (!session.erpToken) {
    throw new LiveUpstreamError(
      503,
      'ERP session token is not connected for this live session. Sign in with an ERP token to sync grades and CGPA.'
    );
  }
  const config = getLiveAdapterConfig(deps.env);
  if (!shouldUseSathyabamaPost(config.erpPaths.results, config.customErpPaths.results)) {
    const raw = await requestErpJson(
      config.erpPaths.results,
      session.erpToken,
      session.registerNumber,
      { method: 'GET' },
      deps
    );
    return parseErpResults(raw);
  }

  // Sathyabama ERP results flow: list available semesters by RegNo, then fetch SemResult rows per semester
  let semEntries: Record<string, unknown>[] = [];
  try {
    const semRaw = await requestErpJson(
      config.erpPaths.semesterList,
      session.erpToken,
      session.registerNumber,
      { method: 'POST', body: { RegisterNumber: session.registerNumber } },
      deps
    );
    const list =
      isRecord(semRaw) && Array.isArray(semRaw.responseData)
        ? semRaw.responseData
        : Array.isArray(semRaw)
          ? semRaw
          : [];
    semEntries = list.filter(isRecord);
  } catch (err) {
    if (err instanceof LiveUpstreamError && err.status === 401) throw err;
  }

  const fetchCaeMarksSafely = async (latestSemEntry?: Record<string, unknown>): Promise<SubjectCaeMark[]> => {
    try {
      const usePost = shouldUseSathyabamaPost(config.erpPaths.caeResults, config.customErpPaths.caeResults);
      const caeBody: Record<string, unknown> = latestSemEntry
        ? {
            RegisterNumber: session.registerNumber,
            AcademicMonthId: latestSemEntry.AcademicMonthId,
            AcademicYear: latestSemEntry.AcademicYear,
            Semester: latestSemEntry.Semester,
          }
        : { RegisterNumber: session.registerNumber };
      const rawCae = await requestErpJson(
        config.erpPaths.caeResults,
        session.erpToken!,
        session.registerNumber,
        usePost ? { method: 'POST', body: caeBody } : { method: 'GET' },
        deps
      );
      return parseErpCaeMarks(rawCae);
    } catch (err) {
      if (err instanceof LiveUpstreamError && err.status === 401) throw err;
      return [];
    }
  };

  if (semEntries.length > 0) {
    const latestSemEntry = semEntries[semEntries.length - 1];
    const [settled, caeMarks] = await Promise.all([
      Promise.allSettled(
        semEntries.slice(0, 10).map((entry) =>
          requestErpJson(
            config.erpPaths.results,
            session.erpToken!,
            session.registerNumber,
            {
              method: 'POST',
              body: {
                RegisterNumber: session.registerNumber,
                AcademicMonthId: entry.AcademicMonthId,
                AcademicYear: entry.AcademicYear,
                Semester: entry.Semester,
              },
            },
            deps
          )
        )
      ),
      fetchCaeMarksSafely(latestSemEntry),
    ]);

    const allRows: unknown[] = [];
    let firstAuthErr: LiveUpstreamError | null = null;
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const val = outcome.value;
        if (isRecord(val) && isRecord(val.responseData) && Array.isArray(val.responseData.SemResult)) {
          allRows.push(...val.responseData.SemResult);
        } else if (isRecord(val) && Array.isArray(val.responseData)) {
          allRows.push(...val.responseData);
        }
      } else if (outcome.reason instanceof LiveUpstreamError && outcome.reason.status === 401) {
        firstAuthErr = outcome.reason;
      }
    }
    if (allRows.length === 0 && firstAuthErr) throw firstAuthErr;
    const parsed = parseErpResults({ responseData: { SemResult: allRows } });
    return {
      ...parsed,
      caeMarks: caeMarks.length > 0 ? caeMarks : parsed.caeMarks,
    };
  }

  const [raw, caeMarks] = await Promise.all([
    requestErpJson(
      config.erpPaths.results,
      session.erpToken,
      session.registerNumber,
      { method: 'POST', body: { RegisterNumber: session.registerNumber } },
      deps
    ),
    fetchCaeMarksSafely(),
  ]);
  const parsed = parseErpResults(raw);
  return {
    ...parsed,
    caeMarks: caeMarks.length > 0 ? caeMarks : parsed.caeMarks,
  };
}

async function fetchMoodleCourseMap(
  lmsToken: string,
  userId: number,
  deps: LiveAdapterDeps = {}
): Promise<Map<number, MoodleCourseSummary>> {
  try {
    const rawCourses = await callMoodleFunction(
      lmsToken,
      'core_enrol_get_users_courses',
      { userid: userId },
      deps
    );
    return parseMoodleCourses(rawCourses);
  } catch (err) {
    if (err instanceof LiveUpstreamError && err.status === 401) throw err;
    return new Map();
  }
}

async function fetchMoodleDeadlinesForSession(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<DeadlineItem[]> {
  if (!session.lmsToken) return [];
  const nowSec = Math.floor(Date.now() / 1000) - 86400; // include overdue from last 24h
  let userId = session.lmsUserId;
  if (!userId) {
    const info = await verifyMoodleToken(session.lmsToken, deps);
    userId = info.userid;
  }

  const courseMap = await fetchMoodleCourseMap(session.lmsToken, userId, deps);
  const courseIds = Array.from(courseMap.keys()).slice(0, 20);
  const courseParams: Record<string, string | number> = {};
  courseIds.forEach((cid, i) => {
    courseParams[`courseids[${i}]`] = cid;
  });

  // Query Moodle calendar events, course assignments, and quizzes in parallel so deadlines populate
  // even when one Moodle web-service function is restricted or empty on sathyabama.cognibot.in.
  const calendarTask = async (): Promise<DeadlineItem[]> => {
    try {
      const raw = await callMoodleFunction(
        session.lmsToken!,
        'core_calendar_get_action_events_by_timesort',
        { timesortfrom: nowSec, limitnum: 50 },
        deps
      );
      return parseMoodleDeadlines(raw, courseMap);
    } catch (err) {
      if (err instanceof LiveUpstreamError && err.status === 401) throw err;
      const fallback = await callMoodleFunction(
        session.lmsToken!,
        'core_calendar_get_calendar_upcoming_view',
        {},
        deps
      );
      return parseMoodleDeadlines(fallback, courseMap);
    }
  };

  const assignTask = async (): Promise<DeadlineItem[]> => {
    const raw = await callMoodleFunction(
      session.lmsToken!,
      'mod_assign_get_assignments',
      courseIds.length > 0 ? courseParams : {},
      deps
    );
    return parseMoodleAssignments(raw, courseMap);
  };

  const quizTask = async (): Promise<DeadlineItem[]> => {
    if (courseIds.length === 0) return [];
    const raw = await callMoodleFunction(
      session.lmsToken!,
      'mod_quiz_get_quizzes_by_courses',
      courseParams,
      deps
    );
    return parseMoodleQuizzes(raw, courseMap);
  };

  const settled = await Promise.allSettled([calendarTask(), assignTask(), quizTask()]);
  const combined: DeadlineItem[] = [];
  let succeededCount = 0;
  let firstError: unknown = null;

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      succeededCount += 1;
      combined.push(...outcome.value);
    } else {
      if (outcome.reason instanceof LiveUpstreamError && outcome.reason.status === 401) {
        throw outcome.reason;
      }
      if (!firstError) firstError = outcome.reason;
    }
  }

  if (succeededCount === 0 && firstError) {
    throw firstError instanceof Error
      ? firstError
      : new LiveUpstreamError(502, 'Unable to fetch Moodle LMS deadlines.');
  }

  return deduplicateDeadlines(combined).items;
}

export async function fetchLiveDeadlines(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<DeadlineItem[]> {
  const config = getLiveAdapterConfig(deps.env);
  const tasks: Promise<DeadlineItem[]>[] = [];

  if (session.lmsToken && config.lmsBaseUrl) {
    tasks.push(fetchMoodleDeadlinesForSession(session, deps));
  }
  if (session.erpToken && config.erpBaseUrl) {
    const usePost = shouldUseSathyabamaPost(config.erpPaths.deadlines, config.customErpPaths.deadlines);
    tasks.push(
      requestErpJson(
        config.erpPaths.deadlines,
        session.erpToken,
        session.registerNumber,
        usePost ? { method: 'POST', body: {} } : { method: 'GET' },
        deps
      ).then(parseErpDeadlines)
    );
  }

  if (tasks.length === 0) {
    throw new LiveUpstreamError(503, 'Neither ERP nor Moodle LMS is connected for deadlines.');
  }

  const settled = await Promise.allSettled(tasks);
  const combined: DeadlineItem[] = [];
  let succeededCount = 0;
  let firstError: unknown = null;

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      succeededCount += 1;
      combined.push(...outcome.value);
    } else if (!firstError) {
      firstError = outcome.reason;
    }
  }

  if (succeededCount === 0 && firstError) {
    throw firstError instanceof Error ? firstError : new LiveUpstreamError(502, 'Unable to fetch live deadlines.');
  }

  return deduplicateDeadlines(combined).items;
}

async function fetchMoodleForumAnnouncements(
  lmsToken: string,
  courseMap: Map<number, MoodleCourseSummary>,
  deps: LiveAdapterDeps = {}
): Promise<NotificationItem[]> {
  const courseIds = Array.from(courseMap.keys()).slice(0, 12);
  if (courseIds.length === 0) return [];
  const params: Record<string, string | number> = {};
  courseIds.forEach((cid, i) => {
    params[`courseids[${i}]`] = cid;
  });

  const rawForums = await callMoodleFunction(lmsToken, 'mod_forum_get_forums_by_courses', params, deps);
  if (!Array.isArray(rawForums)) return [];

  const announcementForums = rawForums
    .filter(
      (f): f is Record<string, unknown> =>
        isRecord(f) &&
        (f.type === 'news' || /announce|notice|circular/i.test(String(f.name ?? ''))) &&
        Number.isFinite(Number(f.id))
    )
    .slice(0, 6);

  if (announcementForums.length === 0) return [];

  const settled = await Promise.allSettled(
    announcementForums.map(async (forum) => {
      const forumId = Number(forum.id);
      const courseId = Number(forum.course);
      const courseCode = Number.isFinite(courseId) ? courseMap.get(courseId)?.shortname : undefined;
      const rawDiscussions = await callMoodleFunction(
        lmsToken,
        'mod_forum_get_forum_discussions',
        { forumid: forumId, sortorder: 1, page: 0, perpage: 5 },
        deps
      );
      return parseMoodleForumDiscussions(rawDiscussions, courseCode);
    })
  );

  const items: NotificationItem[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') items.push(...outcome.value);
  }
  return items;
}

async function fetchMoodleNotificationsForSession(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<NotificationItem[]> {
  if (!session.lmsToken) return [];
  let userId = session.lmsUserId;
  if (!userId) {
    const info = await verifyMoodleToken(session.lmsToken, deps);
    userId = info.userid;
  }

  let primaryItems: NotificationItem[] = [];
  let primarySucceeded = false;
  let primaryError: unknown = null;

  try {
    const raw = await callMoodleFunction(
      session.lmsToken,
      'message_popup_get_popup_notifications',
      { useridto: userId, limit: 30, offset: 0 },
      deps
    );
    primaryItems = parseMoodleNotifications(raw);
    primarySucceeded = true;
  } catch (err) {
    if (err instanceof LiveUpstreamError && err.status === 401) throw err;
    primaryError = err;
    // Fallback to core_message_get_messages fetching both unread and recent read notifications
    try {
      const [unreadRes, readRes] = await Promise.allSettled([
        callMoodleFunction(
          session.lmsToken,
          'core_message_get_messages',
          { useridto: userId, useridfrom: 0, type: 'notifications', read: 0, newestfirst: 1, limitnum: 20 },
          deps
        ).then(parseMoodleNotifications),
        callMoodleFunction(
          session.lmsToken,
          'core_message_get_messages',
          { useridto: userId, useridfrom: 0, type: 'notifications', read: 1, newestfirst: 1, limitnum: 15 },
          deps
        ).then(parseMoodleNotifications),
      ]);
      const merged: NotificationItem[] = [];
      let anyMsgOk = false;
      for (const outcome of [unreadRes, readRes]) {
        if (outcome.status === 'fulfilled') {
          anyMsgOk = true;
          merged.push(...outcome.value);
        } else if (outcome.reason instanceof LiveUpstreamError && outcome.reason.status === 401) {
          throw outcome.reason;
        }
      }
      if (anyMsgOk) {
        primaryItems = merged;
        primarySucceeded = true;
      }
    } catch (fallbackErr) {
      if (fallbackErr instanceof LiveUpstreamError && fallbackErr.status === 401) throw fallbackErr;
      if (!primaryError) primaryError = fallbackErr;
    }
  }

  // If popup/message notifications are empty or restricted, enrich with Moodle course announcement forums
  if (primaryItems.length === 0) {
    try {
      const courseMap = await fetchMoodleCourseMap(session.lmsToken, userId, deps);
      const forumItems = await fetchMoodleForumAnnouncements(session.lmsToken, courseMap, deps);
      if (forumItems.length > 0) {
        primaryItems = forumItems;
        primarySucceeded = true;
      }
    } catch (forumErr) {
      if (forumErr instanceof LiveUpstreamError && forumErr.status === 401) throw forumErr;
    }
  }

  if (!primarySucceeded && primaryError) {
    throw primaryError instanceof Error
      ? primaryError
      : new LiveUpstreamError(502, 'Unable to fetch Moodle LMS notifications.');
  }

  const deduped = new Map<string, NotificationItem>();
  for (const item of primaryItems) {
    if (!deduped.has(item.id)) deduped.set(item.id, item);
  }
  return Array.from(deduped.values()).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export async function fetchLiveNotifications(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<NotificationItem[]> {
  const config = getLiveAdapterConfig(deps.env);
  const tasks: Promise<NotificationItem[]>[] = [];

  if (session.lmsToken && config.lmsBaseUrl) {
    tasks.push(fetchMoodleNotificationsForSession(session, deps));
  }
  if (session.erpToken && config.erpBaseUrl) {
    const usePost = shouldUseSathyabamaPost(config.erpPaths.notifications, config.customErpPaths.notifications);
    tasks.push(
      requestErpJson(
        config.erpPaths.notifications,
        session.erpToken,
        session.registerNumber,
        usePost
          ? {
              method: 'POST',
              body: {
                columnSort: { fieldName: 'NotificationId', sortDirection: 'DESC' },
                paging: { pageNo: 0, pageSize: 20, totalCount: 0, offSet: 0 },
              },
            }
          : { method: 'GET' },
        deps
      ).then(parseErpNotifications)
    );
  }

  if (tasks.length === 0) {
    throw new LiveUpstreamError(503, 'Neither ERP nor Moodle LMS is connected for notifications.');
  }

  const settled = await Promise.allSettled(tasks);
  const combined: NotificationItem[] = [];
  let succeededCount = 0;
  let firstError: unknown = null;

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      succeededCount += 1;
      combined.push(...outcome.value);
    } else if (!firstError) {
      firstError = outcome.reason;
    }
  }

  if (succeededCount === 0 && firstError) {
    throw firstError instanceof Error
      ? firstError
      : new LiveUpstreamError(502, 'Unable to fetch live notifications.');
  }

  return combined.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export interface UpstreamProbeResult {
  reachable: boolean;
  statusCode: number | null;
  latencyMs: number;
  summary: string;
}

export async function probeUpstreamReachability(
  baseUrl: string,
  probePath: string,
  deps: LiveAdapterDeps = {}
): Promise<UpstreamProbeResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 4_000;
  const started = Date.now();
  try {
    const res = await fetchImpl(`${baseUrl}${probePath}`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;
    const reachable = res.status >= 200 && res.status < 500;
    return {
      reachable,
      statusCode: res.status,
      latencyMs,
      summary: reachable
        ? `Reachable at ${new URL(baseUrl).host} (HTTP ${res.status}, ${latencyMs}ms).`
        : `Upstream ${new URL(baseUrl).host} returned HTTP ${res.status} (${latencyMs}ms).`,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      reachable: false,
      statusCode: null,
      latencyMs,
      summary: isTimeout
        ? `Timed out contacting ${new URL(baseUrl).host} after ${latencyMs}ms.`
        : `Could not reach ${new URL(baseUrl).host} from this server.`,
    };
  }
}
