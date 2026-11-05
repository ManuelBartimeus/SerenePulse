import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSession } from '../../lib/session';
import type { RpcFilters } from './filters-state';

/** Shapes returned by the analytics RPCs (supabase/migrations/202611080002_analytics_engine.sql). */
export interface Period {
  from: string;
  to: string;
  tz: string;
  days: number;
}
export interface Target {
  value: number;
  direction: 'higher_is_better' | 'lower_is_better';
  status: 'met' | 'not_met' | null;
}
export interface Metric {
  value: number | null;
  n: number;
  low_sample: boolean;
  benchmark: number | null;
  delta: number | null;
  target: Target | null;
}
export type KpiKey = 'csat_pct' | 'csat_avg' | 'nps' | 'ces_avg' | 'negative_rate' | 'completion_rate';
export interface MainFactor {
  codes: string[];
  labels: string[];
  share: number | null;
  count: number;
  n: number;
}
export interface Summary {
  period: Period;
  n: number;
  minimum_sample: number;
  metrics: Record<KpiKey, Metric> & { completion_rate: Metric & { submitted: number } };
  main_factor: MainFactor;
  previous: {
    period: Period;
    n: number;
    mixed_scales: boolean;
    metrics: Record<KpiKey, { value: number | null; n: number; low_sample: boolean }>;
    main_factor: MainFactor;
  };
}
export type Dimension = 'branch' | 'region' | 'channel' | 'product' | 'factor';
export interface BreakdownRow {
  key: string;
  code: string | null;
  label: string;
  info: { region_label?: string; is_active?: boolean; is_none?: boolean; region_id?: string };
  n: number;
  csat_pct: number | null;
  csat_avg: number | null;
  nps: number | null;
  ces_avg: number | null;
  negative_rate: number | null;
  low_sample: boolean;
  main_factor_label: string | null;
  main_factor: MainFactor;
  factor_counts: Record<string, number>;
  unverified: number;
  rank: number | null;
  target: Target | null;
}
export type TrendMetric = KpiKey | 'responses';
export interface Trend {
  metric: TrendMetric;
  granularity: string;
  period: Period;
  minimum_sample: number;
  points: {
    bucket: string;
    from: string;
    to: string;
    value: number | null;
    n: number;
    low_sample: boolean;
    mixed_scales: boolean;
    benchmark: number | null;
  }[];
  annotations: { date: string; version_id: string; version_no: number; scale_changed: boolean }[];
}
export interface RankingRow {
  key: string;
  code: string;
  label: string;
  region_label: string;
  n: number;
  csat_pct: number | null;
  csat_avg: number | null;
  nps: number | null;
  ces_avg: number | null;
  negative_rate: number | null;
  low_sample: boolean;
  rank: number | null;
  is_own: boolean;
}
export interface Ranking {
  period: Period;
  metric: string;
  minimum_sample: number;
  rows: RankingRow[];
}
export interface CompareRow extends Partial<BreakdownRow> {
  key: string;
  label: string;
  region_label: string;
  n: number;
  is_own: boolean;
  delta_vs_company: Record<
    'csat_pct' | 'csat_avg' | 'nps' | 'ces_avg' | 'negative_rate',
    number | null
  > | null;
}
export interface Compare {
  period: Period;
  minimum_sample: number;
  rows: CompareRow[];
  company: Record<'n' | 'csat_pct' | 'csat_avg' | 'nps' | 'ces_avg' | 'negative_rate', number | null> | null;
}
export interface Distribution {
  metric: string;
  period: Period;
  n: number;
  minimum_sample: number;
  low_sample: boolean;
  buckets: { key: string; label: string; count: number; share: number | null; is_none?: boolean }[];
}
export interface FunnelCounts {
  visits: number;
  started: number;
  reached: number[];
  submitted: number;
  abandoned_by_page: number[];
  cooldown_blocked: number;
  turnstile_failed: number;
  completion_rate: number | null;
  low_sample: boolean;
  unverified: number;
}
export interface Funnel {
  period: Period;
  minimum_sample: number;
  totals: FunnelCounts;
}
export interface CompletionTime {
  period: Period;
  minimum_sample: number;
  n: number;
  n_all: number;
  excluded_no_interactive: number;
  low_sample: boolean;
  median_s: number | null;
  p90_s: number | null;
  mean_s: number | null;
  pct_le_60: number | null;
  back_navigation_rate: number | null;
  answer_change_rate: number | null;
  targets: { pct_le_60: number; median_s: number };
  histogram: { from_s: number; to_s: number | null; count: number }[];
}
export interface RecordRow {
  id: string;
  reference: string;
  submitted_at: string;
  channel: { id: string; code: string; label: string };
  branch_status: string;
  branch: { id: string; code: string; name: string } | null;
  branch_label: string;
  is_corrected: boolean;
  product: { id: string; code: string; label: string };
  csat: number;
  ces: number;
  nps: number;
  nps_class: 'promoter' | 'passive' | 'detractor';
  factor: { id: string; code: string; label: string } | null;
  has_comment: boolean;
  contact_consent: boolean;
  case: { id: string; reference: string; status: string } | null;
}
export interface RecordPage {
  rows: RecordRow[];
  limit: number;
  period: Period;
  comment_search: boolean;
  case_status_available: boolean;
  next_cursor: string | null;
}
export interface RecordDetail {
  id: string;
  reference: string;
  submitted_at: string;
  opened_at: string;
  interactive_at: string | null;
  completion_duration_ms: number | null;
  duration_from_opened: boolean;
  navigated_back: boolean;
  changed_previous_answer: boolean;
  attribution: {
    branch_status: string;
    branch: { id: string; code: string; name: string } | null;
    region: { id: string; name: string } | null;
    label: string;
    is_corrected: boolean;
    original: { branch_status: string; label: string; region: { id: string; name: string } | null };
  };
  answers: {
    question_id: string;
    page: number;
    label: string;
    type: string;
    value: unknown;
    display: string | null;
  }[];
  comment_visible: boolean;
  comment: string | null;
  has_comment: boolean;
  text_redacted_at: string | null;
  has_contact_consent: boolean;
  contact: { masked: string | null; erased: boolean } | null;
}

