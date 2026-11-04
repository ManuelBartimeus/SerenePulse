import type { MiddlewareHandler } from 'hono';

export type HeaderVariables = { cspNonce: string };

/** Strict security headers for every response (SPEC SECURITY › Headers). */
export const securityHeaders: MiddlewareHandler<{ Variables: HeaderVariables }> = async (c, next) => {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  c.set('cspNonce', nonce);
  await next();
  const h = c.res.headers;
  h.set(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
      "img-src 'self' data:",
      "connect-src 'self'",
      'frame-src https://challenges.cloudflare.com',
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
};
