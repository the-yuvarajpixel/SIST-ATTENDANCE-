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
import type { DataSourceMode, HealthCheckItem, HealthReport, SectionEnvelope } from './src/core/types';
import {
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
    const erpToken = typeof body.erpToken === 'string' ? body.erpToken.trim() : '';
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
      if (usingMoodleCreds) {
        if (!lmsUsername) {
          fieldErrors.lmsUsername = 'Enter your Moodle LMS username or register number.';
        } else if (lmsUsername.length > 150) {
          fieldErrors.lmsUsername = 'Moodle username is too long.';
        }
        if (!lmsPassword) {
          fieldErrors.lmsPassword = 'Enter your Moodle LMS password.';
        } else if (lmsPassword.length > 256) {
          fieldErrors.lmsPassword = 'Password exceeds maximum allowed length.';
        }
      } else if (!erpToken && !lmsToken) {
        fieldErrors.lmsToken = 'Sign in with Moodle credentials, or paste a Moodle LMS or ERP token.';
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

        if (!lmsToken && usingMoodleCreds) {
          // Exchange Moodle username/password for a web-service token; password is never persisted.
          lmsToken = await exchangeMoodleCredentialsForToken(lmsUsername, lmsPassword);
        }

        if (lmsToken) {
          const siteInfo = await verifyMoodleToken(lmsToken);
          verifiedMoodleInfo = { userid: siteInfo.userid, fullname: siteInfo.fullname };
        }
        if (erpToken) {
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
