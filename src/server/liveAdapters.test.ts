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
      registerNumber: '42110482',
      name: 'Kavya Nair',
      semester: 6,
    });
  };

  const env = { ERP_BASE_URL: 'https://erp.sathyabama.ac.in' };
  await verifyErpToken('eyJhbGciOiJIUzI1NiJ9.token', '42110482', undefined, false, {
    fetchImpl: mockFetch,
    env,
  });
  await verifyErpToken('PHPSESSID=abc123456789', '42110482', undefined, false, {
    fetchImpl: mockFetch,
    env,
  });

  assert.equal(seenHeaders[0].Authorization, 'Bearer eyJhbGciOiJIUzI1NiJ9.token');
  assert.equal(seenHeaders[0].Token, 'eyJhbGciOiJIUzI1NiJ9.token');
  assert.equal(seenHeaders[0].Cookie, undefined);
  assert.equal(seenHeaders[1].Cookie, 'PHPSESSID=abc123456789');
  assert.equal(seenHeaders[1].Authorization, undefined);
  assert.equal(seenHeaders[1].Token, undefined);
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
      return jsonResponse({
        events: [{ id: 1, name: 'Lab 4 Submission', modulename: 'assign', courseid: 12, timesort: 1796000000 }],
      });
    }
    if (fn === 'message_popup_get_popup_notifications') {
      return jsonResponse({
        notifications: [{ id: 10, subject: 'Quiz open', fullmessage: 'Unit 3 quiz is live', timecreated: 1795400000, read: false }],
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

  const notices = await fetchLiveNotifications(session, deps);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].origin, 'LMS');

  await assert.rejects(
    () => fetchLiveAttendance(session, deps),
    (err: unknown) => err instanceof LiveUpstreamError && err.status === 503
  );
});

test('getLiveAdapterConfig defaults to Sathyabama ERP & LMS, flags invalid URLs, and probes reachability', async () => {
  const defaultCfg = getLiveAdapterConfig({});
  assert.equal(defaultCfg.erpBaseUrl, 'https://erp.sathyabama.ac.in');
  assert.equal(defaultCfg.lmsBaseUrl, 'https://sathyabama.cognibot.in');

  const badCfg = getLiveAdapterConfig({ ERP_BASE_URL: 'http://127.0.0.1:8080' });
  assert.equal(badCfg.erpBaseUrl, null);
  assert.ok(badCfg.erpConfigError);

  const probe = await probeUpstreamReachability('https://sathyabama.cognibot.in', '/login/index.php', {
    fetchImpl: async () => new Response(null, { status: 200 }),
  });
  assert.equal(probe.reachable, true);
  assert.equal(probe.statusCode, 200);
});
