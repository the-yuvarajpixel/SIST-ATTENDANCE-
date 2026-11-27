import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Minus,
  Moon,
  Plus,
  Presentation,
  ShieldCheck,
  Smartphone,
  Sun,
} from 'lucide-react';
import {
  SISTMATE_AUDIENCE_OVERVIEWS,
  SISTMATE_DISCLAIMER,
  SISTMATE_FAQS,
  SISTMATE_UNDER_200_SUMMARY,
  computeSkipLineResult,
  countWords,
} from '../core/sistmateContent';
import { CREATOR_INSTAGRAM_URL } from './AppFooter';

import CAMPUS_STUDENT_IMG from '../assets/images/campus_student_phone_1795801780198.jpg';
import LIBRARY_STUDY_IMG from '../assets/images/library_study_notes_1795801778224.jpg';
import CAMPUS_WALKWAY_IMG from '../assets/images/campus_walkway_morning_1795801777616.jpg';

interface SistmateWelcomeViewProps {
  theme: 'light' | 'dark';
  standalone?: boolean;
  onToggleTheme: () => void;
  onSignIn: () => void;
  onOpenPresentation: () => void;
  onOpenGuide: () => void;
}

type PhonePreviewTab = 'home' | 'attendance' | 'results';
type BriefingTab = 'summary' | 'students' | 'administrators';

