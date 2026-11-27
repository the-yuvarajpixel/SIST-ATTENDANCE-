import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ERP_CONSOLE_COPY_SNIPPET,
  extractErpAccessToken,
  formatExtractedTokenSummary,
} from './erpTokenHelper';
import {
  analyzeAttendanceInsights,
  buildDailyAttendanceLog,
  buildWeeklyAttendanceTrend,
  clampAttendanceDateToToday,
  computeAttendanceAsOfDate,
  computeAttendanceStats,
  computeOverallAttendance,
  getLatestAttendanceDate,
  normalizeAttendanceEndDate,
  shiftAttendanceDateKey,
  simulateAttendance,
} from './attendance';
import {
  compute30DayTrendSummary,
  sanitizeSnapshotStore,
  seedAndMerge30DaySnapshots,
  selectLast30DaySnapshots,
} from './attendanceSnapshots';
import {
  buildCgpaTrajectory,
  buildGradeDistribution,
  computeCgpaSummary,
  computeOverviewSemesterCgpa,
  computeProjectedCgpa,
  computeSemesterGpa,
  evaluateCgpaThreshold,
  planTargetCgpa,
  simulateTargetCgpaPlan,
} from './gpa';
import {
  buildAllSubjectsClassComparison,
  buildCaeTermTrend,
  buildSubjectCaeDeepDive,
} from './cae';
import { deduplicateDeadlines, findNextClass, getUpcomingErpExams } from './schedule';
import { TwoTierCache } from './cache';
import { SchemaValidationError, validateAttendance, validateDeadlines } from './schemas';
import type { AttendanceSubject, DeadlineItem, SemesterResult, TimetableSlot } from './types';

test('attendance bunk calculator computes skippable classes above 75%', () => {
  // 28 / 32 = 87.5%; max total for >= 75% is floor(2800 / 75) = 37 => can skip 5
  const stats = computeAttendanceStats(28, 32, 75);
  assert.equal(stats.percentage, 87.5);
  assert.equal(stats.canSkip, 5);
  assert.equal(stats.mustAttend, 0);
  assert.equal(stats.status, 'safe');
  assert.equal(stats.verdict, 'Can skip 5');
});

test('attendance bunk calculator computes exact required classes below 75%', () => {
  // 20 / 30 = 66.7%; need (75*30 - 2000)/25 = 250/25 = 10 consecutive classes -> 30/40 = 75%
  const stats = computeAttendanceStats(20, 30, 75);
  assert.equal(stats.percentage, 66.7);
  assert.equal(stats.canSkip, 0);
  assert.equal(stats.mustAttend, 10);
  assert.equal(stats.status, 'shortage');
  assert.equal(stats.verdict, 'Attend next 10 in a row');
});

test('attendance handles exact boundary, higher target (85%), and what-if simulation', () => {
  const exact = computeAttendanceStats(30, 40, 75);
  assert.equal(exact.canSkip, 0);
  assert.equal(exact.mustAttend, 0);
  assert.equal(exact.status, 'borderline');
  assert.equal(exact.verdict, 'On the edge — attend next');

  // At 85% target, 30/40 needs ceil((85*40 - 3000)/15) = ceil(400/15) = 27
  const higher = computeAttendanceStats(30, 40, 85);
  assert.equal(higher.mustAttend, 27);
  assert.equal(higher.status, 'shortage');

  const sim = simulateAttendance({ attended: 28, total: 32 }, 0, 5, 75);
  assert.equal(sim.attended, 28);
  assert.equal(sim.total, 37);
  assert.equal(sim.canSkip, 0);
  assert.equal(sim.status, 'borderline');
});

test('overall attendance aggregates across subjects', () => {
  const subjects: AttendanceSubject[] = [
    { courseCode: 'CS1', courseName: 'CN', faculty: 'A', credits: 4, attended: 30, total: 34, lastUpdated: '2026-11-20' },
    { courseCode: 'CS2', courseName: 'OS', faculty: 'B', credits: 4, attended: 20, total: 30, lastUpdated: '2026-11-20' },
  ];
  const overall = computeOverallAttendance(subjects, 75);
  assert.equal(overall.totalAttended, 50);
  assert.equal(overall.totalHeld, 64);
  assert.equal(overall.overallPercentage, 78.1);
  assert.equal(overall.shortageCount, 1);
  assert.equal(overall.safeCount, 1);
});

test('latest attendance date strictly caps future-dated entries to today', () => {
  const fixedNow = new Date(2026, 10, 25, 11, 0, 0); // 25 Nov 2026
  const clampedFuture = clampAttendanceDateToToday('2026-12-10', fixedNow);
  assert.equal(clampedFuture.wasFuture, true);
  assert.equal(clampedFuture.dateKey, '2026-11-25');

  const clampedPast = clampAttendanceDateToToday('2026-11-23', fixedNow);
  assert.equal(clampedPast.wasFuture, false);
  assert.equal(clampedPast.dateKey, '2026-11-23');

  const subjects: AttendanceSubject[] = [
    { courseCode: 'CS1', courseName: 'CN', faculty: 'A', credits: 4, attended: 30, total: 34, lastUpdated: '2026-11-22' },
    { courseCode: 'CS2', courseName: 'CD', faculty: 'B', credits: 4, attended: 20, total: 30, lastUpdated: '2026-12-05' },
  ];
  const latest = getLatestAttendanceDate(subjects, fixedNow);
  assert.equal(latest.latestDateKey, '2026-11-25');
  assert.equal(latest.cappedToToday, true);
  assert.match(latest.formattedDate ?? '', /25.*Nov.*2026/);
});

