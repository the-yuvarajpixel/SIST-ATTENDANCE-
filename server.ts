import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { TwoTierCache } from './src/core/cache';
import { LiveUpstreamError } from './src/core/liveParsers';
import {
  validateAttendance,
  validateDeadlines,
  validateNotifications,
  validateProfile,
  validateResults,
  validateTimetable,
} from './src/core/schemas';
import type {
  DataOrigin,
  DataSourceMode,
  HealthCheckItem,
  HealthReport,
  PortalSyncReport,
  PortalSyncSectionResult,
  SectionEnvelope,
} from './src/core/types';
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
} from './src/server/liveAdapters';
import {
  buildMockAttendance,
  buildMockDeadlines,
  buildMockNotifications,
  buildMockProfile,
  buildMockResults,
  buildMockTimetable,
} from './src/server/mockData';
import {
  checkLoginRateLimit,
  clearSessionCookie,
  isSameOriginPost,
  isSessionSecretConfigured,
  readSession,
  toPublicUser,
  writeSessionCookie,
  type StoredSession,
} from './src/server/session';

if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';

const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_MODE: DataSourceMode = process.env.DATA_SOURCE === 'live' ? 'live' : 'mock';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TOKEN_LENGTH = 1500;

const cache = new TwoTierCache();

// Per-user simulated ERP outage toggle so users can verify stale-while-error resilience live.
const simulatedErpOutage = new Set<string>();

function resolveActiveSession(req: express.Request, res: express.Response): StoredSession | null {
  const { session, explicitlySignedOut } = readSession(req);
  if (session) return session;
  if (explicitlySignedOut || DEFAULT_MODE === 'live') return null;

  // In default mock mode, seamlessly start a demo session on first visit so the dashboard works immediately.
  return writeSessionCookie(req, res, {
    registerNumber: '42110482',
    name: 'Arjun Subramanian',
    mode: 'mock',
    erpToken: 'mock-erp-session',
    lmsToken: 'mock-lms-token',
  });
}

