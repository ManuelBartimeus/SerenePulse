// Customer API (/api/account/*) and the public certificate check (/api/verify).
// Contract: packages/proposals/src/api.ts and claims.ts. Design: docs/sales/architecture.md.
//
// Security model
//   * Authentication: phone + one-time code → HttpOnly session cookie; only hashes are stored.
//   * Every state-changing request needs `x-requested-with: serene-account` and an Origin equal to
//     the site (CSRF), including the public ones (sign-in, quick quote).
//   * Every record lookup goes through an account_* function that takes the customer id from the
//     session, so a customer can only ever reach their own proposals, files, payments, policies and
//     claims; anything else is a plain 404.
//   * RL_API (per IP) on every route; per-phone code limits in the database.
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { SurveyWorkerEnv } from '@serene/contracts';
import {
  CLAIM_TYPES,
  GLOBAL_CONFIRMATIONS,
  PRODUCTS,
  buildCertificate,
  claimTypesFor,
  clean,
  allFields,
  formById,
  insuredSubject,
  normaliseFormat,
  FORMATS,
  policyCode,
  priceProposal,
  productByCode,
  resolveRates,
  rolesOf,
  validateForm,
  type Answers,
  type ClaimDetail,
  type ClaimStatus,
  type ClaimSummary,
  type CustomerProfile,
  type Field,
  type FieldError,
  type FormDefinition,
  type Payment,
  type PolicySummary,
  type Product,
  type ProposalDetail,
  type ProposalFile,
  type ProposalHistoryItem,
  type ProposalStatus,
  type ProposalSummary,
  type Quote,
  type RatingResult,
  type VerifyResponse,
} from '@serene/proposals';
import { loadConfig, type Bindings } from '../config';
import type { HeaderVariables } from '../headers';
import { clientIp, isRateLimited, isUuid, readCookie } from '../http';
import { RpcError, callRpc } from '../supabase';
import { verifyTurnstile } from '../turnstile';
import {
  ACCOUNT_API,
  ApiError,
  DRAFT_CAP,
  FILE_MAX,
  JSON_CAP,
  NO_STORE,
  SIGNATURE_MAX,
  SUBMIT_CAP,
  addDaysIso,
  badRequest,
  base64ToBytes,
  bytesToBase64,
  canonicalJson,
  hmacHex,
  invalid,
  isIsoDate,
  isObject,
  isToken,
  log,
  maskPhone,
  newToken,
  normaliseGhanaMobile,
  notFound,
  otpCode,
  problem,
  readBytes,
  readJson,
  rpcProblem,
  sessionCookie,
  sessionCookieName,
  sha256Hex,
  todayIso,
  type Bytes,
  type JsonObject,
} from './http';
import {
  attachmentHeader,
  prepareSimulatedPayment,
  readSalesSettings,
  safeFileName,
  smsSender,
  sniff,
  storageDownload,
  storageRemove,
  storageUpload,
  type SalesSettings,
} from './services';

interface Customer {
  customerId: string;
  customerNo: string;
  phone: string;
}
type Env = { Bindings: Bindings; Variables: HeaderVariables & { customer: Customer } };
type C = Context<Env>;

const rpc = <T>(c: C, fn: string, args: Record<string, unknown>) => callRpc<T>(loadConfig(c.env), fn, args);
const me = (c: C) => c.get('customer');
const json = (c: C, body: unknown, status: 200 | 201 = 200) => c.json(body as object, status, NO_STORE);
const BANNED_KINDS = ['id_front', 'id_back', 'ghana_card'];

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/** RL_API per client IP. A missing or failing binding never blocks customers (http.ts). */
export const rateLimit: MiddlewareHandler<Env> = async (c, next) => {
  if (await isRateLimited(c.env.RL_API, `account:${clientIp(c.req.raw)}`))
    return problem(
      429,
      'Too many requests. Please wait a moment and try again.',
      {},
      { 'retry-after': '10' },
    );
  await next();
};

/** CSRF: a cross-site form can set neither the header nor a matching Origin. */
export const csrf: MiddlewareHandler<Env> = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin');
    if (
      c.req.header('x-requested-with') !== 'serene-account' ||
      !origin ||
      origin !== new URL(c.req.url).origin
    )
      return problem(403, 'Request refused.', { detail: 'Cross-site requests are not accepted.' });
  }
  await next();
};

const tokenFrom = (c: C) =>
  readCookie(c.req.header('cookie'), sessionCookieName(loadConfig(c.env), c.req.url).name);

/** Resolves the session cookie to the customer; 401 (and the cookie cleared) otherwise. */
const signedIn: MiddlewareHandler<Env> = async (c, next) => {
  const env = loadConfig(c.env);
  const token = tokenFrom(c);
  const customer = isToken(token)
    ? await callRpc<Customer | null>(env, 'account_session_resolve', { p_token_hash: await sha256Hex(token) })
    : null;
  if (!customer) {
    const headers: Record<string, string> = token
      ? { 'set-cookie': sessionCookie(env, c.req.url, '', 0) }
      : {};
    return problem(401, 'Please sign in.', {}, headers);
  }
  c.set('customer', customer);
  await next();
};

function onError(err: Error, c: C): Response {
  if (err instanceof ApiError) return problem(err.status, err.title, err.extra, err.headers);
  if (err instanceof RpcError) {
    const p = rpcProblem(err);
    if (p) return p;
  }
  const requestId = crypto.randomUUID();
  log('account_error', { requestId, path: new URL(c.req.url).pathname, message: err.message });
  return problem(503, 'Service unavailable. Please try again shortly.', {
    detail: `Reference ${requestId}.`,
  });
}

export const account = new Hono<Env>();
account.use('*', rateLimit, csrf);
account.onError(onError);

// ---------------------------------------------------------------------------
// Mapping database JSON to the API contract (explicit, so nothing internal leaks)
// ---------------------------------------------------------------------------
interface DbFile {
  id: string;
  fieldId?: string;
  kind: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  storagePath: string;
}
interface DbSignature {
  method: 'drawn' | 'typed' | 'uploaded';
  signedName: string;
  signedAt: string;
  imagePath?: string;
  ip?: string;
  answersSha256?: string;
}
interface DbProposal {
  id: string;
  proposalNo: string;
  productCode: string;
  status: ProposalStatus;
  currentStep: number;
  quote?: Quote;
  insuredSubject?: string;
  updatedAt: string;
  submittedAt?: string;
  policyId?: string;
  formId?: string;
  formVersion?: number;
  answers?: Answers;
  signature?: DbSignature;
  staffMessage?: string;
  files?: DbFile[];
  history?: ProposalHistoryItem[];
  /** Ids of the confirmations ticked when signing. */
  confirmations?: string[] | null;
}
interface DbPayment {
  reference: string;
  amount: number;
  method: 'momo' | 'card';
  network?: 'mtn' | 'telecel' | 'airteltigo';
  maskedAccount: string;
  status: 'pending' | 'succeeded' | 'failed';
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
  proposalId: string;
  policyId?: string;
  providerData?: { simulatedOutcome?: string };
}
interface DbPolicy extends Omit<PolicySummary, 'productName'> {
  certificate?: unknown;
  payment?: DbPayment;
  /** Storage path of the certificate signature image in force at issue (never sent to the browser). */
  signaturePath?: string;
}
interface DbClaim extends Omit<
  ClaimDetail,
  'productName' | 'files' | 'events' | 'incidentLocation' | 'description'
