import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveUpstreamError } from '../core/liveParsers';
import {
  exchangeErpCredentialsForToken,
  exchangeMoodleCredentialsForToken,
  fetchLiveAttendance,
  fetchLiveDeadlines,
  fetchLiveNotifications,
  fetchLiveProfile,
  fetchLiveResults,
  fetchLiveTimetable,
  getLiveAdapterConfig,
  probeUpstreamReachability,
  verifyErpToken,
  verifyMoodleToken,
} from './liveAdapters';
import type { StoredSession } from './session';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('exchangeMoodleCredentialsForToken posts credentials in form body and returns verified token', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse({ token: 'moodle_exchanged_token_987654' });
  };

  const token = await exchangeMoodleCredentialsForToken('42110482', 'my-secret-pass', {
    fetchImpl: mockFetch,
    env: { LMS_BASE_URL: 'https://sathyabama.cognibot.in' },
  });

  assert.equal(token, 'moodle_exchanged_token_987654');
  assert.equal(capturedUrl, 'https://sathyabama.cognibot.in/login/token.php');
  assert.equal(capturedUrl.includes('my-secret-pass'), false);
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.redirect, 'error');
  assert.match(String(capturedInit?.body), /service=moodle_mobile_app/);

  await assert.rejects(
    () =>
      exchangeMoodleCredentialsForToken('42110482', 'wrong', {
        fetchImpl: async () => jsonResponse({ error: 'Invalid login, please try again', errorcode: 'invalidlogin' }),
        env: { LMS_BASE_URL: 'https://sathyabama.cognibot.in' },
      }),
    (err: unknown) => err instanceof LiveUpstreamError && err.status === 401 && err.field === 'lmsPassword'
  );
});

test('exchangeErpCredentialsForToken posts JSON credentials and extracts Sathyabama ERP accessToken', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse({
      status: 1,
      responseData: {
        login: {
          accessToken: 'eyJhbGciOiJIUzI1NiJ9.erp_auto_token',
          StudentName: 'Kavya Nair',
        },
      },
    });
  };

  const result = await exchangeErpCredentialsForToken('42110482', 'erp-secret-pass', {
    fetchImpl: mockFetch,
    env: { ERP_BASE_URL: 'https://erp.sathyabama.ac.in' },
  });

  assert.equal(result.token, 'eyJhbGciOiJIUzI1NiJ9.erp_auto_token');
  assert.equal(result.studentName, 'Kavya Nair');
  assert.equal(capturedUrl, 'https://erp.sathyabama.ac.in/erp/api/v1.0/MasterStudent/login_sec');
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.redirect, 'error');
  const sentBody = JSON.parse(String(capturedInit?.body));
  assert.equal(sentBody.RegisterNumber, '42110482');
  assert.equal(sentBody.Password, 'erp-secret-pass');
  assert.equal(typeof sentBody.CapchaKey, 'string');
  assert.equal(sentBody.CapchaKey.length, 48);

  await assert.rejects(
    () =>
      exchangeErpCredentialsForToken('42110482', 'wrong', {
        fetchImpl: async () =>
          jsonResponse(
            {
              success: false,
              message: 'Warning: This is not an official ERP portal.',
            },
            403
          ),
        env: { ERP_BASE_URL: 'https://erp.sathyabama.ac.in' },
      }),
    (err: unknown) =>
      err instanceof LiveUpstreamError &&
      err.status === 403 &&
      err.code === 'erp_browser_login_required' &&
      err.field === 'erpPassword' &&
      /Sign in directly on erp\.sathyabama\.ac\.in/i.test(err.message)
  );
});

