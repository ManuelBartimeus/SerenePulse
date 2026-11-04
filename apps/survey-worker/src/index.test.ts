import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index';

const bindings = {
  APP_ENV: 'local',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests-0000',
  SURVEY_HMAC_KEY: 'x'.repeat(43),
};

afterEach(() => vi.unstubAllGlobals());

describe('GET /healthz', () => {
  it('returns ok when the database answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('"ok"', { status: 200 })),
    );
    const res = await app.request('/healthz', {}, bindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    const res = await app.request('/healthz', {}, bindings);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ db: 'unreachable' });
  });

  it('sends the service key only to Supabase', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response('"ok"'));
    vi.stubGlobal('fetch', fetchMock);
    await app.request('/healthz', {}, bindings);
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith(bindings.SUPABASE_URL))).toBe(true);
  });
});

describe('pages', () => {
  it('serve the unavailable page with strict headers until the survey ships', async () => {
    const res = await app.request('/', {}, bindings);
    expect(res.status).toBe(503);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await res.text()).toContain('take feedback right now.');
  });
});

describe('configuration', () => {
  it('fails closed on a missing HMAC key', async () => {
    const res = await app.request('/healthz', {}, { ...bindings, SURVEY_HMAC_KEY: undefined });
    expect(res.status).toBe(503);
  });
});