> {
  productCode: string;
  incidentLocation?: string;
  description?: string;
  files?: DbFile[];
  events?: { at: string; status: ClaimStatus; note?: string }[];
}

const productName = (code: string) => productByCode(code)?.name ?? code;

function profileOut(p: CustomerProfile): CustomerProfile {
  const keys: (keyof CustomerProfile)[] = [
    'customerNo',
    'phone',
    'title',
    'fullName',
    'dateOfBirth',
    'gender',
    'email',
    'postalAddress',
    'residentialAddress',
    'digitalAddress',
    'occupation',
    'employer',
    'idType',
    'idNumber',
    'nationality',
    'tin',
    'companyName',
    'companyRegNo',
    'marketingConsent',
    'createdAt',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (p[k] !== undefined && p[k] !== null) out[k] = p[k];
  return out as unknown as CustomerProfile;
}

function summaryOut(p: DbProposal): ProposalSummary {
  return {
    id: p.id,
    proposalNo: p.proposalNo,
    productCode: p.productCode,
    productName: productName(p.productCode),
    status: p.status,
    currentStep: p.currentStep,
    updatedAt: p.updatedAt,
    ...(p.quote ? { quote: p.quote } : {}),
    ...(p.insuredSubject ? { insuredSubject: p.insuredSubject } : {}),
    ...(p.submittedAt ? { submittedAt: p.submittedAt } : {}),
    ...(p.policyId ? { policyId: p.policyId } : {}),
  };
}

const fileOut = (f: DbFile): ProposalFile => ({
  id: f.id,
  fieldId: f.fieldId ?? '',
  kind: f.kind,
  name: f.name,
  mime: f.mime,
  size: f.size,
  createdAt: f.createdAt,
});

function detailOut(p: DbProposal): ProposalDetail {
  return {
    ...summaryOut(p),
    formId: p.formId ?? '',
    formVersion: p.formVersion ?? 1,
    answers: p.answers ?? {},
    files: (p.files ?? []).map(fileOut),
    history: p.history ?? [],
    ...(p.signature
      ? {
          signature: {
            method: p.signature.method,
            signedName: p.signature.signedName,
            signedAt: p.signature.signedAt,
            hasImage: !!p.signature.imagePath,
          },
        }
      : {}),
    ...(p.staffMessage ? { staffMessage: p.staffMessage } : {}),
  };
}

function paymentOut(p: DbPayment): Payment & { policyId?: string } {
  return {
    reference: p.reference,
    amount: Number(p.amount),
    method: p.method,
    maskedAccount: p.maskedAccount,
    status: p.status,
    createdAt: p.createdAt,
    ...(p.network ? { network: p.network } : {}),
    ...(p.failureReason ? { failureReason: p.failureReason } : {}),
    ...(p.completedAt ? { completedAt: p.completedAt } : {}),
    ...(p.policyId ? { policyId: p.policyId } : {}),
  };
}

function policyOut(p: DbPolicy): PolicySummary {
  return {
    id: p.id,
    policyNo: p.policyNo,
    certificateNo: p.certificateNo,
    productCode: p.productCode,
    productName: productName(p.productCode),
    coverTitle: p.coverTitle,
    startsOn: p.startsOn,
    expiresOn: p.expiresOn,
    status: p.status,
    premium: Number(p.premium),
    issuedAt: p.issuedAt,
    proposalId: p.proposalId,
    ...(p.insuredSubject ? { insuredSubject: p.insuredSubject } : {}),
  };
}

function claimSummaryOut(cl: DbClaim): ClaimSummary {
  return {
    id: cl.id,
    claimNo: cl.claimNo,
    policyId: cl.policyId,
    policyNo: cl.policyNo,
    productName: productName(cl.productCode),
    claimType: cl.claimType,
    status: cl.status,
    incidentDate: cl.incidentDate,
    reportedAt: cl.reportedAt,
    updatedAt: cl.updatedAt,
    ...(cl.staffMessage ? { staffMessage: cl.staffMessage } : {}),
  };
}

function claimDetailOut(cl: DbClaim): ClaimDetail {
  return {
    ...claimSummaryOut(cl),
    incidentLocation: cl.incidentLocation ?? '',
    description: cl.description ?? '',
    files: (cl.files ?? []).map((f) => ({
      id: f.id,
      kind: f.kind,
      name: f.name,
      mime: f.mime,
      size: f.size,
      createdAt: f.createdAt,
    })),
    events: cl.events ?? [],
    ...(cl.estimatedAmount !== undefined && cl.estimatedAmount !== null
      ? { estimatedAmount: Number(cl.estimatedAmount) }
      : {}),
    ...(cl.thirdParty ? { thirdParty: cl.thirdParty } : {}),
  };
}

// ---------------------------------------------------------------------------
// Product / form helpers
// ---------------------------------------------------------------------------
function productAndForm(code: unknown): { product: Product; form: FormDefinition } | null {
  const product = typeof code === 'string' ? productByCode(code) : undefined;
  const form = product ? formById(product.formId) : undefined;
  return product && form ? { product, form } : null;
}

function formFields(form: FormDefinition): Field[] {
  return [...allFields(form).map((x) => x.field), ...(form.declaration.fields ?? [])];
}

/** The keys an answer set may carry for this form (field ids and their __details/__other/__currency companions). */
function knownKey(form: FormDefinition, key: string): boolean {
  return formFields(form).some((f) => key === f.id || key.startsWith(`${f.id}__`));
}

/** Answers from the client: a plain object of scalars, string arrays and table rows. */
function answersFrom(v: unknown, form?: FormDefinition): Answers {
  if (v === undefined || v === null) return {};
  if (!isObject(v)) throw badRequest('answers must be an object.');
  const out: Answers = {};
  for (const [k, val] of Object.entries(v)) {
    if (!/^[a-z0-9_]{1,100}$/.test(k)) continue;
    if (form && !knownKey(form, k)) continue;
    if (val === null || ['string', 'number', 'boolean'].includes(typeof val)) out[k] = val as Answers[string];
    else if (Array.isArray(val)) out[k] = val as Answers[string];
  }
  return out;
}

const salesQuote = (quote: Quote, s: SalesSettings): Quote => ({
  ...quote,
  validUntil: addDaysIso(s.quoteValidityDays),
});

function referred(result: Extract<RatingResult, { ok: false }>): ApiError {
  return new ApiError(422, 'Referred to an underwriter', {
    detail: result.refer.join(' '),
    refer: result.refer,
  });
}

const rate = (product: Product, answers: Answers, s: SalesSettings) =>
  priceProposal(product, answers, resolveRates(s.rates), new Date());

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------
account.post('/otp/start', async (c) => {
  const env = loadConfig(c.env);
  const body = await readJson(c.req.raw, 4 * 1024);
  const phone = normaliseGhanaMobile(body.phone);
  if (!phone)
    throw invalid([{ field: 'phone', message: 'Enter a Ghana mobile number, for example 024 123 4567.' }]);
  if (typeof body.turnstileToken === 'string' && body.turnstileToken && env.TURNSTILE_SECRET_KEY) {
    const outcome = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY,
      body.turnstileToken,
      clientIp(c.req.raw),
      crypto.randomUUID(),
    );
    if (outcome === 'rejected')
      throw new ApiError(403, 'We could not verify this request. Please try again.');
  }
  const settings = await readSalesSettings(env);
  const sms = smsSender(env, settings);
  const challengeId = crypto.randomUUID();
  const code = otpCode();
  const result = await callRpc<{
    ok: boolean;
    error?: string;
    retryAfterSeconds?: number;
    expiresInSeconds?: number;
    resendInSeconds?: number;
  }>(env, 'account_otp_start', {
    p_challenge_id: challengeId,
    p_phone: phone,
    p_code_hmac: await hmacHex(env.SURVEY_HMAC_KEY, `account-otp:${challengeId}:${code}`),
    p_ip_hash: await hmacHex(env.SURVEY_HMAC_KEY, `account-ip:${clientIp(c.req.raw)}`),
  });
  if (!result.ok) {
    const retry = result.retryAfterSeconds ?? 30;
    throw new ApiError(
      429,
      result.error === 'too-soon'
        ? 'Please wait a few seconds before asking for another code.'
        : 'Too many codes requested. Please try again later.',
      { retryAfterSeconds: retry },
      { 'retry-after': String(retry) },
    );
  }
  if (!sms.simulated) {
    try {
      await sms.send(
        phone,
        `Your Serene Insurance code is ${code}. It expires in 5 minutes. Never share it with anyone.`,
      );
    } catch (err) {
      log('otp_sms_failed', { message: (err as Error).message });
      throw new ApiError(503, 'We could not send the code. Please try again shortly.');
    }
  }
  // The response is the same for new and existing customers.
  return json(c, {
    challengeId,
    expiresInSeconds: result.expiresInSeconds ?? 300,
    resendInSeconds: result.resendInSeconds ?? 30,
    maskedPhone: maskPhone(phone),
    ...(sms.simulated ? { simulatedCode: code } : {}),
  });
});

