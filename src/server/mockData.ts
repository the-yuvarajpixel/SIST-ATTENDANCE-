import { deduplicateDeadlines } from '../core/schedule';
import type {
  AttendanceSubject,
  DeadlineItem,
  NotificationItem,
  ResultsPayload,
  StudentProfile,
  TimetableSlot,
} from '../core/types';

function shiftDays(daysFromNow: number, hours = 17, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function formatIsoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildMockProfile(registerNumber: string, displayName?: string): StudentProfile {
  const reg = registerNumber.trim() || '42110482';
  const name = displayName?.trim() || (reg === '42110482' ? 'Arjun Subramanian' : `Student ${reg}`);
  return {
    registerNumber: reg,
    name,
    program: 'B.E. Computer Science and Engineering',
    department: 'School of Computing',
    semester: 6,
    batch: '2023 – 2027',
    section: 'CSE – B2',
    email: `${reg.toLowerCase()}@sathyabama.ac.in`,
    advisor: 'Dr. R. Meenakshi',
    erpConnected: true,
    lmsConnected: true,
  };
}

export function buildMockAttendance(): AttendanceSubject[] {
  const today = formatIsoDate(0);
  const yesterday = formatIsoDate(-1);
  return [
    {
      courseCode: 'SCSA1601',
      courseName: 'Computer Networks',
      faculty: 'Dr. S. Priya Dharshini',
      credits: 4,
      attended: 35,
      total: 40,
      lastUpdated: today,
    },
    {
      courseCode: 'SCSA1602',
      courseName: 'Compiler Design',
      faculty: 'Prof. K. Karthikeyan',
      credits: 4,
      attended: 25,
      total: 36,
      lastUpdated: today,
    },
    {
      courseCode: 'SCSA1603',
      courseName: 'Machine Learning',
      faculty: 'Dr. M. Vigneshwaran',
      credits: 4,
      attended: 31,
      total: 34,
      lastUpdated: today,
    },
    {
      courseCode: 'SCSA1604',
      courseName: 'Cloud Computing Architecture',
      faculty: 'Prof. N. Anitha',
      credits: 3,
      attended: 24,
      total: 31,
      lastUpdated: yesterday,
    },
    {
      courseCode: 'SCSA2601',
      courseName: 'Networks & Security Lab',
      faculty: 'Dr. S. Priya Dharshini',
      credits: 2,
      attended: 17,
      total: 19,
      lastUpdated: yesterday,
    },
    {
      courseCode: 'SCSA1605',
      courseName: 'Software Engineering & Agile',
      faculty: 'Prof. V. Deepika',
      credits: 3,
      attended: 21,
      total: 29,
      lastUpdated: today,
    },
  ];
}

export function buildMockTimetable(): TimetableSlot[] {
  return [
    // Monday
    { id: 'mon-1', day: 'Mon', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-204', faculty: 'Dr. S. Priya Dharshini', kind: 'Lecture' },
    { id: 'mon-2', day: 'Mon', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-204', faculty: 'Prof. K. Karthikeyan', kind: 'Lecture' },
    { id: 'mon-3', day: 'Mon', startTime: '11:10', endTime: '12:00', courseCode: 'SCSA1603', courseName: 'Machine Learning', room: 'CS-301', faculty: 'Dr. M. Vigneshwaran', kind: 'Lecture' },
    { id: 'mon-4', day: 'Mon', startTime: '13:30', endTime: '15:10', courseCode: 'SCSA2601', courseName: 'Networks & Security Lab', room: 'Lab-04', faculty: 'Dr. S. Priya Dharshini', kind: 'Lab' },

    // Tuesday
    { id: 'tue-1', day: 'Tue', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1603', courseName: 'Machine Learning', room: 'CS-301', faculty: 'Dr. M. Vigneshwaran', kind: 'Lecture' },
    { id: 'tue-2', day: 'Tue', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1604', courseName: 'Cloud Computing Architecture', room: 'CS-206', faculty: 'Prof. N. Anitha', kind: 'Lecture' },
    { id: 'tue-3', day: 'Tue', startTime: '11:10', endTime: '12:00', courseCode: 'SCSA1605', courseName: 'Software Engineering & Agile', room: 'CS-204', faculty: 'Prof. V. Deepika', kind: 'Lecture' },
    { id: 'tue-4', day: 'Tue', startTime: '14:00', endTime: '14:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-204', faculty: 'Prof. K. Karthikeyan', kind: 'Tutorial' },

    // Wednesday
    { id: 'wed-1', day: 'Wed', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-204', faculty: 'Prof. K. Karthikeyan', kind: 'Lecture' },
    { id: 'wed-2', day: 'Wed', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-204', faculty: 'Dr. S. Priya Dharshini', kind: 'Lecture' },
    { id: 'wed-3', day: 'Wed', startTime: '11:10', endTime: '12:00', courseCode: 'SCSA1604', courseName: 'Cloud Computing Architecture', room: 'CS-206', faculty: 'Prof. N. Anitha', kind: 'Lecture' },
    { id: 'wed-4', day: 'Wed', startTime: '13:30', endTime: '14:20', courseCode: 'SCSA1605', courseName: 'Software Engineering & Agile', room: 'CS-204', faculty: 'Prof. V. Deepika', kind: 'Lecture' },

    // Thursday
    { id: 'thu-1', day: 'Thu', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1604', courseName: 'Cloud Computing Architecture', room: 'CS-206', faculty: 'Prof. N. Anitha', kind: 'Lecture' },
    { id: 'thu-2', day: 'Thu', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1603', courseName: 'Machine Learning', room: 'CS-301', faculty: 'Dr. M. Vigneshwaran', kind: 'Lecture' },
    { id: 'thu-3', day: 'Thu', startTime: '11:10', endTime: '12:00', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-204', faculty: 'Dr. S. Priya Dharshini', kind: 'Tutorial' },
    { id: 'thu-4', day: 'Thu', startTime: '13:30', endTime: '15:10', courseCode: 'SCSA2601', courseName: 'Networks & Security Lab', room: 'Lab-04', faculty: 'Dr. S. Priya Dharshini', kind: 'Lab' },

    // Friday
    { id: 'fri-1', day: 'Fri', startTime: '09:00', endTime: '09:50', courseCode: 'SCSA1605', courseName: 'Software Engineering & Agile', room: 'CS-204', faculty: 'Prof. V. Deepika', kind: 'Lecture' },
    { id: 'fri-2', day: 'Fri', startTime: '10:00', endTime: '10:50', courseCode: 'SCSA1602', courseName: 'Compiler Design', room: 'CS-204', faculty: 'Prof. K. Karthikeyan', kind: 'Lecture' },
    { id: 'fri-3', day: 'Fri', startTime: '11:10', endTime: '12:00', courseCode: 'SCSA1601', courseName: 'Computer Networks', room: 'CS-204', faculty: 'Dr. S. Priya Dharshini', kind: 'Lecture' },
    { id: 'fri-4', day: 'Fri', startTime: '14:00', endTime: '14:50', courseCode: 'SCSA1603', courseName: 'Machine Learning', room: 'CS-301', faculty: 'Dr. M. Vigneshwaran', kind: 'Tutorial' },
  ];
}

export function buildMockResults(): ResultsPayload {
  return {
    currentSemester: 6,
    semesters: [
      {
        semester: 1,
        termLabel: 'Nov 2023',
        sgpa: 8.35,
        credits: 20,
        courses: [
          { courseCode: 'SMTA1101', courseName: 'Engineering Mathematics I', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SPHA1101', courseName: 'Physics for Information Science', credits: 4, grade: 'A', gradePoints: 8 },
          { courseCode: 'SCSA1101', courseName: 'Problem Solving with Python', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SEEA1101', courseName: 'Basic Electrical Engineering', credits: 4, grade: 'B+', gradePoints: 7 },
          { courseCode: 'SHSA1101', courseName: 'Technical English', credits: 4, grade: 'A+', gradePoints: 9 },
        ],
      },
      {
        semester: 2,
        termLabel: 'May 2024',
        sgpa: 8.6,
        credits: 20,
        courses: [
          { courseCode: 'SMTA1201', courseName: 'Engineering Mathematics II', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SCSA1201', courseName: 'Data Structures in C', credits: 4, grade: 'O', gradePoints: 10 },
          { courseCode: 'SCSA1202', courseName: 'Digital Logic & Circuits', credits: 4, grade: 'A', gradePoints: 8 },
          { courseCode: 'SCSA1203', courseName: 'Object Oriented Programming', credits: 4, grade: 'A', gradePoints: 8 },
          { courseCode: 'SCSA2201', courseName: 'Data Structures Lab', credits: 4, grade: 'A', gradePoints: 8 },
        ],
      },
      {
        semester: 3,
        termLabel: 'Nov 2024',
        sgpa: 8.8,
        credits: 20,
        courses: [
          { courseCode: 'SMTA1302', courseName: 'Discrete Mathematics', credits: 4, grade: 'A', gradePoints: 8 },
          { courseCode: 'SCSA1301', courseName: 'Computer Architecture', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SCSA1302', courseName: 'Database Management Systems', credits: 4, grade: 'O', gradePoints: 10 },
          { courseCode: 'SCSA1303', courseName: 'Java Programming', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SCSA2301', courseName: 'DBMS Lab', credits: 4, grade: 'A', gradePoints: 8 },
        ],
      },
      {
        semester: 4,
        termLabel: 'May 2025',
        sgpa: 9.1,
        credits: 20,
        courses: [
          { courseCode: 'SCSA1401', courseName: 'Design & Analysis of Algorithms', credits: 4, grade: 'O', gradePoints: 10 },
          { courseCode: 'SCSA1402', courseName: 'Operating Systems', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SCSA1403', courseName: 'Theory of Computation', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SMTA1401', courseName: 'Probability & Statistics', credits: 4, grade: 'A', gradePoints: 8 },
          { courseCode: 'SCSA2401', courseName: 'Operating Systems Lab', credits: 4, grade: 'O', gradePoints: 10 },
        ],
      },
      {
        semester: 5,
        termLabel: 'Nov 2025',
        sgpa: 8.95,
        credits: 20,
        courses: [
          { courseCode: 'SCSA1501', courseName: 'Artificial Intelligence', credits: 4, grade: 'O', gradePoints: 10 },
          { courseCode: 'SCSA1502', courseName: 'Web Engineering', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SCSA1503', courseName: 'Information Security', credits: 4, grade: 'A+', gradePoints: 9 },
          { courseCode: 'SCSA1504', courseName: 'Distributed Systems', credits: 4, grade: 'A', gradePoints: 8 },
          { courseCode: 'SCSA2501', courseName: 'Full Stack Lab', credits: 4, grade: 'A+', gradePoints: 9 },
        ],
      },
    ],
    currentCourses: [
      { courseCode: 'SCSA1601', courseName: 'Computer Networks', credits: 4, expectedGrade: 'A+' },
      { courseCode: 'SCSA1602', courseName: 'Compiler Design', credits: 4, expectedGrade: 'A' },
      { courseCode: 'SCSA1603', courseName: 'Machine Learning', credits: 4, expectedGrade: 'O' },
      { courseCode: 'SCSA1604', courseName: 'Cloud Computing Architecture', credits: 3, expectedGrade: 'A+' },
      { courseCode: 'SCSA1605', courseName: 'Software Engineering & Agile', credits: 3, expectedGrade: 'A' },
      { courseCode: 'SCSA2601', courseName: 'Networks & Security Lab', credits: 2, expectedGrade: 'O' },
    ],
    caeMarks: [
      {
        courseCode: 'SCSA1601',
        courseName: 'Computer Networks',
        credits: 4,
        cae1: 44,
        cae1Max: 50,
        cae2: 42,
        cae2Max: 50,
        internalBonus: 9,
        internalBonusMax: 10,
        internalTotal: 43.4,
        internalMax: 50,
        standing: 'strong',
        remarks: 'Strong routing & TCP concepts; minor slip in subnetting speed.',
      },
      {
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
        remarks: 'Needs revision on LR(1) parsing tables & syntax-directed translation.',
      },
      {
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
        remarks: 'Top quartile across both CAE assessments and notebook viva.',
      },
      {
        courseCode: 'SCSA1604',
        courseName: 'Cloud Computing Architecture',
        credits: 3,
        cae1: 41,
        cae1Max: 50,
        cae2: 39,
        cae2Max: 50,
        internalBonus: 8.5,
        internalBonusMax: 10,
        internalTotal: 40.5,
        internalMax: 50,
        standing: 'strong',
        remarks: 'Consistent Kubernetes & IAM architecture answers.',
      },
      {
        courseCode: 'SCSA1605',
        courseName: 'Software Engineering & Agile',
        credits: 3,
        cae1: 36,
        cae1Max: 50,
        cae2: 38,
        cae2Max: 50,
        internalBonus: 8,
        internalBonusMax: 10,
        internalTotal: 37.6,
        internalMax: 50,
        standing: 'on-track',
        remarks: 'Improved +2 in CAE II; solid sprint estimation case study.',
      },
      {
        courseCode: 'SCSA2601',
        courseName: 'Networks & Security Lab',
        credits: 2,
        cae1: 45,
        cae1Max: 50,
        cae2: 46,
        cae2Max: 50,
        internalBonus: 9.5,
        internalBonusMax: 10,
        internalTotal: 45.9,
        internalMax: 50,
        standing: 'strong',
        remarks: 'All Wireshark & TLS lab observations verified on time.',
      },
    ],
  };
}

export function buildMockDeadlines(): { items: DeadlineItem[]; duplicatesMerged: number } {
  const raw: DeadlineItem[] = [
    {
      id: 'lms-dl-1',
      title: 'TCP Congestion Control Packet Trace Lab',
      courseCode: 'SCSA1601',
      courseName: 'Computer Networks',
      dueAt: shiftDays(1, 23, 59),
      kind: 'assignment',
      origin: 'LMS',
      notes: 'Upload Wireshark .pcapng and 2-page PDF analysis on Moodle.',
    },
    {
      id: 'erp-dl-2',
      title: 'CAE II Examination — Compiler Design',
      courseCode: 'SCSA1602',
      courseName: 'Compiler Design',
      dueAt: shiftDays(3, 9, 0),
      kind: 'exam',
      origin: 'ERP',
      notes: 'Hall Block-B, Room 204 · Units III & IV (LR Parsing & Syntax Directed Translation).',
    },
    {
      id: 'lms-dl-2-dup',
      title: 'CAE II Examination: Compiler Design',
      courseCode: 'SCSA1602',
      courseName: 'Compiler Design',
      dueAt: shiftDays(3, 9, 15),
      kind: 'exam',
      origin: 'LMS',
      notes: 'Bring non-programmable calculator.',
    },
    {
      id: 'lms-dl-3',
      title: 'Gradient Boosting Model Evaluation Notebook',
      courseCode: 'SCSA1603',
      courseName: 'Machine Learning',
      dueAt: shiftDays(4, 21, 0),
      kind: 'assignment',
      origin: 'LMS',
      notes: 'Submit .ipynb with cross-validation metrics and ROC curves.',
    },
    {
      id: 'erp-dl-4',
      title: 'Semester VI Examination Registration Fee',
      dueAt: shiftDays(6, 17, 0),
      kind: 'fee',
      origin: 'ERP',
      amountInr: 4250,
      notes: 'Pay via ERP Fee Portal before late penalty of ₹500 applies.',
    },
    {
      id: 'erp-dl-5',
      title: 'CAE II Examination — Computer Networks',
      courseCode: 'SCSA1601',
      courseName: 'Computer Networks',
      dueAt: shiftDays(8, 9, 0),
      kind: 'exam',
      origin: 'ERP',
      notes: 'Units III & IV (Routing Algorithms, OSPF, BGP, TCP Flow Control).',
    },
    {
      id: 'lms-dl-6',
      title: 'Kubernetes Deployment Manifest & Autoscaling Report',
      courseCode: 'SCSA1604',
      courseName: 'Cloud Computing Architecture',
      dueAt: shiftDays(11, 23, 59),
      kind: 'assignment',
      origin: 'LMS',
      notes: 'Team submission (max 2 students) via Moodle Assignment dropbox.',
    },
    {
      id: 'erp-dl-7',
      title: 'Hostel Mess Advance — Term II',
      dueAt: shiftDays(15, 17, 0),
      kind: 'fee',
      origin: 'ERP',
      amountInr: 18500,
      notes: 'Optional for day scholars; verify ledger on ERP Finance tab.',
    },
  ];

  return deduplicateDeadlines(raw);
}

export function buildMockNotifications(): NotificationItem[] {
  return [
    {
      id: 'notif-1',
      title: 'CAE II Timetable & Seating Arrangement Published',
      summary: 'Continuous Assessment Exam II begins next week. Check hall allocation before 8:45 AM.',
      body: 'The Office of the Controller of Examinations has released the finalized CAE II schedule for Semester VI B.E./B.Tech programmes. Students must carry their institute ID card and verify attendance eligibility (minimum 75%) prior to hall ticket generation.',
      publishedAt: shiftDays(0, 8, 30),
      origin: 'ERP',
      category: 'Exam',
      unread: true,
    },
    {
      id: 'notif-2',
      title: 'SCSA1601: Updated Wireshark Capture Dataset Uploaded',
      summary: 'Dr. S. Priya Dharshini posted a revised sample trace file for Lab Exercise 6.',
      body: 'Please download the revised tcp-reno-loss.pcapng dataset from Week 8 on Moodle if your earlier capture had truncated acknowledgements. Submission deadline remains tomorrow at 11:59 PM.',
      publishedAt: shiftDays(0, 7, 15),
      origin: 'LMS',
      category: 'Course',
      unread: true,
      courseCode: 'SCSA1601',
    },
    {
      id: 'notif-3',
      title: 'Exam Registration Fee Window Closing in 6 Days',
      summary: 'Regular exam fee window for May 2026 end-semester exams closes without late fee next week.',
      body: 'All eligible students are instructed to complete their end-semester examination registration on the ERP Fee Portal before 5:00 PM on the due date. Receipts are generated automatically within 15 minutes of UPI/NetBanking confirmation.',
      publishedAt: shiftDays(-1, 16, 40),
      origin: 'ERP',
      category: 'Fee',
      unread: true,
    },
    {
      id: 'notif-4',
      title: 'SCSA1603: Extra Doubt-Clearing Session on Ensemble Methods',
      summary: 'Dr. M. Vigneshwaran scheduled an optional review session in CS-301.',
      body: 'We will walk through XGBoost regularization parameters, feature importance interpretation, and common pitfalls in the upcoming notebook evaluation. Slides are already attached under Module 4 in Moodle.',
      publishedAt: shiftDays(-2, 11, 20),
      origin: 'LMS',
      category: 'Course',
      unread: false,
      courseCode: 'SCSA1603',
    },
    {
      id: 'notif-5',
      title: 'Circular: Attendance Condonation Policy Reminder',
      summary: 'Minimum 75% attendance per course is mandatory; medical condonation requires HOD endorsement.',
      body: 'Students with attendance between 65% and 74.9% due to documented medical reasons must submit supporting hospital records to their faculty advisor before the last working day. Below 65% is not eligible for condonation.',
      publishedAt: shiftDays(-3, 14, 0),
      origin: 'ERP',
      category: 'Circular',
      unread: false,
    },
    {
      id: 'notif-6',
      title: 'SCSA1602: Compiler Design Quiz 2 Grades Released',
      summary: 'Scores and worked LR(1) parsing tables are now visible in your Moodle gradebook.',
      body: 'Quiz 2 scripts have been graded. Review the canonical collection of LR(1) items walkthrough before CAE II. Reach out during Tuesday tutorial hours for re-evaluation requests.',
      publishedAt: shiftDays(-4, 18, 10),
      origin: 'LMS',
      category: 'Academic',
      unread: false,
      courseCode: 'SCSA1602',
    },
  ];
}
