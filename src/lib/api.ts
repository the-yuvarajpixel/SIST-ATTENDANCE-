import type {
  AttendanceSubject,
  DataSourceMode,
  DeadlineItem,
  ErpCaeDirectSyncStatus,
  ErpUserRole,
  HealthReport,
  NotificationItem,
  PortalSyncReport,
  ResultsPayload,
  SectionEnvelope,
  SessionUser,
  StudentProfile,
  SubjectCaeMark,
  TimetableSlot,
} from '../core/types';

export interface LoginInput {
  registerNumber: string;
  name?: string;
  mode: DataSourceMode;
  erpRole?: ErpUserRole;
  erpToken?: string;
  erpUsername?: string;
  erpPassword?: string;
  lmsToken?: string;
  lmsUsername?: string;
  lmsPassword?: string;
}

export interface ConnectPortalsInput {
  registerNumber?: string;
  erpRole?: ErpUserRole;
  erpToken?: string;
  erpUsername?: string;
  erpPassword?: string;
  lmsToken?: string;
  lmsUsername?: string;
  lmsPassword?: string;
}

export interface LoginErrorResponse {
  error: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: SessionUser;
  warning?: string;
}

export interface ErpDirectCaeAuthInput {
  erpRole?: ErpUserRole;
  registerNumber?: string;
  erpUsername?: string;
  erpPassword?: string;
  erpToken?: string;
  semester?: number;
}

export type CaeUploadResponse = SectionEnvelope<ResultsPayload> & {
  erpSync?: ErpCaeDirectSyncStatus;
  user?: SessionUser;
};

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
      code?: string;
      fieldErrors?: Record<string, string>;
    };
    err.status = res.status;
    err.code = (payload as LoginErrorResponse | null)?.code;
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
    return requestJson<AuthSessionResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  logout() {
    return requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  connectPortals(input: ConnectPortalsInput) {
    return requestJson<AuthSessionResponse>('/api/auth/connect', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  syncPortals(endDate?: string) {
    return requestJson<PortalSyncReport>('/api/portal/sync', {
      method: 'POST',
      body: JSON.stringify(endDate ? { endDate } : {}),
    });
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

  getAttendance(refresh = false, endDate?: string) {
    const params = new URLSearchParams();
    if (refresh) params.set('refresh', '1');
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString();
    return requestJson<SectionEnvelope<AttendanceSubject[]>>(`/api/portal/attendance${qs ? `?${qs}` : ''}`);
  },

  getTimetable(refresh = false) {
    return requestJson<SectionEnvelope<TimetableSlot[]>>(`/api/portal/timetable${refresh ? '?refresh=1' : ''}`);
  },

  getResults(refresh = false) {
    return requestJson<SectionEnvelope<ResultsPayload>>(`/api/portal/results${refresh ? '?refresh=1' : ''}`);
  },

  uploadCaeMarks(
    marks: SubjectCaeMark[],
    mode: 'replace' | 'merge' = 'merge',
    options?: { syncToErp?: boolean; erpAuth?: ErpDirectCaeAuthInput }
  ) {
    return requestJson<CaeUploadResponse>('/api/portal/cae-marks', {
      method: 'POST',
      body: JSON.stringify({
        action: 'upload',
        mode,
        marks,
        syncToErp: Boolean(options?.syncToErp),
        ...(options?.erpAuth ?? {}),
      }),
    });
  },

  pullCaeMarksFromErp(mode: 'replace' | 'merge' = 'replace', erpAuth?: ErpDirectCaeAuthInput) {
    return requestJson<CaeUploadResponse>('/api/portal/cae-marks', {
      method: 'POST',
      body: JSON.stringify({
        action: 'erp-pull',
        mode,
        ...(erpAuth ?? {}),
      }),
    });
  },

  resetCaeMarks() {
    return requestJson<CaeUploadResponse>('/api/portal/cae-marks', {
      method: 'POST',
      body: JSON.stringify({ action: 'reset' }),
    });
  },

  getDeadlines(refresh = false) {
    return requestJson<SectionEnvelope<DeadlineItem[]>>(`/api/portal/deadlines${refresh ? '?refresh=1' : ''}`);
  },

  getNotifications(refresh = false) {
    return requestJson<SectionEnvelope<NotificationItem[]>>(`/api/portal/notifications${refresh ? '?refresh=1' : ''}`);
  },
};
