import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Lock,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
} from 'lucide-react';
import {
  SISTMATE_DISCLAIMER,
  SISTMATE_PROMISE,
  SISTMATE_SLIDES,
  type SistmateSlide,
} from '../core/sistmateContent';
import { AppFooter } from './AppFooter';

interface SistmatePresentationViewProps {
  standalone?: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onBack?: () => void;
  onSignIn: () => void;
}

function renderSlideVisual(slide: SistmateSlide, onSignIn: () => void) {
  switch (slide.visualType) {
    case 'problem':
      return (
        <div className="rounded-2xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
          <p className="text-xs font-medium text-[#4A635D] dark:text-slate-400">
            Four separate checks every weekday
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'ERP Attendance', detail: 'Subject totals & daily hour-wise marks' },
              { label: 'Weekly Timetable', detail: 'Current class, next room & lab hours' },
              { label: 'Results & CGPA', detail: 'Semester GPA & target grade math' },
              { label: 'Moodle LMS', detail: 'Units, PDF slides & assignment due dates' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-[#E3EAE5] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-950/60 p-3.5"
              >
                <p className="text-xs font-semibold text-[#0F2421] dark:text-slate-100">{item.label}</p>
                <p className="mt-1 text-xs text-[#4A635D] dark:text-slate-400 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-[#E3EAE5] dark:border-slate-800 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#134E44] dark:text-emerald-400">
              SIST-attendance · One read-only student view
            </span>
            <span className="text-xs text-[#4A635D] dark:text-slate-400">ERP + LMS unified</span>
          </div>
        </div>
      );

    case 'attendance':
      return (
        <div className="mx-auto w-full max-w-[320px] rounded-[28px] border border-[#CFDCD4] dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#4A635D] dark:text-slate-400">
            <span>9:41</span>
            <span>Attendance · 80% line</span>
          </div>
          <div className="rounded-xl bg-[#F3F6F4] dark:bg-slate-950 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#0F2421] dark:text-slate-100">Today · Daily</span>
              <span className="font-semibold text-[#134E44] dark:text-emerald-400">Present</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#4A635D] dark:text-slate-400">Hour-wise</span>
              <span className="font-mono tabular-nums font-medium text-[#0F2421] dark:text-slate-200 tracking-wider">
                P · P · A · -
              </span>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { name: 'Data Structures', pct: 92, verdict: 'Can skip 4', safe: true },
              { name: 'Computer Networks', pct: 79, verdict: 'Attend 1 more', safe: false },
              { name: 'Discrete Mathematics', pct: 71, verdict: 'Attend 3 more', safe: false },
            ].map((subj) => (
              <div key={subj.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#0F2421] dark:text-slate-100 truncate">{subj.name}</span>
                  <span className="font-mono tabular-nums font-semibold text-[#0F2421] dark:text-slate-100">
                    {subj.pct}%
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-[#E6EDE8] dark:bg-slate-800 overflow-visible">
                  <div
                    className={`h-full rounded-full ${
                      subj.safe ? 'bg-[#134E44] dark:bg-emerald-500' : 'bg-[#B45309] dark:bg-amber-500'
                    }`}
                    style={{ width: `${subj.pct}%` }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 bottom-0 w-0.5 bg-[#D99B26]"
                    style={{ left: '80%' }}
                  />
                </div>
                <p
                  className={`text-[11px] font-medium ${
                    subj.safe ? 'text-[#134E44] dark:text-emerald-400' : 'text-[#B45309] dark:text-amber-400'
                  }`}
                >
                  {subj.verdict}
                </p>
              </div>
            ))}
          </div>
          <p className="pt-2 border-t border-[#E6EDE8] dark:border-slate-800 text-[11px] text-[#4A635D] dark:text-slate-400">
            Sample data · Yours comes from ERP
          </p>
        </div>
      );

    case 'schedule':
      return (
        <div className="mx-auto w-full max-w-[320px] rounded-[28px] border border-[#CFDCD4] dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#4A635D] dark:text-slate-400">
            <span>Monday · Week</span>
            <span>Section Schedule</span>
          </div>
          <div className="rounded-xl bg-[#134E44] text-white p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-emerald-100 font-mono tabular-nums">
              <span>Now</span>
              <span>10:00 – 10:50</span>
            </div>
            <p className="text-sm font-semibold">Data Structures</p>
            <p className="text-xs text-emerald-100/90">Room 402 · 18 minutes left</p>
          </div>
          <div className="rounded-xl border border-[#DCE5DF] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-950/60 p-3.5 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium text-[#4A635D] dark:text-slate-400">Next</p>
              <p className="text-xs font-semibold text-[#0F2421] dark:text-slate-100 mt-0.5">
                Operating Systems
              </p>
              <p className="text-[11px] text-[#4A635D] dark:text-slate-400">Room 311</p>
            </div>
            <span className="font-mono tabular-nums text-xs font-semibold text-[#0F2421] dark:text-slate-100">
              11:00
            </span>
          </div>
          <p className="text-xs text-[#4A635D] dark:text-slate-400">
            Then Computer Networks at 1:30, lab until 4:10.
          </p>
          <div className="pt-2 border-t border-[#E6EDE8] dark:border-slate-800 flex items-center gap-1.5 text-xs font-medium text-[#134E44] dark:text-emerald-400">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>One-tap Add to Phone Calendar</span>
          </div>
        </div>
      );

    case 'cgpa':
      return (
        <div className="mx-auto w-full max-w-[320px] rounded-[28px] border border-[#CFDCD4] dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3.5">
          <div className="flex items-center justify-between text-[11px] text-[#4A635D] dark:text-slate-400">
            <span>Results &amp; Planner</span>
            <span className="font-medium text-[#B45309] dark:text-amber-400">Sample data</span>
          </div>
          <div className="rounded-xl bg-[#F3F6F4] dark:bg-slate-950 p-3.5">
            <p className="text-[11px] text-[#4A635D] dark:text-slate-400">
              CGPA after 4 semesters (sample data)
            </p>
            <p className="mt-1 font-display text-3xl font-bold font-mono tabular-nums text-[#0F2421] dark:text-slate-50">
              8.42
            </p>
            <p className="mt-0.5 text-[11px] text-[#4A635D] dark:text-slate-400">
              Official Sathyabama grade scale · Credit-weighted
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center font-mono tabular-nums">
            {[
              { sem: 'S1', gpa: '8.29' },
              { sem: 'S2', gpa: '8.48' },
              { sem: 'S3', gpa: '8.30' },
              { sem: 'S4', gpa: '8.61' },
            ].map((s) => (
              <div
                key={s.sem}
                className="rounded-lg border border-[#E3EAE5] dark:border-slate-800 py-2 px-1"
              >
                <p className="text-[10px] text-[#4A635D] dark:text-slate-400">{s.sem}</p>
                <p className="text-xs font-semibold text-[#0F2421] dark:text-slate-100 mt-0.5">{s.gpa}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[#DCE5DF] dark:border-slate-800 p-3 text-xs space-y-1">
            <p className="font-semibold text-[#0F2421] dark:text-slate-100">Target-grade planner</p>
            <p className="text-[#4A635D] dark:text-slate-400 leading-relaxed">
              To reach <span className="font-mono font-semibold text-[#0F2421] dark:text-slate-100">8.5</span>, average{' '}
              <span className="font-mono font-semibold text-[#134E44] dark:text-emerald-400">8.66</span> over the next two semesters.
            </p>
          </div>
        </div>
      );

    case 'lms':
      return (
        <div className="mx-auto w-full max-w-[320px] rounded-[28px] border border-[#CFDCD4] dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-[#4A635D] dark:text-slate-400">
            <span>LMS Courses</span>
            <span>Sample data</span>
          </div>
          <p className="text-sm font-semibold text-[#0F2421] dark:text-slate-100">Computer Networks</p>
          <div className="rounded-xl border border-[#E3EAE5] dark:border-slate-800 px-3 py-2 text-xs text-[#4A635D] dark:text-slate-400">
            Unit 2: Network layer
          </div>
          <div className="rounded-xl border border-[#134E44]/30 dark:border-emerald-800 bg-[#F7FAF8] dark:bg-slate-950/60 p-3 space-y-2.5">
            <p className="text-xs font-semibold text-[#0F2421] dark:text-slate-100">
              Unit 3: Transport layer
            </p>
            {[
              { file: 'Unit 3 notes.pdf', size: '2.1 MB' },
              { file: 'Congestion control slides.pdf', size: '4.8 MB' },
            ].map((f) => (
              <div
                key={f.file}
                className="flex items-center justify-between gap-2 text-xs text-[#0F2421] dark:text-slate-200"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 text-[#134E44] dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">{f.file}</span>
                </span>
                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] text-[#4A635D] dark:text-slate-400 shrink-0">
                  {f.size}
                  <Download className="h-3 w-3" aria-hidden="true" />
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[#E6EDE8] dark:border-slate-800 text-xs">
            <span className="font-medium text-[#0F2421] dark:text-slate-100">Assignment 2</span>
            <span className="font-medium text-[#B45309] dark:text-amber-400">Due Friday</span>
          </div>
        </div>
      );

    case 'setup-diagram':
      return (
        <div className="rounded-2xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
          <p className="text-xs font-medium text-[#4A635D] dark:text-slate-400">
            Three-step setup flow
          </p>
          <ol className="space-y-3">
            {[
              {
                num: '1',
                title: 'Sign in with ERP credentials',
                tag: 'Required',
                desc: 'Use your existing register number and password.',
              },
              {
                num: '2',
                title: 'Add to Home Screen',
                tag: 'Optional',
                desc: 'Android Chrome: Install app · iPhone Safari: Share → Add to Home Screen.',
              },
              {
                num: '3',
                title: 'Connect your LMS',
                tag: 'Optional',
                desc: 'One sign-in on the dashboard card to bring in units, files & deadlines.',
              },
            ].map((step, index) => (
              <li key={step.num} className="relative flex items-start gap-3.5">
                <div className="flex flex-col items-center shrink-0">
                  <span className="h-8 w-8 rounded-full bg-[#134E44] text-white font-mono text-xs font-semibold flex items-center justify-center">
                    {step.num}
                  </span>
                  {index < 2 ? (
                    <span aria-hidden="true" className="w-px h-6 bg-[#CFDCD4] dark:bg-slate-700 mt-1" />
                  ) : null}
                </div>
                <div className="pt-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[#0F2421] dark:text-slate-100">{step.title}</span>
                    <span className="text-[#4A635D] dark:text-slate-400">· {step.tag}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#4A635D] dark:text-slate-400 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      );

    case 'privacy':
      return (
        <div className="rounded-2xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#134E44] dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>How SIST-attendance handles your data</span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-[#E3EAE5] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-950/60 p-3.5 space-y-1">
              <p className="font-semibold text-[#0F2421] dark:text-slate-100">Default sign-in</p>
              <p className="text-[#4A635D] dark:text-slate-400 leading-relaxed">
                Password starts an 8-hour encrypted session cookie and is discarded immediately.
              </p>
            </div>
            <div className="rounded-xl border border-[#E3EAE5] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-950/60 p-3.5 space-y-1">
              <p className="font-semibold text-[#0F2421] dark:text-slate-100">“Keep me signed in” (opt-in)</p>
              <p className="text-[#4A635D] dark:text-slate-400 leading-relaxed">
                Stored encrypted in a cookie on your own device only—never on our server—and removed when you sign out.
              </p>
            </div>
            <div className="rounded-xl border border-[#E3EAE5] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-950/60 p-3.5 space-y-1">
              <p className="font-semibold text-[#0F2421] dark:text-slate-100">Marks &amp; attendance</p>
              <p className="text-[#4A635D] dark:text-slate-400 leading-relaxed">
                Fetched on demand from ERP, cached only briefly, and strictly read-only.
              </p>
            </div>
          </div>
        </div>
      );

    case 'cta':
      return (
        <div className="rounded-2xl border border-[#134E44]/25 dark:border-emerald-900 bg-[#134E44] text-white p-6 sm:p-7 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium text-emerald-100">SIST-attendance · Student Companion</p>
            <h3 className="font-display text-2xl font-bold tracking-tight leading-snug">
              See your own numbers against the line.
            </h3>
            <p className="text-sm text-emerald-100/90 leading-relaxed">
              Use the ERP account you already have. Read-only access across attendance, timetable, CGPA, and LMS notes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-2 rounded-lg bg-white text-[#0F2421] hover:bg-emerald-50 px-5 py-2.5 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Sign in</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-100/80">
              <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Works on Android, iPhone Safari &amp; Desktop
            </span>
          </div>
          <p className="pt-3 border-t border-white/15 text-xs text-emerald-100/80">
            {SISTMATE_DISCLAIMER}
          </p>
        </div>
      );
  }
}

export function SistmatePresentationView({
  standalone = false,
  theme = 'light',
  onToggleTheme,
  onBack,
  onSignIn,
}: SistmatePresentationViewProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [copiedOutline, setCopiedOutline] = useState(false);

  const slide = SISTMATE_SLIDES[slideIndex];
  const totalSlides = SISTMATE_SLIDES.length;

  const goPrev = useCallback(() => {
    setSlideIndex((idx) => (idx > 0 ? idx - 1 : idx));
  }, []);

  const goNext = useCallback(() => {
    setSlideIndex((idx) => (idx < totalSlides - 1 ? idx + 1 : idx));
  }, [totalSlides]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  async function handleCopyOutline() {
    const outline = [
      `SIST-attendance — 8-Slide Student Introduction (${SISTMATE_PROMISE})`,
      '',
      ...SISTMATE_SLIDES.map(
        (s) =>
          `Slide ${s.id}: ${s.headline}\n${s.summary}\n${s.bullets.map((b) => `- ${b}`).join('\n')}${
            s.sampleNote ? `\nNote: ${s.sampleNote}` : ''
          }`
      ),
      '',
      SISTMATE_DISCLAIMER,
    ].join('\n\n');

    try {
      await navigator.clipboard?.writeText(outline);
      setCopiedOutline(true);
      window.setTimeout(() => setCopiedOutline(false), 2500);
    } catch {
      // Clipboard unavailable
    }
  }

  const deckBody = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">
            8-Slide Product Introduction · {SISTMATE_PROMISE}
          </p>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50 mt-0.5">
            Introducing SIST-attendance to Sathyabama Students
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopyOutline()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDCD4] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-[#0F2421] dark:text-slate-200 hover:bg-[#F3F6F4] dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            {copiedOutline ? <Check className="h-3.5 w-3.5 text-[#134E44]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copiedOutline ? 'Copied 8-Slide Outline' : 'Copy Slide Outline'}
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#134E44] hover:bg-[#0E3C34] dark:bg-emerald-600 dark:hover:bg-emerald-500 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>Sign in</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Slide Canvas */}
      <section
        aria-label={`Slide ${slide.id} of ${totalSlides}: ${slide.headline}`}
        className="rounded-2xl border border-[#D4DFD8] dark:border-slate-800 bg-[#F3F6F4] dark:bg-slate-900/80 p-6 sm:p-8 lg:p-10 space-y-6"
      >
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#DCE5DF] dark:border-slate-800 text-xs text-[#4A635D] dark:text-slate-400">
          <span className="font-medium text-[#134E44] dark:text-emerald-400">{slide.kicker}</span>
          <span className="font-mono tabular-nums">
            Slide {slide.id} / {totalSlides}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50 leading-tight [text-wrap:balance]">
              {slide.headline}
            </h3>
            <p className="text-sm sm:text-base text-[#354E48] dark:text-slate-300 leading-relaxed max-w-2xl">
              {slide.summary}
            </p>
            <ul className="space-y-2.5 pt-1 text-sm text-[#0F2421] dark:text-slate-200">
              {slide.bullets.map((item) => (
                <li key={item} className="flex items-start gap-2.5 leading-relaxed">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 rounded-full bg-[#134E44] dark:bg-emerald-400 shrink-0"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {slide.sampleNote ? (
              <p className="text-xs text-[#4A635D] dark:text-slate-400 pt-1">
                {slide.sampleNote}
              </p>
            ) : null}
          </div>

          <div className="lg:col-span-5">
            {renderSlideVisual(slide, onSignIn)}
          </div>
        </div>

        {/* Slide Controls & Disclaimer Footer */}
        <div className="pt-5 border-t border-[#DCE5DF] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-xs text-[#4A635D] dark:text-slate-400 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{SISTMATE_DISCLAIMER}</span>
          </p>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={goPrev}
              disabled={slideIndex === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[#CFDCD4] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-[#0F2421] dark:text-slate-200 hover:bg-[#EDF2EE] dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={slideIndex === totalSlides - 1}
              className="inline-flex items-center gap-1 rounded-lg bg-[#134E44] hover:bg-[#0E3C34] dark:bg-emerald-600 dark:hover:bg-emerald-500 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* Slide Navigator Strip */}
      <nav aria-label="Presentation slides" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {SISTMATE_SLIDES.map((item, idx) => {
          const active = idx === slideIndex;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => setSlideIndex(idx)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                active
                  ? 'border-[#134E44] bg-[#134E44] text-white dark:border-emerald-500 dark:bg-emerald-700'
                  : 'border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 text-[#0F2421] dark:text-slate-200 hover:border-[#134E44]/50 dark:hover:border-emerald-700'
              }`}
            >
              <span
                className={`block font-mono text-[11px] tabular-nums ${
                  active ? 'text-emerald-100' : 'text-[#4A635D] dark:text-slate-400'
                }`}
              >
                0{item.id}
              </span>
              <span className="mt-0.5 block text-xs font-medium truncate">
                {item.kicker.split('·')[1]?.trim() ?? item.kicker}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  if (!standalone) {
    return deckBody;
  }

  return (
    <div className="min-h-screen bg-[#F3F6F4] dark:bg-slate-950 text-[#0F2421] dark:text-slate-100 flex flex-col">
      <header className="sticky top-0 z-30 h-16 border-b border-[#DCE5DF] dark:border-slate-800 bg-[#F3F6F4]/95 dark:bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 font-display text-base font-bold tracking-tight text-[#0F2421] dark:text-slate-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>SIST-attendance</span>
          </button>

          <nav aria-label="Deck actions" className="hidden sm:flex items-center gap-6 text-sm font-medium text-[#354E48] dark:text-slate-300">
            <button type="button" onClick={onBack} className="hover:text-[#0F2421] dark:hover:text-white cursor-pointer whitespace-nowrap shrink-0">
              Welcome
            </button>
            {onToggleTheme ? (
              <button
                type="button"
                onClick={onToggleTheme}
                className="inline-flex items-center gap-1.5 hover:text-[#0F2421] dark:hover:text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            ) : null}
          </nav>

          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center rounded-lg bg-[#134E44] hover:bg-[#0E3C34] dark:bg-emerald-600 dark:hover:bg-emerald-500 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Sign in
          </button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        {deckBody}
      </main>
      <AppFooter />
    </div>
  );
}
