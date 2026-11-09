import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ISLAND_GZ_BYTES, ISLAND_PATH, LOGO_PATH } from '../dist/island/assets.gen';
import { app } from './index';
import { parseForm, pickAnswers } from './survey';
import { CSS } from './styles';
import { resetSettingsCache } from './supabase';
import { DEVICE, SESSION, activeSession, bindings, json, pgError, routeFetch } from './test-fixtures';

const ORIGIN = 'http://localhost';
const COOKIE = `dev-svs=${SESSION}; dev-svd=${DEVICE}`;
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const IDEM = '33333333-3333-4333-8333-333333333333';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  resetSettingsCache();
});

function stub(routes: Parameters<typeof routeFetch>[0]) {
  const r = routeFetch(routes);
  vi.stubGlobal('fetch', vi.fn(r.fn));
  return r.calls;
}

const api = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}, env = {}) =>
  app.request(
    `/customerfeedback/api/v1/survey/${path}`,
    {
      ...init,
      headers: { origin: ORIGIN, cookie: COOKIE, 'content-type': 'application/json', ...init.headers },
    },
    { ...bindings, ...env },
  );

describe('GET /healthz', () => {
  it('returns ok when the database answers', async () => {
    stub({ healthz: () => json('ok') });
    const res = await app.request('/healthz', {}, bindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    stub({ healthz: () => new Response('', { status: 500 }) });
    const res = await app.request('/healthz', {}, bindings);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ db: 'unreachable' });
  });

  it('sends the service key only to Supabase', async () => {
    const calls = stub({ healthz: () => json('ok') });
    await app.request('/healthz', {}, bindings);
    expect(calls.every((c) => c.url.startsWith(bindings.SUPABASE_URL))).toBe(true);
  });

  it('fails closed on a missing HMAC key', async () => {
    const res = await app.request('/healthz', {}, { ...bindings, SURVEY_HMAC_KEY: undefined });
    expect(res.status).toBe(503);
  });
});

