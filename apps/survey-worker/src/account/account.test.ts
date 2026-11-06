// Customer API (/api/account/*, /api/verify): auth, CSRF, rate limits, ownership, uploads, submit,
// payments, claims, renewal, verify, and serving the customer SPA. Supabase is a mocked fetch.
import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormDefinition, RatingResult } from '@serene/proposals';
import { app } from '../index';
import { bindings, json, pgError } from '../test-fixtures';
import { resetSalesSettingsCache } from './services';

// ---- A small, stable form so these tests do not depend on the digitised forms (edited elsewhere).
const TEST_FORM: FormDefinition = {
  id: 'motor',
  version: 3,
  title: 'TEST FORM',
  source: 'test',
  steps: [
    {
      id: 's1',
      title: 'Details',
      sections: [
        {
          id: 'a',
          fields: [
            {
              id: 'full_name',
              type: 'text',
              label: 'Name',
              required: true,
              saveToProfile: 'fullName',
              role: 'insuredName',
            },
            { id: 'cover_start', type: 'date', label: 'Start', required: true, role: 'coverStart' },
            { id: 'cover_end', type: 'date', label: 'End', role: 'coverEnd' },
            {
              id: 'id_photo',
              type: 'file',
              label: 'Face photo',
              kind: 'id_selfie',
              accept: ['image'],
              required: true,
              maxFiles: 1,
            },
            {
              id: 'documents',
              type: 'file',
              label: 'Documents',
              kind: 'supporting',
              accept: ['pdf'],
              multiple: true,
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    paragraphs: [],
    confirmations: [{ id: 'truth', label: 'All true' }],
    signatureLabel: 'Signature',
  },
};

const mocks = vi.hoisted(() => ({
  price: null as null | ((...args: unknown[]) => RatingResult),
  certificateThrows: false,
}));
vi.mock('@serene/proposals', async (importOriginal) => {
  const real = await importOriginal<typeof import('@serene/proposals')>();
  return {
    ...real,
    formById: (id: string) => (id === 'motor' ? TEST_FORM : real.formById(id)),
    priceProposal: (...args: Parameters<typeof real.priceProposal>) =>
      mocks.price ? mocks.price(...args) : real.priceProposal(...args),
    buildCertificate: (input: Parameters<typeof real.buildCertificate>[0]) => {
      if (mocks.certificateThrows) throw new Error('buildCertificate not implemented');
      return {
        kind: 'motor',
        actLine: 'ACT',
        coverTitle: 'MOTOR THIRD PARTY ONLY',
        certificateNo: input.certificateNo,
        policyNo: input.policyNo,
        customerNo: input.customerNo,
        policyHolder: input.policyHolder,
        numberedItems: [],
        clauses: [],
        facts: [],
        effectiveDate: input.startsOn,
        expiryDate: input.expiresOn,
        issuedAt: input.issuedAt,
        certifyText: 'x',
        signatoryTitle: 'CHIEF EXECUTIVE OFFICER',
        ...(input.verifyUrl ? { verifyUrl: input.verifyUrl } : {}),
      };
    },
  };
});

// ---- Fixtures ----------------------------------------------------------------------------------
const ORIGIN = 'http://localhost';
const TOKEN = 'T'.repeat(43);
const COOKIE = `dev-serene_account=${TOKEN}`;
const A = {
  customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  customerNo: 'USR10001',
  phone: '+233241234567',
};
const PID = '11111111-1111-4111-8111-111111111111';
const FID = '22222222-2222-4222-8222-222222222222';
const POL = '33333333-3333-4333-8333-333333333333';
const CLM = '44444444-4444-4444-8444-444444444444';
const REF = 'PAY-ABCDEFGH23';
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

const settingsRows = (over: Record<string, unknown> = {}) =>
  Object.entries({
    sales_sms_mode: 'simulated',
    sales_sms_sender_id: 'Serene',
    sales_payment_mode: 'simulated',
    sales_tppd_limit: 8000,
    sales_quote_validity_days: 30,
    sales_certificate_signatory_title: 'CHIEF EXECUTIVE OFFICER',
    sales_rates: { version: 1 },
    ...over,
  }).map(([key, value]) => ({ key, value }));

const draft = (over: Record<string, unknown> = {}) => ({
  id: PID,
  proposalNo: 'PRP-26-000001',
  productCode: 'MTR',
  status: 'draft',
  currentStep: 0,
  updatedAt: '2026-11-06T10:00:00+00:00',
  formId: 'motor',
  formVersion: 3,
  answers: {},
  files: [],
  history: [],
  ...over,
});

type Handler = (body: unknown, init: RequestInit, url: string) => Response | Promise<Response>;
interface Call {
  target: string;
  body: unknown;
  url: string;
  init: RequestInit;
}

/** fetch routed by RPC name, or by URL prefix for REST/Storage/SMS calls. */
function stub(
  routes: Record<string, Handler> = {},
  opts: { session?: unknown; settings?: Record<string, unknown> } = {},
) {
  const all: Record<string, Handler> = {
    account_session_resolve: () => json(opts.session === undefined ? A : opts.session),
    'http://127.0.0.1:54321/rest/v1/settings': () => json(settingsRows(opts.settings)),
    ...routes,
  };
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
      let body: unknown = init.body;
      if (typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      const target = rpc ?? url.split('?')[0] ?? url;
      calls.push({ target, body, url, init });
      const key =
        rpc && all[rpc] ? rpc : Object.keys(all).find((k) => k.includes('://') && url.startsWith(k));
      const h = key ? all[key] : undefined;
      if (!h) return new Response(JSON.stringify({ message: `no route for ${target}` }), { status: 404 });
      return h(body, init, url);
    }),
  );
  return calls;
}
const rpcArgs = (calls: Call[], fn: string) =>
  calls.find((c) => c.target === fn)?.body as Record<string, unknown> | undefined;

function call(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
  env: Record<string, unknown> = {},
) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    'x-requested-with': 'serene-account',
    cookie: COOKIE,
    ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
    ...init.headers,
  };
  return app.request(
    path.startsWith('/api/') ? path : `/api/account${path}`,
    { ...init, headers },
    { ...bindings, ...env },
  );
}
const post = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  env: Record<string, unknown> = {},
) => call(path, { method: 'POST', body: JSON.stringify(body), headers }, env);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.price = null;
  mocks.certificateThrows = false;
});
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  resetSalesSettingsCache();
});

