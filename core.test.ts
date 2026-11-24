import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAttendanceStats, computeOverallAttendance, simulateAttendance } from './attendance';
import {
  buildCgpaTrajectory,
  computeCgpaSummary,
  computeProjectedCgpa,
  computeSemesterGpa,
  evaluateCgpaThreshold,
  planTargetCgpa,
} from './gpa';
import { deduplicateDeadlines, findNextClass } from './schedule';
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
