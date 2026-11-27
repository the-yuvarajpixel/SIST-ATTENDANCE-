import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  buildGradeDistribution,
  computeCgpaSummary,
  computeProjectedCgpa,
  computeSemesterGpa,
  evaluateCgpaThreshold,
  GRADE_POINTS,
  ORDERED_GRADES,
  planTargetCgpa,
  resolveFutureSemesterStats,
  type CgpaTrajectoryPoint,
  type GradeDistributionBucket,
  type GradeDistributionScope,
  type GradeDistributionSubjectItem,
  type SimulatedFutureSemester,
} from '../core/gpa';
import type { GradeLetter, NavSection, PlannedCourse, ResultsPayload } from '../core/types';
import type { SectionState } from './OverviewView';
import { SectionError, SectionSkeleton, StaleBanner } from './SectionNotice';

interface ResultsViewProps {
  section: SectionState<ResultsPayload>;
  onNavigate?: (section: NavSection) => void;
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

function buildDefaultCoursesForFutureSemester(semester: number): PlannedCourse[] {
  if (semester === 7) {
    return [
      { courseCode: 'SCSA1701', courseName: 'Distributed Cloud Systems', credits: 4, expectedGrade: 'A+' },
      { courseCode: 'SCSA1702', courseName: 'Deep Learning & Neural Nets', credits: 4, expectedGrade: 'O' },
      { courseCode: 'SCSA1703', courseName: 'Cryptography & Network Security', credits: 4, expectedGrade: 'A+' },
      { courseCode: 'SCSA1704', courseName: 'Professional Elective III', credits: 4, expectedGrade: 'A+' },
      { courseCode: 'SCSA3701', courseName: 'Major Project — Phase I', credits: 4, expectedGrade: 'O' },
    ];
  }
  if (semester === 8) {
    return [
      { courseCode: 'SCSA1801', courseName: 'Enterprise DevOps & SRE', credits: 3, expectedGrade: 'A+' },
      { courseCode: 'SCSA1802', courseName: 'Open Elective', credits: 3, expectedGrade: 'A+' },
      { courseCode: 'SCSA3801', courseName: 'Major Project — Phase II & Viva', credits: 10, expectedGrade: 'O' },
    ];
  }
  return [
    { courseCode: `SEM${semester}-C1`, courseName: `Core Course I (Sem ${semester})`, credits: 4, expectedGrade: 'A+' },
    { courseCode: `SEM${semester}-C2`, courseName: `Core Course II (Sem ${semester})`, credits: 4, expectedGrade: 'A+' },
    { courseCode: `SEM${semester}-C3`, courseName: `Professional Elective (Sem ${semester})`, credits: 4, expectedGrade: 'O' },
    { courseCode: `SEM${semester}-C4`, courseName: `Open Elective / Lab (Sem ${semester})`, credits: 4, expectedGrade: 'A+' },
  ];
}

function buildDefaultFutureSemesters(currentSemester: number): SimulatedFutureSemester[] {
  const defaults: SimulatedFutureSemester[] = [];
  const targetGradSem = Math.max(currentSemester + 2, 8);
  for (let sem = currentSemester + 1; sem <= targetGradSem; sem += 1) {
    const courses = buildDefaultCoursesForFutureSemester(sem);
    const computed = computeSemesterGpa(courses.map((c) => ({ credits: c.credits, grade: c.expectedGrade })));
    defaults.push({
      semester: sem,
      expectedSgpa: computed.sgpa,
      credits: computed.credits,
      courses,
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

const GRADE_BAR_COLOR: Record<GradeLetter, string> = {
  O: 'var(--chart-grade-o)',
  'A+': 'var(--chart-grade-ap)',
  A: 'var(--chart-grade-a)',
  'B+': 'var(--chart-grade-bp)',
  B: 'var(--chart-grade-b)',
  C: 'var(--chart-grade-c)',
  RA: 'var(--chart-grade-ra)',
};

const GRADE_TEXT_CLASS: Record<GradeLetter, string> = {
  O: 'text-emerald-700 dark:text-emerald-400',
  'A+': 'text-blue-700 dark:text-blue-400',
  A: 'text-sky-700 dark:text-sky-400',
  'B+': 'text-teal-700 dark:text-teal-400',
  B: 'text-amber-700 dark:text-amber-400',
  C: 'text-orange-700 dark:text-orange-400',
  RA: 'text-red-700 dark:text-red-400',
};

interface GradeDistTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: GradeDistributionBucket }>;
  metric: 'count' | 'credits';
}

function GradeDistributionTooltip({ active, payload, metric }: GradeDistTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 max-w-[260px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-display font-semibold text-slate-900 dark:text-slate-50">
          Grade {bucket.grade}
        </span>
        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {bucket.gradePoints} pts
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 font-mono tabular-nums">
        <span className="text-slate-500 dark:text-slate-400">Subjects</span>
        <span
          className={`text-right ${
            metric === 'count'
              ? 'font-semibold text-slate-900 dark:text-slate-50'
              : 'text-slate-700 dark:text-slate-300'
          }`}
        >
          {bucket.count} ({bucket.sharePercent.toFixed(1)}%)
        </span>
        <span className="text-slate-500 dark:text-slate-400">Credits</span>
        <span
          className={`text-right ${
            metric === 'credits'
              ? 'font-semibold text-slate-900 dark:text-slate-50'
              : 'text-slate-700 dark:text-slate-300'
          }`}
        >
          {bucket.credits} cr ({bucket.creditSharePercent.toFixed(1)}%)
        </span>
      </div>
      {bucket.subjects.length > 0 ? (
        <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
          {bucket.subjects.slice(0, 4).map((s) => (
            <p
              key={`${s.semester}-${s.courseCode}`}
              className="text-[11px] text-slate-600 dark:text-slate-300 truncate"
            >
              <span className="font-mono text-slate-400 mr-1.5">{s.courseCode}</span>
              {s.courseName}
            </p>
          ))}
          {bucket.subjects.length > 4 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              +{bucket.subjects.length - 4} more {bucket.subjects.length - 4 === 1 ? 'subject' : 'subjects'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface SubjectGradeTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: GradeDistributionSubjectItem }>;
}

function SubjectGradeTooltip({ active, payload }: SubjectGradeTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 max-w-[260px]">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <p className="font-display font-semibold text-slate-900 dark:text-slate-50">
          {item.courseName}
        </p>
        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {item.courseCode} · Sem {item.semester} ({item.termLabel})
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 font-mono tabular-nums">
        <span className="text-slate-500 dark:text-slate-400">Grade</span>
        <span className={`text-right font-semibold ${GRADE_TEXT_CLASS[item.grade]}`}>
          {item.grade} ({item.gradePoints}/10)
        </span>
        <span className="text-slate-500 dark:text-slate-400">Credits</span>
        <span className="text-right text-slate-700 dark:text-slate-300">{item.credits} cr</span>
      </div>
    </div>
  );
}

export function ResultsView({ section, onNavigate, onRetry }: ResultsViewProps) {
  const payload = section.envelope?.data ?? null;
  const [targetCgpa, setTargetCgpa] = useState<number>(8.9);
  const [warningThreshold, setWarningThreshold] = useState<number>(readInitialWarningThreshold);
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>([]);
  const [futureSemesters, setFutureSemesters] = useState<SimulatedFutureSemester[]>([]);
  const [activePlannerSem, setActivePlannerSem] = useState<number | null>(null);
  const [showSgpaSeries, setShowSgpaSeries] = useState(true);
  const [expandedSem, setExpandedSem] = useState<number | null>(5);
  const [gradeScope, setGradeScope] = useState<GradeDistributionScope>('all');
  const [gradeChartMode, setGradeChartMode] = useState<'by-grade' | 'by-subject'>('by-grade');
  const [gradeMetric, setGradeMetric] = useState<'count' | 'credits'>('count');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<GradeLetter | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(warningThreshold));
    } catch {
      // Ignore storage errors
    }
  }, [warningThreshold]);

  useEffect(() => {
    if (!payload) return;
    setPlannedCourses(payload.currentCourses);
    const nextFutures = buildDefaultFutureSemesters(payload.currentSemester);
    setFutureSemesters(nextFutures);
    setActivePlannerSem(nextFutures[0]?.semester ?? payload.currentSemester);
    if (payload.semesters.length > 0) {
      setExpandedSem(payload.semesters[payload.semesters.length - 1].semester);
    }
  }, [payload]);

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

  const gradeDistribution = useMemo(() => {
    if (!payload) return null;
    return buildGradeDistribution(payload.semesters, {
      scope: gradeScope,
      currentSemester: payload.currentSemester,
      plannedCourses,
    });
  }, [payload, gradeScope, plannedCourses]);

  const filteredGradeSubjects = useMemo(() => {
    if (!gradeDistribution) return [];
    if (!selectedGradeFilter) return gradeDistribution.subjects;
    return gradeDistribution.subjects.filter((s) => s.grade === selectedGradeFilter);
  }, [gradeDistribution, selectedGradeFilter]);

  const effectivePlannerSem = useMemo(() => {
    if (!payload) return 6;
    if (
      activePlannerSem === payload.currentSemester ||
      futureSemesters.some((f) => f.semester === activePlannerSem)
    ) {
      return activePlannerSem as number;
    }
    return futureSemesters[0]?.semester ?? payload.currentSemester;
  }, [activePlannerSem, futureSemesters, payload]);

  const activeFutureSem = useMemo(
    () => futureSemesters.find((f) => f.semester === effectivePlannerSem) ?? null,
    [futureSemesters, effectivePlannerSem]
  );

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
      prev.map((item) =>
        item.semester === semester
          ? { ...item, ...patch, courses: undefined }
          : item
      )
    );
  }

