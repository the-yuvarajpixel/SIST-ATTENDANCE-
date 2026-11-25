import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttendanceView } from './components/AttendanceView';
import { CommandPalette } from './components/CommandPalette';
import { DeadlinesView } from './components/DeadlinesView';
import { NotificationsView } from './components/NotificationsView';
import { OverviewView, type SectionState } from './components/OverviewView';
import { ResultsView } from './components/ResultsView';
import { SetupHealthView } from './components/SetupHealthView';
import { Sidebar } from './components/Sidebar';
import { SignInView } from './components/SignInView';
import { TimetableView } from './components/TimetableView';
import { TopBar } from './components/TopBar';
import { computeOverallAttendance } from './core/attendance';
import type {
  AttendanceSubject,
  DeadlineItem,
  NavSection,
  NotificationItem,
  ResultsPayload,
  SectionEnvelope,
  SessionUser,
  StudentProfile,
  TimetableSlot,
} from './core/types';
import { api } from './lib/api';

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

function getInitialSection(): NavSection {
  if (typeof window !== 'undefined' && window.location.pathname === '/setup') {
    return 'setup';
  }
  return 'overview';
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [activeSection, setActiveSection] = useState<NavSection>(getInitialSection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signInInitialMode, setSignInInitialMode] = useState<'mock' | 'live' | undefined>(undefined);
  const [erpOutageSimulated, setErpOutageSimulated] = useState(false);

  const [attendanceTarget, setAttendanceTarget] = useState<number>(getInitialTarget);
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

  const requestVersions = useRef<Partial<Record<SectionKey, number>>>({});

  const loadSection = useCallback(async (section: SectionKey, refresh = false) => {
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
      case 'attendance':
        return run(api.getAttendance, setAttendance);
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
    if (user) {
      loadAllSections(false);
    }
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
    return (
      <SignInView
        theme={theme}
        initialMode={signInInitialMode}
        onToggleTheme={handleToggleTheme}
        onSignedIn={(signedUser) => {
          setSignInInitialMode(undefined);
          setUser(signedUser);
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
          refreshing={anyLoading}
          onToggleTheme={handleToggleTheme}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          onRefreshAll={() => loadAllSections(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="mx-auto max-w-6xl">
            {activeSection === 'overview' ? (
              <OverviewView
                profile={profile}
                attendance={attendance}
                timetable={timetable}
                results={results}
                deadlines={deadlines}
                notifications={notifications}
                completedDeadlineIds={completedDeadlineIds}
                readNotificationIds={readNotificationIds}
                attendanceTarget={attendanceTarget}
                onNavigate={setActiveSection}
                onRetrySection={(sec) => void loadSection(sec, true)}
              />
            ) : null}

            {activeSection === 'attendance' ? (
              <AttendanceView
                section={attendance}
                targetPercent={attendanceTarget}
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

            {activeSection === 'results' ? (
              <ResultsView
                section={results}
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
          </div>
        </main>
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
