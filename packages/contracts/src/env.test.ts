import { describe, expect, it } from 'vitest';
import { looksLikeSecretKey, portalEnvSchema, surveyWorkerEnvSchema } from './env';

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

describe('surveyWorkerEnvSchema', () => {
  const base = {
    APP_ENV: 'local',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests-0000',
    SURVEY_HMAC_KEY: 'x'.repeat(43),
  };
  it('treats the Arkesel SMS key as optional (simulated SMS until an account exists)', () => {
    const r = surveyWorkerEnvSchema.safeParse(base);
    expect(r.success && r.data.ARKESEL_API_KEY).toBe('');
  });
  it('accepts an Arkesel SMS key when one is configured', () => {
    const r = surveyWorkerEnvSchema.safeParse({ ...base, ARKESEL_API_KEY: 'arkesel-key' });
    expect(r.success && r.data.ARKESEL_API_KEY).toBe('arkesel-key');
  });
});
