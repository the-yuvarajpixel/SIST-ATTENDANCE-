import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_CAE_UPLOAD_BYTES,
  buildCaeCsvTemplate,
  buildNormalizedCaeMark,
  mergeCaeMarks,
  parseCaeMarksText,
} from './caeUpload';
import { validateCaeMarks } from './schemas';

test('parseCaeMarksText parses CSV with flexible headers and auto-calculates internal total and standing', () => {
  const csv = [
    '\uFEFFSubject Code,Subject Name,Credits,CAE 1,CAE 2,Assignment,Class Avg',
    'scsa1601,"Computer Networks, Security",4,45,48,9,39.5',
    'SCSA1602,Operating Systems,4,34,36,7,',
    'SCSA1603,Compiler Design,3,24,26,5,35',
  ].join('\n');

  const res = parseCaeMarksText(csv);
  assert.equal(res.format, 'csv');
  assert.equal(res.errors.length, 0);
  assert.equal(res.marks.length, 3);

  const cn = res.marks[0];
  assert.equal(cn.courseCode, 'SCSA1601');
  assert.equal(cn.courseName, 'Computer Networks, Security');
  assert.equal(cn.cae1, 45);
  assert.equal(cn.cae2, 48);
  assert.equal(cn.internalBonus, 9);
  // 45/50*20 + 48/50*20 + 9 = 18 + 19.2 + 9 = 46.2
  assert.equal(cn.internalTotal, 46.2);
  assert.equal(cn.standing, 'strong');
  assert.equal(cn.classAvgInternal, 39.5);

  const os = res.marks[1];
  // 34/50*20 + 36/50*20 + 7 = 13.6 + 14.4 + 7 = 35.0 (70% -> on-track)
  assert.equal(os.internalTotal, 35);
  assert.equal(os.standing, 'on-track');

  const cd = res.marks[2];
  // 24/50*20 + 26/50*20 + 5 = 9.6 + 10.4 + 5 = 25.0 (50% -> needs-improvement)
  assert.equal(cd.internalTotal, 25);
  assert.equal(cd.standing, 'needs-improvement');

  // Verify schema validator accepts all parsed marks
  const validated = validateCaeMarks(res.marks);
  assert.equal(validated.length, 3);
});

test('parseCaeMarksText parses tab-separated Excel/ERP paste with fraction scores and JSON arrays', () => {
  const tsv = [
    'Code\tCourse\tCAE1\tCAE2\tLab',
    'SCSA1604\tMachine Learning\t42/50\t44/50\t8.5',
  ].join('\n');

  const tsvRes = parseCaeMarksText(tsv);
  assert.equal(tsvRes.format, 'tsv');
  assert.equal(tsvRes.errors.length, 0);
  assert.equal(tsvRes.marks.length, 1);
  assert.equal(tsvRes.marks[0].cae1, 42);
  assert.equal(tsvRes.marks[0].cae2, 44);
  assert.equal(tsvRes.marks[0].internalBonus, 8.5);
  // 16.8 + 17.6 + 8.5 = 42.9
  assert.equal(tsvRes.marks[0].internalTotal, 42.9);

  const json = JSON.stringify({
    caeMarks: [
      { courseCode: 'SCSA1605', courseName: 'Cloud Computing', credits: 3, cae1: 40, cae2: null, internalBonus: 8 },
    ],
  });
  const jsonRes = parseCaeMarksText(json);
  assert.equal(jsonRes.format, 'json');
  assert.equal(jsonRes.errors.length, 0);
  assert.equal(jsonRes.marks.length, 1);
  assert.equal(jsonRes.marks[0].cae2, null);
  assert.equal(jsonRes.marks[0].internalTotal, 40);
});

test('parseCaeMarksText rejects oversized payloads and out-of-range marks cleanly', () => {
  const huge = 'a'.repeat(MAX_CAE_UPLOAD_BYTES + 10);
  const sizeRes = parseCaeMarksText(huge);
  assert.equal(sizeRes.marks.length, 0);
  assert.ok(sizeRes.errors[0].includes('limit'));

  const badRow = buildNormalizedCaeMark({
    courseCode: 'SCSA1601',
    courseName: 'Networks',
    cae1: 75,
    cae1Max: 50,
  });
  assert.equal(badRow.mark, null);
  assert.match(badRow.error ?? '', /between 0 and 50/);
});

test('mergeCaeMarks preserves class averages on merge and replaces all rows on replace', () => {
  const existing = [
    buildNormalizedCaeMark({
      courseCode: 'SCSA1601',
      courseName: 'Computer Networks',
      cae1: 35,
      cae2: 36,
      internalBonus: 7,
      classAvgInternal: 38.2,
    }).mark!,
    buildNormalizedCaeMark({
      courseCode: 'SCSA1602',
      courseName: 'Operating Systems',
      cae1: 40,
      cae2: 42,
      internalBonus: 8,
    }).mark!,
  ];

  const incoming = [
    buildNormalizedCaeMark({
      courseCode: 'SCSA1601',
      courseName: 'Computer Networks',
      cae1: 46,
      cae2: 48,
      internalBonus: 9.5,
    }).mark!,
  ];

  const merged = mergeCaeMarks(existing, incoming, 'merge');
  assert.equal(merged.length, 2);
  assert.equal(merged[0].cae1, 46);
  assert.equal(merged[0].classAvgInternal, 38.2);

  const replaced = mergeCaeMarks(existing, incoming, 'replace');
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].courseCode, 'SCSA1601');
});

test('buildCaeCsvTemplate neutralizes spreadsheet formula prefixes in exported cells', () => {
  const dangerous = buildNormalizedCaeMark({
    courseCode: 'SCSA1699',
    courseName: '=HYPERLINK("http://evil.example","Click")',
    cae1: 40,
    cae2: 42,
    internalBonus: 8,
    remarks: '+SUM(A1:A5)',
  }).mark!;

  const csv = buildCaeCsvTemplate([dangerous]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+SUM(A1:A5)"));
});
