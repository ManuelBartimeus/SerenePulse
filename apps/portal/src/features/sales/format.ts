// Plain-language labels, filters and sums for the sales pages. Pure functions (unit-tested).
import type { ProposalStatus } from '@serene/proposals';
import { productByCode } from '@serene/proposals';
import type { IdentityStatus } from './api';

type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

export const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Awaiting review', tone: 'warning' },
  under_review: { label: 'Being reviewed', tone: 'info' },
  info_requested: { label: 'Information requested', tone: 'warning' },
  quoted: { label: 'Price sent', tone: 'brand' },
  declined: { label: 'Declined', tone: 'danger' },
  paid: { label: 'Paid', tone: 'success' },
  issued: { label: 'Policy issued', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Price expired', tone: 'neutral' },
};

export function proposalStatus(status: string): { label: string; tone: Tone } {
  return PROPOSAL_STATUS[status as ProposalStatus] ?? { label: humanise(status), tone: 'neutral' };
}

export const POLICY_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  not_yet_active: { label: 'Starts later', tone: 'info' },
};
export const policyStatus = (s: string) =>
  POLICY_STATUS[s] ?? { label: humanise(s), tone: 'neutral' as Tone };

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Waiting for customer', tone: 'warning' },
  succeeded: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};
export const paymentStatus = (s: string) =>
  PAYMENT_STATUS[s] ?? { label: humanise(s), tone: 'neutral' as Tone };

