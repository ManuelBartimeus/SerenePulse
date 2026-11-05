/**
 * Global analytics filters (SPEC M08 "Common filter set", REQ §7, §17.1.6): pure state, URL
 * serialisation and the RPC filter object (CONTRACTS "Filter object"). No React here, so it is unit
 * tested on its own.
 */

export const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'month', label: 'Current month' },
  { key: 'prev_month', label: 'Previous month' },
  { key: 'quarter', label: 'Current quarter' },
  { key: 'prev_quarter', label: 'Previous quarter' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'custom', label: 'Custom' },
] as const;
export type Preset = (typeof PRESETS)[number]['key'];

export const GRANULARITIES = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week (Mon–Sun)' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
] as const;
export type Granularity = (typeof GRANULARITIES)[number]['key'];

export const BRANCH_STATUSES = [
  { key: 'other', label: 'Other branch' },
  { key: 'not_applicable', label: 'Not applicable' },
  { key: 'not_provided', label: 'Not provided' },
] as const;
export const SATISFACTION = [
  { key: 'negative', label: 'Negative (1–2)' },
  { key: 'neutral', label: 'Neutral (3)' },
  { key: 'positive', label: 'Positive (4–5)' },
] as const;
export const NPS_CLASSES = [
  { key: 'promoter', label: 'Promoters (9–10)' },
  { key: 'passive', label: 'Passives (7–8)' },
  { key: 'detractor', label: 'Detractors (0–6)' },
] as const;
export const SOURCES = [
  { key: 'sms', label: 'SMS link' },
  { key: 'direct', label: 'Direct visit' },
  { key: 'qr', label: 'QR poster' },
] as const;
export const CASE_STATUSES = [
  { key: 'none', label: 'No case' },
  { key: 'new', label: 'New' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
] as const;

/** Multi-select filters: URL key → filter-object key. */
export const LIST_KEYS = {
  branch: 'branch_ids',
  bstatus: 'branch_statuses',
  region: 'region_ids',
  channel: 'channel_ids',
  product: 'product_ids',
  factor: 'factor_ids',
  sat: 'satisfaction',
  nps: 'nps_classes',
  src: 'source_codes',
  qr: 'qr_point_ids',
  ver: 'survey_version_ids',
  case: 'case_statuses',
} as const;
export type ListKey = keyof typeof LIST_KEYS;

export interface FilterState {
  preset: Preset;
  /** YYYY-MM-DD, only for the custom preset. */
  from?: string | undefined;
  to?: string | undefined;
  granularity: Granularity;
  lists: Partial<Record<ListKey, string[]>>;
  includeUnverified: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  preset: 'last30',
  granularity: 'day',
  lists: {},
  includeUnverified: false,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isPreset = (v: unknown): v is Preset => PRESETS.some((p) => p.key === v);
const isGranularity = (v: unknown): v is Granularity => GRANULARITIES.some((g) => g.key === v);
const validDate = (v: unknown): string | undefined =>
  typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : undefined;

function listFrom(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : [];
  return [...new Set(raw.map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s)))];
}

/** URL search → state. Anything unknown or malformed falls back to the defaults. */
export function parseFilterSearch(search: Record<string, unknown>): FilterState {
  const preset = isPreset(search.period) ? search.period : DEFAULT_FILTERS.preset;
  const lists: FilterState['lists'] = {};
  for (const key of Object.keys(LIST_KEYS) as ListKey[]) {
    const values = listFrom(search[key]);
    if (values.length > 0) lists[key] = values;
  }
  const state: FilterState = {
    preset,
    granularity: isGranularity(search.gran) ? search.gran : DEFAULT_FILTERS.granularity,
    lists,
    includeUnverified: search.unv === '1' || search.unv === 1 || search.unv === true,
  };
  if (preset === 'custom') {
    const from = validDate(search.from);
    const to = validDate(search.to);
    if (from && to && from <= to) {
      state.from = from;
      state.to = to;
    } else {
      state.preset = DEFAULT_FILTERS.preset;
    }
  }
  return state;
}

/** State → URL search (only non-default values, comma-joined lists). */
export function toFilterSearch(state: FilterState): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.preset !== DEFAULT_FILTERS.preset) out.period = state.preset;
  if (state.preset === 'custom' && state.from && state.to) {
    out.from = state.from;
    out.to = state.to;
  }
  if (state.granularity !== DEFAULT_FILTERS.granularity) out.gran = state.granularity;
  for (const key of Object.keys(LIST_KEYS) as ListKey[]) {
    const values = state.lists[key];
    if (values && values.length > 0) out[key] = values.join(',');
  }
  if (state.includeUnverified) out.unv = '1';
  return out;
}

/** The search keys this module owns (other search params on a page are left alone). */
export const FILTER_SEARCH_KEYS = ['period', 'from', 'to', 'gran', 'unv', ...Object.keys(LIST_KEYS)];

/** Today's date in Africa/Accra (UTC+0 all year) as YYYY-MM-DD. */
export function accraToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(now);
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** The period a state covers, inclusive, by submission date in Africa/Accra (D-33). */
export function resolvePeriod(
  state: FilterState,
  today: string = accraToday(),
): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const mi = m - 1;
  const q = Math.floor(mi / 3) * 3;
  switch (state.preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: shift(today, -6), to: today };
    case 'month':
      return { from: ymd(y, mi, 1), to: today };
    case 'prev_month':
      return { from: ymd(y, mi - 1, 1), to: ymd(y, mi, 0) };
    case 'quarter':
      return { from: ymd(y, q, 1), to: today };
    case 'prev_quarter':
      return { from: ymd(y, q - 3, 1), to: ymd(y, q, 0) };
    case 'ytd':
      return { from: ymd(y, 0, 1), to: today };
    case 'custom':
      if (state.from && state.to) return { from: state.from, to: state.to };
      return { from: shift(today, -29), to: today };
    default:
      return { from: shift(today, -29), to: today };
  }
}

export type RpcFilters = Record<string, string | boolean | string[]>;

/** State → the jsonb filter object every analytics RPC takes. */
export function toRpcFilters(state: FilterState, today: string = accraToday()): RpcFilters {
  const out: RpcFilters = { ...resolvePeriod(state, today) };
  for (const key of Object.keys(LIST_KEYS) as ListKey[]) {
    const values = state.lists[key];
    if (values && values.length > 0) out[LIST_KEYS[key]] = values;
  }
  if (state.includeUnverified) out.include_unverified = true;
  return out;
}

/** Number of active filters other than the period (for the phone "Filters (n)" button). */
export function activeFilterCount(state: FilterState): number {
  return (
    Object.values(state.lists).filter((v) => v && v.length > 0).length + (state.includeUnverified ? 1 : 0)
  );
}

/** DD/MM/YYYY (en-GH) for a YYYY-MM-DD date. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function periodLabel(period: { from: string; to: string }): string {
  return period.from === period.to
    ? formatDay(period.from)
    : `${formatDay(period.from)} – ${formatDay(period.to)}`;
}