test('verifyMoodleToken posts wstoken in form body (never query string) with redirect error policy', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse({
      userid: 901,
      username: '42110482@sathyabama.ac.in',
      fullname: 'Kavya Nair',
      sitename: 'Sathyabama LMS',
    });
  };

  const info = await verifyMoodleToken('secret_moodle_token_1234', {
    fetchImpl: mockFetch,
    env: { LMS_BASE_URL: 'https://sathyabama.cognibot.in' },
  });

  assert.equal(info.userid, 901);
  assert.equal(info.fullname, 'Kavya Nair');
  assert.equal(capturedUrl, 'https://sathyabama.cognibot.in/webservice/rest/server.php');
  assert.equal(capturedUrl.includes('secret_moodle_token_1234'), false);
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.redirect, 'error');
  assert.match(String(capturedInit?.body), /wstoken=secret_moodle_token_1234/);
});

test('verifyErpToken sends Bearer header for tokens and Cookie header for session cookies', async () => {
  const seenHeaders: Record<string, string>[] = [];

  const mockFetch: typeof fetch = async (_input, init) => {
    seenHeaders.push((init?.headers ?? {}) as Record<string, string>);
    return jsonResponse({
      status: 1,
      responseData: {
        StudentInfo: [
          {
            StudentId: 7742,
            RegisterNumber: '42110482',
            StudentName: 'Kavya Nair',
            Semester: 6,
          },
        ],
      },
    });
  };

  const jwtPayload = Buffer.from(JSON.stringify({ StudentId: 7742 })).toString('base64url');
  const sampleJwt = `eyJhbGciOiJIUzI1NiJ9.${jwtPayload}.sig`;
  const env = { ERP_BASE_URL: 'https://erp.sathyabama.ac.in' };

  const prof1 = await verifyErpToken(sampleJwt, '42110482', undefined, false, {
    fetchImpl: mockFetch,
    env,
  });
  await verifyErpToken('PHPSESSID=abc123456789', '42110482', undefined, false, {
    fetchImpl: mockFetch,
    env: { ...env, ERP_PROFILE_PATH: '/api/student/profile' },
  });

  assert.equal(prof1.erpStudentId, '7742');
  assert.equal(prof1.name, 'Kavya Nair');
  assert.equal(seenHeaders[0].Authorization, `Bearer ${sampleJwt}`);
  assert.equal(seenHeaders[0].Token, sampleJwt);
  assert.equal(seenHeaders[0].Cookie, undefined);
  assert.equal(seenHeaders[1].Cookie, 'PHPSESSID=abc123456789');
  assert.equal(seenHeaders[1].Authorization, undefined);
  assert.equal(seenHeaders[1].Token, undefined);
});

