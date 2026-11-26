import type { CaeStanding, SubjectCaeMark } from './types';

export const MAX_CAE_UPLOAD_BYTES = 256 * 1024; // 256 KB file/text cap
export const MAX_CAE_UPLOAD_ROWS = 30;

export interface RawCaeMarkInput {
  courseCode: string;
  courseName: string;
  credits?: number | null;
  cae1?: number | null;
  cae1Max?: number | null;
  cae2?: number | null;
  cae2Max?: number | null;
  internalBonus?: number | null;
  internalBonusMax?: number | null;
  internalTotal?: number | null;
  internalMax?: number | null;
  classAvgInternal?: number | null;
  classAvgCae1?: number | null;
  classAvgCae2?: number | null;
  remarks?: string;
}

export interface ParsedCaeUploadResult {
  marks: SubjectCaeMark[];
  errors: string[];
  format: 'csv' | 'tsv' | 'json';
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function sanitizeText(raw: string, maxLen: number): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function parseOptionalNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const cleaned = raw.trim();
    if (!cleaned || /^(-|—|n\/?a|pending|ab|absent|null)$/i.test(cleaned)) return null;
    // Handle fraction strings like "42/50" by extracting the numerator
    const fractionMatch = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*\d+(?:\.\d+)?$/);
    const num = Number(fractionMatch ? fractionMatch[1] : cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Computes normalized internalTotal and standing for a single CAE subject record.
 * Standard Sathyabama weightage: CAE 1 (20) + CAE 2 (20) + Assignment/Lab (10) = 50 internal.
 */
export function buildNormalizedCaeMark(input: RawCaeMarkInput): {
  mark: SubjectCaeMark | null;
  error?: string;
} {
  const courseCode = sanitizeText(input.courseCode ?? '', 24).toUpperCase();
  const courseName = sanitizeText(input.courseName ?? '', 120);

  if (!courseCode) {
    return { mark: null, error: 'Missing course code.' };
  }
  if (!courseName) {
    return { mark: null, error: `${courseCode}: Missing course name.` };
  }

  const creditsRaw = input.credits ?? 3;
  const credits = Number.isFinite(creditsRaw) ? clamp(Math.round(creditsRaw), 0, 12) : 3;

  const cae1Max = input.cae1Max && input.cae1Max > 0 ? clamp(input.cae1Max, 1, 200) : 50;
  const cae2Max = input.cae2Max && input.cae2Max > 0 ? clamp(input.cae2Max, 1, 200) : 50;
  const internalBonusMax =
    input.internalBonusMax !== null && input.internalBonusMax !== undefined && input.internalBonusMax >= 0
      ? clamp(input.internalBonusMax, 0, 100)
      : 10;
  const internalMax = input.internalMax && input.internalMax > 0 ? clamp(input.internalMax, 1, 200) : 50;

  const cae1 = input.cae1 !== null && input.cae1 !== undefined ? round1(input.cae1) : null;
  const cae2 = input.cae2 !== null && input.cae2 !== undefined ? round1(input.cae2) : null;
  const internalBonus =
    input.internalBonus !== null && input.internalBonus !== undefined ? round1(input.internalBonus) : null;

  if (cae1 !== null && (cae1 < 0 || cae1 > cae1Max)) {
    return { mark: null, error: `${courseCode}: CAE 1 (${cae1}) must be between 0 and ${cae1Max}.` };
  }
  if (cae2 !== null && (cae2 < 0 || cae2 > cae2Max)) {
    return { mark: null, error: `${courseCode}: CAE 2 (${cae2}) must be between 0 and ${cae2Max}.` };
  }
  if (internalBonus !== null && (internalBonus < 0 || internalBonus > Math.max(internalBonusMax, 100))) {
    return {
      mark: null,
      error: `${courseCode}: Assignment/Lab (${internalBonus}) must be between 0 and ${internalBonusMax}.`,
    };
  }

  let internalTotal: number;
  if (input.internalTotal !== null && input.internalTotal !== undefined && Number.isFinite(input.internalTotal)) {
    if (input.internalTotal < 0 || input.internalTotal > internalMax) {
      return {
        mark: null,
        error: `${courseCode}: Internal total (${input.internalTotal}) must be between 0 and ${internalMax}.`,
      };
    }
    internalTotal = round1(input.internalTotal);
  } else if (cae1 !== null || cae2 !== null || internalBonus !== null) {
    // Derive standard 50-mark internal total from available CAE components
    const cae1Ratio = cae1 !== null ? cae1 / cae1Max : null;
    const cae2Ratio = cae2 !== null ? cae2 / cae2Max : null;
    const bonusPart =
      internalBonus !== null
        ? (internalBonusMax > 0 ? (internalBonus / internalBonusMax) * 10 : internalBonus)
        : 0;

    let computedOutOf50: number;
    if (cae1Ratio !== null && cae2Ratio !== null) {
      computedOutOf50 = cae1Ratio * 20 + cae2Ratio * 20 + bonusPart;
    } else if (cae1Ratio !== null) {
      // Only CAE 1 published so far — project CAE portion proportionally
      computedOutOf50 = cae1Ratio * (internalBonus !== null ? 40 : 50) + bonusPart;
    } else if (cae2Ratio !== null) {
      computedOutOf50 = cae2Ratio * (internalBonus !== null ? 40 : 50) + bonusPart;
    } else {
      computedOutOf50 = bonusPart;
    }
    internalTotal = round1(clamp((computedOutOf50 / 50) * internalMax, 0, internalMax));
  } else {
    internalTotal = 0;
  }

  const hasAnyScore =
    cae1 !== null ||
    cae2 !== null ||
    internalBonus !== null ||
    (input.internalTotal !== null && input.internalTotal !== undefined);

  const pct = internalMax > 0 ? (internalTotal / internalMax) * 100 : 0;
  let standing: CaeStanding;
  if (!hasAnyScore) {
    standing = 'pending';
  } else if (pct >= 80) {
    standing = 'strong';
  } else if (pct >= 65) {
    standing = 'on-track';
  } else {
    standing = 'needs-improvement';
  }

  const classAvgInternal =
    input.classAvgInternal !== null &&
    input.classAvgInternal !== undefined &&
    Number.isFinite(input.classAvgInternal) &&
    input.classAvgInternal >= 0 &&
    input.classAvgInternal <= internalMax
      ? round1(input.classAvgInternal)
      : undefined;

  const classAvgCae1 =
    input.classAvgCae1 !== null &&
    input.classAvgCae1 !== undefined &&
    Number.isFinite(input.classAvgCae1) &&
    input.classAvgCae1 >= 0 &&
    input.classAvgCae1 <= cae1Max
      ? round1(input.classAvgCae1)
      : undefined;

  const classAvgCae2 =
    input.classAvgCae2 !== null &&
    input.classAvgCae2 !== undefined &&
    Number.isFinite(input.classAvgCae2) &&
    input.classAvgCae2 >= 0 &&
    input.classAvgCae2 <= cae2Max
      ? round1(input.classAvgCae2)
      : undefined;

  const remarks = input.remarks ? sanitizeText(input.remarks, 160) : undefined;

  return {
    mark: {
      courseCode,
      courseName,
      credits,
      cae1,
      cae1Max,
      cae2,
      cae2Max,
      internalBonus,
      internalBonusMax,
      internalTotal,
      internalMax,
      standing,
      remarks: remarks || undefined,
      classAvgCae1,
      classAvgCae2,
      classAvgInternal,
    },
  };
}

/**
 * RFC-4180 style delimited line parser (supports commas or tabs with quoted fields).
 */
function parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

type CanonicalField =
  | 'courseCode'
  | 'courseName'
  | 'credits'
  | 'cae1'
  | 'cae1Max'
  | 'cae2'
  | 'cae2Max'
  | 'internalBonus'
  | 'internalBonusMax'
  | 'internalTotal'
  | 'internalMax'
  | 'classAvgInternal'
  | 'classAvgCae1'
  | 'classAvgCae2'
  | 'remarks';

function matchHeaderField(rawHeader: string): CanonicalField | null {
  const key = rawHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['coursecode', 'subjectcode', 'code', 'subcode', 'paperCode'.toLowerCase()].includes(key)) {
    return 'courseCode';
  }
  if (['coursename', 'subjectname', 'subject', 'course', 'title', 'name', 'subname'].includes(key)) {
    return 'courseName';
  }
  if (['credits', 'credit', 'cr'].includes(key)) {
    return 'credits';
  }
  if (['cae1', 'cia1', 'cat1', 'internal1', 'test1', 'cae1marks', 'cae1score'].includes(key)) {
    return 'cae1';
  }
  if (['cae1max', 'cia1max', 'maxcae1'].includes(key)) {
    return 'cae1Max';
  }
  if (['cae2', 'cia2', 'cat2', 'internal2', 'test2', 'cae2marks', 'cae2score'].includes(key)) {
    return 'cae2';
  }
  if (['cae2max', 'cia2max', 'maxcae2'].includes(key)) {
    return 'cae2Max';
  }
  if (
    ['internalbonus', 'bonus', 'assignment', 'assignlab', 'assignmentlab', 'lab', 'activity', 'quiz'].includes(key)
  ) {
    return 'internalBonus';
  }
  if (['internalbonusmax', 'bonusmax', 'assignmentmax'].includes(key)) {
    return 'internalBonusMax';
  }
  if (['internaltotal', 'internal', 'total', 'totalinternal', 'caetotal', 'overall', 'marks'].includes(key)) {
    return 'internalTotal';
  }
  if (['internalmax', 'maxinternal', 'totalmax', 'maxmarks'].includes(key)) {
    return 'internalMax';
  }
  if (['classavginternal', 'classavg', 'classaverage', 'cohortavg', 'avg'].includes(key)) {
    return 'classAvgInternal';
  }
  if (['classavgcae1', 'cae1classavg'].includes(key)) {
    return 'classAvgCae1';
  }
  if (['classavgcae2', 'cae2classavg'].includes(key)) {
    return 'classAvgCae2';
  }
  if (['remarks', 'notes', 'comment', 'comments'].includes(key)) {
    return 'remarks';
  }
  return null;
}

