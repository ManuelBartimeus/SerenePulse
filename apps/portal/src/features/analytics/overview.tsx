import { useState } from 'react';
import { MEASURES, RECOMMEND_GROUPS, WORDS } from '../../lib/terms';
import { PageHeader } from '../../pages/shell';
import { Alert } from '../../ui/controls';
import {
  isMissingRpc,
  useBreakdown,
  useRpc,
  useSummary,
  useTrend,
  type BreakdownRow,
  type KpiKey,
  type Summary,
  type TrendMetric,
} from './api';
import { NPS_COLOURS } from './chart-palette';
import { FilterBar, GranularityControl, useAnalyticsFilters } from './filters';
import { formatCount, formatPct, MEASURE_OPTIONS, METRIC_INFO } from './format';
import { TrendChart } from './trend-chart';
import {
  BRANCH_SUBTITLE,
  Card,
  ChangeLine,
  FilterLink,
  KpiCard,
  MetricsTable,
  MetricValue,
  QueryView,
  reliableFirst,
  selectClass,
  Skeleton,
  StatTile,
  td,
  tdNum,
  th,
  thNum,
} from './ui';

const LEAD: KpiKey[] = ['csat_pct', 'nps', 'ces_avg', 'csat_avg'];

function ResponsesCard({ s }: { s: Summary }) {
  return (
    <StatTile
      label={MEASURES.responses.label}
      explain={MEASURES.responses.explain}
      value={s.n === 0 ? WORDS.noData : formatCount(s.n)}
      large={s.n > 0}
      muted={s.n === 0}
      footer={s.n > 0 && s.previous.n > 0 && <ChangeLine metric="responses" delta={s.n - s.previous.n} />}
    />
  );
}

function MainFactorCard({ s }: { s: Summary }) {
  const mf = s.main_factor;
  const none = mf.labels.length === 0;
  return (
    <StatTile
      label={MEASURES.main_factor.label}
      explain={MEASURES.main_factor.explain}
      large={false}
      muted={none}
      value={none ? WORDS.noData : mf.labels.join(' / ')}
      footer={
        !none && (
          <p className="text-secondary">
            {mf.labels.length > 1
              ? 'Mentioned equally often'
              : `Raised in ${formatPct(mf.share)} of suggestions`}
          </p>
        )
      }
    />
  );
}

const GROUP_ORDER = ['promoter', 'passive', 'detractor'] as const;