account.post('/otp/verify', async (c) => {
  const env = loadConfig(c.env);
  const body = await readJson(c.req.raw, 4 * 1024);
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  if (!isUuid(typeof body.challengeId === 'string' ? body.challengeId : null) || !/^\d{6}$/.test(code))
    throw invalid([{ field: 'code', message: 'Enter the 6-digit code we sent you.' }]);
  const challengeId = body.challengeId as string;
  const token = newToken();
  const r = await callRpc<{
    ok: boolean;
    error?: string;
    attemptsLeft?: number;
    isNew?: boolean;
    profile?: CustomerProfile;
  }>(env, 'account_otp_verify', {
    p_challenge_id: challengeId,
    p_code_hmac: await hmacHex(env.SURVEY_HMAC_KEY, `account-otp:${challengeId}:${code}`),
    p_token_hash: await sha256Hex(token),
    p_user_agent: (c.req.header('user-agent') ?? '').slice(0, 300),
  });
  if (!r.ok || !r.profile) {
    if (r.error === 'locked') throw new ApiError(429, 'Too many wrong codes. Please ask for a new code.');
    if (r.error === 'suspended')
      throw new ApiError(403, 'This account cannot sign in. Please call Serene Insurance.');
    if (r.error === 'invalid')
      throw invalid([
        {
          field: 'code',
          message: `That code is not right. ${r.attemptsLeft ?? 0} attempt${r.attemptsLeft === 1 ? '' : 's'} left.`,
        },
      ]);
    throw invalid([{ field: 'code', message: 'This code has expired. Please ask for a new one.' }]);
  }
  const res = json(c, { profile: profileOut(r.profile), isNew: r.isNew === true });
  res.headers.append('set-cookie', sessionCookie(env, c.req.url, token));
  return res;
});

account.post('/sign-out', async (c) => {
  const env = loadConfig(c.env);
  const token = tokenFrom(c);
  if (isToken(token)) await callRpc(env, 'account_sign_out', { p_token_hash: await sha256Hex(token) });
  return new Response(null, {
    status: 204,
    headers: { ...NO_STORE, 'set-cookie': sessionCookie(env, c.req.url, '', 0) },
  });
});

// ---------------------------------------------------------------------------
// Public: catalogue and quick quote
// ---------------------------------------------------------------------------
account.get('/catalogue', async (c) => {
  const settings = await readSalesSettings(loadConfig(c.env));
  const r = resolveRates(settings.rates);
  // Customer-facing figures only; referral thresholds and other underwriting limits stay internal.
  const rates = {
    version: r.version,
    ...(r.updatedAt ? { updatedAt: r.updatedAt } : {}),
    taxes: r.taxes,
    motor: { tpo: r.motor.tpo, comprehensiveRate: r.motor.comprehensiveRate, tpftRate: r.motor.tpftRate },
    tppdLimit: settings.tppdLimit,
    quoteValidityDays: settings.quoteValidityDays,
  };
  return c.json({ products: PRODUCTS, rates }, 200, { 'cache-control': 'public, max-age=300' });
});

account.post('/quick-quote', async (c) => {
  const body = await readJson(c.req.raw, 16 * 1024);
  const pf = productAndForm(body.productCode);
  if (!pf) throw invalid([{ field: 'productCode', message: 'Choose a product.' }]);
  // Partial answers: only the fields the rating needs.
  const answers = answersFrom(body.answers);
  const settings = await readSalesSettings(loadConfig(c.env));
  const result = rate(pf.product, answers, settings);
  if (!result.ok) throw referred(result);
  return json(c, salesQuote(result.quote, settings));
});

// ---------------------------------------------------------------------------
// Signed-in routes
// ---------------------------------------------------------------------------
account.use('/me', signedIn);
account.use('/proposals', signedIn);
account.use('/proposals/*', signedIn);
account.use('/files/*', signedIn);
account.use('/payments/*', signedIn);
account.use('/policies', signedIn);
account.use('/policies/*', signedIn);
account.use('/claims', signedIn);
account.use('/claims/*', signedIn);

