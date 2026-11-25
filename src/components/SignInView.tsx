import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, ExternalLink, Info, Lock, Moon, Sun } from 'lucide-react';
import type { DataSourceMode, LiveAdaptersSummary, SessionUser } from '../core/types';
import { api } from '../lib/api';

interface SignInViewProps {
  theme: 'light' | 'dark';
  initialMode?: DataSourceMode;
  onToggleTheme: () => void;
  onSignedIn: (user: SessionUser) => void;
  onOpenGuide: () => void;
}

type LiveAuthMethod = 'moodle-login' | 'tokens';

export function SignInView({ theme, initialMode, onToggleTheme, onSignedIn, onOpenGuide }: SignInViewProps) {
  const [mode, setMode] = useState<DataSourceMode>(initialMode ?? 'mock');
  const [liveAuthMethod, setLiveAuthMethod] = useState<LiveAuthMethod>('moodle-login');
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const [liveAdapters, setLiveAdapters] = useState<LiveAdaptersSummary | null>(null);
  const [registerNumber, setRegisterNumber] = useState('');
  const [name, setName] = useState('');
  const [lmsUsername, setLmsUsername] = useState('');
  const [lmsPassword, setLmsPassword] = useState('');
  const [erpToken, setErpToken] = useState('');
  const [lmsToken, setLmsToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    const trimmedReg = registerNumber.trim();
    const trimmedErp = erpToken.trim();
    const trimmedLms = lmsToken.trim();
    const resolvedLmsUsername = (lmsUsername.trim() || trimmedReg).trim();

    if (!trimmedReg || !/^[A-Za-z0-9]{6,14}$/.test(trimmedReg)) {
      nextFieldErrors.registerNumber = 'Enter a valid Register Number (6–14 letters or digits).';
    }
    if (mode === 'live') {
      if (liveAuthMethod === 'moodle-login') {
        if (!resolvedLmsUsername) {
          nextFieldErrors.lmsUsername = 'Enter your Moodle LMS username or register number.';
        }
        if (!lmsPassword) {
          nextFieldErrors.lmsPassword = 'Enter your Moodle LMS password.';
        }
      } else {
        if (!trimmedErp && !trimmedLms) {
          nextFieldErrors.lmsToken = 'Paste your Moodle LMS token or ERP session token (at least one is required).';
        }
        if (trimmedLms && trimmedLms.length < 8) {
          nextFieldErrors.lmsToken = 'Moodle LMS token must be at least 8 characters.';
        }
      }
      if (trimmedErp && trimmedErp.length < 8) {
        nextFieldErrors.erpToken = 'ERP session token must be at least 8 characters.';
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
        registerNumber: trimmedReg,
        name: name.trim() || undefined,
        mode,
        erpToken: mode === 'live' && trimmedErp ? trimmedErp : undefined,
        lmsToken: mode === 'live' && liveAuthMethod === 'tokens' && trimmedLms ? trimmedLms : undefined,
        lmsUsername: mode === 'live' && liveAuthMethod === 'moodle-login' ? resolvedLmsUsername : undefined,
        lmsPassword: mode === 'live' && liveAuthMethod === 'moodle-login' ? lmsPassword : undefined,
      });
      setLmsPassword('');
      onSignedIn(res.user);
    } catch (err) {
      const eObj = err as Error & { fieldErrors?: Record<string, string> };
      setFormError(eObj.message || 'Sign in failed.');
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
  }

  const lmsHost = liveAdapters?.lmsHost ?? 'sathyabama.cognibot.in';
  const erpHost = liveAdapters?.erpHost ?? 'erp.sathyabama.ac.in';

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
              Sign in live with your Sathyabama Moodle LMS account or browser session tokens, or explore instantly with sample student data. Passwords are never saved; only verified tokens are encrypted in an HttpOnly cookie.
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
                  className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
                >
                  {formError}
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
                      <span>Live Portals Ready</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTokenGuide((v) => !v)}
                      aria-expanded={showTokenGuide}
                      className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                    >
                      Where to find tokens
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${showTokenGuide ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>

                  <div className="space-y-1 text-slate-600 dark:text-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <span>Moodle LMS</span>
                      <a
                        href={`https://${lmsHost}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-slate-800 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-400 truncate"
                      >
                        {lmsHost}
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>College ERP</span>
                      <a
                        href={`https://${erpHost}/account/login`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-slate-800 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-400 truncate"
                      >
                        {erpHost}
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                    </div>
                  </div>

                  {showTokenGuide ? (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-slate-600 dark:text-slate-400 leading-relaxed">
                      <p>
                        <strong className="text-slate-800 dark:text-slate-200">Moodle LMS:</strong> Use{' '}
                        <em>Moodle Login</em> below to fetch your token automatically, or sign in at{' '}
                        <span className="font-mono">{lmsHost}</span> → Profile → <em>Preferences</em> →{' '}
                        <em>Security keys</em> → copy <strong>Moodle mobile web service</strong>.
                      </p>
                      <p>
                        <strong className="text-slate-800 dark:text-slate-200">College ERP:</strong> Sign in at{' '}
                        <span className="font-mono">{erpHost}</span>, press <span className="font-mono">F12</span> →{' '}
                        <em>Network</em> (copy <span className="font-mono">Authorization</span> token) or{' '}
                        <em>Application → Cookies</em>.
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
                  <div className="flex items-center justify-between gap-2 pt-1">
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
                          setLiveAuthMethod('moodle-login');
                          setFieldErrors({});
                          setFormError(null);
                        }}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          liveAuthMethod === 'moodle-login'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Moodle Login
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLiveAuthMethod('tokens');
                          setFieldErrors({});
                          setFormError(null);
                        }}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          liveAuthMethod === 'tokens'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Paste Tokens
                      </button>
                    </div>
                  </div>

                  {liveAuthMethod === 'moodle-login' ? (
                    <>
                      <div>
                        <label
                          htmlFor="lmsUsername"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                        >
                          Moodle Username (leave blank to use Register Number)
                        </label>
                        <input
                          id="lmsUsername"
                          name="lmsUsername"
                          type="text"
                          autoComplete="username"
                          value={lmsUsername}
                          onChange={(e) => setLmsUsername(e.target.value)}
                          placeholder={registerNumber.trim() || 'e.g. 42110482 or college email'}
                          aria-invalid={Boolean(fieldErrors.lmsUsername)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        {fieldErrors.lmsUsername ? (
                          <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsUsername}</p>
                        ) : null}
                      </div>

                      <div>
                        <label
                          htmlFor="lmsPassword"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                        >
                          Moodle LMS Password
                        </label>
                        <input
                          id="lmsPassword"
                          name="lmsPassword"
                          type="password"
                          autoComplete="current-password"
                          value={lmsPassword}
                          onChange={(e) => setLmsPassword(e.target.value)}
                          placeholder="Exchanged once for a Moodle token (never stored)"
                          aria-invalid={Boolean(fieldErrors.lmsPassword)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        {fieldErrors.lmsPassword ? (
                          <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsPassword}</p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div>
                      <label
                        htmlFor="lmsToken"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Moodle LMS Web-Service Token
                      </label>
                      <input
                        id="lmsToken"
                        name="lmsToken"
                        type="password"
                        value={lmsToken}
                        onChange={(e) => setLmsToken(e.target.value)}
                        placeholder="Paste your Moodle web-service token"
                        aria-invalid={Boolean(fieldErrors.lmsToken)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                      {fieldErrors.lmsToken ? (
                        <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsToken}</p>
                      ) : null}
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="erpToken"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      ERP Session Token (optional — adds live attendance &amp; grades)
                    </label>
                    <input
                      id="erpToken"
                      name="erpToken"
                      type="password"
                      value={erpToken}
                      onChange={(e) => setErpToken(e.target.value)}
                      placeholder="Paste ERP bearer token or session cookie"
                      aria-invalid={Boolean(fieldErrors.erpToken)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                    {fieldErrors.erpToken ? (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.erpToken}</p>
                    ) : null}
                  </div>
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
                      ? 'Connecting live...'
                      : 'Signing in...'
                    : mode === 'live'
                      ? 'Connect Live'
                      : 'Open Dashboard'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
