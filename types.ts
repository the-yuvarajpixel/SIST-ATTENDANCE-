export type DataSourceMode = 'mock' | 'live';

export type NavSection =
  | 'overview'
  | 'attendance'
  | 'timetable'
  | 'results'
  | 'deadlines'
  | 'notifications'
  | 'setup';

export interface StudentProfile {
  registerNumber: string;
  name: string;
  program: string;
  department: string;
  semester: number;
  batch: string;
  section: string;
  email: string;
  advisor: string;
  erpConnected: boolean;
  lmsConnected: boolean;
}

export interface AttendanceSubject {
  courseCode: string;
  courseName: string;
  faculty: string;
  credits: number;
  attended: number;
  total: number;
  lastUpdated: string;
}

export type AttendanceStatus = 'safe' | 'borderline' | 'shortage';

export interface AttendanceStats {
  percentage: number;
  canSkip: number;
  mustAttend: number;
  status: AttendanceStatus;
  verdict: string;
}

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';

export interface TimetableSlot {
  id: string;
  day: Weekday;
  startTime: string; // HH:MM (24h)
  endTime: string;   // HH:MM (24h)
  courseCode: string;
  courseName: string;
  room: string;
  faculty: string;
  kind: 'Lecture' | 'Lab' | 'Tutorial';
}

export interface NextClassSummary {
  slot: TimetableSlot;
  dayLabel: string; // e.g. "Today", "Tomorrow, Mon", "Mon"
  startsInLabel: string; // e.g. "in 35 min", "Mon 09:00"
  attendancePercent: number | null;
  verdict: string | null;
  status: AttendanceStatus | null;
  headline: string;
}

export type GradeLetter = 'O' | 'A+' | 'A' | 'B+' | 'B' | 'C' | 'RA';

export interface CourseGrade {
  courseCode: string;
  courseName: string;
  credits: number;
  grade: GradeLetter;
  gradePoints: number;
}

export interface SemesterResult {
  semester: number;
  termLabel: string;
  sgpa: number;
  credits: number;
  courses: CourseGrade[];
}

export interface PlannedCourse {
  courseCode: string;
  courseName: string;
  credits: number;
  expectedGrade: GradeLetter;
}

export interface ResultsPayload {
  semesters: SemesterResult[];
  currentSemester: number;
  currentCourses: PlannedCourse[];
}

export type DeadlineKind = 'assignment' | 'exam' | 'fee';
export type DataOrigin = 'ERP' | 'LMS' | 'ERP + LMS';

export interface DeadlineItem {
  id: string;
  title: string;
  courseCode?: string;
  courseName?: string;
  dueAt: string; // ISO string
  kind: DeadlineKind;
  origin: DataOrigin;
  amountInr?: number;
  notes?: string;
  mergedCount?: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  summary: string;
  body: string;
  publishedAt: string; // ISO string
  origin: 'ERP' | 'LMS';
  category: 'Circular' | 'Exam' | 'Course' | 'Fee' | 'Academic';
  unread: boolean;
  courseCode?: string;
}

export interface SectionEnvelope<T> {
  data: T;
  stale: boolean;
  fetchedAt: string;
  source: DataOrigin;
  mode: DataSourceMode;
  warning?: string;
}

export interface HealthCheckItem {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  summary: string;
  action?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  mode: DataSourceMode;
  checkedAt: string;
  deep: boolean;
  erpOutageSimulated: boolean;
  checks: HealthCheckItem[];
}

export interface SessionUser {
  registerNumber: string;
  name: string;
  mode: DataSourceMode;
  erpTokenPresent: boolean;
  lmsTokenPresent: boolean;
  expiresAt: string;
}
