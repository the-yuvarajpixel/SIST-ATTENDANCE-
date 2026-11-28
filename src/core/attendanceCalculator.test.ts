import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAttendance,
  calculateOverallAttendanceSummary,
  calculateSimulatedAttendance,
  formatAttendancePercent2dp,
  validateManualAttendanceEntry,
} from './attendanceCalculator';

test('exhaustive 80% integer arithmetic holds across 5,150 (attended, total) pairs with exact maximality and minimality', () => {
  let checked = 0;
  for (let total = 1; total <= 100; total += 1) {
    for (let attended = 0; attended <= total; attended += 1) {
      const res = calculateAttendance(attended, total, 80);
      checked += 1;

      assert.equal(res.attended, attended);
      assert.equal(res.total, total);
      assert.equal(res.absent, total - attended);
      assert.equal(res.hasClasses, true);
      assert.match(res.formattedPercentage, /^\d+\.\d{2}%$/);

      const meets80 = 5 * attended >= 4 * total;
      if (meets80) {
        assert.equal(res.mustAttend, 0);
        const expectedSkip = Math.floor((5 * attended - 4 * total) / 4);
        assert.equal(res.canSkip, expectedSkip);
        // Maximality: skipping canSkip stays >= 80%, skipping canSkip + 1 drops < 80%
        assert.ok(5 * attended >= 4 * (total + res.canSkip));
        assert.ok(5 * attended < 4 * (total + res.canSkip + 1));

        // Exact Green (>83%) vs Amber (80%..83% inclusive)
        if (100 * attended > 83 * total) {
          assert.equal(res.band, 'green');
        } else {
          assert.equal(res.band, 'amber');
        }
      } else {
        assert.equal(res.canSkip, 0);
        const expectedMust = 4 * total - 5 * attended;
        assert.equal(res.mustAttend, expectedMust);
        assert.equal(res.band, 'red');
        // Minimality: attending mustAttend reaches >= 80%, attending mustAttend - 1 stays < 80%
        assert.ok(5 * (attended + res.mustAttend) >= 4 * (total + res.mustAttend));
        assert.ok(5 * (attended + res.mustAttend - 1) < 4 * (total + res.mustAttend - 1));
      }
    }
  }
  assert.equal(checked, 5150);
});

test('floating-point boundaries, 2dp formatting, and exact guidance wording work reliably', () => {
  // Exact 80.00% -> Amber, canSkip = 0
  const at80 = calculateAttendance(4, 5, 80);
  assert.equal(at80.formattedPercentage, '80.00%');
  assert.equal(at80.band, 'amber');
  assert.equal(at80.canSkip, 0);
  assert.equal(at80.mustAttend, 0);
  assert.equal(at80.guidanceText, 'You can skip 0 classes');

  // Exact 83.00% -> Amber (80%-83% inclusive)
  const at83 = calculateAttendance(83, 100, 80);
  assert.equal(at83.formattedPercentage, '83.00%');
  assert.equal(at83.band, 'amber');
  assert.equal(at83.canSkip, 3);
  assert.equal(at83.guidanceText, 'You can skip 3 classes');

  // 83.10% -> Green (strictly above 83%)
  const above83 = calculateAttendance(831, 1000, 80);
  assert.equal(above83.formattedPercentage, '83.10%');
  assert.equal(above83.band, 'green');

  // 5 / 6 = 83.33% -> Green
  const fiveSixth = calculateAttendance(5, 6, 80);
  assert.equal(fiveSixth.formattedPercentage, '83.33%');
  assert.equal(fiveSixth.band, 'green');
  assert.equal(fiveSixth.canSkip, 0);

  // 28 / 32 = 87.50% -> Green, canSkip = floor((140 - 128)/4) = 3
  const safe = calculateAttendance(28, 32, 80);
  assert.equal(safe.formattedPercentage, '87.50%');
  assert.equal(safe.absent, 4);
  assert.equal(safe.canSkip, 3);
  assert.equal(safe.guidanceText, 'You can skip 3 classes');

  // Singular skip copy: 21 / 25 = 84.00% -> floor((105 - 100)/4) = 1
  const skipOne = calculateAttendance(21, 25, 80);
  assert.equal(skipOne.canSkip, 1);
  assert.equal(skipOne.guidanceText, 'You can skip 1 class');

  // Below 80%: 25 / 36 = 69.44% -> mustAttend = 4*36 - 5*25 = 144 - 125 = 19
  const shortage = calculateAttendance(25, 36, 80);
  assert.equal(shortage.formattedPercentage, '69.44%');
  assert.equal(shortage.band, 'red');
  assert.equal(shortage.mustAttend, 19);
  assert.equal(
    shortage.guidanceText,
    'You must attend 19 more consecutive classes to reach 80%.'
  );

  // Singular attend copy: 7 / 9 = 77.78% -> mustAttend = 36 - 35 = 1 (8/10 = 80%)
  const needOne = calculateAttendance(7, 9, 80);
  assert.equal(needOne.mustAttend, 1);
  assert.equal(
    needOne.guidanceText,
    'You must attend 1 more consecutive class to reach 80%.'
  );
});

