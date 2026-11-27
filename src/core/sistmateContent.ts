export const SISTMATE_DISCLAIMER =
  'SIST-attendance is an independent project and is not affiliated with Sathyabama or its ERP.';

export const SISTMATE_PROMISE = 'Know where you stand before the next class.';

export type SlideVisualType =
  | 'problem'
  | 'attendance'
  | 'schedule'
  | 'cgpa'
  | 'lms'
  | 'setup-diagram'
  | 'privacy'
  | 'cta';

export interface SistmateSlide {
  id: number;
  kicker: string;
  headline: string;
  summary: string;
  bullets: string[];
  visualType: SlideVisualType;
  sampleNote?: string;
}

export const SISTMATE_SLIDES: ReadonlyArray<SistmateSlide> = [
  {
    id: 1,
    kicker: '01 · The Problem',
    headline: 'Know where you stand before the next class.',
    summary:
      'Sathyabama students check multiple portals every day just to answer basic questions about attendance, classes, grades, and notes. SIST-attendance is a student-first, read-only web app that brings ERP and LMS information into one calm view.',
    bullets: [
      'Attendance percentages and daily logs live inside ERP menus',
      'Weekly timetables and upcoming rooms sit separately from attendance',
      'Semester grades and CGPA calculations require manual grade-point lookup',
      'Course units, PDFs, and assignments are buried inside LMS menus',
    ],
    visualType: 'problem',
  },
  {
    id: 2,
    kicker: '02 · Attendance · Can I skip?',
    headline: 'Every subject measured against the 80% attendance line.',
    summary:
      'See every course against the 80% threshold at a glance, including how many hours you can still skip or must attend next—with today’s daily and hour-wise marks on the same screen.',
    bullets: [
      'Instant skip allowance or required classes for every subject',
      'Clear 80% threshold line so borderline courses stand out early',
      'Today’s daily status and hour-wise P / A slots shown together',
    ],
    visualType: 'attendance',
    sampleNote: 'Sample data shown. Signed in, numbers come from your own ERP account.',
  },
  {
    id: 3,
    kicker: '03 · Schedule · What’s next?',
    headline: 'Your section’s week, with now and next highlighted.',
    summary:
      'Open SIST-attendance between lectures to see the class you are in, the room and start time for the class after it, and your full weekly section timetable.',
    bullets: [
      'Current class card with room and time remaining',
      'Next class callout so you know where to walk next',
      'One-tap calendar integration to add your timetable to your phone',
    ],
    visualType: 'schedule',
    sampleNote: 'Sample data shown.',
  },
  {
    id: 4,
    kicker: '04 · CGPA · Where’s my CGPA?',
    headline: 'Semester GPA, credit-weighted CGPA, and target planning.',
    summary:
      'View semester results graded on the official Sathyabama grade scale, credit-weighted into GPA and CGPA, plus a target-grade planner that calculates what you need next.',
    bullets: [
      'Semester-by-semester GPA and cumulative credit-weighted CGPA',
      'Built on the official Sathyabama grade scale (official grade sheet remains final)',
      'Target-grade planner shows the average GPA required across upcoming semesters',
    ],
    visualType: 'cgpa',
    sampleNote: 'Sample data: 8.42 CGPA after four semesters is an illustrative example.',
  },
  {
    id: 5,
    kicker: '05 · LMS · Where are my notes?',
    headline: 'Courses, units, files, and assignments without LMS menus.',
    summary:
      'Connect your LMS once to browse each course organized cleanly by units, download PDFs and slides directly, and check upcoming assignment due dates.',
    bullets: [
      'Courses structured by unit rather than deep portal folders',
      'Direct one-tap downloads for notes and lecture slides',
      'Assignment status and due dates surfaced right alongside course units',
    ],
    visualType: 'lms',
    sampleNote: 'Sample data shown.',
  },
  {
    id: 6,
    kicker: '06 · Getting Started',
    headline: 'One sign-in. Two optional steps.',
    summary:
      'Start using SIST-attendance in under a minute with the ERP account you already have—nothing required to install, and both Home Screen setup and LMS connection are optional.',
    bullets: [
      'Step 1: Sign in with your ERP register number and password',
      'Step 2 (Optional): Add SIST-attendance to your phone’s home screen (Chrome or iPhone Safari)',
      'Step 3 (Optional): Connect your LMS from the dashboard for courses and deadlines',
    ],
    visualType: 'setup-diagram',
  },
  {
    id: 7,
    kicker: '07 · Privacy by Default',
    headline: 'Read-only, transparent, and built around your control.',
    summary:
      'SIST-attendance only reads your own portal data and does not store your marks or attendance on its server.',
    bullets: [
      'Passwords are discarded by default as soon as your session starts',
      'Ticking “Keep me signed in” stores it encrypted in a cookie on your own device only, and removes it on sign-out',
      'Marks and attendance are fetched on demand from ERP and cached only briefly',
      'Strictly read-only—SIST-attendance never modifies ERP or LMS records',
    ],
    visualType: 'privacy',
  },
  {
    id: 8,
    kicker: '08 · Try SIST-attendance',
    headline: 'Sign in to see your own numbers against the line.',
    summary:
      'Use the Sathyabama ERP account you already have to view your live attendance margin, next class, CGPA breakdown, and LMS notes in one place.',
    bullets: [
      'Works on Android, iPhone Safari, and desktop browsers',
      'Read-only student companion—no extra account registration required',
      SISTMATE_DISCLAIMER,
    ],
    visualType: 'cta',
  },
];

