import { useMemo, useState } from 'react';
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
import { FilterBar, useAnalyticsFilters } from './filters';
import { formatCount, formatMetric, formatPct } from './format';
import { TrendChart } from './trend-chart';
import {
  BRANCH_SUBTITLE,
  Card,
  FilterLink,
  KpiCard,
  MetricsTable,
  QueryView,
  Skeleton,
  UnverifiedNote,
} from './ui';

const KPIS: { key: KpiKey; label: string }[] = [
  { key: 'csat_pct', label: 'CSAT %' },
  { key: 'csat_avg', label: 'Average CSAT' },
  { key: 'nps', label: 'NPS' },
  { key: 'ces_avg', label: 'Average CES' },
];

/** Total responses with delta vs previous period. */
function ResponsesCard({ s }: { s: Summary }) {
  const diff = s.n - s.previous.n;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-white p-4">
      <p className="text-[14px] font-medium text-secondary">Total responses</p>
      <p className="text-[32px] font-medium leading-10">{formatCount(s.n)}</p>
      <p className="text-[12px] text-muted">valid responses in the period</p>
      <p className="text-[12px] text-secondary">
        {diff > 0 ? '+' : diff < 0 ? '−' : '±'}
        {formatCount(Math.abs(diff))} vs previous period ({formatCount(s.previous.n)})
      </p>
      <UnverifiedNote count={s.unverified_excluded} included={s.include_unverified} />
    </div>
  );
}

function MainFactorCard({ s }: { s: Summary }) {
  const mf = s.main_factor;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-white p-4">
      <p className="text-[14px] font-medium text-secondary">Main improvement factor</p>
      <p className={`text-[20px] font-medium leading-7 ${mf.labels.length === 0 ? 'text-muted' : ''}`}>
        {mf.labels.length === 0 ? 'No data' : mf.labels.join(' / ')}
      </p>
      <p className="text-[12px] text-muted">
        {mf.labels.length > 0 && `${formatPct(mf.share)} of `}n = {formatCount(mf.n)} customers who named a
        factor
      </p>
      {mf.labels.length > 1 && (
        <p className="text-[12px] text-secondary">Tied ({formatCount(mf.count)} each)</p>
      )}
    </div>
  );
}