test('Sathyabama ERP v1.0 POST sync parses profile, attendance, timetable, results, calendar, and notifications', async () => {
  const jwtPayload = Buffer.from(JSON.stringify({ StudentId: 8821 })).toString('base64url');
  const session: StoredSession = {
    registerNumber: '42110482',
    name: 'Kavya Nair',
    mode: 'live',
    erpToken: `eyJhbGciOiJIUzI1NiJ9.${jwtPayload}.sig`,
    erpStudentId: '8821',
    exp: Date.now() + 60_000,
  };

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.equal(init?.method, 'POST');
    if (url.endsWith('/erp/api/v1.0/MasterStudent/view')) {
      return jsonResponse({
        status: 1,
        responseData: {
          StudentInfo: [
            {
              StudentId: 8821,
              RegisterNumber: '42110482',
              StudentName: 'Kavya Nair',
              DegreeName: 'B.E.',
              ProgrammeName: 'Computer Science and Engineering',
              Semester: 6,
              YearofStudy: 3,
              Batch: '2022-2026',
              Section: 'A',
              DegreeId: 1,
              CourseId: 2,
              ProgrammeId: 3,
            },
          ],
        },
      });
    }
    if (url.endsWith('/erp/api/v1.0/StudentAttendanceHourly/getStudentAcademicHourwise')) {
      const sentBody = JSON.parse(String(init?.body ?? '{}'));
      assert.match(String(sentBody.ToDate ?? ''), /^\d{4}-\d{2}-\d{2}$/);
      return jsonResponse({
        status: 1,
        responseData: [
          {
            SubjectCode: 'SCS1302',
            SubjectName: 'Computer Networks',
            TotalHours: 40,
            TotalPresent: 34,
            TotalAbsent: 6,
            Percentage: '85.00',
            UpdatedDate: '2099-12-31T00:00:00.000Z',
          },
        ],
      });
    }
    if (url.endsWith('/erp/api/v1.0/TimetableDetails/getProgrammeSectionAndTimeSetbyCourse')) {
      return jsonResponse({
        status: 1,
        responseData: [{ TimeTableId: 55, ProgrammeSectionId: 14 }],
      });
    }
    if (url.endsWith('/erp/api/v1.0/TimetableDetails/getdatabyprogramme')) {
      return jsonResponse({
        status: 1,
        responseData: [
          {
            DayId: 1,
            TimeFrom: '09:00:00',
            TimeTo: '10:00:00',
            SubjectCode: 'SCS1302',
            SubjectName: 'Computer Networks',
            HourType: 'Lecture',
          },
        ],
      });
    }
    if (url.endsWith('/erp/api/v1.0/MasterStudent/studentSemesterListByRegNo')) {
      return jsonResponse({
        status: 1,
        responseData: [{ AcademicMonthId: 11, AcademicYear: '2025-2026', Semester: 5 }],
      });
    }
    if (url.endsWith('/erp/api/v1.0/ResultMark/studentResult')) {
      return jsonResponse({
        status: 1,
        responseData: {
          SemResult: [
            {
              SubjectCode: 'SCS1201',
              SubjectName: 'Operating Systems',
              Semester: 5,
              InternalMark: 44,
              ExternalMark: 48,
              TotalMark: 92,
              Result: 'Pass',
              Credit: 4,
            },
          ],
        },
      });
    }
    if (url.endsWith('/erp/api/v1.0/CAEResult/studentCAEResult')) {
      return jsonResponse({
        status: 1,
        responseData: {
          CAEResult: [
            {
              SubjectCode: 'SCS1302',
              SubjectName: '<b>Computer Networks</b>',
              Credit: 4,
              CAE1: 45,
              CAE2: 43,
              AssignmentMark: 9,
              Remarks: '<script>alert(1)</script>Consistent performance',
            },
          ],
        },
      });
    }
    if (url.endsWith('/erp/api/v1.0/EventCalendar/listStudent')) {
      return jsonResponse({
        status: 1,
        responseData: [
          { EventCalendarId: 99, EventDescription: 'CAE 2 Examination Starts', EventDate: '28/11/2026' },
        ],
      });
    }
    if (url.endsWith('/erp/api/v1.0/Notifications/student')) {
      return jsonResponse({
        status: 1,
        responseData: {
          count: 1,
          data: [
            {
              NotificationId: 401,
              Notification: '<p>Semester VI hall tickets are now available.</p>',
              Date: '25/11/2026',
              Time: '10:30 AM',
            },
          ],
        },
      });
    }
    return jsonResponse({}, 404);
  };

  const deps = { fetchImpl: mockFetch, env: { ERP_BASE_URL: 'https://erp.sathyabama.ac.in' } };
  const [profile, attendance, timetable, results, deadlines, notifications] = await Promise.all([
    fetchLiveProfile(session, deps),
    fetchLiveAttendance(session, deps),
    fetchLiveTimetable(session, deps),
    fetchLiveResults(session, deps),
    fetchLiveDeadlines(session, deps),
    fetchLiveNotifications(session, deps),
  ]);

  assert.equal(profile.name, 'Kavya Nair');
  assert.equal(profile.semester, 6);
  assert.equal(attendance.length, 1);
  assert.equal(attendance[0].courseCode, 'SCS1302');
  assert.equal(attendance[0].attended, 34);
  assert.equal(attendance[0].total, 40);
  assert.ok(Date.parse(attendance[0].lastUpdated) <= Date.now() + 1000);
  assert.equal(timetable.length, 1);
  assert.equal(timetable[0].day, 'Mon');
  assert.equal(timetable[0].startTime, '09:00');
  assert.equal(results.semesters.length, 1);
  assert.equal(results.semesters[0].courses[0].grade, 'O');
  assert.equal(results.caeMarks?.length, 1);
  assert.equal(results.caeMarks?.[0].courseCode, 'SCS1302');
  assert.equal(results.caeMarks?.[0].courseName, 'Computer Networks');
  assert.equal(results.caeMarks?.[0].cae1, 45);
  assert.equal(results.caeMarks?.[0].cae2, 43);
  assert.equal(results.caeMarks?.[0].internalTotal, 44.2);
  assert.equal(results.caeMarks?.[0].standing, 'strong');
  assert.equal(results.caeMarks?.[0].remarks, 'Consistent performance');
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].kind, 'exam');
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].title, /hall tickets/i);
});

