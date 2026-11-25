import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildCgpaTrajectory,
  computeCgpaSummary,
  computeProjectedCgpa,
  evaluateCgpaThreshold,
  GRADE_POINTS,
  ORDERED_GRADES,
  planTargetCgpa,
  type CgpaTrajectoryPoint,
  type SimulatedFutureSemester,
} from '../core/gpa';
import type { GradeLetter, PlannedCourse, ResultsPayload } from '../core/types';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface ResultsViewProps {
  section: SectionState<ResultsPayload>;
  onRetry: () => void;
}

const THRESHOLD_STORAGE_KEY = 'usp_cgpa_warning_threshold';

function readInitialWarningThreshold(): number {
  try {
    const raw = window.localStorage.getItem(THRESHOLD_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 5 && parsed <= 10) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return 8.5;
}

function buildDefaultFutureSemesters(currentSemester: number): SimulatedFutureSemester[] {
  const defaults: SimulatedFutureSemester[] = [];
  const targetGradSem = Math.max(currentSemester + 2, 8);
  for (let sem = currentSemester + 1; sem <= targetGradSem; sem += 1) {
    defaults.push({
      semester: sem,
      expectedSgpa: sem === targetGradSem ? 9.2 : 9.0,
      credits: sem === targetGradSem ? 16 : 20,
    });
  }
  return defaults;
}

interface TrajectoryTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CgpaTrajectoryPoint }>;
  warningThreshold: number;
}

function TrajectoryTooltip({ active, payload, warningThreshold }: TrajectoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const stageLabel =
    point.kind === 'completed'
      ? 'Completed'
      : point.kind === 'planned'
        ? 'Active grade plan'
        : 'Future simulation';
  const belowThreshold = point.kind !== 'completed' && point.cgpa < warningThreshold;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 shadow-lg text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-display font-semibold text-slate-900 dark:text-slate-50">
          {point.label}
        </span>
        <span className="text-slate-500 dark:text-slate-400">{stageLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 font-mono tabular-nums">
        <span className="text-slate-500 dark:text-slate-400">Cumulative CGPA</span>
        <span
          className={`text-right font-semibold ${
            belowThreshold
              ? 'text-red-700 dark:text-red-400'
              : 'text-slate-900 dark:text-slate-50'
          }`}
        >
          {point.cgpa.toFixed(2)}
        </span>
        <span className="text-slate-500 dark:text-slate-400">Semester SGPA</span>
        <span className="text-right text-slate-700 dark:text-slate-300">
          {point.sgpa.toFixed(2)}
        </span>
        <span className="text-slate-500 dark:text-slate-400">Sem / Total Credits</span>
        <span className="text-right text-slate-700 dark:text-slate-300">
          {point.credits} / {point.cumulativeCredits} cr
        </span>
      </div>
      {belowThreshold ? (
        <p className="pt-1 border-t border-slate-100 dark:border-slate-800 text-red-700 dark:text-red-400 font-medium">
          Below {warningThreshold.toFixed(2)} alert threshold by{' '}
          {(warningThreshold - point.cgpa).toFixed(2)}
        </p>
      ) : null}
    </div>
  );
}

interface ProjectedDotProps {
  cx?: number;
  cy?: number;
  payload?: CgpaTrajectoryPoint;
  warningThreshold: number;
}

function ProjectedCgpaDot({ cx, cy, payload, warningThreshold }: ProjectedDotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null;
  if (payload.projectedCgpa === null) return null;

  const isBreach = payload.kind !== 'completed' && payload.cgpa < warningThreshold;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isBreach ? 4.5 : 4}
      fill="var(--chart-dot-fill)"
      stroke={isBreach ? 'var(--chart-warning)' : 'var(--chart-projected)'}
      strokeWidth={2}
    />
  );
}