export const SISTMATE_UNDER_200_SUMMARY = `SIST-attendance is an independent, read-only web app for Sathyabama students that brings ERP and LMS details into one place so you can know where you stand before the next class.

Students normally switch between separate systems to check attendance, schedules, grades, and course files. SIST-attendance combines four core views:
- Attendance: tracks each subject against the 80% line, shows how many classes you can skip or must attend, and displays daily and hour-wise attendance.
- Schedule: highlights your current and next class, shows your weekly section timetable, and supports one-tap calendar export.
- CGPA: calculates semester GPA and credit-weighted CGPA using the official Sathyabama grade scale, with a target-grade planner.
- LMS: organizes courses by units with downloadable files and assignment status.

Getting started takes one sign-in with your ERP register number and password; adding the app to your home screen and connecting the LMS are optional.

By default, passwords are discarded once your session starts. Choosing "Keep me signed in" keeps the password encrypted on your own device only and removes it on sign-out. Marks and attendance are fetched on demand and cached briefly. SIST-attendance is an independent project and is not affiliated with Sathyabama or its ERP.`;

export interface AudienceOverview {
  id: 'students' | 'administrators';
  label: string;
  headline: string;
  intro: string;
  sections: {
    heading: string;
    points: string[];
  }[];
  closing: string;
}

export const SISTMATE_AUDIENCE_OVERVIEWS: Record<'students' | 'administrators', AudienceOverview> = {
  students: {
    id: 'students',
    label: 'For Sathyabama Students',
    headline: 'Know where you stand before the next class',
    intro:
      'SIST-attendance is an independent, read-only web app built for Sathyabama students. Instead of checking separate ERP and LMS screens for every routine question, SIST-attendance brings your daily academic information into one mobile-first view.',
    sections: [
      {
        heading: 'The everyday friction it removes',
        points: [
          'Checking separate ERP screens for subject percentages and daily/hour-wise logs',
          'Looking up which class is running now and which room comes next',
          'Calculating credit-weighted CGPA and future semester targets manually',
          'Navigating deep LMS course menus just to download unit notes or check assignment due dates',
        ],
      },
      {
        heading: 'What you get after signing in',
        points: [
          'Attendance ("Can I skip?"): every subject measured against the 80% line with exact hours you can skip or must attend, plus today’s daily and hour-wise attendance.',
          'Schedule ("What’s next?"): your section’s weekly timetable highlighting the current and next class, with one-tap calendar integration.',
          'CGPA ("Where’s my CGPA?"): semester GPA and credit-weighted CGPA on the official Sathyabama grade scale, plus a target-grade planner (the official grade sheet remains final).',
          'LMS ("Where are my notes?"): courses grouped by units with direct file downloads and assignment due dates.',
        ],
      },
      {
        heading: 'Getting started & privacy',
        points: [
          'Sign in with the ERP register number and password you already have—nothing required to install.',
          'Optionally add SIST-attendance to your phone’s Home Screen (Android Chrome or iPhone Safari) and optionally connect your LMS inside the dashboard.',
          'Passwords are discarded once your session starts by default. If you choose "Keep me signed in", it is kept encrypted in a cookie on your own device only and deleted when you sign out. Marks and attendance are fetched on demand and cached briefly.',
        ],
      },
    ],
    closing: `Sign in to see your own numbers against the line. ${SISTMATE_DISCLAIMER}`,
  },
  administrators: {
    id: 'administrators',
    label: 'For Administrators & Faculty',
    headline: 'A read-only student view over existing ERP and LMS systems',
    intro:
      'SIST-attendance is an independent, read-only web application created to give Sathyabama students a clearer, mobile-friendly view of academic information already available to them in ERP and LMS portals.',
    sections: [
      {
        heading: 'Student problems addressed',
        points: [
          'Students frequently move between separate ERP pages, timetables, grade calculations, and LMS folders to plan their day.',
          'Fragmented access makes it harder for students to notice attendance slipping below 80% early or find unit materials before deadlines.',
        ],
      },
      {
        heading: 'Core read-only capabilities',
        points: [
          'Attendance visibility: displays each subject against the 80% attendance threshold alongside daily and hour-wise records so students know how many classes they must attend to stay on track.',
          'Schedule clarity: surfaces the current class, next class, weekly section timetable, and one-tap calendar export.',
          'Academic progress: presents semester GPA, credit-weighted CGPA on the official Sathyabama grade scale, and a target-grade planner while clarifying that the official grade sheet is final.',
          'LMS access: organizes courses by unit with direct file access and assignment status without altering any LMS workflow.',
        ],
      },
      {
        heading: 'Onboarding, privacy, and data boundaries',
        points: [
          'Students authenticate directly with their own existing ERP credentials; Home Screen installation and LMS linking are optional.',
          'Read-only access: SIST-attendance only reads the signed-in student’s own data and cannot alter ERP or LMS records.',
          'No central credential or academic archive: passwords are discarded after starting the session by default (or stored encrypted in a cookie on the student’s own device if they opt into "Keep me signed in", and cleared on sign-out). Marks and attendance are fetched on demand and cached briefly.',
        ],
      },
    ],
    closing: SISTMATE_DISCLAIMER,
  },
};

