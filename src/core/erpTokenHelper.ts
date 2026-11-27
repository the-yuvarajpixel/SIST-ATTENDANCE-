export const ERP_CONSOLE_COPY_SNIPPET = "copy(localStorage.getItem('Access-Token'))";

export type ExtractedTokenFormat = 'jwt' | 'header' | 'json' | 'curl' | 'raw' | 'none';

export interface ExtractedErpToken {
  token: string | null;
  registerNumber?: string;
  studentName?: string;
  format: ExtractedTokenFormat;
}

const MAX_INPUT_CHARS = 16_384;
const JWT_REGEX = /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/;
const REGISTER_ID_REGEX = /^[A-Za-z0-9._%+-]{4,64}(?:@[A-Za-z0-9.-]{2,80}\.[A-Za-z]{2,12})?$/;

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
}

function stripBearerPrefix(value: string): string {
  return stripWrappingQuotes(value).replace(/^bearer\s+/i, '').trim();
}

function isValidTokenCandidate(candidate: string): boolean {
  if (candidate.length < 8 || candidate.length > 4096) return false;
  if (/[\r\n\0]/.test(candidate)) return false;
  // Reject obvious non-token literals like "null" or "undefined"
  const lower = candidate.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'false' || lower === 'true') {
    return false;
  }
  return true;
}

function decodeBase64UrlToUtf8(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);

    if (typeof atob === 'function') {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(padded, 'base64').toString('utf8');
    }
    return null;
  } catch {
    return null;
  }
}

function extractJwtHints(token: string): { registerNumber?: string; studentName?: string } {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return {};
  const decoded = decodeBase64UrlToUtf8(parts[1]);
  if (!decoded) return {};

  try {
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const regCandidates = [
      parsed.RegisterNumber,
      parsed.registerNumber,
      parsed.RegNo,
      parsed.regNo,
      parsed.regno,
      parsed.StaffNumber,
      parsed.AppNo,
      parsed.UserName,
      parsed.username,
      parsed.email,
    ];

    let registerNumber: string | undefined;
    for (const candidate of regCandidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        const s = String(candidate);
        if (s.length >= 4 && s.length <= 20) {
          registerNumber = s;
          break;
        }
      } else if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (REGISTER_ID_REGEX.test(trimmed)) {
          registerNumber = trimmed;
          break;
        }
      }
    }

    const nameCandidates = [
      parsed.StudentName,
      parsed.StaffName,
      parsed.ParentName,
      parsed.FullName,
      parsed.name,
    ];
    let studentName: string | undefined;
    for (const candidate of nameCandidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed.length >= 2 && trimmed.length <= 80) {
          studentName = trimmed;
          break;
        }
      }
    }

    return { registerNumber, studentName };
  } catch {
    return {};
  }
}

