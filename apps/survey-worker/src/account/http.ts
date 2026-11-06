// Plumbing for /api/account/* and /api/verify: problem responses, error mapping, body readers,
// the session cookie, hashing helpers.
import type { SurveyWorkerEnv } from '@serene/contracts';
import type { FieldError } from '@serene/proposals';
import { RpcError } from '../supabase';

export const ACCOUNT_API = '/api/account';
export const NO_STORE = { 'cache-control': 'private, no-store' } as const;
export const JSON_CAP = 16 * 1024;
export const DRAFT_CAP = 512 * 1024;
/** Submit carries the answers plus the signature PNG (≤ 300 KB, about 400 KB in base64). */
export const SUBMIT_CAP = 1024 * 1024;
export const FILE_MAX = 10 * 1024 * 1024;
export const SIGNATURE_MAX = 300 * 1024;

/** Bytes backed by a plain ArrayBuffer (what fetch bodies and WebCrypto accept). */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface ProblemExtra {
  detail?: string;
  errors?: readonly FieldError[];
  refer?: readonly string[];
  retryAfterSeconds?: number;
}

/** application/problem+json { title, status, detail?, errors? } (packages/proposals/src/api.ts › Problem). */
export function problem(
  status: number,
  title: string,
  extra: ProblemExtra = {},
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify({ title, status, ...extra }), {
    status,
    headers: { 'content-type': 'application/problem+json', ...NO_STORE, ...headers },
  });
}

/** Thrown by handlers; turned into a problem response by the account app's error handler. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly extra: ProblemExtra = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(title);
  }
}

export const invalid = (errors: FieldError[], title = 'Please check your answers.') =>
  new ApiError(422, title, { errors });
export const notFound = () => new ApiError(404, 'Not found.');
export const badRequest = (detail?: string) => new ApiError(400, 'Bad request.', detail ? { detail } : {});

/** Machine messages raised as P0001 by the account_* functions (202611130003, 202611130005). */
const RPC_PROBLEMS: Record<string, [number, string]> = {
  'not-found': [404, 'Not found.'],
  'not-editable': [409, 'This can no longer be changed.'],
  'not-cancellable': [409, 'This can no longer be cancelled.'],
  'not-payable': [409, 'This proposal cannot be paid for at the moment.'],
  'quote-expired': [409, 'This quote has expired. Please ask for a new quote.'],
  'payment-closed': [409, 'This payment has already finished.'],
  'not-reserved': [409, 'This payment is not ready to be completed.'],
  'files-invalid': [422, 'Some attached files are not part of this proposal. Please attach them again.'],
  'too-many-files': [422, 'You have attached the maximum number of files here.'],
  'too-many-drafts': [429, 'You have too many unfinished forms. Please finish or cancel one first.'],
  'kind-refused': [400, 'This type of document is not accepted.'],
  'policy-not-active': [409, 'Claims can be made only on an active policy.'],
  'policy-cancelled': [409, 'A cancelled policy cannot be renewed.'],
  'incident-in-future': [422, 'The date of the incident cannot be in the future.'],
  'incident-outside-cover': [422, 'The incident date must be inside the policy’s period of cover.'],
  'documents-missing': [422, 'Please attach every required document.'],
};

export function rpcProblem(err: RpcError): Response | null {
  if (err.code === 'P0001') {
    const p = RPC_PROBLEMS[err.message];
    if (!p) return null;
    const errors: FieldError[] = [];
    if (err.message === 'incident-in-future' || err.message === 'incident-outside-cover')
      errors.push({ field: 'incidentDate', message: p[1] });
    if (err.message === 'files-invalid') errors.push({ field: 'files', message: p[1] });
    return problem(p[0], p[1], errors.length ? { errors } : {});
  }
  if (err.code === '22023') return problem(400, 'Bad request.');
  return null;
}

/** Reads at most `cap` bytes of the body; null when it is larger. */
export async function readBytes(req: Request, cap: number): Promise<Bytes | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > cap) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return all;
}

export type JsonObject = Record<string, unknown>;
export const isObject = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);

/** A JSON object body of at most `cap` bytes, or a 400/413 problem. */
export async function readJson(req: Request, cap = JSON_CAP): Promise<JsonObject> {
  const bytes = await readBytes(req, cap);
  if (bytes === null) throw new ApiError(413, 'Request too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw badRequest('The body must be JSON.');
  }
  if (!isObject(parsed)) throw badRequest('The body must be a JSON object.');
  return parsed;
}

// ---------------------------------------------------------------------------
// Session cookie (architecture.md › Customer authentication)
// ---------------------------------------------------------------------------
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** `__Host-` needs HTTPS; plain-http local development (wrangler dev) drops the prefix and Secure. */
export function sessionCookieName(env: SurveyWorkerEnv, url: string): { name: string; secure: boolean } {
  if (env.APP_ENV === 'local' && new URL(url).protocol === 'http:')
    return { name: 'dev-serene_account', secure: false };
  return { name: '__Host-serene_account', secure: true };
}

export function sessionCookie(
  env: SurveyWorkerEnv,
  url: string,
  token: string,
  maxAge = SESSION_MAX_AGE,
): string {
  const { name, secure } = sessionCookieName(env, url);
  return `${name}=${token}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export const isToken = (v: string | undefined): v is string => !!v && TOKEN_RE.test(v);

export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 32 random bytes, base64url (43 characters). */
export const newToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export function hex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export async function sha256Hex(data: Bytes | string): Promise<string> {
  const bytes: Bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message)));
}

/** Six digits, uniformly distributed (rejection sampling). */
export function otpCode(): string {
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const n = buf[0] ?? 0;
    if (n < 4_294_000_000) return String(n % 1_000_000).padStart(6, '0');
  }
}

/** JSON with object keys sorted at every level: the bytes hashed for answersSha256. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (isObject(v))
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}

export function base64ToBytes(b64: string): Bytes | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------------------
// Ghana phone numbers
// ---------------------------------------------------------------------------
/** Mobile network prefixes (same list as the ghana_mobile_prefixes setting). */
const MOBILE_PREFIXES = ['20', '23', '24', '25', '26', '27', '28', '50', '53', '54', '55', '56', '57', '59'];

/** Any common way of writing a Ghana mobile number → +233XXXXXXXXX, or null. */
export function normaliseGhanaMobile(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 30) return null;
  let d = raw.replace(/[\s().-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('233')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length !== 9 || !MOBILE_PREFIXES.includes(d.slice(0, 2))) return null;
  return `+233${d}`;
}

/** +233241234567 → "024 *** 4567". */
export const maskPhone = (e164: string) => `0${e164.slice(4, 6)} *** ${e164.slice(-4)}`;

export const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);

export function addDaysIso(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const log = (event: string, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra }));