export function SistmateWelcomeView({
  theme,
  standalone = true,
  onToggleTheme,
  onSignIn,
  onOpenPresentation,
  onOpenGuide,
}: SistmateWelcomeViewProps) {
  const [phoneTab, setPhoneTab] = useState<PhonePreviewTab>('home');
  const [attendedHours, setAttendedHours] = useState(42);
  const [markedHours, setMarkedHours] = useState(48);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [briefingTab, setBriefingTab] = useState<BriefingTab>('summary');
  const [copiedBriefing, setCopiedBriefing] = useState(false);
  const [heroImgBroken, setHeroImgBroken] = useState(false);
  const [libraryImgBroken, setLibraryImgBroken] = useState(false);
  const [walkwayImgBroken, setWalkwayImgBroken] = useState(false);

  const skipCalc = useMemo(
    () => computeSkipLineResult(attendedHours, markedHours, 80),
    [attendedHours, markedHours]
  );

  const summaryWordCount = useMemo(() => countWords(SISTMATE_UNDER_200_SUMMARY), []);

  function updateAttended(next: number) {
    const safeMarked = Math.max(1, markedHours);
    const clamped = Math.max(0, Math.min(safeMarked, next));
    setAttendedHours(clamped);
  }

  function updateMarked(next: number) {
    const clamped = Math.max(1, Math.min(300, next));
    setMarkedHours(clamped);
    if (attendedHours > clamped) {
      setAttendedHours(clamped);
    }
  }

  async function handleCopyBriefing() {
    let text = SISTMATE_UNDER_200_SUMMARY;
    if (briefingTab === 'students' || briefingTab === 'administrators') {
      const ov = SISTMATE_AUDIENCE_OVERVIEWS[briefingTab];
      text = [
        `${ov.label} — ${ov.headline}`,
        '',
        ov.intro,
        '',
        ...ov.sections.map((s) => `${s.heading}\n${s.points.map((p) => `- ${p}`).join('\n')}`),
        '',
        ov.closing,
      ].join('\n');
    }
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedBriefing(true);
      window.setTimeout(() => setCopiedBriefing(false), 2500);
    } catch {
      // Clipboard unavailable
    }
  }

  const activeAudience =
    briefingTab === 'students'
      ? SISTMATE_AUDIENCE_OVERVIEWS.students
      : briefingTab === 'administrators'
        ? SISTMATE_AUDIENCE_OVERVIEWS.administrators
        : null;

  return (
    <div className="min-h-screen bg-[#F3F6F4] dark:bg-slate-950 text-[#0F2421] dark:text-slate-100 flex flex-col">
      {/* 1. Header — Strict 3-Zone Top Bar Contract */}
      {standalone ? (
        <header className="sticky top-0 z-30 h-16 border-b border-[#DCE5DF] dark:border-slate-800 bg-[#F3F6F4]/95 dark:bg-slate-950/95 backdrop-blur-md">
          <div className="mx-auto max-w-6xl h-full px-4 sm:px-6 flex items-center justify-between gap-8">
            <a
              href="#top"
              className="font-display text-lg font-bold tracking-tight text-[#0F2421] dark:text-slate-50 whitespace-nowrap shrink-0"
            >
              SIST-attendance
            </a>

            <nav
              aria-label="Primary navigation"
              className="hidden md:flex items-center gap-6 text-sm font-medium text-[#354E48] dark:text-slate-300"
            >
              <a
                href="#features"
                className="hover:text-[#0F2421] dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Features
              </a>
              <a
                href="#privacy"
                className="hover:text-[#0F2421] dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Privacy
              </a>
              <a
                href="#questions"
                className="hover:text-[#0F2421] dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Questions
              </a>
              <button
                type="button"
                onClick={onOpenPresentation}
                className="hover:text-[#0F2421] dark:hover:text-white hover:underline underline-offset-4 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Presentation
              </button>
              <a
                href="#overview"
                className="hover:text-[#0F2421] dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Overview
              </a>
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
      ) : null}

      <main id="top" className="flex-1">
        {/* 2. Hero Section */}
        <section className="border-b border-[#DCE5DF] dark:border-slate-800/80">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">
                Read-only student companion for Sathyabama
              </p>
              <h1 className="font-display text-[clamp(2.25rem,4.2vw,3.5rem)] font-bold tracking-tight text-[#0F2421] dark:text-slate-50 leading-[1.08] [text-wrap:balance]">
                Know where you stand before the next class
              </h1>
              <p className="text-base sm:text-lg text-[#354E48] dark:text-slate-300 leading-relaxed max-w-xl">
                SIST-attendance brings your Sathyabama attendance, weekly timetable, semester results, CGPA planner, and LMS course work into one calm, student-first view.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#134E44] hover:bg-[#0E3C34] dark:bg-emerald-600 dark:hover:bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Sign in</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <a
                  href="#getting-started"
                  className="inline-flex items-center rounded-lg border border-[#C6D4CC] dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-[#EDF2EE] dark:hover:bg-slate-800 px-5 py-3 text-sm font-medium text-[#0F2421] dark:text-slate-100 transition-colors whitespace-nowrap"
                >
                  Get started
                </a>
                <button
                  type="button"
                  onClick={onOpenPresentation}
                  className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-medium text-[#134E44] dark:text-emerald-400 hover:underline underline-offset-4 cursor-pointer whitespace-nowrap"
                >
                  <Presentation className="h-4 w-4" aria-hidden="true" />
                  <span>View 8-slide deck</span>
                </button>
              </div>

              <p className="text-xs text-[#4A635D] dark:text-slate-400">
                {SISTMATE_DISCLAIMER}
              </p>
            </div>

            {/* Hero Mobile Dashboard Visual + Editorial Student Photo */}
            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-12 gap-5 items-stretch">
              <div className="sm:col-span-7 rounded-[28px] border border-[#CFDCD4] dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col justify-between gap-4">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#4A635D] dark:text-slate-400">
                    <span>9:41</span>
                    <span>Monday, 12 October</span>
                  </div>

                  {/* Interactive Phone Preview Tabs */}
                  <div
                    role="tablist"
                    aria-label="Mobile dashboard preview"
                    className="grid grid-cols-3 gap-1 rounded-lg bg-[#F3F6F4] dark:bg-slate-800 p-1"
                  >
                    {(
                      [
                        { id: 'home', label: 'Home' },
                        { id: 'attendance', label: 'Attendance' },
                        { id: 'results', label: 'Results' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={phoneTab === t.id}
                        onClick={() => setPhoneTab(t.id)}
                        className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          phoneTab === t.id
                            ? 'bg-white dark:bg-slate-900 text-[#0F2421] dark:text-slate-50 shadow-xs'
                            : 'text-[#4A635D] dark:text-slate-400 hover:text-[#0F2421] dark:hover:text-slate-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {phoneTab === 'home' ? (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-[#134E44] text-white p-3.5 space-y-1">
                        <p className="text-[11px] text-emerald-100 font-mono tabular-nums">
                          Next class · 10:00 AM
                        </p>
                        <p className="text-sm font-semibold">Data Structures</p>
                        <p className="text-xs text-emerald-100/90">Room 402 · in 25 minutes</p>
                      </div>

                      <div className="space-y-2.5 pt-1">
                        <p className="text-[11px] font-medium text-[#4A635D] dark:text-slate-400">
                          Attendance against 80% line
                        </p>
                        {[
                          { name: 'Data Structures', pct: 92, note: 'Can skip 4', ok: true },
                          { name: 'Operating Systems', pct: 84, note: 'Can skip 2', ok: true },
                          { name: 'Computer Networks', pct: 79, note: 'Attend 1 more', ok: false },
                        ].map((s) => (
                          <div key={s.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-[#0F2421] dark:text-slate-100 truncate">
                                {s.name}
                              </span>
                              <span className="font-mono tabular-nums font-semibold text-[#0F2421] dark:text-slate-100">
                                {s.pct}%
                              </span>
                            </div>
                            <div className="relative h-1.5 rounded-full bg-[#E6EDE8] dark:bg-slate-800">
                              <div
                                className={`h-full rounded-full ${
                                  s.ok ? 'bg-[#134E44] dark:bg-emerald-500' : 'bg-[#B45309] dark:bg-amber-500'
                                }`}
                                style={{ width: `${s.pct}%` }}
                              />
                              <span
                                aria-hidden="true"
                                className="absolute -top-0.5 bottom-0 w-0.5 bg-[#D99B26]"
                                style={{ left: '80%' }}
                              />
                            </div>
                            <p
                              className={`text-[11px] ${
                                s.ok
                                  ? 'text-[#134E44] dark:text-emerald-400'
                                  : 'text-[#B45309] dark:text-amber-400 font-medium'
                              }`}
                            >
                              {s.note}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {phoneTab === 'attendance' ? (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-[#F3F6F4] dark:bg-slate-950 p-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#4A635D] dark:text-slate-400">Today · Daily</span>
                          <span className="font-semibold text-[#134E44] dark:text-emerald-400">Present</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#4A635D] dark:text-slate-400">Hour-wise</span>
                          <span className="font-mono tabular-nums font-semibold text-[#0F2421] dark:text-slate-100 tracking-wider">
                            P · P · A · -
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 text-xs">
                        {[
                          { name: 'Data Structures', pct: '92%', status: 'Can skip 4', low: false },
                          { name: 'Operating Systems', pct: '84%', status: 'Can skip 2', low: false },
                          { name: 'Computer Networks', pct: '79%', status: 'Attend 1 more', low: true },
                          { name: 'Discrete Mathematics', pct: '71%', status: 'Attend 3 more', low: true },
                        ].map((row) => (
                          <div
                            key={row.name}
                            className="flex items-center justify-between gap-2 py-1 border-b border-[#EDF2EE] dark:border-slate-800 last:border-0"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-[#0F2421] dark:text-slate-100 truncate">
                                {row.name}
                              </p>
                              <p
                                className={`text-[11px] ${
                                  row.low
                                    ? 'text-[#B45309] dark:text-amber-400 font-medium'
                                    : 'text-[#134E44] dark:text-emerald-400'
                                }`}
                              >
                                {row.status}
                              </p>
                            </div>
                            <span className="font-mono tabular-nums font-semibold text-[#0F2421] dark:text-slate-100">
                              {row.pct}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {phoneTab === 'results' ? (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-[#F3F6F4] dark:bg-slate-950 p-3.5">
                        <p className="text-[11px] text-[#4A635D] dark:text-slate-400">
                          CGPA after 4 semesters · Sample data
                        </p>
                        <p className="mt-1 font-display text-3xl font-bold font-mono tabular-nums text-[#0F2421] dark:text-slate-50">
                          8.42
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#4A635D] dark:text-slate-400">
                          Official Sathyabama grade scale
                        </p>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {[
                          { sem: 'Semester 4', gpa: 'GPA 8.61' },
                          { sem: 'Semester 3', gpa: 'GPA 8.30' },
                          { sem: 'Semester 2', gpa: 'GPA 8.48' },
                          { sem: 'Semester 1', gpa: 'GPA 8.29' },
                        ].map((r) => (
                          <div key={r.sem} className="flex items-center justify-between py-1">
                            <span className="text-[#354E48] dark:text-slate-300">{r.sem}</span>
                            <span className="font-mono tabular-nums font-semibold text-[#0F2421] dark:text-slate-100">
                              {r.gpa}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <p className="pt-2.5 border-t border-[#E6EDE8] dark:border-slate-800 text-[11px] text-[#4A635D] dark:text-slate-400">
                  Sample data. Yours comes from your own ERP and LMS accounts.
                </p>
              </div>

              <div className="sm:col-span-5 flex flex-col gap-4">
                <div className="relative flex-1 min-h-[240px] rounded-2xl overflow-hidden border border-[#CFDCD4] dark:border-slate-800 bg-[#DCE5DF] dark:bg-slate-900">
                  {!heroImgBroken ? (
                    <img
                      src={CAMPUS_STUDENT_IMG}
                      alt="Sathyabama student checking attendance and class schedule on a phone along a sunlit campus corridor"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgBroken(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-xs text-[#354E48] dark:text-slate-400">
                      <Smartphone className="h-8 w-8 mb-2 text-[#134E44] dark:text-emerald-400" aria-hidden="true" />
                      <span>Built for quick checks between classes</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-4">
                    <p className="text-xs font-medium text-white leading-snug">
                      Installs like an app and opens on the page you need most.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. The Problem Section */}
        <section className="py-14 sm:py-18 border-b border-[#DCE5DF] dark:border-slate-800/80 bg-white dark:bg-slate-900/50">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-8">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">The problem</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50 [text-wrap:balance]">
                One student week shouldn’t take four different logins to track
              </h2>
              <p className="text-sm sm:text-base text-[#354E48] dark:text-slate-300 leading-relaxed">
                Between lectures, students regularly switch across separate systems just to check four everyday essentials:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  num: '01',
                  title: 'Attendance',
                  body: 'Checking subject percentages, daily status, and hour-wise logs without knowing how close you are to 80%.',
                },
                {
                  num: '02',
                  title: 'Upcoming classes',
                  body: 'Finding which lecture is running now, where the next room is, and how the rest of the section’s week looks.',
                },
                {
                  num: '03',
                  title: 'Grades and CGPA',
                  body: 'Translating semester results onto the Sathyabama grade scale and working out what GPA you need next.',
                },
                {
                  num: '04',
                  title: 'Course files and assignments',
                  body: 'Clicking through multi-level LMS menus just to grab unit PDFs or check assignment due dates.',
                },
              ].map((item) => (
                <div
                  key={item.num}
                  className="rounded-xl border border-[#DCE5DF] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-900 p-5 space-y-2.5"
                >
                  <span className="font-mono text-xs text-[#134E44] dark:text-emerald-400 tabular-nums">
                    {item.num}
                  </span>
                  <h3 className="font-display text-base font-semibold text-[#0F2421] dark:text-slate-50">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[#354E48] dark:text-slate-400 leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Four Clear Feature Sections */}
        <section id="features" className="py-14 sm:py-20 border-b border-[#DCE5DF] dark:border-slate-800/80">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-16 sm:space-y-20">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">What you get</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50 [text-wrap:balance]">
                Four everyday questions, answered in seconds
              </h2>
            </div>

            {/* Feature 1: Can I skip? (with live interactive 80% line calculator!) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-5 space-y-4">
                <h3 className="font-display text-2xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50">
                  Can I skip?
                </h3>
                <p className="text-sm sm:text-base text-[#354E48] dark:text-slate-300 leading-relaxed">
                  Every subject is shown directly against the 80% attendance line, telling you how many hours you can miss or must attend. Today’s daily and hour-wise attendance sit on the same page.
                </p>

                {/* Interactive Skip Line Calculator */}
                <div className="rounded-xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
                  <div className="flex items-center justify-between text-xs text-[#4A635D] dark:text-slate-400">
                    <span className="font-medium text-[#0F2421] dark:text-slate-100">Try the 80% line calculator</span>
                    <span className="font-mono tabular-nums font-bold text-base text-[#0F2421] dark:text-slate-50">
                      {skipCalc.percentage.toFixed(1)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="welcomeAttended" className="block text-[11px] text-[#4A635D] dark:text-slate-400 mb-1">
                        Hours attended
                      </label>
                      <div className="flex items-center rounded-lg border border-[#CFDCD4] dark:border-slate-700 bg-[#F7FAF8] dark:bg-slate-950">
                        <button
                          type="button"
                          aria-label="One hour fewer attended"
                          onClick={() => updateAttended(attendedHours - 1)}
                          className="p-2 text-[#0F2421] dark:text-slate-200 hover:bg-[#E6EDE8] dark:hover:bg-slate-800 rounded-l-lg cursor-pointer"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <input
                          id="welcomeAttended"
                          type="number"
                          min={0}
                          max={markedHours}
                          value={attendedHours}
                          onChange={(e) => updateAttended(Number(e.target.value))}
                          className="w-full bg-transparent text-center font-mono text-sm font-semibold tabular-nums text-[#0F2421] dark:text-slate-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label="One more hour attended"
                          onClick={() => updateAttended(attendedHours + 1)}
                          className="p-2 text-[#0F2421] dark:text-slate-200 hover:bg-[#E6EDE8] dark:hover:bg-slate-800 rounded-r-lg cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="welcomeMarked" className="block text-[11px] text-[#4A635D] dark:text-slate-400 mb-1">
                        Hours marked so far
                      </label>
                      <div className="flex items-center rounded-lg border border-[#CFDCD4] dark:border-slate-700 bg-[#F7FAF8] dark:bg-slate-950">
                        <button
                          type="button"
                          aria-label="One hour fewer marked"
                          onClick={() => updateMarked(markedHours - 1)}
                          className="p-2 text-[#0F2421] dark:text-slate-200 hover:bg-[#E6EDE8] dark:hover:bg-slate-800 rounded-l-lg cursor-pointer"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <input
                          id="welcomeMarked"
                          type="number"
                          min={1}
                          max={300}
                          value={markedHours}
                          onChange={(e) => updateMarked(Number(e.target.value))}
                          className="w-full bg-transparent text-center font-mono text-sm font-semibold tabular-nums text-[#0F2421] dark:text-slate-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label="One more hour marked"
                          onClick={() => updateMarked(markedHours + 1)}
                          className="p-2 text-[#0F2421] dark:text-slate-200 hover:bg-[#E6EDE8] dark:hover:bg-slate-800 rounded-r-lg cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="relative h-2.5 rounded-full bg-[#E6EDE8] dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          skipCalc.status === 'below'
                            ? 'bg-[#B45309] dark:bg-amber-500'
                            : 'bg-[#134E44] dark:bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, skipCalc.percentage)}%` }}
                      />
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 -bottom-1 w-0.5 bg-[#D99B26]"
                        style={{ left: '80%' }}
                      />
                    </div>
                    <p
                      className={`text-xs font-medium ${
                        skipCalc.status === 'below'
                          ? 'text-[#B45309] dark:text-amber-400'
                          : 'text-[#134E44] dark:text-emerald-400'
                      }`}
                    >
                      {skipCalc.verdict}
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 rounded-2xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E6EDE8] dark:border-slate-800">
                  <span className="text-xs font-semibold text-[#0F2421] dark:text-slate-100">
                    Subject breakdown against the 80% line
                  </span>
                  <span className="text-xs text-[#4A635D] dark:text-slate-400">Sample data</span>
                </div>
                <div className="space-y-4">
                  {[
                    { name: 'Data Structures', pct: 92, verdict: 'Can skip 4', below: false },
                    { name: 'Computer Networks', pct: 79, verdict: 'Attend 1 more', below: true },
                    { name: 'Discrete Mathematics', pct: 71, verdict: 'Attend 3 more', below: true },
                  ].map((subj) => (
                    <div key={subj.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[#0F2421] dark:text-slate-100">{subj.name}</span>
                        <span className="font-mono tabular-nums font-semibold text-[#0F2421] dark:text-slate-100">
                          {subj.pct}%
                        </span>
                      </div>
                      <div className="relative h-2 rounded-full bg-[#E6EDE8] dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            subj.below ? 'bg-[#B45309] dark:bg-amber-500' : 'bg-[#134E44] dark:bg-emerald-500'
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
                        className={`text-xs font-medium ${
                          subj.below ? 'text-[#B45309] dark:text-amber-400' : 'text-[#134E44] dark:text-emerald-400'
                        }`}
                      >
                        {subj.verdict}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#E6EDE8] dark:border-slate-800 text-xs">
                  <div className="rounded-lg bg-[#F7FAF8] dark:bg-slate-950/70 p-3">
                    <p className="text-[#4A635D] dark:text-slate-400">Today, daily</p>
                    <p className="mt-0.5 font-semibold text-[#134E44] dark:text-emerald-400">Present</p>
                  </div>
                  <div className="rounded-lg bg-[#F7FAF8] dark:bg-slate-950/70 p-3">
                    <p className="text-[#4A635D] dark:text-slate-400">Today, hour-wise</p>
                    <p className="mt-0.5 font-mono tabular-nums font-semibold text-[#0F2421] dark:text-slate-100 tracking-wider">
                      P · P · A · -
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2: What's next? */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-7 lg:order-1 order-2 rounded-2xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="rounded-xl bg-[#134E44] text-white p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-emerald-100 font-mono tabular-nums">
                    <span>Now</span>
                    <span>10:00 to 10:50</span>
                  </div>
                  <p className="font-display text-lg font-semibold">Data Structures</p>
                  <p className="text-xs text-emerald-100/90">Room 402 · 18 minutes left</p>
                </div>

                <div className="rounded-xl border border-[#DCE5DF] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-950/70 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-[#4A635D] dark:text-slate-400">Next</p>
                    <p className="text-sm font-semibold text-[#0F2421] dark:text-slate-100 mt-0.5">
                      Operating Systems
                    </p>
                    <p className="text-xs text-[#4A635D] dark:text-slate-400">Room 311</p>
                  </div>
                  <span className="font-mono tabular-nums text-sm font-semibold text-[#0F2421] dark:text-slate-100">
                    11:00
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-[#354E48] dark:text-slate-300">
                  <span>Then Computer Networks at 1:30, lab until 4:10.</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#134E44] dark:text-emerald-400">
                    <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    One-tap calendar export
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5 lg:order-2 order-1 space-y-3">
                <h3 className="font-display text-2xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50">
                  What’s next?
                </h3>
                <p className="text-sm sm:text-base text-[#354E48] dark:text-slate-300 leading-relaxed">
                  See your section’s full weekly schedule with the class you are currently in and the one immediately after it highlighted. Add your timetable to your phone’s calendar in one tap.
                </p>
              </div>
            </div>

            {/* Feature 3: Where's my CGPA? */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-5 space-y-3">
                <h3 className="font-display text-2xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50">
                  Where’s my CGPA?
                </h3>
                <p className="text-sm sm:text-base text-[#354E48] dark:text-slate-300 leading-relaxed">
                  Results are organized by semester, graded on the official Sathyabama grade scale, and credit-weighted into GPA and CGPA. The target-grade planner works out what average you need across upcoming semesters.
                </p>
                <p className="text-xs text-[#4A635D] dark:text-slate-400">
                  Note: The 8.42 CGPA shown on the right is sample data. Your official university grade sheet is always final.
                </p>
              </div>

              <div className="lg:col-span-7 rounded-2xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#E6EDE8] dark:border-slate-800">
                  <div>
                    <p className="text-xs text-[#4A635D] dark:text-slate-400">
                      CGPA after 4 semesters · <span className="font-medium text-[#B45309] dark:text-amber-400">Sample data</span>
                    </p>
                    <p className="mt-1 font-display text-4xl font-bold font-mono tabular-nums text-[#0F2421] dark:text-slate-50">
                      8.42
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center font-mono tabular-nums">
                    {[
                      { s: 'Sem 1', g: '8.29' },
                      { s: 'Sem 2', g: '8.48' },
                      { s: 'Sem 3', g: '8.30' },
                      { s: 'Sem 4', g: '8.61' },
                    ].map((item) => (
                      <div
                        key={item.s}
                        className="rounded-lg bg-[#F7FAF8] dark:bg-slate-950/70 border border-[#E3EAE5] dark:border-slate-800 px-2.5 py-2"
                      >
                        <p className="text-[10px] text-[#4A635D] dark:text-slate-400">{item.s}</p>
                        <p className="text-xs font-semibold text-[#0F2421] dark:text-slate-100 mt-0.5">
                          {item.g}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <dt className="font-medium text-[#4A635D] dark:text-slate-400">Official Sathyabama scale</dt>
                    <dd className="font-mono font-semibold text-[#0F2421] dark:text-slate-100">
                      A++ · A+ · A+ · B++ · B+
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="font-medium text-[#4A635D] dark:text-slate-400">Target-grade planner</dt>
                    <dd className="text-[#0F2421] dark:text-slate-200 leading-relaxed">
                      To reach <span className="font-mono font-semibold">8.5</span>, average{' '}
                      <span className="font-mono font-semibold text-[#134E44] dark:text-emerald-400">8.66</span> over the next two semesters.
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Feature 4: Where are my notes? (paired with documentary library study photo) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-7 lg:order-1 order-2 grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
                <div className="sm:col-span-7 rounded-2xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5">
                  <div className="flex items-center justify-between text-xs text-[#4A635D] dark:text-slate-400">
                    <span className="font-semibold text-[#0F2421] dark:text-slate-100">Computer Networks</span>
                    <span>Sample data</span>
                  </div>
                  <div className="rounded-lg border border-[#E3EAE5] dark:border-slate-800 px-3 py-2 text-xs text-[#4A635D] dark:text-slate-400">
                    Unit 2: Network layer
                  </div>
                  <div className="rounded-xl border border-[#134E44]/30 dark:border-emerald-800 bg-[#F7FAF8] dark:bg-slate-950/70 p-3.5 space-y-2.5">
                    <p className="text-xs font-semibold text-[#0F2421] dark:text-slate-100">
                      Unit 3: Transport layer
                    </p>
                    {[
                      { name: 'Unit 3 notes.pdf', size: '2.1 MB' },
                      { name: 'Congestion control slides.pdf', size: '4.8 MB' },
                    ].map((file) => (
                      <div key={file.name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-[#0F2421] dark:text-slate-200 truncate">
                          <FileText className="h-3.5 w-3.5 text-[#134E44] dark:text-emerald-400 shrink-0" aria-hidden="true" />
                          <span className="truncate">{file.name}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] text-[#4A635D] dark:text-slate-400 shrink-0">
                          {file.size}
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

                <div className="sm:col-span-5 min-h-[200px] rounded-2xl overflow-hidden border border-[#CFDCD4] dark:border-slate-800 bg-[#DCE5DF] dark:bg-slate-900">
                  {!libraryImgBroken ? (
                    <img
                      src={LIBRARY_STUDY_IMG}
                      alt="Students reviewing unit notes and course materials together in a sunlit university library"
                      referrerPolicy="no-referrer"
                      onError={() => setLibraryImgBroken(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-4 text-xs text-[#354E48] dark:text-slate-400">
                      Direct access to unit files &amp; notes
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 lg:order-2 order-1 space-y-3">
                <h3 className="font-display text-2xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50">
                  Where are my notes?
                </h3>
                <p className="text-sm sm:text-base text-[#354E48] dark:text-slate-300 leading-relaxed">
                  Each LMS course is organized by units with downloadable lecture notes, slides, and assignment due dates—so you can grab course material directly without navigating complicated LMS menus.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Getting Started — Three-Step Flow */}
        <section
          id="getting-started"
          className="py-14 sm:py-18 border-b border-[#DCE5DF] dark:border-slate-800/80 bg-white dark:bg-slate-900/50"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-8">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">Getting started</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50">
                One sign-in. The other two steps are optional.
              </h2>
            </div>

            <ol className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  step: '1',
                  title: 'Sign in with ERP',
                  tag: 'Required',
                  desc: 'Use your Sathyabama ERP register number and password. Nothing required to install.',
                },
                {
                  step: '2',
                  title: 'Add to your home screen',
                  tag: 'Optional',
                  desc: 'Android (Chrome): menu, then Install app. iPhone (Safari): Share, then Add to Home Screen.',
                },
                {
                  step: '3',
                  title: 'Connect your LMS',
                  tag: 'Optional',
                  desc: 'Use the Connect LMS card inside the dashboard once so your courses, notes, and deadlines appear.',
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="rounded-xl border border-[#DCE5DF] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-900 p-6 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="h-8 w-8 rounded-full bg-[#134E44] text-white font-mono text-xs font-semibold flex items-center justify-center">
                      {item.step}
                    </span>
                    <span className="text-xs text-[#4A635D] dark:text-slate-400">{item.tag}</span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-[#0F2421] dark:text-slate-50">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[#354E48] dark:text-slate-400 leading-relaxed">{item.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 6. Privacy Section */}
        <section id="privacy" className="py-14 sm:py-18 border-b border-[#DCE5DF] dark:border-slate-800/80">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 space-y-3">
              <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">Privacy</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50">
                You decide what is kept
              </h2>
              <p className="text-sm text-[#354E48] dark:text-slate-300 leading-relaxed">
                SIST-attendance is strictly read-only. It only reads your own ERP and LMS data when you open it.
              </p>
            </div>

            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: 'Passwords discarded by default',
                  body: 'Your password starts your session and is then discarded immediately—nothing is saved unless you opt in.',
                },
                {
                  title: '“Keep me signed in” stays on your device',
                  body: 'If you tick Keep me signed in, your password is kept encrypted in a cookie on your own device—never on our server—and removed when you sign out.',
                },
                {
                  title: 'Fetched on demand, cached briefly',
                  body: 'Your marks and attendance are fetched from the ERP when you open them and cached for a few minutes. Nothing about you is kept on our side.',
                },
                {
                  title: 'Read-only encrypted session',
                  body: 'The session lives in an encrypted cookie, lasts 8 hours, only ever reads your own data, and renews quietly if you chose to stay signed in.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2"
                >
                  <div className="flex items-center gap-2 text-[#134E44] dark:text-emerald-400">
                    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-[#0F2421] dark:text-slate-100">
                      {card.title}
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-[#354E48] dark:text-slate-400 leading-relaxed">
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. FAQ Section */}
        <section
          id="questions"
          className="py-14 sm:py-18 border-b border-[#DCE5DF] dark:border-slate-800/80 bg-white dark:bg-slate-900/50"
        >
          <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">Questions</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50">
                Straight answers before you sign in
              </h2>
            </div>

            <div className="divide-y divide-[#DCE5DF] dark:divide-slate-800 border-y border-[#DCE5DF] dark:border-slate-800">
              {SISTMATE_FAQS.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={faq.question} className="py-4">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between gap-4 text-left text-sm sm:text-base font-semibold text-[#0F2421] dark:text-slate-100 cursor-pointer"
                    >
                      <span>{faq.question}</span>
                      <ChevronDown
                        className={`h-4 w-4 text-[#4A635D] dark:text-slate-400 shrink-0 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen ? (
                      <p className="mt-2.5 text-sm text-[#354E48] dark:text-slate-300 leading-relaxed pr-6">
                        {faq.answer}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Concise Summary (<200 words) & Two-Audience Overview */}
        <section id="overview" className="py-14 sm:py-18 border-b border-[#DCE5DF] dark:border-slate-800/80">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">
                  Summary &amp; Audience Overviews
                </p>
                <h2 className="font-display text-2xl font-bold tracking-tight text-[#0F2421] dark:text-slate-50">
                  Shareable factual overview of SIST-attendance
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <div
                  role="tablist"
                  aria-label="SIST-attendance overview audience"
                  className="flex flex-wrap max-w-full rounded-lg bg-[#E6EDE8] dark:bg-slate-800 p-1 gap-1"
                >
                  {(
                    [
                      { id: 'summary', label: `Quick Summary (${summaryWordCount}w)` },
                      { id: 'students', label: 'For Students' },
                      { id: 'administrators', label: 'For Faculty & Admins' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={briefingTab === tab.id}
                      onClick={() => {
                        setBriefingTab(tab.id);
                        setCopiedBriefing(false);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        briefingTab === tab.id
                          ? 'bg-white dark:bg-slate-900 text-[#0F2421] dark:text-slate-50 shadow-xs'
                          : 'text-[#354E48] dark:text-slate-400 hover:text-[#0F2421] dark:hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void handleCopyBriefing()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDCD4] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-[#0F2421] dark:text-slate-200 hover:bg-[#EDF2EE] dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copiedBriefing ? <Check className="h-3.5 w-3.5 text-[#134E44]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copiedBriefing ? 'Copied' : 'Copy text'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8">
              {briefingTab === 'summary' ? (
                <div className="space-y-4 max-w-3xl text-sm text-[#354E48] dark:text-slate-300 leading-relaxed">
                  {SISTMATE_UNDER_200_SUMMARY.split('\n\n').map((block, i) => {
                    const lines = block.split('\n');
                    const hasBullets = lines.some((l) => l.startsWith('- '));
                    if (!hasBullets) {
                      return <p key={i}>{block}</p>;
                    }
                    const introLine = lines.find((l) => !l.startsWith('- '));
                    const bulletLines = lines.filter((l) => l.startsWith('- '));
                    return (
                      <div key={i} className="space-y-2">
                        {introLine ? <p>{introLine}</p> : null}
                        <ul className="space-y-1.5 pl-4 list-disc text-[#0F2421] dark:text-slate-200">
                          {bulletLines.map((b) => (
                            <li key={b}>{b.replace(/^-\s+/, '')}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : activeAudience ? (
                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-[#134E44] dark:text-emerald-400">
                      {activeAudience.label}
                    </p>
                    <h3 className="font-display text-xl font-bold text-[#0F2421] dark:text-slate-50">
                      {activeAudience.headline}
                    </h3>
                    <p className="text-sm text-[#354E48] dark:text-slate-300 leading-relaxed max-w-3xl">
                      {activeAudience.intro}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {activeAudience.sections.map((sec) => (
                      <div
                        key={sec.heading}
                        className="rounded-xl border border-[#E3EAE5] dark:border-slate-800 bg-[#F7FAF8] dark:bg-slate-950/60 p-4 space-y-2.5"
                      >
                        <h4 className="text-xs font-semibold text-[#0F2421] dark:text-slate-100">
                          {sec.heading}
                        </h4>
                        <ul className="space-y-2 text-xs text-[#354E48] dark:text-slate-400 leading-relaxed">
                          {sec.points.map((pt) => (
                            <li key={pt}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <p className="pt-3 border-t border-[#E6EDE8] dark:border-slate-800 text-xs text-[#4A635D] dark:text-slate-400">
                    {activeAudience.closing}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* 8. Final CTA Section */}
        <section className="py-14 sm:py-18">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="relative rounded-2xl overflow-hidden border border-[#134E44]/25 dark:border-slate-800 bg-[#134E44] text-white">
              {!walkwayImgBroken ? (
                <img
                  src={CAMPUS_WALKWAY_IMG}
                  alt="Morning sunlight along a modern university campus walkway"
                  referrerPolicy="no-referrer"
                  onError={() => setWalkwayImgBroken(true)}
                  className="absolute inset-0 w-full h-full object-cover opacity-30"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B2D27]/95 via-[#134E44]/85 to-[#0B2D27]/75" />
              <div className="relative p-8 sm:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight [text-wrap:balance]">
                    See your own numbers against the line.
                  </h2>
                  <p className="text-sm sm:text-base text-emerald-100/90">
                    Use the ERP account you already have.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="inline-flex items-center gap-2 rounded-lg bg-white text-[#0F2421] hover:bg-emerald-50 px-6 py-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={onOpenPresentation}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 px-4 py-3 text-sm font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    8-Slide Deck
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      {standalone ? (
        <footer className="border-t border-[#DCE5DF] dark:border-slate-800 bg-white dark:bg-slate-900/70">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-[#4A635D] dark:text-slate-400">
            <div className="space-y-1">
              <p className="font-display text-sm font-bold text-[#0F2421] dark:text-slate-100">
                SIST-attendance
              </p>
              <p>{SISTMATE_DISCLAIMER}</p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onOpenPresentation}
                className="hover:text-[#0F2421] dark:hover:text-slate-100 hover:underline cursor-pointer whitespace-nowrap"
              >
                8-Slide Presentation
              </button>
              <button
                type="button"
                onClick={onOpenGuide}
                className="hover:text-[#0F2421] dark:hover:text-slate-100 hover:underline cursor-pointer whitespace-nowrap"
              >
                Live Login Guide
              </button>
              <button
                type="button"
                onClick={onToggleTheme}
                className="inline-flex items-center gap-1.5 hover:text-[#0F2421] dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <a
                href={CREATOR_INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#134E44] dark:text-emerald-400 hover:underline whitespace-nowrap"
              >
                <span>by @snazzyyuvaraj</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
