import { randomBytes } from 'node:crypto';
import {
  LiveUpstreamError,
  buildProfileFromMoodle,
  parseErpAttendance,
  parseErpDeadlines,
  parseErpNotifications,
  parseErpProfile,
  parseErpResults,
  parseErpTimetable,
  parseMoodleCourses,
  parseMoodleDeadlines,
  parseMoodleNotifications,
  parseMoodleSiteInfo,
  validateRelativePath,
  validateUpstreamBaseUrl,
  type MoodleSiteInfo,
} from '../core/liveParsers';
import { deduplicateDeadlines } from '../core/schedule';
import type {
  AttendanceSubject,
  DeadlineItem,
  NotificationItem,
  ResultsPayload,
  StudentProfile,
  TimetableSlot,
} from '../core/types';
import type { StoredSession } from './session';

const DEFAULT_ERP_BASE_URL = 'https://erp.sathyabama.ac.in';
const DEFAULT_LMS_BASE_URL = 'https://sathyabama.cognibot.in';
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB cap per upstream JSON response

export interface LiveAdapterConfig {
  erpBaseUrl: string | null;
  erpHost: string | null;
  erpConfigError: string | null;
  lmsBaseUrl: string | null;
  lmsHost: string | null;
  lmsConfigError: string | null;
  erpPaths: {
    login: string;
    profile: string;
    attendance: string;
    timetable: string;
    results: string;
    deadlines: string;
    notifications: string;
  };
}

export interface LiveAdapterDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
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

  return {
    erpBaseUrl,
    erpHost,
    erpConfigError,
    lmsBaseUrl,
    lmsHost,
    lmsConfigError,
    erpPaths: {
      login: safePath(env.ERP_LOGIN_PATH, '/erp/api/v1.0/MasterStudent/login_sec'),
      profile: safePath(env.ERP_PROFILE_PATH, '/api/student/profile'),
      attendance: safePath(env.ERP_ATTENDANCE_PATH, '/api/student/attendance'),
      timetable: safePath(env.ERP_TIMETABLE_PATH, '/api/student/timetable'),
      results: safePath(env.ERP_RESULTS_PATH, '/api/student/results'),
      deadlines: safePath(env.ERP_DEADLINES_PATH, '/api/student/deadlines'),
      notifications: safePath(env.ERP_NOTIFICATIONS_PATH, '/api/student/notifications'),
    },
  };
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

function buildErpAuthHeaders(erpToken: string, registerNumber: string): Record<string, string> {
  const trimmed = erpToken.trim();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Register-Number': registerNumber,
  };
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

