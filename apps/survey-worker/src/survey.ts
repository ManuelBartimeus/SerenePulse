// The public survey under /customerfeedback (SPEC §2.4 Public Survey API, M05, M06, M07).
import { Hono, type Context } from 'hono';
import {
  ANSWER_SLOTS,
  pageOf,
  type Answers,
  type Definition,
  type Json,
  type Snapshot,
} from '@serene/survey-engine';
import type { SurveyWorkerEnv } from '@serene/contracts';
import { ISLAND_JS, ISLAND_PATH, LOGO_PATH, LOGO_SVG } from '../dist/island/assets.gen';
import { LOCAL_ONLY, type BootData } from '../shared/boot';
import { BASE, COPY, fieldMessage } from '../shared/copy';
import { loadConfig, type Bindings } from './config';
import type { HeaderVariables } from './headers';
import {
  API_BODY_CAP,
  DEVICE_MAX_AGE,
  FORM_BODY_CAP,
  SESSION_MAX_AGE,
  clientIp,
  cookieNames,
  isRateLimited,
  isSecret,
  isUuid,
  newSecret,
  readCapped,
  readCookie,
  sameOrigin,
  serializeCookie,
  uaClass,
} from './http';
import {
  alreadySharedPage,
  confirmationPage,
  messagePage,
  privacyPage,
  surveyPage,
  unavailablePage,
} from './pages';
import { problem, rpcFieldErrors, rpcProblemKey } from './problem';
import { callRpc, readPrivacySettings } from './supabase';
import { verifyTurnstile } from './turnstile';

type Env = { Bindings: Bindings; Variables: HeaderVariables };
type C = Context<Env>;

export type StartResult =
  | {
      status: 'active';
      session_id: string;
      page: number;
      answers: Answers;
      seq: number;
      interactive: boolean;
      version: { id: string; no: number; definition: Definition; snapshot: Snapshot };
      new?: boolean;
    }
  | { status: 'cooldown' }
  | { status: 'submitted'; reference: string; contact_masked: string | null };

const NO_STORE = { 'cache-control': 'private, no-store' };
const IMMUTABLE = 'public, max-age=31536000, immutable';
const log = (event: string, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra }));

export const survey = new Hono<Env>();

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

interface Started {
  result: StartResult;
  cookies: string[];
}

async function startSession(
  c: C,
  env: SurveyWorkerEnv,
  src: string | null,
  qr: string | null,
): Promise<Started> {
  const names = cookieNames(env, c.req.url);
  const header = c.req.header('cookie');
  let session = readCookie(header, names.session);
  let device = readCookie(header, names.device);
  if (!isSecret(session)) session = newSecret();
  if (!isSecret(device)) device = newSecret();
  const result = await callRpc<StartResult>(env, 'survey_start_session', {
    p_session: session,
    p_device: device,
    p_src: src,
    p_qr_code: qr,
    p_ua_class: uaClass(c.req.header('user-agent')),
  });
  const cookies = [serializeCookie(names.device, device, DEVICE_MAX_AGE, names.secure)];
  if (result.status === 'active')
    cookies.push(serializeCookie(names.session, session, SESSION_MAX_AGE, names.secure));
  return { result, cookies };
}

function bootFrom(
  r: Extract<StartResult, { status: 'active' }>,
  env: SurveyWorkerEnv,
  answers?: Answers,
): BootData {
  return {
    sessionId: r.session_id,
    page: r.page,
    answers: answers ?? r.answers,
    seq: r.seq,
    isNew: r.new === true,
    versionId: r.version.id,
    definition: r.version.definition,
    snapshot: r.version.snapshot,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
  };
}

function withCookies(res: Response, cookies: string[]): Response {
  for (const v of cookies) res.headers.append('set-cookie', v);
  return res;
}

async function entry(c: C, src: string | null, qr: string | null): Promise<Response> {
  const env = loadConfig(c.env);
  const nonce = c.get('cspNonce');
  if (await isRateLimited(c.env.RL_API, `open:${clientIp(c.req.raw)}`))
    return c.html(messagePage(nonce, COPY.rateLimited, COPY.unavailableBody), 429, NO_STORE);
  let started: Started;
  try {
    started = await startSession(c, env, src, qr);
  } catch (err) {
    log('start_session_failed', { message: (err as Error).message });
    const u = new URL(c.req.url);
    return c.html(unavailablePage(nonce, u.pathname + u.search), 503, { ...NO_STORE, 'retry-after': '60' });
  }
  const r = started.result;
  let res: Response;
  if (r.status === 'cooldown') res = await c.html(alreadySharedPage(nonce), 200, NO_STORE);
  else if (r.status === 'submitted')
    res = await c.html(confirmationPage(nonce, r.reference, r.contact_masked), 200, NO_STORE);
  else
    res = await c.html(
      surveyPage(nonce, { boot: bootFrom(r, env), idem: crypto.randomUUID() }),
      200,
      NO_STORE,
    );
  return withCookies(res, started.cookies);
}