export const IDENTITY_STATUS: Record<IdentityStatus, { label: string; tone: Tone }> = {
  unverified: { label: 'Not checked', tone: 'neutral' },
  pending: { label: 'Check pending', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  mismatch: { label: 'Does not match', tone: 'danger' },
};
export const identityStatus = (s: string | null | undefined) =>
  IDENTITY_STATUS[(s ?? 'unverified') as IdentityStatus] ?? IDENTITY_STATUS.unverified;

export const PAYMENT_METHOD: Record<string, string> = { momo: 'Mobile money', card: 'Card' };
export const NETWORK: Record<string, string> = { mtn: 'MTN', telecel: 'Telecel', airteltigo: 'AirtelTigo' };

export function paymentMethod(method: string, network?: string | null): string {
  const m = PAYMENT_METHOD[method] ?? humanise(method);
  return network ? `${m} · ${NETWORK[network] ?? network.toUpperCase()}` : m;
}

export function humanise(s: string): string {
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const productName = (code: string) => productByCode(code)?.name ?? code;

// ---- Proposal queue tabs ------------------------------------------------------------------

export type ProposalTab = 'review' | 'info' | 'quoted' | 'issued' | 'declined' | 'drafts' | 'all';

/** "All" comes first and is the default view of the Proposals page (user direction, 2026-11-09). */
export const DEFAULT_PROPOSAL_TAB: ProposalTab = 'all';

export const PROPOSAL_TABS: { key: ProposalTab; label: string; statuses: readonly ProposalStatus[] }[] = [
  { key: 'all', label: 'All', statuses: [] },
  { key: 'review', label: 'Awaiting review', statuses: ['submitted', 'under_review'] },
  { key: 'info', label: 'Information requested', statuses: ['info_requested'] },
  { key: 'quoted', label: 'Price sent', statuses: ['quoted'] },
  { key: 'issued', label: 'Issued', statuses: ['paid', 'issued'] },
  { key: 'declined', label: 'Declined', statuses: ['declined'] },
  { key: 'drafts', label: 'Drafts', statuses: ['draft'] },
];

export const tabStatuses = (tab: string): readonly ProposalStatus[] =>
  PROPOSAL_TABS.find((t) => t.key === tab)?.statuses ?? [];

export const isProposalTab = (v: unknown): v is ProposalTab => PROPOSAL_TABS.some((t) => t.key === v);

// ---- Money --------------------------------------------------------------------------------

const ghsFmt = new Intl.NumberFormat('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 1234.5 → "GH₵ 1,234.50"; null → "—". */
export function ghs(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `GH₵ ${ghsFmt.format(Number(n))}`;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- Taxes on an underwriter's quote ------------------------------------------------------

export interface TaxLine {
  label: string;
  rate: number;
}

/** VAT 15% + NHIL 2.5% + GETFund 2.5% on non-motor premiums (VAT Act 2025, Act 1151). */
export const DEFAULT_TAXES: readonly TaxLine[] = [
  { label: 'VAT (15%)', rate: 0.15 },
  { label: 'NHIL (2.5%)', rate: 0.025 },
  { label: 'GETFund levy (2.5%)', rate: 0.025 },
];

/** Tax lines from the stored rate tables (`taxes: [{label, rate}]`), else the defaults. */
export function taxesFromRates(rates: unknown): readonly TaxLine[] {
  const t = (rates as { taxes?: unknown } | null | undefined)?.taxes;
  if (!Array.isArray(t)) return DEFAULT_TAXES;
  const lines = t
    .map((x) => x as { label?: unknown; rate?: unknown })
    .filter((x) => typeof x.label === 'string' && typeof x.rate === 'number' && x.rate >= 0 && x.rate < 1)
    .map((x) => ({ label: x.label as string, rate: x.rate as number }));
  return lines.length ? lines : DEFAULT_TAXES;
}

/** Motor premiums carry no VAT/NHIL/GETFund. */
export const isTaxExempt = (productCode: string) => productByCode(productCode)?.category === 'motor';

export interface QuoteTotals {
  premium: number;
  taxes: { label: string; amount: number }[];
  total: number;
}

export function computeQuote(premium: number, productCode: string, taxes: readonly TaxLine[]): QuoteTotals {
  const p = round2(Math.max(0, premium || 0));
  const lines = isTaxExempt(productCode)
    ? []
    : taxes.map((t) => ({ label: t.label, amount: round2(p * t.rate) }));
  return { premium: p, taxes: lines, total: round2(p + lines.reduce((s, l) => s + l.amount, 0)) };
}

// ---- Lists --------------------------------------------------------------------------------

export function matchesSearch(q: string, ...values: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  return values.some((v) => {
    if (!v) return false;
    const hay = v.toLowerCase();
    if (hay.includes(needle)) return true;
    // Phone numbers: "024 123 4567" finds "+233241234567".
    if (digits.length >= 4) {
      const vd = hay.replace(/\D/g, '');
      const local = digits.startsWith('0') ? digits.slice(1) : digits;
      return vd.includes(digits) || vd.includes(local);
    }
    return false;
  });
}

export type SortDir = 'asc' | 'desc';

/** Stable sort by a key; empty values always last. */
export function sortBy<T>(
  list: readonly T[],
  get: (row: T) => string | number | null | undefined,
  dir: SortDir,
): T[] {
  return list
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const ae = a.v === null || a.v === undefined || a.v === '';
      const be = b.v === null || b.v === undefined || b.v === '';
      if (ae || be) return ae === be ? a.i - b.i : ae ? 1 : -1;
      const c =
        typeof a.v === 'number' && typeof b.v === 'number'
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), 'en', { numeric: true, sensitivity: 'base' });
      return (dir === 'asc' ? c : -c) || a.i - b.i;
    })
    .map((x) => x.row);
}

/** "+233241234567" → "024 123 4567". */
export function localPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

// ---- Dates (Africa/Accra is UTC+0) --------------------------------------------------------

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dtFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});
export function formatDay(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? v : dayFmt.format(d);
}
export function formatWhen(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : dtFmt.format(d);
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** First day of the month / Monday of the week containing `now` (UTC = Accra). */
export function periodStart(kind: 'week' | 'month', now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (kind === 'month') d.setUTCDate(1);
  else d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return isoDay(d);
}

/** Totals for a list of payments: collected (succeeded), pending, failed. */
export function paymentTotals(list: readonly { amount: number; status: string }[]) {
  const sum = (s: string) =>
    round2(list.filter((p) => p.status === s).reduce((a, p) => a + Number(p.amount || 0), 0));
  return {
    collected: sum('succeeded'),
    pending: sum('pending'),
    failed: sum('failed'),
    count: list.filter((p) => p.status === 'succeeded').length,
  };
}
