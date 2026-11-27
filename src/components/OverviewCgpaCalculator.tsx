import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from 'lucide-react';
import {
  GRADE_POINTS,
  ORDERED_GRADES,
  computeOverviewSemesterCgpa,
  createDefaultCalculatorSemesters,
  seedCalculatorFromSemesters,
  simulateTargetCgpaPlan,
  type OverviewCalculatorCourse,
  type OverviewCalculatorSemester,
} from '../core/gpa';
import type { GradeLetter, NavSection, SemesterResult } from '../core/types';

interface OverviewCgpaCalculatorProps {
  erpSemesters: SemesterResult[];
  erpCgpa: number | null;
  loading: boolean;
  onNavigate: (section: NavSection) => void;
}

const STORAGE_KEY = 'usp_overview_cgpa_calc_v1';

const VALID_GRADES = new Set<string>(ORDERED_GRADES);

function readSavedSemesters(): OverviewCalculatorSemester[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const sanitized: OverviewCalculatorSemester[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const semester = Number(item.semester);
      if (!Number.isInteger(semester) || semester < 1 || semester > 16) continue;
      const inputMode = item.inputMode === 'sgpa' ? 'sgpa' : 'courses';
      const sgpa = Number.isFinite(Number(item.sgpa))
        ? Math.min(10, Math.max(0, Number(item.sgpa)))
        : 8.5;
      const credits = Number.isFinite(Number(item.credits))
        ? Math.min(60, Math.max(0, Number(item.credits)))
        : 20;
      const courses: OverviewCalculatorCourse[] = Array.isArray(item.courses)
        ? item.courses
            .filter((c: unknown): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
            .slice(0, 20)
            .map((c, idx) => ({
              id: typeof c.id === 'string' && c.id ? c.id : `sem-${semester}-c-${idx + 1}`,
              name: typeof c.name === 'string' ? c.name.slice(0, 80) : `Subject ${idx + 1}`,
              grade: (typeof c.grade === 'string' && VALID_GRADES.has(c.grade)
                ? c.grade
                : 'A+') as GradeLetter,
              credits: Number.isFinite(Number(c.credits))
                ? Math.min(20, Math.max(0.5, Number(c.credits)))
                : 3,
            }))
        : [];
      sanitized.push({
        id: typeof item.id === 'string' && item.id ? item.id : `sem-${semester}`,
        semester,
        inputMode,
        sgpa,
        credits,
        courses,
      });
    }
    return sanitized.length > 0 ? sanitized : null;
  } catch {
    return null;
  }
}

function writeSavedSemesters(semesters: OverviewCalculatorSemester[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(semesters));
  } catch {
    // Ignore restricted frame storage errors
  }
}

