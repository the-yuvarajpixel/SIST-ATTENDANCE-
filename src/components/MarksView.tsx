import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { CaeStanding, NavSection, ResultsPayload, SubjectCaeMark } from '../core/types';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface MarksViewProps {
  section: SectionState<ResultsPayload>;
  onNavigate: (section: NavSection) => void;
  onRetry: () => void;
}

type MarksFilter = 'all' | 'strong' | 'on-track' | 'needs-improvement';

function formatScore(value: number | null, max: number): string {
  if (value === null) return 'Pending';
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted} / ${max}`;
}

function getStandingMeta(standing: CaeStanding): {
  label: string;
  textClass: string;
  barClass: string;
} {
  switch (standing) {
    case 'strong':
      return {
        label: 'Strong',
        textClass: 'text-emerald-700 dark:text-emerald-400',
        barClass: 'bg-emerald-600 dark:bg-emerald-500',
      };
    case 'on-track':
      return {
        label: 'On track',
        textClass: 'text-blue-700 dark:text-blue-400',
        barClass: 'bg-blue-600 dark:bg-blue-500',
      };
    case 'needs-improvement':
      return {
        label: 'Needs focus',
        textClass: 'text-red-700 dark:text-red-400',
        barClass: 'bg-red-600 dark:bg-red-500',
      };
    default:
      return {
        label: 'Pending',
        textClass: 'text-slate-500 dark:text-slate-400',
        barClass: 'bg-slate-400 dark:bg-slate-600',
      };
  }
}

function computeEseTargets(item: SubjectCaeMark): { primary: string; secondary: string | null } {
  if (item.standing === 'pending' || item.internalMax <= 0) {
    return { primary: 'Awaiting CAE scores', secondary: null };
  }
  // Normalize internal score onto the standard 50-mark internal scale (50 internal + 50 ESE = 100 total)
  const internalOutOf50 = (item.internalTotal / item.internalMax) * 50;
  const targets = [
    { grade: 'O', totalRequired: 90 },
    { grade: 'A+', totalRequired: 80 },
    { grade: 'A', totalRequired: 70 },
    { grade: 'B+', totalRequired: 60 },
    { grade: 'Pass', totalRequired: 50 },
  ];

  const reachable = targets
    .map((t) => ({
      grade: t.grade,
      needed: Math.max(0, Math.ceil(t.totalRequired - internalOutOf50)),
    }))
    .filter((t) => t.needed <= 50);

  if (reachable.length === 0) {
    return { primary: 'Review internal weightage', secondary: null };
  }
  const first = reachable[0];
  const second = reachable[1] ?? null;
  return {
    primary: `${first.needed}/50 for ${first.grade}`,
    secondary: second ? `${second.needed}/50 for ${second.grade}` : null,
  };
}

export function MarksView({ section, onNavigate, onRetry }: MarksViewProps) {
  const [filter, setFilter] = useState<MarksFilter>('all');
  const payload = section.envelope?.data ?? null;
  const marks = payload?.caeMarks ?? [];

  const summary = useMemo(() => {
    const scored = marks.filter((m) => m.standing !== 'pending' && m.internalMax > 0);
    const avgPct =
      scored.length > 0
        ? scored.reduce((sum, m) => sum + (m.internalTotal / m.internalMax) * 100, 0) / scored.length
        : 0;
    const avgOutOf50 = (avgPct / 100) * 50;
    const strongCount = marks.filter((m) => m.standing === 'strong').length;
    const onTrackCount = marks.filter((m) => m.standing === 'on-track').length;
    const needsFocus = marks.filter((m) => m.standing === 'needs-improvement');
    const cae2PublishedCount = marks.filter((m) => m.cae2 !== null).length;

    return {
      totalSubjects: marks.length,
      scoredCount: scored.length,
      cae2PublishedCount,
      avgPct,
      avgOutOf50,
      strongCount,
      onTrackCount,
      needsFocusCount: needsFocus.length,
      lowestFocusSubject:
        needsFocus.length > 0
          ? [...needsFocus].sort(
              (a, b) => a.internalTotal / a.internalMax - b.internalTotal / b.internalMax
            )[0]
          : null,
    };
  }, [marks]);

  const filteredMarks = useMemo(() => {
    if (filter === 'all') return marks;
    return marks.filter((m) => m.standing === filter);
  }, [marks, filter]);

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={section.envelope?.warning}
        fetchedAt={section.envelope?.fetchedAt}
        onRetry={onRetry}
        retrying={section.loading}
      />

      {/* Header & Controls */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              Continuous Assessment (CAE) Marks
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <span>{payload ? `Semester ${payload.currentSemester}` : 'Current term'}</span>
              <span aria-hidden="true"> · </span>
              <span>Subject-by-subject CAE 1, CAE 2 &amp; internal assessment breakdown</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div
              role="group"
              aria-label="Filter CAE marks by standing"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'strong', label: 'Strong' },
                  { id: 'on-track', label: 'On track' },
                  { id: 'needs-improvement', label: 'Needs focus' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  aria-pressed={filter === tab.id}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    filter === tab.id
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
              onClick={() => onNavigate('results')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Open CGPA Planner</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {section.loading && !payload ? (
        <SectionSkeleton rows={6} />
      ) : section.error && !payload ? (
        <SectionError sectionName="CAE Marks" message={section.error} onRetry={onRetry} />
      ) : marks.length === 0 ? (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            No CAE marks published for the current term yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Once CAE 1 or CAE 2 scores are uploaded to Sathyabama ERP, refresh to view subject-wise internal marks and end-semester grade targets here.
          </p>
          <div className="pt-1 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              Refresh from ERP
            </button>
            <button
              type="button"
              onClick={() => onNavigate('results')}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              Plan grades in CGPA Planner
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* 4-column KPI strip */}
          <section
            aria-label="Continuous assessment summary"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Average Internal
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {summary.avgOutOf50.toFixed(1)}
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400"> / 50</span>
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.avgPct.toFixed(1)}% across {summary.scoredCount} subjects
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Subjects Recorded
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {summary.scoredCount} / {summary.totalSubjects}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {summary.cae2PublishedCount} with CAE 2 scores
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Strong Standing (≥80%)
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {summary.strongCount}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {summary.onTrackCount} additional on track
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Needs Focus (&lt;65%)
              </p>
              <p
                className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                  summary.needsFocusCount > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-50'
                }`}
              >
                {summary.needsFocusCount}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                {summary.lowestFocusSubject
                  ? `${summary.lowestFocusSubject.courseName} (${((summary.lowestFocusSubject.internalTotal / summary.lowestFocusSubject.internalMax) * 100).toFixed(0)}%)`
                  : 'All subjects above 65%'}
              </p>
            </div>
          </section>

          {/* Subject-by-subject CAE table */}
          {filteredMarks.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No subjects match the selected standing filter.
              </p>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="mt-3 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Show all subjects
              </button>
            </div>
          ) : (
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3.5 pl-5 pr-4">Course</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">CAE 1</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">CAE 2</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Assign / Lab</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Internal Total</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">Standing</th>
                      <th className="py-3.5 pl-4 pr-5 text-right whitespace-nowrap">
                        ESE Target (/50)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                    {filteredMarks.map((item) => {
                      const pct =
                        item.internalMax > 0
                          ? Math.min(100, (item.internalTotal / item.internalMax) * 100)
                          : 0;
                      const standing = getStandingMeta(item.standing);
                      const eseTarget = computeEseTargets(item);
                      const caeDelta =
                        item.cae1 !== null && item.cae2 !== null && item.cae1Max === item.cae2Max
                          ? Math.round((item.cae2 - item.cae1) * 10) / 10
                          : null;

                      return (
                        <tr
                          key={item.courseCode}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-4 pl-5 pr-4 min-w-[230px]">
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {item.courseName}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-mono">{item.courseCode}</span>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono tabular-nums">{item.credits} cr</span>
                              {item.remarks ? (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span>{item.remarks}</span>
                                </>
                              ) : null}
                            </p>
                            <div className="mt-2 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className={`h-full rounded-full transition-all ${standing.barClass}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>

                          <td className="py-4 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {formatScore(item.cae1, item.cae1Max)}
                            </span>
                            {item.cae1 !== null ? (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {((item.cae1 / item.cae1Max) * 100).toFixed(0)}%
                              </div>
                            ) : null}
                          </td>

                          <td className="py-4 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {formatScore(item.cae2, item.cae2Max)}
                            </span>
                            {caeDelta !== null ? (
                              <div
                                className={`text-[11px] mt-0.5 ${
                                  caeDelta > 0
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : caeDelta < 0
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {caeDelta > 0
                                  ? `+${caeDelta} vs CAE 1`
                                  : caeDelta < 0
                                    ? `${caeDelta} vs CAE 1`
                                    : 'No change'}
                              </div>
                            ) : null}
                          </td>

                          <td className="py-4 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {item.internalBonus !== null
                              ? formatScore(item.internalBonus, item.internalBonusMax)
                              : '—'}
                          </td>

                          <td className="py-4 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-semibold text-slate-900 dark:text-slate-50">
                              {item.internalTotal.toFixed(1)} / {item.internalMax}
                            </span>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {pct.toFixed(1)}%
                            </div>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <span className={`text-xs font-semibold ${standing.textClass}`}>
                              {standing.label}
                            </span>
                          </td>

                          <td className="py-4 pl-4 pr-5 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {eseTarget.primary}
                            </span>
                            {eseTarget.secondary ? (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {eseTarget.secondary}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Internal total combines CAE 1 (20), CAE 2 (20), and Assignment/Lab (10) out of 50.
                </span>
                <span>
                  ESE Target assumes 50 internal + 50 end-semester exam = 100 total (O ≥ 90, A+ ≥ 80, A ≥ 70).
                </span>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