export function createApp() {
  if (process.env.NODE_ENV === 'production' && !isSessionSecretConfigured()) {
    throw new Error('Set SESSION_SECRET before production startup');
  }
  const app = express();
  app.set('trust proxy', process.env.VERCEL ? 1 : false);
  app.disable('x-powered-by');

  // Baseline security headers (iframe-compatible for AI Studio preview)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Enforce same-origin on mutating API routes
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST' && !isSameOriginPost(req)) {
      res.status(403).json({ error: 'Cross-origin POST request rejected.' });
      return;
    }
    next();
  });

  app.use('/api', express.json({ limit: '64kb' }));

  // Health endpoint (no sign-in required, no secrets exposed)
  app.get('/api/health', async (req, res) => {
    const deep = req.query.deep === '1';
    const { session } = readSession(req);
    const activeMode: DataSourceMode = session?.mode ?? DEFAULT_MODE;
    const userHash = session
      ? TwoTierCache.hashUserKey(JSON.stringify([session.registerNumber, session.name, session.exp]))
      : null;
    const outageOn = userHash ? simulatedErpOutage.has(userHash) : false;
    const secretConfigured = isSessionSecretConfigured();
    const cacheInfo = cache.stats();
    const liveConfig = getLiveAdapterConfig();

    const erpProbePath = liveConfig.erpHost === 'erp.sathyabama.ac.in' ? '/account/login' : '/';
    const [erpProbe, lmsProbe] = deep
      ? await Promise.all([
          liveConfig.erpBaseUrl
            ? probeUpstreamReachability(liveConfig.erpBaseUrl, erpProbePath)
            : Promise.resolve(null),
          liveConfig.lmsBaseUrl
            ? probeUpstreamReachability(liveConfig.lmsBaseUrl, '/login/index.php')
            : Promise.resolve(null),
        ])
      : [null, null];

    const erpCheck: HealthCheckItem = (() => {
      if (outageOn) {
        return {
          id: 'erp-adapter',
          label: 'College ERP adapter',
          status: 'error',
          summary: 'Simulated ERP outage is active — ERP sections fall back to last cached copy (stale-while-error).',
          action: 'Disable simulated ERP outage below to restore refresh.',
        };
      }
      if (liveConfig.erpConfigError) {
        return {
          id: 'erp-adapter',
          label: 'College ERP adapter',
          status: 'error',
          summary: `Invalid ERP_BASE_URL configuration: ${liveConfig.erpConfigError}`,
          action: 'Set a valid public HTTPS URL for ERP_BASE_URL in environment variables.',
        };
      }
      if (!liveConfig.erpBaseUrl) {
        return {
          id: 'erp-adapter',
          label: 'College ERP adapter',
          status: activeMode === 'live' ? 'warning' : 'warning',
          summary:
            activeMode === 'live'
              ? 'ERP_BASE_URL is not configured. Live Moodle LMS sync works, while ERP sections need ERP_BASE_URL.'
              : 'Live ERP adapter is ready once ERP_BASE_URL is set. Currently running in sample data mode.',
          action: 'Set ERP_BASE_URL (e.g. your HTTPS ERP gateway URL) in environment variables to enable live ERP sync.',
        };
      }
      if (erpProbe) {
        return {
          id: 'erp-adapter',
          label: 'College ERP adapter',
          status: erpProbe.reachable ? 'ok' : 'error',
          summary: erpProbe.summary,
          action: erpProbe.reachable
            ? undefined
            : 'Verify ERP_BASE_URL is reachable from this host and not blocked by a firewall.',
        };
      }
      return {
        id: 'erp-adapter',
        label: 'College ERP adapter',
        status: 'ok',
        summary: `Configured for ${liveConfig.erpHost}. Run a deep check to test live reachability.`,
      };
    })();

    const lmsCheck: HealthCheckItem = (() => {
      if (liveConfig.lmsConfigError) {
        return {
          id: 'lms-adapter',
          label: 'Moodle LMS web-services adapter',
          status: 'error',
          summary: `Invalid LMS_BASE_URL configuration: ${liveConfig.lmsConfigError}`,
          action: 'Set a valid public HTTPS URL for LMS_BASE_URL in environment variables.',
        };
      }
      if (!liveConfig.lmsBaseUrl) {
        return {
          id: 'lms-adapter',
          label: 'Moodle LMS web-services adapter',
          status: 'error',
          summary: 'LMS_BASE_URL is not configured.',
          action: 'Set LMS_BASE_URL (default: https://sathyabama.cognibot.in).',
        };
      }
      if (lmsProbe) {
        return {
          id: 'lms-adapter',
          label: 'Moodle LMS web-services adapter',
          status: lmsProbe.reachable ? 'ok' : 'warning',
          summary: lmsProbe.summary,
          action: lmsProbe.reachable
            ? undefined
            : 'Check outbound HTTPS access to Moodle LMS or update LMS_BASE_URL.',
        };
      }
      return {
        id: 'lms-adapter',
        label: 'Moodle LMS web-services adapter',
        status: 'ok',
        summary: `Live Moodle REST adapter ready (${liveConfig.lmsHost}). Sign in with your Moodle web-service token to sync deadlines and notifications.`,
      };
    })();

    const checks: HealthCheckItem[] = [
      {
        id: 'data-source',
        label: 'Data source mode',
        status: 'ok',
        summary:
          session?.mode === 'live'
            ? 'Live session active — fetching data directly from verified upstream ERP / Moodle LMS endpoints.'
            : session?.mode === 'mock' && DEFAULT_MODE === 'live'
              ? 'Sample data session active (server default is live mode). Switch to Live ERP / LMS anytime.'
              : DEFAULT_MODE === 'live'
                ? 'Server default is live mode. Sign in with your verified ERP or Moodle LMS tokens.'
                : 'Sample data mode active (live ERP + Moodle LMS sign-in is also enabled from the Sign-In screen).',
      },
      {
        id: 'session-secret',
        label: 'Session cookie encryption (AES-256-GCM)',
        status: secretConfigured ? 'ok' : 'warning',
        summary: secretConfigured
          ? 'Custom 32+ character SESSION_SECRET is active for HttpOnly cookies.'
          : 'Using a random per-process development key. Set a 32+ character SESSION_SECRET before deploying online.',
        action: secretConfigured ? undefined : 'Set SESSION_SECRET in your environment variables.',
      },
      erpCheck,
      lmsCheck,
      {
        id: 'cache',
        label: 'Two-tier per-user cache',
        status: 'ok',
        summary: `${cacheInfo.entries} cached section${cacheInfo.entries === 1 ? '' : 's'} active (${cacheInfo.diskBacked ? 'memory + JSON file' : 'memory only'}).`,
      },
    ];

    const report: HealthReport = {
      status: checks.some((check) => check.status !== 'ok') ? 'degraded' : 'ok',
      mode: activeMode,
      checkedAt: new Date().toISOString(),
      deep,
      erpOutageSimulated: outageOn,
      checks,
      liveAdapters: {
        erpConfigured: Boolean(liveConfig.erpBaseUrl),
        lmsConfigured: Boolean(liveConfig.lmsBaseUrl),
        erpHost: liveConfig.erpHost,
        lmsHost: liveConfig.lmsHost,
      },
    };
    res.json(report);
  });

  // Session inspection
  app.get('/api/session', (req, res) => {
    const session = resolveActiveSession(req, res);
    if (!session) {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({ authenticated: true, user: toPublicUser(session) });
  });

  // Sign in (never stores passwords; accepts mock register number OR verified live ERP/LMS tokens)
  app.post('/api/auth/login', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkLoginRateLimit(ip)) {
      res.status(429).json({ error: 'Too many sign-in attempts. Please wait a minute and try again.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const registerNumber = typeof body.registerNumber === 'string' ? body.registerNumber.trim() : '';
    const displayName = typeof body.name === 'string' ? body.name.trim() : '';
    if (displayName.length > 100) {
      res.status(400).json({ error: 'Display name must be at most 100 characters.' });
      return;
    }
    const mode: DataSourceMode = body.mode === 'live' ? 'live' : 'mock';
    let erpToken = typeof body.erpToken === 'string' ? body.erpToken.trim() : '';
    const erpUsername = typeof body.erpUsername === 'string' ? body.erpUsername.trim() : '';
    const erpPassword = typeof body.erpPassword === 'string' ? body.erpPassword : '';
    const usingErpCreds = Boolean(erpUsername || erpPassword);

    let lmsToken = typeof body.lmsToken === 'string' ? body.lmsToken.trim() : '';
    const lmsUsername = typeof body.lmsUsername === 'string' ? body.lmsUsername.trim() : '';
    const lmsPassword = typeof body.lmsPassword === 'string' ? body.lmsPassword : '';
    const usingMoodleCreds = Boolean(lmsUsername || lmsPassword);

    const fieldErrors: Record<string, string> = {};
    if (!registerNumber) {
      fieldErrors.registerNumber = 'Enter your Sathyabama register number (e.g. 42110482).';
    } else if (!/^[A-Za-z0-9]{6,14}$/.test(registerNumber)) {
      fieldErrors.registerNumber = 'Register number must be 6–14 letters or digits without spaces.';
    }

    if (mode === 'live') {
      if (!usingErpCreds && !usingMoodleCreds && !erpToken && !lmsToken) {
        fieldErrors.lmsPassword =
          'Enter your ERP and/or Moodle LMS username and password, or switch to Paste Tokens.';
      }
      if (usingErpCreds) {
        const effectiveErpUser = erpUsername || registerNumber;
        if (!effectiveErpUser) {
          fieldErrors.erpUsername = 'Enter your College ERP username or register number.';
        } else if (effectiveErpUser.length > 150) {
          fieldErrors.erpUsername = 'ERP username is too long.';
        }
        if (!erpPassword) {
          fieldErrors.erpPassword = 'Enter your College ERP password.';
        } else if (erpPassword.length > 256) {
          fieldErrors.erpPassword = 'Password exceeds maximum allowed length.';
        }
      }
      if (usingMoodleCreds) {
        const effectiveLmsUser = lmsUsername || registerNumber;
        if (!effectiveLmsUser) {
          fieldErrors.lmsUsername = 'Enter your Moodle LMS username or register number.';
        } else if (effectiveLmsUser.length > 150) {
          fieldErrors.lmsUsername = 'Moodle username is too long.';
        }
        if (!lmsPassword) {
          fieldErrors.lmsPassword = 'Enter your Moodle LMS password.';
        } else if (lmsPassword.length > 256) {
          fieldErrors.lmsPassword = 'Password exceeds maximum allowed length.';
        }
      }
      if (erpToken && (erpToken.length < 8 || erpToken.length > MAX_TOKEN_LENGTH)) {
        fieldErrors.erpToken = `ERP session token must be 8–${MAX_TOKEN_LENGTH} characters.`;
      }
      if (lmsToken && (lmsToken.length < 8 || lmsToken.length > MAX_TOKEN_LENGTH)) {
        fieldErrors.lmsToken = `Moodle LMS token must be 8–${MAX_TOKEN_LENGTH} characters.`;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ error: 'Please fix the highlighted fields.', fieldErrors });
      return;
    }

    if (mode === 'live') {
      try {
        let verifiedMoodleInfo: { userid: number; fullname: string } | null = null;
        let verifiedErpName: string | null = null;
        let erpExchangedFromLogin = false;

        if (!lmsToken && usingMoodleCreds) {
          // Exchange Moodle username/password once for a web-service token; password is never persisted.
          lmsToken = await exchangeMoodleCredentialsForToken(lmsUsername || registerNumber, lmsPassword);
        }

        if (!erpToken && usingErpCreds) {
          // Exchange ERP username/password once for an access token; password is never persisted.
          const erpAuth = await exchangeErpCredentialsForToken(erpUsername || registerNumber, erpPassword);
          erpToken = erpAuth.token;
          verifiedErpName = erpAuth.studentName ?? null;
          erpExchangedFromLogin = true;
        }

        if (lmsToken) {
          const siteInfo = await verifyMoodleToken(lmsToken);
          verifiedMoodleInfo = { userid: siteInfo.userid, fullname: siteInfo.fullname };
        }
        if (erpToken && !erpExchangedFromLogin) {
          const erpProfile = await verifyErpToken(
            erpToken,
            registerNumber.toUpperCase(),
            displayName || verifiedMoodleInfo?.fullname,
            Boolean(lmsToken)
          );
          verifiedErpName = erpProfile.name;
        }

        const resolvedName = (
          displayName ||
          verifiedErpName ||
          verifiedMoodleInfo?.fullname ||
          registerNumber.toUpperCase()
        ).slice(0, 100);

        const stored = writeSessionCookie(req, res, {
          registerNumber: registerNumber.toUpperCase(),
          name: resolvedName,
          mode: 'live',
          erpToken: erpToken || undefined,
          lmsToken: lmsToken || undefined,
          lmsUserId: verifiedMoodleInfo?.userid,
        });

        res.json({ authenticated: true, user: toPublicUser(stored) });
        return;
      } catch (err) {
        if (err instanceof LiveUpstreamError) {
          res.status(err.status).json({
            error: err.message,
            fieldErrors: err.field ? { [err.field]: err.message } : undefined,
          });
          return;
        }
        const message = err instanceof Error ? err.message : 'Unable to verify live credentials.';
        res.status(502).json({ error: message });
        return;
      }
    }

    const profile = buildMockProfile(registerNumber, displayName || undefined);
    const stored = writeSessionCookie(req, res, {
      registerNumber: profile.registerNumber,
      name: profile.name,
      mode: 'mock',
      erpToken: 'mock-erp-session',
      lmsToken: 'mock-lms-token',
    });

    res.json({ authenticated: true, user: toPublicUser(stored) });
  });

  // Sign out (clears cookie + per-user cache)
  app.post('/api/auth/logout', (req, res) => {
    const { session } = readSession(req);
    if (session) {
      const userHash = TwoTierCache.hashUserKey(
        JSON.stringify([session.registerNumber, session.name, session.exp])
      );
      cache.clearUser(userHash);
      simulatedErpOutage.delete(userHash);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // Connect or update live Moodle LMS and/or College ERP credentials in-place without losing the other portal
  app.post('/api/auth/connect', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkLoginRateLimit(ip)) {
      res.status(429).json({ error: 'Too many connection attempts. Please wait a minute and try again.' });
      return;
    }

    const session = resolveActiveSession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const nextRegRaw =
      typeof body.registerNumber === 'string' && body.registerNumber.trim()
        ? body.registerNumber.trim()
        : session.registerNumber;
    let incomingErpToken = typeof body.erpToken === 'string' ? body.erpToken.trim() : '';
    const erpUsername = typeof body.erpUsername === 'string' ? body.erpUsername.trim() : '';
    const erpPassword = typeof body.erpPassword === 'string' ? body.erpPassword : '';
    const usingErpCreds = Boolean(erpUsername || erpPassword);

    let incomingLmsToken = typeof body.lmsToken === 'string' ? body.lmsToken.trim() : '';
    const lmsUsername = typeof body.lmsUsername === 'string' ? body.lmsUsername.trim() : '';
    const lmsPassword = typeof body.lmsPassword === 'string' ? body.lmsPassword : '';
    const usingMoodleCreds = Boolean(lmsUsername || lmsPassword);

    const fieldErrors: Record<string, string> = {};
    if (!/^[A-Za-z0-9]{6,14}$/.test(nextRegRaw)) {
      fieldErrors.registerNumber = 'Register number must be 6–14 letters or digits without spaces.';
    }
    if (!incomingErpToken && !usingErpCreds && !incomingLmsToken && !usingMoodleCreds) {
      fieldErrors.lmsToken = 'Provide Moodle LMS or College ERP credentials/tokens to connect.';
    }
    if (usingErpCreds) {
      const effectiveErpUser = erpUsername || nextRegRaw;
      if (!effectiveErpUser || effectiveErpUser.length > 150) {
        fieldErrors.erpUsername = 'Enter a valid College ERP username or register number.';
      }
      if (!erpPassword) {
        fieldErrors.erpPassword = 'Enter your College ERP password.';
      } else if (erpPassword.length > 256) {
        fieldErrors.erpPassword = 'Password exceeds maximum allowed length.';
      }
    }
    if (usingMoodleCreds) {
      const effectiveUser = lmsUsername || nextRegRaw;
      if (!effectiveUser || effectiveUser.length > 150) {
        fieldErrors.lmsUsername = 'Enter a valid Moodle LMS username or register number.';
      }
      if (!lmsPassword) {
        fieldErrors.lmsPassword = 'Enter your Moodle LMS password.';
      } else if (lmsPassword.length > 256) {
        fieldErrors.lmsPassword = 'Password exceeds maximum allowed length.';
      }
    }
    if (incomingErpToken && (incomingErpToken.length < 8 || incomingErpToken.length > MAX_TOKEN_LENGTH)) {
      fieldErrors.erpToken = `ERP session token must be 8–${MAX_TOKEN_LENGTH} characters.`;
    }
    if (incomingLmsToken && (incomingLmsToken.length < 8 || incomingLmsToken.length > MAX_TOKEN_LENGTH)) {
      fieldErrors.lmsToken = `Moodle LMS token must be 8–${MAX_TOKEN_LENGTH} characters.`;
    }

    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ error: 'Please fix the highlighted fields.', fieldErrors });
      return;
    }

    try {
      const nextRegisterNumber = nextRegRaw.toUpperCase();
      let verifiedMoodleInfo: { userid: number; fullname: string } | null = null;
      let verifiedErpName: string | null = null;
      let erpExchangedFromLogin = false;

      if (!incomingLmsToken && usingMoodleCreds) {
        incomingLmsToken = await exchangeMoodleCredentialsForToken(lmsUsername || nextRegisterNumber, lmsPassword);
      }

      if (!incomingErpToken && usingErpCreds) {
        const erpAuth = await exchangeErpCredentialsForToken(erpUsername || nextRegisterNumber, erpPassword);
        incomingErpToken = erpAuth.token;
        verifiedErpName = erpAuth.studentName ?? null;
        erpExchangedFromLogin = true;
      }

      if (incomingLmsToken) {
        const siteInfo = await verifyMoodleToken(incomingLmsToken);
        verifiedMoodleInfo = { userid: siteInfo.userid, fullname: siteInfo.fullname };
      }

      const existingLiveLms = session.mode === 'live' ? session.lmsToken : undefined;
      const existingLiveErp = session.mode === 'live' ? session.erpToken : undefined;
      const finalLmsToken = incomingLmsToken || existingLiveLms;
      const finalErpToken = incomingErpToken || existingLiveErp;

      if (incomingErpToken && !erpExchangedFromLogin) {
        const erpProfile = await verifyErpToken(
          incomingErpToken,
          nextRegisterNumber,
          verifiedMoodleInfo?.fullname || (session.mode === 'live' ? session.name : undefined),
          Boolean(finalLmsToken)
        );
        verifiedErpName = erpProfile.name;
      }

      const oldUserHash = TwoTierCache.hashUserKey(
        JSON.stringify([session.registerNumber, session.name, session.exp])
      );
      cache.clearUser(oldUserHash);

      const resolvedName = (
        verifiedErpName ||
        verifiedMoodleInfo?.fullname ||
        (session.mode === 'live' ? session.name : nextRegisterNumber)
      ).slice(0, 100);

      const stored = writeSessionCookie(req, res, {
        registerNumber: nextRegisterNumber,
        name: resolvedName,
        mode: 'live',
        erpToken: finalErpToken || undefined,
        lmsToken: finalLmsToken || undefined,
        lmsUserId: verifiedMoodleInfo?.userid ?? (session.mode === 'live' ? session.lmsUserId : undefined),
      });

      res.json({ authenticated: true, user: toPublicUser(stored) });
    } catch (err) {
      if (err instanceof LiveUpstreamError) {
        res.status(err.status).json({
          error: err.message,
          fieldErrors: err.field ? { [err.field]: err.message } : undefined,
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unable to connect portal credentials.';
      res.status(502).json({ error: message });
    }
  });

  // Unified sync across both Moodle LMS and College ERP (refreshes all 6 sections in parallel)
  app.post('/api/portal/sync', async (req, res) => {
    const session = resolveActiveSession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }

    const userHash = TwoTierCache.hashUserKey(
      JSON.stringify([session.registerNumber, session.name, session.exp])
    );
    const liveConfig = getLiveAdapterConfig();
    const lmsHost = liveConfig.lmsHost ?? 'sathyabama.cognibot.in';
    const erpHost = liveConfig.erpHost ?? 'erp.sathyabama.ac.in';

    type SectionSpec<T> = {
      section: PortalSyncSectionResult['section'];
      label: string;
      source: DataOrigin;
      usesErp: boolean;
      mockLoader: (s: StoredSession) => T;
      liveLoader: (s: StoredSession) => Promise<T>;
      validator: (raw: unknown) => T;
      count: (data: T) => number;
    };

    const specs: SectionSpec<unknown>[] = [
      {
        section: 'profile',
        label: 'Student Profile',
        source: session.mode === 'live' && !session.erpToken && session.lmsToken ? 'LMS' : 'ERP',
        usesErp: true,
        mockLoader: (s) => buildMockProfile(s.registerNumber, s.name),
        liveLoader: (s) => fetchLiveProfile(s),
        validator: validateProfile,
        count: () => 1,
      },
      {
        section: 'attendance',
        label: 'Attendance',
        source: 'ERP',
        usesErp: true,
        mockLoader: () => buildMockAttendance(),
        liveLoader: (s) => fetchLiveAttendance(s),
        validator: validateAttendance,
        count: (d) => (Array.isArray(d) ? d.length : 0),
      },
      {
        section: 'timetable',
        label: 'Timetable',
        source: 'ERP',
        usesErp: true,
        mockLoader: () => buildMockTimetable(),
        liveLoader: (s) => fetchLiveTimetable(s),
        validator: validateTimetable,
        count: (d) => (Array.isArray(d) ? d.length : 0),
      },
      {
        section: 'results',
        label: 'Results & CGPA',
        source: 'ERP',
        usesErp: true,
        mockLoader: () => buildMockResults(),
        liveLoader: (s) => fetchLiveResults(s),
        validator: validateResults,
        count: (d) =>
          typeof d === 'object' && d !== null && Array.isArray((d as { semesters?: unknown[] }).semesters)
            ? (d as { semesters: unknown[] }).semesters.length
            : 0,
      },
      {
        section: 'deadlines',
        label: 'Deadlines',
        source:
          session.mode === 'live'
            ? session.erpToken && session.lmsToken
              ? 'ERP + LMS'
              : session.lmsToken
                ? 'LMS'
                : 'ERP'
            : 'ERP + LMS',
        usesErp: false,
        mockLoader: () => buildMockDeadlines().items,
        liveLoader: (s) => fetchLiveDeadlines(s),
        validator: validateDeadlines,
        count: (d) => (Array.isArray(d) ? d.length : 0),
      },
      {
        section: 'notifications',
        label: 'Notifications',
        source:
          session.mode === 'live'
            ? session.erpToken && session.lmsToken
              ? 'ERP + LMS'
              : session.lmsToken
                ? 'LMS'
                : 'ERP'
            : 'ERP + LMS',
        usesErp: false,
        mockLoader: () => buildMockNotifications(),
        liveLoader: (s) => fetchLiveNotifications(s),
        validator: validateNotifications,
        count: (d) => (Array.isArray(d) ? d.length : 0),
      },
    ];

    const lmsStart = Date.now();
    const erpStart = Date.now();

    const sectionResults = await Promise.all(
      specs.map(async (spec): Promise<PortalSyncSectionResult> => {
        try {
          const result = await cache.getOrFetch(
            userHash,
            spec.section,
            CACHE_TTL_MS,
            async () => {
              if (spec.usesErp && simulatedErpOutage.has(userHash)) {
                throw new Error('ERP portal did not respond within 5s');
              }
              const raw = session.mode === 'live' ? await spec.liveLoader(session) : spec.mockLoader(session);
              return spec.validator(raw);
            },
            { forceRefresh: true }
          );
          const itemCount = spec.count(result.data);
          return {
            section: spec.section,
            label: spec.label,
            source: spec.source,
            status: result.stale ? 'stale' : 'synced',
            itemCount,
            fetchedAt: result.fetchedAt,
            message: result.warning
              ? result.warning
              : session.mode === 'live'
                ? `Synced live from ${spec.source}`
                : `Refreshed sample ${spec.source} data`,
          };
        } catch (err) {
          return {
            section: spec.section,
            label: spec.label,
            source: spec.source,
            status: 'error',
            itemCount: 0,
            fetchedAt: null,
            message: err instanceof Error ? err.message : `Unable to sync ${spec.label}.`,
          };
        }
      })
    );

    const lmsLatencyMs = Date.now() - lmsStart;
    const erpLatencyMs = Date.now() - erpStart;

    const lmsSections = sectionResults.filter((s) => s.source === 'LMS' || s.source === 'ERP + LMS');
    const erpSections = sectionResults.filter((s) => s.source === 'ERP' || s.source === 'ERP + LMS');

    const moodleConnected = session.mode === 'live' ? Boolean(session.lmsToken) : true;
    const erpConnected = session.mode === 'live' ? Boolean(session.erpToken) : true;

    const moodleHasSynced = lmsSections.some((s) => s.status === 'synced');
    const erpHasSynced = erpSections.some((s) => s.status === 'synced');
    const erpFirstError = erpSections.find((s) => s.status === 'error' || s.status === 'stale');
    const lmsFirstError = lmsSections.find((s) => s.status === 'error' || s.status === 'stale');

    const report: PortalSyncReport = {
      syncedAt: new Date().toISOString(),
      mode: session.mode,
      moodle: {
        connected: moodleConnected,
        host: lmsHost,
        status: !moodleConnected ? 'disconnected' : moodleHasSynced ? 'synced' : 'error',
        message:
          session.mode === 'mock'
            ? 'Sample Moodle LMS data refreshed. Connect your Sathyabama Moodle account below for live sync.'
            : !moodleConnected
              ? 'Not connected yet. Sign in with your Moodle LMS credentials or web-service token below.'
              : moodleHasSynced
                ? `Synced Moodle LMS deadlines & notifications from ${lmsHost}.`
                : lmsFirstError?.message ?? `Unable to sync Moodle LMS (${lmsHost}).`,
        latencyMs: lmsLatencyMs,
      },
      erp: {
        connected: erpConnected,
        host: erpHost,
        status: !erpConnected ? 'disconnected' : erpHasSynced && !simulatedErpOutage.has(userHash) ? 'synced' : 'error',
        message:
          session.mode === 'mock'
            ? simulatedErpOutage.has(userHash)
              ? 'Simulated ERP outage is active — ERP sections fell back to cached copy.'
              : 'Sample College ERP data refreshed. Paste your ERP Access-Token below for live sync.'
            : !erpConnected
              ? 'Not connected yet. Paste your ERP Access-Token from erp.sathyabama.ac.in to sync attendance, timetable, and CGPA.'
              : erpHasSynced && !simulatedErpOutage.has(userHash)
                ? `Synced attendance, timetable, and results from ${erpHost}.`
                : erpFirstError?.message ?? `Unable to sync College ERP (${erpHost}).`,
        latencyMs: erpLatencyMs,
      },
      sections: sectionResults,
    };

    res.json(report);
  });

  // Resilience toggle: simulate ERP outage so user can verify stale-while-error fallback
  app.post('/api/portal/resilience', (req, res) => {
    const session = resolveActiveSession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const userHash = TwoTierCache.hashUserKey(
      JSON.stringify([session.registerNumber, session.name, session.exp])
    );
    const enabled = req.body?.simulateErpOutage;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'Expected a boolean simulateErpOutage.' });
      return;
    }
    if (enabled) {
      if (simulatedErpOutage.size >= 2048 && !simulatedErpOutage.has(userHash)) {
        simulatedErpOutage.delete(simulatedErpOutage.values().next().value!);
      }
      simulatedErpOutage.add(userHash);
    } else {
      simulatedErpOutage.delete(userHash);
    }
    res.json({ erpOutageSimulated: enabled });
  });

  // Helper to serve each section independently with validation + two-tier cache
  function registerSection<T>(
    routePath: string,
    sectionKey: string,
    source: 'ERP' | 'LMS' | 'ERP + LMS',
    usesErp: boolean,
    mockLoader: (session: StoredSession) => T,
    liveLoader: (session: StoredSession) => Promise<T>,
    validator: (raw: unknown) => T
  ) {
    app.get(routePath, async (req, res) => {
      const session = resolveActiveSession(req, res);
      if (!session) {
        res.status(401).json({ error: 'Session expired. Please sign in again.' });
        return;
      }
      const userHash = TwoTierCache.hashUserKey(
        JSON.stringify([session.registerNumber, session.name, session.exp])
      );
      const forceRefresh = req.query.refresh === '1';

      try {
        const result = await cache.getOrFetch(
          userHash,
          sectionKey,
          CACHE_TTL_MS,
          async () => {
            if (usesErp && simulatedErpOutage.has(userHash)) {
              throw new Error('ERP portal did not respond within 5s');
            }
            const raw =
              session.mode === 'live' ? await liveLoader(session) : mockLoader(session);
            return validator(raw);
          },
          { forceRefresh }
        );

        const resolvedSource =
          session.mode === 'live' && source === 'ERP + LMS'
            ? session.erpToken && session.lmsToken
              ? 'ERP + LMS'
              : session.lmsToken
                ? 'LMS'
                : 'ERP'
            : session.mode === 'live' && sectionKey === 'profile' && !session.erpToken && session.lmsToken
              ? 'LMS'
              : source;

        const envelope: SectionEnvelope<T> = {
          data: result.data,
          stale: result.stale,
          fetchedAt: result.fetchedAt,
          source: resolvedSource,
          mode: session.mode,
          warning: result.warning,
        };
        res.json(envelope);
      } catch (err) {
        const status = err instanceof LiveUpstreamError ? err.status : 503;
        const message = err instanceof Error ? err.message : 'Unable to fetch section data.';
        res.status(status).json({ error: message, section: sectionKey, source });
      }
    });
  }

  registerSection(
    '/api/portal/profile',
    'profile',
    'ERP',
    true,
    (s) => buildMockProfile(s.registerNumber, s.name),
    (s) => fetchLiveProfile(s),
    validateProfile
  );
  registerSection(
    '/api/portal/attendance',
    'attendance',
    'ERP',
    true,
    () => buildMockAttendance(),
    (s) => fetchLiveAttendance(s),
    validateAttendance
  );
  registerSection(
    '/api/portal/timetable',
    'timetable',
    'ERP',
    true,
    () => buildMockTimetable(),
    (s) => fetchLiveTimetable(s),
    validateTimetable
  );
  registerSection(
    '/api/portal/results',
    'results',
    'ERP',
    true,
    () => buildMockResults(),
    (s) => fetchLiveResults(s),
    validateResults
  );
  registerSection(
    '/api/portal/deadlines',
    'deadlines',
    'ERP + LMS',
    false,
    () => buildMockDeadlines().items,
    (s) => fetchLiveDeadlines(s),
    validateDeadlines
  );
  registerSection(
    '/api/portal/notifications',
    'notifications',
    'ERP + LMS',
    false,
    () => buildMockNotifications(),
    (s) => fetchLiveNotifications(s),
    validateNotifications
  );

  // Unknown API routes return clean JSON 404
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use(
    (err: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
      res.status(status).json({
        error:
          status === 413
            ? 'Request too large.'
            : status === 400
              ? 'Invalid JSON request.'
              : 'Internal server error.',
      });
    }
  );
  return app;
}

async function startServer() {
  const app = createApp();
  if (process.env.NODE_ENV === 'production' || process.argv.includes('--production')) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIST Student Portal running at http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL && !process.env.VITEST && !process.env.DISABLE_AUTO_START) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
