import { ExternalLink } from 'lucide-react';

export const CREATOR_INSTAGRAM_URL =
  'https://www.instagram.com/snazzyyuvaraj?fqnt=NjIzaWl5YTV1cGcx';

export function AppFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-6 py-3.5">
      <div className="mx-auto max-w-6xl flex items-center justify-center sm:justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="hidden sm:inline">SIST-attendance · SIST Student Portal</span>
        <p className="flex items-center gap-1.5">
          <span>by</span>
          <a
            href={CREATOR_INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[#134E44] dark:text-emerald-400 hover:underline transition-colors"
          >
            @snazzyyuvaraj
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        </p>
      </div>
    </footer>
  );
}
