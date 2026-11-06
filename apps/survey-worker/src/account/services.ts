// External services behind the customer API: sales settings, Supabase Storage, SMS, the payment
// gateway, and file-type sniffing.
import type { SurveyWorkerEnv } from '@serene/contracts';
import type { FieldError } from '@serene/proposals';
import { RpcError, supabaseHeaders } from '../supabase';
import { log, maskPhone, normaliseGhanaMobile, type Bytes } from './http';

const TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Sales settings (public.settings, architecture.md › Settings keys)
// ---------------------------------------------------------------------------
export const SALES_SETTING_KEYS = [
  'sales_rates',
  'sales_tppd_limit',
  'sales_sms_mode',
  'sales_sms_sender_id',
  'sales_payment_mode',
  'sales_certificate_series',
  'sales_certificate_signatory_title',
  'sales_quote_validity_days',
] as const;

export interface SalesSettings {
  rates: unknown;
  tppdLimit: number;
  smsMode: 'simulated' | 'arkesel';
  smsSenderId: string;
  paymentMode: 'simulated';
  signatoryTitle: string;
  quoteValidityDays: number;
}

let cache: { at: number; url: string; value: SalesSettings } | undefined;
const TTL_MS = 60 * 1000;

/**
 * Read with the service key; only the sales_* keys. A failure is an error, never a silent default:
 * defaulting sales_sms_mode to "simulated" would put sign-in codes on screen in production.
 */
export async function readSalesSettings(env: SurveyWorkerEnv): Promise<SalesSettings> {
  if (cache && cache.url === env.SUPABASE_URL && Date.now() - cache.at < TTL_MS) return cache.value;
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/settings?select=key,value&key=in.(${SALES_SETTING_KEYS.join(',')})`,
    { headers: supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY), signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok)
    throw new RpcError(
      res.status,
      undefined,
      `sales settings read failed with HTTP ${res.status}`,
      undefined,
    );
  const rows = (await res.json()) as { key: string; value: unknown }[];
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const num = (k: string, d: number) => (typeof get(k) === 'number' ? (get(k) as number) : d);
  const str = (k: string, d: string) =>
    typeof get(k) === 'string' && (get(k) as string).trim() ? (get(k) as string) : d;
  const value: SalesSettings = {
    rates: get('sales_rates'),
    tppdLimit: num('sales_tppd_limit', 8000),
    smsMode: get('sales_sms_mode') === 'arkesel' ? 'arkesel' : 'simulated',
    smsSenderId: str('sales_sms_sender_id', 'Serene'),
    paymentMode: 'simulated',
    signatoryTitle: str('sales_certificate_signatory_title', 'CHIEF EXECUTIVE OFFICER'),
    quoteValidityDays: num('sales_quote_validity_days', 30),
  };
  cache = { at: Date.now(), url: env.SUPABASE_URL, value };
  return value;
}

/** Test hook. */
export function resetSalesSettingsCache(): void {
  cache = undefined;
}

// ---------------------------------------------------------------------------
// Supabase Storage (bucket customer-files), service key, REST
// ---------------------------------------------------------------------------
export const BUCKET = 'customer-files';
const objectUrl = (env: SurveyWorkerEnv, path: string) =>
  `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

export async function storageUpload(
  env: SurveyWorkerEnv,
  path: string,
  bytes: Bytes,
  mime: string,
  upsert = false,
): Promise<void> {
  const res = await fetch(objectUrl(env, path), {
    method: 'POST',
    headers: {
      ...supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
      'content-type': mime,
      'x-upsert': upsert ? 'true' : 'false',
      'cache-control': 'no-store',
    },
    body: bytes,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`storage upload failed with HTTP ${res.status}`);
}

export async function storageDownload(env: SurveyWorkerEnv, path: string): Promise<Response> {
  const headers = supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  delete headers['content-type'];
  const res = await fetch(objectUrl(env, path), { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`storage download failed with HTTP ${res.status}`);
  return res;
}

/** Best effort: an orphaned object is harmless (no row points at it), so failures are only logged. */
export async function storageRemove(env: SurveyWorkerEnv, paths: string[]): Promise<void> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
      body: JSON.stringify({ prefixes: paths }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) log('storage_remove_failed', { status: res.status });
  } catch (err) {
    log('storage_remove_failed', { message: (err as Error).message });
  }
}

// ---------------------------------------------------------------------------
// File types: decided from the bytes, never from the name or the browser's Content-Type.
// ---------------------------------------------------------------------------
export interface Sniffed {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'application/pdf';
  ext: 'jpg' | 'png' | 'webp' | 'heic' | 'pdf';
  family: 'image' | 'pdf';
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

export function sniff(b: Uint8Array): Sniffed | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg', family: 'image' };
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x))
    return { mime: 'image/png', ext: 'png', family: 'image' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp', family: 'image' };
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(b, 8, 12)))
    return { mime: 'image/heic', ext: 'heic', family: 'image' };
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf', family: 'pdf' };
  return null;
}