test('LMS-only live session fetches Moodle profile, deadlines, and notifications while ERP sections fail cleanly', async () => {
  const session: StoredSession = {
    registerNumber: '42110482',
    name: 'Kavya Nair',
    mode: 'live',
    lmsToken: 'moodle_valid_token_999',
    lmsUserId: 901,
    exp: Date.now() + 60_000,
  };

  const futureSec = Math.floor(Date.now() / 1000) + 5 * 86400;

  const mockFetch: typeof fetch = async (_input, init) => {
    const params = new URLSearchParams(String(init?.body ?? ''));
    const fn = params.get('wsfunction');
    if (fn === 'core_webservice_get_site_info') {
      return jsonResponse({ userid: 901, username: '42110482', fullname: 'Kavya Nair', sitename: 'Sathyabama LMS' });
    }
    if (fn === 'core_enrol_get_users_courses') {
      return jsonResponse([{ id: 12, shortname: 'SCS1302', fullname: 'Computer Networks' }]);
    }
    if (fn === 'core_calendar_get_action_events_by_timesort') {
      // Simulate restricted Moodle function — must NOT abort fallback to mod_assign_get_assignments!
      return jsonResponse({ exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Access control exception' });
    }
    if (fn === 'core_calendar_get_calendar_upcoming_view') {
      return jsonResponse({ events: [] });
    }
    if (fn === 'mod_assign_get_assignments') {
      return jsonResponse({
        courses: [
          {
            id: 12,
            shortname: 'SCS1302',
            fullname: 'Computer Networks',
            assignments: [{ id: 44, name: 'Lab 4 Submission', duedate: futureSec, intro: '<p>Upload packet capture</p>' }],
          },
        ],
      });
    }
    if (fn === 'mod_quiz_get_quizzes_by_courses') {
      return jsonResponse({ quizzes: [] });
    }
    if (fn === 'message_popup_get_popup_notifications') {
      return jsonResponse({ exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Not enabled' });
    }
    if (fn === 'core_message_get_messages') {
      return jsonResponse({ messages: [] });
    }
    if (fn === 'mod_forum_get_forums_by_courses') {
      return jsonResponse([{ id: 77, course: 12, type: 'news', name: 'Announcements' }]);
    }
    if (fn === 'mod_forum_get_forum_discussions') {
      return jsonResponse({
        discussions: [
          { id: 88, name: 'Unit 3 Quiz Schedule', message: '<p>Quiz opens Friday 10 AM</p>', timemodified: futureSec - 3600 },
        ],
      });
    }
    return jsonResponse({}, 404);
  };

  const deps = { fetchImpl: mockFetch, env: { LMS_BASE_URL: 'https://sathyabama.cognibot.in' } };
  const profile = await fetchLiveProfile(session, deps);
  assert.equal(profile.lmsConnected, true);
  assert.equal(profile.erpConnected, false);

  const deadlines = await fetchLiveDeadlines(session, deps);
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].courseCode, 'SCS1302');
  assert.equal(deadlines[0].title, 'Lab 4 Submission');

  const notices = await fetchLiveNotifications(session, deps);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].origin, 'LMS');
  assert.equal(notices[0].courseCode, 'SCS1302');

  await assert.rejects(
    () => fetchLiveAttendance(session, deps),
    (err: unknown) => err instanceof LiveUpstreamError && err.status === 503
  );
});