account.get('/me', async (c) =>
  json(
    c,
    profileOut(await rpc<CustomerProfile>(c, 'account_get_profile', { p_customer_id: me(c).customerId })),
  ),
);

const PROFILE_TEXT: Record<string, number> = {
  title: 20,
  fullName: 120,
  gender: 20,
  email: 254,
  postalAddress: 300,
  residentialAddress: 300,
  digitalAddress: 20,
  occupation: 120,
  employer: 120,
  idType: 40,
  idNumber: 40,
  nationality: 60,
  tin: 20,
  companyName: 160,
  companyRegNo: 40,
};
const PROFILE_READ_ONLY = ['customerNo', 'phone', 'createdAt'];

account.patch('/me', async (c) => {
  const body = await readJson(c.req.raw, JSON_CAP);
  const patch: JsonObject = {};
  const errors: FieldError[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (PROFILE_READ_ONLY.includes(k)) continue; // the phone is the sign-in identity: never changed here
    if (k === 'marketingConsent') {
      if (typeof v !== 'boolean') errors.push({ field: k, message: 'Choose yes or no.' });
      else patch[k] = v;
    } else if (k === 'dateOfBirth') {
      if (v !== '' && !isIsoDate(v)) errors.push({ field: k, message: 'Enter a valid date.' });
      else if (v !== '' && (Date.parse(`${v}T00:00:00Z`) > Date.now() || Number(v.slice(0, 4)) < 1900))
        errors.push({ field: k, message: 'Enter your real date of birth.' });
      else patch[k] = v;
    } else if (k in PROFILE_TEXT) {
      const max = PROFILE_TEXT[k] ?? 0;
      if (typeof v !== 'string' || v.length > max) {
        errors.push({ field: k, message: `Keep this under ${max} characters.` });
        continue;
      }
      const t = v.trim();
      if (t && k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t))
        errors.push({ field: k, message: 'Enter a valid email address.' });
      else if (
        t &&
        k === 'digitalAddress' &&
        !FORMATS.digitalAddress.test(normaliseFormat('digitalAddress', t))
      )
        errors.push({ field: k, message: 'Enter a GhanaPost GPS address, for example GA-123-4567.' });
      else if (t && k === 'tin' && !FORMATS.tin.test(normaliseFormat('tin', t)))
        errors.push({ field: k, message: 'Enter a TIN such as P0001234567, or your Ghana Card number.' });
      else patch[k] = k === 'digitalAddress' && t ? normaliseFormat('digitalAddress', t) : t;
    } else throw badRequest(`Unknown profile field ${k.slice(0, 40)}.`);
  }
  if (errors.length) throw invalid(errors);
  return json(
    c,
    profileOut(
      await rpc<CustomerProfile>(c, 'account_update_profile', {
        p_customer_id: me(c).customerId,
        p_profile: patch,
      }),
    ),
  );
});

// ---- Proposals --------------------------------------------------------------------------------
const getProposal = (c: C, id: string) => {
  if (!isUuid(id)) throw notFound();
  return rpc<DbProposal>(c, 'account_get_proposal', { p_customer_id: me(c).customerId, p_proposal_id: id });
};

account.get('/proposals', async (c) =>
  json(
    c,
    (await rpc<DbProposal[]>(c, 'account_list_proposals', { p_customer_id: me(c).customerId })).map(
      summaryOut,
    ),
  ),
);

account.post('/proposals', async (c) => {
  const body = await readJson(c.req.raw, 64 * 1024);
  const pf = productAndForm(body.productCode);
  if (!pf) throw invalid([{ field: 'productCode', message: 'Choose a product.' }]);
  const p = await rpc<DbProposal>(c, 'account_create_proposal', {
    p_customer_id: me(c).customerId,
    p_product_code: pf.product.code,
    p_form_id: pf.form.id,
    p_form_version: pf.form.version,
    p_answers: answersFrom(body.answers, pf.form),
  });
  return json(c, detailOut(p), 201);
});

account.get('/proposals/:id', async (c) => json(c, detailOut(await getProposal(c, c.req.param('id')))));

account.patch('/proposals/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) throw notFound();
  const body = await readJson(c.req.raw, DRAFT_CAP);
  const step = body.currentStep;
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > 50)
    throw invalid([{ field: 'currentStep', message: 'currentStep must be a whole number from 0 to 50.' }]);
  const p = await rpc<DbProposal>(c, 'account_save_proposal', {
    p_customer_id: me(c).customerId,
    p_proposal_id: id,
    p_answers: answersFrom(body.answers),
    p_current_step: step,
  });
  return json(c, summaryOut(p));
});

account.post('/proposals/:id/quote', async (c) => {
  const p = await getProposal(c, c.req.param('id'));
  const pf = productAndForm(p.productCode);
  if (!pf) throw notFound();
  if (p.status !== 'draft' && p.status !== 'info_requested')
    throw new ApiError(409, 'This can no longer be changed.');
  const settings = await readSalesSettings(loadConfig(c.env));
  const result = rate(pf.product, clean(pf.form, p.answers ?? {}), settings);
  if (!result.ok) throw referred(result);
  const quote = await rpc<Quote>(c, 'account_quote_store', {
    p_customer_id: me(c).customerId,
    p_proposal_id: p.id,
    p_quote: result.quote,
  });
  return json(c, quote);
});

account.post('/proposals/:id/cancel', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) throw notFound();
  return json(
    c,
    summaryOut(
      await rpc<DbProposal>(c, 'account_cancel_proposal', {
        p_customer_id: me(c).customerId,
        p_proposal_id: id,
      }),
    ),
  );
});

// ---- Files ------------------------------------------------------------------------------------
interface Upload {
  bytes: Bytes;
  name: string;
  fields: Record<string, string>;
}

/** multipart/form-data with one `file`; at most 10 MB of file. */
async function readUpload(req: Request): Promise<Upload> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data'))
    throw badRequest('Send the file as multipart/form-data.');
  const raw = await readBytes(req, FILE_MAX + 64 * 1024);
  if (raw === null) throw new ApiError(413, 'Files can be at most 10 MB.');
  let form: FormData;
  try {
    form = await new Response(raw, { headers: { 'content-type': type } }).formData();
  } catch {
    throw badRequest('The upload could not be read.');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string')
    throw invalid([{ field: 'file', message: 'Choose a file to upload.' }]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw invalid([{ field: 'file', message: 'The file is empty.' }]);
  if (bytes.byteLength > FILE_MAX) throw new ApiError(413, 'Files can be at most 10 MB.');
  const fields: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === 'string') fields[k] = v.slice(0, 200);
  });
  return { bytes, name: (file as File).name ?? '', fields };
}