/** An RPC that does not exist yet (another milestone): PostgREST 404 / PGRST202. */
export function isMissingRpc(error: unknown): boolean {
  const e = error as { code?: string; status?: number } | null;
  return e?.code === 'PGRST202' || e?.code === '42883' || e?.status === 404;
}

export function useRpc<T>(name: string, args: Record<string, unknown>, options: { enabled?: boolean } = {}) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['analytics', name, args],
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    retry: (count, error) => !isMissingRpc(error) && count < 1,
    queryFn: async () => {
      const { data, error, status } = await supabase.rpc(name, args);
      if (error) throw Object.assign(error, { status });
      return data as T;
    },
  });
}

export const useSummary = (f: RpcFilters) => useRpc<Summary>('analytics_summary', { p_filters: f });
export const useBreakdown = (dimension: Dimension, f: RpcFilters, enabled = true) =>
  useRpc<BreakdownRow[]>('analytics_breakdown', { p_dimension: dimension, p_filters: f }, { enabled });
export const useTrend = (metric: TrendMetric, granularity: string, f: RpcFilters) =>
  useRpc<Trend>('analytics_trend', { p_metric: metric, p_granularity: granularity, p_filters: f });
export const useRanking = (f: RpcFilters, metric = 'csat_pct', enabled = true) =>
  useRpc<Ranking>('analytics_branch_ranking', { p_filters: f, p_metric: metric }, { enabled });
export const useCompare = (ids: string[], f: RpcFilters) =>
  useRpc<Compare>('analytics_compare', { p_branch_ids: ids, p_filters: f }, { enabled: ids.length > 0 });
export const useDistribution = (metric: string, f: RpcFilters) =>
  useRpc<Distribution>('analytics_distribution', { p_metric: metric, p_filters: f });
export const useFunnel = (f: RpcFilters) => useRpc<Funnel>('analytics_funnel', { p_filters: f });
export const useCompletionTime = (f: RpcFilters) =>
  useRpc<CompletionTime>('analytics_completion_time', { p_filters: f });
