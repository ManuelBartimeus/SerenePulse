// Request plumbing shared by the survey routes: cookies, origin check, body cap, rate limiting.
import type { SurveyWorkerEnv } from '@serene/contracts';
import type { RateLimiter } from './config';

export const SESSION_MAX_AGE = 24 * 60 * 60; // 24 h (matches session_expiry_hours default)
export const DEVICE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
export const API_BODY_CAP = 8 * 1024; // api.md §1
export const FORM_BODY_CAP = 24 * 1024; // no-JS form: 1,000 non-ASCII characters percent-encode to ~9 KB

export interface CookieNames {
  session: string;
  device: string;
  secure: boolean;
}

/**
 * `__Host-` cookies need Secure, which browsers only accept over HTTPS. Local development runs
 * `wrangler dev` over plain http, so there (and only there) the names drop the prefix and Secure.
 */
export function cookieNames(env: SurveyWorkerEnv, url: string): CookieNames {
  if (env.APP_ENV === 'local' && new URL(url).protocol === 'http:')
    return { session: 'dev-svs', device: 'dev-svd', secure: false };
  return { session: '__Host-svs', device: '__Host-svd', secure: true };
}

export function serializeCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

const SECRET_RE = /^[A-Za-z0-9_-]{22,64}$/;
export const isSecret = (v: string | undefined): v is string => !!v && SECRET_RE.test(v);

/** 128 random bits, base64url (22 characters). */
export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | null | undefined): v is string => !!v && UUID_RE.test(v);

/** Same-origin check for every state-changing request (api.md §1). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin) return origin === new URL(req.url).origin;
  return req.headers.get('sec-fetch-site') === 'same-origin';
}

/** Reads at most `cap` bytes; returns null when the body is larger. */
export async function readCapped(req: Request, cap: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > cap) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'unknown';

/** True when the request must be refused. A missing or failing binding never blocks customers. */
export async function isRateLimited(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return false;
  try {
    return !(await limiter.limit({ key })).success;
  } catch (err) {
    console.error(JSON.stringify({ event: 'rate_limiter_failed', message: (err as Error).message }));
    return false;
  }
}

/** Coarse device class for funnel reporting; never stored as a fingerprint. */
export function uaClass(ua: string | null | undefined): 'mobile' | 'tablet' | 'desktop' | 'other' {
  if (!ua) return 'other';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(ua)) return 'mobile';
  if (/Windows|Macintosh|X11|CrOS|Linux/i.test(ua)) return 'desktop';
  return 'other';
}