function checkedType(bytes: Bytes, accept: readonly ('image' | 'pdf')[]) {
  const t = sniff(bytes);
  if (!t) throw new ApiError(415, 'Only JPEG, PNG, WebP or HEIC photos and PDF documents can be attached.');
  if (!accept.includes(t.family))
    throw new ApiError(
      415,
      accept.includes('image')
        ? 'Please attach a photo (JPEG, PNG, WebP or HEIC).'
        : 'Please attach a PDF document.',
    );
  return t;
}

account.post('/proposals/:id/files', async (c) => {
  const env = loadConfig(c.env);
  const id = c.req.param('id');
  if (!isUuid(id)) throw notFound();
  const up = await readUpload(c.req.raw);
  const clientKind = up.fields.kind;
  if (clientKind && BANNED_KINDS.includes(clientKind))
    throw badRequest('Ghana Card images are not accepted (L.I. 2523). Add a photo of your face instead.');
  const p = await getProposal(c, id);
  if (p.status !== 'draft' && p.status !== 'info_requested')
    throw new ApiError(409, 'This can no longer be changed.');
  const pf = productAndForm(p.productCode);
  const field = pf
    ? formFields(pf.form).find((f) => f.id === up.fields.fieldId && f.type === 'file')
    : undefined;
  if (!field || field.type !== 'file')
    throw invalid([{ field: 'fieldId', message: 'This form has no such attachment.' }]);
  if (BANNED_KINDS.includes(field.kind)) throw badRequest('This type of document is not accepted.');
  const t = checkedType(up.bytes, field.accept);
  const fileId = crypto.randomUUID();
  const row = await rpc<DbFile>(c, 'account_add_file', {
    p_customer_id: me(c).customerId,
    p_proposal_id: p.id,
    p_file_id: fileId,
    p_field_id: field.id,
    p_kind: field.kind,
    p_mime: t.mime,
    p_size: up.bytes.byteLength,
    p_original_name: safeFileName(up.name, t.ext),
    p_sha256: await sha256Hex(up.bytes),
    p_extension: t.ext,
    p_max_files: field.maxFiles ?? (field.multiple ? 10 : 1),
  });
  try {
    await storageUpload(env, row.storagePath, up.bytes, t.mime);
  } catch (err) {
    log('file_upload_failed', { message: (err as Error).message });
    await rpc(c, 'account_delete_file', {
      p_customer_id: me(c).customerId,
      p_proposal_id: p.id,
      p_file_id: fileId,
    }).catch(() => undefined);
    throw new ApiError(503, 'The file could not be saved. Please try again.');
  }
  return json(c, fileOut(row), 201);
});

account.delete('/proposals/:id/files/:fid', async (c) => {
  const { id, fid } = c.req.param();
  if (!isUuid(id) || !isUuid(fid)) throw notFound();
  const r = await rpc<{ storagePath: string }>(c, 'account_delete_file', {
    p_customer_id: me(c).customerId,
    p_proposal_id: id,
    p_file_id: fid,
  });
  await storageRemove(loadConfig(c.env), [r.storagePath]);
  return new Response(null, { status: 204, headers: NO_STORE });
});

account.delete('/claims/:id/files/:fid', async (c) => {
  const { id, fid } = c.req.param();
  if (!isUuid(id) || !isUuid(fid)) throw notFound();
  const r = await rpc<{ storagePath: string }>(c, 'account_delete_claim_file', {
    p_customer_id: me(c).customerId,
    p_claim_id: id,
    p_file_id: fid,
  });
  await storageRemove(loadConfig(c.env), [r.storagePath]);
  return new Response(null, { status: 204, headers: NO_STORE });
});

account.get('/files/:fid', async (c) => {
  const fid = c.req.param('fid');
  if (!isUuid(fid)) throw notFound();
  const f = await rpc<DbFile>(c, 'account_get_file', { p_customer_id: me(c).customerId, p_file_id: fid });
  const obj = await storageDownload(loadConfig(c.env), f.storagePath);
  return new Response(obj.body, {
    status: 200,
    headers: {
      'content-type': f.mime,
      'content-disposition': attachmentHeader(f.name),
      'x-content-type-options': 'nosniff',
      ...NO_STORE,
    },
  });
});

// ---- Submit -----------------------------------------------------------------------------------
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