describe('survey entry (T-M05-001, T-M05-020, FR-01′)', () => {
  it('starts a session, sets both cookies and renders all five sections with the inlined definition', async () => {
    const calls = stub({ survey_start_session: () => json(activeSession()) });
    const res = await app.request('/customerfeedback?src=sms', {}, bindings);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const cookies = res.headers.getSetCookie();
    expect(
      cookies.some((c) =>
        /^dev-svs=[A-Za-z0-9_-]{22}; Max-Age=86400; Path=\/; HttpOnly; SameSite=Lax$/.test(c),
      ),
    ).toBe(true);
    expect(
      cookies.some((c) =>
        /^dev-svd=[A-Za-z0-9_-]{22}; Max-Age=31536000; Path=\/; HttpOnly; SameSite=Lax$/.test(c),
      ),
    ).toBe(true);
    const body = await res.text();
    expect(body).toContain('Thanks for choosing Serene Insurance. 5 quick questions, under a minute.');
    expect(body.match(/<section/g)).toHaveLength(5);
    expect(body).toContain('id="sv-boot"');
    expect(body).toContain(ISLAND_PATH);
    expect(body).toContain('Walk-in at a branch office');
    expect(calls[0]!.body).toMatchObject({ p_src: 'sms', p_qr_code: null });
    expect(res.headers.get('content-security-policy')).toMatch(
      /script-src 'nonce-[0-9a-f]{32}' https:\/\/challenges\.cloudflare\.com/,
    );
  });

  it('uses __Host- cookies with Secure over https', async () => {
    stub({ survey_start_session: () => json(activeSession()) });
    const res = await app.request('https://feedback.example/customerfeedback', {}, bindings);
    const cookies = res.headers.getSetCookie();
    expect(cookies.every((c) => c.startsWith('__Host-sv') && c.endsWith('; Secure'))).toBe(true);
  });

  it('reuses valid cookie values (T-M05-021: no branch inferred)', async () => {
    const calls = stub({ survey_start_session: () => json(activeSession({ new: false })) });
    const res = await app.request('/customerfeedback', { headers: { cookie: COOKIE } }, bindings);
    expect(res.status).toBe(200);
    expect(calls[0]!.body).toMatchObject({ p_session: SESSION, p_device: DEVICE, p_qr_code: null });
    // the branch question is hidden until the customer picks Walk-in or Other
    expect(await res.text()).toMatch(/data-q="branch"\s+data-off/);
  });

  it('old QR-point links redirect to the form without recording anything (revision Q)', async () => {
    const calls = stub({ survey_start_session: () => json(activeSession()) });
    const res = await app.request('/customerfeedback/q/K7P2', { headers: { cookie: COOKIE } }, bindings);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/customerfeedback');
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('"Share more feedback" issues a fresh session and starts a blank survey', async () => {
    const calls = stub({ survey_start_session: () => json(activeSession()) });
    const res = await app.request('/customerfeedback/new', { headers: { cookie: COOKIE } }, bindings);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/customerfeedback');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    const fresh = /^dev-svs=([A-Za-z0-9_-]{22}); Max-Age=86400; Path=\/; HttpOnly; SameSite=Lax$/.exec(
      cookies[0]!,
    );
    expect(fresh).not.toBeNull();
    expect(fresh![1]).not.toBe(SESSION);
    expect(calls).toHaveLength(0);

    // Following the redirect with the new cookie starts a new session on the same device.
    await app.request(
      '/customerfeedback',
      { headers: { cookie: `dev-svs=${fresh![1]}; dev-svd=${DEVICE}` } },
      bindings,
    );
    expect(calls[0]!.body).toMatchObject({ p_session: fresh![1], p_device: DEVICE });
  });

  it('uses a __Host- session cookie for "Share more feedback" over https', async () => {
    const res = await app.request('https://feedback.example/customerfeedback/new', {}, bindings);
    expect(res.status).toBe(303);
    expect(res.headers.getSetCookie()[0]).toMatch(/^__Host-svs=.*; Secure$/);
  });

  it('shows the already-shared page inside the cooldown (T-M06-021, FR-34)', async () => {
    stub({ survey_start_session: () => json({ status: 'cooldown' }) });
    const res = await app.request('/customerfeedback', {}, bindings);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('already shared your feedback');
    expect(body).not.toContain('<form');
  });

  it('shows the confirmation for a submitted session, never the form (T-M06-110)', async () => {
    stub({
      survey_start_session: () =>
        json({ status: 'submitted', reference: 'FB-2026-000123', contact_masked: '024 ••• 4567' }),
    });
    const res = await app.request('/customerfeedback', { headers: { cookie: COOKIE } }, bindings);
    const body = await res.text();
    expect(body).toContain('Thank you! Your feedback has been received.');
    expect(body).toContain('FB-2026-000123');
    expect(body).toContain('Our customer experience team may call you on 024 ••• 4567.');
    expect(body).toContain('/customerfeedback/privacy');
    expect(body).toMatch(
      /<a class="btn btn-secondary" href="\/customerfeedback\/new"[^>]*>\s*Share more feedback/,
    );
    expect(body).not.toContain('<form');
  });

  it('shows "can\'t take feedback right now" when the database is down (S-C8)', async () => {
    stub({ survey_start_session: () => new Response('', { status: 503 }) });
    const res = await app.request('/customerfeedback', {}, bindings);
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain('take feedback right now.');
    expect(body).not.toContain('<form');
  });

  it('renders Page 5 without a visible heading, even after a low score (v2)', async () => {
    stub({
      survey_start_session: () =>
        json(
          activeSession({
            page: 5,
            answers: { channel: 'MOBILE_APP', product: 'MOTOR', csat: 2, ces: 3, nps: 4 },
          }),
        ),
    });
    const body = await (
      await app.request('/customerfeedback', { headers: { cookie: COOKIE } }, bindings)
    ).text();
    expect(body).toMatch(/data-page="5"\s+data-current/);
    expect(body).not.toContain('fell short');
    expect(body).not.toContain('Additional feedback');
    expect(body).toMatch(/<h1\s+id="t-5"\s+tabindex="-1"\s+class="sr-only"\s*>\s*Section 5 of 5/);
    expect(body).toContain('What main thing should we improve upon?');
  });

  it('serves the island and the logo with immutable caching', async () => {
    const js = await app.request(ISLAND_PATH, {}, bindings);
    expect(js.status).toBe(200);
    expect(js.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(js.headers.get('content-type')).toContain('javascript');
    const logo = await app.request(LOGO_PATH, {}, bindings);
    expect(logo.headers.get('content-type')).toBe('image/svg+xml');
    expect((await app.request('/customerfeedback/assets/island.0000.js', {}, bindings)).status).toBe(404);
  });

  it('keeps the island under the 35 KB gz budget', () => {
    expect(ISLAND_GZ_BYTES).toBeLessThan(35 * 1024);
  });
});

describe('resume choice for a returning customer', () => {
  const draft = { channel: 'MOBILE_APP', product: 'MOTOR', csat: 4 };
  const returning = (overrides: Record<string, unknown> = {}) =>
    json(
      activeSession({
        new: false,
        page: 2,
        answers: draft,
        opened_at: '2026-11-05T14:05:00.000Z',
        ...overrides,
      }),
    );
  const open = (path = '/customerfeedback') => app.request(path, { headers: { cookie: COOKIE } }, bindings);
  const bootOf = (body: string) =>
    JSON.parse(/<script type="application\/json" id="sv-boot">([\s\S]*?)<\/script>/.exec(body)![1]!) as {
      page: number;
      resumed: boolean;
      fresh: boolean;
    };

  it('asks first instead of silently reopening the unfinished form', async () => {
    stub({ survey_start_session: () => returning() });
    const res = await open();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = await res.text();
    expect(body).toContain('Welcome back');
    expect(body).toContain('You started this form on 5 November 2026 at 2:05 pm.');
    expect(body).toMatch(/<form class="resume" method="post" action="\/customerfeedback\/resume"/);
    expect(body).toMatch(
      /<button type="submit" class="btn" name="choice" value="continue">\s*Pick up where you left off\s*<\/button>/,
    );
    expect(body).toMatch(
      /<button type="submit" class="btn btn-secondary" name="choice" value="new">\s*Start a new feedback form\s*<\/button>/,
    );
    expect(body).not.toContain('id="sv-form"');
    expect(body).not.toContain(ISLAND_PATH); // a plain form: the same with or without JavaScript
  });

  it('does not ask for a brand-new session or an empty draft', async () => {
    stub({ survey_start_session: () => returning({ answers: { contact_consent: false } }) });
    expect(await (await open()).text()).toContain('id="sv-form"');
    stub({ survey_start_session: () => json(activeSession({ answers: draft })) });
    expect(await (await open()).text()).toContain('id="sv-form"');
  });

  it('"Pick up" restores the answers and opens the first page with an unanswered required question', async () => {
    stub({ survey_start_session: () => returning({ page: 1 }) });
    const body = await (await open('/customerfeedback?resume=1')).text();
    expect(body).toContain('id="sv-form"');
    const boot = bootOf(body);
    expect(boot).toMatchObject({ page: 3, resumed: true, fresh: false, answers: draft });
    expect(body).toMatch(/data-page="3"\s+data-current/);
    expect(body).toMatch(/value="MOBILE_APP"\s+checked/);
  });

  it('a draft with every required answer opens on the last page, where Submit is', async () => {
    stub({
      survey_start_session: () =>
        returning({ page: 2, answers: { ...draft, ces: 5, nps: 9, factor: 'NOTHING' } }),
    });
    expect(bootOf(await (await open('/customerfeedback?resume=1')).text()).page).toBe(5);
  });

  const choose = (choice: string, headers: Record<string, string> = {}) =>
    app.request(
      '/customerfeedback/resume',
      {
        method: 'POST',
        body: new URLSearchParams({ choice }).toString(),
        headers: {
          origin: ORIGIN,
          cookie: COOKIE,
          'content-type': 'application/x-www-form-urlencoded',
          ...headers,
        },
      },
      bindings,
    );

  it('POST "continue" goes back to the form with ?resume=1 and changes nothing', async () => {
    const calls = stub({});
    const res = await choose('continue');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/customerfeedback?resume=1');
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('POST "new" abandons the old draft server-side and starts a blank form with a fresh session', async () => {
    const calls = stub({ survey_abandon_session: () => json({ status: 'abandoned' }) });
    const res = await choose('new');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/customerfeedback?fresh=1');
    expect(calls).toEqual([
      expect.objectContaining({ target: 'survey_abandon_session', body: { p_session: SESSION } }),
    ]);
    const cookie = res.headers.getSetCookie();
    expect(cookie).toHaveLength(1);
    const fresh = /^dev-svs=([A-Za-z0-9_-]{22});/.exec(cookie[0]!)![1];
    expect(fresh).not.toBe(SESSION);

    stub({ survey_start_session: () => json(activeSession()) });
    const body = await (
      await app.request(
        '/customerfeedback?fresh=1',
        { headers: { cookie: `dev-svs=${fresh}; dev-svd=${DEVICE}` } },
        bindings,
      )
    ).text();
    expect(bootOf(body)).toMatchObject({ page: 1, fresh: true, resumed: false, answers: {} });
  });

  it('POST "new" shows the unavailable page when the database is down, and refuses cross-site posts', async () => {
    stub({ survey_abandon_session: () => new Response('', { status: 503 }) });
    const res = await choose('new');
    expect(res.status).toBe(503);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    stub({});
    expect((await choose('new', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await choose('nonsense')).headers.get('location')).toBe('/customerfeedback');
  });

  it('the thank-you page still wins over the choice for a submitted session', async () => {
    stub({
      survey_start_session: () =>
        json({ status: 'submitted', reference: 'FB-2026-000009', contact_masked: null }),
    });
    const body = await (await open()).text();
    expect(body).toContain('FB-2026-000009');
    expect(body).not.toContain('Welcome back');
  });
});

describe('recommendation scale and improvement options', () => {
  it('renders 0–10 as centred number boxes (no min-width on the digit, tabular figures)', async () => {
    stub({ survey_start_session: () => json(activeSession()) });
    const body = await (await app.request('/customerfeedback', {}, bindings)).text();
    for (let v = 0; v <= 10; v++) expect(body).toContain(`<span class="num">${v}</span>`);
    expect(CSS).toContain('.nps .box{display:grid;place-items:center;gap:0;padding:0;');
    expect(CSS).toContain('.nps .num{min-width:0;font-variant-numeric:tabular-nums;letter-spacing:0}');
    expect(CSS).toContain('.nps{grid-template-columns:repeat(6,minmax(0,1fr))');
  });

  it('offers only the improvement options in the published snapshot', async () => {
    stub({ survey_start_session: () => json(activeSession()) });
    const body = await (await app.request('/customerfeedback', {}, bindings)).text();
    expect(body).toContain('Speed of service');
    expect(body).not.toContain('Ease of the process');
    expect(body).not.toContain('Pricing and charges');
  });
});

describe('privacy notice (M16, T-M06-050)', () => {
  it('shows only the settings that are set', async () => {
    stub({
      [`${bindings.SUPABASE_URL}/rest/v1/settings`]: () =>
        json([
          { key: 'company_legal_name', value: 'Serene Insurance LTD' },
          { key: 'support_phone', value: '0302 000 000' },
          { key: 'support_email', value: '' },
          { key: 'data_protection_contact', value: '' },
          { key: 'dpc_registration_number', value: '' },
        ]),
    });
    const res = await app.request('/customerfeedback/privacy', {}, bindings);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Serene Insurance LTD');
    expect(body).toContain('Phone: 0302 000 000');
    expect(body).not.toContain('Email:');
    expect(body).not.toContain('registration number');
    expect(body).toContain('Act 843');
  });
});

describe('PATCH /answers (A-61, Rule 19)', () => {
  const patch = (body: unknown, headers: Record<string, string> = {}, env = {}) =>
    api('answers', { method: 'PATCH', body: JSON.stringify(body), headers }, env);

  it('saves the draft by seq and never sends contact details to the draft', async () => {
    const calls = stub({ survey_save_draft: () => json({ answers: {}, seq: 3 }) });
    const res = await patch({
      seq: 3,
      page: 2,
      answers: { csat: 4, phone: '0241234567', first_name: 'Ama', bogus: 1 },
    });
    expect(res.status).toBe(204);
    expect(calls[0]!.body).toEqual({ p_session: SESSION, p_seq: 3, p_page: 2, p_answers: { csat: 4 } });
  });

  it('rejects a foreign or missing Origin with 403 bad-origin', async () => {
    stub({});
    const res = await patch({ seq: 1, answers: {} }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toMatchObject({
      code: 'bad-origin',
      type: `${ORIGIN}/customerfeedback/errors/bad-origin`,
    });
  });

  it('caps bodies at 8 KB', async () => {
    stub({});
    const res = await patch({ seq: 1, answers: { comment: 'x'.repeat(9000) } });
    expect(res.status).toBe(413);
  });

  it('answers 410 session-expired without a session cookie', async () => {
    stub({});
    const res = await patch({ seq: 1, answers: { csat: 1 } }, { cookie: '' });
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: 'session-expired' });
  });

  it.each([
    ['rate-limited', 429],
    ['session-expired', 410],
    ['already-shared', 409],
    ['validation-failed', 422],
    ['unavailable', 503],
  ])('maps the database error %s to HTTP %i', async (message, status) => {
    stub({ survey_save_draft: () => pgError(message) });
    const res = await patch({ seq: 2, answers: { csat: 1 } });
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code: message, status });
  });

  it('maps an unreachable database to 503 unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('network'))),
    );
    const res = await patch({ seq: 2, answers: { csat: 1 } });
    expect(res.status).toBe(503);
  });

  it('refuses a bad seq with 400', async () => {
    stub({});
    expect((await patch({ seq: 0, answers: {} })).status).toBe(400);
    expect((await patch({ seq: 'x', answers: {} })).status).toBe(400);
  });
});