/** A display name that is safe in storage metadata and a Content-Disposition header. */
export function safeFileName(raw: unknown, ext: string): string {
  const base = (typeof raw === 'string' ? raw : '').split(/[\\/]/).pop() ?? '';
  // Drop control characters, quotes, angle brackets and backslashes.
  const clean = [...base]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x1f && code !== 0x7f && !'"<>\\'.includes(ch);
    })
    .join('')
    .trim()
    .slice(0, 150);
  return clean || `file.${ext}`;
}

/** Content-Disposition: attachment with an ASCII fallback and the UTF-8 name (RFC 6266 / 5987). */
export function attachmentHeader(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/[;"]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// ---------------------------------------------------------------------------
// SMS (architecture.md: simulated until Serene supplies an SMS account)
// ---------------------------------------------------------------------------
export interface SmsSender {
  /** Simulated: nothing is sent and the code is shown on screen in a labelled "Test mode" banner. */
  readonly simulated: boolean;
  send(toE164: string, text: string): Promise<void>;
}

const simulatedSms: SmsSender = { simulated: true, send: async () => undefined };

export function arkeselSms(apiKey: string, sender: string): SmsSender {
  return {
    simulated: false,
    async send(toE164, text) {
      const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ sender, message: text, recipients: [toE164.replace(/^\+/, '')] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      let ok = res.ok;
      if (ok) {
        const body = (await res.json().catch(() => ({}))) as { status?: string };
        ok = body.status === 'success';
      }
      if (!ok) throw new Error(`arkesel send failed with HTTP ${res.status}`);
    },
  };
}

/** Arkesel only when the setting asks for it AND the Worker secret exists; otherwise simulated. */
export function smsSender(env: SurveyWorkerEnv, settings: SalesSettings): SmsSender {
  if (settings.smsMode === 'arkesel') {
    if (env.ARKESEL_API_KEY) return arkeselSms(env.ARKESEL_API_KEY, settings.smsSenderId);
    log('sms_arkesel_key_missing');
  }
  return simulatedSms;
}

// ---------------------------------------------------------------------------
// Payment gateway (simulated). Only masked account details ever leave this module.
// ---------------------------------------------------------------------------
export interface PreparedPayment {
  method: 'momo' | 'card';
  network: 'mtn' | 'telecel' | 'airteltigo' | null;
  maskedAccount: string;
  providerData: { simulatedOutcome: 'approve' | 'decline' };
}

const NETWORKS = ['mtn', 'telecel', 'airteltigo'] as const;
/** Documented test values (architecture.md › Pay). */
export const DECLINED_CARD = '4000000000000002';

export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardExpiryValid(raw: unknown, now = new Date()): boolean {
  const m = typeof raw === 'string' ? raw.trim().match(/^(\d{2})\s*\/\s*(\d{2})$/) : null;
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  // Valid through the last day of the expiry month.
  return Date.UTC(year, month, 1) > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function prepareSimulatedPayment(
  body: Record<string, unknown>,
  now = new Date(),
): PreparedPayment | FieldError[] {
  const errors: FieldError[] = [];
  if (body.method === 'momo') {
    const network = NETWORKS.find((n) => n === body.network);
    if (!network) errors.push({ field: 'network', message: 'Choose your mobile money network.' });
    const phone = normaliseGhanaMobile(body.account);
    if (!phone)
      errors.push({
        field: 'account',
        message: 'Enter a Ghana mobile money number, for example 024 123 4567.',
      });
    if (errors.length || !network || !phone) return errors;
    return {
      method: 'momo',
      network,
      maskedAccount: maskPhone(phone),
      providerData: { simulatedOutcome: phone.endsWith('0000') ? 'decline' : 'approve' },
    };
  }
  if (body.method === 'card') {
    const digits = typeof body.account === 'string' ? body.account.replace(/[\s-]/g, '') : '';
    if (!/^\d{13,19}$/.test(digits) || !luhn(digits))
      errors.push({ field: 'account', message: 'Enter a valid card number.' });
    if (!cardExpiryValid(body.cardExpiry, now))
      errors.push({
        field: 'cardExpiry',
        message: 'Enter the expiry date as MM/YY; the card must not have expired.',
      });
    if (typeof body.cardCvc !== 'string' || !/^\d{3}$/.test(body.cardCvc))
      errors.push({
        field: 'cardCvc',
        message: 'Enter the 3-digit security code from the back of the card.',
      });
    if (body.cardName !== undefined && (typeof body.cardName !== 'string' || body.cardName.length > 100))
      errors.push({ field: 'cardName', message: 'Enter the name as printed on the card.' });
    if (errors.length) return errors;
    return {
      method: 'card',
      network: null,
      maskedAccount: `•••• ${digits.slice(-4)}`,
      providerData: { simulatedOutcome: digits === DECLINED_CARD ? 'decline' : 'approve' },
    };
  }
  return [{ field: 'method', message: 'Choose mobile money or card.' }];
}
