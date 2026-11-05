// Shared fixtures for the Worker unit tests (not bundled: only *.test.ts import it).
import type { Definition, Snapshot } from '@serene/survey-engine';
import v2 from '@serene/survey-engine/v2.json';

export const definition = v2 as Definition;

export const snapshot: Snapshot = {
  service_channels: [
    { code: 'MOBILE_APP', label: 'Mobile application', is_other: false, branch_requirement: 'hidden' },
    { code: 'WALK_IN', label: 'Walk-in at a branch office', is_other: false, branch_requirement: 'required' },
    { code: 'OTHER', label: 'Other', is_other: true, branch_requirement: 'optional' },
  ],
  branches: [
    { code: 'KASOA', label: 'Kasoa', is_other: false },
    { code: 'OTHER', label: 'Other branch', is_other: true },
  ],
  insurance_products: [
    { code: 'MOTOR', label: 'Motor insurance', is_other: false },
    { code: 'OTHER', label: 'Other', is_other: true },
  ],
  improvement_factors: [
    { code: 'SPEED', label: 'Speed of service', is_other: false },
    { code: 'OTHER', label: 'Other', is_other: true },
    { code: 'NOTHING', label: 'Nothing, I am satisfied', is_other: false, is_none: true },
  ],
  phone_prefixes: ['020', '024', '054'],
};

export function activeSession(overrides: Record<string, unknown> = {}) {
  return {
    status: 'active',
    session_id: '11111111-1111-4111-8111-111111111111',
    page: 1,
    answers: {},
    seq: 0,
    interactive: false,
    version: { id: '22222222-2222-4222-8222-222222222222', no: 1, definition, snapshot },
    new: true,
    ...overrides,
  };
}

export const bindings = {
  APP_ENV: 'local',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests-0000',
  SURVEY_HMAC_KEY: 'x'.repeat(43),
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
};

export const SESSION = 'AAAAAAAAAAAAAAAAAAAAAA';
export const DEVICE = 'BBBBBBBBBBBBBBBBBBBBBB';

type Handler = (body: unknown, init: RequestInit) => Response | Promise<Response>;

/** A fetch mock routed by RPC name (or full URL for non-RPC calls). Records every call. */
export function routeFetch(routes: Record<string, Handler>) {
  const calls: { target: string; body: unknown; url: string }[] = [];
  const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
    const target = rpc ?? url.split('?')[0] ?? url;
    let body: unknown = init.body;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ target, body, url });
    const h = routes[target];
    if (!h) return new Response(JSON.stringify({ message: `no route for ${target}` }), { status: 404 });
    return h(body, init);
  };
  return { fn, calls };
}

export const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

export const pgError = (message: string, details: string | null = null, code = 'P0001', status = 400) =>
  json({ code, message, details, hint: null }, status);
