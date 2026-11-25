import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, ExternalLink, Info, Lock, Moon, Sun } from 'lucide-react';
import type { DataSourceMode, LiveAdaptersSummary, SessionUser } from '../core/types';
import { api } from '../lib/api';
import { AppFooter } from './AppFooter';

interface SignInViewProps {
  theme: 'light' | 'dark';
  initialMode?: DataSourceMode;
  onToggleTheme: () => void;
  onSignedIn: (user: SessionUser, warning?: string) => void;
  onOpenGuide: () => void;
}

type LiveAuthMethod = 'auto-login' | 'direct-website';
type ErpInputMode = 'token' | 'password';

export function SignInView({ theme, initialMode, onToggleTheme, onSignedIn, onOpenGuide }: SignInViewProps) {
  const [mode, setMode] = useState<DataSourceMode>(initialMode ?? 'mock');
  const [liveAuthMethod, setLiveAuthMethod] = useState<LiveAuthMethod>('auto-login');
  const [erpInputMode, setErpInputMode] = useState<ErpInputMode>('token');
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const [liveAdapters, setLiveAdapters] = useState<LiveAdaptersSummary | null>(null);
  const [registerNumber, setRegisterNumber] = useState('');
  const [name, setName] = useState('');
  const [erpUsername, setErpUsername] = useState('');
  const [erpPassword, setErpPassword] = useState('');
  const [sameAsMoodle, setSameAsMoodle] = useState(false);
  const [lmsUsername, setLmsUsername] = useState('');
  const [lmsPassword, setLmsPassword] = useState('');
  const [erpToken, setErpToken] = useState('');
  const [lmsToken, setLmsToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrorCode, setFormErrorCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const erpTokenInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getHealth(false)
      .then((health) => {
        if (cancelled) return;
        if (health.liveAdapters) setLiveAdapters(health.liveAdapters);
        if (!initialMode && health.mode === 'live') {
          setMode('live');
        }
      })
      .catch(() => {
        // Ignore health probe errors on sign-in screen
      });
    return () => {
      cancelled = true;
    };
  }, [initialMode]);

  const lmsHost = liveAdapters?.lmsHost ?? 'sathyabama.cognibot.in';
  const erpHost = liveAdapters?.erpHost ?? 'erp.sathyabama.ac.in';
  const erpLoginUrl = `https://${erpHost}/account/login`;
  const lmsLoginUrl = `https://${lmsHost}/login/index.php`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormErrorCode(null);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    const rawReg = registerNumber.trim();
    const trimmedErpToken = erpToken.trim();
    const trimmedLmsToken = lmsToken.trim();
    const rawLmsUser = lmsUsername.trim();
    const rawErpUser = erpUsername.trim();

    // Auto-infer register number if the student typed it directly into ERP or Moodle username
    const inferredReg =
      rawReg ||
      (/^[A-Za-z0-9]{6,14}$/.test(rawErpUser) ? rawErpUser : '') ||
      (/^[A-Za-z0-9]{6,14}$/.test(rawLmsUser) ? rawLmsUser : '');

    const resolvedLmsUsername = (rawLmsUser || inferredReg).trim();
    const resolvedErpUsername = sameAsMoodle ? resolvedLmsUsername : (rawErpUser || inferredReg).trim();
    const effectiveErpPassword = sameAsMoodle ? lmsPassword : erpPassword;

    const wantsLmsAuto = liveAuthMethod === 'auto-login' && Boolean(lmsPassword || rawLmsUser);
    const wantsErpAuto =
      liveAuthMethod === 'auto-login' &&
      erpInputMode === 'password' &&
      (sameAsMoodle ? Boolean(lmsPassword) : Boolean(effectiveErpPassword || rawErpUser));
    const wantsErpToken =
      (liveAuthMethod === 'direct-website' || (liveAuthMethod === 'auto-login' && erpInputMode === 'token')) &&
      Boolean(trimmedErpToken);
    const wantsLmsToken = liveAuthMethod === 'direct-website' && Boolean(trimmedLmsToken);

    if (!inferredReg || !/^[A-Za-z0-9]{6,14}$/.test(inferredReg)) {
      nextFieldErrors.registerNumber = 'Enter a valid Register Number (6–14 letters or digits).';
    }
    if (mode === 'live') {
      if (liveAuthMethod === 'auto-login') {
        if (!wantsLmsAuto && !wantsErpAuto && !wantsErpToken) {
          nextFieldErrors.lmsPassword =
            'Enter your Moodle LMS password, paste your ERP Access-Token, or enter ERP credentials.';
        }
        if (wantsLmsAuto && !lmsPassword) {
          nextFieldErrors.lmsPassword = 'Enter your Moodle LMS password.';
        }
        if (wantsErpAuto && !effectiveErpPassword) {
          nextFieldErrors.erpPassword = 'Enter your College ERP password.';
        }
        if (wantsErpToken && trimmedErpToken.length < 8) {
          nextFieldErrors.erpToken = 'ERP Access-Token must be at least 8 characters.';
        }
      } else {
        if (!wantsErpToken && !wantsLmsToken) {
          nextFieldErrors.lmsToken =
            'Paste your Moodle LMS token or ERP Access-Token (at least one is required to sync).';
        }
        if (wantsLmsToken && trimmedLmsToken.length < 8) {
          nextFieldErrors.lmsToken = 'Moodle LMS token must be at least 8 characters.';
        }
        if (wantsErpToken && trimmedErpToken.length < 8) {
          nextFieldErrors.erpToken = 'ERP Access-Token must be at least 8 characters.';
        }
      }
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setFormError('Please fix the highlighted fields.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await api.login({
        registerNumber: inferredReg,
        name: name.trim() || undefined,
        mode,
        erpToken: mode === 'live' && wantsErpToken ? trimmedErpToken : undefined,
        erpUsername: mode === 'live' && wantsErpAuto ? resolvedErpUsername : undefined,
        erpPassword: mode === 'live' && wantsErpAuto ? effectiveErpPassword : undefined,
        lmsToken: mode === 'live' && wantsLmsToken ? trimmedLmsToken : undefined,
        lmsUsername: mode === 'live' && wantsLmsAuto ? resolvedLmsUsername : undefined,
        lmsPassword: mode === 'live' && wantsLmsAuto ? lmsPassword : undefined,
      });
      setErpPassword('');
      setLmsPassword('');
      onSignedIn(res.user, res.warning);
    } catch (err) {
      const eObj = err as Error & { code?: string; fieldErrors?: Record<string, string> };
      setFormError(eObj.message || 'Sign in failed.');
      setFormErrorCode(eObj.code ?? null);
      if (eObj.fieldErrors) setFieldErrors(eObj.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  function fillSampleStudent() {
    setMode('mock');
    setRegisterNumber('42110482');
    setName('Arjun Subramanian');
    setFieldErrors({});
    setFormError(null);
    setFormErrorCode(null);
  }

  function switchToErpTokenPaste() {
    setLiveAuthMethod('auto-login');
    setErpInputMode('token');
    setFieldErrors({});
    setFormError(null);
    setFormErrorCode(null);
    window.setTimeout(() => erpTokenInputRef.current?.focus(), 50);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between gap-4">
        <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 truncate">
          SIST Student Portal
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer whitespace-nowrap"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Live Login Guide
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-5 lg:pt-4">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
              Sathyabama ERP · Moodle LMS
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              One dashboard for attendance, CGPA, and deadlines.
            </h1>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Sign in live to sync your Sathyabama Moodle LMS and College ERP, open the official portals directly, or explore instantly with sample student data. Passwords are never saved; only verified tokens are encrypted in an HttpOnly cookie.
            </p>
            <ul className="space-y-2.5 pt-2 text-sm text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800">
              <li>Per-subject bunk calculator with 75%, 80%, and 85% targets</li>
              <li>Next-class preview combining your timetable with attendance</li>
              <li>Target CGPA calculator and Semester VI grade planner</li>
              <li>De-duplicated deadlines and searchable ERP + LMS circulars</li>
            </ul>
          </div>

          <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                  Sign in to your portal
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  AES-256-GCM encrypted HttpOnly session · 8-hour expiry
                </p>
              </div>
              <Lock className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
            </div>

            <div
              role="tablist"
              aria-label="Connection mode"
              className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'mock'}
                onClick={() => {
                  setMode('mock');
                  setFieldErrors({});
                  setFormError(null);
                  setFormErrorCode(null);
                }}
                className={`rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'mock'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Sample Data (Mock)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'live'}
                onClick={() => {
                  setMode('live');
                  setFieldErrors({});
                  setFormError(null);
                  setFormErrorCode(null);
                }}
                className={`rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'live'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Live ERP + LMS
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              {formError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-3 text-xs text-red-800 dark:text-red-300 space-y-2.5"
                >
                  <p className="leading-relaxed">{formError}</p>
                  {formErrorCode === 'erp_browser_login_required' ? (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <a
                        href={erpLoginUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                      >
                        Sign in on {erpHost}
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        onClick={switchToErpTokenPaste}
                        className="inline-flex items-center rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-red-800 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                      >
                        Paste ERP Access-Token instead
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {mode === 'live' ? (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3.5 py-3 text-xs space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                      {liveAdapters?.lmsConfigured !== false ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                      )}
                      <span>Official Sathyabama Portals</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTokenGuide((v) => !v)}
                      aria-expanded={showTokenGuide}
                      className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                    >
                      How sync works
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${showTokenGuide ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href={erpLoginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                    >
                      <span className="truncate">Sign in on College ERP</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </a>
                    <a
                      href={lmsLoginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                    >
                      <span className="truncate">Sign in on Moodle LMS</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  </div>

                  {showTokenGuide ? (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-slate-600 dark:text-slate-400 leading-relaxed">
                      <p>
                        <strong className="text-slate-800 dark:text-slate-200">Moodle LMS ({lmsHost}):</strong> Supports direct Auto Sign-In below using your Moodle username and password, or copy your security key from <em>Profile → Preferences → Security keys</em>.
                      </p>
                      <p>
                        <strong className="text-slate-800 dark:text-slate-200">College ERP ({erpHost}):</strong> Blocks external password sign-in for security. Click <em>Sign in on College ERP</em> above, log in normally, press <span className="font-mono">F12</span> → <em>Application → Local Storage</em> → copy <span className="font-mono">Access-Token</span>, and paste it below to sync attendance, timetable, and CGPA.
                      </p>
                      <button
                        type="button"
                        onClick={onOpenGuide}
                        className="inline-flex items-center gap-1 pt-1 text-blue-700 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                      >
                        Open full step-by-step guide
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="registerNumber"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Register Number
                </label>
                <input
                  id="registerNumber"
                  name="registerNumber"
                  type="text"
                  autoComplete="username"
                  value={registerNumber}
                  onChange={(e) => setRegisterNumber(e.target.value)}
                  placeholder="e.g. 42110482"
                  aria-invalid={Boolean(fieldErrors.registerNumber)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
                {fieldErrors.registerNumber ? (
                  <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.registerNumber}</p>
                ) : null}
              </div>

              {mode === 'mock' ? (
                <div>
                  <label
                    htmlFor="studentName"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Display Name (optional)
                  </label>
                  <input
                    id="studentName"
                    maxLength={100}
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Arjun Subramanian"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Live Sign-In Method
                    </span>
                    <div
                      role="group"
                      aria-label="Live sign-in method"
                      className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setLiveAuthMethod('auto-login');
                          setFieldErrors({});
                          setFormError(null);
                          setFormErrorCode(null);
                        }}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          liveAuthMethod === 'auto-login'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Auto Sign-In &amp; Sync
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLiveAuthMethod('direct-website');
                          setFieldErrors({});
                          setFormError(null);
                          setFormErrorCode(null);
                        }}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          liveAuthMethod === 'direct-website'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Direct Website &amp; Tokens
                      </button>
                    </div>
                  </div>

                  {liveAuthMethod === 'auto-login' ? (
                    <div className="space-y-3.5">
                      {/* Moodle LMS Auto-Login (works directly via sathyabama.cognibot.in/login/token.php) */}
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              Moodle LMS ({lmsHost})
                            </span>
                            <span className="ml-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              Auto-login supported
                            </span>
                          </div>
                          <a
                            href={lmsLoginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Open website
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="lmsUsername"
                              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                            >
                              Moodle Username
                            </label>
                            <input
                              id="lmsUsername"
                              name="lmsUsername"
                              type="text"
                              autoComplete="username"
                              value={lmsUsername}
                              onChange={(e) => setLmsUsername(e.target.value)}
                              placeholder={registerNumber.trim() || 'Reg no. or college email'}
                              aria-invalid={Boolean(fieldErrors.lmsUsername)}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            />
                            {fieldErrors.lmsUsername ? (
                              <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsUsername}</p>
                            ) : null}
                          </div>
                          <div>
                            <label
                              htmlFor="lmsPassword"
                              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                            >
                              Moodle Password
                            </label>
                            <input
                              id="lmsPassword"
                              name="lmsPassword"
                              type="password"
                              autoComplete="current-password"
                              value={lmsPassword}
                              onChange={(e) => setLmsPassword(e.target.value)}
                              placeholder="Never stored"
                              aria-invalid={Boolean(fieldErrors.lmsPassword)}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            />
                            {fieldErrors.lmsPassword ? (
                              <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsPassword}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* College ERP (Direct Website Token recommended, Password optional) */}
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              College ERP ({erpHost})
                            </span>
                            <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">
                              Attendance, Timetable &amp; CGPA
                            </span>
                          </div>
                          <div
                            role="group"
                            aria-label="College ERP sign-in method"
                            className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setErpInputMode('token');
                                setFieldErrors({});
                                setFormError(null);
                                setFormErrorCode(null);
                              }}
                              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                                erpInputMode === 'token'
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                              }`}
                            >
                              ERP Token
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setErpInputMode('password');
                                setFieldErrors({});
                                setFormError(null);
                                setFormErrorCode(null);
                              }}
                              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                                erpInputMode === 'password'
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                              }`}
                            >
                              ERP Password
                            </button>
                          </div>
                        </div>

                        {erpInputMode === 'token' ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                              <span>
                                Sathyabama ERP requires browser sign-in on its official site before syncing.
                              </span>
                              <a
                                href={erpLoginUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-400 hover:underline shrink-0"
                              >
                                Sign in on {erpHost}
                                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                              </a>
                            </div>
                            <div>
                              <label
                                htmlFor="autoErpToken"
                                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                              >
                                ERP Access-Token (optional if syncing Moodle first)
                              </label>
                              <input
                                ref={erpTokenInputRef}
                                id="autoErpToken"
                                name="erpToken"
                                type="password"
                                value={erpToken}
                                onChange={(e) => setErpToken(e.target.value)}
                                placeholder="Paste Access-Token from erp.sathyabama.ac.in Local Storage"
                                aria-invalid={Boolean(fieldErrors.erpToken)}
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                              />
                              {fieldErrors.erpToken ? (
                                <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.erpToken}</p>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={sameAsMoodle}
                                  onChange={(e) => setSameAsMoodle(e.target.checked)}
                                  className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
                                />
                                Same as Moodle login
                              </label>
                              <a
                                href={erpLoginUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                              >
                                Sign in on {erpHost}
                                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                              </a>
                            </div>

                            {sameAsMoodle ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Will attempt ERP sign-in with your Moodle username and password above. If {erpHost} requires direct browser sign-in, Moodle LMS will still connect and sync.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label
                                    htmlFor="erpUsername"
                                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                  >
                                    ERP Username
                                  </label>
                                  <input
                                    id="erpUsername"
                                    name="erpUsername"
                                    type="text"
                                    autoComplete="username"
                                    value={erpUsername}
                                    onChange={(e) => setErpUsername(e.target.value)}
                                    placeholder={registerNumber.trim() || 'Same as Register Number'}
                                    aria-invalid={Boolean(fieldErrors.erpUsername)}
                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                  />
                                  {fieldErrors.erpUsername ? (
                                    <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.erpUsername}</p>
                                  ) : null}
                                </div>
                                <div>
                                  <label
                                    htmlFor="erpPassword"
                                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                  >
                                    ERP Password
                                  </label>
                                  <input
                                    id="erpPassword"
                                    name="erpPassword"
                                    type="password"
                                    autoComplete="current-password"
                                    value={erpPassword}
                                    onChange={(e) => setErpPassword(e.target.value)}
                                    placeholder="Never stored"
                                    aria-invalid={Boolean(fieldErrors.erpPassword)}
                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                  />
                                  {fieldErrors.erpPassword ? (
                                    <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.erpPassword}</p>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="lmsToken"
                            className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                          >
                            Moodle LMS Web-Service Token
                          </label>
                          <a
                            href={lmsLoginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Sign in on {lmsHost}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        </div>
                        <input
                          id="lmsToken"
                          name="lmsToken"
                          type="password"
                          value={lmsToken}
                          onChange={(e) => setLmsToken(e.target.value)}
                          placeholder="Paste your Moodle mobile web service key"
                          aria-invalid={Boolean(fieldErrors.lmsToken)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        {fieldErrors.lmsToken ? (
                          <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsToken}</p>
                        ) : null}
                      </div>

                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="erpToken"
                            className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                          >
                            College ERP Access-Token (attendance, timetable &amp; CGPA)
                          </label>
                          <a
                            href={erpLoginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Sign in on {erpHost}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        </div>
                        <input
                          id="erpToken"
                          name="erpToken"
                          type="password"
                          value={erpToken}
                          onChange={(e) => setErpToken(e.target.value)}
                          placeholder="Paste ERP Access-Token, Bearer JWT, or session cookie"
                          aria-invalid={Boolean(fieldErrors.erpToken)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        {fieldErrors.erpToken ? (
                          <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors.erpToken}</p>
                        ) : null}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="pt-2 flex items-center justify-between gap-4">
                {mode === 'mock' ? (
                  <button
                    type="button"
                    onClick={fillSampleStudent}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Fill sample student (42110482)
                  </button>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex-1 min-w-0">
                    Verified live, encrypted in HttpOnly cookie, cleared on sign-out.
                  </span>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {submitting
                    ? mode === 'live'
                      ? 'Syncing live...'
                      : 'Signing in...'
                    : mode === 'live'
                      ? 'Connect & Sync Live'
                      : 'Open Dashboard'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}