function parseObjectRecord(rec: Record<string, unknown>): RawCaeMarkInput {
  const mapped: Partial<Record<CanonicalField, unknown>> = {};
  for (const [k, v] of Object.entries(rec)) {
    const canonical = matchHeaderField(k);
    if (canonical && mapped[canonical] === undefined) {
      mapped[canonical] = v;
    }
  }
  return {
    courseCode: typeof mapped.courseCode === 'string' || typeof mapped.courseCode === 'number' ? String(mapped.courseCode) : '',
    courseName: typeof mapped.courseName === 'string' ? mapped.courseName : '',
    credits: parseOptionalNumber(mapped.credits),
    cae1: parseOptionalNumber(mapped.cae1),
    cae1Max: parseOptionalNumber(mapped.cae1Max),
    cae2: parseOptionalNumber(mapped.cae2),
    cae2Max: parseOptionalNumber(mapped.cae2Max),
    internalBonus: parseOptionalNumber(mapped.internalBonus),
    internalBonusMax: parseOptionalNumber(mapped.internalBonusMax),
    internalTotal: parseOptionalNumber(mapped.internalTotal),
    internalMax: parseOptionalNumber(mapped.internalMax),
    classAvgInternal: parseOptionalNumber(mapped.classAvgInternal),
    classAvgCae1: parseOptionalNumber(mapped.classAvgCae1),
    classAvgCae2: parseOptionalNumber(mapped.classAvgCae2),
    remarks: typeof mapped.remarks === 'string' ? mapped.remarks : undefined,
  };
}