account.post('/proposals/:id/submit', async (c) => {
  const env = loadConfig(c.env);
  const id = c.req.param('id');
  if (!isUuid(id)) throw notFound();
  const body = await readJson(c.req.raw, SUBMIT_CAP);
  const p = await getProposal(c, id);
  if (p.status !== 'draft' && p.status !== 'info_requested')
    throw new ApiError(409, 'This proposal has already been sent.');
  const pf = productAndForm(p.productCode);
  if (!pf) throw notFound();
  const { product, form } = pf;

  // 1. clean → validateForm
  const answers = clean(form, answersFrom(body.answers));
  const errors = validateForm(form, answers);

  // 2. confirmations: the global ones plus the form's own
  const given = Array.isArray(body.confirmations)
    ? body.confirmations.filter((x): x is string => typeof x === 'string')
    : [];
  const required = [
    ...GLOBAL_CONFIRMATIONS.map((x) => x.id),
    ...form.declaration.confirmations.map((x) => x.id),
  ];
  for (const cid of required)
    if (!given.includes(cid))
      errors.push({ field: `confirmations.${cid}`, message: 'Please tick this to confirm.' });

  // 3. signature: name, method, a real PNG of at most 300 KB
  const sig = isObject(body.signature) ? body.signature : {};
  const method =
    sig.method === 'drawn' || sig.method === 'typed' || sig.method === 'uploaded' ? sig.method : null;
  const signedName = typeof sig.signedName === 'string' ? sig.signedName.trim() : '';
  if (!method) errors.push({ field: 'signature', message: 'Please sign the declaration.' });
  if (signedName.length < 2 || signedName.length > 120)
    errors.push({ field: 'signature.signedName', message: 'Type your full name under your signature.' });
  const png =
    typeof sig.imagePng === 'string'
      ? base64ToBytes(sig.imagePng.replace(/^data:image\/png;base64,/, ''))
      : null;
  if (!png || png.byteLength < 67 || !PNG_MAGIC.every((b, i) => png[i] === b))
    errors.push({ field: 'signature', message: 'Please sign again: the signature image is missing.' });
  else if (png.byteLength > SIGNATURE_MAX)
    errors.push({ field: 'signature', message: 'The signature image is too large. Please sign again.' });

  // 4. every file answer references this proposal's own uploads, for the right field
  const files = p.files ?? [];
  const fileIds: string[] = [];
  for (const f of formFields(form)) {
    if (f.type !== 'file' || answers[f.id] === undefined) continue;
    const ids = answers[f.id];
    if (!Array.isArray(ids)) continue; // validateForm reported it
    for (const fid of ids) {
      if (typeof fid !== 'string' || !files.some((x) => x.id === fid && x.fieldId === f.id)) {
        errors.push({ field: f.id, message: 'Please attach this file again.' });
        break;
      }
      fileIds.push(fid);
    }
  }
  if (errors.length || !png || !method) throw invalid(errors);

  // 5. hash the answers that were signed; store the signature image
  const answersSha256 = await sha256Hex(canonicalJson(answers));
  const imagePath = `${me(c).customerId}/${p.id}/signature.png`;
  await storageUpload(env, imagePath, png, 'image/png', true);

  // 6. price: instant products online; anything referred, and underwriter products, go to the queue
  const settings = await readSalesSettings(env);
  let quote: Quote | null = null;
  let refer: readonly string[] = [];
  if (product.purchase === 'instant') {
    const r = rate(product, answers, settings);
    if (r.ok) quote = r.quote;
    else refer = r.refer;
  }

  const roles = rolesOf(form);
  const date = (k: string | undefined) => (k && isIsoDate(answers[k]) ? (answers[k] as string) : null);
  const sumKey = roles.sumInsured;
  const sum = sumKey !== undefined && answers[sumKey] !== undefined ? Number(answers[sumKey]) : NaN;
  const profile: Record<string, unknown> = {};
  for (const f of formFields(form)) {
    const v = answers[f.id];
    if (f.saveToProfile && f.saveToProfile !== 'phone' && (typeof v === 'string' || typeof v === 'number'))
      profile[f.saveToProfile] = String(v);
  }
  let subject = '';
  try {
    subject = insuredSubject(product, answers);
  } catch (err) {
    log('insured_subject_failed', { message: (err as Error).message });
  }
  const start = date(roles.coverStart);
  const end = date(roles.coverEnd);
  const detail = await rpc<DbProposal>(c, 'account_submit_proposal', {
    p_customer_id: me(c).customerId,
    p_proposal_id: p.id,
    p_form_version: form.version,
    p_answers: answers,
    p_confirmations: required,
    p_signature: {
      method,
      signedName,
      clientSignedAt: typeof sig.signedAt === 'string' ? sig.signedAt.slice(0, 40) : null,
      ip: clientIp(c.req.raw),
      userAgent: (c.req.header('user-agent') ?? '').slice(0, 300),
      phone: me(c).phone,
      answersSha256,
      imagePath,
    },
    p_file_ids: fileIds,
    p_quote: quote,
    p_refer: refer,
    p_sum_insured: Number.isFinite(sum) && sum >= 0 ? sum : null,
    p_cover_start: start,
    p_cover_end: start && end && end >= start ? end : null,
    p_insured_subject: subject.slice(0, 200) || null,
    p_profile: profile,
    p_marketing_consent: typeof body.marketingConsent === 'boolean' ? body.marketingConsent : null,
  });
  return json(c, detailOut(detail));
});

// The completed proposal, for rendering in the browser (renderProposalPdf / Docx).
account.get('/proposals/:id/document', async (c) => {
  const p = await getProposal(c, c.req.param('id'));
  const pf = productAndForm(p.productCode);
  if (!pf) throw notFound();
  let imagePng: string | undefined;
  if (p.signature?.imagePath) {
    const res = await storageDownload(loadConfig(c.env), p.signature.imagePath);
    imagePng = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  }
  return json(c, {
    form: pf.form,
    answers: p.answers ?? {},
    files: (p.files ?? []).map(fileOut),
    ...(p.signature
      ? {
          signature: {
            method: p.signature.method,
            signedName: p.signature.signedName,
            signedAt: p.signature.signedAt,
            ...(imagePng ? { imagePng } : {}),
          },
        }
      : {}),
    meta: {
      proposalNo: p.proposalNo,
      productCode: p.productCode,
      productName: pf.product.name,
      status: p.status,
      customerNo: me(c).customerNo,
      phone: me(c).phone,
      formVersion: p.formVersion ?? pf.form.version,
      ...(p.submittedAt ? { submittedAt: p.submittedAt } : {}),
      ...(p.signature?.ip ? { ip: p.signature.ip } : {}),
      ...(p.signature?.answersSha256 ? { answersSha256: p.signature.answersSha256 } : {}),
      // The exact confirmations the customer ticked, with their wording, for the signature record.
      confirmations: [...GLOBAL_CONFIRMATIONS, ...pf.form.declaration.confirmations]
        .filter((x) => (p.confirmations ?? []).includes(x.id))
        .map((x) => ({ id: x.id, label: x.label })),
    },
  });
});

// ---- Payments ---------------------------------------------------------------------------------
account.post('/proposals/:id/payments', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) throw notFound();
  const body = await readJson(c.req.raw, 4 * 1024);
  const prepared = prepareSimulatedPayment(body);
  if (Array.isArray(prepared)) throw invalid(prepared);
  const pay = await rpc<DbPayment>(c, 'account_payment_start', {
    p_customer_id: me(c).customerId,
    p_proposal_id: id,
    p_method: prepared.method,
    p_network: prepared.network,
    p_masked_account: prepared.maskedAccount,
    p_provider_data: prepared.providerData,
  });
  return json(c, paymentOut(pay), 201);
});

const REF_RE = /^PAY-[A-Z0-9]{10}$/;
const getPayment = (c: C, ref: string) => {
  if (!REF_RE.test(ref)) throw notFound();
  return rpc<DbPayment>(c, 'account_get_payment', { p_customer_id: me(c).customerId, p_reference: ref });
};

account.get('/payments/:ref', async (c) => json(c, paymentOut(await getPayment(c, c.req.param('ref')))));