test('handles zero conducted classes and invalid/out-of-range inputs safely', () => {
  const zero = calculateAttendance(0, 0, 80);
  assert.equal(zero.hasClasses, false);
  assert.equal(zero.percentage, 0);
  assert.equal(zero.formattedPercentage, '0.00%');
  assert.equal(zero.absent, 0);
  assert.equal(zero.canSkip, 0);
  assert.equal(zero.mustAttend, 0);
  assert.equal(zero.band, 'neutral');
  assert.equal(zero.guidanceText, 'No classes conducted yet');

  // NaN, Infinity, negative, and attended > total are safely clamped without NaN
  const invalidNaN = calculateAttendance(Number.NaN, Number.NaN, 80);
  assert.equal(invalidNaN.hasClasses, false);
  assert.equal(invalidNaN.formattedPercentage, '0.00%');

  const neg = calculateAttendance(-5, -10, 80);
  assert.equal(neg.hasClasses, false);
  assert.equal(neg.total, 0);

  const clamped = calculateAttendance(50, 30, 80);
  assert.equal(clamped.attended, 30);
  assert.equal(clamped.total, 30);
  assert.equal(clamped.absent, 0);
  assert.equal(clamped.formattedPercentage, '100.00%');

  assert.equal(formatAttendancePercent2dp(Number.NaN), '0.00%');
  assert.equal(formatAttendancePercent2dp(120), '100.00%');
});

test('What-If simulation and overall sum(attended)/sum(conducted) recalculate accurately without mutating base values', () => {
  const base = { attended: 24, total: 30 }; // 80.00%
  const plusPresent = calculateSimulatedAttendance(base.attended, base.total, 2, 0, 80);
  assert.equal(plusPresent.attended, 26);
  assert.equal(plusPresent.total, 32);
  assert.equal(plusPresent.absent, 6);
  assert.equal(plusPresent.formattedPercentage, '81.25%');
  assert.equal(plusPresent.band, 'amber');

  const plusAbsent = calculateSimulatedAttendance(base.attended, base.total, 0, 1, 80);
  assert.equal(plusAbsent.attended, 24);
  assert.equal(plusAbsent.total, 31);
  assert.equal(plusAbsent.absent, 7);
  assert.equal(plusAbsent.formattedPercentage, '77.42%');
  assert.equal(plusAbsent.band, 'red');
  assert.equal(plusAbsent.mustAttend, 4); // 4*31 - 5*24 = 124 - 120 = 4

  // Base object remained untouched
  assert.equal(base.attended, 24);
  assert.equal(base.total, 30);

  // Overall uses exact sum(attended) / sum(conducted), NOT average of percentages
  const overall = calculateOverallAttendanceSummary(
    [
      { attended: 30, total: 34 }, // 88.24% (green)
      { attended: 24, total: 30 }, // 80.00% (amber)
      { attended: 20, total: 30 }, // 66.67% (red)
      { attended: 0, total: 0 },   // 0 classes (neutral)
    ],
    80
  );
  assert.equal(overall.attended, 74);
  assert.equal(overall.total, 94);
  assert.equal(overall.absent, 20);
  // 74 / 94 = 78.7234% -> 78.72%, mustAttend = 4*94 - 5*74 = 376 - 370 = 6
  assert.equal(overall.stats.formattedPercentage, '78.72%');
  assert.equal(overall.stats.band, 'red');
  assert.equal(overall.stats.mustAttend, 6);
  assert.equal(overall.greenCount, 1);
  assert.equal(overall.amberCount, 1);
  assert.equal(overall.redCount, 1);
  assert.equal(overall.neutralCount, 1);
});

test('manual attendance entry validator accepts valid & zero-class entries and rejects invalid input', () => {
  const okNormal = validateManualAttendanceEntry({
    courseCode: ' scsa1608 ',
    courseName: 'Cyber Security',
    attended: '24',
    total: '30',
  });
  assert.equal(okNormal.ok, true);
  if (okNormal.ok) {
    assert.equal(okNormal.subject.courseCode, 'SCSA1608');
    assert.equal(okNormal.subject.attended, 24);
    assert.equal(okNormal.subject.total, 30);
  }

  // Zero conducted classes (0/0) allowed cleanly
  const okZero = validateManualAttendanceEntry({
    courseCode: 'SCSA1609',
    courseName: 'Project Seminar',
    attended: '0',
    total: '0',
  });
  assert.equal(okZero.ok, true);

  // Present > Total rejected
  const errExceeds = validateManualAttendanceEntry({
    courseCode: 'SCSA1610',
    courseName: 'AI Ethics',
    attended: '31',
    total: '30',
  });
  assert.equal(errExceeds.ok, false);

  // Negative & decimal values rejected
  const errNegative = validateManualAttendanceEntry({
    courseCode: 'SCSA1610',
    courseName: 'AI Ethics',
    attended: '-1',
    total: '10',
  });
  assert.equal(errNegative.ok, false);

  const errDecimal = validateManualAttendanceEntry({
    courseCode: 'SCSA1610',
    courseName: 'AI Ethics',
    attended: '8.5',
    total: '10',
  });
  assert.equal(errDecimal.ok, false);

  // Duplicate course code rejected
  const errDuplicate = validateManualAttendanceEntry(
    {
      courseCode: 'scsa1601',
      courseName: 'Duplicate Course',
      attended: '10',
      total: '12',
    },
    ['SCSA1601']
  );
  assert.equal(errDuplicate.ok, false);
});
