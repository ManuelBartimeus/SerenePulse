// Formatting and parsing helpers. Pure functions only (unit tested in format.test.ts).

// ---- Phone numbers (Ghana) -----------------------------------------------------------------

/** Digits of the national significant number (9 digits, no leading 0) or null when not a Ghana number. */
export function ghanaNsn(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+233')) d = d.slice(4);
  else if (d.startsWith('00233')) d = d.slice(5);
  else if (d.startsWith('233') && d.length >= 12) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  else return null;
  d = d.replace(/\D/g, '');
  return d.length === 9 ? d : null;
}

/** +233XXXXXXXXX, or null when the input is not a complete Ghana number. */
export function toE164(raw: string): string | null {
  const nsn = ghanaNsn(raw);
  return nsn ? `+233${nsn}` : null;
}

/** Ghana mobile numbers start 02x or 05x after the trunk 0. */
export function isGhanaMobile(raw: string): boolean {
  const nsn = ghanaNsn(raw);
  return !!nsn && /^[25]\d{8}$/.test(nsn);
}

/**
 * Formats a phone number while it is typed. Local numbers become "024 123 4567";
 * international ones "+233 24 123 4567". Never adds characters the user has not typed past.
 */
export function formatPhoneInput(raw: string): string {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '').slice(0, 12);
    if (!digits.startsWith('233')) return `+${digits}`;
    const rest = digits.slice(3);
    const parts = [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5, 9)].filter(Boolean);
    return ['+233', ...parts].join(' ');
  }
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('233') && digits.length > 10) return formatPhoneInput(`+${digits}`);
  digits = digits.slice(0, 10);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean);
  return parts.join(' ');
}

/** "+233241234567" → "024 123 4567" (display form). */
export function formatPhoneLocal(e164OrLocal: string): string {
  const nsn = ghanaNsn(e164OrLocal);
  if (!nsn) return e164OrLocal;
  return `0${nsn.slice(0, 2)} ${nsn.slice(2, 5)} ${nsn.slice(5)}`;
}

/** "+233241234567" → "024 *** 4567". */
export function maskPhone(e164OrLocal: string): string {
  const nsn = ghanaNsn(e164OrLocal);
  if (!nsn) return e164OrLocal;
  return `0${nsn.slice(0, 2)} *** ${nsn.slice(5)}`;
}

// ---- Money and numbers ---------------------------------------------------------------------

const CURRENCY_SYMBOL: Record<string, string> = { GHS: 'GH₵', USD: 'US$', EUR: '€', GBP: '£' };
export const currencySymbol = (code: string | undefined): string =>
  CURRENCY_SYMBOL[code ?? 'GHS'] ?? code ?? 'GH₵';

