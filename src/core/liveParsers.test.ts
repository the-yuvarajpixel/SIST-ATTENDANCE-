import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LiveUpstreamError,
  buildProfileFromMoodle,
  parseErpAttendance,
  parseErpDeadlines,
  parseErpNotifications,
  parseErpProfile,
  parseErpResults,
  parseErpTimetable,
  parseMoodleDeadlines,
  parseMoodleNotifications,
  parseMoodleSiteInfo,
  stripHtmlToText,
  validateRelativePath,
  validateUpstreamBaseUrl,
} from './liveParsers';

test('validateUpstreamBaseUrl allows public HTTPS URLs and normalizes trailing slashes', () => {
  assert.equal(
    validateUpstreamBaseUrl('https://sathyabama.cognibot.in///'),
    'https://sathyabama.cognibot.in'
  );
  assert.equal(
    validateUpstreamBaseUrl('https://erp.sathyabama.ac.in/portal/'),
    'https://erp.sathyabama.ac.in/portal'
  );
  assert.equal(
    validateUpstreamBaseUrl('https://erp.sathyabama.ac.in/account/login'),
    'https://erp.sathyabama.ac.in'
  );
  assert.equal(
    validateUpstreamBaseUrl('https://sathyabama.cognibot.in/login/index.php'),
    'https://sathyabama.cognibot.in'
  );
});

test('validateUpstreamBaseUrl blocks insecure schemes, credentials, loopback, private, and metadata hosts', () => {
  const blocked = [
    'http://sathyabama.cognibot.in',
    'javascript:alert(1)',
    'https://user:pass@erp.sathyabama.ac.in',
    'https://localhost/api',
    'https://127.0.0.1/api',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/erp',
    'https://172.16.4.2/erp',
    'https://192.168.1.10/erp',
    'https://[::1]/erp',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://service.local/api',
  ];
  for (const url of blocked) {
    assert.throws(() => validateUpstreamBaseUrl(url), `Expected "${url}" to be rejected`);
  }
});

test('validateRelativePath rejects traversal and protocol-relative paths', () => {
  assert.equal(validateRelativePath('/api/student/profile', '/fallback'), '/api/student/profile');
  assert.equal(validateRelativePath('', '/fallback'), '/fallback');
  assert.throws(() => validateRelativePath('//evil.example/x', '/fallback'));
  assert.throws(() => validateRelativePath('/api/../secret', '/fallback'));
  assert.throws(() => validateRelativePath('https://evil.example', '/fallback'));
});

test('stripHtmlToText removes script/style blocks, strips tags, and decodes entities', () => {
  const html =
    '<p>Hello <b>Arjun</b> &amp; team!</p><script>alert("xss")</script><br/>Due &lt;tomorrow&gt;';
  assert.equal(stripHtmlToText(html), 'Hello Arjun & team! Due <tomorrow>');
});

test('parseMoodleSiteInfo parses valid Moodle responses and rejects invalidtoken errors', () => {
  const info = parseMoodleSiteInfo({
    userid: 4211,
    username: '42110482@sathyabama.ac.in',
    fullname: 'Arjun Subramanian',
    sitename: 'Sathyabama LMS',
  });
  assert.equal(info.userid, 4211);
  assert.equal(info.fullname, 'Arjun Subramanian');

  const profile = buildProfileFromMoodle(info, '42110482');
  assert.equal(profile.lmsConnected, true);
  assert.equal(profile.erpConnected, false);
  assert.equal(profile.email, '42110482@sathyabama.ac.in');

  assert.throws(
    () =>
      parseMoodleSiteInfo({
        exception: 'moodle_exception',
        errorcode: 'invalidtoken',
        message: 'Invalid token - token not found',
      }),
    (err: unknown) => err instanceof LiveUpstreamError && err.status === 401 && err.field === 'lmsToken'
  );
});

test('parseMoodleDeadlines and parseMoodleNotifications sanitize HTML and map timestamps', () => {
  const courseMap = new Map([[7, { id: 7, shortname: 'SCS1302', fullname: 'Computer Networks' }]]);
  const deadlines = parseMoodleDeadlines(
    {
      events: [
        {
          id: 99,
          name: 'CN Lab Quiz 2',
          modulename: 'quiz',
          courseid: 7,
          timesort: 1795500000,
          description: '<p>Covers <strong>TCP</strong> congestion control</p>',
        },
      ],
    },
    courseMap
  );
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].kind, 'exam');
  assert.equal(deadlines[0].courseCode, 'SCS1302');
  assert.equal(deadlines[0].notes, 'Covers TCP congestion control');

  const notifications = parseMoodleNotifications({
    notifications: [
      {
        id: 501,
        subject: 'Exam Timetable Released',
        fullmessagehtml: '<div>Check <em>CAT-2</em> seating chart</div>',
        timecreated: 1795400000,
        read: false,
      },
    ],
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].category, 'Exam');
  assert.equal(notifications[0].unread, true);
  assert.equal(notifications[0].body, 'Check CAT-2 seating chart');
});

test('ERP parsers normalize flexible ERP payload shapes into schema-valid models', () => {
  const profile = parseErpProfile(
    {
      data: {
        regNo: '42110482',
        fullName: 'Priya Raman',
        degree: 'B.E. CSE',
        dept: 'Computer Science',
        sem: '6',
        sec: 'B',
      },
    },
    '42110482',
    undefined,
    true
  );
  assert.equal(profile.name, 'Priya Raman');
  assert.equal(profile.semester, 6);
  assert.equal(profile.erpConnected, true);
  assert.equal(profile.lmsConnected, true);

  const attendance = parseErpAttendance({
    subjects: [
      { code: 'SCS1302', subject: 'Computer Networks', staff: 'Dr. Kumar', present: 28, conducted: 32, credit: 4 },
    ],
  });
  assert.equal(attendance[0].attended, 28);
  assert.equal(attendance[0].total, 32);

  const timetable = parseErpTimetable({
    schedule: [
      { weekday: 'Monday', from: '9:00', to: '9:50', code: 'SCS1302', subject: 'Computer Networks', venue: 'Block 2', type: 'Practical' },
    ],
  });
  assert.equal(timetable[0].day, 'Mon');
  assert.equal(timetable[0].startTime, '09:00');
  assert.equal(timetable[0].kind, 'Lab');

  const results = parseErpResults({
    semesters: [
      {
        sem: 1,
        courses: [
          { code: 'SMA1101', name: 'Engineering Math', credits: 4, grade: 'O' },
          { code: 'SCS1101', name: 'Programming in C', credits: 3, grade: 'A+' },
        ],
      },
    ],
    enrolledCourses: [{ code: 'SCS1302', name: 'Computer Networks', credits: 4, grade: 'A' }],
  });
  assert.equal(results.semesters[0].credits, 7);
  assert.equal(results.currentSemester, 2);

  const deadlines = parseErpDeadlines({
    items: [{ title: 'Semester Fee', kind: 'fee', dueDate: '2026-12-01T12:00:00Z', amount: 45000 }],
  });
  assert.equal(deadlines[0].amountInr, 45000);

  const notices = parseErpNotifications({
    circulars: [{ heading: 'Holiday Circular', content: '<p>Campus closed Friday</p>', date: '2026-11-24T08:00:00Z' }],
  });
  assert.equal(notices[0].body, 'Campus closed Friday');
  assert.equal(notices[0].category, 'Circular');
});