async function fetchErpJson(
  pathSuffix: string,
  erpToken: string,
  registerNumber: string,
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

  let res: Response;
  try {
    res = await fetchImpl(targetUrl, {
      method: 'GET',
      headers: buildErpAuthHeaders(erpToken, registerNumber),
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
      `College ERP rejected the session token (HTTP ${res.status}). Sign in again after refreshing your browser ERP token.`,
      { field: 'erpToken' }
    );
  }
  if (!res.ok) {
    throw new LiveUpstreamError(502, `College ERP returned HTTP ${res.status} for ${pathSuffix}.`, {
      field: 'erpToken',
    });
  }

  return readBoundedJson(res, 'College ERP');
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
      throw new LiveUpstreamError(401, `Moodle sign-in failed (${code}): ${rec.error.trim()}`, {
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
}

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

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${config.erpBaseUrl}${config.erpPaths.login}`;

  // Credentials are sent strictly in HTTPS POST JSON body and discarded immediately (never stored or logged).
  const payload = {
    RegisterNumber: username.trim(),
    username: username.trim(),
    Password: password,
    password,
    CapchaKey: generateErpCaptchaKey(48),
    TurnstileToken: '',
  };

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

  const parsed = await readBoundedJson(res, 'College ERP').catch((err) => {
    if (!res.ok) {
      throw new LiveUpstreamError(
        res.status === 401 || res.status === 403 ? 401 : 502,
        `College ERP login returned HTTP ${res.status}. If ERP requires browser captcha/OTP, sign in at ${config.erpHost} and use Paste Tokens.`,
        { field: 'erpPassword' }
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
      return { token: rawToken.trim(), studentName };
    }

    const upstreamMsg =
      typeof rec.message === 'string' && rec.message.trim()
        ? rec.message.trim()
        : typeof rec.error === 'string' && rec.error.trim()
          ? rec.error.trim()
          : null;

    if (upstreamMsg) {
      const needsTurnstile = /turnstile|captcha|bot|verify|otp/i.test(upstreamMsg);
      throw new LiveUpstreamError(
        401,
        needsTurnstile
          ? `College ERP requires browser verification (${upstreamMsg}). Sign in once at ${config.erpHost} and paste your Access-Token in the Paste Tokens tab.`
          : `College ERP sign-in failed: ${upstreamMsg}`,
        { field: 'erpPassword' }
      );
    }
  }

  if (!res.ok) {
    throw new LiveUpstreamError(
      res.status === 401 || res.status === 403 ? 401 : 502,
      `College ERP login rejected credentials (HTTP ${res.status}).`,
      { field: 'erpPassword' }
    );
  }

  throw new LiveUpstreamError(
    502,
    `College ERP did not return an access token. If ${config.erpHost} requires browser captcha/OTP, sign in there and use Paste Tokens.`,
    { field: 'erpPassword' }
  );
}

export async function verifyMoodleToken(
  lmsToken: string,
  deps: LiveAdapterDeps = {}
): Promise<MoodleSiteInfo> {
  const raw = await callMoodleFunction(lmsToken, 'core_webservice_get_site_info', {}, deps);
  return parseMoodleSiteInfo(raw);
}

export async function verifyErpToken(
  erpToken: string,
  registerNumber: string,
  displayName?: string,
  lmsConnected = false,
  deps: LiveAdapterDeps = {}
): Promise<StudentProfile> {
  const config = getLiveAdapterConfig(deps.env);
  const raw = await fetchErpJson(config.erpPaths.profile, erpToken, registerNumber, deps);
  return parseErpProfile(raw, registerNumber, displayName, lmsConnected);
}

export async function fetchLiveProfile(
  session: StoredSession,
  deps: LiveAdapterDeps = {}
): Promise<StudentProfile> {
  const config = getLiveAdapterConfig(deps.env);
  if (session.erpToken && config.erpBaseUrl) {
    const raw = await fetchErpJson(config.erpPaths.profile, session.erpToken, session.registerNumber, deps);
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
  const raw = await fetchErpJson(config.erpPaths.attendance, session.erpToken, session.registerNumber, deps);
  return parseErpAttendance(raw);
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
  const raw = await fetchErpJson(config.erpPaths.timetable, session.erpToken, session.registerNumber, deps);
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
  const raw = await fetchErpJson(config.erpPaths.results, session.erpToken, session.registerNumber, deps);
  return parseErpResults(raw);
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

  let courseMap = new Map<number, { id: number; shortname: string; fullname: string }>();
  try {
    const rawCourses = await callMoodleFunction(
      session.lmsToken,
      'core_enrol_get_users_courses',
      { userid: userId },
      deps
    );
    courseMap = parseMoodleCourses(rawCourses);
  } catch {
    // Course list enrichment is optional; continue even if restricted on this Moodle instance.
  }

  try {
    const raw = await callMoodleFunction(
      session.lmsToken,
      'core_calendar_get_action_events_by_timesort',
      { timesortfrom: nowSec, limitnum: 50 },
      deps
    );
    return parseMoodleDeadlines(raw, courseMap);
  } catch (err) {
    if (err instanceof LiveUpstreamError && err.status === 401) throw err;
    const fallback = await callMoodleFunction(
      session.lmsToken,
      'core_calendar_get_calendar_upcoming_view',
      {},
      deps
    );
    return parseMoodleDeadlines(fallback, courseMap);
  }
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
    tasks.push(
      fetchErpJson(config.erpPaths.deadlines, session.erpToken, session.registerNumber, deps).then(
        parseErpDeadlines
      )
    );
  }

  if (tasks.length === 0) {
    throw new LiveUpstreamError(503, 'Neither ERP nor Moodle LMS is connected for deadlines.');
  }

  const settled = await Promise.allSettled(tasks);
  const combined: DeadlineItem[] = [];
  let firstError: unknown = null;

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      combined.push(...outcome.value);
    } else if (!firstError) {
      firstError = outcome.reason;
    }
  }

  if (combined.length === 0 && firstError) {
    throw firstError instanceof Error ? firstError : new LiveUpstreamError(502, 'Unable to fetch live deadlines.');
  }

  return deduplicateDeadlines(combined).items;
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

  try {
    const raw = await callMoodleFunction(
      session.lmsToken,
      'message_popup_get_popup_notifications',
      { useridto: userId, limit: 30, offset: 0 },
      deps
    );
    return parseMoodleNotifications(raw);
  } catch (err) {
    if (err instanceof LiveUpstreamError && err.status === 401) throw err;
    const fallback = await callMoodleFunction(
      session.lmsToken,
      'core_message_get_messages',
      { useridto: userId, useridfrom: 0, type: 'notifications', read: 0, newestfirst: 1, limitnum: 30 },
      deps
    );
    return parseMoodleNotifications(fallback);
  }
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
    tasks.push(
      fetchErpJson(config.erpPaths.notifications, session.erpToken, session.registerNumber, deps).then(
        parseErpNotifications
      )
    );
  }

  if (tasks.length === 0) {
    throw new LiveUpstreamError(503, 'Neither ERP nor Moodle LMS is connected for notifications.');
  }

  const settled = await Promise.allSettled(tasks);
  const combined: NotificationItem[] = [];
  let firstError: unknown = null;

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      combined.push(...outcome.value);
    } else if (!firstError) {
      firstError = outcome.reason;
    }
  }

  if (combined.length === 0 && firstError) {
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