survey.get('/', (c) => entry(c, c.req.query('src') ?? null, null));
// QR points were retired (revision Q): old printed codes still land on the form, without tracking.
survey.get('/q/:code', (c) => c.redirect(BASE, 302));

// "Share more feedback": a brand-new blank survey. A fresh session cookie means nothing from the
// previous answers carries over; the device cooldown (when switched on) still applies server-side.
survey.get('/new', (c) => {
  const names = cookieNames(loadConfig(c.env), c.req.url);
  const res = c.redirect(BASE, 303);
  res.headers.set('cache-control', 'private, no-store');
  return withCookies(res, [serializeCookie(names.session, newSecret(), SESSION_MAX_AGE, names.secure)]);
});

survey.get('/privacy', async (c) => {
  const nonce = c.get('cspNonce');
  try {
    const settings = await readPrivacySettings(loadConfig(c.env));
    return c.html(privacyPage(nonce, settings), 200, { 'cache-control': 'public, max-age=300' });
  } catch (err) {
    log('privacy_settings_failed', { message: (err as Error).message });
    return c.html(unavailablePage(nonce, `${BASE}/privacy`), 503, NO_STORE);
  }
});

survey.get('/assets/:file', (c) => {
  const path = new URL(c.req.url).pathname;
  if (path === ISLAND_PATH)
    return c.body(ISLAND_JS, 200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': IMMUTABLE,
    });
  if (path === LOGO_PATH)
    return c.body(LOGO_SVG, 200, { 'content-type': 'image/svg+xml', 'cache-control': IMMUTABLE });
  return c.text('Not found', 404);
});

// ---------------------------------------------------------------------------
// Answer parsing (shared by the API and the no-JS form)
// ---------------------------------------------------------------------------

const isScalar = (v: unknown): v is Json =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** Keeps only the fixed answer slots (Rule 15) with scalar values. */
export function pickAnswers(input: unknown, { draft }: { draft: boolean }): Answers | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Answers = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!(k in ANSWER_SLOTS) || !isScalar(v)) continue;
    if (typeof v === 'string' && v.length > 1000) return null;
    if (draft && (LOCAL_ONLY as readonly string[]).includes(k)) continue; // contact details never go into drafts (Rule 12)
    out[k] = v;
  }
  return out;
}

