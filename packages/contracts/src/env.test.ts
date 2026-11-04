import { describe, expect, it } from 'vitest';
import { looksLikeSecretKey, portalEnvSchema } from './env';

const jwt = (payload: object) => `xx.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.yy`;

describe('looksLikeSecretKey', () => {
  it('flags new-format secret keys', () => expect(looksLikeSecretKey('sb_secret_abc123')).toBe(true));
  it('flags legacy service_role JWTs', () =>
    expect(looksLikeSecretKey(jwt({ role: 'service_role' }))).toBe(true));
  it('accepts anon JWTs and publishable keys', () => {
    expect(looksLikeSecretKey(jwt({ role: 'anon' }))).toBe(false);
    expect(looksLikeSecretKey('sb_publishable_abc123')).toBe(false);
  });
});

describe('portalEnvSchema', () => {
  const base = { VITE_APP_ENV: 'local', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' };
  it('rejects a service key in the portal', () => {
    const r = portalEnvSchema.safeParse({
      ...base,
      VITE_SUPABASE_ANON_KEY: 'sb_secret_0123456789abcdefghij',
    });
    expect(r.success).toBe(false);
  });
  it('accepts a publishable key', () => {
    const r = portalEnvSchema.safeParse({
      ...base,
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_0123456789abcdefghij',
    });
    expect(r.success).toBe(true);
  });
});
