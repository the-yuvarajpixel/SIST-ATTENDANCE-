import { AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDateTime } from '../lib/format';

interface StaleBannerProps {
  warning?: string;
  fetchedAt?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function StaleBanner({ warning, fetchedAt, onRetry, retrying }: StaleBannerProps) {
  if (!warning) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <p className="leading-snug">
          <span className="font-medium">Cached copy shown.</span> {warning}
          {fetchedAt ? (
            <span className="text-amber-800/80 dark:text-amber-300/80">
              {' '}Last synced {formatDateTime(fetchedAt)}.
            </span>
          ) : null}
        </p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/70 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-950 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
          Retry section
        </button>
      ) : null}
    </div>
  );
}

interface SectionErrorProps {
  sectionName: string;
  message: string;
  onRetry: () => void;
}

export function SectionError({ sectionName, message, onRetry }: SectionErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 p-6"
    >
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Unable to load {sectionName}
      </h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {message}. Other sections of the portal continue to work normally.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors cursor-pointer"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading section" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
        />
      ))}
    </div>
  );
}