function clearSavedSemesters(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

const GRADE_TEXT_TONE: Record<GradeLetter, string> = {
  O: 'text-emerald-700 dark:text-emerald-400',
  'A+': 'text-blue-700 dark:text-blue-400',
  A: 'text-sky-700 dark:text-sky-400',
  'B+': 'text-teal-700 dark:text-teal-400',
  B: 'text-amber-700 dark:text-amber-400',
  C: 'text-orange-700 dark:text-orange-400',
  RA: 'text-red-700 dark:text-red-400',
};

export function OverviewCgpaCalculator({
  erpSemesters,
  erpCgpa,
  loading,
  onNavigate,
}: OverviewCgpaCalculatorProps) {
  const [semesters, setSemesters] = useState<OverviewCalculatorSemester[]>(() => {
    const saved = readSavedSemesters();
    if (saved) return saved;
    if (erpSemesters.length > 0) return seedCalculatorFromSemesters(erpSemesters);
    return createDefaultCalculatorSemesters();
  });
  const [hasCustomEdits, setHasCustomEdits] = useState<boolean>(() => Boolean(readSavedSemesters()));
  const [activeSemesterId, setActiveSemesterId] = useState<string>(() => {
    const initial = readSavedSemesters() ?? (erpSemesters.length > 0 ? seedCalculatorFromSemesters(erpSemesters) : createDefaultCalculatorSemesters());
    return initial[initial.length - 1]?.id ?? 'sem-1';
  });
  const [layoutMode, setLayoutMode] = useState<'single' | 'all'>('single');
  const [targetCgpa, setTargetCgpa] = useState<number>(() => {
    const base = erpCgpa && erpCgpa > 0 ? erpCgpa : 8.5;
    return Math.min(9.5, Math.max(7.5, Math.round((base + 0.35) * 4) / 4));
  });
  const [remainingSemesters, setRemainingSemesters] = useState<number>(3);
  const [creditsPerSemester, setCreditsPerSemester] = useState<number>(20);
  const seededFromErpRef = useRef<boolean>(erpSemesters.length > 0);

  // When ERP semesters arrive asynchronously and user hasn't customized yet, seed automatically
  useEffect(() => {
    if (!hasCustomEdits && erpSemesters.length > 0 && !seededFromErpRef.current) {
      seededFromErpRef.current = true;
      const seeded = seedCalculatorFromSemesters(erpSemesters);
      setSemesters(seeded);
      setActiveSemesterId(seeded[seeded.length - 1]?.id ?? seeded[0]?.id ?? 'sem-1');
    }
  }, [erpSemesters, hasCustomEdits]);

  const calculation = useMemo(() => computeOverviewSemesterCgpa(semesters), [semesters]);

  const effectiveActiveId = useMemo(() => {
    if (semesters.some((s) => s.id === activeSemesterId)) return activeSemesterId;
    return semesters[0]?.id ?? '';
  }, [semesters, activeSemesterId]);

  const activeSemester = useMemo(
    () => semesters.find((s) => s.id === effectiveActiveId) ?? semesters[0] ?? null,
    [semesters, effectiveActiveId]
  );

  const activeBreakdown = useMemo(
    () => calculation.semesters.find((b) => b.id === activeSemester?.id) ?? null,
    [calculation.semesters, activeSemester]
  );

  const highestSemesterNumber = useMemo(
    () => semesters.reduce((max, s) => Math.max(max, s.semester), 0),
    [semesters]
  );

  const targetSimulation = useMemo(
    () =>
      simulateTargetCgpaPlan(
        calculation.overallCgpa,
        calculation.totalCredits,
        targetCgpa,
        remainingSemesters,
        creditsPerSemester,
        highestSemesterNumber + 1
      ),
    [
      calculation.overallCgpa,
      calculation.totalCredits,
      targetCgpa,
      remainingSemesters,
      creditsPerSemester,
      highestSemesterNumber,
    ]
  );

  function commitSemesters(updater: (prev: OverviewCalculatorSemester[]) => OverviewCalculatorSemester[]) {
    setSemesters((prev) => {
      const next = updater(prev);
      setHasCustomEdits(true);
      writeSavedSemesters(next);
      return next;
    });
  }

  function handleAddSemester() {
    const maxSem = semesters.reduce((max, s) => Math.max(max, s.semester), 0);
    const nextSemNumber = Math.min(16, maxSem + 1);
    const id = `sem-${nextSemNumber}-${Date.now().toString(36)}`;
    const newSem: OverviewCalculatorSemester = {
      id,
      semester: nextSemNumber,
      inputMode: 'courses',
      sgpa: 8.5,
      credits: 16,
      courses: [
        { id: `${id}-c1`, name: 'Subject 1', grade: 'A+', credits: 4 },
        { id: `${id}-c2`, name: 'Subject 2', grade: 'A+', credits: 4 },
        { id: `${id}-c3`, name: 'Subject 3', grade: 'A', credits: 4 },
        { id: `${id}-c4`, name: 'Subject 4', grade: 'O', credits: 4 },
      ],
    };
    commitSemesters((prev) => [...prev, newSem]);
    setActiveSemesterId(id);
  }

  function handleRemoveSemester(id: string) {
    if (semesters.length <= 1) return;
    const remaining = semesters.filter((s) => s.id !== id);
    commitSemesters(() => remaining);
    if (effectiveActiveId === id) {
      setActiveSemesterId(remaining[remaining.length - 1]?.id ?? '');
    }
  }

  function handleToggleSemesterMode(id: string, nextMode: 'courses' | 'sgpa') {
    const currentBreakdown = calculation.semesters.find((b) => b.id === id);
    commitSemesters((prev) =>
      prev.map((sem) => {
        if (sem.id !== id) return sem;
        if (nextMode === 'sgpa') {
          return {
            ...sem,
            inputMode: 'sgpa',
            sgpa: currentBreakdown && currentBreakdown.credits > 0 ? currentBreakdown.sgpa : sem.sgpa || 8.5,
            credits: currentBreakdown && currentBreakdown.credits > 0 ? currentBreakdown.credits : sem.credits || 20,
          };
        }
        const courses =
          sem.courses.length > 0
            ? sem.courses
            : [
                { id: `${sem.id}-c1`, name: 'Subject 1', grade: 'A+' as GradeLetter, credits: 4 },
                { id: `${sem.id}-c2`, name: 'Subject 2', grade: 'A+' as GradeLetter, credits: 4 },
                { id: `${sem.id}-c3`, name: 'Subject 3', grade: 'A' as GradeLetter, credits: 4 },
                { id: `${sem.id}-c4`, name: 'Subject 4', grade: 'O' as GradeLetter, credits: 4 },
              ];
        return { ...sem, inputMode: 'courses', courses };
      })
    );
  }

  function handleUpdateSemesterField(id: string, field: 'sgpa' | 'credits', rawValue: string) {
    const parsed = Number(rawValue);
    commitSemesters((prev) =>
      prev.map((sem) => {
        if (sem.id !== id) return sem;
        if (field === 'sgpa') {
          return {
            ...sem,
            inputMode: 'sgpa',
            sgpa: Number.isFinite(parsed) ? Math.min(10, Math.max(0, parsed)) : 0,
          };
        }
        return {
          ...sem,
          inputMode: 'sgpa',
          credits: Number.isFinite(parsed) ? Math.min(60, Math.max(0, parsed)) : 0,
        };
      })
    );
  }

  function handleAddCourse(semId: string) {
    commitSemesters((prev) =>
      prev.map((sem) => {
        if (sem.id !== semId) return sem;
        const nextIdx = sem.courses.length + 1;
        return {
          ...sem,
          inputMode: 'courses',
          courses: [
            ...sem.courses,
            {
              id: `${sem.id}-c-${Date.now().toString(36)}-${nextIdx}`,
              name: `Subject ${nextIdx}`,
              grade: 'A+',
              credits: 3,
            },
          ],
        };
      })
    );
  }

  function handleUpdateCourse(
    semId: string,
    courseId: string,
    patch: Partial<Pick<OverviewCalculatorCourse, 'name' | 'grade' | 'credits'>>
  ) {
    commitSemesters((prev) =>
      prev.map((sem) => {
        if (sem.id !== semId) return sem;
        return {
          ...sem,
          courses: sem.courses.map((c) => (c.id === courseId ? { ...c, ...patch } : c)),
        };
      })
    );
  }

  function handleRemoveCourse(semId: string, courseId: string) {
    commitSemesters((prev) =>
      prev.map((sem) => {
        if (sem.id !== semId) return sem;
        if (sem.courses.length <= 1) return sem;
        return {
          ...sem,
          courses: sem.courses.filter((c) => c.id !== courseId),
        };
      })
    );
  }

  function handleLoadErp() {
    if (erpSemesters.length === 0) return;
    const seeded = seedCalculatorFromSemesters(erpSemesters);
    clearSavedSemesters();
    setHasCustomEdits(false);
    setSemesters(seeded);
    setActiveSemesterId(seeded[seeded.length - 1]?.id ?? seeded[0]?.id ?? 'sem-1');
  }

  function handleStartFresh() {
    const starter: OverviewCalculatorSemester[] = [
      {
        id: `sem-1-${Date.now().toString(36)}`,
        semester: 1,
        inputMode: 'courses',
        sgpa: 9.0,
        credits: 12,
        courses: [
          { id: 'fresh-1', name: 'Subject 1', grade: 'O', credits: 4 },
          { id: 'fresh-2', name: 'Subject 2', grade: 'A+', credits: 4 },
          { id: 'fresh-3', name: 'Subject 3', grade: 'A', credits: 4 },
        ],
      },
    ];
    commitSemesters(() => starter);
    setActiveSemesterId(starter[0].id);
  }

  const deltaVsErp =
    erpCgpa !== null && erpCgpa > 0 && calculation.totalCredits > 0
      ? Math.round((calculation.overallCgpa - erpCgpa) * 100) / 100
      : null;

  const progressWidth = Math.min(100, Math.max(0, (calculation.overallCgpa / 10) * 100));

  return (
    <section
      id="overview-cgpa-calculator"
      aria-label="Semester-wise CGPA calculator"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              Semester-Wise CGPA Calculator
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {loading && erpSemesters.length === 0
              ? 'Loading semester records...'
              : `${calculation.semesters.length} ${calculation.semesters.length === 1 ? 'semester' : 'semesters'} · ${calculation.totalCredits} total credits · Sathyabama 10-point grading scale`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="tablist"
            aria-label="Calculator layout"
            className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200 dark:border-slate-700/70"
          >
            <button
              type="button"
              role="tab"
              aria-selected={layoutMode === 'single'}
              onClick={() => setLayoutMode('single')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                layoutMode === 'single'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              By Semester
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={layoutMode === 'all'}
              onClick={() => setLayoutMode('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                layoutMode === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All Semesters
            </button>
          </div>

          {erpSemesters.length > 0 ? (
            <button
              type="button"
              onClick={handleLoadErp}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Sync ERP Grades
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleStartFresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            Start Blank
          </button>

          <button
            type="button"
            onClick={() => onNavigate('results')}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline px-1.5 py-1 whitespace-nowrap cursor-pointer"
          >
            Full Planner
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main 2-Column Calculator Body */}
      <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-200 dark:divide-slate-800">
        {/* Left: Semester Input Workspace */}
        <div className="xl:col-span-8 flex flex-col min-w-0">
          {/* Semester Tabs Bar */}
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Select semester">
              {calculation.semesters.map((item) => {
                const isActive = layoutMode === 'single' && item.id === activeSemester?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveSemesterId(item.id);
                      setLayoutMode('single');
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-blue-700 text-white dark:bg-blue-600'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span>Sem {item.semester}</span>
                    <span
                      className={`font-mono tabular-nums ${
                        isActive ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {item.sgpa.toFixed(2)}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleAddSemester}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-950/30 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Semester
              </button>
            </div>
          </div>

          {/* Single Semester Detailed Editor vs All Semesters Rapid Grid */}
          {layoutMode === 'all' ? (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pl-5 pr-3">Semester</th>
                    <th className="py-2.5 px-3">Entry Mode</th>
                    <th className="py-2.5 px-3 text-right">SGPA (0–10)</th>
                    <th className="py-2.5 px-3 text-right">Credit Points</th>
                    <th className="py-2.5 px-3 text-right">Weighted Pts</th>
                    <th className="py-2.5 px-3 text-right">Running CGPA</th>
                    <th className="py-2.5 pl-2 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  {semesters
                    .slice()
                    .sort((a, b) => a.semester - b.semester)
                    .map((sem) => {
                      const bd = calculation.semesters.find((b) => b.id === sem.id);
                      return (
                        <tr
                          key={sem.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-2.5 pl-5 pr-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            Semester {sem.semester}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSemesterId(sem.id);
                                setLayoutMode('single');
                              }}
                              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              {sem.inputMode === 'courses'
                                ? `${sem.courses.length} subjects · Edit`
                                : 'Direct SGPA · Switch'}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              aria-label={`Semester ${sem.semester} SGPA`}
                              min={0}
                              max={10}
                              step={0.01}
                              value={sem.inputMode === 'sgpa' ? sem.sgpa : (bd?.sgpa ?? 0)}
                              onChange={(e) => handleUpdateSemesterField(sem.id, 'sgpa', e.target.value)}
                              className="w-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              aria-label={`Semester ${sem.semester} credit points`}
                              min={0}
                              max={60}
                              step={0.5}
                              value={sem.inputMode === 'sgpa' ? sem.credits : (bd?.credits ?? 0)}
                              onChange={(e) => handleUpdateSemesterField(sem.id, 'credits', e.target.value)}
                              className="w-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                            {(bd?.gradePoints ?? 0).toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {(bd?.cumulativeCgpa ?? 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 pl-2 pr-5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveSemester(sem.id)}
                              disabled={semesters.length <= 1}
                              aria-label={`Remove Semester ${sem.semester}`}
                              className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>Typing SGPA or Credit Points directly switches that semester to quick SGPA mode.</span>
                <button
                  type="button"
                  onClick={handleAddSemester}
                  className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add Semester
                </button>
              </div>
            </div>
          ) : activeSemester ? (
            <div className="flex-1 flex flex-col">
              {/* Active Semester Sub-header & Input Mode Switch */}
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Semester {activeSemester.semester}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    SGPA {(activeBreakdown?.sgpa ?? 0).toFixed(2)}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {activeBreakdown?.credits ?? 0} cr
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label={`Semester ${activeSemester.semester} entry mode`}
                    className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200 dark:border-slate-700/70"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleSemesterMode(activeSemester.id, 'courses')}
                      aria-pressed={activeSemester.inputMode === 'courses'}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        activeSemester.inputMode === 'courses'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Subject Grades
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSemesterMode(activeSemester.id, 'sgpa')}
                      aria-pressed={activeSemester.inputMode === 'sgpa'}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        activeSemester.inputMode === 'sgpa'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Direct SGPA
                    </button>
                  </div>

                  {semesters.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveSemester(activeSemester.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-red-700 dark:text-slate-400 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/60 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              {activeSemester.inputMode === 'courses' ? (
                <div className="flex-1 flex flex-col">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 pl-5 pr-3">Subject</th>
                          <th className="py-2.5 px-3 w-36">Grade</th>
                          <th className="py-2.5 px-3 w-28 text-right">Credits</th>
                          <th className="py-2.5 px-3 w-24 text-right">Points</th>
                          <th className="py-2.5 pl-2 pr-5 w-12 text-right">
                            <span className="sr-only">Delete</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {activeSemester.courses.map((course, idx) => {
                          const points = (GRADE_POINTS[course.grade] ?? 0) * (Number(course.credits) || 0);
                          return (
                            <tr
                              key={course.id}
                              className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                            >
                              <td className="py-2 pl-5 pr-3">
                                <input
                                  type="text"
                                  aria-label={`Semester ${activeSemester.semester} subject ${idx + 1} name`}
                                  value={course.name}
                                  onChange={(e) =>
                                    handleUpdateCourse(activeSemester.id, course.id, {
                                      name: e.target.value,
                                    })
                                  }
                                  placeholder={`Subject ${idx + 1}`}
                                  className="w-full min-w-[140px] rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500 bg-transparent focus:bg-white dark:focus:bg-slate-950 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <select
                                  aria-label={`${course.name || `Subject ${idx + 1}`} grade`}
                                  value={course.grade}
                                  onChange={(e) =>
                                    handleUpdateCourse(activeSemester.id, course.id, {
                                      grade: e.target.value as GradeLetter,
                                    })
                                  }
                                  className={`w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600/30 ${GRADE_TEXT_TONE[course.grade]}`}
                                >
                                  {ORDERED_GRADES.map((g) => (
                                    <option key={g} value={g} className="text-slate-900 dark:text-slate-100">
                                      {g} ({GRADE_POINTS[g]} pts)
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <input
                                  type="number"
                                  aria-label={`${course.name || `Subject ${idx + 1}`} credits`}
                                  min={0.5}
                                  max={12}
                                  step={0.5}
                                  value={course.credits}
                                  onChange={(e) => {
                                    const num = Number(e.target.value);
                                    handleUpdateCourse(activeSemester.id, course.id, {
                                      credits: Number.isFinite(num) ? Math.min(20, Math.max(0, num)) : 0,
                                    });
                                  }}
                                  className="w-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                                />
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                                {points.toFixed(1)}
                              </td>
                              <td className="py-2 pl-2 pr-5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCourse(activeSemester.id, course.id)}
                                  disabled={activeSemester.courses.length <= 1}
                                  aria-label={`Remove ${course.name || `Subject ${idx + 1}`}`}
                                  className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleAddCourse(activeSemester.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add Subject to Sem {activeSemester.semester}
                    </button>

                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      Sem {activeSemester.semester} total: {(activeBreakdown?.gradePoints ?? 0).toFixed(1)} pts ÷{' '}
                      {activeBreakdown?.credits ?? 0} cr ={' '}
                      <strong className="text-slate-900 dark:text-slate-100">
                        {(activeBreakdown?.sgpa ?? 0).toFixed(2)} SGPA
                      </strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-5 space-y-5 flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`sem-sgpa-${activeSemester.id}`}
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Semester {activeSemester.semester} SGPA (0.00 – 10.00)
                      </label>
                      <input
                        id={`sem-sgpa-${activeSemester.id}`}
                        type="number"
                        min={0}
                        max={10}
                        step={0.01}
                        value={activeSemester.sgpa}
                        onChange={(e) => handleUpdateSemesterField(activeSemester.id, 'sgpa', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor={`sem-credits-${activeSemester.id}`}
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Semester {activeSemester.semester} Credit Points
                      </label>
                      <input
                        id={`sem-credits-${activeSemester.id}`}
                        type="number"
                        min={0}
                        max={60}
                        step={0.5}
                        value={activeSemester.credits}
                        onChange={(e) => handleUpdateSemesterField(activeSemester.id, 'credits', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Quick SGPA slider</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {activeSemester.sgpa.toFixed(2)} SGPA
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label={`Adjust Semester ${activeSemester.semester} SGPA`}
                      min={4}
                      max={10}
                      step={0.05}
                      value={Math.max(4, activeSemester.sgpa)}
                      onChange={(e) => handleUpdateSemesterField(activeSemester.id, 'sgpa', e.target.value)}
                      className="w-full accent-blue-700 dark:accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Right: Live Overall CGPA Readout & Running Semester Breakdown */}
        <div className="xl:col-span-4 p-5 bg-slate-50/50 dark:bg-slate-950/25 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            {/* Hero Metric */}
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Calculated Overall CGPA
              </p>
              <div className="mt-1.5 flex items-baseline gap-2.5 flex-wrap">
                <span
                  data-testid="overview-calculated-cgpa"
                  className="font-mono text-4xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-50"
                >
                  {calculation.overallCgpa.toFixed(2)}
                </span>
                <span className="font-mono text-sm text-slate-400 dark:text-slate-500">/ 10.00</span>
                {deltaVsErp !== null && deltaVsErp !== 0 ? (
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      deltaVsErp > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {deltaVsErp > 0 ? '+' : ''}
                    {deltaVsErp.toFixed(2)} vs ERP
                  </span>
                ) : null}
              </div>

              <div className="mt-2.5 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    calculation.hasArrears
                      ? 'bg-amber-500 dark:bg-amber-400'
                      : calculation.overallCgpa >= 8.5
                        ? 'bg-emerald-600 dark:bg-emerald-500'
                        : calculation.overallCgpa >= 6.5
                          ? 'bg-blue-700 dark:bg-blue-500'
                          : 'bg-amber-600 dark:bg-amber-400'
                  }`}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>

              <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                {calculation.classification}
                {calculation.hasArrears ? (
                  <span className="text-red-700 dark:text-red-400"> · Contains RA grade</span>
                ) : null}
              </p>
            </div>

            {/* 3-stat mini strip */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Credits</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {calculation.totalCredits}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Grade Points</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {calculation.totalGradePoints.toFixed(0)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Equiv. %</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {calculation.equivalentPercent.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Running Semester Breakdown */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Semester Progression
                </span>
                <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                  SGPA / CGPA
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800">
                {calculation.semesters.map((item) => {
                  const selected = layoutMode === 'single' && item.id === activeSemester?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSemesterId(item.id);
                        setLayoutMode('single');
                      }}
                      className={`w-full py-2 px-2 -mx-2 rounded-md flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                        selected
                          ? 'bg-blue-600/10 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="font-medium whitespace-nowrap">
                        Sem {item.semester}
                        <span className="ml-1.5 font-mono text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                          {item.credits} cr
                        </span>
                      </span>
                      <span className="font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-500 dark:text-slate-400">
                          {item.sgpa.toFixed(2)}
                        </span>
                        <span className="mx-1 text-slate-300 dark:text-slate-700">/</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.cumulativeCgpa.toFixed(2)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quiet Grade Scale Reference */}
          <p className="pt-3 border-t border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Scale: O 10 · A+ 9 · A 8 · B+ 7 · B 6 · C 5 · RA 0
          </p>
        </div>
      </div>

      {/* Integrated Target CGPA Simulator */}
      <div
        id="target-cgpa-simulator"
        className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50">
                Target CGPA Simulator
              </h4>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Set your desired graduation CGPA to calculate the required SGPA and subject grade mix across upcoming semesters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0" role="group" aria-label="Target CGPA presets">
            {[7.5, 8.0, 8.5, 9.0, 9.5].map((preset) => {
              const active = Math.abs(targetCgpa - preset) < 0.01;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetCgpa(preset)}
                  aria-pressed={active}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-700 text-white dark:bg-blue-600'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {preset.toFixed(1)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls */}
          <div className="lg:col-span-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="targetCgpaInput"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Desired CGPA
                </label>
                <input
                  id="targetCgpaInput"
                  type="number"
                  min={5}
                  max={10}
                  step={0.05}
                  value={targetCgpa}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    if (Number.isFinite(num)) {
                      setTargetCgpa(Math.min(10, Math.max(0, num)));
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="remainingSemestersInput"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Future Sems
                </label>
                <select
                  id="remainingSemestersInput"
                  value={remainingSemesters}
                  onChange={(e) => setRemainingSemesters(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'sem' : 'sems'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="creditsPerSemesterInput"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Credits / Sem
                </label>
                <input
                  id="creditsPerSemesterInput"
                  type="number"
                  min={4}
                  max={40}
                  step={1}
                  value={creditsPerSemester}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    if (Number.isFinite(num)) {
                      setCreditsPerSemester(Math.min(40, Math.max(4, Math.round(num))));
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Adjust target CGPA</span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  Max reachable: {targetSimulation.maxPossibleCgpa.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                aria-label="Desired Target CGPA slider"
                min={5.5}
                max={10}
                step={0.05}
                value={Math.min(10, Math.max(5.5, targetCgpa))}
                onChange={(e) => setTargetCgpa(Number(e.target.value))}
                className="w-full accent-blue-700 dark:accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Live Simulation Result */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Required Avg SGPA
                </p>
                <p
                  data-testid="target-required-sgpa"
                  className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                    targetSimulation.status === 'unreachable'
                      ? 'text-red-700 dark:text-red-400'
                      : targetSimulation.status === 'challenging'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {targetSimulation.requiredAverageSgpa.toFixed(2)}
                </p>
                <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  over {targetSimulation.totalFutureCredits} future cr
                </p>
              </div>

              <div className="sm:col-span-2">
                <p
                  className={`text-sm font-semibold ${
                    targetSimulation.status === 'unreachable'
                      ? 'text-red-700 dark:text-red-400'
                      : targetSimulation.status === 'challenging'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {targetSimulation.headline}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {targetSimulation.detail}
                </p>
              </div>
            </div>

            {/* Recommended Grade Mix + Future Milestones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Suggested Grade Mix per Semester (~{targetSimulation.coursesPerSemesterEstimate} subjects)
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono tabular-nums">
                  {targetSimulation.recommendedGradeMix.map((item) => (
                    <span key={item.grade} className="inline-flex items-baseline gap-1">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.count}×
                      </span>
                      <span className={`font-semibold ${GRADE_TEXT_TONE[item.grade]}`}>
                        {item.grade}
                      </span>
                      <span className="text-[11px] text-slate-400">({item.points})</span>
                    </span>
                  ))}
                  <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">→</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {targetSimulation.recommendedMixSgpa.toFixed(2)} SGPA
                  </span>
                </div>
              </div>

              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Projected Semester Milestones
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono tabular-nums">
                  {targetSimulation.milestones.map((m, idx) => (
                    <span key={m.label} className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      {idx > 0 ? <span className="text-slate-300 dark:text-slate-700 mr-1">→</span> : null}
                      <span>{m.label}:</span>
                      <strong className="text-slate-900 dark:text-slate-100">
                        {m.projectedCgpa.toFixed(2)}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