/** NPS composition: detractors · passives · promoters (fixed colours, E2) with labels, never colour alone. */
export function NpsComposition({ filters }: { filters: Record<string, unknown> }) {
  const dist = useRpc<{
    n: number;
    buckets: { key: string; label: string; count: number; share: number | null }[];
  }>('analytics_distribution', { p_metric: 'nps_class', p_filters: filters });
  return (
    <QueryView query={dist} skeleton="h-24">
      {(d) =>
        d.n === 0 ? (
          <p className="text-secondary">No data</p>
        ) : (
          <div>
            <div className="flex h-8 w-full gap-[2px] overflow-hidden rounded-xs" aria-hidden>
              {d.buckets.map((b) => (
                <div
                  key={b.key}
                  style={{
                    width: `${b.share ?? 0}%`,
                    background: NPS_COLOURS[b.key as keyof typeof NPS_COLOURS],
                  }}
                />
              ))}
            </div>
            <ul className="mt-3 grid gap-1 text-[14px]">
              {d.buckets.map((b) => (
                <li key={b.key} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block size-3 rounded-full"
                    style={{ background: NPS_COLOURS[b.key as keyof typeof NPS_COLOURS] }}
                  />
                  {b.label}: <span className="font-medium">{formatPct(b.share)}</span>
                  <span className="text-muted">({formatCount(b.count)})</span>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </QueryView>
  );
}

function MiniComparison({ rows, title }: { rows: BreakdownRow[]; title: string }) {
  const visible = rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  if (visible.length === 0) return <p className="text-secondary">No data</p>;
  return (
    <table className="w-full text-[14px]">
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
          <th scope="col" className="py-1 font-medium">
            Name
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            n
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            CSAT %
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            NPS
          </th>
        </tr>
      </thead>
      <tbody>
        {visible.map((r) => (
          <tr key={r.key} className={`border-t border-border ${r.low_sample ? 'text-secondary' : ''}`}>
            <th scope="row" className="py-2 text-left font-normal">
              {r.label}
              {r.low_sample && <span className="text-[12px] text-warning"> · low sample</span>}
            </th>
            <td className="py-2 text-right tabular-nums">{formatCount(r.n)}</td>
            <td className="py-2 text-right tabular-nums">{formatMetric('csat_pct', r.csat_pct)}</td>
            <td className="py-2 text-right tabular-nums">{formatMetric('nps', r.nps)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Needs attention" (MS-10's public.needs_attention). Hidden only while that RPC does not exist yet. */
function NeedsAttention() {
  const q = useRpc<{ open_flags: number; overdue_cases: number; fired_alerts: number }>(
    'needs_attention',
    {},
  );
  if (q.isError && isMissingRpc(q.error)) return null;
  const items = q.data
    ? [
        { label: 'Open flags', value: q.data.open_flags },
        { label: 'Overdue cases', value: q.data.overdue_cases },
        { label: 'Fired alerts', value: q.data.fired_alerts },
      ]
    : [];
  return (
    <section aria-label="Needs attention" className="rounded-lg bg-accent-50 p-4 md:p-6">
      <h2 className="mb-3 text-[18px] font-medium leading-6">Needs attention</h2>
      {q.isPending && <Skeleton className="h-16 bg-white/60" />}
      {q.isError && <Alert tone="danger">The attention summary couldn’t load. Try again shortly.</Alert>}
      {q.data && (
        <ul className="grid gap-2">
          {items.map((i) => (
            <li key={i.label} className="flex items-center justify-between gap-2 text-[16px]">
              <span>{i.label}</span>
              <span className="text-[24px] font-medium tabular-nums">{formatCount(i.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** S-A1 Executive overview (REQ §6.1). */
export function HomePage() {
  const { rpcFilters, period, filters } = useAnalyticsFilters();
  const summary = useSummary(rpcFilters);
  const branches = useBreakdown('branch', rpcFilters);
  const channels = useBreakdown('channel', rpcFilters);
  const products = useBreakdown('product', rpcFilters);
  const [metric, setMetric] = useState<TrendMetric>('csat_pct');
  const trend = useTrend(metric, filters.granularity, rpcFilters);
  const rows = useMemo(() => branches.data ?? [], [branches.data]);

  return (
    <>
      <PageHeader title="Executive overview" subtitle="Customer feedback across Serene Insurance." />
      <FilterBar granularity />
      <QueryView query={summary} skeleton="h-44">
        {(s) => (
          <>
            {s.n === 0 && (
              <div className="mb-4">
                <Alert tone="info" title="No feedback for this period">
                  No valid responses match these filters. Figures show “No data” rather than zero.
                </Alert>
              </div>
            )}
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
              {KPIS.map((k) => (
                <KpiCard key={k.key} metric={k.key} label={k.label} m={s.metrics[k.key]} />
              ))}
              <ResponsesCard s={s} />
              <KpiCard
                metric="completion_rate"
                label="Completion rate"
                m={s.metrics.completion_rate}
                hint="Submitted ÷ started surveys (all surveys opened, whatever the branch). Not a response rate."
              />
              <KpiCard metric="negative_rate" label="Negative feedback rate" m={s.metrics.negative_rate} />
              <MainFactorCard s={s} />
            </div>
          </>
        )}
      </QueryView>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card
          title="Trend"
          period={period}
          n={summary.data?.n}
          className="lg:col-span-2"
          actions={
            <label className="flex items-center gap-2 text-[14px]">
              Metric
              <select
                className="h-11 rounded-sm border border-border-strong bg-white px-3"
                value={metric}
                onChange={(e) => setMetric(e.target.value as TrendMetric)}
              >
                <option value="csat_pct">CSAT %</option>
                <option value="csat_avg">Average CSAT</option>
                <option value="nps">NPS</option>
                <option value="ces_avg">Average CES</option>
                <option value="negative_rate">Negative rate</option>
                <option value="responses">Responses</option>
                <option value="completion_rate">Completion rate</option>
              </select>
            </label>
          }
        >
          <QueryView query={trend} skeleton="h-64">
            {(t) => <TrendChart trend={t} />}
          </QueryView>
        </Card>
        <Card title="NPS composition" period={period} n={summary.data?.n}>
          <NpsComposition filters={rpcFilters} />
        </Card>
      </div>

      <Card
        title="Branch performance"
        period={period}
        n={rows.reduce((a, r) => a + r.n, 0)}
        className="mb-6"
        actions={<FilterLink to="/branches">All branches</FilterLink>}
      >
        <p className="mb-3 text-[14px] text-secondary">{BRANCH_SUBTITLE}</p>
        <QueryView query={branches}>
          {(b) => (
            <MetricsTable
              rows={b}
              caption="Branch performance"
              showTarget
              showFactor={false}
              linkTo={(r) => <FilterLink to={`/branches/${r.key}`}>{r.label}</FilterLink>}
            />
          )}
        </QueryView>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="By channel" period={period} n={channels.data?.reduce((a, r) => a + r.n, 0)}>
          <QueryView query={channels}>{(c) => <MiniComparison rows={c} title="By channel" />}</QueryView>
        </Card>
        <Card title="By product" period={period} n={products.data?.reduce((a, r) => a + r.n, 0)}>
          <QueryView query={products}>{(p) => <MiniComparison rows={p} title="By product" />}</QueryView>
        </Card>
        <NeedsAttention />
      </div>
    </>
  );
}
