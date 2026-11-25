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
