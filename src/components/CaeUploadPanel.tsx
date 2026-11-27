import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudDownload,
  CloudUpload,
  Download,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  MAX_CAE_UPLOAD_BYTES,
  buildCaeCsvTemplate,
  buildNormalizedCaeMark,
  parseCaeMarksText,
} from '../core/caeUpload';
import type { ErpUserRole, SessionUser, SubjectCaeMark } from '../core/types';
import type { CaeUploadResponse, ErpDirectCaeAuthInput } from '../lib/api';
import { PasswordInput } from './PasswordInput';

interface CaeUploadPanelProps {
  user: SessionUser;
  currentSemester?: number;
  existingMarks: SubjectCaeMark[];
  hasUploadedData: boolean;
  onUpload: (
    marks: SubjectCaeMark[],
    mode: 'replace' | 'merge',
    options?: { syncToErp?: boolean; erpAuth?: ErpDirectCaeAuthInput }
  ) => Promise<CaeUploadResponse>;
  onPullFromErp: (
    mode: 'replace' | 'merge',
    erpAuth?: ErpDirectCaeAuthInput
  ) => Promise<CaeUploadResponse>;
  onReset: () => Promise<void>;
  onClose: () => void;
}

type UploadTab = 'erp-direct' | 'file' | 'paste' | 'manual';
type UploadMode = 'merge' | 'replace';

interface ManualDraftRow {
  id: string;
  courseCode: string;
  courseName: string;
  credits: string;
  cae1: string;
  cae2: string;
  internalBonus: string;
  classAvgInternal: string;
}

const ERP_ROLE_OPTIONS: ReadonlyArray<{ id: ErpUserRole; label: string }> = [
  { id: 'student', label: 'Student' },
  { id: 'staff', label: 'Staff' },
  { id: 'new-admission', label: 'New Admission' },
  { id: 'parent', label: 'Parent' },
];