  function updateFutureCourse(
    semester: number,
    courseCode: string,
    patch: Partial<Pick<PlannedCourse, 'courseName' | 'credits' | 'expectedGrade'>>
  ) {
    setFutureSemesters((prev) =>
      prev.map((item) => {
        if (item.semester !== semester) return item;
        const baseCourses =
          item.courses && item.courses.length > 0
            ? item.courses
            : buildDefaultCoursesForFutureSemester(semester);
        const nextCourses = baseCourses.map((c) =>
          c.courseCode === courseCode ? { ...c, ...patch } : c
        );
        const computed = computeSemesterGpa(
          nextCourses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
        );
        return {
          ...item,
          courses: nextCourses,
          expectedSgpa: computed.sgpa,
          credits: computed.credits,
        };
      })
    );
  }

  function addCourseToFutureSemester(semester: number) {
    setFutureSemesters((prev) =>
      prev.map((item) => {
        if (item.semester !== semester) return item;
        const baseCourses =
          item.courses && item.courses.length > 0
            ? item.courses
            : buildDefaultCoursesForFutureSemester(semester);
        if (baseCourses.length >= 10) return item;
        const nextIdx = baseCourses.length + 1;
        const nextCourses: PlannedCourse[] = [
          ...baseCourses,
          {
            courseCode: `SEM${semester}-C${nextIdx}-${Date.now().toString(36).slice(-3).toUpperCase()}`,
            courseName: `Elective Course ${nextIdx}`,
            credits: 3,
            expectedGrade: 'A+',
          },
        ];
        const computed = computeSemesterGpa(
          nextCourses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
        );
        return {
          ...item,
          courses: nextCourses,
          expectedSgpa: computed.sgpa,
          credits: computed.credits,
        };
      })
    );
  }

