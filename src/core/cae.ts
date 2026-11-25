import type { CaeTermTrendPoint, ResultsPayload, SubjectCaeMark } from './types';

export interface CaeTrendChartPoint {
  semester: number;
  shortLabel: string;
  termLabel: string;
  cae1Avg: number;
  cae2Avg: number | null;
  internalAvg: number;
  cae1Pct: number;
  cae2Pct: number | null;
  internalPct: number;
  internalMax: number;
  subjectCount: number;
  deltaFromPrevPts: number | null;
  deltaFromPrevPct: number | null;
  cae2VsCae1Pts: number | null;
  isCurrent: boolean;
}

export interface CaeTrendSummary {
  points: CaeTrendChartPoint[];
  overallDeltaPts: number;
  overallDeltaPct: number;
  latestVsPreviousPts: number | null;
  latestVsPreviousPct: number | null;
  bestTerm: CaeTrendChartPoint | null;
  latestTerm: CaeTrendChartPoint | null;
  direction: 'improving' | 'steady' | 'dipping';
  isEstimatedHistory: boolean;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeCurrentTermCaePoint(
  currentSemester: number,
  caeMarks: SubjectCaeMark[]
): CaeTermTrendPoint | null {
  const scored = caeMarks.filter((m) => m.standing !== 'pending' && m.internalMax > 0);
  if (scored.length === 0) return null;

  const cae1Vals = scored
    .filter((m) => m.cae1 !== null && m.cae1Max > 0)
    .map((m) => ((m.cae1 as number) / m.cae1Max) * 50);
  const cae2Vals = scored
    .filter((m) => m.cae2 !== null && m.cae2Max > 0)
    .map((m) => ((m.cae2 as number) / m.cae2Max) * 50);
  const internalVals = scored.map((m) => (m.internalTotal / m.internalMax) * 50);

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
  const internalAvg = round1(avg(internalVals));
  const cae1Avg = cae1Vals.length > 0 ? round1(avg(cae1Vals)) : internalAvg;
  const cae2Avg = cae2Vals.length > 0 ? round1(avg(cae2Vals)) : null;

  return {
    semester: currentSemester,
    termLabel: `Sem ${currentSemester} (Current)`,
    cae1Avg,
    cae2Avg,
    internalAvg,
    internalMax: 50,
    subjectCount: scored.length,
    isCurrent: true,
  };
}

/**
 * Builds a chronological term-by-term Continuous Assessment (CAE) trend across terms,
 * combining recorded term history with the live current-term CAE averages.
 */
export function buildCaeTermTrend(payload: ResultsPayload): CaeTrendSummary {
  const rawHistory = [...(payload.caeHistory ?? [])].sort((a, b) => a.semester - b.semester);
  const currentPoint = computeCurrentTermCaePoint(payload.currentSemester, payload.caeMarks ?? []);
  let isEstimatedHistory = false;

  const combined: CaeTermTrendPoint[] = [];

  if (rawHistory.length > 0) {
    for (const item of rawHistory) {
      if (currentPoint && item.semester === currentPoint.semester) continue;
      combined.push(item);
    }
    if (currentPoint) combined.push(currentPoint);
  } else {
    // Fallback when a live ERP session provides past semester transcripts + current CAE marks
    // without a dedicated historical CAE archive endpoint.
    const sortedPast = [...payload.semesters].sort((a, b) => a.semester - b.semester);
    if (sortedPast.length > 0) {
      isEstimatedHistory = true;
      for (const sem of sortedPast) {
        if (currentPoint && sem.semester === currentPoint.semester) continue;
        // Convert SGPA (10-pt scale) into an indicative internal baseline out of 50
        const estInternal = round1(Math.min(50, Math.max(0, (sem.sgpa / 10) * 50 - 2.5)));
        const estCae1 = round1(Math.max(0, estInternal - 0.8));
        const estCae2 = round1(Math.min(50, estInternal + 0.6));
        combined.push({
          semester: sem.semester,
          termLabel: sem.termLabel,
          cae1Avg: estCae1,
          cae2Avg: estCae2,
          internalAvg: estInternal,
          internalMax: 50,
          subjectCount: sem.courses.length,
          isCurrent: false,
        });
      }
    }
    if (currentPoint) combined.push(currentPoint);
  }

  combined.sort((a, b) => a.semester - b.semester);

  const points: CaeTrendChartPoint[] = combined.map((pt, idx) => {
    const scale = pt.internalMax > 0 ? pt.internalMax : 50;
    const internalOutOf50 = round1((pt.internalAvg / scale) * 50);
    const cae1OutOf50 = round1((pt.cae1Avg / scale) * 50);
    const cae2OutOf50 = pt.cae2Avg !== null ? round1((pt.cae2Avg / scale) * 50) : null;

    const internalPct = round1((internalOutOf50 / 50) * 100);
    const cae1Pct = round1((cae1OutOf50 / 50) * 100);
    const cae2Pct = cae2OutOf50 !== null ? round1((cae2OutOf50 / 50) * 100) : null;

    const prev = idx > 0 ? combined[idx - 1] : null;
    const prevOutOf50 = prev ? round1((prev.internalAvg / (prev.internalMax || 50)) * 50) : null;
    const deltaFromPrevPts = prevOutOf50 !== null ? round1(internalOutOf50 - prevOutOf50) : null;
    const deltaFromPrevPct =
      prevOutOf50 !== null ? round1(((internalOutOf50 - prevOutOf50) / 50) * 100) : null;
    const cae2VsCae1Pts = cae2OutOf50 !== null ? round1(cae2OutOf50 - cae1OutOf50) : null;

    return {
      semester: pt.semester,
      shortLabel: pt.isCurrent ? `S${pt.semester}*` : `S${pt.semester}`,
      termLabel: pt.termLabel,
      cae1Avg: cae1OutOf50,
      cae2Avg: cae2OutOf50,
      internalAvg: internalOutOf50,
      cae1Pct,
      cae2Pct,
      internalPct,
      internalMax: 50,
      subjectCount: pt.subjectCount,
      deltaFromPrevPts,
      deltaFromPrevPct,
      cae2VsCae1Pts,
      isCurrent: Boolean(pt.isCurrent),
    };
  });

  if (points.length === 0) {
    return {
      points: [],
      overallDeltaPts: 0,
      overallDeltaPct: 0,
      latestVsPreviousPts: null,
      latestVsPreviousPct: null,
      bestTerm: null,
      latestTerm: null,
      direction: 'steady',
      isEstimatedHistory,
    };
  }

  const first = points[0];
  const latest = points[points.length - 1];
  const overallDeltaPts = round1(latest.internalAvg - first.internalAvg);
  const overallDeltaPct = round1(latest.internalPct - first.internalPct);
  const latestVsPreviousPts = latest.deltaFromPrevPts;
  const latestVsPreviousPct = latest.deltaFromPrevPct;

  let bestTerm = points[0];
  for (const pt of points) {
    if (pt.internalAvg > bestTerm.internalAvg) bestTerm = pt;
  }

  const direction: CaeTrendSummary['direction'] =
    overallDeltaPts >= 1.0 ? 'improving' : overallDeltaPts <= -1.0 ? 'dipping' : 'steady';

  return {
    points,
    overallDeltaPts,
    overallDeltaPct,
    latestVsPreviousPts,
    latestVsPreviousPct,
    bestTerm,
    latestTerm: latest,
    direction,
    isEstimatedHistory,
  };
}

export interface SubjectCaeComparisonPoint {
  componentKey: 'cae1' | 'cae2' | 'bonus' | 'internal';
  label: string;
  studentScore: number | null;
  classAvgScore: number;
  maxScore: number;
  studentPct: number | null;
  classAvgPct: number;
  deltaPts: number | null;
  deltaPct: number | null;
}

export interface SubjectCaeDeepDive {
  subject: SubjectCaeMark;
  points: SubjectCaeComparisonPoint[];
  studentInternal: number;
  classAvgInternal: number;
  classTopInternal: number;
  internalMax: number;
  gapVsClassPts: number;
  gapVsClassPct: number;
  gapToTopPts: number;
  studentMomentumPts: number | null;
  classMomentumPts: number | null;
  positionLabel: 'Top quartile' | 'Above average' | 'Near class avg' | 'Below average' | 'Pending';
  positionTone: 'strong' | 'on-track' | 'needs-improvement' | 'pending';
  strongestComponent: SubjectCaeComparisonPoint | null;
  weakestComponent: SubjectCaeComparisonPoint | null;
  isEstimatedClassAvg: boolean;
}

export interface AllSubjectsClassComparisonPoint {
  courseCode: string;
  shortName: string;
  courseName: string;
  studentInternal: number;
  classAvgInternal: number;
  studentPct: number;
  classAvgPct: number;
  internalMax: number;
  deltaPts: number;
  deltaPct: number;
  isEstimatedClassAvg: boolean;
}

function deriveSubjectBenchmarks(subject: SubjectCaeMark): {
  classAvgCae1: number;
  classAvgCae2: number;
  classAvgBonus: number;
  classAvgInternal: number;
  classTopInternal: number;
  isEstimated: boolean;
} {
  const hasExplicit =
    typeof subject.classAvgInternal === 'number' && Number.isFinite(subject.classAvgInternal);

  if (hasExplicit) {
    const classAvgInternal = round1(subject.classAvgInternal as number);
    const ratio = subject.internalMax > 0 ? classAvgInternal / subject.internalMax : 0.74;
    const classAvgCae1 =
      typeof subject.classAvgCae1 === 'number' && Number.isFinite(subject.classAvgCae1)
        ? round1(subject.classAvgCae1)
        : round1(subject.cae1Max * ratio);
    const classAvgCae2 =
      typeof subject.classAvgCae2 === 'number' && Number.isFinite(subject.classAvgCae2)
        ? round1(subject.classAvgCae2)
        : round1(subject.cae2Max * ratio);
    const classAvgBonus =
      typeof subject.classAvgBonus === 'number' && Number.isFinite(subject.classAvgBonus)
        ? round1(subject.classAvgBonus)
        : round1(subject.internalBonusMax * Math.min(0.92, ratio + 0.06));
    const classTopInternal =
      typeof subject.classTopInternal === 'number' && Number.isFinite(subject.classTopInternal)
        ? round1(subject.classTopInternal)
        : round1(Math.min(subject.internalMax, Math.max(subject.internalTotal, classAvgInternal + subject.internalMax * 0.18)));

    return {
      classAvgCae1,
      classAvgCae2,
      classAvgBonus,
      classAvgInternal,
      classTopInternal,
      isEstimated: false,
    };
  }

  // Deterministic cohort benchmark fallback when live ERP does not expose section class averages
  const codeHash = subject.courseCode
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const baselineRatio = 0.72 + ((codeHash % 9) * 0.01); // 72%..80%
  const classAvgInternal = round1(subject.internalMax * baselineRatio);
  const classAvgCae1 = round1(subject.cae1Max * Math.max(0.65, baselineRatio - 0.01));
  const classAvgCae2 = round1(subject.cae2Max * Math.min(0.85, baselineRatio + 0.01));
  const classAvgBonus = round1(subject.internalBonusMax * Math.min(0.9, baselineRatio + 0.06));
  const classTopInternal = round1(
    Math.min(subject.internalMax, Math.max(subject.internalTotal, subject.internalMax * 0.94))
  );

  return {
    classAvgCae1,
    classAvgCae2,
    classAvgBonus,
    classAvgInternal,
    classTopInternal,
    isEstimated: true,
  };
}

/**
 * Builds a subject-level comparative breakdown of a student's CAE 1, CAE 2, Assignment/Lab,
 * and Internal Total marks against the class average and class top benchmark.
 */
export function buildSubjectCaeDeepDive(subject: SubjectCaeMark): SubjectCaeDeepDive {
  const bench = deriveSubjectBenchmarks(subject);
  const toPct = (score: number, max: number) => (max > 0 ? round1((score / max) * 100) : 0);

  const makePoint = (
    componentKey: SubjectCaeComparisonPoint['componentKey'],
    label: string,
    studentScore: number | null,
    classAvgScore: number,
    maxScore: number
  ): SubjectCaeComparisonPoint => {
    const classAvgPct = toPct(classAvgScore, maxScore);
    if (studentScore === null) {
      return {
        componentKey,
        label,
        studentScore: null,
        classAvgScore,
        maxScore,
        studentPct: null,
        classAvgPct,
        deltaPts: null,
        deltaPct: null,
      };
    }
    const studentPct = toPct(studentScore, maxScore);
    return {
      componentKey,
      label,
      studentScore: round1(studentScore),
      classAvgScore,
      maxScore,
      studentPct,
      classAvgPct,
      deltaPts: round1(studentScore - classAvgScore),
      deltaPct: round1(studentPct - classAvgPct),
    };
  };

  const points: SubjectCaeComparisonPoint[] = [
    makePoint('cae1', 'CAE 1', subject.cae1, bench.classAvgCae1, subject.cae1Max),
    makePoint('cae2', 'CAE 2', subject.cae2, bench.classAvgCae2, subject.cae2Max),
    makePoint('bonus', 'Assign / Lab', subject.internalBonus, bench.classAvgBonus, subject.internalBonusMax),
    makePoint(
      'internal',
      'Internal Total',
      subject.standing === 'pending' ? null : subject.internalTotal,
      bench.classAvgInternal,
      subject.internalMax
    ),
  ];

  const internalPoint = points[3];
  const gapVsClassPts =
    internalPoint.deltaPts !== null ? internalPoint.deltaPts : 0;
  const gapVsClassPct =
    internalPoint.deltaPct !== null ? internalPoint.deltaPct : 0;
  const gapToTopPts = round1(Math.max(0, bench.classTopInternal - subject.internalTotal));

  const studentMomentumPts =
    subject.cae1 !== null && subject.cae2 !== null && subject.cae1Max === subject.cae2Max
      ? round1(subject.cae2 - subject.cae1)
      : null;
  const classMomentumPts =
    subject.cae1Max === subject.cae2Max
      ? round1(bench.classAvgCae2 - bench.classAvgCae1)
      : null;

  let positionLabel: SubjectCaeDeepDive['positionLabel'];
  let positionTone: SubjectCaeDeepDive['positionTone'];
  if (subject.standing === 'pending') {
    positionLabel = 'Pending';
    positionTone = 'pending';
  } else if (gapVsClassPct >= 10) {
    positionLabel = 'Top quartile';
    positionTone = 'strong';
  } else if (gapVsClassPct >= 2.5) {
    positionLabel = 'Above average';
    positionTone = 'strong';
  } else if (gapVsClassPct >= -2.5) {
    positionLabel = 'Near class avg';
    positionTone = 'on-track';
  } else {
    positionLabel = 'Below average';
    positionTone = 'needs-improvement';
  }

  const scoredComponents = points
    .slice(0, 3)
    .filter((p) => p.deltaPct !== null);
  let strongestComponent: SubjectCaeComparisonPoint | null = null;
  let weakestComponent: SubjectCaeComparisonPoint | null = null;
  for (const pt of scoredComponents) {
    if (!strongestComponent || (pt.deltaPct as number) > (strongestComponent.deltaPct as number)) {
      strongestComponent = pt;
    }
    if (!weakestComponent || (pt.deltaPct as number) < (weakestComponent.deltaPct as number)) {
      weakestComponent = pt;
    }
  }

  return {
    subject,
    points,
    studentInternal: round1(subject.internalTotal),
    classAvgInternal: bench.classAvgInternal,
    classTopInternal: bench.classTopInternal,
    internalMax: subject.internalMax,
    gapVsClassPts,
    gapVsClassPct,
    gapToTopPts,
    studentMomentumPts,
    classMomentumPts,
    positionLabel,
    positionTone,
    strongestComponent,
    weakestComponent,
    isEstimatedClassAvg: bench.isEstimated,
  };
}

/**
 * Builds a side-by-side comparison of internal marks vs class average across all current subjects.
 */
export function buildAllSubjectsClassComparison(
  subjects: SubjectCaeMark[]
): AllSubjectsClassComparisonPoint[] {
  return subjects
    .filter((s) => s.standing !== 'pending' && s.internalMax > 0)
    .map((subject) => {
      const bench = deriveSubjectBenchmarks(subject);
      const studentPct = round1((subject.internalTotal / subject.internalMax) * 100);
      const classAvgPct = round1((bench.classAvgInternal / subject.internalMax) * 100);
      return {
        courseCode: subject.courseCode,
        shortName: subject.courseCode,
        courseName: subject.courseName,
        studentInternal: round1(subject.internalTotal),
        classAvgInternal: bench.classAvgInternal,
        studentPct,
        classAvgPct,
        internalMax: subject.internalMax,
        deltaPts: round1(subject.internalTotal - bench.classAvgInternal),
        deltaPct: round1(studentPct - classAvgPct),
        isEstimatedClassAvg: bench.isEstimated,
      };
    });
}

