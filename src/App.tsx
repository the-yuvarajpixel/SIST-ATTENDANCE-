import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppFooter } from './components/AppFooter';
import { AttendanceView } from './components/AttendanceView';
import { CommandPalette } from './components/CommandPalette';
import { DeadlinesView } from './components/DeadlinesView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveLoginGuideView } from './components/LiveLoginGuideView';
import { MarksView } from './components/MarksView';
import { NotificationsView } from './components/NotificationsView';
import { OverviewView, type SectionState } from './components/OverviewView';
import { PortalSyncView, type AutoSyncIntervalMinutes } from './components/PortalSyncView';
import { ResultsView } from './components/ResultsView';
import { SetupHealthView } from './components/SetupHealthView';
import { Sidebar } from './components/Sidebar';
import { SignInView } from './components/SignInView';
import { TimetableView } from './components/TimetableView';
import { TopBar } from './components/TopBar';
import {
  computeOverallAttendance,
  getTodayLocalDateKey,
  normalizeAttendanceEndDate,
} from './core/attendance';
import type {
  AttendanceSubject,
  DeadlineItem,
  NavSection,
  NotificationItem,
  PortalSyncReport,
  ResultsPayload,
  SectionEnvelope,
  SessionUser,
  StudentProfile,
  SubjectCaeMark,
  TimetableSlot,
} from './core/types';
import { api, type CaeUploadResponse, type ErpDirectCaeAuthInput } from './lib/api';

type SectionKey =
  | 'profile'
  | 'attendance'
  | 'timetable'
  | 'results'
  | 'deadlines'
  | 'notifications';

function emptySection<T>(): SectionState<T> {
  return { envelope: null, loading: false, error: null };
}

function readStoredStringSet(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeStoredStringSet(key: string, set: Set<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Ignore storage quota errors in restricted frames
  }
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = window.localStorage.getItem('usp_theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Ignore storage errors
  }
  return 'light';
}

function getInitialTarget(): number {
  try {
    const stored = Number(window.localStorage.getItem('usp_attendance_target'));
    if (stored === 75 || stored === 80 || stored === 85) return stored;
  } catch {
    // Ignore storage errors
  }
  return 75;
}

function getInitialAutoSyncMinutes(): AutoSyncIntervalMinutes {
  try {
    const raw = window.localStorage.getItem('usp_auto_sync_minutes');
    if (raw === '0' || raw === '1' || raw === '5' || raw === '15') {
      return Number(raw) as AutoSyncIntervalMinutes;
    }
  } catch {
    // Ignore storage errors
  }
  return 5;
}

