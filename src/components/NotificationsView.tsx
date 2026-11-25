import { useMemo, useState } from 'react';
import { CheckCheck, ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { NotificationItem } from '../core/types';
import { formatDateTime } from '../lib/format';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface NotificationsViewProps {
  section: SectionState<NotificationItem[]>;
  readIds: Set<string>;
  onToggleRead: (id: string) => void;
  onMarkAllRead: () => void;
  onRetry: () => void;
}

type SourceFilter = 'all' | 'ERP' | 'LMS';

export function NotificationsView({
  section,
  readIds,
  onToggleRead,
  onMarkAllRead,
  onRetry,
}: NotificationsViewProps) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const items = section.envelope?.data ?? [];

  const unreadCount = useMemo(
    () => items.filter((n) => n.unread && !readIds.has(n.id)).length,
    [items, readIds]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const isUnread = item.unread && !readIds.has(item.id);
      if (sourceFilter !== 'all' && item.origin !== sourceFilter) return false;
      if (unreadOnly && !isUnread) return false;
      if (!q) return true;
      return `${item.title} ${item.summary} ${item.body} ${item.category} ${item.courseCode ?? ''} ${item.origin}`
        .toLowerCase()
        .includes(q);
    });
  }, [items, readIds, sourceFilter, unreadOnly, query]);

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={section.envelope?.warning}
        fetchedAt={section.envelope?.fetchedAt}
        onRetry={onRetry}
        retrying={section.loading}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              Notifications &amp; Circulars
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 tabular-nums">
              {items.length} total notices · {unreadCount} unread across ERP circulars and Moodle LMS
            </p>
          </div>

          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Mark all as read
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search circulars, exam notices, or course codes..."
              aria-label="Search notifications and circulars"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Filter notices by source"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
            >
              {(['all', 'ERP', 'LMS'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  aria-pressed={sourceFilter === src}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    sourceFilter === src
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {src === 'all' ? 'All sources' : src}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              aria-pressed={unreadOnly}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                unreadOnly
                  ? 'border-blue-600 bg-blue-600/10 text-blue-700 dark:border-blue-500 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Unread only
            </button>
          </div>
        </div>
      </section>

      {section.loading && !section.envelope ? (
        <SectionSkeleton rows={5} />
      ) : section.error && !section.envelope ? (
        <SectionError sectionName="Notifications" message={section.error} onRetry={onRetry} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            No notices match your search or filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSourceFilter('all');
              setUnreadOnly(false);
            }}
            className="mt-3 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Clear search &amp; filters
          </button>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((notice) => {
              const isUnread = notice.unread && !readIds.has(notice.id);
              const isExpanded = expandedId === notice.id;

              return (
                <article key={notice.id} className="px-5 py-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {notice.origin}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{notice.category}</span>
                      {notice.courseCode ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{notice.courseCode}</span>
                        </>
                      ) : null}
                      {isUnread ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-blue-700 dark:text-blue-400">
                            Unread
                          </span>
                        </>
                      ) : null}
                    </div>
                    <time
                      dateTime={notice.publishedAt}
                      className="font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0"
                    >
                      {formatDateTime(notice.publishedAt)}
                    </time>
                  </div>

                  <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {notice.title}
                  </h3>

                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {notice.summary}
                  </p>

                  {isExpanded ? (
                    <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 p-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {notice.body}
                    </div>
                  ) : null}

                  <div className="pt-1 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : notice.id)}
                      aria-expanded={isExpanded}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {isExpanded ? 'Hide full notice' : 'Read full notice'}
                    </button>

                    {notice.unread ? (
                      <button
                        type="button"
                        onClick={() => onToggleRead(notice.id)}
                        className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        {isUnread ? 'Mark as read' : 'Mark unread'}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
