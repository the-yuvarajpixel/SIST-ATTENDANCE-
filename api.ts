import type {
  AttendanceSubject,
  DataSourceMode,
  DeadlineItem,
  HealthReport,
  NotificationItem,
  ResultsPayload,
  SectionEnvelope,
  SessionUser,
  StudentProfile,
  TimetableSlot,
} from '../core/types';

export interface LoginInput {
  registerNumber: string;
  name?: string;
  mode: DataSourceMode;
  erpToken?: string;
  lmsToken?: string;
}

export interface LoginErrorResponse {
  error: string;
  fieldErrors?: Record<string, string>;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((payload as { error?: string } | null)?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      fieldErrors?: Record<string, string>;
    };
    err.status = res.status;
    err.fieldErrors = (payload as LoginErrorResponse | null)?.fieldErrors;
    throw err;
  }
  if (payload === null || typeof payload !== 'object') throw new Error('Invalid API response. Check server deployment.');
  return payload as T;
}

export const api = {
  getSession(autostart = false) {
    return requestJson<{ authenticated: boolean; user: SessionUser | null }>(
      `/api/session${autostart ? '?autostart=1' : ''}`
    );
  },

  login(input: LoginInput) {
    return requestJson<{ authenticated: boolean; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  logout() {
    return requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  getHealth(deep = false) {
    return requestJson<HealthReport>(`/api/health${deep ? '?deep=1' : ''}`);
  },

  setErpOutageSimulation(simulateErpOutage: boolean) {
    return requestJson<{ erpOutageSimulated: boolean }>('/api/portal/resilience', {
      method: 'POST',
      body: JSON.stringify({ simulateErpOutage }),
    });
  },

  getProfile(refresh = false) {
    return requestJson<SectionEnvelope<StudentProfile>>(`/api/portal/profile${refresh ? '?refresh=1' : ''}`);
  },

  getAttendance(refresh = false) {
    return requestJson<SectionEnvelope<AttendanceSubject[]>>(`/api/portal/attendance${refresh ? '?refresh=1' : ''}`);
  },

  getTimetable(refresh = false) {
    return requestJson<SectionEnvelope<TimetableSlot[]>>(`/api/portal/timetable${refresh ? '?refresh=1' : ''}`);
  },

  getResults(refresh = false) {
    return requestJson<SectionEnvelope<ResultsPayload>>(`/api/portal/results${refresh ? '?refresh=1' : ''}`);
  },

  getDeadlines(refresh = false) {
    return requestJson<SectionEnvelope<DeadlineItem[]>>(`/api/portal/deadlines${refresh ? '?refresh=1' : ''}`);
  },

  getNotifications(refresh = false) {
    return requestJson<SectionEnvelope<NotificationItem[]>>(`/api/portal/notifications${refresh ? '?refresh=1' : ''}`);
  },
};