// ---------------------------------------------------------------------------
describe('sign-in: POST /otp/start', () => {
  it('normalises the phone, stores only an HMAC of the code and shows the code in test mode', async () => {
    const calls = stub({
      account_otp_start: () => json({ ok: true, expiresInSeconds: 300, resendInSeconds: 30 }),
    });
    const res = await post('/otp/start', { phone: '024 123 4567' }, { cookie: '' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challengeId: string; simulatedCode: string; maskedPhone: string };
    expect(body.maskedPhone).toBe('024 *** 4567');
    expect(body.simulatedCode).toMatch(/^\d{6}$/);
    const args = rpcArgs(calls, 'account_otp_start')!;
    expect(args.p_phone).toBe('+233241234567');
    expect(args.p_challenge_id).toBe(body.challengeId);
    const expected = createHmac('sha256', bindings.SURVEY_HMAC_KEY)
      .update(`account-otp:${body.challengeId}:${body.simulatedCode}`)
      .digest('hex');
    expect(args.p_code_hmac).toBe(expected);
    expect(JSON.stringify(calls)).not.toContain(`"${body.simulatedCode}"`);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it.each(['+44 7700 900123', '030 222 2222', '24123', 'abc'])(
    'refuses %s with 422 errors[] (Ghana mobiles only)',
    async (phone) => {
      const calls = stub();
      const res = await post('/otp/start', { phone });
      expect(res.status).toBe(422);
      expect(res.headers.get('content-type')).toBe('application/problem+json');
      expect(await res.json()).toMatchObject({ status: 422, errors: [{ field: 'phone' }] });
      expect(calls.some((c) => c.target === 'account_otp_start')).toBe(false);
    },
  );

  it('passes on the per-phone limits as 429 with Retry-After', async () => {
    stub({ account_otp_start: () => json({ ok: false, error: 'too-soon', retryAfterSeconds: 21 }) });
    const res = await post('/otp/start', { phone: '0241234567' });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('21');
    expect(await res.json()).toMatchObject({ retryAfterSeconds: 21 });
  });

  it('sends through Arkesel only when the setting says so and the key exists', async () => {
    const calls = stub(
      {
        account_otp_start: () => json({ ok: true }),
        'https://sms.arkesel.com/': () => json({ status: 'success', data: [] }),
      },
      { settings: { sales_sms_mode: 'arkesel', sales_sms_sender_id: 'SereneIns' } },
    );
    const res = await post('/otp/start', { phone: '0551234567' }, {}, { ARKESEL_API_KEY: 'ark-key' });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty('simulatedCode');
    const sms = calls.find((c) => c.url.startsWith('https://sms.arkesel.com/'))!;
    expect((sms.init.headers as Record<string, string>)['api-key']).toBe('ark-key');
    expect(sms.body).toMatchObject({ sender: 'SereneIns', recipients: ['233551234567'] });
    expect((sms.body as { message: string }).message).toMatch(/Your Serene Insurance code is \d{6}\./);
  });

  it('stays simulated in arkesel mode without the secret', async () => {
    const calls = stub(
      { account_otp_start: () => json({ ok: true }) },
      { settings: { sales_sms_mode: 'arkesel' } },
    );
    const res = await post('/otp/start', { phone: '0551234567' });
    expect(await res.json()).toHaveProperty('simulatedCode');
    expect(calls.some((c) => c.url.includes('arkesel'))).toBe(false);
  });

  it('a failed SMS send is 503, never a code on screen', async () => {
    stub(
      {
        account_otp_start: () => json({ ok: true }),
        'https://sms.arkesel.com/': () => json({ status: 'error' }, 500),
      },
      { settings: { sales_sms_mode: 'arkesel' } },
    );
    const res = await post('/otp/start', { phone: '0551234567' }, {}, { ARKESEL_API_KEY: 'k' });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/simulatedCode/);
  });

  it('if the settings cannot be read, sign-in fails closed (no simulated code)', async () => {
    stub({ 'http://127.0.0.1:54321/rest/v1/settings': () => new Response('', { status: 500 }) });
    const res = await post('/otp/start', { phone: '0551234567' });
    expect(res.status).toBe(503);
  });
});

describe('sign-in: POST /otp/verify', () => {
  const CH = '55555555-5555-4555-8555-555555555555';
  const profile = {
    customerNo: 'USR10001',
    phone: '+233241234567',
    marketingConsent: false,
    createdAt: '2026-11-06',
  };

  it('sets the session cookie with the spec flags and stores only the token hash', async () => {
    const calls = stub({ account_otp_verify: () => json({ ok: true, isNew: true, profile }) });
    const res = await app.request(
      'https://serene.example/api/account/otp/verify',
      {
        method: 'POST',
        headers: {
          origin: 'https://serene.example',
          'x-requested-with': 'serene-account',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ challengeId: CH, code: '123 456' }),
      },
      bindings,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile, isNew: true });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(
      /^__Host-serene_account=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/,
    );
    const token = cookie.split(';')[0]!.split('=')[1]!;
    const args = rpcArgs(calls, 'account_otp_verify')!;
    expect(args.p_token_hash).toBe(sha(token));
    expect(args.p_code_hmac).toBe(
      createHmac('sha256', bindings.SURVEY_HMAC_KEY).update(`account-otp:${CH}:123456`).digest('hex'),
    );
    expect(JSON.stringify(calls)).not.toContain(token);
  });

  it('a wrong code is 422 with the attempts left; a locked challenge is 429', async () => {
    stub({ account_otp_verify: () => json({ ok: false, error: 'invalid', attemptsLeft: 3 }) });
    const bad = await post('/otp/verify', { challengeId: CH, code: '000000' });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({
      errors: [{ field: 'code', message: 'That code is not right. 3 attempts left.' }],
    });
    expect(bad.headers.get('set-cookie')).toBeNull();
    stub({ account_otp_verify: () => json({ ok: false, error: 'locked', attemptsLeft: 0 }) });
    expect((await post('/otp/verify', { challengeId: CH, code: '000000' })).status).toBe(429);
  });

  it('refuses malformed input without calling the database', async () => {
    const calls = stub();
    expect((await post('/otp/verify', { challengeId: 'x', code: '123456' })).status).toBe(422);
    expect((await post('/otp/verify', { challengeId: CH, code: '12345' })).status).toBe(422);
    expect(calls.some((c) => c.target === 'account_otp_verify')).toBe(false);
  });
});