/**
 * Parses CSV, TSV (Excel/Google Sheets copy-paste), or JSON CAE marks text into validated SubjectCaeMark rows.
 */
export function parseCaeMarksText(rawInput: string): ParsedCaeUploadResult {
  const cleaned = rawInput.replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    return { marks: [], errors: ['Paste or upload CAE marks data first.'], format: 'csv' };
  }
  if (cleaned.length > MAX_CAE_UPLOAD_BYTES) {
    return {
      marks: [],
      errors: [`File or pasted text exceeds the ${Math.round(MAX_CAE_UPLOAD_BYTES / 1024)} KB size limit.`],
      format: 'csv',
    };
  }

  // 1. JSON format (array or { caeMarks: [...] })
  if (cleaned.startsWith('[') || cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : typeof parsed === 'object' &&
            parsed !== null &&
            Array.isArray((parsed as { caeMarks?: unknown[] }).caeMarks)
          ? (parsed as { caeMarks: unknown[] }).caeMarks
          : null;
      if (!list) {
        return {
          marks: [],
          errors: ['JSON must be an array of subject records or an object containing a "caeMarks" array.'],
          format: 'json',
        };
      }
      if (list.length === 0) {
        return { marks: [], errors: ['JSON array is empty.'], format: 'json' };
      }
      if (list.length > MAX_CAE_UPLOAD_ROWS) {
        return {
          marks: [],
          errors: [`Too many subjects (${list.length}). Maximum allowed per upload is ${MAX_CAE_UPLOAD_ROWS}.`],
          format: 'json',
        };
      }
      const marks: SubjectCaeMark[] = [];
      const errors: string[] = [];
      list.forEach((item, idx) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          errors.push(`Row ${idx + 1}: Expected a JSON object.`);
          return;
        }
        const built = buildNormalizedCaeMark(parseObjectRecord(item as Record<string, unknown>));
        if (built.mark) marks.push(built.mark);
        else if (built.error) errors.push(`Row ${idx + 1}: ${built.error}`);
      });
      return { marks, errors, format: 'json' };
    } catch {
      return {
        marks: [],
        errors: ['Invalid JSON syntax. Check brackets, quotes, and commas.'],
        format: 'json',
      };
    }
  }

  // 2. CSV or TSV (tab-separated copy-paste from Excel / Sheets / ERP)
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { marks: [], errors: ['No rows found in uploaded data.'], format: 'csv' };
  }

  const firstLineTabs = (lines[0].match(/\t/g) ?? []).length;
  const firstLineCommas = (lines[0].match(/,/g) ?? []).length;
  const delimiter: ',' | '\t' = firstLineTabs >= firstLineCommas && firstLineTabs > 0 ? '\t' : ',';
  const format: 'csv' | 'tsv' = delimiter === '\t' ? 'tsv' : 'csv';

  const firstCells = parseDelimitedLine(lines[0], delimiter);
  const headerMap = firstCells.map((cell) => matchHeaderField(cell));
  const hasHeaderRow = headerMap.filter(Boolean).length >= 2;

  const dataLines = hasHeaderRow ? lines.slice(1) : lines;
  if (dataLines.length === 0) {
    return {
      marks: [],
      errors: ['Header row detected, but no subject rows were found underneath.'],
      format,
    };
  }
  if (dataLines.length > MAX_CAE_UPLOAD_ROWS) {
    return {
      marks: [],
      errors: [`Too many rows (${dataLines.length}). Maximum allowed per upload is ${MAX_CAE_UPLOAD_ROWS}.`],
      format,
    };
  }

  // Default column order if user pastes headerless rows:
  // CourseCode, CourseName, CAE1, CAE2, AssignLab, Credits, InternalTotal, ClassAvg
  const fallbackColumns: CanonicalField[] = [
    'courseCode',
    'courseName',
    'cae1',
    'cae2',
    'internalBonus',
    'credits',
    'internalTotal',
    'classAvgInternal',
  ];

  const marks: SubjectCaeMark[] = [];
  const errors: string[] = [];

  dataLines.forEach((line, idx) => {
    const cells = parseDelimitedLine(line, delimiter);
    const rec: Record<string, unknown> = {};
    if (hasHeaderRow) {
      headerMap.forEach((field, colIdx) => {
        if (field && colIdx < cells.length) {
          rec[field] = cells[colIdx];
        }
      });
    } else {
      fallbackColumns.forEach((field, colIdx) => {
        if (colIdx < cells.length) {
          rec[field] = cells[colIdx];
        }
      });
    }
    const built = buildNormalizedCaeMark(parseObjectRecord(rec));
    if (built.mark) {
      marks.push(built.mark);
    } else if (built.error) {
      errors.push(`Row ${idx + (hasHeaderRow ? 2 : 1)}: ${built.error}`);
    }
  });

  // Deduplicate by uppercase courseCode (last row wins)
  const deduped = new Map<string, SubjectCaeMark>();
  for (const m of marks) {
    deduped.set(m.courseCode.toUpperCase(), m);
  }

  return { marks: [...deduped.values()], errors, format };
}