function getInitialSection(): NavSection {
  if (typeof window !== 'undefined') {
    if (window.location.pathname === '/setup') return 'setup';
    if (window.location.pathname === '/live-guide') return 'live-guide';
    if (window.location.pathname === '/sync') return 'sync';
    if (window.location.pathname === '/marks') return 'marks';
  }
  return 'overview';
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [activeSection, setActiveSection] = useState<NavSection>(getInitialSection);
  const [showPreLoginGuide, setShowPreLoginGuide] = useState<boolean>(
    () => typeof window !== 'undefined' && window.location.pathname === '/live-guide'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signInInitialMode, setSignInInitialMode] = useState<'mock' | 'live' | undefined>(undefined);
  const [erpOutageSimulated, setErpOutageSimulated] = useState(false);
  const [syncingPortals, setSyncingPortals] = useState(false);
  const [lastSyncReport, setLastSyncReport] = useState<PortalSyncReport | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [attendanceTarget, setAttendanceTarget] = useState<number>(getInitialTarget);
  const [attendanceEndDate, setAttendanceEndDate] = useState<string>(() => getTodayLocalDateKey());
  const [autoSyncMinutes, setAutoSyncMinutes] = useState<AutoSyncIntervalMinutes>(getInitialAutoSyncMinutes);
  const [nextAutoSyncAt, setNextAutoSyncAt] = useState<number | null>(null);
  const [completedDeadlineIds, setCompletedDeadlineIds] = useState<Set<string>>(() =>
    readStoredStringSet('usp_completed_deadlines')
  );
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() =>
    readStoredStringSet('usp_read_notifications')
  );

  const [profile, setProfile] = useState<SectionState<StudentProfile>>(emptySection);
  const [attendance, setAttendance] = useState<SectionState<AttendanceSubject[]>>(emptySection);
  const [timetable, setTimetable] = useState<SectionState<TimetableSlot[]>>(emptySection);
  const [results, setResults] = useState<SectionState<ResultsPayload>>(emptySection);
  const [deadlines, setDeadlines] = useState<SectionState<DeadlineItem[]>>(emptySection);
  const [notifications, setNotifications] = useState<SectionState<NotificationItem[]>>(emptySection);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('usp_theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('usp_attendance_target', String(attendanceTarget));
    } catch {
      // Ignore storage errors
    }
  }, [attendanceTarget]);

  useEffect(() => {
    try {
      window.localStorage.setItem('usp_auto_sync_minutes', String(autoSyncMinutes));
    } catch {
      // Ignore storage errors
    }
  }, [autoSyncMinutes]);

  const requestVersions = useRef<Partial<Record<SectionKey, number>>>({});
  const skipNextAutoLoad = useRef(false);
  const attendanceEndDateRef = useRef(attendanceEndDate);
  attendanceEndDateRef.current = attendanceEndDate;
  const syncInFlightRef = useRef(false);
  const lastSyncTimestampRef = useRef<number>(0);

  const loadSection = useCallback(async (section: SectionKey, refresh = false, endDateOverride?: string) => {
    const version = (requestVersions.current[section] ?? 0) + 1;
    requestVersions.current[section] = version;
    const isCurrent = () => requestVersions.current[section] === version;
    const run = async <T,>(
      fetcher: (r: boolean) => Promise<SectionEnvelope<T>>,
      setter: React.Dispatch<React.SetStateAction<SectionState<T>>>
    ) => {
      setter((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const envelope = await fetcher(refresh);
        if (!isCurrent()) return;
        setter({ envelope, loading: false, error: null });
      } catch (err) {
        if (!isCurrent()) return;
        const message = err instanceof Error ? err.message : 'Unable to fetch section data';
        setter((prev) => ({ ...prev, loading: false, error: message }));
      }
    };

    switch (section) {
      case 'profile':
        return run(api.getProfile, setProfile);
      case 'attendance': {
        const effectiveDate = endDateOverride ?? attendanceEndDateRef.current;
        return run((r) => api.getAttendance(r, effectiveDate), setAttendance);
      }
      case 'timetable':
        return run(api.getTimetable, setTimetable);
      case 'results':
        return run(api.getResults, setResults);
      case 'deadlines':
        return run(api.getDeadlines, setDeadlines);
      case 'notifications':
        return run(api.getNotifications, setNotifications);
    }
  }, []);

  const handleUploadCaeMarks = useCallback(
    async (
      marks: SubjectCaeMark[],
      mode: 'replace' | 'merge',
      options?: { syncToErp?: boolean; erpAuth?: ErpDirectCaeAuthInput }
    ): Promise<CaeUploadResponse> => {
      const response = await api.uploadCaeMarks(marks, mode, options);
      if (response.user) {
        skipNextAutoLoad.current = true;
        setUser(response.user);
      }
      setResults({ envelope: response, loading: false, error: null });
      return response;
    },
    []
  );

  const handlePullCaeMarksFromErp = useCallback(
    async (
      mode: 'replace' | 'merge',
      erpAuth?: ErpDirectCaeAuthInput
    ): Promise<CaeUploadResponse> => {
      const response = await api.pullCaeMarksFromErp(mode, erpAuth);
      if (response.user) {
        skipNextAutoLoad.current = true;
        setUser(response.user);
      }
      setResults({ envelope: response, loading: false, error: null });
      return response;
    },
    []
  );

  const handleResetCaeMarks = useCallback(async () => {
    const envelope = await api.resetCaeMarks();
    setResults({ envelope, loading: false, error: null });
  }, []);

  const loadAllSections = useCallback(
    (refresh = false) => {
      const keys: SectionKey[] = [
        'profile',
        'attendance',
        'timetable',
        'results',
        'deadlines',
        'notifications',
      ];
      keys.forEach((key) => {
        void loadSection(key, refresh);
      });
    },
    [loadSection]
  );

  // Bootstrap session and initial health status
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';

    async function bootstrap() {
      try {
        const [sessionRes, healthRes] = await Promise.all([
          api.getSession(autostart),
          api.getHealth(false).catch(() => null),
        ]);
        if (cancelled) return;
        if (healthRes) {
          setErpOutageSimulated(healthRes.erpOutageSimulated);
        }
        if (sessionRes.authenticated && sessionRes.user) {
          setUser(sessionRes.user);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch all 6 sections independently once authenticated
  useEffect(() => {
    if (!user) return;
    if (skipNextAutoLoad.current) {
      skipNextAutoLoad.current = false;
      return;
    }
    loadAllSections(false);
  }, [user, loadAllSections]);

  // Global Cmd+K / Ctrl+K shortcut for command palette
  useEffect(() => {
    if (!user) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleSignOut = useCallback(async (nextMode?: 'mock' | 'live') => {
    try {
      await api.logout();
    } finally {
      for (const key of Object.keys(requestVersions.current) as SectionKey[]) {
        requestVersions.current[key] = (requestVersions.current[key] ?? 0) + 1;
      }
      setSignInInitialMode(nextMode);
      setUser(null);
      setProfile(emptySection());
      setAttendance(emptySection());
      setTimetable(emptySection());
      setResults(emptySection());
      setDeadlines(emptySection());
      setNotifications(emptySection());
      setLastSyncReport(null);
      setAuthNotice(null);
      setPaletteOpen(false);
      setMobileMenuOpen(false);
    }
  }, []);

  const handleToggleCompleteDeadline = useCallback((id: string) => {
    setCompletedDeadlineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStoredStringSet('usp_completed_deadlines', next);
      return next;
    });
  }, []);

  const handleToggleReadNotification = useCallback((id: string) => {
    setReadNotificationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStoredStringSet('usp_read_notifications', next);
      return next;
    });
  }, []);

  const handleMarkAllRead = useCallback(() => {
    const allIds = (notifications.envelope?.data ?? []).map((n) => n.id);
    setReadNotificationIds((prev) => {
      const next = new Set([...prev, ...allIds]);
      writeStoredStringSet('usp_read_notifications', next);
      return next;
    });
  }, [notifications.envelope]);

  const handleToggleErpOutage = useCallback(
    async (next: boolean) => {
      const res = await api.setErpOutageSimulation(next);
      setErpOutageSimulated(res.erpOutageSimulated);
      loadAllSections(true);
    },
    [loadAllSections]
  );

  const handleSyncPortals = useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncingPortals(true);
    try {
      const report = await api.syncPortals(attendanceEndDateRef.current);
      lastSyncTimestampRef.current = Date.now();
      setLastSyncReport(report);
      if (autoSyncMinutes > 0) {
        setNextAutoSyncAt(Date.now() + autoSyncMinutes * 60_000);
      }
      // Reload all sections from the freshly populated cache
      loadAllSections(false);
    } catch {
      // Section-level errors surface independently when sections refresh
    } finally {
      syncInFlightRef.current = false;
      setSyncingPortals(false);
    }
  }, [autoSyncMinutes, loadAllSections]);

  const handleChangeAttendanceEndDate = useCallback(
    (nextRaw: string) => {
      const normalized = normalizeAttendanceEndDate(nextRaw);
      attendanceEndDateRef.current = normalized;
      setAttendanceEndDate(normalized);
      void loadSection('attendance', true, normalized);
    },
    [loadSection]
  );

  // Automatically advance the attendance end date day-by-day at midnight
  // AND trigger an End-of-Day (17:30 local) attendance update once per day so
  // both subject attendance and overall attendance stay current at the end of every day.
  const lastTrackedTodayRef = useRef<string>(getTodayLocalDateKey());
  const lastEndOfDaySyncDateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const checkDayAndEndOfDayRollover = () => {
      const nowLocal = new Date();
      const currentToday = getTodayLocalDateKey();

      // 1. New calendar day rollover (midnight)
      if (currentToday !== lastTrackedTodayRef.current) {
        const previousToday = lastTrackedTodayRef.current;
        lastTrackedTodayRef.current = currentToday;
        if (attendanceEndDateRef.current === previousToday) {
          attendanceEndDateRef.current = currentToday;
          setAttendanceEndDate(currentToday);
          void loadSection('attendance', true, currentToday);
        }
        return;
      }

      // 2. End-of-Day automatic update once daily after classes conclude (17:30 local)
      const pastEndOfDay =
        nowLocal.getHours() > 17 || (nowLocal.getHours() === 17 && nowLocal.getMinutes() >= 30);
      if (
        pastEndOfDay &&
        lastEndOfDaySyncDateRef.current !== currentToday &&
        attendanceEndDateRef.current === currentToday &&
        document.visibilityState === 'visible'
      ) {
        lastEndOfDaySyncDateRef.current = currentToday;
        void loadSection('attendance', true, currentToday);
      }
    };
    checkDayAndEndOfDayRollover();
    const intervalId = window.setInterval(checkDayAndEndOfDayRollover, 60_000);
    document.addEventListener('visibilitychange', checkDayAndEndOfDayRollover);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkDayAndEndOfDayRollover);
    };
  }, [user, loadSection]);

  // Automatic background sync across College ERP, Moodle LMS, and all 6 sections
  useEffect(() => {
    if (!user || autoSyncMinutes === 0) {
      setNextAutoSyncAt(null);
      return;
    }

    const intervalMs = autoSyncMinutes * 60_000;
    setNextAutoSyncAt(Date.now() + intervalMs);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void handleSyncPortals();
      }
    }, intervalMs);

    const handleResumeSync = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSyncTimestampRef.current >= 60_000) {
        void handleSyncPortals();
      }
    };

    document.addEventListener('visibilitychange', handleResumeSync);
    window.addEventListener('online', handleResumeSync);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleResumeSync);
      window.removeEventListener('online', handleResumeSync);
    };
  }, [user, autoSyncMinutes, handleSyncPortals]);

  const handlePortalsConnected = useCallback(
    async (nextUser: SessionUser) => {
      const switchedContext =
        !user || user.mode !== nextUser.mode || user.registerNumber !== nextUser.registerNumber;
      if (switchedContext) {
        setProfile(emptySection());
        setAttendance(emptySection());
        setTimetable(emptySection());
        setResults(emptySection());
        setDeadlines(emptySection());
        setNotifications(emptySection());
      }
      skipNextAutoLoad.current = true;
      setUser(nextUser);
      if (nextUser.erpTokenPresent) {
        setAuthNotice(null);
      }
      setSyncingPortals(true);
      try {
        const report = await api.syncPortals(attendanceEndDateRef.current);
        lastSyncTimestampRef.current = Date.now();
        setLastSyncReport(report);
        if (autoSyncMinutes > 0) {
          setNextAutoSyncAt(Date.now() + autoSyncMinutes * 60_000);
        }
        loadAllSections(false);
      } finally {
        setSyncingPortals(false);
      }
    },
    [autoSyncMinutes, loadAllSections, user]
  );

  const anyLoading =
    profile.loading ||
    attendance.loading ||
    timetable.loading ||
    results.loading ||
    deadlines.loading ||
    notifications.loading;

  const attendanceList = attendance.envelope?.data ?? [];
  const deadlineList = deadlines.envelope?.data ?? [];
  const notificationList = notifications.envelope?.data ?? [];

  const shortageCount = useMemo(
    () => computeOverallAttendance(attendanceList, attendanceTarget).shortageCount,
    [attendanceList, attendanceTarget]
  );

  const unreadCount = useMemo(
    () => notificationList.filter((n) => n.unread && !readNotificationIds.has(n.id)).length,
    [notificationList, readNotificationIds]
  );

  const erpDegraded = Boolean(
    erpOutageSimulated ||
      attendance.envelope?.stale ||
      timetable.envelope?.stale ||
      results.envelope?.stale
  );

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-3" aria-busy="true" aria-label="Loading portal session">
          <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) {
    if (showPreLoginGuide) {
      return (
        <LiveLoginGuideView
          standalone
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onBack={() => setShowPreLoginGuide(false)}
          onGoToLiveSignIn={() => {
            setSignInInitialMode('live');
            setShowPreLoginGuide(false);
          }}
        />
      );
    }

    return (
      <SignInView
        theme={theme}
        initialMode={signInInitialMode}
        onToggleTheme={handleToggleTheme}
        onOpenGuide={() => setShowPreLoginGuide(true)}
        onSignedIn={(signedUser, warning) => {
          setSignInInitialMode(undefined);
          setShowPreLoginGuide(false);
          setUser(signedUser);
          setAuthNotice(warning ?? null);
          setActiveSection('overview');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        user={user}
        profile={profile.envelope?.data ?? null}
        unreadCount={unreadCount}
        shortageCount={shortageCount}
        erpDegraded={erpDegraded}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSignOut={() => void handleSignOut()}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeSection={activeSection}
          theme={theme}
          refreshing={anyLoading || syncingPortals}
          onToggleTheme={handleToggleTheme}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          onOpenSync={() => setActiveSection('sync')}
          onRefreshAll={() => void handleSyncPortals()}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {authNotice ? (
              <div
                role="status"
                className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-3"
              >
                <p className="leading-relaxed flex-1 min-w-0">{authNotice}</p>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveSection('sync')}
                    className="font-medium underline cursor-pointer whitespace-nowrap"
                  >
                    Open Sync LMS &amp; ERP
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthNotice(null)}
                    className="text-amber-800/80 dark:text-amber-300/80 hover:text-amber-950 dark:hover:text-amber-100 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

            <ErrorBoundary resetKey={activeSection} sectionLabel={activeSection}>
              {activeSection === 'overview' ? (
                <OverviewView
                  user={user}
                  profile={profile}
                  attendance={attendance}
                  timetable={timetable}
                  results={results}
                  deadlines={deadlines}
                  notifications={notifications}
                  completedDeadlineIds={completedDeadlineIds}
                  readNotificationIds={readNotificationIds}
                  attendanceTarget={attendanceTarget}
                  attendanceEndDate={attendanceEndDate}
                  onChangeAttendanceEndDate={handleChangeAttendanceEndDate}
                  syncingPortals={syncingPortals}
                  lastSyncReport={lastSyncReport}
                  onSyncPortals={() => void handleSyncPortals()}
                  onChangeAttendanceTarget={setAttendanceTarget}
                  onNavigate={setActiveSection}
                  onRetrySection={(sec) => void loadSection(sec, true)}
                />
              ) : null}

              {activeSection === 'attendance' ? (
                <AttendanceView
                  section={attendance}
                  timetable={timetable.envelope?.data ?? []}
                  targetPercent={attendanceTarget}
                  endDate={attendanceEndDate}
                  onChangeEndDate={handleChangeAttendanceEndDate}
                  onChangeTarget={setAttendanceTarget}
                  onRetry={() => void loadSection('attendance', true)}
                />
              ) : null}

            {activeSection === 'timetable' ? (
              <TimetableView
                timetable={timetable}
                attendance={attendance}
                attendanceTarget={attendanceTarget}
                onRetry={() => {
                  void loadSection('timetable', true);
                  void loadSection('attendance', true);
                }}
              />
            ) : null}

            {activeSection === 'marks' ? (
              <MarksView
                section={results}
                user={user}
                onNavigate={setActiveSection}
                onRetry={() => void loadSection('results', true)}
                onUploadCaeMarks={handleUploadCaeMarks}
                onPullCaeMarksFromErp={handlePullCaeMarksFromErp}
                onResetCaeMarks={handleResetCaeMarks}
              />
            ) : null}

            {activeSection === 'results' ? (
              <ResultsView
                section={results}
                onNavigate={setActiveSection}
                onRetry={() => void loadSection('results', true)}
              />
            ) : null}

            {activeSection === 'deadlines' ? (
              <DeadlinesView
                section={deadlines}
                completedIds={completedDeadlineIds}
                onToggleComplete={handleToggleCompleteDeadline}
                onRetry={() => void loadSection('deadlines', true)}
              />
            ) : null}

            {activeSection === 'notifications' ? (
              <NotificationsView
                section={notifications}
                readIds={readNotificationIds}
                onToggleRead={handleToggleReadNotification}
                onMarkAllRead={handleMarkAllRead}
                onRetry={() => void loadSection('notifications', true)}
              />
            ) : null}

            {activeSection === 'sync' ? (
              <PortalSyncView
                user={user}
                profile={profile}
                attendance={attendance}
                timetable={timetable}
                results={results}
                deadlines={deadlines}
                notifications={notifications}
                syncing={syncingPortals}
                lastReport={lastSyncReport}
                attendanceEndDate={attendanceEndDate}
                autoSyncMinutes={autoSyncMinutes}
                nextAutoSyncAt={nextAutoSyncAt}
                onChangeAutoSyncMinutes={setAutoSyncMinutes}
                onRunSync={handleSyncPortals}
                onPortalsConnected={handlePortalsConnected}
                onRetrySection={(sec) => void loadSection(sec, true)}
                onNavigate={setActiveSection}
              />
            ) : null}

            {activeSection === 'live-guide' ? (
              <LiveLoginGuideView
                onGoToLiveSignIn={() => void handleSignOut('live')}
              />
            ) : null}

              {activeSection === 'setup' ? (
                <SetupHealthView
                  user={user}
                  erpOutageSimulated={erpOutageSimulated}
                  onToggleErpOutage={handleToggleErpOutage}
                  onNavigate={setActiveSection}
                  onRefreshAll={() => loadAllSections(true)}
                  onSwitchToLiveSignIn={() => void handleSignOut('live')}
                />
              ) : null}
            </ErrorBoundary>
          </div>
        </main>
        <AppFooter />
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={setActiveSection}
        onToggleTheme={handleToggleTheme}
        onRefreshAll={() => loadAllSections(true)}
        subjects={attendanceList}
        deadlines={deadlineList}
        notifications={notificationList}
      />
    </div>
  );
}