describe('CSRF, rate limits and sessions', () => {
  it.each([
    ['no x-requested-with', { 'x-requested-with': '' }],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['no Origin', { origin: '' }],
  ])('refuses a state-changing request with %s (403)', async (_name, headers) => {
    const calls = stub({ account_cancel_proposal: () => json(draft()) });
    const res = await post(`/proposals/${PID}/cancel`, {}, headers);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('public POSTs (sign-in, quick quote) need the CSRF header too', async () => {
    stub();
    expect((await post('/otp/start', { phone: '0241234567' }, { 'x-requested-with': '' })).status).toBe(403);
    expect(
      (await post('/quick-quote', { productCode: 'MTR', answers: {} }, { origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
  });

  it('GET requests need no CSRF header', async () => {
    stub({ account_list_proposals: () => json([]) });
    expect((await call('/proposals', { headers: { 'x-requested-with': '', origin: '' } })).status).toBe(200);
  });

  it('RL_API limits every route per IP', async () => {
    const calls = stub();
    const RL_API = { limit: vi.fn(async () => ({ success: false })) };
    const res = await call('/catalogue', { headers: { 'cf-connecting-ip': '203.0.113.7' } }, { RL_API });
    expect(res.status).toBe(429);
    expect(RL_API.limit).toHaveBeenCalledWith({ key: 'account:203.0.113.7' });
    expect(calls).toHaveLength(0);
    const v = await app.request('/api/verify?certificate=C01-26-00001&reg=GN1', {}, { ...bindings, RL_API });
    expect(v.status).toBe(429);
  });

  it('signed-out requests get 401 and the stale cookie is cleared', async () => {
    stub({}, { session: null });
    const res = await call('/me');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toMatch(
      /^dev-serene_account=; HttpOnly; SameSite=Lax; Path=\/; Max-Age=0$/,
    );
  });

  it('a malformed cookie never reaches the database', async () => {
    const calls = stub();
    const res = await call('/me', { headers: { cookie: 'dev-serene_account=short' } });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('the session is resolved by token hash and the customer id comes only from it', async () => {
    const calls = stub({
      account_get_profile: () =>
        json({ customerNo: 'USR10001', phone: A.phone, marketingConsent: false, createdAt: 'x' }),
    });
    const res = await call('/me?customerId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(res.status).toBe(200);
    expect(rpcArgs(calls, 'account_session_resolve')).toEqual({ p_token_hash: sha(TOKEN) });
    expect(rpcArgs(calls, 'account_get_profile')).toEqual({ p_customer_id: A.customerId });
  });

  it('sign-out revokes the session and clears the cookie', async () => {
    const calls = stub({ account_sign_out: () => new Response(null, { status: 204 }) });
    const res = await post('/sign-out', {});
    expect(res.status).toBe(204);
    expect(rpcArgs(calls, 'account_sign_out')).toEqual({ p_token_hash: sha(TOKEN) });
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('unknown API paths are a JSON 404, not the landing site', async () => {
    stub();
    const res = await call('/nope');
    expect(res.status).toBe(404);
    expect((await app.request('/api/other', {}, bindings)).status).toBe(404);
  });
});

describe('profile: PATCH /me', () => {
  it('validates fields (422 errors[]) and never changes the phone', async () => {
    const calls = stub({
      account_update_profile: (b) =>
        json({ customerNo: 'USR10001', phone: A.phone, ...(b as { p_profile: object }).p_profile }),
    });
    const bad = await call('/me', {
      method: 'PATCH',
      body: JSON.stringify({ email: 'nope', dateOfBirth: '2999-01-01' }),
    });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { errors: { field: string }[] }).errors.map((e) => e.field).sort()).toEqual(
      ['dateOfBirth', 'email'],
    );
    const ok = await call('/me', {
      method: 'PATCH',
      body: JSON.stringify({
        phone: '+233200000000',
        fullName: ' Ama Mensah ',
        digitalAddress: 'ga 123 4567',
        marketingConsent: true,
      }),
    });
    expect(ok.status).toBe(200);
    expect(rpcArgs(calls, 'account_update_profile')!.p_profile).toEqual({
      fullName: 'Ama Mensah',
      digitalAddress: 'GA-123-4567',
      marketingConsent: true,
    });
  });

  it('refuses unknown fields', async () => {
    stub();
    expect(
      (await call('/me', { method: 'PATCH', body: JSON.stringify({ identityStatus: 'verified' }) })).status,
    ).toBe(400);
  });
});

describe('ownership: customer A never reaches B’s records', () => {
  const notFound = () => pgError('not-found');

  it.each([
    ['GET', `/proposals/${PID}`, 'account_get_proposal'],
    ['GET', `/files/${FID}`, 'account_get_file'],
    ['GET', `/policies/${POL}`, 'account_get_policy'],
    ['GET', `/payments/${REF}`, 'account_get_payment'],
    ['GET', `/claims/${CLM}`, 'account_get_claim'],
    ['POST', `/proposals/${PID}/cancel`, 'account_cancel_proposal'],
    ['POST', `/policies/${POL}/renew`, 'account_get_policy'],
  ])('%s %s is 404 when the record is not the caller’s', async (method, path, fn) => {
    const calls = stub({ [fn]: notFound });
    const res = await call(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ title: 'Not found.', status: 404 });
    expect(rpcArgs(calls, fn)!.p_customer_id).toBe(A.customerId);
  });

  it('a non-UUID id is 404 without touching the database', async () => {
    const calls = stub();
    expect((await call('/proposals/../../etc')).status).toBe(404);
    expect((await call('/files/not-a-uuid')).status).toBe(404);
    expect((await call('/payments/PAY-x')).status).toBe(404);
    expect(calls.filter((c) => c.target !== 'account_session_resolve')).toHaveLength(0);
  });

  it('list endpoints only ask for the caller’s rows and add product names', async () => {
    const calls = stub({ account_list_proposals: () => json([draft()]) });
    const res = await call('/proposals');
    expect(await res.json()).toEqual([
      expect.objectContaining({
        id: PID,
        productCode: 'MTR',
        productName: 'Motor insurance',
        status: 'draft',
      }),
    ]);
    expect(rpcArgs(calls, 'account_list_proposals')).toEqual({ p_customer_id: A.customerId });
  });
});

describe('proposals', () => {
  it('creates a draft for a known product, keeping only the form’s own answer keys', async () => {
    const calls = stub({ account_create_proposal: () => json(draft()) });
    const res = await post('/proposals', {
      productCode: 'MTR',
      answers: { full_name: 'Ama', cover_start: '2026-12-01', evil: 'x' },
    });
    expect(res.status).toBe(201);
    expect(rpcArgs(calls, 'account_create_proposal')).toEqual({
      p_customer_id: A.customerId,
      p_product_code: 'MTR',
      p_form_id: 'motor',
      p_form_version: 3,
      p_answers: { full_name: 'Ama', cover_start: '2026-12-01' },
    });
    expect((await post('/proposals', { productCode: 'XXX' })).status).toBe(422);
  });

  it('maps the detail without internal fields (storage paths, IP, providerData)', async () => {
    stub({
      account_get_proposal: () =>
        json(
          draft({
            status: 'submitted',
            files: [
              {
                id: FID,
                fieldId: 'id_photo',
                kind: 'id_selfie',
                name: 'me.png',
                mime: 'image/png',
                size: 9,
                createdAt: 'x',
                storagePath: 'a/b/c.png',
              },
            ],
            signature: {
              method: 'drawn',
              signedName: 'Ama',
              signedAt: 'x',
              imagePath: 'a/b/signature.png',
              ip: '203.0.113.1',
            },
            history: [{ at: 'x', event: 'submitted', by: 'customer' }],
          }),
        ),
    });
    const body = await (await call(`/proposals/${PID}`)).json();
    expect(JSON.stringify(body)).not.toMatch(/storagePath|imagePath|203\.0\.113/);
    expect(body).toMatchObject({
      signature: { hasImage: true, signedName: 'Ama' },
      history: [{ event: 'submitted' }],
    });
  });

  it('saves a draft and validates currentStep', async () => {
    const calls = stub({ account_save_proposal: () => json(draft({ currentStep: 2 })) });
    expect(
      (
        await call(`/proposals/${PID}`, {
          method: 'PATCH',
          body: JSON.stringify({ answers: {}, currentStep: -1 }),
        })
      ).status,
    ).toBe(422);
    const res = await call(`/proposals/${PID}`, {
      method: 'PATCH',
      body: JSON.stringify({ answers: { full_name: 'A' }, currentStep: 2 }),
    });
    expect(res.status).toBe(200);
    expect(rpcArgs(calls, 'account_save_proposal')).toMatchObject({
      p_answers: { full_name: 'A' },
      p_current_step: 2,
    });
  });

  it('POST /:id/quote prices the stored answers, or 422 "Referred to an underwriter"', async () => {
    mocks.price = () => ({ ok: false, refer: ['Vehicles over 15 years old need an underwriter.'] });
    stub({ account_get_proposal: () => json(draft()) });
    const res = await post(`/proposals/${PID}/quote`, {});
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      title: 'Referred to an underwriter',
      status: 422,
      detail: 'Vehicles over 15 years old need an underwriter.',
      refer: ['Vehicles over 15 years old need an underwriter.'],
    });
  });
});

describe('uploads: POST /proposals/:id/files', () => {
  const pngBytes = Buffer.from(PNG, 'base64');
  const pdfBytes = Buffer.from('%PDF-1.7\n%test\n');
  const upload = (
    fields: Record<string, string>,
    bytes: Uint8Array,
    name = 'photo.jpg',
    type = 'image/jpeg',
  ) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fd.set('file', new Blob([bytes], { type }), name);
    return app.request(
      `/api/account/proposals/${PID}/files`,
      {
        method: 'POST',
        body: fd,
        headers: { origin: ORIGIN, 'x-requested-with': 'serene-account', cookie: COOKIE },
      },
      bindings,
    );
  };
  const routes = (over: Record<string, Handler> = {}) => ({
    account_get_proposal: () => json(draft()),
    account_add_file: (b: unknown) => {
      const a = b as Record<string, string>;
      return json({
        id: a.p_file_id,
        fieldId: a.p_field_id,
        kind: a.p_kind,
        name: a.p_original_name,
        mime: a.p_mime,
        size: a.p_size,
        createdAt: 'x',
        storagePath: `${A.customerId}/${PID}/${a.p_file_id}.${a.p_extension}`,
      });
    },
    'http://127.0.0.1:54321/storage/v1/object/customer-files/': () => json({ Key: 'x' }),
    ...over,
  });

  it('decides the type from the bytes, stores the sha256 and uploads under customer/proposal/file', async () => {
    const calls = stub(routes());
    const res = await upload(
      { fieldId: 'id_photo', kind: 'whatever' },
      pngBytes,
      '../../evil".jpg',
      'image/jpeg',
    );
    expect(res.status).toBe(201);
    const args = rpcArgs(calls, 'account_add_file')!;
    expect(args).toMatchObject({
      p_customer_id: A.customerId,
      p_field_id: 'id_photo',
      p_kind: 'id_selfie', // from the form, not the client
      p_mime: 'image/png', // sniffed, not the browser's image/jpeg
      p_extension: 'png',
      p_size: pngBytes.length,
      p_sha256: sha(pngBytes),
      p_max_files: 1,
    });
    expect(args.p_original_name).toBe('evil.jpg');
    const put = calls.find((c) => c.url.includes('/storage/v1/object/customer-files/'))!;
    expect(put.url).toBe(
      `http://127.0.0.1:54321/storage/v1/object/customer-files/${A.customerId}/${PID}/${args.p_file_id}.png`,
    );
    expect((put.init.headers as Record<string, string>)['content-type']).toBe('image/png');
    expect(await res.json()).not.toHaveProperty('storagePath');
  });

  it.each([
    ['an HTML file renamed .jpg', Buffer.from('<html><script>alert(1)</script></html>')],
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['a GIF', Buffer.from('GIF89a\x01\x00\x01\x00')],
  ])('refuses %s (415)', async (_n, bytes) => {
    const calls = stub(routes());
    expect((await upload({ fieldId: 'id_photo' }, bytes)).status).toBe(415);
    expect(calls.some((c) => c.target === 'account_add_file')).toBe(false);
  });

  it('accepts JPEG, WebP, HEIC and PDF by their magic bytes; enforces the field’s accept list', async () => {
    stub(routes());
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic'),
      Buffer.from([0, 0, 0, 0]),
    ]);
    for (const b of [jpeg, webp, heic]) expect((await upload({ fieldId: 'id_photo' }, b)).status).toBe(201);
    expect((await upload({ fieldId: 'documents' }, pdfBytes, 'a.pdf', 'application/pdf')).status).toBe(201);
    expect((await upload({ fieldId: 'id_photo' }, pdfBytes, 'a.pdf', 'application/pdf')).status).toBe(415);
    expect((await upload({ fieldId: 'documents' }, pngBytes)).status).toBe(415);
  });

  it('refuses Ghana Card image kinds (L.I. 2523), unknown fields and files over 10 MB', async () => {
    stub(routes());
    for (const kind of ['id_front', 'id_back', 'ghana_card'])
      expect((await upload({ fieldId: 'id_photo', kind }, pngBytes)).status).toBe(400);
    expect((await upload({ fieldId: 'full_name' }, pngBytes)).status).toBe(422);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(pngBytes);
    expect((await upload({ fieldId: 'id_photo' }, big)).status).toBe(413);
  });

  it('removes the row again when the storage upload fails', async () => {
    const calls = stub(
      routes({
        'http://127.0.0.1:54321/storage/v1/object/customer-files/': () => new Response('', { status: 500 }),
        account_delete_file: () => json({ storagePath: 'x' }),
      }),
    );
    const res = await upload({ fieldId: 'id_photo' }, pngBytes);
    expect(res.status).toBe(503);
    expect(rpcArgs(calls, 'account_delete_file')).toMatchObject({
      p_customer_id: A.customerId,
      p_proposal_id: PID,
    });
  });

  it('refuses uploads on a submitted proposal (409)', async () => {
    stub(routes({ account_get_proposal: () => json(draft({ status: 'submitted' })) }));
    expect((await upload({ fieldId: 'id_photo' }, pngBytes)).status).toBe(409);
  });

  it('downloads only as an attachment with nosniff', async () => {
    stub({
      account_get_file: () =>
        json({
          id: FID,
          name: 'my "id".png',
          mime: 'image/png',
          size: 70,
          storagePath: `${A.customerId}/${PID}/${FID}.png`,
        }),
      'http://127.0.0.1:54321/storage/v1/object/customer-files/': () => new Response(pngBytes),
    });
    const res = await call(`/files/${FID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="my _id_.png"; filename\*=UTF-8''/,
    );
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('submit: POST /proposals/:id/submit', () => {
  const fileRow = {
    id: FID,
    fieldId: 'id_photo',
    kind: 'id_selfie',
    name: 'me.png',
    mime: 'image/png',
    size: 70,
    createdAt: 'x',
    storagePath: 'p',
  };
  const good = {
    answers: { full_name: 'Ama Mensah', cover_start: '2026-12-01', id_photo: [FID], hidden_extra: 'dropped' },
    confirmations: ['terms', 'data_processing', 'electronic_signature', 'truth'],
    signature: { method: 'drawn', signedName: 'Ama Mensah', signedAt: '2026-11-06T10:00:00Z', imagePng: PNG },
    marketingConsent: false,
  };
  const routes = (over: Record<string, Handler> = {}) => ({
    account_get_proposal: () => json(draft({ files: [fileRow] })),
    account_submit_proposal: () => json(draft({ status: 'submitted' })),
    'http://127.0.0.1:54321/storage/v1/object/customer-files/': () => json({ Key: 'x' }),
    ...over,
  });

  it('returns 422 with errors[] for invalid answers, missing confirmations and a bad signature', async () => {
    const calls = stub(routes());
    const res = await post(`/proposals/${PID}/submit`, {
      answers: { cover_start: 'tomorrow' },
      confirmations: ['terms'],
      signature: { method: 'drawn', signedName: 'A', imagePng: Buffer.from('GIF89a').toString('base64') },
    });
    expect(res.status).toBe(422);
    const fields = ((await res.json()) as { errors: { field: string }[] }).errors.map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'full_name',
        'cover_start',
        'id_photo',
        'confirmations.data_processing',
        'confirmations.electronic_signature',
        'confirmations.truth',
        'signature',
        'signature.signedName',
      ]),
    );
    expect(calls.some((c) => c.target === 'account_submit_proposal' || c.url.includes('/storage/'))).toBe(
      false,
    );
  });

  it('refuses files that are not this proposal’s (or belong to another field)', async () => {
    stub(
      routes({ account_get_proposal: () => json(draft({ files: [{ ...fileRow, fieldId: 'documents' }] })) }),
    );
    const res = await post(`/proposals/${PID}/submit`, good);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errors: [{ field: 'id_photo' }] });
  });

  it('refuses a signature image over 300 KB', async () => {
    stub(routes());
    const big = Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(301 * 1024)]).toString('base64');
    const res = await post(`/proposals/${PID}/submit`, {
      ...good,
      signature: { ...good.signature, imagePng: big },
    });
    expect(res.status).toBe(422);
  });

  it('cleans, hashes, stores the signature and submits everything in one call', async () => {
    mocks.price = () => ({ ok: false, refer: ['Needs an underwriter'] });
    const calls = stub(routes());
    const res = await post(`/proposals/${PID}/submit`, good, {
      'user-agent': 'UA/1',
      'cf-connecting-ip': '203.0.113.5',
    });
    expect(res.status).toBe(200);
    const cleaned = { full_name: 'Ama Mensah', cover_start: '2026-12-01', id_photo: [FID] };
    const args = rpcArgs(calls, 'account_submit_proposal')!;
    expect(args).toMatchObject({
      p_customer_id: A.customerId,
      p_proposal_id: PID,
      p_form_version: 3,
      p_answers: cleaned,
      p_confirmations: ['terms', 'data_processing', 'electronic_signature', 'truth'],
      p_file_ids: [FID],
      p_quote: null,
      p_refer: ['Needs an underwriter'],
      p_cover_start: '2026-12-01',
      p_profile: { fullName: 'Ama Mensah' },
      p_marketing_consent: false,
    });
    const sortedJson = JSON.stringify({
      cover_start: '2026-12-01',
      full_name: 'Ama Mensah',
      id_photo: [FID],
    });
    expect(args.p_signature).toMatchObject({
      method: 'drawn',
      signedName: 'Ama Mensah',
      ip: '203.0.113.5',
      userAgent: 'UA/1',
      answersSha256: sha(sortedJson),
      imagePath: `${A.customerId}/${PID}/signature.png`,
    });
    const put = calls.find((c) => c.url.includes('/storage/'))!;
    expect(put.url).toContain(`${A.customerId}/${PID}/signature.png`);
    expect((put.init.headers as Record<string, string>)['x-upsert']).toBe('true');
  });

  it('an instant product priced online is submitted with its quote', async () => {
    mocks.price = () => ({
      ok: true,
      quote: {
        currency: 'GHS',
        premium: 557,
        lines: [],
        taxes: [],
        total: 557,
        indicative: false,
        notes: [],
        validUntil: '2026-12-06',
        source: 'rating',
      },
    });
    const calls = stub(routes());
    expect((await post(`/proposals/${PID}/submit`, good)).status).toBe(200);
    expect(rpcArgs(calls, 'account_submit_proposal')).toMatchObject({ p_quote: { total: 557 }, p_refer: [] });
  });

  it('a submitted proposal cannot be submitted again (409)', async () => {
    stub(routes({ account_get_proposal: () => json(draft({ status: 'quoted' })) }));
    expect((await post(`/proposals/${PID}/submit`, good)).status).toBe(409);
  });
});

describe('payments', () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    reference: REF,
    amount: 557,
    method: 'momo',
    network: 'mtn',
    maskedAccount: '024 *** 4567',
    status: 'pending',
    createdAt: 'x',
    proposalId: PID,
    providerData: { simulatedOutcome: 'approve' },
    ...over,
  });

  it('validates MoMo and card details and keeps only a masked account', async () => {
    const calls = stub({ account_payment_start: () => json(pending()) });
    expect((await post(`/proposals/${PID}/payments`, { method: 'momo', account: '0241234567' })).status).toBe(
      422,
    );
    expect(
      (
        await post(`/proposals/${PID}/payments`, {
          method: 'card',
          account: '4242 4242 4242 4241',
          cardExpiry: '12/30',
          cardCvc: '123',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await post(`/proposals/${PID}/payments`, {
          method: 'card',
          account: '4242424242424242',
          cardExpiry: '01/20',
          cardCvc: '123',
        })
      ).status,
    ).toBe(422);
    const res = await post(`/proposals/${PID}/payments`, {
      method: 'card',
      account: '4242 4242 4242 4242',
      cardExpiry: '12/30',
      cardCvc: '123',
    });
    expect(res.status).toBe(201);
    const args = rpcArgs(calls, 'account_payment_start')!;
    expect(args).toMatchObject({
      p_method: 'card',
      p_masked_account: '•••• 4242',
      p_provider_data: { simulatedOutcome: 'approve' },
    });
    expect(JSON.stringify(calls)).not.toContain('4242424242424242');
    expect(JSON.stringify(calls)).not.toContain('"123"');
    expect(await res.json()).not.toHaveProperty('providerData');
  });

  it('marks the documented test numbers to be declined', async () => {
    const calls = stub({ account_payment_start: () => json(pending()) });
    await post(`/proposals/${PID}/payments`, { method: 'momo', network: 'telecel', account: '020 000 0000' });
    expect(rpcArgs(calls, 'account_payment_start')).toMatchObject({
      p_network: 'telecel',
      p_masked_account: '020 *** 0000',
      p_provider_data: { simulatedOutcome: 'decline' },
    });
    const c2 = stub({ account_payment_start: () => json(pending()) });
    await post(`/proposals/${PID}/payments`, {
      method: 'card',
      account: '4000 0000 0000 0002',
      cardExpiry: '12/30',
      cardCvc: '999',
    });
    expect(rpcArgs(c2, 'account_payment_start')).toMatchObject({
      p_provider_data: { simulatedOutcome: 'decline' },
    });
  });

  it('simulate {approve:false} declines the payment', async () => {
    const calls = stub({
      account_get_payment: () => json(pending()),
      account_payment_complete: () =>
        json(pending({ status: 'failed', failureReason: 'You did not approve the payment.' })),
    });
    const res = await post(`/payments/${REF}/simulate`, { approve: false });
    expect(await res.json()).toMatchObject({ status: 'failed' });
    expect(rpcArgs(calls, 'account_payment_complete')).toMatchObject({
      p_approved: false,
      p_customer_id: A.customerId,
    });
  });

  it('a test decline number fails even when approved', async () => {
    const calls = stub({
      account_get_payment: () => json(pending({ providerData: { simulatedOutcome: 'decline' } })),
      account_payment_complete: () => json(pending({ status: 'failed' })),
    });
    await post(`/payments/${REF}/simulate`, { approve: true });
    expect(rpcArgs(calls, 'account_payment_complete')).toMatchObject({
      p_approved: false,
      p_failure_reason: 'The mobile money payment was declined.',
    });
    expect(calls.some((c) => c.target === 'account_payment_reserve')).toBe(false);
  });

  const reserve = {
    alreadyIssued: false,
    policyNo: 'SE26MTP10001-E',
    certificateNo: 'C01-26-00001',
    startsOn: '2026-12-01',
    expiresOn: '2027-11-30',
    issuedAt: '2026-11-06T10:00:00.123+00:00',
    customerNo: 'USR10001',
    fullName: 'Ama Mensah',
  };

  it('approval reserves numbers, builds the certificate and issues the policy', async () => {
    const calls = stub({
      account_get_payment: () => json(pending()),
      account_get_proposal: () =>
        json(draft({ status: 'quoted', answers: { full_name: 'Ama K. Mensah', cover_type: 'tpo' } })),
      account_payment_reserve: () => json(reserve),
      account_payment_complete: () => json(pending({ status: 'succeeded', policyId: POL })),
    });
    const res = await post(`/payments/${REF}/simulate`, { approve: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'succeeded', policyId: POL });
    expect(rpcArgs(calls, 'account_payment_reserve')).toEqual({
      p_customer_id: A.customerId,
      p_reference: REF,
      p_policy_code: 'MTP',
    });
    const cert = rpcArgs(calls, 'account_payment_complete')!.p_certificate as Record<string, string>;
    expect(cert).toMatchObject({
      certificateNo: 'C01-26-00001',
      policyNo: 'SE26MTP10001-E',
      policyHolder: 'Ama K. Mensah',
      issuedAt: '2026-11-06T10:00:00.123Z',
      verifyUrl: 'http://localhost/verify?certificate=C01-26-00001',
      signatoryTitle: 'CHIEF EXECUTIVE OFFICER',
    });
  });

  it('is idempotent: a succeeded payment is returned as it is', async () => {
    const calls = stub({ account_get_payment: () => json(pending({ status: 'succeeded', policyId: POL })) });
    expect(await (await post(`/payments/${REF}/simulate`, { approve: true })).json()).toMatchObject({
      status: 'succeeded',
      policyId: POL,
    });
    expect(calls.some((c) => c.target === 'account_payment_complete')).toBe(false);
  });

  it('if the certificate cannot be built, a clear 500 and the payment stays pending', async () => {
    mocks.certificateThrows = true;
    const calls = stub({
      account_get_payment: () => json(pending()),
      account_get_proposal: () => json(draft({ status: 'quoted' })),
      account_payment_reserve: () => json(reserve),
    });
    const res = await post(`/payments/${REF}/simulate`, { approve: true });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ title: 'We could not produce your certificate.' });
    expect(calls.some((c) => c.target === 'account_payment_complete')).toBe(false);
  });

  it('a quote that expired is 409 when starting a payment', async () => {
    stub({ account_payment_start: () => pgError('quote-expired') });
    const res = await post(`/proposals/${PID}/payments`, {
      method: 'momo',
      network: 'mtn',
      account: '0241234567',
    });
    expect(res.status).toBe(409);
  });
});

describe('policies, renewal and claims', () => {
  const policy = {
    id: POL,
    policyNo: 'SE26MTP10001-E',
    certificateNo: 'C01-26-00001',
    productCode: 'MTR',
    coverTitle: 'MOTOR THIRD PARTY ONLY',
    startsOn: '2026-01-01',
    expiresOn: '2026-12-31',
    status: 'active',
    premium: 557,
    issuedAt: 'x',
    proposalId: PID,
  };

  it('policy detail points at the signature in force at issue, never at the storage path', async () => {
    const payment = {
      reference: REF,
      amount: 557,
      method: 'momo',
      maskedAccount: '024 *** 4567',
      status: 'succeeded',
      createdAt: 'x',
      proposalId: PID,
    };
    stub({
      account_get_policy: () =>
        json({ ...policy, certificate: {}, payment, signaturePath: 'settings/signature-1.png' }),
    });
    const body = await (await call(`/policies/${POL}`)).json();
    expect(body).toMatchObject({ signatureUrl: `/api/account/policies/${POL}/signature` });
    expect(JSON.stringify(body)).not.toContain('settings/');
    stub({ account_get_policy: () => json({ ...policy, certificate: {}, payment }) });
    expect(await (await call(`/policies/${POL}`)).json()).not.toHaveProperty('signatureUrl');
  });

  it('GET /policies/:id/signature serves the recorded image to the owner only', async () => {
    const calls = stub({
      account_get_policy: () => json({ ...policy, signaturePath: 'settings/signature-1.png' }),
      'http://127.0.0.1:54321/storage/v1/object/customer-files/': () =>
        new Response(Buffer.from(PNG, 'base64')),
    });
    const res = await call(`/policies/${POL}/signature`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(calls.find((c) => c.url.includes('/storage/'))!.url).toBe(
      'http://127.0.0.1:54321/storage/v1/object/customer-files/settings/signature-1.png',
    );
    stub({ account_get_policy: () => json(policy) });
    expect((await call(`/policies/${POL}/signature`)).status).toBe(404);
    stub({ account_get_policy: () => pgError('not-found') });
    expect((await call(`/policies/${POL}/signature`)).status).toBe(404);
    stub({
      account_get_policy: () => json({ ...policy, signaturePath: 'settings/signature-1.png' }),
      'http://127.0.0.1:54321/storage/v1/object/customer-files/': () => new Response('<svg/>'),
    });
    expect((await call(`/policies/${POL}/signature`)).status).toBe(404);
  });

  it('renewal names the cover-date keys to move and the file keys to drop', async () => {
    const calls = stub({ account_get_policy: () => json(policy), account_renew_policy: () => json(draft()) });
    const res = await post(`/policies/${POL}/renew`, {});
    expect(res.status).toBe(201);
    expect(rpcArgs(calls, 'account_renew_policy')).toEqual({
      p_customer_id: A.customerId,
      p_policy_id: POL,
      p_form_version: 3,
      p_start_keys: ['cover_start'],
      p_end_keys: ['cover_end'],
      p_drop_keys: ['id_photo', 'documents'],
    });
  });

  it('claims: validates the type for the product line and the incident date', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z'), toFake: ['Date'] });
    try {
      stub({ account_get_policy: () => json(policy) });
      const base = {
        claimType: 'motor_own_damage',
        incidentLocation: 'Spintex Road',
        description: 'Another car hit my rear bumper at the lights.',
      };
      const travelType = await post(`/policies/${POL}/claims`, {
        ...base,
        claimType: 'travel_baggage',
        incidentDate: '2026-06-01',
      });
      expect(await travelType.json()).toMatchObject({ errors: [{ field: 'claimType' }] });
      const future = await post(`/policies/${POL}/claims`, { ...base, incidentDate: '2026-06-16' });
      expect(await future.json()).toMatchObject({
        errors: [{ field: 'incidentDate', message: 'The date of the incident cannot be in the future.' }],
      });
      const before = await post(`/policies/${POL}/claims`, { ...base, incidentDate: '2025-12-31' });
      expect(before.status).toBe(422);
    } finally {
      vi.useRealTimers();
    }
  });

  it('claims: submit lists the missing required documents by name', async () => {
    const calls = stub({
      account_get_claim: () =>
        json({
          id: CLM,
          claimNo: 'CLM-26-000001',
          policyId: POL,
          policyNo: 'x',
          productCode: 'MTR',
          claimType: 'motor_theft',
          status: 'draft',
          incidentDate: 'x',
          reportedAt: 'x',
          updatedAt: 'x',
        }),
      account_submit_claim: () => pgError('documents-missing', 'police_report,vehicle_registration'),
    });
    const res = await post(`/claims/${CLM}/submit`, {});
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      errors: [
        { field: 'police_report', message: 'Please attach: Police report.' },
        { field: 'vehicle_registration', message: 'Please attach: Vehicle registration document (DVLA).' },
      ],
    });
    expect(rpcArgs(calls, 'account_submit_claim')!.p_required_kinds).toEqual([
      'police_report',
      'vehicle_registration',
    ]);
  });

  it('claims: a document kind must belong to the claim type', async () => {
    stub({
      account_get_claim: () =>
        json({ id: CLM, claimType: 'motor_theft', status: 'draft', productCode: 'MTR' }),
    });
    const fd = new FormData();
    fd.set('kind', 'medical_report');
    fd.set('file', new Blob([Buffer.from('%PDF-1.4')]), 'a.pdf');
    const res = await app.request(
      `/api/account/claims/${CLM}/files`,
      {
        method: 'POST',
        body: fd,
        headers: { origin: ORIGIN, 'x-requested-with': 'serene-account', cookie: COOKIE },
      },
      bindings,
    );
    expect(res.status).toBe(422);
  });

  it('claims: removes an attached document for the owner only and deletes the stored file', async () => {
    const FID = '33333333-3333-4333-8333-333333333333';
    // Storage removal failures are logged, never surfaced, so the RPC is what matters here.
    const calls = stub({
      account_delete_claim_file: () => json({ storagePath: `${A.customerId}/claims/${CLM}/${FID}.pdf` }),
    });
    const res = await call(`/claims/${CLM}/files/${FID}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(rpcArgs(calls, 'account_delete_claim_file')).toEqual({
      p_customer_id: A.customerId,
      p_claim_id: CLM,
      p_file_id: FID,
    });
    expect((await call(`/claims/not-a-uuid/files/${FID}`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('public endpoints', () => {
  it('the catalogue needs no session and shows only customer-facing rates', async () => {
    const calls = stub({}, { session: null });
    const res = await app.request('/api/account/catalogue', {}, bindings);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { products: unknown[]; rates: Record<string, unknown> };
    expect(body.products.length).toBeGreaterThanOrEqual(28);
    expect(body.rates).toHaveProperty('taxes');
    expect(JSON.stringify(body.rates)).not.toMatch(/referOver/);
    expect(calls.some((c) => c.target === 'account_session_resolve')).toBe(false);
  });

  it('quick quote: no session; referral uses the agreed 422 shape; body capped at 16 KB', async () => {
    mocks.price = () => ({ ok: false, refer: ['This cover is priced by an underwriter.'] });
    stub({}, { session: null });
    const res = await post('/quick-quote', { productCode: 'FIR', answers: {} }, { cookie: '' });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      title: 'Referred to an underwriter',
      status: 422,
      detail: 'This cover is priced by an underwriter.',
      refer: ['This cover is priced by an underwriter.'],
    });
    expect(
      (await post('/quick-quote', { productCode: 'MTR', answers: { x: 'y'.repeat(17 * 1024) } })).status,
    ).toBe(413);
  });

  it('quick quote returns the quote with the server’s validity', async () => {
    mocks.price = () => ({
      ok: true,
      quote: {
        currency: 'GHS',
        premium: 557,
        lines: [],
        taxes: [],
        total: 557,
        indicative: false,
        notes: [],
        validUntil: '1999-01-01',
        source: 'rating',
      },
    });
    stub({}, { session: null });
    const res = await post('/quick-quote', { productCode: 'MTR', answers: { cover_type: 'tpo' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { validUntil: string }).validUntil > '2026-01-01').toBe(true);
  });

  it('GET /api/verify needs both numbers and returns only the public facts', async () => {
    const calls = stub({
      verify_certificate: () =>
        json({
          found: true,
          status: 'active',
          certificateNo: 'C01-26-00001',
          policyNo: 'SE26MTP10001-E',
          productCode: 'MTR',
          coverTitle: 'MOTOR THIRD PARTY ONLY',
          insuredSubject: 'GN 3181-18 · Nissan Rogue',
          holderInitials: 'A. M.',
          startsOn: '2026-01-01',
          expiresOn: '2026-12-31',
        }),
    });
    const missing = await app.request('/api/verify?certificate=C01-26-00001', {}, bindings);
    expect(missing.status).toBe(422);
    const res = await app.request('/api/verify?certificate=C01-26-00001&reg=GN%203181-18', {}, bindings);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      found: true,
      status: 'active',
      certificateNo: 'C01-26-00001',
      policyNo: 'SE26MTP10001-E',
      productName: 'Motor insurance',
      coverTitle: 'MOTOR THIRD PARTY ONLY',
      insuredSubject: 'GN 3181-18 · Nissan Rogue',
      holderInitials: 'A. M.',
      startsOn: '2026-01-01',
      expiresOn: '2026-12-31',
    });
    expect(rpcArgs(calls, 'verify_certificate')).toEqual({
      p_certificate_no: 'C01-26-00001',
      p_reference: 'GN 3181-18',
    });
    stub({ verify_certificate: () => json({ found: false }) });
    expect(
      await (await app.request('/api/verify?certificate=C01-26-00009&reg=X1234', {}, bindings)).json(),
    ).toEqual({ found: false });
  });
});

describe('customer SPA at /account', () => {
  const assets = (files: Record<string, string>) => ({
    fetch: vi.fn(async (req: Request) => {
      const body = files[new URL(req.url).pathname];
      return body === undefined
        ? new Response('nope', { status: 404 })
        : new Response(body, {
            headers: { 'content-type': req.url.endsWith('.js') ? 'text/javascript' : 'text/html' },
          });
    }),
  });

  it('falls back to the shell, never caches HTML, caches hashed assets forever, with its own CSP', async () => {
    const ASSETS = assets({ '/account/': '<div id="app"></div>', '/account/assets/index-abc.js': 'x' });
    const res = await app.request('/account/proposals/123', {}, { ...bindings, ASSETS });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="app"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("style-src 'self';");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    const js = await app.request('/account/assets/index-abc.js', {}, { ...bindings, ASSETS });
    expect(js.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await app.request('/account/assets/missing.js', {}, { ...bindings, ASSETS })).status).toBe(404);
    const r = await app.request('/account', {}, bindings);
    expect(r.status).toBe(308);
    expect(r.headers.get('location')).toBe('/account/');
  });
});