export interface SistmateFaqItem {
  question: string;
  answer: string;
}

export const SISTMATE_FAQS: ReadonlyArray<SistmateFaqItem> = [
  {
    question: 'Is SIST-attendance official?',
    answer:
      'No. SIST-attendance is an independent project and is not affiliated with Sathyabama or its ERP. It is strictly read-only and only reads your own data when you sign in.',
  },
  {
    question: 'Does it work on iPhone?',
    answer:
      'Yes. Open SIST-attendance in Safari on your iPhone, tap Share, and choose Add to Home Screen so it launches like an app.',
  },
  {
    question: 'How accurate is CGPA?',
    answer:
      'It uses the official Sathyabama grade scale and course credits to calculate semester GPA and credit-weighted CGPA, but your official university grade sheet is always final.',
  },
  {
    question: 'Is my password stored?',
    answer:
      'By default, no. Your password starts an encrypted session and is then discarded. Only if you tick “Keep me signed in” is it stored encrypted in a cookie on your own device—never on our server—and removed when you sign out.',
  },
  {
    question: 'Why does today’s attendance appear after 7 pm?',
    answer:
      'SIST-attendance fetches live data directly from the ERP when you open a page. Today’s daily and hour-wise entries appear as soon as the college ERP publishes them for the day.',
  },
];

export interface SkipLineResult {
  percentage: number;
  canSkip: number;
  mustAttend: number;
  status: 'safe' | 'borderline' | 'below';
  verdict: string;
}

/**
 * Pure attendance calculator for the 80% attendance line (or configurable threshold).
 */
export function computeSkipLineResult(
  attendedRaw: number,
  markedRaw: number,
  thresholdPercent = 80
): SkipLineResult {
  const marked = Math.max(0, Math.floor(Number.isFinite(markedRaw) ? markedRaw : 0));
  const attended = Math.max(0, Math.min(marked, Math.floor(Number.isFinite(attendedRaw) ? attendedRaw : 0)));
  const threshold = Math.min(99, Math.max(1, thresholdPercent));

  if (marked === 0) {
    return {
      percentage: 0,
      canSkip: 0,
      mustAttend: 0,
      status: 'below',
      verdict: 'Enter your attended and marked hours to see where you stand.',
    };
  }

  const percentage = Math.round((attended / marked) * 1000) / 10;

  if (100 * attended >= threshold * marked) {
    const canSkip = Math.max(0, Math.floor((100 * attended - threshold * marked) / threshold));
    const status = canSkip === 0 ? 'borderline' : 'safe';
    const verdict =
      canSkip === 0
        ? `At the ${threshold}% line — attend the next class to keep your margin.`
        : `${canSkip} ${canSkip === 1 ? 'class' : 'classes'} you can still skip and stay at ${threshold}% or above.`;
    return { percentage, canSkip, mustAttend: 0, status, verdict };
  }

  const mustAttend = Math.max(
    1,
    Math.ceil((threshold * marked - 100 * attended) / (100 - threshold))
  );
  return {
    percentage,
    canSkip: 0,
    mustAttend,
    status: 'below',
    verdict: `Attend the next ${mustAttend} ${mustAttend === 1 ? 'class' : 'classes'} in a row to reach ${threshold}%.`,
  };
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