function makeDraftRow(seed?: SubjectCaeMark, idx = 0): ManualDraftRow {
  return {
    id: `row-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    courseCode: seed?.courseCode ?? '',
    courseName: seed?.courseName ?? '',
    credits: seed ? String(seed.credits) : '3',
    cae1: seed?.cae1 !== null && seed?.cae1 !== undefined ? String(seed.cae1) : '',
    cae2: seed?.cae2 !== null && seed?.cae2 !== undefined ? String(seed.cae2) : '',
    internalBonus:
      seed?.internalBonus !== null && seed?.internalBonus !== undefined ? String(seed.internalBonus) : '',
    classAvgInternal:
      seed?.classAvgInternal !== null && seed?.classAvgInternal !== undefined
        ? String(seed.classAvgInternal)
        : '',
  };
}

function parseDraftNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function getStandingLabel(standing: SubjectCaeMark['standing']): { label: string; cls: string } {
  switch (standing) {
    case 'strong':
      return { label: 'Strong', cls: 'text-emerald-700 dark:text-emerald-400' };
    case 'on-track':
      return { label: 'On track', cls: 'text-blue-700 dark:text-blue-400' };
    case 'needs-improvement':
      return { label: 'Needs focus', cls: 'text-red-700 dark:text-red-400' };
    default:
      return { label: 'Pending', cls: 'text-slate-500 dark:text-slate-400' };
  }
}

export function CaeUploadPanel({
  user,
  currentSemester,
  existingMarks,
  hasUploadedData,
  onUpload,
  onPullFromErp,
  onReset,
  onClose,
}: CaeUploadPanelProps) {
  const isLiveErpConnected = user.mode === 'live' && user.erpTokenPresent;

  const [tab, setTab] = useState<UploadTab>('erp-direct');
  const [uploadMode, setUploadMode] = useState<UploadMode>('merge');
  const [syncToErp, setSyncToErp] = useState<boolean>(isLiveErpConnected);

  // Direct ERP portal auth fields (passwords are never stored; discarded after verification)
  const [erpRole, setErpRole] = useState<ErpUserRole>(user.erpRole ?? 'student');
  const [erpRegNo, setErpRegNo] = useState<string>(user.registerNumber);
  const [erpPassword, setErpPassword] = useState<string>('');
  const [erpToken, setErpToken] = useState<string>('');
  const [showTokenFallback, setShowTokenFallback] = useState<boolean>(false);
  const [showReauthForm, setShowReauthForm] = useState<boolean>(!isLiveErpConnected);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [manualRows, setManualRows] = useState<ManualDraftRow[]>(() =>
    existingMarks.length > 0
      ? existingMarks.slice(0, 12).map((m, idx) => makeDraftRow(m, idx))
      : [makeDraftRow(undefined, 0)]
  );
  const [saving, setSaving] = useState(false);
  const [pullingErp, setPullingErp] = useState(false);
  const [pushingErp, setPushingErp] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedTextResult = useMemo(() => {
    if (!rawText.trim()) return null;
    return parseCaeMarksText(rawText);
  }, [rawText]);

  const manualEvaluation = useMemo(() => {
    const marks: SubjectCaeMark[] = [];
    const errors: string[] = [];
    manualRows.forEach((row, idx) => {
      const hasAnyValue =
        row.courseCode.trim() ||
        row.courseName.trim() ||
        row.cae1.trim() ||
        row.cae2.trim() ||
        row.internalBonus.trim();
      if (!hasAnyValue) return;
      const built = buildNormalizedCaeMark({
        courseCode: row.courseCode,
        courseName: row.courseName,
        credits: parseDraftNumber(row.credits) ?? 3,
        cae1: parseDraftNumber(row.cae1),
        cae2: parseDraftNumber(row.cae2),
        internalBonus: parseDraftNumber(row.internalBonus),
        classAvgInternal: parseDraftNumber(row.classAvgInternal),
      });
      if (built.mark) marks.push(built.mark);
      else if (built.error) errors.push(`Row ${idx + 1}: ${built.error}`);
    });
    return { marks, errors };
  }, [manualRows]);

  const activeMarks =
    tab === 'manual'
      ? manualEvaluation.marks
      : tab === 'erp-direct'
        ? existingMarks
        : (parsedTextResult?.marks ?? []);
  const activeErrors =
    tab === 'manual'
      ? manualEvaluation.errors
      : tab === 'erp-direct'
        ? []
        : (parsedTextResult?.errors ?? []);

  function buildOptionalErpAuth(): ErpDirectCaeAuthInput | undefined {
    const trimmedToken = erpToken.trim();
    const trimmedReg = erpRegNo.trim();
    const hasInlineCreds = Boolean(trimmedToken || erpPassword);
    if (!hasInlineCreds) {
      return currentSemester ? { semester: currentSemester } : undefined;
    }
    return {
      erpRole,
      registerNumber: trimmedReg || user.registerNumber,
      erpUsername: trimmedReg || user.registerNumber,
      ...(trimmedToken ? { erpToken: trimmedToken } : { erpPassword }),
      ...(currentSemester ? { semester: currentSemester } : {}),
    };
  }

  async function readUploadedFile(file: File) {
    setFileError(null);
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitWarning(null);

    if (file.size > MAX_CAE_UPLOAD_BYTES) {
      setFileError(`File "${file.name}" exceeds the ${Math.round(MAX_CAE_UPLOAD_BYTES / 1024)} KB limit.`);
      return;
    }
    const lower = file.name.toLowerCase();
    if (!/\.(csv|tsv|txt|json)$/.test(lower)) {
      setFileError('Unsupported file type. Upload a .csv, .tsv, .txt, or .json file.');
      return;
    }
    try {
      const text = await file.text();
      setSelectedFileName(file.name);
      setRawText(text);
    } catch {
      setFileError('Unable to read the selected file.');
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void readUploadedFile(file);
    }
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void readUploadedFile(file);
    }
  }

  function handleDownloadTemplate() {
    const csv = buildCaeCsvTemplate(existingMarks);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cae-marks-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleLoadSampleIntoPaste() {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitWarning(null);
    setSelectedFileName(null);
    setRawText(buildCaeCsvTemplate(existingMarks));
  }

  function updateManualRow(id: string, field: keyof Omit<ManualDraftRow, 'id'>, value: string) {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitWarning(null);
    setManualRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function addManualRow() {
    if (manualRows.length >= 30) return;
    setManualRows((prev) => [...prev, makeDraftRow(undefined, prev.length)]);
  }

  function removeManualRow(id: string) {
    setManualRows((prev) => (prev.length <= 1 ? [makeDraftRow(undefined, 0)] : prev.filter((r) => r.id !== id)));
  }

  async function handlePullDirectFromErp() {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitWarning(null);

    const hasInlineAuth = Boolean(erpToken.trim() || erpPassword);
    if (!isLiveErpConnected && !hasInlineAuth) {
      setSubmitError(
        'Enter your Sathyabama ERP password or paste your ERP Access-Token to pull CAE marks directly from erp.sathyabama.ac.in.'
      );
      return;
    }

    setPullingErp(true);
    try {
      const response = await onPullFromErp(uploadMode, buildOptionalErpAuth());
      setErpPassword('');
      setShowReauthForm(false);
      setSubmitSuccess(
        response.erpSync?.message ??
          'Imported live Continuous Assessment (CAE) marks directly from erp.sathyabama.ac.in.'
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to pull CAE marks directly from College ERP.');
    } finally {
      setPullingErp(false);
    }
  }

  async function handlePushCurrentToErp() {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitWarning(null);

    if (existingMarks.length === 0) {
      setSubmitError('Load or enter at least one subject CAE mark before uploading to the ERP portal.');
      return;
    }

    const hasInlineAuth = Boolean(erpToken.trim() || erpPassword);
    if (!isLiveErpConnected && !hasInlineAuth) {
      setSubmitError(
        'Enter your Sathyabama ERP password or Access-Token above to submit marks directly to erp.sathyabama.ac.in.'
      );
      return;
    }

    setPushingErp(true);
    try {
      const response = await onUpload(existingMarks, uploadMode, {
        syncToErp: true,
        erpAuth: buildOptionalErpAuth(),
      });
      setErpPassword('');
      if (response.erpSync?.synced) {
        setShowReauthForm(false);
        setSubmitSuccess(response.erpSync.message);
      } else if (response.erpSync) {
        setSubmitWarning(response.erpSync.message);
      } else {
        setSubmitSuccess('CAE marks updated.');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to upload CAE marks directly to College ERP.');
    } finally {
      setPushingErp(false);
    }
  }

  async function handleSaveUpload() {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitWarning(null);

    if (activeMarks.length === 0) {
      setSubmitError(
        activeErrors[0] ?? 'Add or upload at least one valid subject CAE record before saving.'
      );
      return;
    }

    setSaving(true);
    try {
      const response = await onUpload(activeMarks, uploadMode, {
        syncToErp,
        erpAuth: syncToErp ? buildOptionalErpAuth() : undefined,
      });
      setErpPassword('');
      if (syncToErp && response.erpSync) {
        if (response.erpSync.synced) {
          setSubmitSuccess(response.erpSync.message);
        } else {
          setSubmitWarning(response.erpSync.message);
        }
      } else {
        setSubmitSuccess(
          `Uploaded ${activeMarks.length} subject ${activeMarks.length === 1 ? 'record' : 'records'} (${uploadMode === 'replace' ? 'replaced all' : 'merged'}) — charts and breakdown updated.`
        );
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save uploaded CAE marks.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetUploaded() {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitWarning(null);
    setResetting(true);
    try {
      await onReset();
      setSubmitSuccess('Restored original portal CAE marks data.');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to reset CAE marks.');
    } finally {
      setResetting(false);
    }
  }

  const busy = saving || pullingErp || pushingErp || resetting;

  return (
    <section
      aria-label="Upload Continuous Assessment (CAE) Marks"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      {/* Panel Header */}
      <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <span>Upload Continuous Assessment (CAE) Marks</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Sync directly through Sathyabama ERP (<span className="font-mono">erp.sathyabama.ac.in</span>), import a CSV/JSON file, paste a table, or enter marks manually.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            CSV Template
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close CAE upload panel"
            className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Mode & Input Tabs Bar */}
      <div className="px-5 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="CAE upload input method"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1"
        >
          {(
            [
              { id: 'erp-direct', label: 'ERP Portal Direct' },
              { id: 'file', label: 'Upload CSV / JSON' },
              { id: 'paste', label: 'Paste Table' },
              { id: 'manual', label: 'Manual Entry' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                setTab(item.id);
                setSubmitError(null);
                setSubmitWarning(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Apply as:</span>
          <div
            role="group"
            aria-label="Upload apply mode"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5"
          >
            <button
              type="button"
              aria-pressed={uploadMode === 'merge'}
              onClick={() => setUploadMode('merge')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                uploadMode === 'merge'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Merge subjects
            </button>
            <button
              type="button"
              aria-pressed={uploadMode === 'replace'}
              onClick={() => setUploadMode('replace')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                uploadMode === 'replace'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Replace all
            </button>
          </div>
        </div>
      </div>

      {/* Panel Body */}
      <div className="p-5 sm:p-6 space-y-5">
        {submitError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300 flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        ) : null}

        {submitWarning ? (
          <div
            role="status"
            className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{submitWarning}</span>
          </div>
        ) : null}

        {submitSuccess ? (
          <div
            role="status"
            className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{submitSuccess}</span>
          </div>
        ) : null}

        {/* TAB 0: ERP Portal Direct */}
        {tab === 'erp-direct' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sathyabama College ERP Direct Sync
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span>erp.sathyabama.ac.in</span>
                  <span aria-hidden="true"> · </span>
                  <span className={isLiveErpConnected ? 'text-emerald-700 dark:text-emerald-400 font-medium' : ''}>
                    {isLiveErpConnected
                      ? `Connected live as ${user.registerNumber}`
                      : 'Sign in below to pull or upload CAE marks directly'}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {isLiveErpConnected ? (
                  <button
                    type="button"
                    onClick={() => setShowReauthForm((prev) => !prev)}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {showReauthForm ? 'Use active ERP session' : 'Switch ERP account'}
                  </button>
                ) : null}
                <a
                  href="https://erp.sathyabama.ac.in/account/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  <span>Open ERP Portal</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>

            {showReauthForm ? (
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    ERP Account Type
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Direct ERP account type"
                    className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
                  >
                    {ERP_ROLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={erpRole === opt.id}
                        onClick={() => setErpRole(opt.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          erpRole === opt.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="caeDirectErpReg"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      {erpRole === 'staff'
                        ? 'Staff Number / Official Email'
                        : erpRole === 'new-admission'
                          ? 'Application Number'
                          : 'ERP Register Number'}
                    </label>
                    <input
                      id="caeDirectErpReg"
                      type="text"
                      value={erpRegNo}
                      onChange={(e) => setErpRegNo(e.target.value)}
                      placeholder={erpRole === 'staff' ? 'faculty@sathyabama.ac.in' : 'e.g. 42110482'}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="caeDirectErpPass"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      ERP Password <span className="font-normal text-slate-400">· Never stored</span>
                    </label>
                    <PasswordInput
                      id="caeDirectErpPass"
                      value={erpPassword}
                      onChange={(e) => setErpPassword(e.target.value)}
                      placeholder="Enter ERP portal password"
                      autoComplete="current-password"
                      toggleLabel="ERP password"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowTokenFallback((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {showTokenFallback
                        ? 'Hide ERP Access-Token field'
                        : 'Or paste ERP Access-Token manually (optional OTP fallback)'}
                    </span>
                  </button>

                  {showTokenFallback ? (
                    <div className="mt-2">
                      <label
                        htmlFor="caeDirectErpToken"
                        className="sr-only"
                      >
                        ERP Access-Token
                      </label>
                      <PasswordInput
                        id="caeDirectErpToken"
                        value={erpToken}
                        onChange={(e) => setErpToken(e.target.value)}
                        placeholder="Paste Access-Token from erp.sathyabama.ac.in (optional)"
                        toggleLabel="ERP Access-Token"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Pull Live CAE Marks from ERP
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Reads your published CAE 1, CAE 2 &amp; internal scores directly from Sathyabama ERP and loads them into the dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePullDirectFromErp()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pullingErp ? 'Pulling from ERP...' : 'Pull CAE Marks from ERP'}</span>
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Upload Active Marks Direct to ERP
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Submits your {existingMarks.length} active subject CAE{' '}
                    {existingMarks.length === 1 ? 'record' : 'records'} directly to{' '}
                    <span className="font-mono">erp.sathyabama.ac.in</span> (or upload a CSV/table via the other tabs with ERP sync enabled).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || existingMarks.length === 0}
                  onClick={() => void handlePushCurrentToErp()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {pushingErp
                      ? 'Uploading to ERP...'
                      : `Upload Direct to ERP (${existingMarks.length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB 1: File Dropzone */}
        {tab === 'file' ? (
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors ${
                dragActive
                  ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/25'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/40'
              }`}
            >
              <FileSpreadsheet
                className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                {selectedFileName
                  ? `Loaded ${selectedFileName}`
                  : 'Drag & drop your CAE marks CSV or JSON file here'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Supports <span className="font-mono">.csv</span>, <span className="font-mono">.tsv</span>, and{' '}
                <span className="font-mono">.json</span> up to 256 KB (max 30 subjects). Internal totals are auto-calculated if omitted.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.json,text/csv,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Choose CAE marks file"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Browse File
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download CSV Template
                </button>
              </div>
            </div>
            {fileError ? (
              <p className="text-xs text-red-700 dark:text-red-400">{fileError}</p>
            ) : null}
          </div>
        ) : null}

        {/* TAB 2: Paste CSV / TSV / JSON */}
        {tab === 'paste' ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="caePasteInput"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Paste rows from Excel, Google Sheets, ERP table, or CSV / JSON
              </label>
              <button
                type="button"
                onClick={handleLoadSampleIntoPaste}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Load current subjects as CSV
              </button>
            </div>
            <textarea
              id="caePasteInput"
              rows={6}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setSelectedFileName(null);
                setSubmitError(null);
                setSubmitSuccess(null);
                setSubmitWarning(null);
              }}
              placeholder={
                'CourseCode,CourseName,Credits,CAE1,CAE2,AssignLab,ClassAvg\nSCSA1601,Computer Networks,4,42,46,9,38.5\nSCSA1602,Operating Systems,4,37,41,8,36.2'
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Headers are matched automatically (e.g. CourseCode, CourseName, CAE1, CAE2, AssignLab, InternalTotal, ClassAvg). Leave InternalTotal blank to calculate out of 50 automatically.
            </p>
          </div>
        ) : null}

        {/* TAB 3: Structured Manual Entry */}
        {tab === 'manual' ? (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 pl-3 pr-2 font-medium min-w-[110px]">Code</th>
                    <th className="py-2.5 px-2 font-medium min-w-[180px]">Subject Name</th>
                    <th className="py-2.5 px-2 font-medium w-[68px]">Cr</th>
                    <th className="py-2.5 px-2 font-medium w-[84px]">CAE 1 /50</th>
                    <th className="py-2.5 px-2 font-medium w-[84px]">CAE 2 /50</th>
                    <th className="py-2.5 px-2 font-medium w-[88px]">Assign /10</th>
                    <th className="py-2.5 px-2 font-medium w-[92px]">Class Avg</th>
                    <th className="py-2.5 pl-2 pr-3 font-medium text-right w-[88px]">Internal</th>
                    <th className="py-2.5 pr-3 w-[36px]">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {manualRows.map((row) => {
                    const preview = buildNormalizedCaeMark({
                      courseCode: row.courseCode || 'TEMP',
                      courseName: row.courseName || 'Temp',
                      credits: parseDraftNumber(row.credits) ?? 3,
                      cae1: parseDraftNumber(row.cae1),
                      cae2: parseDraftNumber(row.cae2),
                      internalBonus: parseDraftNumber(row.internalBonus),
                      classAvgInternal: parseDraftNumber(row.classAvgInternal),
                    });

                    return (
                      <tr key={row.id} className="bg-white dark:bg-slate-900">
                        <td className="py-2 pl-3 pr-2">
                          <input
                            type="text"
                            value={row.courseCode}
                            onChange={(e) => updateManualRow(row.id, 'courseCode', e.target.value)}
                            placeholder="SCSA1601"
                            aria-label="Course code"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={row.courseName}
                            onChange={(e) => updateManualRow(row.id, 'courseName', e.target.value)}
                            placeholder="Computer Networks"
                            aria-label="Subject name"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            max={12}
                            step={1}
                            value={row.credits}
                            onChange={(e) => updateManualRow(row.id, 'credits', e.target.value)}
                            aria-label="Credits"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            max={50}
                            step={0.5}
                            value={row.cae1}
                            onChange={(e) => updateManualRow(row.id, 'cae1', e.target.value)}
                            placeholder="0–50"
                            aria-label="CAE 1 marks out of 50"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            max={50}
                            step={0.5}
                            value={row.cae2}
                            onChange={(e) => updateManualRow(row.id, 'cae2', e.target.value)}
                            placeholder="0–50"
                            aria-label="CAE 2 marks out of 50"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.5}
                            value={row.internalBonus}
                            onChange={(e) => updateManualRow(row.id, 'internalBonus', e.target.value)}
                            placeholder="0–10"
                            aria-label="Assignment or lab marks out of 10"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            max={50}
                            step={0.5}
                            value={row.classAvgInternal}
                            onChange={(e) => updateManualRow(row.id, 'classAvgInternal', e.target.value)}
                            placeholder="Opt."
                            aria-label="Class average out of 50"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 pl-2 pr-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {preview.mark && preview.mark.standing !== 'pending'
                            ? `${preview.mark.internalTotal.toFixed(1)} / 50`
                            : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeManualRow(row.id)}
                            aria-label={`Remove row ${row.courseCode || 'subject'}`}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
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

            <button
              type="button"
              onClick={addManualRow}
              disabled={manualRows.length >= 30}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Subject Row
            </button>
          </div>
        ) : null}

        {/* Validation Warnings (if any) */}
        {activeErrors.length > 0 ? (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-300 space-y-1">
            <p className="font-medium">Some rows need attention ({activeErrors.length}):</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {activeErrors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Parsed Preview for File & Paste tabs */}
        {(tab === 'file' || tab === 'paste') && parsedTextResult && parsedTextResult.marks.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Preview ({parsedTextResult.marks.length}{' '}
                {parsedTextResult.marks.length === 1 ? 'subject' : 'subjects'} ready ·{' '}
                {parsedTextResult.format.toUpperCase()})
              </span>
              <button
                type="button"
                onClick={() => {
                  setRawText('');
                  setSelectedFileName(null);
                }}
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                    <th className="py-2 pl-3 pr-2 font-medium">Subject</th>
                    <th className="py-2 px-2 font-medium text-right">CAE 1</th>
                    <th className="py-2 px-2 font-medium text-right">CAE 2</th>
                    <th className="py-2 px-2 font-medium text-right">Assign/Lab</th>
                    <th className="py-2 px-2 font-medium text-right">Internal /50</th>
                    <th className="py-2 pl-2 pr-3 font-medium">Standing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {parsedTextResult.marks.map((item) => {
                    const st = getStandingLabel(item.standing);
                    return (
                      <tr key={item.courseCode}>
                        <td className="py-2 pl-3 pr-2">
                          <span className="font-mono text-slate-500 dark:text-slate-400 mr-2">
                            {item.courseCode}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {item.courseName}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {item.cae1 !== null ? `${item.cae1}/${item.cae1Max}` : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {item.cae2 !== null ? `${item.cae2}/${item.cae2Max}` : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {item.internalBonus !== null
                            ? `${item.internalBonus}/${item.internalBonusMax}`
                            : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                          {item.internalTotal.toFixed(1)}/{item.internalMax}
                        </td>
                        <td className={`py-2 pl-2 pr-3 font-semibold ${st.cls}`}>{st.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {tab !== 'erp-direct' ? (
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={syncToErp}
                  onChange={(e) => setSyncToErp(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 accent-blue-700 cursor-pointer"
                />
                <span>
                  Also upload directly to College ERP (<span className="font-mono">erp.sathyabama.ac.in</span>)
                </span>
              </label>
            ) : hasUploadedData ? (
              <button
                type="button"
                onClick={() => void handleResetUploaded()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {resetting ? 'Restoring...' : 'Reset to Portal Data'}
              </button>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Credentials are verified over HTTPS and never stored; only verified tokens stay encrypted.
              </span>
            )}

            {tab !== 'erp-direct' && hasUploadedData ? (
              <button
                type="button"
                onClick={() => void handleResetUploaded()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {resetting ? 'Restoring...' : 'Reset to Portal Data'}
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {tab === 'erp-direct' ? 'Close' : 'Cancel'}
            </button>
            {tab !== 'erp-direct' ? (
              <button
                type="button"
                onClick={() => void handleSaveUpload()}
                disabled={busy || activeMarks.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {saving
                  ? syncToErp
                    ? 'Uploading to ERP...'
                    : 'Saving CAE Marks...'
                  : syncToErp
                    ? `Upload Direct to ERP (${activeMarks.length})`
                    : `Upload & Apply (${activeMarks.length})`}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