describe('POST /events (FR-39, T-M06-040)', () => {
  it('forwards known event types only and answers 204', async () => {
    const calls = stub({ survey_log_events: () => new Response(null, { status: 204 }) });
    const res = await api('events', {
      method: 'POST',
      body: JSON.stringify([
        { type: 'interactive', page: 1, clientTs: '2026-11-05T10:00:00.000Z' },
        { type: 'page_view', page: 2, clientTs: '2026-11-05T10:00:01.000Z', detail: { x: 1 } },
        { type: 'drop_table', page: 1 },
      ]),
    });
    expect(res.status).toBe(204);
    const events = (calls[0]!.body as { p_events: { type: string }[] }).p_events;
    expect(events.map((e) => e.type)).toEqual(['interactive', 'page_view']);
  });

  it('is best effort: a database failure still answers 204', async () => {
    stub({ survey_log_events: () => new Response('', { status: 500 }) });
    const res = await api('events', { method: 'POST', body: JSON.stringify([{ type: 'back', page: 3 }]) });
    expect(res.status).toBe(204);
  });
});

describe('POST /submit (M07, FR-14′, T-M05-011)', () => {
  const answers = { channel: 'MOBILE_APP', product: 'MOTOR', csat: 4, ces: 5, nps: 9 };
  const submit = (body: unknown, headers: Record<string, string> = { 'idempotency-key': IDEM }, env = {}) =>
    api('submit', { method: 'POST', body: JSON.stringify(body), headers }, env);
  const ok = () => json({ reference: 'FB-2026-000001', contact_masked: null });

  it('verifies Turnstile, then submits as verified with the Idempotency-Key', async () => {
    const calls = stub({ [SITEVERIFY]: () => json({ success: true }), survey_submit: ok });
    const res = await submit({ answers, turnstileToken: 'tok' });
    expect(res.status).toBe(200);
    // exactly two hops on the critical path, and their durations are exposed for measuring
    expect(calls.map((c) => c.target)).toEqual([SITEVERIFY, 'survey_submit']);
    expect(res.headers.get('server-timing')).toMatch(/^turnstile;dur=\d+, db;dur=\d+$/);
    expect(await res.json()).toMatchObject({
      reference: 'FB-2026-000001',
      contactMasked: null,
      verification: 'verified',
    });
    const rpc = calls.find((c) => c.target === 'survey_submit')!;
    expect(rpc.body).toEqual({
      p_session: SESSION,
      p_idempotency_key: IDEM,
      p_answers: answers,
      p_verification: 'verified',
    });
  });

  it('a rejected token is 403 verification-failed and logs turnstile_failed', async () => {
    const calls = stub({
      [SITEVERIFY]: () => json({ success: false, 'error-codes': ['invalid-input-response'] }),
      survey_log_events: () => new Response(null, { status: 204 }),
    });
    const res = await submit({ answers, turnstileToken: 'bad' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'verification-failed' });
    expect(calls.some((c) => c.target === 'survey_submit')).toBe(false);
    const logged = calls.find((c) => c.target === 'survey_log_events')!;
    expect(JSON.stringify(logged.body)).toContain('turnstile_failed');
  });

  it('a siteverify outage (network failure, retried once) stores the response as unverified_turnstile_outage', async () => {
    const r = routeFetch({ survey_submit: ok });
    let verifyCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input === SITEVERIFY) {
          verifyCalls++;
          throw new TypeError('network');
        }
        return r.fn(input, init);
      }),
    );
    const res = await submit({ answers, turnstileToken: 'tok' });
    expect(res.status).toBe(200);
    expect(verifyCalls).toBe(2);
    expect(r.calls[0]!.body).toMatchObject({ p_verification: 'unverified_turnstile_outage' });
  });

  it('a client-side Turnstile outage is stored as unverified; no token and no outage flag is refused', async () => {
    const calls = stub({ survey_submit: ok, survey_log_events: () => new Response(null, { status: 204 }) });
    expect((await submit({ answers, turnstile: 'unavailable' })).status).toBe(200);
    expect(calls.find((c) => c.target === 'survey_submit')!.body).toMatchObject({
      p_verification: 'unverified_turnstile_outage',
    });
    expect((await submit({ answers })).status).toBe(403);
  });

  it('needs a UUID Idempotency-Key', async () => {
    stub({});
    const res = await submit({ answers, turnstile: 'unavailable' }, {});
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errors: [{ field: 'idempotency_key', code: 'required' }] });
  });

  it('returns field errors from the database for validation-failed', async () => {
    stub({ survey_submit: () => pgError('validation-failed', '[{"field":"csat","code":"required"}]') });
    const res = await submit({ answers: { channel: 'MOBILE_APP' }, turnstile: 'unavailable' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: 'validation-failed',
      errors: [{ field: 'csat', code: 'required' }],
    });
  });

  it('a second submit with another key is 409 already-shared; a replay returns the same reference (T-M07-002)', async () => {
    stub({ survey_submit: () => pgError('already-shared') });
    expect((await submit({ answers, turnstile: 'unavailable' })).status).toBe(409);
    stub({
      survey_submit: () =>
        json({ reference: 'FB-2026-000001', contact_masked: '024 ••• 4567', replayed: true }),
    });
    expect(await (await submit({ answers, turnstile: 'unavailable' })).json()).toMatchObject({
      reference: 'FB-2026-000001',
      contactMasked: '024 ••• 4567',
      replayed: true,
    });
  });

  it('is rate limited by the RL_SUBMIT binding (429 rate-limited)', async () => {
    stub({ survey_submit: ok });
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const res = await submit(
      { answers, turnstile: 'unavailable' },
      { 'idempotency-key': IDEM, 'cf-connecting-ip': '41.66.0.1' },
      { RL_SUBMIT: limiter },
    );
    expect(res.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledWith({ key: 'RL_SUBMIT:41.66.0.1' });
  });
});

