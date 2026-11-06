import type { MiddlewareHandler } from 'hono';
import { LANDING_SCRIPT_HASHES, LANDING_STYLE_HASHES } from './landing-csp.gen';
import type { Bindings } from './config';

export type HeaderVariables = { cspNonce: string };

const TURNSTILE = 'https://challenges.cloudflare.com';
const COMMON = ["base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"];

/** Survey and Worker-rendered pages: nonce-only scripts and styles (SPEC SECURITY › Headers). */
export function surveyCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    "font-src 'self'",
    `script-src 'nonce-${nonce}' ${TURNSTILE}`,
    "img-src 'self' data:",
    "connect-src 'self'",
    `frame-src ${TURNSTILE}`,
    ...COMMON,
  ].join('; ');
}

/**
 * Staff portal SPA (/admin). It talks to Supabase over HTTPS and WebSocket (Realtime). Radix
 * dialogs inject a <style> element (react-remove-scroll), so styles need 'unsafe-inline'; scripts
 * stay 'self' only.
 */
export function portalCsp(supabaseUrl: string | undefined): string {
  let connect = "connect-src 'self'";
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      connect += ` ${u.origin} ${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`;
    } catch {
      // invalid URL: config validation reports it on the survey paths
    }
  }
  return [
    "default-src 'self'",
    `script-src 'self' ${TURNSTILE}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    connect,
    `frame-src ${TURNSTILE}`,
    "worker-src 'self' blob:",
    ...COMMON,
  ].join('; ');
}

/** Public landing site (static). Only its own inline blocks run, pinned by hash at build time. */
export function landingCsp(): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${LANDING_SCRIPT_HASHES.join(' ')}`,
    `style-src 'self' ${LANDING_STYLE_HASHES.join(' ')}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    ...COMMON,
  ].join('; ');
}

/**
 * Customer app (/account) and its API (/api/account, /api/verify). Bundled scripts and styles only;
 * the signature pad draws on a canvas and exports PNG data URLs (img data: / blob:).
 */
export function accountCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    ...COMMON,
  ].join('; ');
}

export type Area = 'survey' | 'portal' | 'account' | 'landing';
export function areaOf(pathname: string): Area {
  if (
    pathname === '/account' ||
    pathname.startsWith('/account/') ||
    pathname === '/api/account' ||
    pathname.startsWith('/api/account/') ||
    pathname === '/api/verify'
  )
    return 'account';
  if (
    pathname === '/healthz' ||
    pathname === '/customerfeedback' ||
    pathname.startsWith('/customerfeedback/')
  )
    return 'survey';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'portal';
  return 'landing';
}

/** Strict security headers for every response; the CSP depends on which app owns the path. */
export const securityHeaders: MiddlewareHandler<{ Bindings: Bindings; Variables: HeaderVariables }> = async (
  c,
  next,
) => {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  c.set('cspNonce', nonce);
  await next();
  const h = c.res.headers;
  const area = areaOf(new URL(c.req.url).pathname);
  const supabaseUrl = typeof c.env?.SUPABASE_URL === 'string' ? c.env.SUPABASE_URL : undefined;
  h.set(
    'Content-Security-Policy',
    area === 'survey'
      ? surveyCsp(nonce)
      : area === 'portal'
        ? portalCsp(supabaseUrl)
        : area === 'account'
          ? accountCsp()
          : landingCsp(),
  );
  h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
};
