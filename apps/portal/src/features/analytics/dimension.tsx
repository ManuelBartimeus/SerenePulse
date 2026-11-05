import { useState } from 'react';
import { PageHeader } from '../../pages/shell';
import { useBreakdown, useTrend, type BreakdownRow, type TrendMetric } from './api';
import { heatStep, SEQUENTIAL } from './chart-palette';
import { FilterBar, useAnalyticsFilters } from './filters';
import type { ListKey } from './filters-state';
import { formatCount, formatMetric } from './format';
import { TrendChart } from './trend-chart';
import { Card, MetricsTable, QueryView } from './ui';

function ItemTrend({ rows, filterKey, noun }: { rows: BreakdownRow[]; filterKey: string; noun: string }) {
  const { rpcFilters, period, filters } = useAnalyticsFilters();
  const withData = rows.filter((r) => r.n > 0);
  const [key, setKey] = useState('');
  const [metric, setMetric] = useState<TrendMetric>('csat_pct');
  const selected = key || withData[0]?.key || '';
  const trend = useTrend(metric, filters.granularity, {
    ...rpcFilters,
    [filterKey]: selected ? [selected] : [],
  });
  if (withData.length === 0) return null;
  return (
    <Card
      title={`Trend for one ${noun}`}
      period={period}
      n={withData.find((r) => r.key === selected)?.n}
      actions={
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-[14px]">
            {noun.charAt(0).toUpperCase() + noun.slice(1)}
            <select
              className="h-11 rounded-sm border border-border-strong bg-white px-3"
              value={selected}
              onChange={(e) => setKey(e.target.value)}
            >
              {withData.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            Metric
            <select
              className="h-11 rounded-sm border border-border-strong bg-white px-3"
              value={metric}
              onChange={(e) => setMetric(e.target.value as TrendMetric)}
            >
              <option value="csat_pct">CSAT %</option>
              <option value="nps">NPS</option>
              <option value="ces_avg">Average CES</option>
              <option value="negative_rate">Negative rate</option>
              <option value="responses">Responses</option>
            </select>
          </label>
        </div>
      }
    >
      <QueryView query={trend} skeleton="h-64">
        {(t) => <TrendChart trend={t} />}
      </QueryView>
    </Card>
  );
}

/** S-A3 Channel analytics / S-A4 Product analytics: ranked table + per-item trend. */
export function DimensionPage({
  dimension,
  title,
  subtitle,
  noun,
}: {
  dimension: 'channel' | 'product';
  title: string;
  subtitle: string;
  noun: string;
}) {
  const { rpcFilters, period } = useAnalyticsFilters();
  const rows = useBreakdown(dimension, rpcFilters);
  const filterKey = dimension === 'channel' ? 'channel_ids' : 'product_ids';
  const hide: ListKey[] = [dimension];
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <FilterBar granularity hide={hide} />
      <div className="grid gap-6">
        <Card title={title} period={period} n={rows.data?.reduce((a, r) => a + r.n, 0)}>
          <QueryView query={rows}>
            {(data) => (
              <MetricsTable
                rows={[...data].sort((a, b) => (b.csat_pct ?? -1) - (a.csat_pct ?? -1))}
                caption={title}
                showTarget
              />
            )}
          </QueryView>
          <p className="mt-2 text-[12px] text-muted">
            Sorted by CSAT %. Labels are the current catalogue labels; low-sample rows are marked.
          </p>
        </Card>
        {rows.data && <ItemTrend rows={rows.data} filterKey={filterKey} noun={noun} />}
      </div>
    </>
  );
}

/** Region heat table (A-110: a table instead of a map), sequential brand scale + values as text. */
export function RegionHeat() {
  const { rpcFilters, period } = useAnalyticsFilters();
  const rows = useBreakdown('region', rpcFilters);
  const metrics = ['csat_pct', 'nps', 'ces_avg', 'negative_rate'] as const;
  return (
    <Card title="Regions" period={period} n={rows.data?.reduce((a, r) => a + r.n, 0)}>
      <QueryView query={rows}>
        {(data) => {
          const visible = data.filter((r) => r.n > 0);
          if (visible.length === 0) return <p className="text-secondary">No data</p>;
          const range = (k: (typeof metrics)[number]) => {
            const vals = visible.map((r) => r[k]).filter((v): v is number => v !== null);
            return [Math.min(...vals), Math.max(...vals)] as const;
          };
          return (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[14px]">
                <caption className="sr-only">Regions, shaded from lowest to highest value per column</caption>
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                    <th scope="col" className="px-3 py-2">
                      Region
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      n
                    </th>
                    {metrics.map((m) => (
                      <th key={m} scope="col" className="px-3 py-2 text-right">
                        {m === 'csat_pct'
                          ? 'CSAT %'
                          : m === 'nps'
                            ? 'NPS'
                            : m === 'ces_avg'
                              ? 'CES'
                              : 'Negative'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.key} className="border-t border-white">
                      <th scope="row" className="px-3 py-3 text-left font-medium">
                        {r.label}
                        {r.low_sample && <span className="text-[12px] text-warning"> · low sample</span>}
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCount(r.n)}</td>
                      {metrics.map((m) => {
                        const [lo, hi] = range(m);
                        // Negative rate: lower is better, so the scale is reversed.
                        const raw = heatStep(r[m], lo, hi);
                        const step = raw === null ? null : m === 'negative_rate' ? 4 - raw : raw;
                        return (
                          <td
                            key={m}
                            className="px-3 py-3 text-right tabular-nums"
                            style={
                              step === null || r.low_sample
                                ? undefined
                                : { background: SEQUENTIAL[step], color: step >= 3 ? '#ffffff' : '#111111' }
                            }
                          >
                            {formatMetric(m, r[m])}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[12px] text-muted">
                Darker = better within each column. Low-sample regions are not shaded.
              </p>
            </div>
          );
        }}
      </QueryView>
    </Card>
  );
}