  function removeCourseFromFutureSemester(semester: number, courseCode: string) {
    setFutureSemesters((prev) =>
      prev.map((item) => {
        if (item.semester !== semester) return item;
        const baseCourses = item.courses ?? [];
        if (baseCourses.length <= 1) return item;
        const nextCourses = baseCourses.filter((c) => c.courseCode !== courseCode);
        const computed = computeSemesterGpa(
          nextCourses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
        );
        return {
          ...item,
          courses: nextCourses,
          expectedSgpa: computed.sgpa,
          credits: computed.credits,
        };
      })
    );
  }

  function applyGradeToActiveSemester(grade: GradeLetter) {
    if (!payload) return;
    if (effectivePlannerSem === payload.currentSemester) {
      setPlannedCourses((prev) => prev.map((c) => ({ ...c, expectedGrade: grade })));
      return;
    }
    setFutureSemesters((prev) =>
      prev.map((item) => {
        if (item.semester !== effectivePlannerSem) return item;
        const baseCourses =
          item.courses && item.courses.length > 0
            ? item.courses
            : buildDefaultCoursesForFutureSemester(item.semester);
        const nextCourses = baseCourses.map((c) => ({ ...c, expectedGrade: grade }));
        const computed = computeSemesterGpa(
          nextCourses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
        );
        return {
          ...item,
          courses: nextCourses,
          expectedSgpa: computed.sgpa,
          credits: computed.credits,
        };
      })
    );
  }