/** Simulated gateway only: stands in for the customer approving the MoMo prompt or 3-D Secure. */
account.post('/payments/:ref/simulate', async (c) => {
  const env = loadConfig(c.env);
  const settings = await readSalesSettings(env);
  if (settings.paymentMode !== 'simulated') throw notFound();
  const ref = c.req.param('ref');
  const body = await readJson(c.req.raw, 1024);
  if (typeof body.approve !== 'boolean')
    throw invalid([{ field: 'approve', message: 'approve must be true or false.' }]);
  const pay = await getPayment(c, ref);
  if (pay.status === 'succeeded') return json(c, paymentOut(pay));
  const complete = (approved: boolean, reason: string | null, certificate: unknown = null) =>
    rpc<DbPayment>(c, 'account_payment_complete', {
      p_customer_id: me(c).customerId,
      p_reference: ref,
      p_approved: approved,
      p_failure_reason: reason,
      p_certificate: certificate,
    });
  if (!body.approve) return json(c, paymentOut(await complete(false, 'You did not approve the payment.')));
  if (pay.providerData?.simulatedOutcome === 'decline')
    return json(
      c,
      paymentOut(
        await complete(
          false,
          pay.method === 'momo'
            ? 'The mobile money payment was declined.'
            : 'The card was declined by the issuer.',
        ),
      ),
    );
  if (pay.status !== 'pending') throw new ApiError(409, 'This payment has already finished.');

  const p = await getProposal(c, pay.proposalId);
  const pf = productAndForm(p.productCode);
  if (!pf) throw notFound();
  const answers = p.answers ?? {};
  const r = await rpc<{
    alreadyIssued: boolean;
    payment?: DbPayment;
    policyNo: string;
    certificateNo: string;
    startsOn: string;
    expiresOn: string;
    issuedAt: string;
    customerNo: string;
    fullName?: string;
    companyName?: string;
  }>(c, 'account_payment_reserve', {
    p_customer_id: me(c).customerId,
    p_reference: ref,
    p_policy_code: policyCode(pf.product, answers),
  });
  if (r.alreadyIssued && r.payment) return json(c, paymentOut(r.payment));

  const insuredNameField = formFields(pf.form).find((f) => f.role === 'insuredName');
  const named = insuredNameField ? answers[insuredNameField.id] : undefined;
  const policyHolder =
    (typeof named === 'string' && named.trim()) || r.companyName || r.fullName || r.customerNo;
  let certificate;
  try {
    certificate = buildCertificate({
      product: pf.product,
      answers,
      policyNo: r.policyNo,
      certificateNo: r.certificateNo,
      customerNo: r.customerNo,
      policyHolder,
      startsOn: r.startsOn,
      expiresOn: r.expiresOn,
      issuedAt: new Date(r.issuedAt).toISOString(),
      tppdLimit: settings.tppdLimit,
      verifyUrl: `${new URL(c.req.url).origin}/verify?certificate=${encodeURIComponent(r.certificateNo)}`,
    });
  } catch (err) {
    log('certificate_build_failed', { reference: ref, message: (err as Error).message });
    // The payment stays pending with its numbers reserved; approving again retries the same numbers.
    throw new ApiError(500, 'We could not produce your certificate.', {
      detail: 'Your payment has not been taken. Please try again later or call Serene Insurance.',
    });
  }
  certificate = { ...certificate, signatoryTitle: settings.signatoryTitle };
  return json(c, paymentOut(await complete(true, null, certificate)));
});

// ---- Policies ---------------------------------------------------------------------------------
account.get('/policies', async (c) =>
  json(
    c,
    (await rpc<DbPolicy[]>(c, 'account_list_policies', { p_customer_id: me(c).customerId })).map(policyOut),
  ),
);

const getPolicy = (c: C, id: string) => {
  if (!isUuid(id)) throw notFound();
  return rpc<DbPolicy>(c, 'account_get_policy', { p_customer_id: me(c).customerId, p_policy_id: id });
};

account.get('/policies/:id', async (c) => {
  const p = await getPolicy(c, c.req.param('id'));
  if (!p.payment) throw notFound();
  return json(c, {
    ...policyOut(p),
    certificate: p.certificate,
    payment: paymentOut(p.payment),
    // Where the account app fetches the signature image to render this certificate (absent: dotted line only).
    ...(p.signaturePath ? { signatureUrl: `${ACCOUNT_API}/policies/${p.id}/signature` } : {}),
  });
});

/** The certificate signature image recorded at issue (owner only); 404 when the certificate has none. */
account.get('/policies/:id/signature', async (c) => {
  const p = await getPolicy(c, c.req.param('id'));
  if (!p.signaturePath) throw notFound();
  const res = await storageDownload(loadConfig(c.env), p.signaturePath);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const t = sniff(bytes);
  if (!t || t.family !== 'image' || t.mime === 'image/heic') {
    log('certificate_signature_not_an_image', { policyId: p.id });
    throw notFound();
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': t.mime,
      'x-content-type-options': 'nosniff',
      // The path is versioned and recorded per policy, so the bytes never change.
      'cache-control': 'private, max-age=86400, immutable',
    },
  });
});

account.post('/policies/:id/renew', async (c) => {
  const p = await getPolicy(c, c.req.param('id'));
  const pf = productAndForm(p.productCode);
  if (!pf) throw notFound();
  const fields = formFields(pf.form);
  const detail = await rpc<DbProposal>(c, 'account_renew_policy', {
    p_customer_id: me(c).customerId,
    p_policy_id: p.id,
    p_form_version: pf.form.version,
    p_start_keys: fields.filter((f) => f.role === 'coverStart').map((f) => f.id),
    p_end_keys: fields.filter((f) => f.role === 'coverEnd').map((f) => f.id),
    // Files and the signature are never carried over.
    p_drop_keys: fields.filter((f) => f.type === 'file').map((f) => f.id),
  });
  return json(c, detailOut(detail), 201);
});

// ---- Claims -----------------------------------------------------------------------------------
account.post('/policies/:id/claims', async (c) => {
  const p = await getPolicy(c, c.req.param('id'));
  const product = productByCode(p.productCode);
  if (!product) throw notFound();
  const body = await readJson(c.req.raw, 16 * 1024);
  const errors: FieldError[] = [];
  const type = claimTypesFor(product.category).find((t) => t.id === body.claimType);
  if (!type) errors.push({ field: 'claimType', message: 'Choose what happened.' });
  const incidentDate = body.incidentDate;
  if (!isIsoDate(incidentDate))
    errors.push({ field: 'incidentDate', message: 'Enter the date of the incident.' });
  else if (incidentDate > todayIso())
    errors.push({ field: 'incidentDate', message: 'The date of the incident cannot be in the future.' });
  else if (incidentDate < p.startsOn || incidentDate > p.expiresOn)
    errors.push({
      field: 'incidentDate',
      message: 'The incident date must be inside the policy’s period of cover.',
    });
  const location = typeof body.incidentLocation === 'string' ? body.incidentLocation.trim() : '';
  if (location.length < 2 || location.length > 300)
    errors.push({ field: 'incidentLocation', message: 'Say where it happened.' });
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length < 20 || description.length > 5000)
    errors.push({ field: 'description', message: 'Describe what happened in 20 to 5,000 characters.' });
  const amount = body.estimatedAmount;
  if (
    amount !== undefined &&
    amount !== null &&
    (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)
  )
    errors.push({ field: 'estimatedAmount', message: 'Enter an amount of zero or more.' });
  let thirdParty: Record<string, string> | null = null;
  if (body.thirdParty !== undefined && body.thirdParty !== null) {
    if (!isObject(body.thirdParty))
      errors.push({ field: 'thirdParty', message: 'Give the other party’s details.' });
    else {
      thirdParty = {};
      for (const k of ['name', 'phone', 'vehicleReg'] as const) {
        const v = body.thirdParty[k];
        if (v === undefined || v === null || v === '') continue;
        if (typeof v !== 'string' || v.length > 120)
          errors.push({ field: `thirdParty.${k}`, message: 'Keep this under 120 characters.' });
        else thirdParty[k] = v.trim();
      }
    }
  }
  if (errors.length || !type) throw invalid(errors);
  if (p.status !== 'active') throw new ApiError(409, 'Claims can be made only on an active policy.');
  const cl = await rpc<DbClaim>(c, 'account_create_claim', {
    p_customer_id: me(c).customerId,
    p_policy_id: p.id,
    p_claim_type: type.id,
    p_incident_date: incidentDate,
    p_incident_location: location,
    p_description: description,
    p_estimated_amount: typeof amount === 'number' ? amount : null,
    p_third_party: thirdParty && Object.keys(thirdParty).length ? thirdParty : null,
  });
  return json(c, claimDetailOut(cl), 201);
});

