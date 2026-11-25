import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Link2,
  Lock,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type {
  AttendanceSubject,
  DeadlineItem,
  NavSection,
  NotificationItem,
  PortalSyncReport,
  ResultsPayload,
  SessionUser,
  StudentProfile,
  TimetableSlot,
} from '../core/types';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { SectionState } from './OverviewView';

interface PortalSyncViewProps {
  user: SessionUser;
  profile: SectionState<StudentProfile>;
  attendance: SectionState<AttendanceSubject[]>;
  timetable: SectionState<TimetableSlot[]>;
  results: SectionState<ResultsPayload>;
  deadlines: SectionState<DeadlineItem[]>;
  notifications: SectionState<NotificationItem[]>;
  syncing: boolean;
  lastReport: PortalSyncReport | null;
  onRunSync: () => Promise<void>;
  onPortalsConnected: (user: SessionUser) => Promise<void>;
  onRetrySection: (section: 'profile' | 'attendance' | 'timetable' | 'results' | 'deadlines' | 'notifications') => void;
  onNavigate: (section: NavSection) => void;
}

type PortalConnectMethod = 'credentials' | 'token';

const MOODLE_URL = 'https://sathyabama.cognibot.in';
const ERP_URL = 'https://erp.sathyabama.ac.in/account/login';