  function restoreCoursePlanForFutureSemester(semester: number) {
    setFutureSemesters((prev) =>
      prev.map((item) => {
        if (item.semester !== semester) return item;
        const courses = buildDefaultCoursesForFutureSemester(semester);
        const computed = computeSemesterGpa(
          courses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
        );
        return {
          ...item,
          courses,
          expectedSgpa: computed.sgpa,
          credits: computed.credits,
        };
      })
    );
    setActivePlannerSem(semester);
  }

  function addFutureSemester() {
    if (!payload) return;
    setFutureSemesters((prev) => {
      if (prev.length >= 6) return prev;
      const lastSem =
        prev.length > 0 ? prev[prev.length - 1].semester : payload.currentSemester;
      const nextSem = lastSem + 1;
      const courses = buildDefaultCoursesForFutureSemester(nextSem);
      const computed = computeSemesterGpa(
        courses.map((c) => ({ credits: c.credits, grade: c.expectedGrade }))
      );
      setActivePlannerSem(nextSem);
      return [
        ...prev,
        {
          semester: nextSem,
          expectedSgpa: computed.sgpa,
          credits: computed.credits,
          courses,
        },
      ];
    });
  }

  function removeFutureSemester(semester: number) {
    setFutureSemesters((prev) => {
      const next = prev.filter((s) => s.semester !== semester);
      if (activePlannerSem === semester && payload) {
        setActivePlannerSem(next[0]?.semester ?? payload.currentSemester);
      }
      return next;
    });
  }

  function applyFuturePreset(sgpa: number) {
    setFutureSemesters((prev) =>
      prev.map((s) => ({ ...s, expectedSgpa: sgpa, courses: undefined }))
    );
  }