function extractTokenFromJsonObject(obj: Record<string, unknown>): string | null {
  const directKeys = [
    'Access-Token',
    'access-token',
    'accessToken',
    'access_token',
    'Token',
    'token',
    'Authorization',
    'authorization',
  ];
  for (const key of directKeys) {
    const val = obj[key];
    if (typeof val === 'string') {
      const cleaned = stripBearerPrefix(val);
      if (isValidTokenCandidate(cleaned)) return cleaned;
    }
  }

  for (const nestedKey of ['login', 'data', 'responseData']) {
    const nested = obj[nestedKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const found = extractTokenFromJsonObject(nested as Record<string, unknown>);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Extracts a Sathyabama ERP Access-Token from any common copy format:
 * - Raw JWT or quoted string (e.g. from DevTools localStorage / copy())
 * - HTTP header line (e.g. "Access-Token: eyJ..." or "Authorization: Bearer eyJ...")
 * - JSON response / storage snippet (e.g. {"Access-Token":"eyJ..."})
 * - Browser DevTools "Copy as cURL" command (-H 'access-token: ...' or -H 'authorization: Bearer ...')
 * - Raw session cookie string (e.g. "PHPSESSID=...")
 *
 * Read-only JWT payload inspection is purely a convenience hint to pre-fill Register Number;
 * the backend always verifies tokens directly against erp.sathyabama.ac.in.
 */
export function extractErpAccessToken(rawInput: string): ExtractedErpToken {
  if (typeof rawInput !== 'string') {
    return { token: null, format: 'none' };
  }

  const bounded = rawInput.slice(0, MAX_INPUT_CHARS).replace(/^\uFEFF/, '').trim();
  if (!bounded) {
    return { token: null, format: 'none' };
  }

  // 1. Detect cURL commands copied from DevTools Network tab
  if (/^\s*curl\b/i.test(bounded) || /(?:-H|--header)\s+['"]/i.test(bounded)) {
    const headerRegex = /(?:-H|--header)\s+(['"])([^'"]+)\1/gi;
    let match: RegExpExecArray | null;
    while ((match = headerRegex.exec(bounded)) !== null) {
      const headerLine = match[2];
      const colonIdx = headerLine.indexOf(':');
      if (colonIdx <= 0) continue;
      const headerName = headerLine.slice(0, colonIdx).trim().toLowerCase();
      const headerValue = headerLine.slice(colonIdx + 1).trim();
      if (
        headerName === 'access-token' ||
        headerName === 'authorization' ||
        headerName === 'token'
      ) {
        const cleaned = stripBearerPrefix(headerValue);
        if (isValidTokenCandidate(cleaned)) {
          return {
            token: cleaned,
            format: 'curl',
            ...extractJwtHints(cleaned),
          };
        }
      }
    }
  }

  // 2. Detect JSON object snippet (e.g., login response or localStorage export)
  if (bounded.startsWith('{') && bounded.endsWith('}')) {
    try {
      const parsed = JSON.parse(bounded) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const found = extractTokenFromJsonObject(parsed as Record<string, unknown>);
        if (found) {
          return {
            token: found,
            format: 'json',
            ...extractJwtHints(found),
          };
        }
      }
    } catch {
      // Fall through to other extractors
    }
  }

  // 3. Detect HTTP header line(s) ("Access-Token: ..." / "Authorization: Bearer ...")
  const headerLineMatch = bounded.match(
    /(?:^|\n)\s*(?:access-token|authorization|token)\s*:\s*([^\r\n]+)/i
  );
  if (headerLineMatch) {
    const cleaned = stripBearerPrefix(headerLineMatch[1]);
    if (isValidTokenCandidate(cleaned)) {
      return {
        token: cleaned,
        format: 'header',
        ...extractJwtHints(cleaned),
      };
    }
  }

  // 4. Detect standalone or embedded JWT
  const unwrapped = stripBearerPrefix(bounded);
  const jwtMatch = unwrapped.match(JWT_REGEX);
  if (jwtMatch && isValidTokenCandidate(jwtMatch[1])) {
    return {
      token: jwtMatch[1],
      format: 'jwt',
      ...extractJwtHints(jwtMatch[1]),
    };
  }

  // 5. Fallback: raw single-line token or session cookie (e.g. PHPSESSID=...)
  if (!/[\r\n]/.test(unwrapped) && isValidTokenCandidate(unwrapped)) {
    const looksLikeCookie = unwrapped.includes('=') && !/\s{2,}/.test(unwrapped);
    const looksLikeOpaqueToken = !/\s/.test(unwrapped);
    if (looksLikeCookie || looksLikeOpaqueToken) {
      return {
        token: unwrapped,
        format: 'raw',
        ...extractJwtHints(unwrapped),
      };
    }
  }

  return { token: null, format: 'none' };
}

export function formatExtractedTokenSummary(result: ExtractedErpToken): string {
  if (!result.token) return 'No valid ERP Access-Token detected.';
  const sourceLabel =
    result.format === 'curl'
      ? 'cURL command'
      : result.format === 'json'
        ? 'JSON payload'
        : result.format === 'header'
          ? 'request header'
          : result.format === 'jwt'
            ? 'ERP JWT'
            : 'ERP token';
  return result.registerNumber
    ? `Extracted ${sourceLabel} (Reg. No. ${result.registerNumber})`
    : `Extracted ${sourceLabel}`;
}
