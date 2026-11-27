import { useMemo, useState } from 'react';
import { Award, BookOpen, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  buildMarksEngineSemesters,
  computeEngineCumulativeCgpa,
  computeEngineSemesterStats,
  getGradeStatusTone,
  getInternalStatusTone,
  SATHYABAMA_GRADE_POINTS,
  SATHYABAMA_GRADES,
  type SemanticTone,
} from '../core/marksEngine';
import type { GradeLetter, ResultsPayload } from '../core/types';

interface MarksCgpaEnginePanelProps {
  payload: ResultsPayload | null;
  isLiveMode: boolean;
}

type MarksSubTab = 'internal' | 'results';

function toneTextClass(tone: SemanticTone): string {
  if (tone === 'safe') return 'text-emerald-700 dark:text-emerald-400';
  if (tone === 'borderline') return 'text-amber-700 dark:text-amber-400';
  return 'text-rose-700 dark:text-rose-400';
}

function toneBarClass(tone: SemanticTone): string {
  if (tone === 'safe') return 'bg-emerald-600 dark:bg-emerald-500';
  if (tone === 'borderline') return 'bg-amber-500 dark:bg-amber-400';
  return 'bg-rose-600 dark:bg-rose-500';
}

function toneBorderBgClass(tone: SemanticTone): string {
  if (tone === 'safe') {
    return 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300';
  }
  if (tone === 'borderline') {
    return 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300';
  }
  return 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300';
}

