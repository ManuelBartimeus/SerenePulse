/**
 * Global analytics filters (SPEC M08 "Common filter set", REQ §7, §17.1.6): pure state, URL
 * serialisation and the RPC filter object (CONTRACTS "Filter object"). No React here, so it is unit
 * tested on its own.
 *
 * Revision 2026-11-05 (user direction): a short, plain filter set. Source, QR point, survey version,
 * branch-status pseudo-values, recommendation group and "include unverified" were removed; their old
 * URL params are ignored (and dropped on the next filter change).
 */
import { RATING_BANDS } from '../../lib/terms';

export const PRESETS = [
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'prev_month', label: 'Last month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'prev_quarter', label: 'Last quarter' },
  { key: 'ytd', label: 'This year' },
  { key: 'custom', label: 'Custom…' },
] as const;
export type Preset = (typeof PRESETS)[number]['key'];

/** Time steps for trend charts (chosen on the chart, not in the filter bar). */
export const GRANULARITIES = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
] as const;
export type Granularity = (typeof GRANULARITIES)[number]['key'];

export const SATISFACTION = [
  { key: 'positive', label: RATING_BANDS.positive },
  { key: 'neutral', label: RATING_BANDS.neutral },
  { key: 'negative', label: RATING_BANDS.negative },
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
  channel: 'channel_ids',
  product: 'product_ids',
  region: 'region_ids',
  sat: 'satisfaction',
  factor: 'factor_ids',
  case: 'case_statuses',
} as const;
export type ListKey = keyof typeof LIST_KEYS;

/** Filters shown in the main row; the rest sit under "More filters". */
export const MAIN_KEYS: ListKey[] = ['branch', 'channel', 'product'];
export const MORE_KEYS: ListKey[] = ['region', 'sat', 'factor', 'case'];

/** URL params from earlier versions of the filter bar: ignored when read, removed on the next write. */
const LEGACY_KEYS = ['bstatus', 'nps', 'src', 'qr', 'ver', 'unv'];

export interface FilterState {
  preset: Preset;
  /** YYYY-MM-DD, only for the custom preset. */
  from?: string | undefined;
  to?: string | undefined;
  granularity: Granularity;
  lists: Partial<Record<ListKey, string[]>>;
}

export const DEFAULT_FILTERS: FilterState = {
  preset: 'last30',
  granularity: 'day',
  lists: {},
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
  return out;
}

/** The search keys this module owns (other search params on a page are left alone). */
export const FILTER_SEARCH_KEYS = ['period', 'from', 'to', 'gran', ...Object.keys(LIST_KEYS), ...LEGACY_KEYS];

/** Today's date in Ghana (UTC+0 all year) as YYYY-MM-DD. */
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
  return out;
}

/** Number of active filters other than the period (optionally only among `keys`). */
export function activeFilterCount(state: FilterState, keys?: ListKey[]): number {
  return (Object.entries(state.lists) as [ListKey, string[] | undefined][]).filter(
    ([k, v]) => v && v.length > 0 && (!keys || keys.includes(k)),
  ).length;
}

/** DD/MM/YYYY (en-GH) for a YYYY-MM-DD date. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "6 Oct" for a YYYY-MM-DD date (chart axes). */
export function formatShortDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1] ?? ''}`;
}

/** "1 Oct – 31 Oct 2026", "15 Dec 2025 – 14 Jan 2026" or "1 Oct 2026". */
export function periodLabel(period: { from: string; to: string }): string {
  const year = (iso: string) => iso.slice(0, 4);
  if (period.from === period.to) return `${formatShortDay(period.from)} ${year(period.from)}`;
  const start =
    year(period.from) === year(period.to)
      ? formatShortDay(period.from)
      : `${formatShortDay(period.from)} ${year(period.from)}`;
  return `${start} – ${formatShortDay(period.to)} ${year(period.to)}`;
}
