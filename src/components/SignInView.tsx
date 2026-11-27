import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { ArrowLeft, BookOpen, Check, CheckCircle2, ChevronDown, ClipboardPaste, Copy, ExternalLink, Info, Lock, Moon, Presentation, Sun, Zap } from 'lucide-react';
import {
  ERP_CONSOLE_COPY_SNIPPET,
  extractErpAccessToken,
  formatExtractedTokenSummary,
} from '../core/erpTokenHelper';
import type { DataSourceMode, ErpUserRole, LiveAdaptersSummary, SessionUser } from '../core/types';
import { api } from '../lib/api';
import { AppFooter } from './AppFooter';
import { PasswordInput } from './PasswordInput';

interface SignInViewProps {
  theme: 'light' | 'dark';
  initialMode?: DataSourceMode;
  onToggleTheme: () => void;
  onSignedIn: (user: SessionUser, warning?: string) => void;
  onOpenGuide: () => void;
  onBackToWelcome?: () => void;
  onOpenPresentation?: () => void;
}

type LiveAuthMethod = 'auto-login' | 'direct-website';

const ERP_ROLES: {
  id: ErpUserRole;
  label: string;
  idLabel: string;
  idPlaceholder: string;
  helper: string;
}[] = [
  {
    id: 'student',
    label: 'Student',
    idLabel: 'Register Number',
    idPlaceholder: 'e.g. 42110482',
    helper: 'Current Sathyabama students (UG / PG / PhD)',
  },
  {
    id: 'staff',
    label: 'Staff',
    idLabel: 'Official Email or Staff ID',
    idPlaceholder: 'e.g. faculty@sathyabama.ac.in',
    helper: 'Faculty & staff (official @sathyabama.ac.in email)',
  },
  {
    id: 'new-admission',
    label: 'New Admission',
    idLabel: 'Application Number',
    idPlaceholder: 'e.g. ADM2026041',
    helper: 'Newly admitted applicants & first-year onboarding',
  },
  {
    id: 'parent',
    label: 'Parent',
    idLabel: 'Student Reg. No. / Parent ID',
    idPlaceholder: 'e.g. 42110482',
    helper: 'Parent portal linked to student register number',
  },
];

const PORTAL_ID_REGEX = /^[A-Za-z0-9_-]{4,20}$/;
const STAFF_EMAIL_REGEX = /^[A-Za-z0-9._%+-]{2,64}@[A-Za-z0-9.-]{2,80}\.[A-Za-z]{2,12}$/;

function isValidPortalId(id: string, role: ErpUserRole): boolean {
  if (PORTAL_ID_REGEX.test(id)) return true;
  return role === 'staff' && STAFF_EMAIL_REGEX.test(id);
}

