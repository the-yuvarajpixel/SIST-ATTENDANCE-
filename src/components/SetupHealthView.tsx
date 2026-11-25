import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { HealthReport, NavSection, SessionUser } from '../core/types';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { SectionError, SectionSkeleton } from './SectionNotice';

interface SetupHealthViewProps {
  user: SessionUser;
  erpOutageSimulated: boolean;
  onToggleErpOutage: (next: boolean) => Promise<void>;
  onNavigate: (section: NavSection) => void;
  onRefreshAll: () => void;
}

export function SetupHealthView({
  user,
  erpOutageSimulated,
  onToggleErpOutage,
  onNavigate,
  onRefreshAll,
}: SetupHealthViewProps) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingOutage, setTogglingOutage] = useState(false);

  const runCheck = useCallback(async (deep = true) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getHealth(deep);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach /api/health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runCheck(true);
  }, [runCheck, erpOutageSimulated]);

  async function handleToggleOutage() {
    setTogglingOutage(true);
    try {
      await onToggleErpOutage(!erpOutageSimulated);
      await runCheck(true);
    } finally {
      setTogglingOutage(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              Setup &amp; Health Diagnostics
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Plain-English readiness checklist for ERP, Moodle LMS, session security, and cache resilience.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void runCheck(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Run deep check
          </button>
        </div>

        {report ? (
          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
            <span>
              Overall:{' '}
              <strong
                className={
                  report.status === 'ok'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }
              >
                {report.status === 'ok' ? 'All systems operational' : 'Degraded (cache fallback active)'}
              </strong>
            </span>
            <span>
              Data mode:{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100">
                {report.mode}
              </strong>
            </span>
            <span className="font-mono tabular-nums">
              Checked {formatDateTime(report.checkedAt)}
            </span>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Readiness Checklist */}
        <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              System Readiness Checklist
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Backed by <span className="font-mono">GET /api/health?deep=1</span>
            </p>
          </div>

          {loading && !report ? (
            <div className="p-5">
              <SectionSkeleton rows={5} />
            </div>
          ) : error && !report ? (
            <div className="p-5">
              <SectionError
                sectionName="Health Diagnostics"
                message={error}
                onRetry={() => void runCheck(true)}
              />
            </div>
          ) : report ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {report.checks.map((check) => (
                <div key={check.id} className="px-5 py-4 flex items-start gap-3.5">
                  <div className="mt-0.5 shrink-0">
                    {check.status === 'ok' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : check.status === 'warning' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {check.label}
                      </p>
                      <span
                        className={`text-xs font-medium ${
                          check.status === 'ok'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : check.status === 'warning'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {check.status === 'ok'
                          ? 'Operational'
                          : check.status === 'warning'
                            ? 'Degraded'
                            : 'Issue'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {check.summary}
                    </p>
                    {check.action ? (
                      <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                        Next step: {check.action}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Resilience & Session Column */}
        <div className="xl:col-span-5 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                Resilience Test (Stale-While-Error)
              </h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Simulate a college ERP outage to verify that ERP sections (attendance, timetable, results) serve
                their last cached copy with a clear warning banner while Moodle LMS deadlines and notices keep working.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Simulate ERP outage
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {erpOutageSimulated
                    ? 'Active: ERP endpoints serve cached fallback'
                    : 'Off: ERP endpoints respond normally'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={erpOutageSimulated}
                disabled={togglingOutage}
                onClick={() => void handleToggleOutage()}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                  erpOutageSimulated
                    ? 'bg-amber-600 dark:bg-amber-500'
                    : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span className="sr-only">Toggle ERP outage simulation</span>
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    erpOutageSimulated ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  onRefreshAll();
                  onNavigate('overview');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Refresh &amp; view Overview
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                Active Session &amp; Security
              </h3>
            </div>

            <dl className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Register Number</dt>
                <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {user.registerNumber}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Session Storage</dt>
                <dd className="text-slate-900 dark:text-slate-100">AES-256-GCM HttpOnly cookie</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Source Mode</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{user.mode}</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Session Expires</dt>
                <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatDateTime(user.expiresAt)}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