  function resetFutureSimulation() {
    if (!payload) return;
    const defaults = buildDefaultFutureSemesters(payload.currentSemester);
    setFutureSemesters(defaults);
    setPlannedCourses(payload.currentCourses);
    setActivePlannerSem(defaults[0]?.semester ?? payload.currentSemester);
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
      prev.map((s) => ({ ...s, expectedSgpa: targetSgpaStep, courses: undefined }))
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
        <SectionError sectionName="CGPA Planner & Results" message={section.error} onRetry={onRetry} />
      ) : payload && summary ? (
        <>
          {/* Page Header */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
                  CGPA Planner &amp; Semester Results
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Set your target CGPA, test Semester {payload.currentSemester} expected grades, and project upcoming terms.
                </p>
              </div>
              {onNavigate ? (
                <button
                  type="button"
                  onClick={() => onNavigate('marks')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>View Current CAE Marks</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </section>

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
                        const resolved = resolveFutureSemesterStats(fut);
                        const pt = trajectoryBySemester.get(fut.semester);
                        const prevPt = trajectoryBySemester.get(fut.semester - 1);
                        const stepDelta =
                          pt && prevPt ? Math.round((pt.cgpa - prevPt.cgpa) * 100) / 100 : null;
                        const rowBreached = Boolean(pt && pt.cgpa < warningThreshold);

                        return (
                          <div key={fut.semester} className="px-5 py-3.5 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
                                {resolved.usingCourses && fut.courses ? (
                                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {fut.courses.length} graded{' '}
                                    {fut.courses.length === 1 ? 'course' : 'courses'}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setActivePlannerSem(fut.semester)}
                                  className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  Edit grades
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeFutureSemester(fut.semester)}
                                  aria-label={`Remove simulated Semester ${fut.semester}`}
                                  className="rounded-md p-1.5 text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </div>
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

          {/* Grade Distribution Across Subjects (Recharts Bar Chart) */}
          {gradeDistribution ? (
            <section
              aria-label="Grade distribution across subjects"
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
            >
              <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-50">
                    Grade Distribution Across Subjects
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums">
                    <span>
                      {gradeDistribution.totalSubjects}{' '}
                      {gradeDistribution.totalSubjects === 1 ? 'subject' : 'subjects'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{gradeDistribution.totalCredits} credits</span>
                    {gradeDistribution.totalSubjects > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {gradeDistribution.topTierPercent.toFixed(1)}% O or A+
                        </span>
                        {gradeDistribution.dominantGrade ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              Most frequent: {gradeDistribution.dominantGrade} ({gradeDistribution.dominantCount})
                            </span>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <label className="sr-only" htmlFor="gradeScopeSelect">
                    Semester scope for grade distribution
                  </label>
                  <select
                    id="gradeScopeSelect"
                    value={String(gradeScope)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedGradeFilter(null);
                      if (val === 'all' || val === 'with-planned') {
                        setGradeScope(val);
                      } else {
                        const semNum = Number(val);
                        setGradeScope(Number.isFinite(semNum) ? semNum : 'all');
                      }
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Completed Semesters</option>
                    {plannedCourses.length > 0 ? (
                      <option value="with-planned">
                        Completed + Sem {payload.currentSemester} Plan
                      </option>
                    ) : null}
                    {[...payload.semesters].reverse().map((sem) => (
                      <option key={sem.semester} value={String(sem.semester)}>
                        Semester {sem.semester} ({sem.termLabel})
                      </option>
                    ))}
                  </select>

                  <div
                    role="group"
                    aria-label="Grade chart view mode"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
                  >
                    <button
                      type="button"
                      onClick={() => setGradeChartMode('by-grade')}
                      aria-pressed={gradeChartMode === 'by-grade'}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        gradeChartMode === 'by-grade'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      By Grade
                    </button>
                    <button
                      type="button"
                      onClick={() => setGradeChartMode('by-subject')}
                      aria-pressed={gradeChartMode === 'by-subject'}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        gradeChartMode === 'by-subject'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      By Subject
                    </button>
                  </div>

                  {gradeChartMode === 'by-grade' ? (
                    <div
                      role="group"
                      aria-label="Grade distribution y-axis metric"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
                    >
                      <button
                        type="button"
                        onClick={() => setGradeMetric('count')}
                        aria-pressed={gradeMetric === 'count'}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          gradeMetric === 'count'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Subjects
                      </button>
                      <button
                        type="button"
                        onClick={() => setGradeMetric('credits')}
                        aria-pressed={gradeMetric === 'credits'}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          gradeMetric === 'credits'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Credits
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {gradeDistribution.totalSubjects === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    No graded subjects available in this scope yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Switch to &ldquo;Completed + Sem {payload.currentSemester} Plan&rdquo; or sync semester results from ERP to visualize your grade distribution.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-200 dark:divide-slate-800">
                  {/* Recharts Bar Chart */}
                  <div className="xl:col-span-7 p-5 sm:p-6 min-w-0 flex flex-col justify-between gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                        {gradeDistribution.buckets
                          .filter((b) => b.count > 0)
                          .map((b) => (
                            <span key={b.grade} className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-xs"
                                style={{ backgroundColor: GRADE_BAR_COLOR[b.grade] }}
                                aria-hidden="true"
                              />
                              <span>
                                {b.grade}: {b.count}
                              </span>
                            </span>
                          ))}
                      </div>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {gradeChartMode === 'by-grade'
                          ? gradeMetric === 'count'
                            ? 'Subjects per grade'
                            : 'Credits per grade'
                          : 'Grade points (0–10)'}
                      </span>
                    </div>

                    {gradeChartMode === 'by-grade' ? (
                      <div className="h-[260px] sm:h-[280px] w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={gradeDistribution.buckets}
                            margin={{ top: 10, right: 12, left: -14, bottom: 4 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="var(--chart-grid)"
                            />
                            <XAxis
                              dataKey="grade"
                              tick={{
                                fill: 'var(--chart-axis)',
                                fontSize: 12,
                                fontFamily: 'var(--font-mono)',
                              }}
                              tickLine={false}
                              axisLine={{ stroke: 'var(--chart-grid)' }}
                              dy={6}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{
                                fill: 'var(--chart-axis)',
                                fontSize: 12,
                                fontFamily: 'var(--font-mono)',
                              }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                              content={<GradeDistributionTooltip metric={gradeMetric} />}
                            />
                            <Bar
                              dataKey={gradeMetric}
                              name={gradeMetric === 'count' ? 'Subjects' : 'Credits'}
                              radius={[6, 6, 0, 0]}
                              maxBarSize={46}
                              isAnimationActive={false}
                              onClick={(_entry, index) => {
                                const grade = gradeDistribution.buckets[index]?.grade;
                                if (!grade) return;
                                setSelectedGradeFilter((prev) => (prev === grade ? null : grade));
                              }}
                              className="cursor-pointer"
                            >
                              {gradeDistribution.buckets.map((bucket) => {
                                const dimmed =
                                  selectedGradeFilter !== null && selectedGradeFilter !== bucket.grade;
                                return (
                                  <Cell
                                    key={bucket.grade}
                                    fill={GRADE_BAR_COLOR[bucket.grade]}
                                    fillOpacity={dimmed ? 0.3 : 1}
                                  />
                                );
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="w-full overflow-x-auto">
                        <div
                          className="h-[260px] sm:h-[280px]"
                          style={{
                            minWidth:
                              filteredGradeSubjects.length > 8
                                ? `${filteredGradeSubjects.length * 64}px`
                                : '100%',
                          }}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={filteredGradeSubjects}
                              margin={{ top: 10, right: 12, left: -14, bottom: 18 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="var(--chart-grid)"
                              />
                              <XAxis
                                dataKey="courseCode"
                                tick={{
                                  fill: 'var(--chart-axis)',
                                  fontSize: 11,
                                  fontFamily: 'var(--font-mono)',
                                }}
                                tickLine={false}
                                axisLine={{ stroke: 'var(--chart-grid)' }}
                                interval={0}
                                angle={filteredGradeSubjects.length > 6 ? -28 : 0}
                                textAnchor={filteredGradeSubjects.length > 6 ? 'end' : 'middle'}
                                dy={6}
                              />
                              <YAxis
                                domain={[0, 10]}
                                ticks={[0, 2, 4, 6, 8, 10]}
                                tick={{
                                  fill: 'var(--chart-axis)',
                                  fontSize: 12,
                                  fontFamily: 'var(--font-mono)',
                                }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip
                                cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                                content={<SubjectGradeTooltip />}
                              />
                              <ReferenceLine
                                y={gradeDistribution.averageGradePoints}
                                stroke="var(--chart-sgpa)"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                              />
                              <Bar
                                dataKey="gradePoints"
                                name="Grade Points"
                                radius={[5, 5, 0, 0]}
                                maxBarSize={36}
                                isAnimationActive={false}
                              >
                                {filteredGradeSubjects.map((subj) => (
                                  <Cell
                                    key={`${subj.semester}-${subj.courseCode}`}
                                    fill={GRADE_BAR_COLOR[subj.grade]}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Interactive Subject Breakdown by Grade */}
                  <div className="xl:col-span-5 flex flex-col">
                    <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Subjects by Grade
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {selectedGradeFilter
                              ? `Showing ${filteredGradeSubjects.length} ${
                                  filteredGradeSubjects.length === 1 ? 'subject' : 'subjects'
                                } with Grade ${selectedGradeFilter}`
                              : 'Click a bar or grade tab below to filter subjects'}
                          </p>
                        </div>
                        {selectedGradeFilter ? (
                          <button
                            type="button"
                            onClick={() => setSelectedGradeFilter(null)}
                            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Show all
                          </button>
                        ) : (
                          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                            Avg {gradeDistribution.averageGradePoints.toFixed(2)} pts
                          </span>
                        )}
                      </div>

                      <div
                        role="group"
                        aria-label="Filter subject list by grade"
                        className="flex flex-wrap items-center gap-1"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedGradeFilter(null)}
                          aria-pressed={selectedGradeFilter === null}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            selectedGradeFilter === null
                              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50'
                          }`}
                        >
                          All ({gradeDistribution.totalSubjects})
                        </button>
                        {gradeDistribution.buckets
                          .filter((b) => b.count > 0)
                          .map((b) => {
                            const active = selectedGradeFilter === b.grade;
                            return (
                              <button
                                key={b.grade}
                                type="button"
                                onClick={() =>
                                  setSelectedGradeFilter((prev) => (prev === b.grade ? null : b.grade))
                                }
                                aria-pressed={active}
                                className={`rounded-md px-2 py-1 font-mono text-xs tabular-nums font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                  active
                                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50'
                                }`}
                              >
                                {b.grade} ({b.count})
                              </button>
                            );
                          })}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[255px] overflow-y-auto flex-1">
                      {filteredGradeSubjects.map((subj) => (
                        <div
                          key={`${subj.semester}-${subj.courseCode}-${subj.isPlanned ? 'plan' : 'done'}`}
                          className="px-5 py-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {subj.courseName}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              {subj.courseCode} · Sem {subj.semester} · {subj.credits} cr
                              {subj.isPlanned ? ' · Planned' : ''}
                            </p>
                          </div>
                          <span
                            className={`font-mono text-xs sm:text-sm font-semibold tabular-nums whitespace-nowrap shrink-0 ${GRADE_TEXT_CLASS[subj.grade]}`}
                          >
                            {subj.grade} ({subj.gradePoints})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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

            {/* Interactive Multi-Semester Future Grade Planner */}
            <section
              aria-label="Interactive future semester CGPA grade planner"
              className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                      Interactive Future Semester Grade Planner
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Enter expected grades across current and future semesters to calculate your potential final CGPA.
                    </p>
                  </div>
                  {trajectory ? (
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                        Potential Final CGPA {trajectory.finalCgpa.toFixed(2)}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {trajectory.deltaFromBaseline >= 0 ? '+' : ''}
                        {trajectory.deltaFromBaseline.toFixed(2)} vs current · {trajectory.finalCredits} cr
                      </p>
                    </div>
                  ) : null}
                </div>

                {/* Semester Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    role="tablist"
                    aria-label="Select semester to plan expected grades"
                    className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectivePlannerSem === payload.currentSemester}
                      onClick={() => setActivePlannerSem(payload.currentSemester)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        effectivePlannerSem === payload.currentSemester
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Sem {payload.currentSemester} (Current)
                      {projection ? (
                        <span className="ml-1.5 font-mono text-[11px] opacity-75">
                          {projection.plannedSgpa.toFixed(2)}
                        </span>
                      ) : null}
                    </button>

                    {futureSemesters.map((fut) => {
                      const stats = resolveFutureSemesterStats(fut);
                      const isActive = effectivePlannerSem === fut.semester;
                      return (
                        <button
                          key={fut.semester}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setActivePlannerSem(fut.semester)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            isActive
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          Sem {fut.semester}
                          <span className="ml-1.5 font-mono text-[11px] opacity-75">
                            {stats.sgpa.toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={addFutureSemester}
                    disabled={futureSemesters.length >= 6}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add semester
                  </button>
                </div>

                {/* Quick Fill & Active Semester Meta */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Quick fill:</span>
                    {(['O', 'A+', 'A'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => applyGradeToActiveSemester(g)}
                        className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        All {g}
                      </button>
                    ))}
                  </div>

                  {activeFutureSem ? (
                    <div className="flex items-center gap-2">
                      {!activeFutureSem.courses ? (
                        <button
                          type="button"
                          onClick={() => restoreCoursePlanForFutureSemester(activeFutureSem.semester)}
                          className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          Switch to course grades
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addCourseToFutureSemester(activeFutureSem.semester)}
                          disabled={activeFutureSem.courses.length >= 10}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-45"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          Add course
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {effectivePlannerSem === payload.currentSemester ? (
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
              ) : activeFutureSem ? (
                activeFutureSem.courses && activeFutureSem.courses.length > 0 ? (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {activeFutureSem.courses.map((course) => (
                      <div
                        key={course.courseCode}
                        className="px-5 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-[160px]">
                          <input
                            type="text"
                            value={course.courseName}
                            maxLength={80}
                            onChange={(e) =>
                              updateFutureCourse(activeFutureSem.semester, course.courseCode, {
                                courseName: e.target.value,
                              })
                            }
                            aria-label={`Course name for ${course.courseCode}`}
                            className="w-full rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-600 bg-transparent px-1.5 py-0.5 -ml-1.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-950 focus:outline-none"
                          />
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {course.courseCode} · Sem {activeFutureSem.semester}
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <label className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>Cr</span>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              step={1}
                              value={course.credits}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (Number.isFinite(val)) {
                                  updateFutureCourse(activeFutureSem.semester, course.courseCode, {
                                    credits: Math.min(12, Math.max(1, Math.round(val))),
                                  });
                                }
                              }}
                              aria-label={`Credits for ${course.courseName}`}
                              className="w-12 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-1 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                            />
                          </label>

                          <select
                            aria-label={`Expected grade for ${course.courseName} in Semester ${activeFutureSem.semester}`}
                            value={course.expectedGrade}
                            onChange={(e) =>
                              updateFutureCourse(activeFutureSem.semester, course.courseCode, {
                                expectedGrade: e.target.value as GradeLetter,
                              })
                            }
                            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none cursor-pointer"
                          >
                            {ORDERED_GRADES.map((g) => (
                              <option key={g} value={g}>
                                {g} ({GRADE_POINTS[g]})
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              removeCourseFromFutureSemester(
                                activeFutureSem.semester,
                                course.courseCode
                              )
                            }
                            disabled={activeFutureSem.courses.length <= 1}
                            aria-label={`Remove ${course.courseName}`}
                            className="rounded-md p-1.5 text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center space-y-2.5">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Semester {activeFutureSem.semester} is currently using manual SGPA (
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {activeFutureSem.expectedSgpa.toFixed(2)}
                      </span>{' '}
                      across {activeFutureSem.credits} cr).
                    </p>
                    <button
                      type="button"
                      onClick={() => restoreCoursePlanForFutureSemester(activeFutureSem.semester)}
                      className="rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer"
                    >
                      Plan Semester {activeFutureSem.semester} by course grades
                    </button>
                  </div>
                )
              ) : null}

              {/* Semester Plan Summary Footer */}
              <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
                {(() => {
                  const activePt = trajectoryBySemester.get(effectivePlannerSem);
                  return (
                    <>
                      <span className="font-mono tabular-nums">
                        Sem {effectivePlannerSem} SGPA{' '}
                        <strong className="text-slate-900 dark:text-slate-100">
                          {activePt ? activePt.sgpa.toFixed(2) : '—'}
                        </strong>
                        {activePt ? ` (${activePt.credits} cr)` : ''}
                      </span>
                      <span className="font-mono tabular-nums">
                        Cumulative CGPA after Sem {effectivePlannerSem}:{' '}
                        <strong className="text-blue-700 dark:text-blue-400">
                          {activePt ? activePt.cgpa.toFixed(2) : summary.cgpa.toFixed(2)}
                        </strong>
                      </span>
                    </>
                  );
                })()}
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
