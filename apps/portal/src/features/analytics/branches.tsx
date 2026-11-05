import { Navigate, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useSession } from '../../lib/session';
import { MEASURES, RATING_BANDS, WORDS } from '../../lib/terms';
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
import { FilterBar, GranularityControl, useAnalyticsFilters } from './filters';
import { formatCount, formatDateTime, METRIC_INFO } from './format';
import { RegionHeat } from './dimension';
import { FactorDistribution, FACTORS_SUBTITLE } from './factors';
import { TrendChart } from './trend-chart';
import {
  BRANCH_SUBTITLE,
  Card,
  FilterLink,
  KpiCard,
  MetricsTable,
  MetricValue,
  NoData,
  QueryView,
  reliableFirst,
  Segmented,
  selectClass,
  TABLE_MEASURES,
  td,
  tdNum,
  th,
  thNum,
} from './ui';

const RANK_METRICS = [
  { key: 'csat_pct', label: MEASURES.csat_pct.label },
  { key: 'nps', label: MEASURES.nps.label },
  { key: 'ces_avg', label: MEASURES.ces_avg.label },
  { key: 'negative_rate', label: `${MEASURES.negative_rate.label} (fewest first)` },
] as const;

/** Ranking of all branches. Branches with too few responses are listed after the ranked ones, unranked. */
function Ranking() {
  const { rpcFilters } = useAnalyticsFilters();
  const [metric, setMetric] = useState<string>('csat_pct');
  const ranking = useRanking(rpcFilters, metric);
  return (
    <Card
      title="Branch ranking"
      subtitle={BRANCH_SUBTITLE}
      actions={
        <span className="inline-flex items-center gap-2 text-[14px] text-secondary">
          <label htmlFor="rank-by">Rank by</label>
          <select
            id="rank-by"
            className={selectClass}
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {RANK_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </span>
      }
    >
      <QueryView query={ranking}>
        {(r) => {
          const rows = reliableFirst(r.rows.filter((row) => row.n > 0));
          return rows.length === 0 ? (
            <NoData />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <caption className="sr-only">Branch ranking</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className={`${th} w-16`}>
                      Rank
                    </th>
                    <th scope="col" className={th}>
                      Branch
                    </th>
                    <th scope="col" className={th}>
                      Region
                    </th>
                    {TABLE_MEASURES.map((k) => (
                      <th key={k} scope="col" className={thNum} title={METRIC_INFO[k].explain}>
                        {METRIC_INFO[k].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className={`border-b border-border-subtle last:border-0 ${row.is_own ? 'bg-brand-50' : ''}`}
                    >
                      <td className={`${td} font-semibold tabular-nums`}>
                        {row.low_sample || row.rank === null ? '' : row.rank}
                      </td>
                      <th scope="row" className={`${td} text-left font-medium`}>
                        {row.is_own ? (
                          <FilterLink to={`/branches/${row.key}`}>{row.label}</FilterLink>
                        ) : (
                          row.label
                        )}
                        {row.is_own && <span className="sr-only"> (your branch)</span>}
                      </th>
                      <td className={`${td} text-secondary`}>{row.region_label}</td>
                      {TABLE_MEASURES.map((k) => (
                        <td key={k} className={tdNum}>
                          <MetricValue metric={k} value={row[k]} few={row.low_sample} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryView>
    </Card>
  );
}

function CompareTable({ ids }: { ids: string[] }) {
  const { rpcFilters } = useAnalyticsFilters();
  const compare = useCompare(ids, rpcFilters);
  return (
    <Card title="Side by side" subtitle="The selected branches compared with the company average.">
      <QueryView query={compare}>
        {(c) => (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <caption className="sr-only">
                Selected branches compared for the same period and filters
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className={th}>
                    Branch
                  </th>
                  {TABLE_MEASURES.map((k) => (
                    <th key={k} scope="col" className={thNum} title={METRIC_INFO[k].explain}>
                      {METRIC_INFO[k].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row) => (
                  <tr key={row.key} className="border-b border-border-subtle">
                    <th scope="row" className={`${td} text-left font-medium`}>
                      {row.label}
                      <span className="block text-[12px] font-normal text-muted">{row.region_label}</span>
                    </th>
                    {TABLE_MEASURES.map((k) => (
                      <td key={k} className={tdNum}>
                        <MetricValue metric={k} value={row[k] ?? null} few={row.low_sample} />
                      </td>
                    ))}
                  </tr>
                ))}
                {c.company && (
                  <tr className="bg-subtle">
                    <th scope="row" className={`${td} text-left font-semibold`}>
                      {WORDS.benchmark}
                    </th>
                    {TABLE_MEASURES.map((k) => (
                      <td key={k} className={`${tdNum} font-semibold`}>
                        <MetricValue metric={k} value={c.company?.[k] ?? null} />
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

/** Branch performance: list, compare up to 6, ranking (REQ §6.2). */
export function BranchesPage() {
  const { claims, can } = useSession();
  const { rpcFilters } = useAnalyticsFilters();
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
      <PageHeader
        title="Branch performance"
        subtitle="How each branch is doing, based on customers who bought their policy at a branch."
        actions={
          can('analytics.branch_ranking.view') && (
            <Segmented
              label="Branch view"
              options={[
                { key: 'list', label: 'All branches' },
                { key: 'ranking', label: 'Ranking' },
              ]}
              value={view}
              onChange={setView}
            />
          )
        }
      />
      <FilterBar />
      {view === 'ranking' ? (
        <Ranking />
      ) : (
        <div className="grid gap-6">
          <Card title="Branches" subtitle="Tick up to 6 branches to see them side by side.">
            <QueryView query={branches}>
              {(rows) => (
                <MetricsTable
                  rows={rows}
                  caption="Branches"
                  nameHeader="Branch"
                  linkTo={(r) => (
                    <span className="inline-flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Compare ${r.label}`}
                        className="size-4 accent-[var(--color-brand)]"
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
              <div className="mt-4 flex items-center gap-3">
                <p aria-live="polite" className="text-[14px] text-secondary">
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
  const q = useRpc<{ created?: number; open?: number; overdue?: number }>('case_metrics', {
    p_filters: filters,
  });
  if (q.isError && isMissingRpc(q.error)) {
    return <p className="text-secondary">Case figures appear here once case management is live.</p>;
  }
  return (
    <QueryView query={q} skeleton="h-24">
      {(m) => (
        <dl className="grid gap-4">
          {[
            { label: 'Cases opened in the period', value: m.created },
            { label: 'Still open', value: m.open },
            { label: WORDS.slaBreached, value: m.overdue },
          ].map((i) => (
            <div key={i.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[14px] text-secondary">{i.label}</dt>
              <dd className="text-[20px] font-semibold tabular-nums">{formatCount(i.value ?? null)}</dd>
            </div>
          ))}
        </dl>
      )}
    </QueryView>
  );
}

const band = (csat: number) =>
  csat >= 4 ? RATING_BANDS.positive : csat <= 2 ? RATING_BANDS.negative : RATING_BANDS.neutral;

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
          <ul className="grid">
            {page.rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle py-3 text-[14px] last:border-0"
              >
                <span>
                  <FilterLink to="/records" extraSearch={{ record: r.id }}>
                    {r.reference}
                  </FilterLink>{' '}
                  <span className="text-muted">{formatDateTime(r.submitted_at)}</span>
                </span>
                <span className="text-secondary">
                  {band(r.csat)} · {r.product.label}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    </QueryView>
  );
}

/** One branch: its measures next to the company average, trend, products, areas to improve, comments, cases. */
export function BranchDetailPage() {
  const { branchId } = useParams({ strict: false }) as { branchId: string };
  const { can } = useSession();
  const { rpcFilters, filters } = useAnalyticsFilters();
  const catalogues = useCatalogues();
  const f = useMemo(() => ({ ...rpcFilters, branch_ids: [branchId] }), [rpcFilters, branchId]);
  const summary = useSummary(f);
  const trend = useTrend('csat_pct', filters.granularity, f);
  const products = useBreakdown('product', f);
  const branch = catalogues.data?.branches.find((b) => b.id === branchId);
  const region = catalogues.data?.regions.find((r) => r.id === branch?.regionId);
  const kpis: KpiKey[] = ['csat_pct', 'nps', 'ces_avg', 'negative_rate'];
  const showCompany = can('analytics.benchmark.view');
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
      <FilterBar hide={['branch', 'region']} />
      <QueryView query={summary} skeleton="h-44">
        {(s) => (
          <>
            {s.n === 0 && (
              <div className="mb-6">
                <Alert tone="info" title={WORDS.noData}>
                  No customers named this branch in this period.
                </Alert>
              </div>
            )}
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((k) => (
                <KpiCard key={k} metric={k} m={s.metrics[k]} company={showCompany} />
              ))}
            </div>
          </>
        )}
      </QueryView>
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <Card
          title={`${MEASURES.csat_pct.label} over time`}
          subtitle={
            showCompany ? `This branch compared with the ${WORDS.benchmark.toLowerCase()}.` : undefined
          }
          className="lg:col-span-2"
          actions={<GranularityControl />}
        >
          <QueryView query={trend} skeleton="h-64">
            {(t) => <TrendChart trend={t} />}
          </QueryView>
        </Card>
        <Card title="Cases">
          <CasesSummary filters={f} />
        </Card>
      </div>
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card title="Products at this branch">
          <QueryView query={products}>
            {(rows) => (
              <MetricsTable
                rows={rows}
                caption="Products at this branch"
                nameHeader="Product"
                showFactor={false}
              />
            )}
          </QueryView>
        </Card>
        <Card title={WORDS.factors} subtitle={FACTORS_SUBTITLE}>
          <FactorDistribution filters={f} />
        </Card>
      </div>
      {can('responses.view') && can('responses.comment.view') && (
        <Card title="Recent comments">
          <RecentComments filters={f} />
        </Card>
      )}
    </>
  );
}