/** 1234.5 → "GH₵ 1,234.50"; negatives get a real minus sign. */
export function formatMoney(amount: number, currency = 'GHS'): string {
  const abs = Math.abs(amount).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '−' : ''}${currencySymbol(currency)} ${abs}`;
}

/** Groups the integer part with commas while keeping what the user typed after the point. */
export function formatAmountInput(raw: string, decimals = 2): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (cleaned === '') return '';
  const firstDot = cleaned.indexOf('.');
  const intPart = (firstDot === -1 ? cleaned : cleaned.slice(0, firstDot)).replace(/^0+(?=\d)/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (firstDot === -1 || decimals === 0) return grouped;
  const frac = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, '')
    .slice(0, decimals);
  return `${grouped || '0'}.${frac}`;
}

/** "12,500.50" → 12500.5; "" → null; junk → null. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Number shown back in an amount input. */
export function amountToInput(v: unknown, decimals = 2): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = decimals === 0 ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
    return formatAmountInput(s, decimals);
  }
  if (typeof v === 'string') return formatAmountInput(v, decimals);
  return '';
}

export const formatNumber = (n: number): string => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });

// ---- Text formats used by proposal fields --------------------------------------------------

/** Formats a Ghana Card PIN as typed: "gha1234567890" → "GHA-123456789-0". */
export function formatGhanaCardInput(raw: string): string {
  const upper = raw.toUpperCase();
  const digits = upper
    .replace(/^G?H?A?/, '')
    .replace(/\D/g, '')
    .slice(0, 10);
  if (digits === '') {
    // Let people type the letters themselves.
    const letters = upper.replace(/[^A-Z]/g, '').slice(0, 3);
    return 'GHA'.startsWith(letters) ? letters : 'GHA-';
  }
  const a = digits.slice(0, 9);
  const b = digits.slice(9);
  return `GHA-${a}${digits.length > 9 ? `-${b}` : ''}`;
}

/** GhanaPost GPS: "ga5430125" → "GA-543-0125". */
export function formatDigitalAddressInput(raw: string): string {
  const up = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const letters = up.match(/^[A-Z]{0,2}/)?.[0] ?? '';
  const digits = up.slice(letters.length).replace(/\D/g, '').slice(0, 8);
  if (letters.length < 2) return letters;
  if (digits.length === 0) return letters;
  // 3+4 is the common shape; 7 digits → 3-4, 8 digits → 4-4, 6 digits → 3-3.
  let split = 3;
  if (digits.length === 8) split = 4;
  const p1 = digits.slice(0, split);
  const p2 = digits.slice(split);
  return p2 ? `${letters}-${p1}-${p2}` : `${letters}-${p1}`;
}

/** Upper-case formats (registration, chassis, passport, TIN). Keeps the user's spacing. */
export const upperInput = (raw: string): string => raw.toUpperCase();

// ---- Cards -----------------------------------------------------------------------------------

export type CardBrand = 'visa' | 'mastercard' | 'verve' | 'amex' | null;

export function cardBrand(raw: string): CardBrand {
  const d = raw.replace(/\D/g, '');
  if (/^4/.test(d)) return 'visa';
  if (/^(506[01]|507[89]|6500)/.test(d)) return 'verve';
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/.test(d)) return 'mastercard';
  if (/^3[47]/.test(d)) return 'amex';
  return null;
}

export const CARD_BRAND_LABEL: Record<Exclude<CardBrand, null>, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  verve: 'Verve',
  amex: 'American Express',
};

/** "4242424242424242" → "4242 4242 4242 4242" (Amex 4-6-5). */
export function formatCardNumber(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 19);
  if (cardBrand(d) === 'amex')
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  return d.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function luhnValid(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length < 12 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** "0429" → "04/29"; "4" → "04/" is not forced: only inserts the slash after two digits. */
export function formatExpiryInput(raw: string, previous = ''): string {
  let d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length === 1 && Number(d) > 1) d = `0${d}`;
  // Deleting the slash also deletes the month digit before it.
  if (previous.endsWith('/') && raw.length < previous.length) return d.slice(0, 1);
  if (d.length >= 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

/** True when MM/YY is a real month that has not ended yet. */
export function expiryValid(mmYY: string, today = new Date()): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(mmYY);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const endOfMonth = new Date(Date.UTC(year, month, 1));
  return endOfMonth.getTime() > today.getTime();
}

// ---- Dates -----------------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-06" or ISO timestamp → "6 Nov 2026". */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

/** ISO timestamp → "6 Nov 2026, 14:05" (Ghana is on GMT all year). */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${formatDate(d.toISOString())}, ${hh}:${mm}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function addYears(base: Date, years: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/** Whole days from today until the ISO date (negative when past). */
export function daysUntil(iso: string, today = new Date()): number {
  const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86_400_000);
}

export function renewalText(expiresOn: string, today = new Date()): string {
  const n = daysUntil(expiresOn, today);
  if (n < 0) return `Expired on ${formatDate(expiresOn)}`;
  if (n === 0) return 'Expires today';
  if (n === 1) return 'Renews tomorrow';
  return `Renews in ${n} days`;
}

/** m:ss for countdowns. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- People ------------------------------------------------------------------------------------

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'rev', 'nana', 'hon', 'togbe', 'naa']);

/** "Dr. Ama Serwaa Mensah" → "Ama". */
export function firstName(fullName: string | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  const first = parts.find((p) => !TITLES.has(p.replace(/\./g, '').toLowerCase()));
  return first ?? '';
}

export function initials(fullName: string | undefined): string {
  const parts = (fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p && !TITLES.has(p.replace(/\./g, '').toLowerCase()));
  if (parts.length === 0) return '';
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (a + b).toUpperCase();
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "INDEX MARK OF VEHICLE" → "Index mark of vehicle"; mixed-case text is left alone. */
export function sentence(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]{2}/.test(s)) return s;
  const lower = s
    .toLowerCase()
    .replace(/\bt\.p\.p\.d\b/g, 'T.P.P.D')
    .replace(/\bghana\b/g, 'Ghana');
  return lower.replace(/[a-zA-Z]/, (c) => c.toUpperCase());
}
