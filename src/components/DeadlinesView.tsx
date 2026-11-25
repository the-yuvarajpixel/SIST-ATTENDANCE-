import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { DeadlineItem, DeadlineKind } from '../core/types';
import { formatDateTime, formatInr, formatRelativeDue, formatShortDate } from '../lib/format';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface DeadlinesViewProps {
  section: SectionState<DeadlineItem[]>;
  completedIds: Set<string>;
  onToggleComplete: (id: string) => void;
  onRetry: () => void;
}

type KindFilter = 'all' | DeadlineKind;

const KIND_LABELS: Record<DeadlineKind, string> = {
  assignment: 'Assignment',
  exam: 'Exam',
  fee: 'Fee',
};

export function DeadlinesView({
  section,
  completedIds,
  onToggleComplete,
  onRetry,
}: DeadlinesViewProps) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [showCompleted, setShowCompleted] = useState(true);

  const items = section.envelope?.data ?? [];

  const counts = useMemo(() => {
    const completed = items.filter((d) => completedIds.has(d.id)).length;
    const merged = items.filter((d) => (d.mergedCount ?? 1) > 1).length;
    return {
      total: items.length,
      active: items.length - completed,
      completed,
      merged,
    };
  }, [items, completedIds]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (!showCompleted && completedIds.has(item.id)) return false;
      return true;
    });
  }, [items, kindFilter, showCompleted, completedIds]);

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={section.envelope?.warning}
        fetchedAt={section.envelope?.fetchedAt}
        onRetry={onRetry}
        retrying={section.loading}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              Unified Deadlines
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 tabular-nums">
              {counts.active} active · {counts.completed} completed
              {counts.merged > 0
                ? ` · ${counts.merged} overlapping ERP/LMS ${counts.merged === 1 ? 'item' : 'items'} de-duplicated`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Filter deadlines by type"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'assignment', label: 'Assignments' },
                  { id: 'exam', label: 'Exams' },
                  { id: 'fee', label: 'Fees' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setKindFilter(tab.id)}
                  aria-pressed={kindFilter === tab.id}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    kindFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              aria-pressed={!showCompleted}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              {showCompleted ? 'Hide completed' : 'Show completed'}
            </button>
          </div>
        </div>
      </section>

      {section.loading && !section.envelope ? (
        <SectionSkeleton rows={5} />
      ) : section.error && !section.envelope ? (
        <SectionError sectionName="Deadlines" message={section.error} onRetry={onRetry} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            No deadlines match the current filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setKindFilter('all');
              setShowCompleted(true);
            }}
            className="mt-3 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((item) => {
              const done = completedIds.has(item.id);
              const rel = formatRelativeDue(item.dueAt);

              return (
                <div
                  key={item.id}
                  className={`px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition-colors ${
                    done ? 'bg-slate-50/70 dark:bg-slate-950/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      aria-label={`Mark "${item.title}" as ${done ? 'incomplete' : 'complete'}`}
                      onClick={() => onToggleComplete(item.id)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer ${
                        done
                          ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-500'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 hover:border-blue-600'
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold leading-snug ${
                          done
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {item.title}
                      </p>

                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {KIND_LABELS[item.kind]}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>{item.origin}</span>
                        {item.courseCode ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono">{item.courseCode}</span>
                          </>
                        ) : null}
                        {item.courseName ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>{item.courseName}</span>
                          </>
                        ) : null}
                        {item.amountInr ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                              {formatInr(item.amountInr)}
                            </span>
                          </>
                        ) : null}
                        {item.mergedCount && item.mergedCount > 1 ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="text-blue-700 dark:text-blue-400 font-medium">
                              Merged from {item.mergedCount} sources
                            </span>
                          </>
                        ) : null}
                      </p>

                      {item.notes ? (
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="pl-8 sm:pl-0 sm:text-right shrink-0">
                    <p
                      className={`text-xs font-semibold ${
                        done
                          ? 'text-slate-400 dark:text-slate-500'
                          : rel.urgency === 'overdue'
                            ? 'text-red-700 dark:text-red-400'
                            : rel.urgency === 'soon'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {done ? 'Completed' : rel.label}
                    </p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatShortDate(item.dueAt)} · {formatDateTime(item.dueAt).split(',').pop()?.trim()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