export function MarksCgpaEnginePanel({
  payload,
  isLiveMode,
}: MarksCgpaEnginePanelProps) {
  const semesters = useMemo(
    () => buildMarksEngineSemesters(payload, isLiveMode),
    [payload, isLiveMode]
  );

  const [selectedSemId, setSelectedSemId] = useState<string>(() => semesters[0]?.id ?? 'sem-5');
  const [subTab, setSubTab] = useState<MarksSubTab>('internal');
  const [simulatorEnabled, setSimulatorEnabled] = useState(false);
  const [gradeOverrides, setGradeOverrides] = useState<
    Record<string, Record<string, GradeLetter>>
  >({});

  const activeSemester =
    semesters.find((s) => s.id === selectedSemId) ?? semesters[0];

  const activeSemOverrides = gradeOverrides[activeSemester.id] ?? {};

  const baselineSemStats = useMemo(
    () => computeEngineSemesterStats(activeSemester.courses, {}),
    [activeSemester]
  );

  const effectiveSemStats = useMemo(
    () =>
      computeEngineSemesterStats(
        activeSemester.courses,
        simulatorEnabled ? activeSemOverrides : {}
      ),
    [activeSemester, simulatorEnabled, activeSemOverrides]
  );

  const baselineCumulative = useMemo(
    () => computeEngineCumulativeCgpa(semesters, {}),
    [semesters]
  );

  const effectiveCumulative = useMemo(
    () =>
      computeEngineCumulativeCgpa(
        semesters,
        simulatorEnabled ? gradeOverrides : {}
      ),
    [semesters, simulatorEnabled, gradeOverrides]
  );

  const hasOverrides = useMemo(
    () =>
      Object.values(gradeOverrides).some((semMap) => Object.keys(semMap).length > 0),
    [gradeOverrides]
  );

  const sgpaDelta =
    Math.round((effectiveSemStats.sgpa - baselineSemStats.sgpa) * 100) / 100;
  const cgpaDelta =
    Math.round((effectiveCumulative.cgpa - baselineCumulative.cgpa) * 100) / 100;

  function handleGradeChange(courseCode: string, originalGrade: GradeLetter, nextGrade: GradeLetter) {
    setGradeOverrides((prev) => {
      const semMap = { ...(prev[activeSemester.id] ?? {}) };
      if (nextGrade === originalGrade) {
        delete semMap[courseCode];
      } else {
        semMap[courseCode] = nextGrade;
      }
      return {
        ...prev,
        [activeSemester.id]: semMap,
      };
    });
  }

  function handleToggleSimulator() {
    setSimulatorEnabled((prev) => {
      const next = !prev;
      if (next && subTab !== 'results') {
        setSubTab('results');
      }
      return next;
    });
  }

  function handleResetGrades() {
    setGradeOverrides({});
  }

  return (
    <section
      aria-label="Marks and CGPA Engine"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      {/* Top Control Header: Semester Selector + Sub-Tab Toggle + What-If Simulator */}
      <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Marks &amp; CGPA Engine
              </h2>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                · {activeSemester.termLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Internal CAE 1, CAE 2 &amp; Assignment breakdown (/50) and 10-point Semester Results with live What-If grade simulation.
            </p>
          </div>

          {/* Semester Selector */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Select semester"
              className="inline-flex flex-wrap items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
            >
              {semesters.map((sem) => {
                const active = sem.id === activeSemester.id;
                return (
                  <button
                    key={sem.id}
                    type="button"
                    onClick={() => setSelectedSemId(sem.id)}
                    aria-pressed={active}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {sem.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sub-tab bar + What-If Grade Simulator Switch */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div
            role="tablist"
            aria-label="Marks view mode"
            className="grid grid-cols-2 w-full sm:w-auto sm:inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'internal'}
              onClick={() => setSubTab('internal')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'internal'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Internal (/50)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'results'}
              onClick={() => setSubTab('results')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'results'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Award className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Results (10-pt)</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={simulatorEnabled}
              onClick={handleToggleSimulator}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                simulatorEnabled
                  ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>What-If Grade Simulator</span>
              <span
                className={`font-mono text-[11px] font-semibold ${
                  simulatorEnabled
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {simulatorEnabled ? 'ON' : 'OFF'}
              </span>
            </button>

            {simulatorEnabled && hasOverrides ? (
              <button
                type="button"
                onClick={handleResetGrades}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset Grades
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Live SGPA / CGPA / Internal Average Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
        <div className="px-4 py-3.5 sm:px-5">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {activeSemester.label} SGPA
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {effectiveSemStats.sgpa.toFixed(2)}
            </span>
            {simulatorEnabled && sgpaDelta !== 0 ? (
              <span
                className={`font-mono text-xs font-semibold tabular-nums ${
                  sgpaDelta > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {sgpaDelta > 0 ? `+${sgpaDelta.toFixed(2)}` : sgpaDelta.toFixed(2)}
              </span>
            ) : (
              <span className="font-mono text-xs text-slate-400 dark:text-slate-500">/ 10</span>
            )}
          </div>
        </div>

        <div className="px-4 py-3.5 sm:px-5">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Cumulative CGPA
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {effectiveCumulative.cgpa.toFixed(2)}
            </span>
            {simulatorEnabled && cgpaDelta !== 0 ? (
              <span
                className={`font-mono text-xs font-semibold tabular-nums ${
                  cgpaDelta > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {cgpaDelta > 0 ? `+${cgpaDelta.toFixed(2)}` : cgpaDelta.toFixed(2)}
              </span>
            ) : (
              <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                {effectiveCumulative.totalCredits} cr
              </span>
            )}
          </div>
        </div>

        <div className="px-4 py-3.5 sm:px-5">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Internal Avg
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {effectiveSemStats.averageInternal.toFixed(1)}
            </span>
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">/ 50</span>
          </div>
        </div>

        <div className="px-4 py-3.5 sm:px-5">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Standing
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`font-mono text-base sm:text-lg font-bold tabular-nums ${
                effectiveSemStats.arrearCount > 0
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {effectiveSemStats.arrearCount > 0
                ? `${effectiveSemStats.arrearCount} RA`
                : 'All Pass'}
            </span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {effectiveSemStats.passedCredits}/{effectiveSemStats.totalCredits} cr
            </span>
          </div>
        </div>
      </div>

      {/* Body: Internal Marks (/50) OR Semester Results (10-pt + What-If Dropdowns) */}
      {subTab === 'internal' ? (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {activeSemester.courses.map((course) => {
            const tone = getInternalStatusTone(course.internalTotal);
            const pct = Math.min(100, Math.max(0, (course.internalTotal / 50) * 100));

            return (
              <div
                key={course.courseCode}
                className="px-5 py-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {course.courseCode} · {course.credits} cr
                      </p>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {course.courseName}
                      </h3>
                    </div>
                    <div className="text-right shrink-0 md:hidden">
                      <span className={`font-mono text-lg font-bold tabular-nums ${toneTextClass(tone)}`}>
                        {course.internalTotal.toFixed(1)}
                      </span>
                      <span className="font-mono text-xs text-slate-400 dark:text-slate-500"> / 50</span>
                    </div>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${toneBarClass(tone)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 md:flex md:items-center gap-3 md:gap-6 shrink-0 font-mono text-xs tabular-nums">
                  <div>
                    <p className="text-[11px] font-sans text-slate-500 dark:text-slate-400">CAE 1</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {course.cae1} <span className="text-slate-400 font-normal">/50</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-sans text-slate-500 dark:text-slate-400">CAE 2</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {course.cae2} <span className="text-slate-400 font-normal">/50</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-sans text-slate-500 dark:text-slate-400">Assignment</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {course.assignment} <span className="text-slate-400 font-normal">/10</span>
                    </p>
                  </div>
                  <div className="hidden md:block text-right min-w-[78px]">
                    <p className="text-[11px] font-sans text-slate-500 dark:text-slate-400">Total</p>
                    <p className={`text-sm font-bold ${toneTextClass(tone)}`}>
                      {course.internalTotal.toFixed(1)} <span className="text-slate-400 font-normal text-xs">/50</span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeSemester.courses.map((course) => {
              const effectiveGrade =
                (simulatorEnabled ? activeSemOverrides[course.courseCode] : undefined) ??
                course.grade;
              const isModified =
                simulatorEnabled && effectiveGrade !== course.grade;
              const gradePoint = SATHYABAMA_GRADE_POINTS[effectiveGrade];
              const tone = getGradeStatusTone(effectiveGrade);

              return (
                <div
                  key={course.courseCode}
                  className={`px-5 py-4 sm:px-6 flex items-center justify-between gap-4 ${
                    isModified ? 'bg-emerald-50/40 dark:bg-emerald-950/15' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {course.courseCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{course.credits} credits</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">Internal {course.internalTotal.toFixed(1)}/50</span>
                    </div>
                    <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {course.courseName}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {gradePoint} pts
                      </p>
                      {isModified ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          was {course.grade}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {effectiveGrade === 'RA' ? 'Reappear' : 'Pass'}
                        </p>
                      )}
                    </div>

                    {simulatorEnabled ? (
                      <div>
                        <label
                          htmlFor={`sim-grade-${activeSemester.id}-${course.courseCode}`}
                          className="sr-only"
                        >
                          Simulate grade for {course.courseCode} {course.courseName}
                        </label>
                        <select
                          id={`sim-grade-${activeSemester.id}-${course.courseCode}`}
                          value={effectiveGrade}
                          onChange={(e) =>
                            handleGradeChange(
                              course.courseCode,
                              course.grade,
                              e.target.value as GradeLetter
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600/25 ${toneBorderBgClass(
                            tone
                          )}`}
                        >
                          {SATHYABAMA_GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g} ({SATHYABAMA_GRADE_POINTS[g]})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-center min-w-[44px] rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums ${toneBorderBgClass(
                          tone
                        )}`}
                      >
                        {effectiveGrade}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>10-Point Scale: O=10 · A+=9 · A=8 · B+=7 · B=6 · C=5 · RA=0</span>
            <span>
              {simulatorEnabled
                ? 'Select any grade dropdown above to recalculate SGPA & CGPA live.'
                : 'Turn on What-If Grade Simulator to test grade scenarios.'}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
