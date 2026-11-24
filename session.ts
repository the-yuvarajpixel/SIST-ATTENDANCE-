import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { DataSourceMode, SessionUser } from '../core/types';

const COOKIE_NAME = 'usp_session';
const SIGNED_OUT_COOKIE = 'usp_signed_out';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface StoredSession {
  registerNumber: string;
  name: string;
  mode: DataSourceMode;
  erpToken?: string;
  lmsToken?: string;
  exp: number;
}

const developmentSecret = crypto.randomBytes(32).toString('hex');

function getKey(): Buffer {
  if (process.env.NODE_ENV === 'production' && !isSessionSecretConfigured()) throw new Error('Set a valid SESSION_SECRET');
  const raw = isSessionSecretConfigured() ? process.env.SESSION_SECRET! : developmentSecret;
  return crypto.createHash('sha256').update(raw).digest();
}

export function isSessionSecretConfigured(): boolean {
  const raw = process.env.SESSION_SECRET ?? '';
  return raw.length >= 32 && !raw.includes('replace-with');
}

export function encryptSession(payload: StoredSession): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(encoded), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptSession(token: string): StoredSession | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
    const raw = Buffer.from(token, 'base64url');
    if (raw.toString('base64url') !== token) return null;
    if (raw.length < 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plain) as StoredSession;
    if (!parsed || typeof parsed.registerNumber !== 'string' || typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp) || typeof parsed.name !== 'string' || !['mock', 'live'].includes(parsed.mode)) {
      return null;
    }
    if (Date.now() >= parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = Object.create(null);
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) { try { result[k] = decodeURIComponent(v); } catch { /* Ignore malformed cookies. */ } }
  }
  return result;
}

function isSecureRequest(req: Request): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() === 'https';
  }
  return req.secure;
}

export function writeSessionCookie(req: Request, res: Response, session: Omit<StoredSession, 'exp'>): StoredSession {
  const full: StoredSession = { ...session, exp: Date.now() + SESSION_TTL_MS };
  const sealed = encryptSession(full);
  const secure = isSecureRequest(req);
  const cookies = [
    `${COOKIE_NAME}=${encodeURIComponent(sealed)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`,
    `${SIGNED_OUT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  ];
  res.setHeader('Set-Cookie', cookies);
  return full;
}

export function clearSessionCookie(req: Request, res: Response): void {
  const secure = isSecureRequest(req);
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
    `${SIGNED_OUT_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? '; Secure' : ''}`,
  ]);
}

export function readSession(req: Request): { session: StoredSession | null; explicitlySignedOut: boolean } {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  const session = raw ? decryptSession(raw) : null;
  const explicitlySignedOut = cookies[SIGNED_OUT_COOKIE] === '1';
  return { session, explicitlySignedOut };
}

export function toPublicUser(session: StoredSession): SessionUser {
  return {
    registerNumber: session.registerNumber,
    name: session.name,
    mode: session.mode,
    erpTokenPresent: Boolean(session.erpToken),
    lmsTokenPresent: Boolean(session.lmsToken),
    expiresAt: new Date(session.exp).toISOString(),
  };
}

/** Per-instance sliding-window login throttling */
const loginAttempts = new Map<string, number[]>();

export function checkLoginRateLimit(ip: string, limit = 15, windowMs = 60_000): boolean {
  const now = Date.now();
  if (loginAttempts.size >= 4096) {
    for (const [key, times] of loginAttempts) if (times.every(ts => now - ts >= windowMs)) loginAttempts.delete(key);
    if (loginAttempts.size >= 4096 && !loginAttempts.has(ip)) return false;
  }
  const recent = (loginAttempts.get(ip) ?? []).filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    loginAttempts.set(ip, recent);
    return false;
  }
  recent.push(now);
  loginAttempts.set(ip, recent);
  return true;
}

/** Same-origin check for mutating POST endpoints */
export function isSameOriginPost(req: Request): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!origin) return true;
  if (!host) return false; // Non-browser or same-origin curl/fetch without Origin
  try {
    const parsed = new URL(origin);
    return parsed.host === host && (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production'));
  } catch {
    return false;
  }
}
