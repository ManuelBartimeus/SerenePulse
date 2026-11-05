import { useMemo, useState } from 'react';
import { PageHeader } from '../../pages/shell';
import { useBreakdown, useDistribution, useTrend, type Dimension } from './api';
import { Chart } from './chart';
import { BRAND, GRID, MUTED } from './chart-palette';
import { useCatalogues } from './catalogues';
import { FilterBar, useAnalyticsFilters } from './filters';
import { formatDay } from './filters-state';
import { formatCount, formatPct } from './format';
import { Card, NoData, QueryView, UnverifiedNote } from './ui';

/** Factor distribution (incl. "Nothing, I am satisfied" and "Not answered"), as a labelled bar chart. */
export function FactorDistribution({ filters }: { filters: Record<string, unknown> }) {
  const q = useDistribution('factor', filters as never);
  return (
    <QueryView query={q} skeleton="h-56">
      {(d) => {
        if (d.n === 0) return <NoData />;
        const buckets = d.buckets.filter((b) => b.count > 0 || !b.is_none);
        return (
          <>
            <Chart
              kind="bar"
              height={Math.max(160, buckets.length * 36)}
              label={`Improvement factors, n = ${d.n}`}
              option={{
                animation: false,
                grid: { left: 180, right: 56, top: 8, bottom: 8 },
                tooltip: { trigger: 'item' },
                xAxis: { type: 'value', show: false, max: 100 },
                yAxis: {
                  type: 'category',
                  inverse: true,
                  data: buckets.map((b) => b.label),
                  axisLabel: { color: MUTED, fontSize: 12, width: 170, overflow: 'truncate' },
                  axisLine: { lineStyle: { color: GRID } },
                },
                series: [
                  {
                    type: 'bar',
                    barWidth: 16,
                    itemStyle: { color: BRAND, borderRadius: [0, 4, 4, 0] },
                    label: {
                      show: true,
                      position: 'right',
                      formatter: (p: { value: number }) => formatPct(p.value),
                    },
                    data: buckets.map((b) => b.share ?? 0),
                  },
                ],
              }}
              table={
                <table className="w-full text-[14px]">
                  <caption className="sr-only">Improvement factors</caption>
                  <thead>
                    <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                      <th scope="col">Factor</th>
                      <th scope="col" className="text-right">
                        Count
                      </th>
                      <th scope="col" className="text-right">
                        Share of n
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((b) => (
                      <tr key={b.key} className="border-t border-border">
                        <th scope="row" className="py-1 text-left font-normal">
                          {b.label}
                        </th>
                        <td className="text-right tabular-nums">{formatCount(b.count)}</td>
                        <td className="text-right tabular-nums">{formatPct(b.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
            <UnverifiedNote count={d.unverified_excluded} included={false} />
          </>
        );
      }}
    </QueryView>
  );
}

function CrossTab({ dimension, title }: { dimension: Dimension; title: string }) {
  const { rpcFilters, period } = useAnalyticsFilters();
  const rows = useBreakdown(dimension, rpcFilters);
  const catalogues = useCatalogues();
  const factors = (catalogues.data?.factors ?? []).filter((f) => !f.inactive);
  return (
    <Card title={title} period={period} n={rows.data?.reduce((a, r) => a + r.n, 0)}>
      <QueryView query={rows}>
        {(data) =>
          data.filter((r) => r.n > 0).length === 0 ? (
            <NoData />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[14px]">
                <caption className="sr-only">{title}: share of responses naming each factor</caption>
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                    <th scope="col" className="px-2 py-2">
                      Name
                    </th>
                    <th scope="col" className="px-2 py-2 text-right">
                      n
                    </th>
                    {factors.map((f) => (
                      <th key={f.id} scope="col" className="px-2 py-2 text-right">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data
                    .filter((r) => r.n > 0)
                    .map((r) => (
                      <tr key={r.key} className="border-t border-border">
                        <th scope="row" className="px-2 py-2 text-left font-medium">
                          {r.label}
                          {r.low_sample && <span className="text-[12px] text-warning"> · low sample</span>}
                        </th>
                        <td className="px-2 py-2 text-right tabular-nums">{formatCount(r.n)}</td>
                        {factors.map((f) => (
                          <td key={f.id} className="px-2 py-2 text-right tabular-nums">
                            {formatPct(((r.factor_counts[f.code ?? ''] ?? 0) * 100) / r.n)}
                          </td>
                        ))}
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

function FactorTrend() {
  const { rpcFilters, period, filters } = useAnalyticsFilters();
  const catalogues = useCatalogues();
  const options = (catalogues.data?.factors ?? []).filter((f) => !f.isNone);
  const [factor, setFactor] = useState<string>('');
  const selected = factor || options[0]?.id || '';
  const all = useTrend('responses', filters.granularity, rpcFilters);
  const only = useTrend('responses', filters.granularity, {
    ...rpcFilters,
    factor_ids: selected ? [selected] : [],
  });
  const points = useMemo(() => {
    if (!all.data || !only.data) return [];
    return all.data.points.map((p, i) => {
      const k = only.data.points[i]?.n ?? 0;
      return { bucket: p.bucket, from: p.from, to: p.to, n: p.n, k, share: p.n > 0 ? (k * 100) / p.n : null };
    });
  }, [all.data, only.data]);
  const label = options.find((o) => o.id === selected)?.label ?? 'factor';
  return (
    <Card
      title="Factor over time"
      period={period}
      n={all.data?.points.reduce((a, p) => a + p.n, 0)}
      actions={
        <label className="flex items-center gap-2 text-[14px]">
          Factor
          <select
            className="h-11 rounded-sm border border-border-strong bg-white px-3"
            value={selected}
            onChange={(e) => setFactor(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <p className="mb-2 text-[14px] text-secondary">
        Share of valid responses naming “{label}”. Combine with the channel filter to see e.g. technical
        issues for digital channels.
      </p>
      <QueryView query={only} skeleton="h-64">
        {() =>
          points.every((p) => p.share === null) ? (
            <NoData />
          ) : (
            <Chart
              kind="line"
              label={`Share naming ${label} by ${filters.granularity}`}
              option={{
                animation: false,
                grid: { left: 48, right: 16, top: 16, bottom: 32 },
                tooltip: { trigger: 'axis', valueFormatter: (v: number | null) => formatPct(v) },
                xAxis: {
                  type: 'category',
                  data: points.map((p) => formatDay(p.bucket)),
                  axisLabel: { color: MUTED },
                },
                yAxis: {
                  type: 'value',
                  axisLabel: { color: MUTED, formatter: '{value}%' },
                  splitLine: { lineStyle: { color: GRID } },
                },
                series: [
                  {
                    type: 'line',
                    name: label,
                    connectNulls: false,
                    symbolSize: 8,
                    lineStyle: { width: 2, color: BRAND },
                    itemStyle: { color: BRAND },
                    data: points.map((p) => p.share),
                  },
                ],
              }}
              table={
                <table className="w-full text-[14px]">
                  <caption className="sr-only">Share naming {label}</caption>
                  <thead>
                    <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                      <th scope="col">Period</th>
                      <th scope="col" className="text-right">
                        Share
                      </th>
                      <th scope="col" className="text-right">
                        Count / n
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p) => (
                      <tr key={p.bucket} className="border-t border-border">
                        <th scope="row" className="py-1 text-left font-normal">
                          {formatDay(p.from)} – {formatDay(p.to)}
                        </th>
                        <td className="text-right tabular-nums">{formatPct(p.share)}</td>
                        <td className="text-right tabular-nums">
                          {formatCount(p.k)} / {formatCount(p.n)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
          )
        }
      </QueryView>
    </Card>
  );
}

/** S-A6 Improvement factors: distribution, by branch / channel / product, over time. */
export function FactorsPage() {
  const { rpcFilters, period } = useAnalyticsFilters();
  return (
    <>
      <PageHeader
        title="Improvement factors"
        subtitle="What customers say we should improve (optional question)."
      />
      <FilterBar granularity />
      <div className="grid gap-6">
        <Card title="Distribution" period={period}>
          <FactorDistribution filters={rpcFilters} />
        </Card>
        <FactorTrend />
        <CrossTab dimension="channel" title="By channel" />
        <CrossTab dimension="product" title="By product" />
        <CrossTab dimension="branch" title="By branch (walk-in customers)" />
      </div>
    </>
  );
}