/**
 * Merges or replaces current-term CAE marks, keeping unique course codes.
 */
export function mergeCaeMarks(
  existing: SubjectCaeMark[],
  incoming: SubjectCaeMark[],
  mode: 'replace' | 'merge'
): SubjectCaeMark[] {
  if (mode === 'replace') {
    return incoming.slice(0, MAX_CAE_UPLOAD_ROWS);
  }
  const map = new Map<string, SubjectCaeMark>();
  for (const item of existing) {
    map.set(item.courseCode.toUpperCase(), item);
  }
  for (const item of incoming) {
    const key = item.courseCode.toUpperCase();
    const prev = map.get(key);
    map.set(key, {
      ...prev,
      ...item,
      // Preserve existing class averages if the newly uploaded row omitted them
      classAvgCae1: item.classAvgCae1 ?? prev?.classAvgCae1,
      classAvgCae2: item.classAvgCae2 ?? prev?.classAvgCae2,
      classAvgBonus: item.classAvgBonus ?? prev?.classAvgBonus,
      classAvgInternal: item.classAvgInternal ?? prev?.classAvgInternal,
      classTopInternal: item.classTopInternal ?? prev?.classTopInternal,
    });
  }
  return [...map.values()].slice(0, MAX_CAE_UPLOAD_ROWS);
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Neutralize spreadsheet formula prefixes (=, +, -, @) on exported CSV strings
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a downloadable CSV template pre-populated with current subjects (or sample rows).
 */
export function buildCaeCsvTemplate(existing: SubjectCaeMark[] = []): string {
  const header = [
    'CourseCode',
    'CourseName',
    'Credits',
    'CAE1',
    'CAE2',
    'AssignLab',
    'InternalTotal',
    'ClassAvg',
    'Remarks',
  ].join(',');

  const seed: SubjectCaeMark[] =
    existing.length > 0
      ? existing
      : [
          {
            courseCode: 'SCSA1601',
            courseName: 'Computer Networks',
            credits: 4,
            cae1: 42,
            cae1Max: 50,
            cae2: 45,
            cae2Max: 50,
            internalBonus: 9,
            internalBonusMax: 10,
            internalTotal: 43.8,
            internalMax: 50,
            standing: 'strong',
            classAvgInternal: 37.5,
          },
          {
            courseCode: 'SCSA1602',
            courseName: 'Operating Systems',
            credits: 4,
            cae1: 36,
            cae1Max: 50,
            cae2: 40,
            cae2Max: 50,
            internalBonus: 8,
            internalBonusMax: 10,
            internalTotal: 38.4,
            internalMax: 50,
            standing: 'on-track',
            classAvgInternal: 36.0,
          },
        ];

  const rows = seed.map((m) =>
    [
      escapeCsvCell(m.courseCode),
      escapeCsvCell(m.courseName),
      escapeCsvCell(m.credits),
      escapeCsvCell(m.cae1),
      escapeCsvCell(m.cae2),
      escapeCsvCell(m.internalBonus),
      escapeCsvCell(m.internalTotal),
      escapeCsvCell(m.classAvgInternal ?? ''),
      escapeCsvCell(m.remarks ?? ''),
    ].join(',')
  );

  return [header, ...rows].join('\n');
}
