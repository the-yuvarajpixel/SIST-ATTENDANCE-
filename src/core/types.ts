export type DataSourceMode = 'mock' | 'live';
export type ErpUserRole = 'student' | 'staff' | 'new-admission' | 'parent';

export type NavSection =
  | 'overview'
  | 'attendance'
  | 'timetable'
  | 'marks'
  | 'results'
  | 'deadlines'
  | 'notifications'
  | 'sync'
  | 'live-guide'
  | 'setup';

export interface StudentProfile {
  registerNumber: string;
  erpRole?: ErpUserRole;
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

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

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

export type CaeStanding = 'strong' | 'on-track' | 'needs-improvement' | 'pending';

export interface SubjectCaeMark {
  courseCode: string;
  courseName: string;
  credits: number;
  cae1: number | null;
  cae1Max: number;
  cae2: number | null;
  cae2Max: number;
  internalBonus: number | null;
  internalBonusMax: number;
  internalTotal: number;
  internalMax: number;
  standing: CaeStanding;
  remarks?: string;
  classAvgCae1?: number | null;
  classAvgCae2?: number | null;
  classAvgBonus?: number | null;
  classAvgInternal?: number | null;
  classTopInternal?: number | null;
}

export interface CaeTermTrendPoint {
  semester: number;
  termLabel: string;
  cae1Avg: number;
  cae2Avg: number | null;
  internalAvg: number;
  internalMax: number;
  subjectCount: number;
  isCurrent?: boolean;
}

export interface ErpCaeDirectSyncStatus {
  direction: 'pull' | 'push';
  attempted: boolean;
  synced: boolean;
  host: string;
  syncedAt: string;
  subjectCount: number;
  message: string;
}

export interface ResultsPayload {
  semesters: SemesterResult[];
  currentSemester: number;
  currentCourses: PlannedCourse[];
  caeMarks?: SubjectCaeMark[];
  caeHistory?: CaeTermTrendPoint[];
  caeMarksUploaded?: boolean;
  caeErpSync?: ErpCaeDirectSyncStatus;
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

export interface LiveAdaptersSummary {
  erpConfigured: boolean;
  lmsConfigured: boolean;
  erpHost: string | null;
  lmsHost: string | null;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  mode: DataSourceMode;
  checkedAt: string;
  deep: boolean;
  erpOutageSimulated: boolean;
  checks: HealthCheckItem[];
  liveAdapters?: LiveAdaptersSummary;
}

export interface SessionUser {
  registerNumber: string;
  name: string;
  mode: DataSourceMode;
  erpRole?: ErpUserRole;
  erpTokenPresent: boolean;
  lmsTokenPresent: boolean;
  expiresAt: string;
}

export interface PortalSyncTargetStatus {
  connected: boolean;
  host: string;
  status: 'synced' | 'disconnected' | 'error';
  message: string;
  latencyMs: number;
}

export interface PortalSyncSectionResult {
  section: 'profile' | 'attendance' | 'timetable' | 'results' | 'deadlines' | 'notifications';
  label: string;
  source: DataOrigin;
  status: 'synced' | 'stale' | 'error';
  itemCount: number;
  fetchedAt: string | null;
  message: string;
}

export interface PortalSyncReport {
  syncedAt: string;
  mode: DataSourceMode;
  moodle: PortalSyncTargetStatus;
  erp: PortalSyncTargetStatus;
  sections: PortalSyncSectionResult[];
}
