import type { KpiKey, TrendMetric } from './api';

/** Display rules per metric (SPEC M08 "Display"). The figure itself always comes from the server. */
export const METRIC_INFO: Record<TrendMetric, { label: string; short: string; higherIsBetter: boolean }> = {
  csat_pct: { label: 'CSAT %', short: 'CSAT', higherIsBetter: true },
  csat_avg: { label: 'Average CSAT', short: 'Avg CSAT', higherIsBetter: true },
  nps: { label: 'NPS', short: 'NPS', higherIsBetter: true },
  ces_avg: { label: 'Average CES (higher = easier)', short: 'CES', higherIsBetter: true },
  negative_rate: { label: 'Negative feedback rate', short: 'Negative', higherIsBetter: false },
  completion_rate: {
    label: 'Completion rate (submitted ÷ started)',
    short: 'Completion',
    higherIsBetter: true,
  },
  responses: { label: 'Responses', short: 'Responses', higherIsBetter: true },
};

const nf = (digits: number) =>
  new Intl.NumberFormat('en-GH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const int = new Intl.NumberFormat('en-GH');

/** Formats a metric value; null is "No data" (Rule 7). */
export function formatMetric(metric: TrendMetric, value: number | null | undefined): string {
  if (value === null || value === undefined) return 'No data';
  switch (metric) {
    case 'csat_pct':
    case 'negative_rate':
    case 'completion_rate':
      return `${nf(1).format(value)}%`;
    case 'csat_avg':
    case 'ces_avg':
      return `${nf(2).format(value)} / 5`;
    case 'nps':
      return `${value > 0 ? '+' : value < 0 ? '−' : ''}${int.format(Math.abs(Math.round(value)))}`;
    case 'responses':
      return int.format(value);
  }
}

/** Signed difference in the metric's unit ("pts" for percentages and NPS). */
export function formatDelta(metric: KpiKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return 'No comparison';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  const abs = Math.abs(value);
  if (metric === 'csat_avg' || metric === 'ces_avg') return `${sign}${nf(2).format(abs)}`;
  if (metric === 'nps') return `${sign}${int.format(Math.round(abs))} pts`;
  return `${sign}${nf(1).format(abs)} pts`;
}

/** Whether a change is an improvement (for colour + words, never colour alone). */
export function deltaTone(
  metric: KpiKey,
  value: number | null | undefined,
): 'success' | 'danger' | 'neutral' {
  if (!value) return 'neutral';
  const better = METRIC_INFO[metric].higherIsBetter ? value > 0 : value < 0;
  return better ? 'success' : 'danger';
}

export const formatCount = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : int.format(n);
export const formatPct = (v: number | null | undefined) =>
  v === null || v === undefined ? 'No data' : `${nf(1).format(v)}%`;
export const formatSeconds = (v: number | null | undefined) =>
  v === null || v === undefined ? 'No data' : `${nf(1).format(v)} s`;

const dateTime = new Intl.DateTimeFormat('en-GH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Accra',
});
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