function cleanPastedToken(raw: string): string {
  const extracted = extractErpAccessToken(raw);
  return extracted.token ?? raw.trim().replace(/^["']+|["']+$/g, '').trim();
}

export function SignInView({
  theme,
  initialMode,
  onToggleTheme,
  onSignedIn,
  onOpenGuide,
  onBackToWelcome,
  onOpenPresentation,
}: SignInViewProps) {
  const [mode, setMode] = useState<DataSourceMode>(initialMode ?? 'mock');
  const [liveAuthMethod, setLiveAuthMethod] = useState<LiveAuthMethod>('auto-login');
  const [erpRole, setErpRole] = useState<ErpUserRole>('student');
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const [showOptionalErpToken, setShowOptionalErpToken] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [awaitingErpReturn, setAwaitingErpReturn] = useState(false);
  const [showReturnBanner, setShowReturnBanner] = useState(false);
  const [liveAdapters, setLiveAdapters] = useState<LiveAdaptersSummary | null>(null);
  const [registerNumber, setRegisterNumber] = useState('');
  const [name, setName] = useState('');
  const [erpUsername, setErpUsername] = useState('');
  const [erpPassword, setErpPassword] = useState('');
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

  useEffect(() => {
    if (!awaitingErpReturn) return;
    const handleReturn = () => {
      if (document.visibilityState === 'hidden') return;
      setAwaitingErpReturn(false);
      setShowReturnBanner(true);
      setShowOptionalErpToken(true);
      setMode('live');
    };
    window.addEventListener('focus', handleReturn);
    document.addEventListener('visibilitychange', handleReturn);
    return () => {
      window.removeEventListener('focus', handleReturn);
      document.removeEventListener('visibilitychange', handleReturn);
    };
  }, [awaitingErpReturn]);

  const roleMeta = ERP_ROLES.find((r) => r.id === erpRole) ?? ERP_ROLES[0];
  const lmsHost = liveAdapters?.lmsHost ?? 'sathyabama.cognibot.in';
  const erpHost = liveAdapters?.erpHost ?? 'erp.sathyabama.ac.in';
  const erpLoginUrl = `https://${erpHost}/account/login`;
  const lmsLoginUrl = `https://${lmsHost}/login/index.php`;

  function markErpPortalOpened() {
    setAwaitingErpReturn(true);
    setShowOptionalErpToken(true);
  }

  async function copyTokenSnippet() {
    setClipboardNotice(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ERP_CONSOLE_COPY_SNIPPET);
        setCopiedSnippet(true);
        setClipboardNotice(
          `Copied 1-line command. On ${erpHost}, press F12 → Console → paste & press Enter, then return here and click Paste & Auto-Sync.`
        );
        window.setTimeout(() => setCopiedSnippet(false), 3000);
        return;
      }
    } catch {
      // Fallback notice below
    }
    setClipboardNotice(`Run in ${erpHost} Console (F12): ${ERP_CONSOLE_COPY_SNIPPET}`);
  }

  async function runDirectErpTokenAutoSync(rawText: string) {
    const extracted = extractErpAccessToken(rawText);
    if (!extracted.token) {
      setClipboardNotice(
        `No valid ERP Access-Token found. Sign in on ${erpHost}, run the 1-line command in Console, and try again.`
      );
      return;
    }

    const cleanToken = extracted.token;
    setErpToken(cleanToken);
    setShowOptionalErpToken(true);
    setShowReturnBanner(false);
    setFormError(null);
    setFormErrorCode(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.erpToken;
      delete next.erpPassword;
      return next;
    });

    const resolvedReg =
      registerNumber.trim() ||
      (isValidPortalId(erpUsername.trim(), erpRole) ? erpUsername.trim() : '') ||
      (extracted.registerNumber && isValidPortalId(extracted.registerNumber, erpRole)
        ? extracted.registerNumber
        : '');

    if (extracted.registerNumber && !registerNumber.trim() && isValidPortalId(extracted.registerNumber, erpRole)) {
      setRegisterNumber(extracted.registerNumber);
    }

    if (!resolvedReg || !isValidPortalId(resolvedReg, erpRole)) {
      setClipboardNotice(
        `${formatExtractedTokenSummary(extracted)} — enter your ${roleMeta.idLabel} above and click Login & Sync Portal.`
      );
      return;
    }

    setClipboardNotice(`${formatExtractedTokenSummary(extracted)} — verifying & syncing all ERP data now...`);
    setSubmitting(true);
    try {
      const trimmedLmsToken = cleanPastedToken(lmsToken);
      const wantsLmsAuto = liveAuthMethod === 'auto-login' && Boolean(lmsPassword);
      const wantsLmsToken = liveAuthMethod === 'direct-website' && trimmedLmsToken.length >= 8;
      const res = await api.login({
        registerNumber: resolvedReg,
        name: name.trim() || extracted.studentName || undefined,
        mode: 'live',
        erpRole,
        erpToken: cleanToken,
        lmsToken: wantsLmsToken ? trimmedLmsToken : undefined,
        lmsUsername: wantsLmsAuto ? (lmsUsername.trim() || resolvedReg) : undefined,
        lmsPassword: wantsLmsAuto ? lmsPassword : undefined,
      });
      setErpPassword('');
      setLmsPassword('');
      onSignedIn(res.user, res.warning);
    } catch (err) {
      const eObj = err as Error & { code?: string; fieldErrors?: Record<string, string> };
      setFormError(eObj.message || 'ERP Access-Token sync failed.');
      setFormErrorCode(eObj.code ?? null);
      if (eObj.fieldErrors) setFieldErrors(eObj.fieldErrors);
      setClipboardNotice(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormErrorCode(null);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    const rawReg = registerNumber.trim();
    const trimmedErpToken = cleanPastedToken(erpToken);
    const trimmedLmsToken = cleanPastedToken(lmsToken);
    const rawLmsUser = lmsUsername.trim();
    const rawErpUser = erpUsername.trim();

    // Auto-infer register/staff ID if typed into ERP or Moodle ID input
    const inferredReg =
      rawReg ||
      (isValidPortalId(rawErpUser, erpRole) ? rawErpUser : '') ||
      (isValidPortalId(rawLmsUser, erpRole) ? rawLmsUser : '');

    const resolvedErpUsername = (rawErpUser || inferredReg).trim();
    const resolvedLmsUsername = (rawLmsUser || inferredReg).trim();

    const wantsErpToken = Boolean(trimmedErpToken);
    const wantsErpAuto =
      liveAuthMethod === 'auto-login' && !wantsErpToken && Boolean(erpPassword || rawErpUser);
    const wantsLmsAuto = liveAuthMethod === 'auto-login' && Boolean(lmsPassword || rawLmsUser);
    const wantsLmsToken = liveAuthMethod === 'direct-website' && Boolean(trimmedLmsToken);

    if (!inferredReg || !isValidPortalId(inferredReg, erpRole)) {
      nextFieldErrors.registerNumber =
        erpRole === 'staff'
          ? 'Enter a valid official email (e.g. faculty@sathyabama.ac.in) or staff ID.'
          : `Enter a valid ${roleMeta.idLabel} (4–20 letters or digits).`;
    }

    if (mode === 'live') {
      if (liveAuthMethod === 'auto-login') {
        if (!wantsErpAuto && !wantsErpToken && !wantsLmsAuto) {
          nextFieldErrors.erpPassword =
            'Enter your ERP password, paste an optional ERP Access-Token, or enter your Moodle LMS password.';
        }
        if (wantsErpAuto && !erpPassword) {
          nextFieldErrors.erpPassword = `Enter your ${roleMeta.label} ERP password (or paste an ERP Access-Token below).`;
        }
        if (wantsLmsAuto && !lmsPassword) {
          nextFieldErrors.lmsPassword = 'Enter your Moodle LMS password.';
        }
        if (wantsErpToken && trimmedErpToken.length < 8) {
          nextFieldErrors.erpToken = 'ERP Access-Token must be at least 8 characters.';
        }
      } else {
        if (!wantsErpToken && !wantsLmsToken) {
          nextFieldErrors.erpToken =
            'Paste your ERP Access-Token or Moodle LMS token (at least one is required to sync).';
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
        erpRole,
        erpToken: mode === 'live' && wantsErpToken ? trimmedErpToken : undefined,
        erpUsername: mode === 'live' && wantsErpAuto ? resolvedErpUsername : undefined,
        erpPassword: mode === 'live' && wantsErpAuto ? erpPassword : undefined,
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
      if (eObj.code === 'erp_browser_login_required') {
        setShowOptionalErpToken(true);
      }
      if (eObj.fieldErrors) setFieldErrors(eObj.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  function fillSampleStudent() {
    setMode('mock');
    setErpRole('student');
    setRegisterNumber('42110482');
    setName('Arjun Subramanian');
    setFieldErrors({});
    setFormError(null);
    setFormErrorCode(null);
  }

  async function pasteErpTokenFromClipboard() {
    setClipboardNotice(null);
    if (!navigator.clipboard?.readText) {
      setClipboardNotice('Clipboard read is unavailable in this browser — press Ctrl+V / Cmd+V in the token box to auto-sync.');
      erpTokenInputRef.current?.focus();
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      await runDirectErpTokenAutoSync(text);
    } catch {
      setClipboardNotice('Allow clipboard permission or press Ctrl+V / Cmd+V in the token box to auto-sync.');
      erpTokenInputRef.current?.focus();
    }
  }

  function handleErpTokenPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData?.getData('text');
    if (!pasted) return;
    const extracted = extractErpAccessToken(pasted);
    if (extracted.token) {
      e.preventDefault();
      void runDirectErpTokenAutoSync(pasted);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToWelcome ? (
            <button
              type="button"
              onClick={onBackToWelcome}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Welcome</span>
            </button>
          ) : null}
          <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 truncate">
            SIST-attendance · SIST Student Portal
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenPresentation ? (
            <button
              type="button"
              onClick={onOpenPresentation}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Presentation className="h-3.5 w-3.5" aria-hidden="true" />
              <span>8-Slide Deck</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer whitespace-nowrap"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Live Login Guide</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
            <span className="hidden md:inline">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
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
              Login through Sathyabama ERP as Student, Staff, New Admission, or Parent, sync your Moodle LMS alongside it, or explore with sample data. Passwords are never saved; only verified tokens are encrypted in an HttpOnly cookie.
            </p>
            <ul className="space-y-2.5 pt-2 text-sm text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800">
              <li>Role-aware ERP sign-in (Student, Staff, New Admission, Parent)</li>
              <li>Attendance &amp; bunk calculator updated by custom end date</li>
              <li>Interactive future-semester CGPA planner &amp; CAE marks trends</li>
              <li>Auto-update across College ERP, Moodle LMS, and all datasets</li>
            </ul>
          </div>

          <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                  Sign in to your portal
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  AES-256-GCM encrypted HttpOnly session · Auto-syncs ERP &amp; LMS
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
              {showReturnBanner && mode === 'live' ? (
                <div
                  role="status"
                  className="rounded-lg border border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/35 px-3.5 py-3 text-xs text-blue-950 dark:text-blue-100 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-relaxed">
                      Signed in on <span className="font-mono">{erpHost}</span>? Click below to paste your Access-Token and auto-sync all ERP data immediately.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowReturnBanner(false)}
                      className="text-[11px] font-medium text-blue-700 dark:text-blue-300 hover:underline shrink-0 cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void pasteErpTokenFromClipboard()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                      Paste &amp; Auto-Sync ERP Now
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyTokenSnippet()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-blue-800 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
                    >
                      {copiedSnippet ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                      {copiedSnippet ? 'Copied 1-Line Command' : 'Copy 1-Line Token Command'}
                    </button>
                  </div>
                </div>
              ) : null}

              {formError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-3 text-xs text-red-800 dark:text-red-300 space-y-2.5"
                >
                  <p className="leading-relaxed">{formError}</p>
                  {formErrorCode === 'erp_browser_login_required' ? (
                    <div className="space-y-2 pt-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={erpLoginUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={markErpPortalOpened}
                          className="inline-flex items-center gap-1.5 rounded-md bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                        >
                          1. Login on {erpHost}
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void copyTokenSnippet()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-red-800 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                        >
                          {copiedSnippet ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />}
                          {copiedSnippet ? '2. Command Copied' : '2. Copy Token Command'}
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void pasteErpTokenFromClipboard()}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
                          3. Paste &amp; Auto-Sync
                        </button>
                      </div>
                      <p className="text-[11px] text-red-700/90 dark:text-red-300/90 leading-relaxed">
                        Once verified, your encrypted session automatically syncs attendance, timetable, CAE marks, results &amp; notices directly on this website without repeating login.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* ERP Account Type Selector (Student / Staff / New Admission / Parent) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    ERP Account Type
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {roleMeta.helper}
                  </span>
                </div>
                <div
                  role="radiogroup"
                  aria-label="ERP account type"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 p-1"
                >
                  {ERP_ROLES.map((item) => {
                    const active = erpRole === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setErpRole(item.id);
                          setFieldErrors({});
                        }}
                        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

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
                      onClick={markErpPortalOpened}
                      className="inline-flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                    >
                      <span className="truncate">Login on College ERP</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </a>
                    <a
                      href={lmsLoginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                    >
                      <span className="truncate">Login on Moodle LMS</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  </div>

                  {showTokenGuide ? (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-slate-600 dark:text-slate-400 leading-relaxed">
                      <p>
                        <strong className="text-slate-800 dark:text-slate-200">Automatic College ERP ({erpHost}):</strong> Choose Student, Staff, New Admission, or Parent and enter your ID and ERP password. The server signs into {erpHost} automatically and encrypts your session token in an HttpOnly cookie.
                      </p>
                      <p>
                        <strong className="text-slate-800 dark:text-slate-200">Moodle LMS ({lmsHost}):</strong> Enter your Moodle username and password below to auto-sync deadlines and course notices alongside ERP.
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
                  {roleMeta.idLabel}
                </label>
                <input
                  id="registerNumber"
                  name="registerNumber"
                  type="text"
                  autoComplete="username"
                  value={registerNumber}
                  onChange={(e) => setRegisterNumber(e.target.value)}
                  placeholder={roleMeta.idPlaceholder}
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
                    placeholder={erpRole === 'staff' ? 'Dr. R. Meenakshi' : 'Arjun Subramanian'}
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
                        Login Through ERP &amp; LMS
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
                        Paste Tokens Only
                      </button>
                    </div>
                  </div>

                  {liveAuthMethod === 'auto-login' ? (
                    <div className="space-y-3.5">
                      {/* 1. College ERP Direct Automatic Login (Role + ID + Password + Optional Token Fallback) */}
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              College ERP ({erpHost})
                            </span>
                            <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                              Automatic Login Enabled
                            </span>
                          </div>
                          <a
                            href={erpLoginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={markErpPortalOpened}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline shrink-0"
                          >
                            Open ERP Portal
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Signs directly into {erpHost} as <strong className="text-slate-700 dark:text-slate-300">{roleMeta.label}</strong> and syncs attendance, timetable, CAE marks, and CGPA automatically — no token pasting needed.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="erpUsername"
                              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                            >
                              ERP {roleMeta.idLabel}
                            </label>
                            <input
                              id="erpUsername"
                              name="erpUsername"
                              type="text"
                              autoComplete="username"
                              value={erpUsername}
                              onChange={(e) => setErpUsername(e.target.value)}
                              placeholder={registerNumber.trim() || roleMeta.idPlaceholder}
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
                            <PasswordInput
                              id="erpPassword"
                              name="erpPassword"
                              autoComplete="current-password"
                              value={erpPassword}
                              onChange={(e) => setErpPassword(e.target.value)}
                              placeholder="Enter ERP portal password"
                              toggleLabel="ERP password"
                              aria-invalid={Boolean(fieldErrors.erpPassword)}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            />
                            {fieldErrors.erpPassword ? (
                              <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.erpPassword}</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setShowOptionalErpToken((v) => !v)}
                              aria-expanded={showOptionalErpToken}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors cursor-pointer"
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${showOptionalErpToken ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                              />
                              Instant Access-Token Auto-Sync (if ERP asks for browser verification)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowOptionalErpToken(true);
                                void copyTokenSnippet();
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              {copiedSnippet ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                              {copiedSnippet ? 'Copied command' : 'Copy 1-line command'}
                            </button>
                          </div>

                          {showOptionalErpToken ? (
                            <div className="space-y-2">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <PasswordInput
                                  ref={erpTokenInputRef}
                                  id="autoErpToken"
                                  name="erpToken"
                                  value={erpToken}
                                  onChange={(e) => setErpToken(e.target.value)}
                                  onPaste={handleErpTokenPaste}
                                  placeholder="Paste Access-Token, header, JSON, or cURL — auto-syncs immediately"
                                  aria-label="ERP Access-Token (auto-syncs on paste)"
                                  toggleLabel="ERP Access-Token"
                                  aria-invalid={Boolean(fieldErrors.erpToken)}
                                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => void pasteErpTokenFromClipboard()}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                                >
                                  <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                                  Paste &amp; Auto-Sync
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                Accepts raw JWT, <span className="font-mono">Access-Token: ...</span>, JSON, or DevTools <span className="font-mono">cURL</span>. Register Number is auto-filled from your token and syncing starts immediately on paste.
                              </p>
                              {clipboardNotice ? (
                                <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">{clipboardNotice}</p>
                              ) : null}
                              {fieldErrors.erpToken ? (
                                <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors.erpToken}</p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* 2. Moodle LMS Auto-Login */}
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              Moodle LMS ({lmsHost})
                            </span>
                            <span className="ml-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              Optional · Auto-syncs deadlines &amp; notices
                            </span>
                          </div>
                          <a
                            href={lmsLoginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Open Moodle
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
                            <PasswordInput
                              id="lmsPassword"
                              name="lmsPassword"
                              autoComplete="current-password"
                              value={lmsPassword}
                              onChange={(e) => setLmsPassword(e.target.value)}
                              placeholder="Never stored"
                              toggleLabel="Moodle password"
                              aria-invalid={Boolean(fieldErrors.lmsPassword)}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            />
                            {fieldErrors.lmsPassword ? (
                              <p className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsPassword}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label
                            htmlFor="erpToken"
                            className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                          >
                            ERP Access-Token (auto-syncs on paste)
                          </label>
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => void copyTokenSnippet()}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer"
                            >
                              {copiedSnippet ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />}
                              {copiedSnippet ? 'Copied command' : 'Copy 1-line command'}
                            </button>
                            <a
                              href={erpLoginUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={markErpPortalOpened}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              Login on {erpHost}
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                            </a>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <PasswordInput
                            id="erpToken"
                            name="erpToken"
                            value={erpToken}
                            onChange={(e) => setErpToken(e.target.value)}
                            onPaste={handleErpTokenPaste}
                            placeholder="Paste ERP Access-Token, header, JSON, or DevTools cURL"
                            toggleLabel="ERP Access-Token"
                            aria-invalid={Boolean(fieldErrors.erpToken)}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                          />
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void pasteErpTokenFromClipboard()}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                          >
                            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                            Paste &amp; Auto-Sync
                          </button>
                        </div>
                        {clipboardNotice ? (
                          <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">{clipboardNotice}</p>
                        ) : null}
                        {fieldErrors.erpToken ? (
                          <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors.erpToken}</p>
                        ) : null}
                      </div>

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
                            Login on {lmsHost}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        </div>
                        <PasswordInput
                          id="lmsToken"
                          name="lmsToken"
                          value={lmsToken}
                          onChange={(e) => setLmsToken(e.target.value)}
                          placeholder="Paste your Moodle mobile web service key"
                          toggleLabel="Moodle web-service token"
                          aria-invalid={Boolean(fieldErrors.lmsToken)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        {fieldErrors.lmsToken ? (
                          <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors.lmsToken}</p>
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
                    Passwords discarded after verification · Auto-updates all connected sites.
                  </span>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {submitting
                    ? mode === 'live'
                      ? 'Logging in via ERP...'
                      : 'Signing in...'
                    : mode === 'live'
                      ? 'Login & Sync Portal'
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
