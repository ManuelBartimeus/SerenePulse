import { MEASURES, WORDS } from '../../lib/terms';
import type { KpiKey, TrendMetric } from './api';

/** Display rules per measure. Labels come from the plain-language glossary (lib/terms). */
export const METRIC_INFO: Record<TrendMetric, { label: string; explain: string; higherIsBetter: boolean }> = {
  csat_pct: { ...MEASURES.csat_pct, higherIsBetter: true },
  csat_avg: { ...MEASURES.csat_avg, higherIsBetter: true },
  nps: { ...MEASURES.nps, higherIsBetter: true },
  ces_avg: { ...MEASURES.ces_avg, higherIsBetter: true },
  negative_rate: { ...MEASURES.negative_rate, higherIsBetter: false },
  completion_rate: { ...MEASURES.completion_rate, higherIsBetter: true },
  responses: { ...MEASURES.responses, higherIsBetter: true },
};

/** Measures that can be chosen in trend and ranking pickers, in display order. */
export const MEASURE_OPTIONS: TrendMetric[] = [
  'csat_pct',
  'nps',
  'ces_avg',
  'csat_avg',
  'negative_rate',
  'responses',
  'completion_rate',
];

const nf = (digits: number) =>
  new Intl.NumberFormat('en-GH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const int = new Intl.NumberFormat('en-GH');

/** Formats a measure: `82%`, `4.2 out of 5`, `+34`. Missing values read "No responses yet", never 0. */
export function formatMetric(metric: TrendMetric, value: number | null | undefined): string {
  if (value === null || value === undefined) return WORDS.noData;
  switch (metric) {
    case 'csat_pct':
    case 'negative_rate':
    case 'completion_rate':
      return `${int.format(Math.round(value))}%`;
    case 'csat_avg':
    case 'ces_avg':
      return `${nf(1).format(value)} out of 5`;
    case 'nps': {
      const r = Math.round(value);
      return `${r > 0 ? '+' : r < 0 ? '−' : ''}${int.format(Math.abs(r))}`;
    }
    case 'responses':
      return int.format(value);
  }
}

/** Compact form for tables and chart axes (`4.2` instead of `4.2 out of 5`; `—` when missing). */
export function formatMetricShort(metric: TrendMetric, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (metric === 'csat_avg' || metric === 'ces_avg') return nf(1).format(value);
  return formatMetric(metric, value);
}

/**
 * A change vs the previous period in plain words: "▲ 3 points", "▼ 0.2", "No change". Percentages and
 * the recommendation score move in points; averages in rating steps.
 */
export function formatChange(metric: KpiKey | 'responses', value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const isAvg = metric === 'csat_avg' || metric === 'ces_avg';
  const abs = isAvg ? Math.round(Math.abs(value) * 10) / 10 : Math.round(Math.abs(value));
  if (abs === 0) return 'No change';
  const arrow = value > 0 ? '▲' : '▼';
  if (isAvg) return `${arrow} ${nf(1).format(abs)}`;
  if (metric === 'responses') return `${arrow} ${int.format(abs)}`;
  return `${arrow} ${int.format(abs)} point${abs === 1 ? '' : 's'}`;
}

/** Whether a change is an improvement (for colour + words, never colour alone). */
export function deltaTone(
  metric: TrendMetric,
  value: number | null | undefined,
): 'success' | 'danger' | 'neutral' {
  if (!value || metric === 'responses') return 'neutral';
  const better = METRIC_INFO[metric].higherIsBetter ? value > 0 : value < 0;
  return better ? 'success' : 'danger';
}

export const formatCount = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : int.format(n);
export const formatPct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${int.format(Math.round(v))}%`;

/** "38 sec", "1 min 12 sec". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m} min` : `${m} min ${rest} sec`;
}

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Accra',
});
/** "5 Nov 2026, 14:03" (local business time). */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