test('getLiveAdapterConfig defaults to Sathyabama ERP & LMS, flags invalid URLs, and probes reachability', async () => {
  const defaultCfg = getLiveAdapterConfig({});
  assert.equal(defaultCfg.erpBaseUrl, 'https://erp.sathyabama.ac.in');
  assert.equal(defaultCfg.lmsBaseUrl, 'https://sathyabama.cognibot.in');
  assert.equal(defaultCfg.erpPaths.profile, '/erp/api/v1.0/MasterStudent/view');
  assert.equal(defaultCfg.erpPaths.attendance, '/erp/api/v1.0/StudentAttendanceHourly/getStudentAcademicHourwise');

  const badCfg = getLiveAdapterConfig({ ERP_BASE_URL: 'http://127.0.0.1:8080' });
  assert.equal(badCfg.erpBaseUrl, null);
  assert.ok(badCfg.erpConfigError);

  const probe = await probeUpstreamReachability('https://sathyabama.cognibot.in', '/login/index.php', {
    fetchImpl: async () => new Response(null, { status: 200 }),
  });
  assert.equal(probe.reachable, true);
  assert.equal(probe.statusCode, 200);
});

test('exchangeErpCredentialsForToken routes staff role to staff login endpoint and includes role-specific fields', async () => {
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? '{}'));
    return jsonResponse({
      status: 1,
      responseData: {
        login: {
          accessToken: 'eyJhbGciOiJIUzI1NiJ9.staff_token_999',
          name: 'Dr. R. Meenakshi',
        },
      },
    });
  };

  const res = await exchangeErpCredentialsForToken('STF1042', 'staff-pass', {
    role: 'staff',
    fetchImpl: mockFetch,
    env: { ERP_BASE_URL: 'https://erp.sathyabama.ac.in' },
  });

  assert.equal(res.role, 'staff');
  assert.equal(res.token, 'eyJhbGciOiJIUzI1NiJ9.staff_token_999');
  assert.equal(capturedUrl, 'https://erp.sathyabama.ac.in/erp/api/v1.0/MasterStaff/login_sec');
  assert.equal(capturedBody.StaffNumber, 'STF1042');
  assert.equal(capturedBody.EmployeeCode, 'STF1042');
  assert.equal(capturedBody.UserType, 'Staff');
});

test('fetchLiveAttendance forwards custom endDate as ToDate and EndDate to College ERP', async () => {
  let sentBody: Record<string, unknown> = {};
  const session: StoredSession = {
    registerNumber: '42110482',
    name: 'Kavya Nair',
    mode: 'live',
    erpRole: 'student',
    erpToken: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
    erpStudentId: '8821',
    exp: Date.now() + 60_000,
  };

  const mockFetch: typeof fetch = async (_input, init) => {
    sentBody = JSON.parse(String(init?.body ?? '{}'));
    return jsonResponse({
      status: 1,
      responseData: [
        {
          SubjectCode: 'SCSA1601',
          SubjectName: 'Computer Networks',
          TotalHours: 32,
          TotalPresent: 28,
          UpdatedDate: '2026-11-10',
        },
      ],
    });
  };

  const subjects = await fetchLiveAttendance(session, {
    endDate: '2026-11-10',
    fetchImpl: mockFetch,
    env: { ERP_BASE_URL: 'https://erp.sathyabama.ac.in' },
  });

  assert.equal(sentBody.ToDate, '2026-11-10');
  assert.equal(sentBody.EndDate, '2026-11-10');
  assert.equal(subjects.length, 1);
  assert.ok(subjects[0].lastUpdated.startsWith('2026-11-10'));
});