test('attendance insights ranks priority courses and projects weekly recovery against target', () => {
  const subjects: AttendanceSubject[] = [
    { courseCode: 'SCSA1601', courseName: 'Computer Networks', faculty: 'Dr. Priya', credits: 4, attended: 28, total: 32, lastUpdated: '2026-11-23' },
    { courseCode: 'SCSA1602', courseName: 'Compiler Design', faculty: 'Prof. Karthik', credits: 4, attended: 25, total: 36, lastUpdated: '2026-11-23' },
    { courseCode: 'SCSA1604', courseName: 'Cloud Computing', faculty: 'Prof. Arjun', credits: 3, attended: 24, total: 31, lastUpdated: '2026-11-23' },
    { courseCode: 'SCSA1605', courseName: 'Software Engineering', faculty: 'Dr. Meena', credits: 3, attended: 21, total: 29, lastUpdated: '2026-11-23' },
  ];
  const timetable: TimetableSlot[] = [
    { id: '1', day: 'Mon', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-208', faculty: 'Prof. Karthik', kind: 'Lecture' },
    { id: '2', day: 'Tue', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-208', faculty: 'Prof. Karthik', kind: 'Lecture' },
    { id: '3', day: 'Wed', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-208', faculty: 'Prof. Karthik', kind: 'Lecture' },
    { id: '4', day: 'Thu', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-208', faculty: 'Prof. Karthik', kind: 'Lecture' },
    { id: '5', day: 'Mon', startTime: '11:00', endTime: '11:50', courseCode: 'SCSA1605', courseName: 'Software Engineering', room: 'CS-205', faculty: 'Dr. Meena', kind: 'Lecture' },
    { id: '6', day: 'Wed', startTime: '11:00', endTime: '11:50', courseCode: 'SCSA1605', courseName: 'Software Engineering', room: 'CS-205', faculty: 'Dr. Meena', kind: 'Lecture' },
    { id: '7', day: 'Fri', startTime: '11:00', endTime: '11:50', courseCode: 'SCSA1605', courseName: 'Software Engineering', room: 'CS-205', faculty: 'Dr. Meena', kind: 'Lecture' },
    { id: '8', day: 'Tue', startTime: '14:00', endTime: '14:50', courseCode: 'SCSA1604', courseName: 'Cloud Computing', room: 'CS-204', faculty: 'Prof. Arjun', kind: 'Lecture' },
    { id: '9', day: 'Thu', startTime: '14:00', endTime: '14:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-204', faculty: 'Dr. Priya', kind: 'Lecture' },
  ];

  const at75 = analyzeAttendanceInsights(subjects, timetable, 75);
  assert.equal(at75.trendStatus, 'at-risk');
  assert.equal(at75.distribution.shortageCount, 2);
  assert.equal(at75.distribution.borderlineCount, 1);
  assert.equal(at75.distribution.safeCount, 1);
  assert.equal(at75.totalClassesNeededToRecover, 11); // 8 + 3
  assert.equal(at75.priorityCourses[0].subject.courseCode, 'SCSA1602');
  assert.equal(at75.priorityCourses[0].priorityLevel, 'urgent');
  assert.equal(at75.priorityCourses[0].weeklySessions, 4);
  assert.equal(at75.priorityCourses[0].estimatedWeeksToRecover, 2); // ceil(8 / 4)
  assert.equal(at75.priorityCourses[1].subject.courseCode, 'SCSA1605');
  assert.equal(at75.priorityCourses[1].recoversInOneWeek, true); // needs 3, has 3/wk
  assert.equal(at75.priorityCourses[2].subject.courseCode, 'SCSA1604');
  assert.equal(at75.priorityCourses[2].priorityLevel, 'watch');
  assert.equal(at75.oneWeekProjection.horizon, 'week');
  assert.equal(at75.oneWeekProjection.coursesRecoveredInOneWeek, 1);
  assert.ok(at75.oneWeekProjection.deltaPercentage > 0);

  // Raising target to 85% increases shortage count and recovery classes needed
  const at85 = analyzeAttendanceInsights(subjects, timetable, 85);
  assert.equal(at85.distribution.shortageCount, 3);
  assert.ok(at85.totalClassesNeededToRecover > at75.totalClassesNeededToRecover);

  // Empty subjects handled safely without NaN
  const empty = analyzeAttendanceInsights([], [], 75);
  assert.equal(empty.priorityCourses.length, 0);
  assert.equal(empty.overallPercentage, 100);
  assert.equal(empty.trendStatus, 'on-track');
});

test('GPA summary, target planner, and projected CGPA compute accurately', () => {
  const sem1Courses = [
    { courseCode: 'MA1', courseName: 'Math', credits: 4, grade: 'O' as const, gradePoints: 10 },
    { courseCode: 'CS1', courseName: 'Prog', credits: 4, grade: 'A+' as const, gradePoints: 9 },
  ];
  assert.equal(computeSemesterGpa(sem1Courses).sgpa, 9.5);

  const semesters: SemesterResult[] = [
    { semester: 1, termLabel: 'Sem 1', sgpa: 8.5, credits: 20, courses: [] },
    { semester: 2, termLabel: 'Sem 2', sgpa: 9.0, credits: 20, courses: [] },
  ];
  const summary = computeCgpaSummary(semesters);
  assert.equal(summary.cgpa, 8.75);
  assert.equal(summary.completedCredits, 40);
  assert.equal(summary.bestSemester?.semester, 2);

  // Target 9.00 over 40 + 20 = 60 credits => need (9*60 - 8.75*40)/20 = (540 - 350)/20 = 9.50
  const plan = planTargetCgpa(8.75, 40, 20, 9.0);
  assert.equal(plan.achievable, true);
  assert.equal(plan.requiredSgpa, 9.5);

  // Impossible target 9.50 => need (570 - 350)/20 = 11.00
  const impossible = planTargetCgpa(8.75, 40, 20, 9.5);
  assert.equal(impossible.achievable, false);
  assert.equal(impossible.requiredSgpa, 11);

  const projected = computeProjectedCgpa(8.75, 40, [
    { courseCode: 'CS601', courseName: 'CN', credits: 10, expectedGrade: 'O' },
    { courseCode: 'CS602', courseName: 'AI', credits: 10, expectedGrade: 'A+' },
  ]);
  assert.equal(projected.plannedSgpa, 9.5);
  assert.equal(projected.projectedCgpa, 9.0);
  assert.equal(projected.deltaCgpa, 0.25);
});

test('CGPA trajectory bridges historical semesters with planned and future simulations', () => {
  const semesters: SemesterResult[] = [
    { semester: 1, termLabel: 'Sem 1', sgpa: 8.5, credits: 20, courses: [] },
    { semester: 2, termLabel: 'Sem 2', sgpa: 9.0, credits: 20, courses: [] },
  ];
  const planned = [
    { courseCode: 'CS301', courseName: 'Algorithms', credits: 10, expectedGrade: 'O' as const },
    { courseCode: 'CS302', courseName: 'OS', credits: 10, expectedGrade: 'A+' as const },
  ];
  const future = [
    { semester: 4, expectedSgpa: 9.5, credits: 20 },
    { semester: 5, expectedSgpa: 10.0, credits: 20 },
  ];

  const traj = buildCgpaTrajectory(semesters, 3, planned, future);
  assert.equal(traj.points.length, 5);
  assert.equal(traj.baselineCgpa, 8.75);
  // Sem 1: 8.50 (20 cr), Sem 2: 8.75 (40 cr) — bridge point has both actual & projected
  assert.equal(traj.points[0].completedCgpa, 8.5);
  assert.equal(traj.points[0].projectedCgpa, null);
  assert.equal(traj.points[1].completedCgpa, 8.75);
  assert.equal(traj.points[1].projectedCgpa, 8.75);
  // Sem 3 planned (9.50 over 20 cr) -> (350 + 190) / 60 = 9.00
  assert.equal(traj.points[2].kind, 'planned');
  assert.equal(traj.points[2].completedCgpa, null);
  assert.equal(traj.points[2].projectedCgpa, 9.0);
  // Sem 4 sim (9.50 over 20 cr) -> (540 + 190) / 80 = 9.125 -> 9.13
  assert.equal(traj.points[3].kind, 'simulated');
  assert.equal(traj.points[3].cgpa, 9.13);
  // Sem 5 sim (10.00 over 20 cr) -> (730 + 200) / 100 = 9.30
  assert.equal(traj.finalCgpa, 9.3);
  assert.equal(traj.finalCredits, 100);
  assert.equal(traj.deltaFromBaseline, 0.55);

  // Threshold below trajectory -> no warning
  const okEval = evaluateCgpaThreshold(traj, 8.9);
  assert.equal(okEval.isBelowThreshold, false);
  assert.equal(okEval.finalBelow, false);
  assert.equal(okEval.shortfall, 0);
  assert.equal(okEval.breachedSemesters.length, 0);

  // Threshold above final CGPA -> flags breached semesters and computes recovery SGPA
  const warnEval = evaluateCgpaThreshold(traj, 9.4);
  assert.equal(warnEval.isBelowThreshold, true);
  assert.equal(warnEval.finalBelow, true);
  assert.equal(warnEval.shortfall, 0.1);
  assert.equal(warnEval.breachedSemesters.length, 3);
  // Need (9.4*100 - 8.75*40) / 60 = (940 - 350) / 60 = 590 / 60 = 9.83
  assert.equal(warnEval.requiredAverageFutureSgpa, 9.83);
  assert.equal(warnEval.achievable, true);
  // Holding Sem 3 planned (9.00 CGPA over 60 cr) fixed: need (9.4*100 - 9.0*60) / 40 = 400 / 40 = 10.00
  assert.equal(warnEval.requiredSimulatedSgpa, 10);
  assert.equal(warnEval.simulatedAchievable, true);

  // Course-level expected grades in future semesters drive exact SGPA and potential final CGPA
  const courseDrivenTraj = buildCgpaTrajectory(semesters, 3, planned, [
    {
      semester: 4,
      expectedSgpa: 7.0, // ignored when courses are provided
      credits: 10,
      courses: [
        { courseCode: 'CS401', courseName: 'Distributed Systems', credits: 10, expectedGrade: 'O' },
        { courseCode: 'CS402', courseName: 'ML', credits: 10, expectedGrade: 'A' },
      ],
    },
  ]);
  // Sem 4 courses SGPA = (10*10 + 10*8)/20 = 9.00 over 20 cr -> cumulative = (540 + 180)/80 = 9.00
  assert.equal(courseDrivenTraj.points[3].sgpa, 9.0);
  assert.equal(courseDrivenTraj.points[3].credits, 20);
  assert.equal(courseDrivenTraj.finalCgpa, 9.0);
  assert.equal(courseDrivenTraj.points[3].label, 'Sem 4 (Grades)');
});

test('CAE multi-term trend computes progression across historical terms and current CAE marks', () => {
  const trend = buildCaeTermTrend({
    currentSemester: 3,
    semesters: [
      { semester: 1, termLabel: 'Nov 2024', sgpa: 8.2, credits: 20, courses: [] },
      { semester: 2, termLabel: 'May 2025', sgpa: 8.7, credits: 20, courses: [] },
    ],
    currentCourses: [],
    caeHistory: [
      { semester: 1, termLabel: 'Nov 2024', cae1Avg: 34, cae2Avg: 36, internalAvg: 35.5, internalMax: 50, subjectCount: 5 },
      { semester: 2, termLabel: 'May 2025', cae1Avg: 38, cae2Avg: 40, internalAvg: 39.2, internalMax: 50, subjectCount: 5 },
    ],
    caeMarks: [
      {
        courseCode: 'CS301',
        courseName: 'Networks',
        credits: 4,
        cae1: 42,
        cae1Max: 50,
        cae2: 46,
        cae2Max: 50,
        internalBonus: 9,
        internalBonusMax: 10,
        internalTotal: 44.2,
        internalMax: 50,
        standing: 'strong',
      },
      {
        courseCode: 'CS302',
        courseName: 'Algorithms',
        credits: 4,
        cae1: 40,
        cae1Max: 50,
        cae2: 42,
        cae2Max: 50,
        internalBonus: 8,
        internalBonusMax: 10,
        internalTotal: 40.8,
        internalMax: 50,
        standing: 'strong',
      },
    ],
  });

  assert.equal(trend.points.length, 3);
  assert.equal(trend.isEstimatedHistory, false);
  assert.equal(trend.points[2].semester, 3);
  assert.equal(trend.points[2].isCurrent, true);
  assert.equal(trend.points[2].internalAvg, 42.5);
  assert.equal(trend.points[2].cae1Avg, 41);
  assert.equal(trend.points[2].cae2Avg, 44);
  assert.equal(trend.overallDeltaPts, 7);
  assert.equal(trend.direction, 'improving');
  assert.equal(trend.bestTerm?.semester, 3);
});

test('next-class resolver selects upcoming slot and wraps weekends to Monday', () => {
  const slots: TimetableSlot[] = [
    { id: '1', day: 'Mon', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-204', faculty: 'Dr. Priya', kind: 'Lecture' },
    { id: '2', day: 'Mon', startTime: '11:00', endTime: '11:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-208', faculty: 'Prof. Karthik', kind: 'Lecture' },
  ];
  const attendance: AttendanceSubject[] = [
    { courseCode: 'SCSA1601', courseName: 'Computer Networks', faculty: 'Dr. Priya', credits: 4, attended: 28, total: 32, lastUpdated: '2026-11-23' },
  ];

  // Sunday evening (2026-11-22 is Sunday) -> should pick Tomorrow, Mon 09:00
  const sundayEvening = new Date(2026, 10, 22, 18, 0, 0);
  const next = findNextClass(slots, attendance, sundayEvening, 75);
  assert.ok(next);
  assert.equal(next.dayLabel, 'Tomorrow, Mon');
  assert.equal(next.slot.courseCode, 'SCSA1601');
  assert.equal(next.attendancePercent, 87.5);
  assert.equal(next.verdict, 'Can skip 5');
  assert.match(next.headline, /Tomorrow, Mon 09:00 · Computer Networks · 87\.5% · Can skip 5/);

  // Monday 09:30 -> should skip 09:00 and pick 11:00
  const mondayMid = new Date(2026, 10, 23, 9, 30, 0);
  const nextMon = findNextClass(slots, attendance, mondayMid, 75);
  assert.ok(nextMon);
  assert.equal(nextMon.slot.courseCode, 'SCSA1602');
  assert.equal(nextMon.startsInLabel, 'in 1h 30m');
});

test('deadline deduplicator merges overlapping ERP and LMS deadlines', () => {
  const raw: DeadlineItem[] = [
    { id: 'a1', title: 'Internal Assessment II - Computer Networks', courseCode: 'SCSA1601', dueAt: '2026-11-27T09:00:00.000Z', kind: 'exam', origin: 'ERP' },
    { id: 'a2', title: 'Internal Assessment II: Computer Networks', courseCode: 'SCSA1601', dueAt: '2026-11-27T09:30:00.000Z', kind: 'exam', origin: 'LMS' },
    { id: 'a3', title: 'Semester VI Tuition Fee', dueAt: '2026-11-29T17:00:00.000Z', kind: 'fee', origin: 'ERP', amountInr: 48500 },
  ];
  const { items, duplicatesMerged } = deduplicateDeadlines(raw);
  assert.equal(duplicatesMerged, 1);
  assert.equal(items.length, 2);
  assert.equal(items[0].origin, 'ERP + LMS');
  assert.equal(items[0].mergedCount, 2);
});

test('two-tier cache deduplicates concurrent fetches and serves stale-while-error', async () => {
  const cache = new TwoTierCache(null);
  const userHash = TwoTierCache.hashUserKey('42110482');
  let calls = 0;

  const [r1, r2] = await Promise.all([
    cache.getOrFetch(userHash, 'attendance', 60_000, async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return [{ ok: true }];
    }),
    cache.getOrFetch(userHash, 'attendance', 60_000, async () => {
      calls += 1;
      return [{ ok: true }];
    }),
  ]);

  assert.equal(calls, 1);
  assert.equal(r1.stale, false);
  assert.deepEqual(r1.data, r2.data);

  // Force refresh with failing upstream -> returns stale copy with warning
  const staleRes = await cache.getOrFetch(
    userHash,
    'attendance',
    60_000,
    async () => {
      throw new Error('ERP timeout');
    },
    { forceRefresh: true }
  );
  assert.equal(staleRes.stale, true);
  assert.deepEqual(staleRes.data, [{ ok: true }]);
  assert.match(staleRes.warning ?? '', /ERP timeout/);

  assert.equal(cache.clearUser(userHash), 1);
});

test('runtime schema validators reject malformed payloads cleanly', () => {
  assert.throws(
    () =>
      validateAttendance([
        { courseCode: 'CS1', courseName: 'CN', faculty: 'Dr. A', credits: 4, attended: 40, total: 30, lastUpdated: '2026-11-20' },
      ]),
    SchemaValidationError
  );
  assert.throws(
    () => validateDeadlines([{ id: '1', title: 'Test', dueAt: 'not-a-date', kind: 'exam', origin: 'ERP' }]),
    SchemaValidationError
  );
});

test('cache retries after a synchronous loader failure', async () => {
  const cache = new TwoTierCache();
  await assert.rejects(cache.getOrFetch('user', 'section', 1000, () => { throw new Error('failed'); }));
  assert.equal((await cache.getOrFetch('user', 'section', 1000, async () => 42)).data, 42);
});

test('clearing a user prevents an in-flight request from repopulating cache', async () => {
  const cache = new TwoTierCache();
  let finish!: (value: number) => void;
  const pending = cache.getOrFetch('user', 'section', 1000, () => new Promise<number>(resolve => { finish = resolve; }));
  await Promise.resolve();
  cache.clearUser('user');
  finish(42);
  await pending;
  assert.equal(cache.stats().entries, 0);
});

 test('cache user keys cannot collide through section delimiters', async () => {
  const cache = new TwoTierCache();
  await cache.getOrFetch('a:b', 'c', 10000, async () => 'first');
  const second = await cache.getOrFetch('a', 'b:c', 10000, async () => 'second');
  assert.equal(second.data, 'second');
  cache.clearUser('a');
  assert.equal((await cache.getOrFetch('a:b', 'c', 10000, async () => 'wrong')).data, 'first');
});

test('normalizeAttendanceEndDate clamps future dates and rejects impossible calendar dates', () => {
  const fixedNow = new Date(2026, 10, 25); // 2026-11-25
  assert.equal(normalizeAttendanceEndDate('2026-11-10', fixedNow), '2026-11-10');
  assert.equal(normalizeAttendanceEndDate('2026-12-31', fixedNow), '2026-11-25');
  assert.equal(normalizeAttendanceEndDate('2026-02-31', fixedNow), '2026-11-25');
  assert.equal(normalizeAttendanceEndDate('not-a-date', fixedNow), '2026-11-25');
  assert.equal(normalizeAttendanceEndDate(undefined, fixedNow), '2026-11-25');
});

test('getUpcomingErpExams filters ERP exam deadlines, excludes past/completed, and computes days remaining', () => {
  const now = new Date(2026, 10, 25, 10, 0, 0); // 25 Nov 2026 10:00 local
  const isoAt = (dayOffset: number, hour: number) =>
    new Date(2026, 10, 25 + dayOffset, hour, 0, 0).toISOString();

  const items: DeadlineItem[] = [
    { id: 'past-exam', title: 'CAE I', dueAt: isoAt(-1, 9), kind: 'exam', origin: 'ERP' },
    { id: 'lms-only-exam', title: 'Moodle Quiz', dueAt: isoAt(2, 9), kind: 'exam', origin: 'LMS' },
    { id: 'erp-fee', title: 'Exam Fee', dueAt: isoAt(2, 17), kind: 'fee', origin: 'ERP' },
    { id: 'completed-exam', title: 'Completed Viva', dueAt: isoAt(1, 9), kind: 'exam', origin: 'ERP' },
    { id: 'today-exam', title: 'Lab Practical', courseCode: 'SCSA2601', dueAt: isoAt(0, 14), kind: 'exam', origin: 'ERP' },
    { id: 'later-exam', title: 'CAE II — Computer Networks', courseCode: 'SCSA1601', dueAt: isoAt(8, 9), kind: 'exam', origin: 'ERP' },
    { id: 'merged-exam', title: 'CAE II — Compiler Design', courseCode: 'SCSA1602', dueAt: isoAt(3, 9), kind: 'exam', origin: 'ERP + LMS' },
    { id: 'bad-date', title: 'Malformed', dueAt: 'invalid-date', kind: 'exam', origin: 'ERP' },
  ];

  const upcoming = getUpcomingErpExams(items, {
    now,
    completedIds: new Set(['completed-exam']),
  });

  assert.equal(upcoming.length, 3);
  assert.equal(upcoming[0].item.id, 'today-exam');
  assert.equal(upcoming[0].daysRemaining, 0);
  assert.equal(upcoming[0].hoursRemaining, 4);
  assert.equal(upcoming[0].urgency, 'today');
  assert.equal(upcoming[0].countdownLabel, 'Today · 4h left');

  assert.equal(upcoming[1].item.id, 'merged-exam');
  assert.equal(upcoming[1].daysRemaining, 3);
  assert.equal(upcoming[1].urgency, 'soon');
  assert.equal(upcoming[1].countdownLabel, '3 days left');

  assert.equal(upcoming[2].item.id, 'later-exam');
  assert.equal(upcoming[2].daysRemaining, 8);
  assert.equal(upcoming[2].urgency, 'upcoming');
  assert.equal(upcoming[2].countdownLabel, '8 days left');
});

test('buildWeeklyAttendanceTrend conserves totals, aligns cumulative final %, and flags drop weeks', () => {
  const subjects: AttendanceSubject[] = [
    { courseCode: 'SCSA1601', courseName: 'Computer Networks', faculty: 'Dr. Priya', credits: 4, attended: 35, total: 40, lastUpdated: '2026-11-25' },
    { courseCode: 'SCSA1602', courseName: 'Compiler Design', faculty: 'Prof. Karthik', credits: 4, attended: 25, total: 36, lastUpdated: '2026-11-25' },
    { courseCode: 'SCSA1605', courseName: 'Software Engineering', faculty: 'Prof. Deepika', credits: 3, attended: 21, total: 29, lastUpdated: '2026-11-25' },
  ];
  const timetable: TimetableSlot[] = [
    { id: '1', day: 'Mon', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-204', faculty: 'Dr. Priya', kind: 'Lecture' },
    { id: '2', day: 'Tue', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-204', faculty: 'Prof. Karthik', kind: 'Lecture' },
    { id: '3', day: 'Wed', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1605', courseName: 'Software Engineering', room: 'CS-204', faculty: 'Prof. Deepika', kind: 'Lecture' },
  ];
  const fixedNow = new Date(2026, 10, 25, 12, 0, 0);

  const trend = buildWeeklyAttendanceTrend(subjects, timetable, 75, 'all', fixedNow);
  assert.ok(trend.points.length >= 6);

  // Exact sum conservation across all weeks
  const sumAttended = trend.points.reduce((acc, p) => acc + p.attendedInWeek, 0);
  const sumHeld = trend.points.reduce((acc, p) => acc + p.heldInWeek, 0);
  assert.equal(sumAttended, 81);
  assert.equal(sumHeld, 105);
  assert.equal(trend.currentCumulativePercent, Math.round((81 / 105) * 1000) / 10);
  assert.ok(trend.significantDropWeeks.length >= 1);
  assert.ok(trend.biggestDropWeek !== null);

  // Single-course scoping
  const cdTrend = buildWeeklyAttendanceTrend(subjects, timetable, 75, 'SCSA1602', fixedNow);
  assert.equal(cdTrend.points.reduce((acc, p) => acc + p.attendedInWeek, 0), 25);
  assert.equal(cdTrend.points.reduce((acc, p) => acc + p.heldInWeek, 0), 36);
  assert.equal(cdTrend.currentCumulativePercent, 69.4);

  // Empty subjects handled safely
  const emptyTrend = buildWeeklyAttendanceTrend([], [], 75, 'all', fixedNow);
  assert.equal(emptyTrend.points.length, 0);
  assert.equal(emptyTrend.biggestDropWeek, null);
});

test('CAE Deep-Dive computes subject comparisons against class averages and handles missing benchmarks', () => {
  const deepDive = buildSubjectCaeDeepDive({
    courseCode: 'SCSA1602',
    courseName: 'Compiler Design',
    credits: 4,
    cae1: 29,
    cae1Max: 50,
    cae2: 31,
    cae2Max: 50,
    internalBonus: 7,
    internalBonusMax: 10,
    internalTotal: 31.0,
    internalMax: 50,
    standing: 'needs-improvement',
    classAvgCae1: 35.4,
    classAvgCae2: 36.2,
    classAvgBonus: 7.8,
    classAvgInternal: 36.4,
    classTopInternal: 46.5,
  });

  assert.equal(deepDive.isEstimatedClassAvg, false);
  assert.equal(deepDive.points.length, 4);
  assert.equal(deepDive.gapVsClassPts, -5.4);
  assert.equal(deepDive.gapToTopPts, 15.5);
  assert.equal(deepDive.studentMomentumPts, 2);
  assert.equal(deepDive.classMomentumPts, 0.8);
  assert.equal(deepDive.positionLabel, 'Below average');
  assert.equal(deepDive.weakestComponent?.componentKey, 'cae1');

  // Fallback cohort baseline when live ERP omits class averages
  const estimated = buildSubjectCaeDeepDive({
    courseCode: 'SCSA1603',
    courseName: 'Machine Learning',
    credits: 4,
    cae1: 47,
    cae1Max: 50,
    cae2: 48,
    cae2Max: 50,
    internalBonus: 10,
    internalBonusMax: 10,
    internalTotal: 48.0,
    internalMax: 50,
    standing: 'strong',
  });
  assert.equal(estimated.isEstimatedClassAvg, true);
  assert.ok(estimated.gapVsClassPts > 0);
  assert.equal(estimated.positionLabel, 'Top quartile');

  const allComp = buildAllSubjectsClassComparison([
    deepDive.subject,
    estimated.subject,
  ]);
  assert.equal(allComp.length, 2);
  assert.equal(allComp[0].deltaPts, -5.4);
  assert.ok(allComp[1].deltaPts > 0);
});

test('buildGradeDistribution aggregates subject grades across semesters, single terms, and planned courses', () => {
  const semesters: SemesterResult[] = [
    {
      semester: 1,
      termLabel: 'Nov 2024',
      sgpa: 9.0,
      credits: 12,
      courses: [
        { courseCode: 'CS101', courseName: 'Programming', credits: 4, grade: 'O', gradePoints: 10 },
        { courseCode: 'CS102', courseName: 'Discrete Math', credits: 4, grade: 'A+', gradePoints: 9 },
        { courseCode: 'CS103', courseName: 'Physics', credits: 4, grade: 'A', gradePoints: 8 },
      ],
    },
    {
      semester: 2,
      termLabel: 'May 2025',
      sgpa: 8.5,
      credits: 8,
      courses: [
        { courseCode: 'CS201', courseName: 'Data Structures', credits: 4, grade: 'A+', gradePoints: 9 },
        { courseCode: 'CS202', courseName: 'Digital Logic', credits: 4, grade: 'A', gradePoints: 8 },
      ],
    },
  ];

  const allDist = buildGradeDistribution(semesters, { scope: 'all' });
  assert.equal(allDist.totalSubjects, 5);
  assert.equal(allDist.totalCredits, 20);
  assert.equal(allDist.topTierCount, 3); // 1 O + 2 A+
  assert.equal(allDist.topTierPercent, 60);
  assert.equal(allDist.dominantGrade, 'A+');
  assert.equal(allDist.dominantCount, 2);
  assert.equal(allDist.buckets.find((b) => b.grade === 'O')?.count, 1);
  assert.equal(allDist.buckets.find((b) => b.grade === 'A+')?.credits, 8);

  const sem2Dist = buildGradeDistribution(semesters, { scope: 2 });
  assert.equal(sem2Dist.totalSubjects, 2);
  assert.equal(sem2Dist.totalCredits, 8);

  const withPlanned = buildGradeDistribution(semesters, {
    scope: 'with-planned',
    currentSemester: 3,
    plannedCourses: [
      { courseCode: 'CS301', courseName: 'Algorithms', credits: 4, expectedGrade: 'O' },
      { courseCode: 'CS302', courseName: 'Networks', credits: 4, expectedGrade: 'O' },
    ],
  });
  assert.equal(withPlanned.totalSubjects, 7);
  assert.equal(withPlanned.dominantGrade, 'O');
  assert.equal(withPlanned.dominantCount, 3);
  assert.equal(withPlanned.subjects.filter((s) => s.isPlanned).length, 2);

  const emptyDist = buildGradeDistribution([]);
  assert.equal(emptyDist.totalSubjects, 0);
  assert.equal(emptyDist.dominantGrade, null);
  assert.equal(emptyDist.averageGradePoints, 0);
});

test('computeOverviewSemesterCgpa computes overall CGPA across course-grade and direct-SGPA semesters', () => {
  const result = computeOverviewSemesterCgpa([
    {
      id: 'sem-1',
      semester: 1,
      inputMode: 'courses',
      sgpa: 0,
      credits: 0,
      courses: [
        { id: 'c1', name: 'Maths', grade: 'O', credits: 4 }, // 40
        { id: 'c2', name: 'Physics', grade: 'A+', credits: 4 }, // 36
        { id: 'c3', name: 'Lab', grade: 'A', credits: 2 }, // 16 -> total 92 / 10 = 9.2
      ],
    },
    {
      id: 'sem-2',
      semester: 2,
      inputMode: 'sgpa',
      sgpa: 8.4,
      credits: 10, // 84 -> cumulative 176 / 20 = 8.8
      courses: [],
    },
  ]);

  assert.equal(result.totalCredits, 20);
  assert.equal(result.totalGradePoints, 176);
  assert.equal(result.overallCgpa, 8.8);
  assert.equal(result.equivalentPercent, 88);
  assert.equal(result.classification, 'First Class with Distinction');
  assert.equal(result.hasArrears, false);
  assert.equal(result.bestSemester?.semester, 1);
  assert.equal(result.semesters[0].sgpa, 9.2);
  assert.equal(result.semesters[0].cumulativeCgpa, 9.2);
  assert.equal(result.semesters[1].cumulativeCgpa, 8.8);

  // Arrear course prevents Distinction classification
  const withArrear = computeOverviewSemesterCgpa([
    {
      id: 'sem-1',
      semester: 1,
      inputMode: 'courses',
      sgpa: 0,
      credits: 0,
      courses: [
        { id: 'c1', name: 'Algorithms', grade: 'O', credits: 16 },
        { id: 'c2', name: 'Elective', grade: 'RA', credits: 2 },
      ],
    },
  ]);
  assert.equal(withArrear.hasArrears, true);
  assert.equal(withArrear.overallCgpa, 8.89);
  assert.equal(withArrear.classification, 'First Class');

  const empty = computeOverviewSemesterCgpa([]);
  assert.equal(empty.overallCgpa, 0);
  assert.equal(empty.totalCredits, 0);
  assert.equal(empty.classification, 'Incomplete');
});

test('simulateTargetCgpaPlan calculates required SGPA, grade mix, and feasibility across future semesters', () => {
  // 8.5 CGPA over 100 credits, target 9.0 over 2 remaining semesters of 20 credits (40 future cr)
  // Required = (9.0 * 140 - 8.5 * 100) / 40 = (1260 - 850) / 40 = 410 / 40 = 10.25 -> unreachable
  const unreachable = simulateTargetCgpaPlan(8.5, 100, 9.0, 2, 20, 6);
  assert.equal(unreachable.status, 'unreachable');
  assert.equal(unreachable.maxPossibleCgpa, 8.93);

  // Achievable target: 8.5 CGPA over 100 cr, target 8.8 over 3 remaining sems of 20 cr (60 cr)
  // Required = (8.8 * 160 - 850) / 60 = 558 / 60 = 9.30 -> challenging
  const challenging = simulateTargetCgpaPlan(8.5, 100, 8.8, 3, 20, 6);
  assert.equal(challenging.status, 'challenging');
  assert.equal(challenging.requiredAverageSgpa, 9.3);
  assert.ok(challenging.recommendedMixSgpa >= challenging.requiredAverageSgpa);
  assert.equal(challenging.milestones.length, 3);
  assert.equal(challenging.milestones[2].projectedCgpa, 8.8);

  // Comfortable target: 8.8 CGPA over 100 cr, target 7.5 over 2 sems of 20 cr
  const met = simulateTargetCgpaPlan(8.8, 100, 7.5, 2, 20, 6);
  assert.equal(met.status, 'already-met');
});

test('buildDailyAttendanceLog conserves exact subject attendance totals and clamps dates to cutoff', () => {
  const subjects: AttendanceSubject[] = [
    {
      courseCode: 'SCSA1601',
      courseName: 'Computer Networks',
      faculty: 'Dr. A',
      credits: 4,
      attended: 18,
      total: 22,
      lastUpdated: '2026-11-26',
    },
    {
      courseCode: 'SCSA1602',
      courseName: 'Operating Systems',
      faculty: 'Dr. B',
      credits: 4,
      attended: 15,
      total: 20,
      lastUpdated: '2026-11-26',
    },
  ];
  const slots: TimetableSlot[] = [
    { id: '1', day: 'Mon', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-1', faculty: 'Dr. A', kind: 'Lecture' },
    { id: '2', day: 'Wed', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-1', faculty: 'Dr. A', kind: 'Lecture' },
    { id: '3', day: 'Tue', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1602', courseName: 'Operating Systems', room: 'CS-2', faculty: 'Dr. B', kind: 'Lecture' },
    { id: '4', day: 'Thu', startTime: '11:00', endTime: '11:50', courseCode: 'SCSA1602', courseName: 'Operating Systems', room: 'CS-2', faculty: 'Dr. B', kind: 'Lecture' },
  ];

  const now = new Date(2026, 10, 26, 12, 0, 0);
  const log = buildDailyAttendanceLog(subjects, slots, {
    endDate: '2026-11-26',
    targetPercent: 75,
    now,
  });

  assert.ok(log.days.length > 0);
  assert.equal(log.cutoffDateKey, '2026-11-26');
  // Newest day must be <= cutoffDateKey and match exact cumulative totals (33/42)
  assert.ok(log.days[0].dateKey <= '2026-11-26');
  assert.equal(log.days[0].cumulativeAttended, 33);
  assert.equal(log.days[0].cumulativeTotal, 42);

  // Per-subject conservation check
  const allEntries = log.days.flatMap((d) => d.entries);
  const cnEntries = allEntries.filter((e) => e.courseCode === 'SCSA1601');
  const osEntries = allEntries.filter((e) => e.courseCode === 'SCSA1602');
  assert.equal(cnEntries.length, 22);
  assert.equal(cnEntries.filter((e) => e.status === 'present').length, 18);
  assert.equal(osEntries.length, 20);
  assert.equal(osEntries.filter((e) => e.status === 'present').length, 15);

  // Subject filter returns only matching course
  const osOnly = buildDailyAttendanceLog(subjects, slots, {
    endDate: '2026-11-26',
    subjectCode: 'SCSA1602',
    now,
  });
  assert.ok(osOnly.days.every((d) => d.entries.every((e) => e.courseCode === 'SCSA1602')));
  assert.equal(osOnly.days[0].cumulativeAttended, 15);
  assert.equal(osOnly.days[0].cumulativeTotal, 20);
});

test('findNextClass resolves Saturday timetable sessions accurately', () => {
  const slots: TimetableSlot[] = [
    { id: 'fri-1', day: 'Fri', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-204', faculty: 'Dr. A', kind: 'Lecture' },
    { id: 'sat-1', day: 'Sat', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1604', courseName: 'Cloud Computing Architecture', room: 'CS-206', faculty: 'Prof. N. Anitha', kind: 'Lecture' },
  ];
  const fridayAfternoon = new Date(2026, 10, 27, 15, 0, 0);
  const next = findNextClass(slots, [], fridayAfternoon, 75);
  assert.ok(next);
  assert.equal(next.slot.id, 'sat-1');
  assert.equal(next.slot.day, 'Sat');
  assert.equal(next.dayLabel, 'Tomorrow, Sat');
});

test('computeAttendanceAsOfDate updates subject and overall attendance day-by-day in lockstep with daily log', () => {
  const subjects: AttendanceSubject[] = [
    { courseCode: 'SCSA1601', courseName: 'Computer Networks', faculty: 'Dr. A', credits: 4, attended: 20, total: 24, lastUpdated: '2026-11-28' },
    { courseCode: 'SCSA1604', courseName: 'Cloud Computing', faculty: 'Prof. B', credits: 3, attended: 14, total: 18, lastUpdated: '2026-11-28' },
  ];
  const slots: TimetableSlot[] = [
    { id: '1', day: 'Mon', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-1', faculty: 'Dr. A', kind: 'Lecture' },
    { id: '2', day: 'Wed', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-1', faculty: 'Dr. A', kind: 'Lecture' },
    { id: '3', day: 'Fri', startTime: '11:10', endTime: '12:00', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-1', faculty: 'Dr. A', kind: 'Lecture' },
    { id: '4', day: 'Tue', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1604', courseName: 'Cloud Computing', room: 'CS-2', faculty: 'Prof. B', kind: 'Lecture' },
    { id: '5', day: 'Sat', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1604', courseName: 'Cloud Computing', room: 'CS-2', faculty: 'Prof. B', kind: 'Lecture' },
  ];
  // 2026-11-28 is Saturday
  const satNow = new Date(2026, 10, 28, 12, 0, 0);
  const satAttendance = computeAttendanceAsOfDate(subjects, slots, '2026-11-28', satNow);
  const friKey = shiftAttendanceDateKey('2026-11-28', -1, satNow);
  assert.equal(friKey, '2026-11-27');

  const friAttendance = computeAttendanceAsOfDate(subjects, slots, friKey, satNow);
  // Stepping back from Saturday to Friday removes Saturday's SCSA1604 class (18 -> 17), while SCSA1601 (no Sat class) stays 24
  assert.equal(satAttendance[1].total, 18);
  assert.equal(friAttendance[1].total, 17);
  assert.equal(friAttendance[0].total, 24);
  assert.ok(friAttendance[1].lastUpdated <= '2026-11-27');

  // Stepping back from Friday to Thursday removes Friday's SCSA1601 class (24 -> 23)
  const thuKey = shiftAttendanceDateKey(friKey, -1, satNow);
  const thuAttendance = computeAttendanceAsOfDate(subjects, slots, thuKey, satNow);
  assert.equal(thuAttendance[0].total, 23);

  // Shifting forward past today clamps strictly to today
  assert.equal(shiftAttendanceDateKey('2026-11-28', 5, satNow), '2026-11-28');
});

test('attendanceSnapshots seeds 30-day daily history, preserves live snapshots, and computes trend metrics', () => {
  const subjects: AttendanceSubject[] = [
    { courseCode: 'SCSA1601', courseName: 'Computer Networks', faculty: 'Dr. A', credits: 4, attended: 20, total: 24, lastUpdated: '2026-11-27' },
    { courseCode: 'SCSA1602', courseName: 'Operating Systems', faculty: 'Dr. B', credits: 4, attended: 16, total: 22, lastUpdated: '2026-11-27' },
  ];
  const slots: TimetableSlot[] = [
    { id: '1', day: 'Mon', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-1', faculty: 'Dr. A', kind: 'Lecture' },
    { id: '2', day: 'Wed', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-1', faculty: 'Dr. A', kind: 'Lecture' },
    { id: '3', day: 'Fri', startTime: '11:10', endTime: '12:00', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-1', faculty: 'Dr. A', kind: 'Lecture' },
    { id: '4', day: 'Tue', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1602', courseName: 'Operating Systems', room: 'CS-2', faculty: 'Dr. B', kind: 'Lecture' },
    { id: '5', day: 'Thu', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1602', courseName: 'Operating Systems', room: 'CS-2', faculty: 'Dr. B', kind: 'Lecture' },
    { id: '6', day: 'Fri', startTime: '13:00', endTime: '13:50', courseCode: 'SCSA1602', courseName: 'Operating Systems', room: 'CS-2', faculty: 'Dr. B', kind: 'Lecture' },
  ];

  const now = new Date(2026, 10, 27, 15, 0, 0);
  // Existing live snapshot from 3 days earlier must be preserved across merges
  const priorLive = sanitizeSnapshotStore([
    {
      dateKey: '2026-11-24',
      shortDate: '24 Nov',
      dayName: 'Tue',
      capturedAt: '2026-11-24T17:30:00.000Z',
      source: 'live-snapshot',
      dayPresent: 1,
      dayTotal: 1,
      dayPercentage: 100,
      overallPercentage: 80.5,
      subjects: [
        { courseCode: 'SCSA1602', courseName: 'Operating Systems', dayPresent: 1, dayTotal: 1, dayPercentage: 100, cumulativePercentage: 75 },
      ],
    },
    { dateKey: 'bad-date', dayTotal: 999 }, // must be rejected
  ]);
  assert.equal(priorLive.length, 1);

  const merged = seedAndMerge30DaySnapshots(priorLive, subjects, slots, '2026-11-27', 75, now);
  const window30 = selectLast30DaySnapshots(merged, '2026-11-27', now);

  assert.ok(window30.length >= 10);
  assert.ok(window30.every((s) => s.dateKey >= '2026-10-29' && s.dateKey <= '2026-11-27'));
  // Preserved prior live snapshot
  const preserved = window30.find((s) => s.dateKey === '2026-11-24');
  assert.ok(preserved);
  assert.equal(preserved.source, 'live-snapshot');
  assert.equal(preserved.overallPercentage, 80.5);

  // Active end date is always marked live-snapshot and has day-only class count (<= 2 classes on Friday)
  const latest = window30[window30.length - 1];
  assert.equal(latest.dateKey, '2026-11-27');
  assert.equal(latest.source, 'live-snapshot');
  assert.ok(latest.dayTotal <= 2);

  const overallSummary = compute30DayTrendSummary(window30, 75, 'all');
  assert.equal(overallSummary.totalStoredCount, window30.length);
  assert.ok(overallSummary.liveSnapshotCount >= 2);
  assert.ok(overallSummary.bestDay !== null);

  const singleSubjectSummary = compute30DayTrendSummary(window30, 75, 'SCSA1601');
  assert.equal(singleSubjectSummary.points.length, window30.length);
});

test('extractErpAccessToken extracts tokens from raw JWT, quoted strings, headers, JSON, and DevTools cURL while inferring RegisterNumber', () => {
  assert.equal(ERP_CONSOLE_COPY_SNIPPET, "copy(localStorage.getItem('Access-Token'))");

  const payload = Buffer.from(
    JSON.stringify({ StudentId: 7742, RegisterNumber: '42110482', StudentName: 'Kavya Nair' })
  ).toString('base64url');
  const jwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.signature_part_123456`;

  // 1. Raw quoted JWT
  const fromQuoted = extractErpAccessToken(`"${jwt}"`);
  assert.equal(fromQuoted.token, jwt);
  assert.equal(fromQuoted.format, 'jwt');
  assert.equal(fromQuoted.registerNumber, '42110482');
  assert.equal(fromQuoted.studentName, 'Kavya Nair');
  assert.match(formatExtractedTokenSummary(fromQuoted), /42110482/);

  // 2. HTTP header format (Access-Token and Authorization: Bearer)
  const fromHeader = extractErpAccessToken(`Access-Token: ${jwt}`);
  assert.equal(fromHeader.token, jwt);
  assert.equal(fromHeader.format, 'header');
  assert.equal(fromHeader.registerNumber, '42110482');

  const fromBearer = extractErpAccessToken(`Authorization: Bearer ${jwt}`);
  assert.equal(fromBearer.token, jwt);
  assert.equal(fromBearer.format, 'header');

  // 3. JSON login payload / storage object
  const fromJson = extractErpAccessToken(
    JSON.stringify({ status: 1, responseData: { login: { accessToken: jwt } } })
  );
  assert.equal(fromJson.token, jwt);
  assert.equal(fromJson.format, 'json');
  assert.equal(fromJson.registerNumber, '42110482');

  // 4. DevTools "Copy as cURL" command
  const curlCmd = `curl 'https://erp.sathyabama.ac.in/erp/api/v1.0/MasterStudent/view' -H 'accept: application/json' -H 'authorization: Bearer ${jwt}'`;
  const fromCurl = extractErpAccessToken(curlCmd);
  assert.equal(fromCurl.token, jwt);
  assert.equal(fromCurl.format, 'curl');
  assert.equal(fromCurl.registerNumber, '42110482');

  // 5. Session cookie string
  const fromCookie = extractErpAccessToken('PHPSESSID=abc123456789xyz');
  assert.equal(fromCookie.token, 'PHPSESSID=abc123456789xyz');
  assert.equal(fromCookie.format, 'raw');

  // 6. Rejects empty, literal "null", and short non-tokens
  assert.equal(extractErpAccessToken('').token, null);
  assert.equal(extractErpAccessToken('null').token, null);
  assert.equal(extractErpAccessToken('undefined').token, null);
  assert.equal(extractErpAccessToken('short').token, null);
});
