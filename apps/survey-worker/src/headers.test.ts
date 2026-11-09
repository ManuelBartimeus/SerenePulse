import { describe, expect, it } from 'vitest';
import { portalCsp } from './headers';

const directive = (csp: string, name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));

describe('portalCsp', () => {
  it('lets the portal show private images from its own Supabase project only', () => {
    const csp = portalCsp('https://vyjgjkjrpqfmkqpxefjx.supabase.co');
    expect(directive(csp, 'img-src')).toBe(
      "img-src 'self' data: blob: https://vyjgjkjrpqfmkqpxefjx.supabase.co",
    );
    expect(directive(csp, 'connect-src')).toBe(
      "connect-src 'self' https://vyjgjkjrpqfmkqpxefjx.supabase.co wss://vyjgjkjrpqfmkqpxefjx.supabase.co",
    );
    // Never a wildcard host or scheme for images.
    expect(csp).not.toMatch(/img-src[^;]*(\*|https:(?!\/\/))/);
  });

  it('keeps the certificate preview (blob: PDF in an <object>) and scripts locked down', () => {
    const csp = portalCsp('https://example.supabase.co');
    expect(directive(csp, 'object-src')).toBe("object-src 'self' blob:");
    expect(directive(csp, 'script-src')).toBe("script-src 'self' https://challenges.cloudflare.com");
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('falls back to same-origin images when the Supabase URL is missing or invalid', () => {
    for (const url of [undefined, 'not a url']) {
      const csp = portalCsp(url);
      expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob:");
      expect(directive(csp, 'connect-src')).toBe("connect-src 'self'");
    }
  });
});