describe('no-JS fallback (A-38, T-M06-060)', () => {
  const post = (form: Record<string, string>, headers: Record<string, string> = {}) =>
    app.request(
      '/customerfeedback/submit',
      {
        method: 'POST',
        body: new URLSearchParams(form).toString(),
        headers: {
          origin: ORIGIN,
          cookie: COOKIE,
          'content-type': 'application/x-www-form-urlencoded',
          ...headers,
        },
      },
      bindings,
    );

  it('submits as unverified_no_js and redirects to the confirmation', async () => {
    const calls = stub({ survey_submit: () => json({ reference: 'FB-2026-000002', contact_masked: null }) });
    const res = await post({
      idem: IDEM,
      channel: 'MOBILE_APP',
      product: 'MOTOR',
      csat: '4',
      ces: '5',
      nps: '10',
      comment: '',
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/customerfeedback');
    expect(calls[0]!.body).toEqual({
      p_session: SESSION,
      p_idempotency_key: IDEM,
      p_answers: {
        channel: 'MOBILE_APP',
        product: 'MOTOR',
        csat: 4,
        ces: 5,
        nps: 10,
        contact_consent: false,
      },
      p_verification: 'unverified_no_js',
    });
  });

  it('re-renders the form with the same server validation messages and keeps the answers', async () => {
    stub({
      survey_submit: () => pgError('validation-failed', '[{"field":"branch","code":"required"}]'),
      survey_start_session: () => json(activeSession({ new: false })),
    });
    const res = await post({
      idem: IDEM,
      channel: 'WALK_IN',
      product: 'MOTOR',
      csat: '4',
      ces: '5',
      nps: '10',
    });
    expect(res.status).toBe(422);
    const body = await res.text();
    expect(body).toContain('Please choose the branch that issued your policy.');
    expect(body).toMatch(/value="WALK_IN"\s+checked/);
  });

  it('refuses a cross-site post', async () => {
    stub({});
    expect((await post({ csat: '1' }, { origin: 'https://evil.example' })).status).toBe(403);
  });
});

describe('answer parsing', () => {
  it('pickAnswers keeps only the fixed slots with scalar values', () => {
    expect(pickAnswers({ csat: 3, comment: 'hi', x: 1, nps: { a: 1 } }, { draft: false })).toEqual({
      csat: 3,
      comment: 'hi',
    });
    expect(pickAnswers([], { draft: false })).toBeNull();
  });
  it('parseForm types ratings and the consent toggle', () => {
    const a = parseForm(new URLSearchParams('csat=2&nps=0&contact_consent=true&phone=024+123+4567&comment='));
    expect(a).toMatchObject({ csat: 2, nps: 0, contact_consent: true, phone: '024 123 4567' });
    expect(a).not.toHaveProperty('comment');
  });
});

describe('site routing (single origin)', () => {
  const assets = (files: Record<string, string>) => ({
    fetch: vi.fn(async (req: Request) => {
      const path = new URL(req.url).pathname;
      const body = files[path];
      return body === undefined
        ? new Response('nope', { status: 404 })
        : new Response(body, {
            headers: { 'content-type': path.endsWith('.js') ? 'text/javascript' : 'text/html' },
          });
    }),
  });

  it('serves the portal SPA shell for unknown /admin paths, uncached, with the portal CSP', async () => {
    const ASSETS = assets({ '/admin/': '<div id="root"></div>', '/admin/assets/index-abc.js': 'x' });
    const res = await app.request('/admin/records/123', {}, { ...bindings, ASSETS });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321");
    // Regression (2026-11-09): private photos are signed Storage URLs on the Supabase origin; without
    // it in img-src every face photo, document and signature image was blocked.
    expect(csp).toContain("img-src 'self' data: blob: http://127.0.0.1:54321;");
    // The certificate preview embeds the PDF rendered in the page (blob: URL) in an <object>.
    expect(csp).toContain("object-src 'self' blob:");
    expect(csp).not.toContain('nonce-');
    const js = await app.request('/admin/assets/index-abc.js', {}, { ...bindings, ASSETS });
    expect(js.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await app.request('/admin/assets/missing.js', {}, { ...bindings, ASSETS })).status).toBe(404);
  });

  it('redirects /admin to /admin/', async () => {
    const res = await app.request('/admin', {}, bindings);
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('/admin/');
  });

  it('serves the landing site at / with its own CSP and a 404 page', async () => {
    const ASSETS = assets({ '/': '<h1>Serene</h1>', '/404.html': 'missing page' });
    const home = await app.request('/', {}, { ...bindings, ASSETS });
    expect(await home.text()).toContain('Serene');
    expect(home.headers.get('content-security-policy')).toContain("script-src 'self'");
    const missing = await app.request('/nope', {}, { ...bindings, ASSETS });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('missing page');
    expect((await app.request('/_headers', {}, { ...bindings, ASSETS })).status).toBe(404);
  });
});

describe('rate-limit configuration (UG-12, T-M05-012)', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

  function limitFor(section: string, name: string): { limit: number; period: number } {
    const block =
      section === '' ? toml.split('[env.')[0]! : toml.split(`[env.${section}]`)[1]!.split('[env.')[0]!;
    const m = block.match(
      new RegExp(`name = "${name}"[^}]*?simple = \\{ limit = (\\d+), period = (\\d+) \\}`, 's'),
    );
    if (!m) throw new Error(`no ${name} in ${section || 'top level'}`);
    return { limit: Number(m[1]), period: Number(m[2]) };
  }

  /** Fixed-window counter, the model of the Workers Rate Limiting binding. */
  function blockedAt(rate: number, seconds: number, { limit, period }: { limit: number; period: number }) {
    let blocked = 0;
    const windows = new Map<number, number>();
    for (let i = 0; i < rate * seconds; i++) {
      const w = Math.floor(i / rate / period);
      const n = (windows.get(w) ?? 0) + 1;
      windows.set(w, n);
      if (n > limit) blocked++;
    }
    return blocked;
  }

  it.each(['', 'staging', 'production'])(
    '%s: 20 submits/s from one IP pass for 15 min; 100/s is blocked',
    (env) => {
      const cfg = limitFor(env, 'RL_SUBMIT');
      expect([10, 60]).toContain(cfg.period);
      expect(blockedAt(20, 15 * 60, cfg)).toBe(0);
      expect(blockedAt(100, 10, cfg)).toBeGreaterThan(0);
      const apiCfg = limitFor(env, 'RL_API');
      expect(blockedAt(20 * 12, 60, apiCfg)).toBe(0); // ~12 API calls per customer at 20 customers/s
    },
  );
});