/** Would customers recommend us? Likely · Neutral · Unlikely, with labels (never colour alone). */
export function NpsComposition({ filters }: { filters: Record<string, unknown> }) {
  const dist = useRpc<{
    n: number;
    buckets: { key: string; label: string; count: number; share: number | null }[];
  }>('analytics_distribution', { p_metric: 'nps_class', p_filters: filters });
  return (
    <QueryView query={dist} skeleton="h-24">
      {(d) => {
        if (d.n === 0) return <p className="py-6 text-secondary">{WORDS.noData}</p>;
        const buckets = GROUP_ORDER.map((k) => d.buckets.find((b) => b.key === k)).filter(
          (b): b is NonNullable<typeof b> => !!b,
        );
        return (
          <div>
            <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full" aria-hidden>
              {buckets.map((b) => (
                <div
                  key={b.key}
                  style={{
                    width: `${b.share ?? 0}%`,
                    background: NPS_COLOURS[b.key as keyof typeof NPS_COLOURS],
                  }}
                />
              ))}
            </div>
            <ul className="mt-5 grid gap-3 text-[14px]">
              {buckets.map((b) => (
                <li key={b.key} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: NPS_COLOURS[b.key as keyof typeof NPS_COLOURS] }}
                    />
                    {RECOMMEND_GROUPS[b.key as keyof typeof RECOMMEND_GROUPS] ?? b.label}
                  </span>
                  <span className="font-semibold tabular-nums">{formatPct(b.share)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </QueryView>
  );
}

function MiniComparison({ rows, title }: { rows: BreakdownRow[]; title: string }) {
  const visible = reliableFirst(rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n));
  if (visible.length === 0) return <p className="py-6 text-secondary">{WORDS.noData}</p>;
  return (
    <table className="w-full">
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className={`${th} pl-0`}>
            Name
          </th>
          <th scope="col" className={thNum} title={MEASURES.csat_pct.explain}>
            Satisfied
          </th>
          <th scope="col" className={`${thNum} pr-0`} title={MEASURES.nps.explain}>
            Recommend
          </th>
        </tr>
      </thead>
      <tbody>
        {visible.map((r) => (
          <tr key={r.key} className="border-b border-border-subtle last:border-0">
            <th scope="row" className={`${td} pl-0 text-left font-normal`}>
              {r.label}
            </th>
            <td className={tdNum}>
              <MetricValue metric="csat_pct" value={r.csat_pct} few={r.low_sample} />
            </td>
            <td className={`${tdNum} pr-0`}>
              <MetricValue metric="nps" value={r.nps} few={r.low_sample} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Needs attention" (public.needs_attention). Hidden only while that RPC does not exist yet. */
function NeedsAttention() {
  const q = useRpc<{ open_flags: number; overdue_cases: number }>('needs_attention', {});
  if (q.isError && isMissingRpc(q.error)) return null;
  const items = q.data
    ? [
        { label: WORDS.flags, value: q.data.open_flags },
        { label: `Cases ${WORDS.slaBreached.toLowerCase()}`, value: q.data.overdue_cases },
      ]
    : [];
  return (
    <section aria-label="Needs attention" className="rounded-lg bg-accent-50 p-5 md:p-6">
      <h2 className="mb-4 text-[18px] font-semibold leading-6 tracking-[-0.01em]">Needs attention</h2>
      {q.isPending && <Skeleton className="h-16 bg-white/60" />}
      {q.isError && <Alert tone="danger">This summary couldn’t load. Try again shortly.</Alert>}
      {q.data && (
        <ul className="grid gap-3">
          {items.map((i) => (
            <li key={i.label} className="flex items-center justify-between gap-2 text-[15px]">
              <span>{i.label}</span>
              <span className="text-[22px] font-semibold tabular-nums">{formatCount(i.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Feedback insights › Summary: the former executive overview (REQ §6.1). */
export function HomePage() {
  const { rpcFilters, filters } = useAnalyticsFilters();
  const summary = useSummary(rpcFilters);
  const branches = useBreakdown('branch', rpcFilters);
  const channels = useBreakdown('channel', rpcFilters);
  const products = useBreakdown('product', rpcFilters);
  const [metric, setMetric] = useState<TrendMetric>('csat_pct');
  const trend = useTrend(metric, filters.granularity, rpcFilters);

  return (
    <>
      <PageHeader title="Summary" subtitle="The headline measures for the period and filters you choose." />
      <FilterBar />
      <QueryView query={summary} skeleton="h-44">
        {(s) => (
          <>
            {s.n === 0 && (
              <div className="mb-6">
                <Alert tone="info" title={WORDS.noData}>
                  No customer responses match this period and these filters. Try a longer period or clear the
                  filters.
                </Alert>
              </div>
            )}
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
              {LEAD.map((k) => (
                <KpiCard key={k} metric={k} m={s.metrics[k]} />
              ))}
              <ResponsesCard s={s} />
              <KpiCard metric="negative_rate" m={s.metrics.negative_rate} />
              <KpiCard metric="completion_rate" m={s.metrics.completion_rate} />
              <MainFactorCard s={s} />
            </div>
          </>
        )}
      </QueryView>

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <Card
          title="Over time"
          className="lg:col-span-2"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="overview-trend-measure">
                Measure
              </label>
              <select
                id="overview-trend-measure"
                className={selectClass}
                value={metric}
                onChange={(e) => setMetric(e.target.value as TrendMetric)}
              >
                {MEASURE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_INFO[m].label}
                  </option>
                ))}
              </select>
              <GranularityControl />
            </div>
          }
        >
          <QueryView query={trend} skeleton="h-64">
            {(t) => <TrendChart trend={t} />}
          </QueryView>
        </Card>
        <Card title="Would customers recommend us?" subtitle={MEASURES.nps.explain}>
          <NpsComposition filters={rpcFilters} />
        </Card>
      </div>

      <Card
        title="Branch performance"
        subtitle={BRANCH_SUBTITLE}
        className="mb-8"
        actions={<FilterLink to="/insights/branches">All branches</FilterLink>}
      >
        <QueryView query={branches}>
          {(b) => (
            <MetricsTable
              rows={b}
              caption="Branch performance"
              nameHeader="Branch"
              showFactor={false}
              linkTo={(r) => <FilterLink to={`/insights/branches/${r.key}`}>{r.label}</FilterLink>}
            />
          )}
        </QueryView>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="By channel">
          <QueryView query={channels}>{(c) => <MiniComparison rows={c} title="By channel" />}</QueryView>
        </Card>
        <Card title="By product">
          <QueryView query={products}>{(p) => <MiniComparison rows={p} title="By product" />}</QueryView>
        </Card>
        <NeedsAttention />
      </div>
    </>
  );
}
