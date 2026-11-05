import { Navigate, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button } from '../../ui/controls';
import {
  isMissingRpc,
  useBreakdown,
  useCompare,
  useRanking,
  useRpc,
  useSummary,
  useTrend,
  type KpiKey,
  type RecordPage,
} from './api';
import { useCatalogues } from './catalogues';
import { FilterBar, useAnalyticsFilters } from './filters';
import { formatCount, formatDateTime, formatDelta, formatMetric } from './format';
import { RegionHeat } from './dimension';
import { FactorDistribution } from './factors';
import { TrendChart } from './trend-chart';
import {
  BRANCH_SUBTITLE,
  Card,
  FilterLink,
  KpiCard,
  LowSampleBadge,
  MetricsTable,
  NoData,
  QueryView,
} from './ui';

const RANK_METRICS = [
  { key: 'csat_pct', label: 'CSAT %' },
  { key: 'nps', label: 'NPS' },
  { key: 'ces_avg', label: 'Average CES' },
  { key: 'negative_rate', label: 'Negative rate (lower is better)' },
] as const;

/** Named ranking of all branches: aggregates only (D-24); low-sample branches listed without a rank. */
function Ranking() {
  const { rpcFilters, period } = useAnalyticsFilters();
  const [metric, setMetric] = useState<string>('csat_pct');
  const ranking = useRanking(rpcFilters, metric);
  return (
    <Card
      title="Branch ranking"
      period={period}
      n={ranking.data?.rows.reduce((a, r) => a + r.n, 0)}
      actions={
        <label className="flex items-center gap-2 text-[14px]">
          Rank by
          <select
            className="h-11 rounded-sm border border-border-strong bg-white px-3"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {RANK_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <p className="mb-3 text-[14px] text-secondary">
        {BRANCH_SUBTITLE} Branches below the minimum sample are shown but not ranked.
      </p>
      <QueryView query={ranking}>
        {(r) =>
          r.rows.length === 0 ? (
            <NoData />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[14px]">
                <caption className="sr-only">Branch ranking</caption>
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                    <th scope="col" className="px-3 py-2">
                      Rank
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Branch
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Region
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      n
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      CSAT %
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      NPS
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      CES
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Negative
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row) => (
                    <tr key={row.key} className={`border-t border-border ${row.is_own ? 'bg-brand-50' : ''}`}>
                      <td className="px-3 py-3 tabular-nums">{row.rank ?? '—'}</td>
                      <th scope="row" className="px-3 py-3 text-left font-medium">
                        {row.is_own ? (
                          <FilterLink to={`/branches/${row.key}`}>{row.label}</FilterLink>
                        ) : (
                          row.label
                        )}
                        {row.is_own && <span className="sr-only"> (your branch)</span>}{' '}
                        <LowSampleBadge n={row.n} show={row.low_sample} />
                      </th>
                      <td className="px-3 py-3">{row.region_label}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCount(row.n)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatMetric('csat_pct', row.csat_pct)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric('nps', row.nps)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatMetric('ces_avg', row.ces_avg)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatMetric('negative_rate', row.negative_rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryView>
    </Card>
  );
}

function CompareTable({ ids }: { ids: string[] }) {
  const { rpcFilters, period } = useAnalyticsFilters();
  const compare = useCompare(ids, rpcFilters);
  const keys: KpiKey[] = ['csat_pct', 'nps', 'ces_avg', 'negative_rate'];
  return (
    <Card title="Comparison" period={period} n={compare.data?.rows.reduce((a, r) => a + r.n, 0)}>
      <QueryView query={compare}>
        {(c) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[14px]">
              <caption className="sr-only">Branch comparison for the same period and filters</caption>
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                  <th scope="col" className="px-3 py-2">
                    Branch
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Responses
                  </th>
                  {keys.map((k) => (
                    <th key={k} scope="col" className="px-3 py-2 text-right">
                      {k === 'csat_pct'
                        ? 'CSAT %'
                        : k === 'nps'
                          ? 'NPS'
                          : k === 'ces_avg'
                            ? 'CES'
                            : 'Negative'}
                      {c.company && ' (Δ company)'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <th scope="row" className="px-3 py-3 text-left font-medium">
                      {row.label} <LowSampleBadge n={row.n} show={row.low_sample ?? false} />
                      <span className="block text-[12px] font-normal text-muted">{row.region_label}</span>
                    </th>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCount(row.n)}</td>
                    {keys.map((k) => (
                      <td key={k} className="px-3 py-3 text-right tabular-nums">
                        {formatMetric(k, (row[k as keyof typeof row] as number | null | undefined) ?? null)}
                        {row.delta_vs_company && (
                          <span className="block text-[12px] text-secondary">
                            {formatDelta(k, row.delta_vs_company[k as keyof typeof row.delta_vs_company])}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {c.company && (
                  <tr className="border-t border-border-strong bg-subtle">
                    <th scope="row" className="px-3 py-3 text-left font-medium">
                      Company (all responses, same period and filters)
                    </th>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCount(c.company.n)}</td>
                    {keys.map((k) => (
                      <td key={k} className="px-3 py-3 text-right tabular-nums">
                        {formatMetric(k, c.company?.[k as keyof NonNullable<typeof c.company>] ?? null)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </Card>
  );
}

/** S-A2 Branch performance: list, compare up to 6, named ranking (REQ §6.2). */
export function BranchesPage() {
  const { claims, can } = useSession();
  const { rpcFilters, period } = useAnalyticsFilters();
  const branches = useBreakdown('branch', rpcFilters);
  const [compare, setCompare] = useState<string[]>([]);
  const [view, setView] = useState<'list' | 'ranking'>('list');
  const own = claims?.app_branch_ids ?? [];
  // Branch managers land on their branch (one branch) — D-24.
  if (claims && !claims.app_org_scope && own.length === 1) {
    return (
      <Navigate
        to="/branches/$branchId"
        params={{ branchId: own[0] ?? '' } as never}
        search={true as never}
        replace
      />
    );
  }
  const toggle = (id: string) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 6 ? [...c, id] : c));
  return (
    <>
      <PageHeader title="Branch performance" subtitle={BRANCH_SUBTITLE} />
      <FilterBar />
      {can('analytics.branch_ranking.view') && (
        <div role="tablist" aria-label="Branch view" className="mb-4 flex gap-2">
          {(['list', 'ranking'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`h-11 rounded-full border px-4 text-[14px] ${view === v ? 'border-brand bg-brand-50 font-medium text-brand' : 'border-border bg-white'}`}
            >
              {v === 'list' ? 'Branches' : 'Named ranking'}
            </button>
          ))}
        </div>
      )}
      {view === 'ranking' ? (
        <Ranking />
      ) : (
        <div className="grid gap-6">
          <Card title="Branches" period={period} n={branches.data?.reduce((a, r) => a + r.n, 0)}>
            <p className="mb-3 text-[14px] text-secondary">
              Select up to 6 branches to compare them for the same period and filters.
            </p>
            <QueryView query={branches}>
              {(rows) => (
                <MetricsTable
                  rows={rows}
                  caption="Branches"
                  showTarget
                  linkTo={(r) => (
                    <span className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Compare ${r.label}`}
                        className="size-5 accent-[var(--color-brand)]"
                        checked={compare.includes(r.key)}
                        disabled={!compare.includes(r.key) && compare.length >= 6}
                        onChange={() => toggle(r.key)}
                      />
                      <FilterLink to={`/branches/${r.key}`}>{r.label}</FilterLink>
                    </span>
                  )}
                />
              )}
            </QueryView>
            {compare.length > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <p aria-live="polite" className="text-[14px]">
                  {compare.length} of 6 selected
                </p>
                <Button variant="ghost" onClick={() => setCompare([])}>
                  Clear selection
                </Button>
              </div>
            )}
          </Card>
          {compare.length > 0 && <CompareTable ids={compare} />}
          <RegionHeat />
        </div>
      )}
    </>
  );
}

function CasesSummary({ filters }: { filters: Record<string, unknown> }) {
  const q = useRpc<Record<string, number | null>>('case_metrics', { p_filters: filters });
  if (q.isError && isMissingRpc(q.error)) {
    return <p className="text-secondary">Case figures appear here once case management is live.</p>;
  }
  return (
    <QueryView query={q} skeleton="h-24">
      {(m) => (
        <dl className="grid grid-cols-2 gap-3 text-[14px]">
          {Object.entries(m)
            .filter(([, v]) => typeof v === 'number' || v === null)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-secondary">
                  {k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}
                </dt>
                <dd className="text-[18px] font-medium tabular-nums">
                  {v === null ? 'No data' : formatCount(Math.round(v * 10) / 10)}
                </dd>
              </div>
            ))}
        </dl>
      )}
    </QueryView>
  );
}

function RecentComments({ filters }: { filters: Record<string, unknown> }) {
  const q = useRpc<RecordPage>('records_list', {
    p_filters: { ...filters, has_comment: true },
    p_search: null,
    p_cursor: null,
    p_limit: 5,
  });
  return (
    <QueryView query={q}>
      {(page) =>
        page.rows.length === 0 ? (
          <NoData>No comments in this period.</NoData>
        ) : (
          <ul className="grid gap-2">
            {page.rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[14px]"
              >
                <span>
                  <FilterLink to="/records" extraSearch={{ record: r.id }}>
                    {r.reference}
                  </FilterLink>{' '}
                  <span className="text-muted">{formatDateTime(r.submitted_at)}</span>
                </span>
                <span className="text-secondary">
                  CSAT {r.csat} · {r.product.label}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    </QueryView>
  );
}

/** S-A2 branch detail: KPIs vs company benchmark and target, trend, products, factors, comments, cases. */
export function BranchDetailPage() {
  const { branchId } = useParams({ strict: false }) as { branchId: string };
  const { can } = useSession();
  const { rpcFilters, period, filters } = useAnalyticsFilters();
  const catalogues = useCatalogues();
  const f = useMemo(
    () => ({ ...rpcFilters, branch_ids: [branchId], branch_statuses: [] as string[] }),
    [rpcFilters, branchId],
  );
  const summary = useSummary(f);
  const trend = useTrend('csat_pct', filters.granularity, f);
  const products = useBreakdown('product', f);
  const branch = catalogues.data?.branches.find((b) => b.id === branchId);
  const region = catalogues.data?.regions.find((r) => r.id === branch?.regionId);
  const kpis: { key: KpiKey; label: string }[] = [
    { key: 'csat_pct', label: 'CSAT %' },
    { key: 'csat_avg', label: 'Average CSAT' },
    { key: 'nps', label: 'NPS' },
    { key: 'ces_avg', label: 'Average CES' },
    { key: 'negative_rate', label: 'Negative rate' },
  ];
  return (
    <>
      <PageHeader
        title={branch?.label ?? 'Branch'}
        subtitle={
          <>
            {region && <Badge tone="neutral">{region.label}</Badge>} {BRANCH_SUBTITLE}
          </>
        }
        actions={<FilterLink to="/branches">All branches</FilterLink>}
      />
      <FilterBar granularity hide={['branch', 'region']} />
      <QueryView query={summary} skeleton="h-44">
        {(s) => (
          <>
            <p className="mb-3 text-[14px] text-secondary">
              n = {formatCount(s.n)} valid responses · KPIs compared with the company for the same period and
              filters
              {!can('analytics.benchmark.view') && ' (benchmark hidden: needs the benchmark permission)'}.
            </p>
            {s.n === 0 && (
              <div className="mb-4">
                <Alert tone="info">
                  No responses named this branch in the period. Figures show “No data”.
                </Alert>
              </div>
            )}
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
              {kpis.map((k) => (
                <KpiCard key={k.key} metric={k.key} label={k.label} m={s.metrics[k.key]} />
              ))}
            </div>
          </>
        )}
      </QueryView>
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card
          title="CSAT % trend (branch and company)"
          period={period}
          n={summary.data?.n}
          className="lg:col-span-2"
        >
          <QueryView query={trend} skeleton="h-64">
            {(t) => <TrendChart trend={t} />}
          </QueryView>
        </Card>
        <Card title="Cases" period={period}>
          <CasesSummary filters={f} />
        </Card>
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Products within this branch" period={period} n={summary.data?.n}>
          <QueryView query={products}>
            {(rows) => (
              <MetricsTable
                rows={rows.filter((r) => r.n > 0)}
                caption="Products within this branch"
                showFactor={false}
              />
            )}
          </QueryView>
        </Card>
        <Card title="Top improvement factors" period={period} n={summary.data?.n}>
          <FactorDistribution filters={f} />
        </Card>
      </div>
      {can('responses.view') && can('responses.comment.view') && (
        <Card title="Recent comments" period={period}>
          <RecentComments filters={f} />
        </Card>
      )}
    </>
  );
}