export function ResultsView({ section, onRetry }: ResultsViewProps) {
  const payload = section.envelope?.data ?? null;
  const [targetCgpa, setTargetCgpa] = useState<number>(8.9);
  const [warningThreshold, setWarningThreshold] = useState<number>(readInitialWarningThreshold);
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>([]);
  const [futureSemesters, setFutureSemesters] = useState<SimulatedFutureSemester[]>([]);
  const [futureInitialized, setFutureInitialized] = useState(false);
  const [showSgpaSeries, setShowSgpaSeries] = useState(true);
  const [expandedSem, setExpandedSem] = useState<number | null>(5);

  useEffect(() => {
    try {
      window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(warningThreshold));
    } catch {
      // Ignore storage errors
    }
  }, [warningThreshold]);

  useEffect(() => {
    if (payload && plannedCourses.length === 0) {
      setPlannedCourses(payload.currentCourses);
    }
    if (payload && !futureInitialized) {
      setFutureSemesters(buildDefaultFutureSemesters(payload.currentSemester));
      setFutureInitialized(true);
    }
  }, [payload, plannedCourses.length, futureInitialized]);

  const summary = useMemo(
    () => (payload ? computeCgpaSummary(payload.semesters) : null),
    [payload]
  );

  const upcomingCredits = useMemo(
    () => plannedCourses.reduce((sum, c) => sum + c.credits, 0) || 20,
    [plannedCourses]
  );

  const targetPlan = useMemo(() => {
    if (!summary) return null;
    return planTargetCgpa(summary.cgpa, summary.completedCredits, upcomingCredits, targetCgpa);
  }, [summary, upcomingCredits, targetCgpa]);

  const projection = useMemo(() => {
    if (!summary) return null;
    return computeProjectedCgpa(summary.cgpa, summary.completedCredits, plannedCourses);
  }, [summary, plannedCourses]);

  const trajectory = useMemo(() => {
    if (!payload) return null;
    return buildCgpaTrajectory(
      payload.semesters,
      payload.currentSemester,
      plannedCourses,
      futureSemesters
    );
  }, [payload, plannedCourses, futureSemesters]);

  const thresholdEval = useMemo(() => {
    if (!trajectory) return null;
    return evaluateCgpaThreshold(trajectory, warningThreshold);
  }, [trajectory, warningThreshold]);

  const yDomain = useMemo<[number, number]>(() => {
    if (!trajectory || trajectory.points.length === 0) return [6, 10];
    const values = [targetCgpa, warningThreshold];
    for (const pt of trajectory.points) {
      values.push(pt.cgpa);
      if (showSgpaSeries) values.push(pt.sgpa);
    }
    const minVal = Math.min(...values);
    const floorBound = Math.max(0, Math.floor((minVal - 0.35) * 2) / 2);
    return [Math.min(floorBound, 8.5), 10];
  }, [trajectory, targetCgpa, warningThreshold, showSgpaSeries]);

  const trajectoryBySemester = useMemo(() => {
    const map = new Map<number, CgpaTrajectoryPoint>();
    for (const pt of trajectory?.points ?? []) {
      map.set(pt.semester, pt);
    }
    return map;
  }, [trajectory]);

  function updatePlannedGrade(courseCode: string, expectedGrade: GradeLetter) {
    setPlannedCourses((prev) =>
      prev.map((c) => (c.courseCode === courseCode ? { ...c, expectedGrade } : c))
    );
  }

  function updateFutureSemester(
    semester: number,
    patch: Partial<Pick<SimulatedFutureSemester, 'expectedSgpa' | 'credits'>>
  ) {
    setFutureSemesters((prev) =>
      prev.map((item) => (item.semester === semester ? { ...item, ...patch } : item))
    );
  }

  function addFutureSemester() {
    if (!payload) return;
    setFutureSemesters((prev) => {
      if (prev.length >= 6) return prev;
      const lastSem =
        prev.length > 0 ? prev[prev.length - 1].semester : payload.currentSemester;
      const lastSgpa = prev.length > 0 ? prev[prev.length - 1].expectedSgpa : 9.0;
      return [
        ...prev,
        {
          semester: lastSem + 1,
          expectedSgpa: lastSgpa,
          credits: 20,
        },
      ];
    });
  }

  function removeFutureSemester(semester: number) {
    setFutureSemesters((prev) => prev.filter((s) => s.semester !== semester));
  }

  function applyFuturePreset(sgpa: number) {
    setFutureSemesters((prev) => prev.map((s) => ({ ...s, expectedSgpa: sgpa })));
  }

  function resetFutureSimulation() {
    if (!payload) return;
    setFutureSemesters(buildDefaultFutureSemesters(payload.currentSemester));
  }

  function applyRecoverySgpa() {
    if (
      !thresholdEval ||
      !thresholdEval.simulatedAchievable ||
      thresholdEval.requiredSimulatedSgpa === null
    ) {
      return;
    }
    // Round up to nearest 0.05 so the simulated final CGPA strictly clears the threshold
    const targetSgpaStep = Math.min(
      10,
      Math.ceil(thresholdEval.requiredSimulatedSgpa * 20) / 20
    );
    setFutureSemesters((prev) =>
      prev.map((s) => ({ ...s, expectedSgpa: targetSgpaStep }))
    );
  }

  return (
    <div className="space-y-6">
      <StaleBanner
        warning={section.envelope?.warning}
        fetchedAt={section.envelope?.fetchedAt}
        onRetry={onRetry}
        retrying={section.loading}
      />

      {section.loading && !payload ? (
        <SectionSkeleton rows={5} />
      ) : section.error && !payload ? (
        <SectionError sectionName="Results & CGPA" message={section.error} onRetry={onRetry} />
      ) : payload && summary ? (
        <>
          {/* KPI Row */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Current CGPA</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {summary.cgpa.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Across {summary.completedCredits} completed credits
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Best Semester</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {summary.bestSemester ? summary.bestSemester.sgpa.toFixed(2) : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {summary.bestSemester
                  ? `Semester ${summary.bestSemester.semester} · ${summary.bestSemester.termLabel}`
                  : '—'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Sem {payload.currentSemester} Projected CGPA
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                {projection ? projection.projectedCgpa.toFixed(2) : summary.cgpa.toFixed(2)}
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {projection
                  ? `Sem ${payload.currentSemester} SGPA ${projection.plannedSgpa.toFixed(2)} (${projection.deltaCgpa >= 0 ? '+' : ''}${projection.deltaCgpa.toFixed(2)})`
                  : '—'}
              </p>
            </div>

            <div
              className={`rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 ${
                thresholdEval?.finalBelow
                  ? 'border-red-300 dark:border-red-800/80'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Simulated Final CGPA
                </p>
                {thresholdEval?.finalBelow ? (
                  <AlertTriangle
                    className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <p
                className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                  thresholdEval?.finalBelow
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-teal-700 dark:text-teal-400'
                }`}
              >
                {trajectory ? trajectory.finalCgpa.toFixed(2) : summary.cgpa.toFixed(2)}
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums">
                {thresholdEval?.finalBelow ? (
                  <span className="text-red-700 dark:text-red-400 font-medium">
                    -{thresholdEval.shortfall.toFixed(2)} below {thresholdEval.threshold.toFixed(2)} limit
                  </span>
                ) : trajectory ? (
                  <span className="text-slate-600 dark:text-slate-400">
                    {trajectory.deltaFromBaseline >= 0 ? '+' : ''}
                    {trajectory.deltaFromBaseline.toFixed(2)} net · {trajectory.finalCredits} cr
                  </span>
                ) : (
                  '—'
                )}
              </p>
            </div>
          </section>

          {/* Threshold Warning Notification */}
          {thresholdEval?.isBelowThreshold && trajectory ? (
            <div
              role="alert"
              className={`rounded-xl border px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                thresholdEval.finalBelow
                  ? 'border-red-300/90 dark:border-red-800/80 bg-red-50/90 dark:bg-red-950/35 text-red-950 dark:text-red-100'
                  : 'border-amber-300/90 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/35 text-amber-950 dark:text-amber-100'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    thresholdEval.finalBelow
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold leading-snug">
                    {thresholdEval.finalBelow
                      ? `Simulated CGPA (${trajectory.finalCgpa.toFixed(2)}) falls below your ${thresholdEval.threshold.toFixed(2)} threshold`
                      : `Simulated trajectory dips below your ${thresholdEval.threshold.toFixed(2)} threshold`}
                  </p>
                  <p className="text-xs opacity-90 leading-relaxed tabular-nums">
                    {thresholdEval.breachedSemesters.length > 0
                      ? `Below threshold in ${thresholdEval.breachedSemesters.map((s) => `Sem ${s.semester} (${s.cgpa.toFixed(2)})`).join(', ')}. `
                      : ''}
                    {thresholdEval.finalBelow && thresholdEval.requiredAverageFutureSgpa !== null
                      ? thresholdEval.achievable
                        ? `Maintain at least ${thresholdEval.requiredAverageFutureSgpa.toFixed(2)} average SGPA across remaining ${thresholdEval.remainingCredits} credits to stay above ${thresholdEval.threshold.toFixed(2)}.`
                        : `Reaching ${thresholdEval.threshold.toFixed(2)} requires ${thresholdEval.requiredAverageFutureSgpa.toFixed(2)} average SGPA (above 10.00 scale).`
                      : 'Your final simulated semester recovers back above the threshold.'}
                  </p>
                </div>
              </div>

              {thresholdEval.finalBelow &&
              thresholdEval.simulatedAchievable &&
              futureSemesters.length > 0 &&
              thresholdEval.requiredSimulatedSgpa !== null ? (
                <button
                  type="button"
                  onClick={applyRecoverySgpa}
                  className="inline-flex items-center justify-center rounded-lg border border-red-400/80 dark:border-red-700 bg-white/80 dark:bg-red-950/60 px-3.5 py-2 text-xs font-medium text-red-900 dark:text-red-100 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Lift future SGPA to {Math.min(10, Math.ceil(thresholdEval.requiredSimulatedSgpa * 20) / 20).toFixed(2)}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* CGPA Trajectory & Future Semester Simulator */}
          {trajectory ? (
            <section
              aria-label="CGPA trajectory and future semester simulator"
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
            >
              <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-50">
                      CGPA Trajectory &amp; Future Semester Simulator
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Combines completed transcripts, your Semester {payload.currentSemester} grade plan, and simulated future semesters.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 self-start sm:self-auto shrink-0">
                    <label
                      htmlFor="warningThresholdInput"
                      className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
                    >
                      Alert below
                    </label>
                    <input
                      id="warningThresholdInput"
                      type="number"
                      min={5}
                      max={10}
                      step={0.05}
                      value={warningThreshold}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) {
                          setWarningThreshold(Math.min(10, Math.max(5, val)));
                        }
                      }}
                      aria-label="Minimum CGPA warning threshold"
                      className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                    />
                    {thresholdEval ? (
                      thresholdEval.isBelowThreshold ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Alert
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Safe
                        </span>
                      )
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div
                    role="group"
                    aria-label="Future SGPA scenario presets"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
                  >
                    {(
                      [
                        { label: '8.0 Conservative', value: 8.0 },
                        { label: '8.8 Steady', value: 8.8 },
                        { label: '9.5 Stretch', value: 9.5 },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyFuturePreset(preset.value)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSgpaSeries((prev) => !prev)}
                    aria-pressed={showSgpaSeries}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showSgpaSeries
                        ? 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {showSgpaSeries ? 'Hide SGPA line' : 'Show SGPA line'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-200 dark:divide-slate-800">
                {/* Recharts Line Chart */}
                <div className="xl:col-span-7 p-5 sm:p-6 min-w-0 flex flex-col justify-between gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-0.5 w-4 rounded-full"
                          style={{ backgroundColor: 'var(--chart-actual)' }}
                          aria-hidden="true"
                        />
                        Actual CGPA
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-0.5 w-4 border-t-2 border-dashed"
                          style={{ borderColor: 'var(--chart-projected)' }}
                          aria-hidden="true"
                        />
                        Projected CGPA
                      </span>
                      {showSgpaSeries ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-0.5 w-4 rounded-full"
                            style={{ backgroundColor: 'var(--chart-sgpa)' }}
                            aria-hidden="true"
                          />
                          Semester SGPA
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-0.5 w-4 border-t-2 border-dotted"
                          style={{ borderColor: 'var(--chart-target)' }}
                          aria-hidden="true"
                        />
                        Target ({targetCgpa.toFixed(2)})
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-0.5 w-4 border-t-2 border-dashed"
                          style={{ borderColor: 'var(--chart-warning)' }}
                          aria-hidden="true"
                        />
                        Alert ({warningThreshold.toFixed(2)})
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      10-point scale
                    </span>
                  </div>

                  <div className="h-[270px] sm:h-[295px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trajectory.points}
                        margin={{ top: 12, right: 16, left: -12, bottom: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--chart-grid)"
                        />
                        <XAxis
                          dataKey="shortLabel"
                          tick={{ fill: 'var(--chart-axis)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                          tickLine={false}
                          axisLine={{ stroke: 'var(--chart-grid)' }}
                          dy={6}
                        />
                        <YAxis
                          domain={yDomain}
                          tick={{ fill: 'var(--chart-axis)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => v.toFixed(1)}
                        />
                        <Tooltip content={<TrajectoryTooltip warningThreshold={warningThreshold} />} />
                        <ReferenceLine
                          y={targetCgpa}
                          stroke="var(--chart-target)"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                        />
                        <ReferenceLine
                          y={warningThreshold}
                          stroke="var(--chart-warning)"
                          strokeDasharray="3 3"
                          strokeWidth={1.5}
                        />
                        {showSgpaSeries ? (
                          <Line
                            type="monotone"
                            dataKey="sgpa"
                            name="Semester SGPA"
                            stroke="var(--chart-sgpa)"
                            strokeWidth={1.75}
                            dot={{ r: 3, fill: 'var(--chart-dot-fill)', stroke: 'var(--chart-sgpa)', strokeWidth: 1.75 }}
                            activeDot={{ r: 5 }}
                            isAnimationActive={false}
                          />
                        ) : null}
                        <Line
                          type="monotone"
                          dataKey="completedCgpa"
                          name="Actual CGPA"
                          stroke="var(--chart-actual)"
                          strokeWidth={2.5}
                          connectNulls={false}
                          dot={{ r: 4, fill: 'var(--chart-dot-fill)', stroke: 'var(--chart-actual)', strokeWidth: 2 }}
                          activeDot={{ r: 6 }}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="projectedCgpa"
                          name="Projected CGPA"
                          stroke="var(--chart-projected)"
                          strokeWidth={2.5}
                          strokeDasharray="6 4"
                          connectNulls={false}
                          dot={<ProjectedCgpaDot warningThreshold={warningThreshold} />}
                          activeDot={{ r: 6 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Future Semesters Editor */}
                <div className="xl:col-span-5 flex flex-col">
                  <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Future Semesters
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Adjust expected SGPA &amp; credits beyond Sem {payload.currentSemester}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={resetFutureSimulation}
                        aria-label="Reset future semester simulation"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={addFutureSemester}
                        disabled={futureSemesters.length >= 6}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add semester
                      </button>
                    </div>
                  </div>

                  {futureSemesters.length === 0 ? (
                    <div className="p-6 text-center space-y-2.5 my-auto">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        No future semesters added beyond Semester {payload.currentSemester}.
                      </p>
                      <button
                        type="button"
                        onClick={addFutureSemester}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Simulate Semester {payload.currentSemester + 1}
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 flex-1">
                      {futureSemesters.map((fut) => {
                        const pt = trajectoryBySemester.get(fut.semester);
                        const prevPt = trajectoryBySemester.get(fut.semester - 1);
                        const stepDelta =
                          pt && prevPt ? Math.round((pt.cgpa - prevPt.cgpa) * 100) / 100 : null;
                        const rowBreached = Boolean(pt && pt.cgpa < warningThreshold);

                        return (
                          <div key={fut.semester} className="px-5 py-3.5 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                  Semester {fut.semester}
                                </span>
                                {pt ? (
                                  <span
                                    className={`font-mono text-xs tabular-nums whitespace-nowrap ${
                                      rowBreached
                                        ? 'text-red-700 dark:text-red-400 font-medium'
                                        : 'text-teal-700 dark:text-teal-400'
                                    }`}
                                  >
                                    → {pt.cgpa.toFixed(2)} CGPA
                                    {stepDelta !== null
                                      ? ` (${stepDelta >= 0 ? '+' : ''}${stepDelta.toFixed(2)})`
                                      : ''}
                                  </span>
                                ) : null}
                                {rowBreached ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
                                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                                    Below {warningThreshold.toFixed(2)}
                                  </span>
                                ) : null}
                              </div>

                              <button
                                type="button"
                                onClick={() => removeFutureSemester(fut.semester)}
                                aria-label={`Remove simulated Semester ${fut.semester}`}
                                className="rounded-md p-1.5 text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>

                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min={5.0}
                                max={10.0}
                                step={0.05}
                                value={fut.expectedSgpa}
                                onChange={(e) =>
                                  updateFutureSemester(fut.semester, {
                                    expectedSgpa: Number(e.target.value),
                                  })
                                }
                                aria-label={`Expected SGPA slider for Semester ${fut.semester}`}
                                className="flex-1 accent-teal-700 dark:accent-teal-400 cursor-pointer"
                              />

                              <div className="flex items-center gap-2 shrink-0">
                                <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                  <span>SGPA</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={10}
                                    step={0.05}
                                    value={fut.expectedSgpa}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      if (Number.isFinite(val)) {
                                        updateFutureSemester(fut.semester, {
                                          expectedSgpa: Math.min(10, Math.max(0, val)),
                                        });
                                      }
                                    }}
                                    aria-label={`Expected SGPA for Semester ${fut.semester}`}
                                    className="w-16 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                                  />
                                </label>

                                <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                  <span>Cr</span>
                                  <input
                                    type="number"
                                    min={4}
                                    max={30}
                                    step={1}
                                    value={fut.credits}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      if (Number.isFinite(val)) {
                                        updateFutureSemester(fut.semester, {
                                          credits: Math.min(30, Math.max(4, Math.round(val))),
                                        });
                                      }
                                    }}
                                    aria-label={`Credits for Semester ${fut.semester}`}
                                    className="w-14 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {/* Planner Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Target CGPA Calculator */}
            <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                  Target CGPA Calculator
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Find the exact Semester {payload.currentSemester} SGPA needed to reach your goal.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="targetCgpaInput"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
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
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) setTargetCgpa(Math.min(10, Math.max(5, val)));
                    }}
                    className="w-24 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-right font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <input
                  type="range"
                  min={7.0}
                  max={9.5}
                  step={0.05}
                  value={Math.min(9.5, Math.max(7.0, targetCgpa))}
                  onChange={(e) => setTargetCgpa(Number(e.target.value))}
                  aria-label="Desired CGPA slider"
                  className="w-full accent-blue-700 dark:accent-blue-500 cursor-pointer"
                />

                <div className="flex justify-between font-mono text-[11px] text-slate-400 tabular-nums">
                  <span>7.00</span>
                  <span>8.25</span>
                  <span>9.50</span>
                </div>
              </div>

              {targetPlan ? (
                <div
                  className={`rounded-lg border p-4 text-sm ${
                    targetPlan.achievable
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200'
                      : 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/20 text-red-950 dark:text-red-200'
                  }`}
                >
                  <p className="font-mono text-lg font-semibold tabular-nums">
                    Required SGPA: {targetPlan.requiredSgpa.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed opacity-90">{targetPlan.message}</p>
                </div>
              ) : null}
            </section>

            {/* Semester VI Grade Planner */}
            <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                    Semester {payload.currentSemester} Grade Planner
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Pick expected grades per course to simulate your upcoming SGPA and CGPA.
                  </p>
                </div>
                {projection ? (
                  <span className="font-mono text-xs font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                    Planned SGPA {projection.plannedSgpa.toFixed(2)}
                  </span>
                ) : null}
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {plannedCourses.map((course) => (
                  <div
                    key={course.courseCode}
                    className="px-5 py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {course.courseName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {course.courseCode} · {course.credits} credits
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {GRADE_POINTS[course.expectedGrade]} pts
                      </span>
                      <select
                        aria-label={`Expected grade for ${course.courseName}`}
                        value={course.expectedGrade}
                        onChange={(e) =>
                          updatePlannedGrade(course.courseCode, e.target.value as GradeLetter)
                        }
                        className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none cursor-pointer"
                      >
                        {ORDERED_GRADES.map((g) => (
                          <option key={g} value={g}>
                            {g} ({GRADE_POINTS[g]})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Past Semester History */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                Semester History
              </h2>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {[...payload.semesters].reverse().map((sem) => {
                const isOpen = expandedSem === sem.semester;
                return (
                  <div key={sem.semester}>
                    <button
                      type="button"
                      onClick={() => setExpandedSem(isOpen ? null : sem.semester)}
                      aria-expanded={isOpen}
                      className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                        )}
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Semester {sem.semester}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {sem.termLabel} · {sem.credits} credits
                        </span>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        SGPA {sem.sgpa.toFixed(2)}
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/40 overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                              <th className="py-2.5 pl-11 pr-4">Code</th>
                              <th className="py-2.5 px-4">Subject</th>
                              <th className="py-2.5 px-4 text-right">Credits</th>
                              <th className="py-2.5 pl-4 pr-5 text-right">Grade</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                            {sem.courses.map((c) => (
                              <tr key={c.courseCode}>
                                <td className="py-2.5 pl-11 pr-4 font-mono text-slate-600 dark:text-slate-400">
                                  {c.courseCode}
                                </td>
                                <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 font-medium">
                                  {c.courseName}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                                  {c.credits}
                                </td>
                                <td className="py-2.5 pl-4 pr-5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                  {c.grade} ({c.gradePoints})
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
