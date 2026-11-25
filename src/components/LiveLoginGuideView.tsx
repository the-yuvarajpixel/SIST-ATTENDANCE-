import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';

interface LiveLoginGuideViewProps {
  /** True when rendered as a standalone pre-login page (before signing in). */
  standalone?: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onGoToLiveSignIn: () => void;
  onBack?: () => void;
}

type GuideTab = 'moodle-direct' | 'moodle-token' | 'erp-token';

const MOODLE_URL = 'https://sathyabama.cognibot.in';
const ERP_URL = 'https://erp.sathyabama.ac.in/account/login';

export function LiveLoginGuideView({
  standalone = false,
  theme = 'light',
  onToggleTheme,
  onGoToLiveSignIn,
  onBack,
}: LiveLoginGuideViewProps) {
  const [activeTab, setActiveTab] = useState<GuideTab>('moodle-direct');

  const content = (
    <div className="space-y-6">
      {/* Header / Intro Card */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-400">
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Step-by-Step Live Sign-In Instructions</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Connect Sathyabama Moodle LMS &amp; College ERP
            </h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Live mode opens by default with both{' '}
              <span className="font-mono text-slate-800 dark:text-slate-200">sathyabama.cognibot.in</span>{' '}
              (Moodle LMS) and{' '}
              <span className="font-mono text-slate-800 dark:text-slate-200">erp.sathyabama.ac.in</span>{' '}
              (College ERP) ready. Follow the steps below to sign in live in under a minute.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onGoToLiveSignIn}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-2.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              Go to Live Sign-In
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Direct Official Portal Links */}
        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={MOODLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                1. Sathyabama Moodle LMS
              </p>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                sathyabama.cognibot.in
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          </a>

          <a
            href={ERP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                2. Sathyabama College ERP
              </p>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                erp.sathyabama.ac.in/account/login
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* Interactive Step-by-Step Guide Tabs */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              Step-by-Step Walkthrough
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose a connection method below to see exact steps.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Live sign-in guide sections"
            className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'moodle-direct'}
              onClick={() => setActiveTab('moodle-direct')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'moodle-direct'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Moodle Login (Fastest)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'moodle-token'}
              onClick={() => setActiveTab('moodle-token')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'moodle-token'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Moodle Token (Manual)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'erp-token'}
              onClick={() => setActiveTab('erp-token')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'erp-token'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              College ERP Token
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {activeTab === 'moodle-direct' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  Recommended for quick setup. Connects to{' '}
                  <span className="font-mono text-slate-800 dark:text-slate-200">sathyabama.cognibot.in</span>{' '}
                  automatically without copying tokens from browser menus.
                </p>
              </div>
              <ol className="space-y-3">
                {[
                  {
                    title: 'Open the Live ERP + LMS tab',
                    detail:
                      'On the Sign-In screen, ensure the "Live ERP + LMS" tab is selected (open by default) and "Moodle Login" is chosen under Live Sign-In Method.',
                  },
                  {
                    title: 'Enter your Sathyabama Register Number',
                    detail:
                      'Type your 6–14 character Register Number (for example, 42110482) without spaces.',
                  },
                  {
                    title: 'Enter your Moodle Username and Password',
                    detail:
                      'Leave Moodle Username blank if it is identical to your Register Number, or enter your Sathyabama college email/username if your Moodle login uses it. Then type your Moodle LMS password.',
                  },
                  {
                    title: '(Optional) Add your ERP Session Token',
                    detail:
                      'Leave ERP Session Token blank to sync Moodle LMS Deadlines and Notifications immediately, or paste your ERP token from the "College ERP Token" tab to also sync Attendance, Timetable, and CGPA.',
                  },
                  {
                    title: 'Click Connect Live',
                    detail:
                      'The server exchanges your credentials once with sathyabama.cognibot.in/login/token.php, discards your password immediately, verifies the Moodle token, and opens your live dashboard.',
                  },
                ].map((step, idx) => (
                  <li
                    key={step.title}
                    className="flex items-start gap-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-700 dark:bg-blue-600 font-mono text-xs font-semibold text-white">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {step.title}
                      </p>
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {activeTab === 'moodle-token' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                <KeyRound className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  Use this method if you prefer to sign in directly on{' '}
                  <span className="font-mono text-slate-800 dark:text-slate-200">sathyabama.cognibot.in</span>{' '}
                  and paste your personal web-service token instead of entering your password.
                </p>
              </div>
              <ol className="space-y-3">
                {[
                  {
                    title: 'Sign in to Sathyabama Moodle LMS',
                    detail:
                      'Open https://sathyabama.cognibot.in in a new browser tab and log in with your student account.',
                  },
                  {
                    title: 'Open your User Preferences',
                    detail:
                      'Click your profile initials or avatar in the top-right corner of Moodle, then click "Preferences".',
                  },
                  {
                    title: 'Go to Security keys',
                    detail:
                      'Under the "User account" section, click "Security keys".',
                  },
                  {
                    title: 'Copy the Moodle mobile web service key',
                    detail:
                      'Locate the row labeled "Moodle mobile web service" and copy its alphanumeric security key.',
                  },
                  {
                    title: 'Paste into SIST Student Portal',
                    detail:
                      'Return to the Live Sign-In screen, switch Live Sign-In Method to "Paste Tokens", enter your Register Number, paste the key into "Moodle LMS Web-Service Token", and click "Connect Live".',
                  },
                ].map((step, idx) => (
                  <li
                    key={step.title}
                    className="flex items-start gap-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-700 dark:bg-blue-600 font-mono text-xs font-semibold text-white">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {step.title}
                      </p>
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {activeTab === 'erp-token' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                <KeyRound className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  Because <span className="font-mono text-slate-800 dark:text-slate-200">erp.sathyabama.ac.in</span>{' '}
                  handles interactive browser verification, sign in there first and copy your active session token.
                </p>
              </div>
              <ol className="space-y-3">
                {[
                  {
                    title: 'Sign in at erp.sathyabama.ac.in',
                    detail:
                      'Open https://erp.sathyabama.ac.in/account/login in a desktop browser and complete normal student sign-in until your ERP dashboard loads.',
                  },
                  {
                    title: 'Open Browser Developer Tools',
                    detail:
                      'Press F12 (Windows/Linux) or Cmd + Option + I (macOS), then select the "Network" tab.',
                  },
                  {
                    title: 'Filter for API requests',
                    detail:
                      'Click "Fetch/XHR" in the Network toolbar, then refresh the ERP page or open your Attendance tab so authenticated API calls appear.',
                  },
                  {
                    title: 'Inspect Request Headers',
                    detail:
                      'Click any request sent to erp.sathyabama.ac.in/erp/api/... and open the "Headers" pane on the right.',
                  },
                  {
                    title: 'Copy your Authorization token or Session Cookie',
                    detail:
                      'Under "Request Headers", copy the "Authorization" value (for example, Bearer eyJ...), OR switch to Application → Cookies → https://erp.sathyabama.ac.in and copy your session cookie in NAME=VALUE format.',
                  },
                  {
                    title: 'Connect Live in SIST Student Portal',
                    detail:
                      'Paste the copied token into the "ERP Session Token" field on the Live ERP + LMS sign-in form (with or without Moodle LMS) and click "Connect Live".',
                  },
                ].map((step, idx) => (
                  <li
                    key={step.title}
                    className="flex items-start gap-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-700 dark:bg-blue-600 font-mono text-xs font-semibold text-white">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {step.title}
                      </p>
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </section>

      {/* What Syncs + Security & Troubleshooting Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* What Syncs Table */}
        <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              What Syncs Live
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Each section loads independently — Moodle LMS works even before ERP is connected.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Dashboard Section</th>
                  <th className="px-5 py-3 font-medium">Moodle LMS Only</th>
                  <th className="px-5 py-3 font-medium">Moodle + College ERP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                <tr>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    Deadlines &amp; Assignments
                  </td>
                  <td className="px-5 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    Live (Moodle)
                  </td>
                  <td className="px-5 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    Live (ERP + LMS merged)
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    Notifications &amp; Circulars
                  </td>
                  <td className="px-5 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    Live (Moodle)
                  </td>
                  <td className="px-5 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    Live (ERP + LMS merged)
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    Attendance &amp; Bunk Calculator
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">Requires ERP token</td>
                  <td className="px-5 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    Live (ERP)
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    Timetable &amp; Next Class
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">Requires ERP token</td>
                  <td className="px-5 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    Live (ERP)
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    Results &amp; CGPA Planner
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">Requires ERP token</td>
                  <td className="px-5 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    Live (ERP)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Security & Troubleshooting Card */}
        <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              Security &amp; Troubleshooting
            </h3>
          </div>

          <dl className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <div className="py-3 space-y-1">
              <dt className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                Are passwords or tokens stored?
              </dt>
              <dd className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Passwords are sent once over HTTPS to{' '}
                <span className="font-mono">sathyabama.cognibot.in/login/token.php</span> and discarded
                immediately. Only verified tokens are encrypted in your AES-256-GCM HttpOnly cookie (8-hour
                expiry, cleared on Sign Out).
              </dd>
            </div>

            <div className="py-3 space-y-1">
              <dt className="font-semibold text-slate-900 dark:text-slate-100">
                Moodle says “invalidlogin” or “invalidtoken”
              </dt>
              <dd className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Some batches log in to Moodle with their college email instead of their Register Number. Try
                entering your full college email in the Moodle Username field, or use the Manual Token tab.
              </dd>
            </div>

            <div className="py-3 space-y-1">
              <dt className="font-semibold text-slate-900 dark:text-slate-100">
                ERP returns HTTP 401 or 403
              </dt>
              <dd className="text-slate-600 dark:text-slate-400 leading-relaxed">
                ERP browser tokens expire after inactivity or when you sign out of{' '}
                <span className="font-mono">erp.sathyabama.ac.in</span>. Sign in again on ERP and copy a fresh
                token.
              </dd>
            </div>

            <div className="pt-3 space-y-1">
              <dt className="font-semibold text-slate-900 dark:text-slate-100">
                Want to preview first without credentials?
              </dt>
              <dd className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Switch to the <strong>Sample Data (Mock)</strong> tab on the Sign-In screen and click{' '}
                <em>Fill sample student (42110482)</em> to explore all dashboard calculators immediately.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );

  if (!standalone) {
    return content;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to Sign In
            </button>
          ) : null}
          <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 truncate">
            SIST Student Portal
          </span>
        </div>

        {onToggleTheme ? (
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        ) : null}
      </header>

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="mx-auto max-w-5xl">{content}</div>
      </main>
    </div>
  );
}