const getClaim = (c: C, id: string) => {
  if (!isUuid(id)) throw notFound();
  return rpc<DbClaim>(c, 'account_get_claim', { p_customer_id: me(c).customerId, p_claim_id: id });
};

account.get('/claims', async (c) =>
  json(
    c,
    (await rpc<DbClaim[]>(c, 'account_list_claims', { p_customer_id: me(c).customerId })).map(
      claimSummaryOut,
    ),
  ),
);

account.get('/claims/:id', async (c) => json(c, claimDetailOut(await getClaim(c, c.req.param('id')))));

account.post('/claims/:id/files', async (c) => {
  const env = loadConfig(c.env);
  const id = c.req.param('id');
  if (!isUuid(id)) throw notFound();
  const up = await readUpload(c.req.raw);
  const kind = up.fields.kind ?? '';
  if (BANNED_KINDS.includes(kind)) throw badRequest('Ghana Card images are not accepted (L.I. 2523).');
  const cl = await getClaim(c, id);
  const type = CLAIM_TYPES.find((t) => t.id === cl.claimType);
  if (!type || !type.documents.some((d) => d.kind === kind))
    throw invalid([{ field: 'kind', message: 'Choose which document this is.' }]);
  const t = checkedType(up.bytes, ['image', 'pdf']);
  const fileId = crypto.randomUUID();
  const row = await rpc<DbFile>(c, 'account_add_claim_file', {
    p_customer_id: me(c).customerId,
    p_claim_id: cl.id,
    p_file_id: fileId,
    p_kind: kind,
    p_mime: t.mime,
    p_size: up.bytes.byteLength,
    p_original_name: safeFileName(up.name, t.ext),
    p_sha256: await sha256Hex(up.bytes),
    p_extension: t.ext,
  });
  try {
    await storageUpload(env, row.storagePath, up.bytes, t.mime);
  } catch (err) {
    log('claim_file_upload_failed', { message: (err as Error).message });
    await rpc(c, 'account_delete_claim_file', {
      p_customer_id: me(c).customerId,
      p_claim_id: cl.id,
      p_file_id: fileId,
    }).catch(() => undefined);
    throw new ApiError(503, 'The file could not be saved. Please try again.');
  }
  return json(
    c,
    { id: row.id, kind: row.kind, name: row.name, mime: row.mime, size: row.size, createdAt: row.createdAt },
    201,
  );
});

account.post('/claims/:id/submit', async (c) => {
  const cl = await getClaim(c, c.req.param('id'));
  const type = CLAIM_TYPES.find((t) => t.id === cl.claimType);
  const requiredDocs = (type?.documents ?? []).filter((d) => d.required);
  try {
    const done = await rpc<DbClaim>(c, 'account_submit_claim', {
      p_customer_id: me(c).customerId,
      p_claim_id: cl.id,
      p_required_kinds: requiredDocs.map((d) => d.kind),
    });
    return json(c, claimDetailOut(done));
  } catch (err) {
    if (err instanceof RpcError && err.message === 'documents-missing') {
      const missing = (err.details ?? '').split(',').filter(Boolean);
      throw invalid(
        requiredDocs
          .filter((d) => missing.includes(d.kind))
          .map((d) => ({ field: d.kind, message: `Please attach: ${d.label}.` })),
        'Please attach every required document.',
      );
    }
    throw err;
  }
});

account.post('/claims/:id/respond', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) throw notFound();
  const body = await readJson(c.req.raw, 16 * 1024);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 1 || message.length > 5000)
    throw invalid([{ field: 'message', message: 'Write your reply (up to 5,000 characters).' }]);
  return json(
    c,
    claimDetailOut(
      await rpc<DbClaim>(c, 'account_respond_claim', {
        p_customer_id: me(c).customerId,
        p_claim_id: id,
        p_message: message,
      }),
    ),
  );
});

account.all('*', () => problem(404, 'Not found.'));

// ---------------------------------------------------------------------------
// GET /api/verify?certificate=&reg=  (public, rate limited)
// ---------------------------------------------------------------------------
export const verify = new Hono<Env>();
verify.use('*', rateLimit);
verify.onError(onError);
verify.get('/', async (c) => {
  const env: SurveyWorkerEnv = loadConfig(c.env);
  const certificate = (c.req.query('certificate') ?? '').slice(0, 40);
  const reference = (c.req.query('reg') ?? c.req.query('policy') ?? '').slice(0, 40);
  if (!certificate.trim() || !reference.trim())
    throw invalid([
      ...(certificate.trim() ? [] : [{ field: 'certificate', message: 'Enter the certificate number.' }]),
      ...(reference.trim()
        ? []
        : [{ field: 'reg', message: 'Enter the vehicle registration or the policy number.' }]),
    ]);
  const r = await callRpc<VerifyResponse & { productCode?: string }>(env, 'verify_certificate', {
    p_certificate_no: certificate,
    p_reference: reference,
  });
  if (!r.found) return json(c, { found: false } satisfies VerifyResponse);
  const out: VerifyResponse = {
    found: true,
    ...(r.status ? { status: r.status } : {}),
    ...(r.certificateNo ? { certificateNo: r.certificateNo } : {}),
    ...(r.policyNo ? { policyNo: r.policyNo } : {}),
    ...(r.productCode ? { productName: productName(r.productCode) } : {}),
    ...(r.coverTitle ? { coverTitle: r.coverTitle } : {}),
    ...(r.insuredSubject ? { insuredSubject: r.insuredSubject } : {}),
    ...(r.holderInitials ? { holderInitials: r.holderInitials } : {}),
    ...(r.startsOn ? { startsOn: r.startsOn } : {}),
    ...(r.expiresOn ? { expiresOn: r.expiresOn } : {}),
  };
  return json(c, out);
});
verify.all('*', () => problem(405, 'Method not allowed.'));
