import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Info, Lock, Moon, Sun } from 'lucide-react';
import type { DataSourceMode, LiveAdaptersSummary, SessionUser } from '../core/types';
import { api } from '../lib/api';

interface SignInViewProps {
  theme: 'light' | 'dark';
  initialMode?: DataSourceMode;
  onToggleTheme: () => void;
  onSignedIn: (user: SessionUser) => void;
}

export function SignInView({ theme, initialMode, onToggleTheme, onSignedIn }: SignInViewProps) {
  const [mode, setMode] = useState<DataSourceMode>(initialMode ?? 'mock');
  const [liveAdapters, setLiveAdapters] = useState<LiveAdaptersSummary | null>(null);
  const [registerNumber, setRegisterNumber] = useState('');
  const [name, setName] = useState('');
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

    if (!trimmedReg || !/^[A-Za-z0-9]{6,14}$/.test(trimmedReg)) {
      nextFieldErrors.registerNumber = 'Enter a valid Register Number (6–14 letters or digits).';
    }
    if (mode === 'live') {
      if (!trimmedErp && !trimmedLms) {
        nextFieldErrors.lmsToken = 'Paste your Moodle LMS token or ERP session token (at least one is required).';
      }
      if (trimmedErp && trimmedErp.length < 8) {
        nextFieldErrors.erpToken = 'ERP session token must be at least 8 characters.';
      }
      if (trimmedLms && trimmedLms.length < 8) {
        nextFieldErrors.lmsToken = 'Moodle LMS token must be at least 8 characters.';
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
        lmsToken: mode === 'live' && trimmedLms ? trimmedLms : undefined,
      });
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between">
        <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
          SIST Student Portal
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
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
              Connect live using your Moodle LMS web-service token or ERP session token, or explore instantly with sample student data. Tokens are verified server-side and encrypted in an HttpOnly cookie.
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
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3.5 py-3 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                    {liveAdapters?.lmsConfigured ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                    )}
                    <span>Live Upstream Endpoints</span>
                  </div>
                  <div className="space-y-1 text-slate-600 dark:text-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <span>Moodle LMS</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                        {liveAdapters?.lmsHost ?? 'sathyabama.cognibot.in'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>College ERP</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                        {liveAdapters?.erpHost ?? 'Not set (ERP_BASE_URL)'}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Connect with Moodle LMS alone for deadlines &amp; notifications, or add an ERP token when ERP_BASE_URL is configured.
                  </p>
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

              {mode === 'live' ? (
                <>
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

                  <div>
                    <label
                      htmlFor="erpToken"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      ERP Session Token (optional unless ERP_BASE_URL is configured)
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
              ) : null}

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
                      ? 'Verifying tokens...'
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