export function PortalSyncView({
  user,
  profile,
  attendance,
  timetable,
  results,
  deadlines,
  notifications,
  syncing,
  lastReport,
  onRunSync,
  onPortalsConnected,
  onRetrySection,
  onNavigate,
}: PortalSyncViewProps) {
  const [moodleMethod, setMoodleMethod] = useState<PortalConnectMethod>('credentials');
  const [erpMethod, setErpMethod] = useState<PortalConnectMethod>('credentials');
  const [registerNumber, setRegisterNumber] = useState(user.registerNumber);
  const [lmsUsername, setLmsUsername] = useState('');
  const [lmsPassword, setLmsPassword] = useState('');
  const [lmsToken, setLmsToken] = useState('');
  const [erpUsername, setErpUsername] = useState('');
  const [erpPassword, setErpPassword] = useState('');
  const [erpToken, setErpToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const moodleConnectedLive = user.mode === 'live' && user.lmsTokenPresent;
  const erpConnectedLive = user.mode === 'live' && user.erpTokenPresent;

  async function handleConnectSubmit(e: FormEvent) {
    e.preventDefault();
    setConnectError(null);
    setConnectMessage(null);
    setFieldErrors({});

    const trimmedReg = registerNumber.trim();
    const trimmedErpToken = erpToken.trim();
    const trimmedErpUser = erpUsername.trim();
    const trimmedLmsToken = lmsToken.trim();
    const trimmedLmsUser = lmsUsername.trim();
    const wantsMoodleCreds = moodleMethod === 'credentials' && Boolean(lmsPassword || trimmedLmsUser);
    const wantsMoodleToken = moodleMethod === 'token' && Boolean(trimmedLmsToken);
    const wantsErpCreds = erpMethod === 'credentials' && Boolean(erpPassword || trimmedErpUser);
    const wantsErpToken = erpMethod === 'token' && Boolean(trimmedErpToken);

    const nextErrors: Record<string, string> = {};
    if (!/^[A-Za-z0-9]{6,14}$/.test(trimmedReg)) {
      nextErrors.registerNumber = 'Enter a valid Register Number (6–14 letters or digits).';
    }
    if (!wantsMoodleCreds && !wantsMoodleToken && !wantsErpCreds && !wantsErpToken) {
      setConnectError('Enter your Moodle LMS or College ERP login credentials/tokens to connect.');
      return;
    }
    if (wantsMoodleCreds && !lmsPassword) {
      nextErrors.lmsPassword = 'Enter your Moodle LMS password to exchange for a token.';
    }
    if (wantsMoodleToken && trimmedLmsToken.length < 8) {
      nextErrors.lmsToken = 'Moodle LMS token must be at least 8 characters.';
    }
    if (wantsErpCreds && !erpPassword) {
      nextErrors.erpPassword = 'Enter your College ERP password.';
    }
    if (wantsErpToken && trimmedErpToken.length < 8) {
      nextErrors.erpToken = 'ERP token must be at least 8 characters.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setConnectError('Please fix the highlighted fields.');
      return;
    }

    setConnecting(true);
    try {
      const res = await api.connectPortals({
        registerNumber: trimmedReg,
        erpToken: wantsErpToken ? trimmedErpToken : undefined,
        erpUsername: wantsErpCreds ? trimmedErpUser || trimmedReg : undefined,
        erpPassword: wantsErpCreds ? erpPassword : undefined,
        lmsToken: wantsMoodleToken ? trimmedLmsToken : undefined,
        lmsUsername: wantsMoodleCreds ? trimmedLmsUser || trimmedReg : undefined,
        lmsPassword: wantsMoodleCreds ? lmsPassword : undefined,
      });
      setLmsPassword('');
      setLmsToken('');
      setErpPassword('');
      setErpToken('');
      await onPortalsConnected(res.user);
      const connectedNames = [
        res.user.lmsTokenPresent ? 'Moodle LMS' : null,
        res.user.erpTokenPresent ? 'College ERP' : null,
      ]
        .filter(Boolean)
        .join(' & ');
      setConnectMessage(`Connected ${connectedNames} and synced live data.`);
    } catch (err) {
      const eObj = err as Error & { fieldErrors?: Record<string, string> };
      setConnectError(eObj.message || 'Unable to connect portal credentials.');
      if (eObj.fieldErrors) setFieldErrors(eObj.fieldErrors);
    } finally {
      setConnecting(false);
    }
  }

  const sectionRows: {
    key: 'profile' | 'attendance' | 'timetable' | 'results' | 'deadlines' | 'notifications';
    label: string;
    portal: string;
    state: SectionState<unknown>;
    countLabel: string;
  }[] = [
    {
      key: 'profile',
      label: 'Student Profile',
      portal: erpConnectedLive ? 'College ERP' : user.mode === 'live' ? 'Moodle LMS' : 'College ERP',
      state: profile,
      countLabel: profile.envelope ? '1 profile' : '—',
    },
    {
      key: 'attendance',
      label: 'Attendance & Bunk Calculator',
      portal: 'College ERP',
      state: attendance,
      countLabel: attendance.envelope ? `${attendance.envelope.data.length} subjects` : '—',
    },
    {
      key: 'timetable',
      label: 'Weekly Timetable',
      portal: 'College ERP',
      state: timetable,
      countLabel: timetable.envelope ? `${timetable.envelope.data.length} slots` : '—',
    },
    {
      key: 'results',
      label: 'Results & CGPA History',
      portal: 'College ERP',
      state: results,
      countLabel: results.envelope ? `${results.envelope.data.semesters.length} semesters` : '—',
    },
    {
      key: 'deadlines',
      label: 'Deadlines & Assignments',
      portal: user.mode === 'live' && !erpConnectedLive ? 'Moodle LMS' : 'Moodle LMS + College ERP',
      state: deadlines,
      countLabel: deadlines.envelope ? `${deadlines.envelope.data.length} deadlines` : '—',
    },
    {
      key: 'notifications',
      label: 'Notifications & Circulars',
      portal: user.mode === 'live' && !erpConnectedLive ? 'Moodle LMS' : 'Moodle LMS + College ERP',
      state: notifications,
      countLabel: notifications.envelope ? `${notifications.envelope.data.length} notices` : '—',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Dual-Portal Sync Summary */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              Sync Moodle LMS &amp; College ERP
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Sync both Sathyabama portals together, or connect/refresh your Moodle LMS and College ERP tokens in place.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('live-guide')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Step-by-Step Guide
            </button>
            <button
              type="button"
              onClick={() => void onRunSync()}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {syncing ? 'Syncing LMS & ERP...' : 'Sync Moodle LMS & College ERP'}
            </button>
          </div>
        </div>

        {/* Two Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Moodle LMS Card */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sathyabama Moodle LMS
                </p>
                <a
                  href={MOODLE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 mt-0.5"
                >
                  sathyabama.cognibot.in
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </a>
              </div>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
                  moodleConnectedLive
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : user.mode === 'mock'
                      ? 'text-blue-700 dark:text-blue-400'
                      : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {moodleConnectedLive ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {moodleConnectedLive
                  ? 'Live Connected'
                  : user.mode === 'mock'
                    ? 'Sample Data'
                    : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {lastReport
                ? lastReport.moodle.message
                : moodleConnectedLive
                  ? 'Syncs live assignment deadlines, course events, and Moodle notifications.'
                  : 'Connect with Moodle Login or your Moodle web-service token below to sync live LMS deadlines and notices.'}
            </p>
          </div>

          {/* College ERP Card */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sathyabama College ERP
                </p>
                <a
                  href={ERP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 mt-0.5"
                >
                  erp.sathyabama.ac.in
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </a>
              </div>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
                  erpConnectedLive
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : user.mode === 'mock'
                      ? 'text-blue-700 dark:text-blue-400'
                      : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {erpConnectedLive ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {erpConnectedLive
                  ? 'Live Connected'
                  : user.mode === 'mock'
                    ? 'Sample Data'
                    : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {lastReport
                ? lastReport.erp.message
                : erpConnectedLive
                  ? 'Syncs live subject attendance, weekly timetable, semester CGPA results, and ERP circulars.'
                  : 'Paste your ERP Access-Token from erp.sathyabama.ac.in below to sync live attendance, timetable, and CGPA.'}
            </p>
          </div>
        </div>

        {lastReport ? (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Last synced {formatDateTime(lastReport.syncedAt)}
            </span>
            <span className="font-mono tabular-nums">
              Mode: {lastReport.mode} · {lastReport.sections.filter((s) => s.status === 'synced').length}/
              {lastReport.sections.length} sections fresh
            </span>
          </div>
        ) : null}
      </section>

      {/* Connect / Update Live Portal Credentials In-Place */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                Connect or Refresh Live Credentials
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Connect Moodle LMS, College ERP, or both at once. Existing live tokens are preserved when updating just one portal.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Passwords discarded · Tokens AES-256-GCM encrypted</span>
          </div>
        </div>

        <form onSubmit={handleConnectSubmit} className="mt-5 space-y-5" noValidate>
          {connectError ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
            >
              {connectError}
            </div>
          ) : null}

          {connectMessage ? (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{connectMessage}</span>
            </div>
          ) : null}

          <div className="max-w-xs">
            <label
              htmlFor="syncRegisterNumber"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Sathyabama Register Number
            </label>
            <input
              id="syncRegisterNumber"
              type="text"
              value={registerNumber}
              onChange={(e) => setRegisterNumber(e.target.value)}
              placeholder="e.g. 42110482"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            {fieldErrors.registerNumber ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.registerNumber}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Moodle LMS Inputs */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  1. Moodle LMS
                </p>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => setMoodleMethod('credentials')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      moodleMethod === 'credentials'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Moodle Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setMoodleMethod('token')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      moodleMethod === 'token'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Paste Token
                  </button>
                </div>
              </div>

              {moodleMethod === 'credentials' ? (
                <>
                  <div>
                    <label
                      htmlFor="syncLmsUsername"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Moodle Username (optional if same as Register Number)
                    </label>
                    <input
                      id="syncLmsUsername"
                      type="text"
                      value={lmsUsername}
                      onChange={(e) => setLmsUsername(e.target.value)}
                      placeholder={registerNumber.trim() || 'Register number or college email'}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                    {fieldErrors.lmsUsername ? (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsUsername}</p>
                    ) : null}
                  </div>
                  <div>
                    <label
                      htmlFor="syncLmsPassword"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Moodle LMS Password
                    </label>
                    <input
                      id="syncLmsPassword"
                      type="password"
                      value={lmsPassword}
                      onChange={(e) => setLmsPassword(e.target.value)}
                      placeholder="Exchanged once via sathyabama.cognibot.in"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                    {fieldErrors.lmsPassword ? (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsPassword}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div>
                  <label
                    htmlFor="syncLmsToken"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Moodle Web-Service Token
                  </label>
                  <input
                    id="syncLmsToken"
                    type="password"
                    value={lmsToken}
                    onChange={(e) => setLmsToken(e.target.value)}
                    placeholder="Paste Moodle mobile web service key"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                  {fieldErrors.lmsToken ? (
                    <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsToken}</p>
                  ) : null}
                </div>
              )}
            </div>

            {/* College ERP Inputs */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  2. College ERP
                </p>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => setErpMethod('credentials')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      erpMethod === 'credentials'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    ERP Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setErpMethod('token')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      erpMethod === 'token'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Paste Token
                  </button>
                </div>
              </div>

              {erpMethod === 'credentials' ? (
                <>
                  <div>
                    <label
                      htmlFor="syncErpUsername"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      ERP Username (optional if same as Register Number)
                    </label>
                    <input
                      id="syncErpUsername"
                      type="text"
                      value={erpUsername}
                      onChange={(e) => setErpUsername(e.target.value)}
                      placeholder={registerNumber.trim() || 'e.g. 42110482'}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                    {fieldErrors.erpUsername ? (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.erpUsername}</p>
                    ) : null}
                  </div>
                  <div>
                    <label
                      htmlFor="syncErpPassword"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      College ERP Password
                    </label>
                    <input
                      id="syncErpPassword"
                      type="password"
                      value={erpPassword}
                      onChange={(e) => setErpPassword(e.target.value)}
                      placeholder="Exchanged once via erp.sathyabama.ac.in"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                    {fieldErrors.erpPassword ? (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.erpPassword}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="syncErpToken"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      ERP Access-Token or Session Cookie
                    </label>
                    <input
                      id="syncErpToken"
                      type="password"
                      value={erpToken}
                      onChange={(e) => setErpToken(e.target.value)}
                      placeholder="Paste Access-Token, Bearer JWT, or session cookie"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                    {fieldErrors.erpToken ? (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.erpToken}</p>
                    ) : null}
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Quick tip: Sign in at{' '}
                    <a
                      href={ERP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      erp.sathyabama.ac.in
                    </a>
                    , press <span className="font-mono">F12</span> → <em>Application</em> → <em>Local Storage</em> → copy{' '}
                    <span className="font-mono text-slate-700 dark:text-slate-300">Access-Token</span>.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="submit"
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-5 py-2.5 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${connecting ? 'animate-spin' : ''}`} aria-hidden="true" />
              {connecting ? 'Connecting & Syncing...' : 'Connect & Sync Live'}
            </button>
          </div>
        </form>
      </section>

      {/* Per-Section Live Sync Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
            Synced Portal Datasets
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Each section syncs independently so Moodle LMS stays live even if College ERP is offline.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                <th className="px-5 py-3 font-medium">Dataset</th>
                <th className="px-5 py-3 font-medium">Portal Source</th>
                <th className="px-5 py-3 font-medium">Records</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {sectionRows.map((row) => {
                const isError = Boolean(row.state.error && !row.state.envelope);
                const isStale = Boolean(row.state.envelope?.stale);
                const isReady = Boolean(row.state.envelope && !row.state.envelope.stale);

                return (
                  <tr key={row.key}>
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.label}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-600 dark:text-slate-400">
                      {row.portal}
                    </td>
                    <td className="px-5 py-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.countLabel}
                    </td>
                    <td className="px-5 py-3">
                      {row.state.loading ? (
                        <span className="text-blue-700 dark:text-blue-400 font-medium">Syncing...</span>
                      ) : isReady ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {row.state.envelope?.mode === 'live' ? 'Synced live' : 'Ready (sample)'}
                        </span>
                      ) : isStale ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Cached fallback
                        </span>
                      ) : isError ? (
                        <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-medium">
                          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {row.state.error}
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">Pending</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onRetrySection(row.key)}
                        disabled={row.state.loading}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${row.state.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Sync
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