/** The no-JS form post → engine-shaped answers. */
export function parseForm(form: URLSearchParams): Answers {
  const out: Answers = {};
  for (const [id, slot] of Object.entries(ANSWER_SLOTS)) {
    const raw = form.get(id);
    const type = slot.type[0];
    if (type === 'toggle') {
      out[id] = raw === 'true' || raw === 'on';
      continue;
    }
    if (raw === null || raw.trim() === '') continue;
    if (type === 'rating_5' || type === 'rating_0_10') {
      const n = Number(raw);
      out[id] = Number.isInteger(n) ? n : raw;
    } else out[id] = raw.slice(0, 1000);
  }
  return out;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function background(c: C, p: Promise<unknown>): Promise<void> {
  const safe = p.then(
    () => undefined,
    (err: Error) => log('background_failed', { message: err.message }),
  );
  try {
    c.executionCtx.waitUntil(safe);
    return Promise.resolve();
  } catch {
    return safe; // no execution context (tests): just finish it
  }
}

// ---------------------------------------------------------------------------
// JSON API
// ---------------------------------------------------------------------------

type Guarded = { env: SurveyWorkerEnv; session: string | undefined; body: string };

async function guard(c: C, limiter: 'RL_SUBMIT' | 'RL_API'): Promise<Guarded | Response> {
  const env = loadConfig(c.env);
  const req = c.req.raw;
  if (await isRateLimited(c.env[limiter], `${limiter}:${clientIp(req)}`))
    return problem(req.url, 'rateLimited');
  if (!sameOrigin(req)) return problem(req.url, 'badOrigin');
  const body = await readCapped(req, API_BODY_CAP);
  if (body === null) return problem(req.url, 'bodyTooLarge');
  const session = readCookie(req.headers.get('cookie'), cookieNames(env, req.url).session);
  return { env, session: isSecret(session) ? session : undefined, body };
}

survey.patch('/api/v1/survey/answers', async (c) => {
  const g = await guard(c, 'RL_API');
  if (g instanceof Response) return g;
  const url = c.req.url;
  if (!g.session) return problem(url, 'sessionExpired');
  const input = parseJson(g.body) as { seq?: unknown; page?: unknown; answers?: unknown } | undefined;
  const seq = input?.seq;
  const page = input?.page ?? null;
  const answers = pickAnswers(input?.answers ?? {}, { draft: true });
  if (
    typeof seq !== 'number' ||
    !Number.isInteger(seq) ||
    seq < 1 ||
    seq > 2147483647 ||
    (page !== null && (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 5)) ||
    !answers
  )
    return problem(url, 'badRequest');
  if (Object.keys(answers).length === 0 && page === null) return c.body(null, 204);
  try {
    await callRpc(g.env, 'survey_save_draft', {
      p_session: g.session,
      p_seq: seq,
      p_page: page,
      p_answers: answers,
    });
  } catch (err) {
    const key = rpcProblemKey(err);
    if (key === 'unavailable') log('save_draft_failed', { message: (err as Error).message });
    return problem(url, key);
  }
  return c.body(null, 204, { 'cache-control': 'no-store' });
});

const EVENT_TYPES = new Set([
  'interactive',
  'page_view',
  'answer_set',
  'answer_changed',
  'back',
  'validation_blocked',
  'submit_attempt',
  'submit_success',
  'submit_error',
]);

survey.post('/api/v1/survey/events', async (c) => {
  const g = await guard(c, 'RL_API');
  if (g instanceof Response)
    return g.status === 429 || g.status === 403 || g.status === 413 ? g : c.body(null, 204);
  if (!g.session) return c.body(null, 204);
  const input = parseJson(g.body);
  if (!Array.isArray(input)) return c.body(null, 204);
  const events = input.slice(0, 50).flatMap((e: unknown) => {
    if (!e || typeof e !== 'object') return [];
    const { type, page, clientTs, detail } = e as Record<string, unknown>;
    if (typeof type !== 'string' || !EVENT_TYPES.has(type)) return [];
    return [
      {
        type,
        page: typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= 5 ? page : null,
        clientTs: typeof clientTs === 'string' && clientTs.length <= 40 ? clientTs : null,
        detail: detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : null,
      },
    ];
  });
  if (events.length)
    await background(c, callRpc(g.env, 'survey_log_events', { p_session: g.session, p_events: events }));
  return c.body(null, 204);
});

function logTurnstileFailure(c: C, env: SurveyWorkerEnv, session: string, page: number): Promise<void> {
  return background(
    c,
    callRpc(env, 'survey_log_events', {
      p_session: session,
      p_events: [{ type: 'turnstile_failed', page, clientTs: null, detail: null }],
    }),
  );
}

survey.post('/api/v1/survey/submit', async (c) => {
  const g = await guard(c, 'RL_SUBMIT');
  if (g instanceof Response) return g;
  const url = c.req.url;
  if (!g.session) return problem(url, 'sessionExpired');
  const idem = c.req.header('idempotency-key');
  if (!isUuid(idem))
    return problem(url, 'validationFailed', { errors: [{ field: 'idempotency_key', code: 'required' }] });
  const input = parseJson(g.body) as
    { answers?: unknown; turnstileToken?: unknown; turnstile?: unknown } | undefined;
  const answers = pickAnswers(input?.answers, { draft: false });
  if (!answers) return problem(url, 'badRequest');
  const token =
    typeof input?.turnstileToken === 'string' && input.turnstileToken.length <= 2048
      ? input.turnstileToken
      : '';

  let verification: 'verified' | 'unverified_turnstile_outage';
  if (token) {
    if (!g.env.TURNSTILE_SECRET_KEY) {
      log('turnstile_not_configured');
      verification = 'unverified_turnstile_outage';
    } else {
      const outcome = await verifyTurnstile(
        g.env.TURNSTILE_SECRET_KEY,
        token,
        c.req.header('cf-connecting-ip') ?? null,
        idem,
      );
      if (outcome === 'rejected') {
        await logTurnstileFailure(c, g.env, g.session, 5);
        return problem(url, 'verificationFailed');
      }
      verification = outcome === 'verified' ? 'verified' : 'unverified_turnstile_outage';
    }
  } else if (input?.turnstile === 'unavailable') {
    verification = 'unverified_turnstile_outage';
  } else {
    await logTurnstileFailure(c, g.env, g.session, 5);
    return problem(url, 'verificationFailed');
  }

  try {
    const r = await callRpc<{ reference: string; contact_masked: string | null; replayed?: boolean }>(
      g.env,
      'survey_submit',
      { p_session: g.session, p_idempotency_key: idem, p_answers: answers, p_verification: verification },
    );
    return c.json(
      {
        reference: r.reference,
        contactMasked: r.contact_masked ?? null,
        replayed: r.replayed === true,
        verification,
      },
      200,
      { 'cache-control': 'no-store' },
    );
  } catch (err) {
    const key = rpcProblemKey(err);
    if (key === 'unavailable') log('submit_failed', { message: (err as Error).message });
    return problem(url, key, key === 'validationFailed' ? { errors: rpcFieldErrors(err) } : {});
  }
});

// ---------------------------------------------------------------------------
// No-JS fallback (A-38): one server-posted form, same server validation, `unverified_no_js`.
// ---------------------------------------------------------------------------

survey.post('/submit', async (c) => {
  const env = loadConfig(c.env);
  const nonce = c.get('cspNonce');
  const req = c.req.raw;
  if (await isRateLimited(c.env.RL_SUBMIT, `RL_SUBMIT:${clientIp(req)}`))
    return c.html(messagePage(nonce, COPY.rateLimited, COPY.unavailableBody), 429, NO_STORE);
  if (!sameOrigin(req)) return c.html(messagePage(nonce, 'Request refused.', ''), 403, NO_STORE);
  const body = await readCapped(req, FORM_BODY_CAP);
  if (body === null) return c.html(messagePage(nonce, 'Please shorten your answers.', ''), 413, NO_STORE);
  const form = new URLSearchParams(body);
  const session = readCookie(req.headers.get('cookie'), cookieNames(env, req.url).session);
  if (!isSecret(session)) return c.redirect(BASE, 303);
  const answers = parseForm(form);
  const idemField = form.get('idem');
  const idem = isUuid(idemField) ? idemField : crypto.randomUUID();
  try {
    await callRpc(env, 'survey_submit', {
      p_session: session,
      p_idempotency_key: idem,
      p_answers: answers,
      p_verification: 'unverified_no_js',
    });
    return c.redirect(BASE, 303); // the session is submitted: GET shows the confirmation
  } catch (err) {
    const key = rpcProblemKey(err);
    if (key === 'alreadyShared') return c.html(alreadySharedPage(nonce), 409, NO_STORE);
    if (key === 'rateLimited') return c.html(messagePage(nonce, COPY.rateLimited, ''), 429, NO_STORE);
    if (key === 'unavailable') log('submit_failed', { message: (err as Error).message, nojs: true });
    let started: Started;
    try {
      started = await startSession(c, env, null, null);
    } catch {
      return c.html(unavailablePage(nonce), 503, NO_STORE);
    }
    const r = started.result;
    if (r.status === 'submitted') return withCookies(c.redirect(BASE, 303), started.cookies);
    if (r.status === 'cooldown')
      return withCookies(await c.html(alreadySharedPage(nonce), 409, NO_STORE), started.cookies);
    const errors =
      key === 'validationFailed'
        ? rpcFieldErrors(err).map((e) => ({ field: e.field, message: fieldMessage(e.field, e.code) }))
        : [];
    const boot = bootFrom(r, env, answers);
    const firstError = errors[0] ? pageOf(r.version.definition, errors[0].field) + 1 : 0;
    boot.page = firstError > 0 ? firstError : r.page;
    const banner =
      key === 'validationFailed'
        ? undefined
        : key === 'sessionExpired'
          ? COPY.sessionTimedOut
          : COPY.serverError;
    const status = key === 'validationFailed' ? 422 : key === 'sessionExpired' ? 200 : 503;
    const page = surveyPage(nonce, { boot, errors, idem, ...(banner ? { banner } : {}) });
    return withCookies(await c.html(page, status, NO_STORE), started.cookies);
  }
});

survey.get('/*', (c) => {
  const u = new URL(c.req.url);
  if (u.pathname === `${BASE}/`) return c.redirect(`${BASE}${u.search}`, 308);
  return c.html(
    messagePage(c.get('cspNonce'), COPY.notFoundHeading, COPY.notFoundBody, {
      href: BASE,
      label: COPY.startSurvey,
    }),
    404,
    NO_STORE,
  );
});
survey.all('/*', (c) => problem(c.req.url, 'badRequest'));
