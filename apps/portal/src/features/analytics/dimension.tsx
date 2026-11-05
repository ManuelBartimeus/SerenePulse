import { useState } from 'react';
import { PageHeader } from '../../pages/shell';
import { useBreakdown, useTrend, type BreakdownRow, type TrendMetric } from './api';
import { heatStep, SEQUENTIAL } from './chart-palette';
import { FilterBar, GranularityControl, useAnalyticsFilters } from './filters';
import type { ListKey } from './filters-state';
import { MEASURE_OPTIONS, METRIC_INFO } from './format';
import { TrendChart } from './trend-chart';
import {
  Card,
  MetricsTable,
  MetricValue,
  NoData,
  QueryView,
  reliableFirst,
  selectClass,
  TABLE_MEASURES,
  td,
  tdNum,
  th,
  thNum,
} from './ui';

function ItemTrend({ rows, filterKey, noun }: { rows: BreakdownRow[]; filterKey: string; noun: string }) {
  const { rpcFilters, filters } = useAnalyticsFilters();
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
      title="Over time"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`trend-${noun}`}>
            {noun}
          </label>
          <select
            id={`trend-${noun}`}
            className={selectClass}
            value={selected}
            onChange={(e) => setKey(e.target.value)}
          >
            {withData.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor={`trend-${noun}-measure`}>
            Measure
          </label>
          <select
            id={`trend-${noun}-measure`}
            className={selectClass}
            value={metric}
            onChange={(e) => setMetric(e.target.value as TrendMetric)}
          >
            {MEASURE_OPTIONS.filter((m) => m !== 'completion_rate').map((m) => (
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
  );
}

/** Channel and product performance: comparison table + one item over time. */
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
  const { rpcFilters } = useAnalyticsFilters();
  const rows = useBreakdown(dimension, rpcFilters);
  const filterKey = dimension === 'channel' ? 'channel_ids' : 'product_ids';
  const hide: ListKey[] = [dimension];
  const nameHeader = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <FilterBar hide={hide} />
      <div className="grid gap-6">
        <Card title={`Each ${noun} at a glance`} subtitle="Best satisfaction first.">
          <QueryView query={rows}>
            {(data) => (
              <MetricsTable
                rows={[...data].sort((a, b) => (b.csat_pct ?? -1) - (a.csat_pct ?? -1))}
                caption={title}
                nameHeader={nameHeader}
              />
            )}
          </QueryView>
        </Card>
        {rows.data && <ItemTrend rows={rows.data} filterKey={filterKey} noun={noun} />}
      </div>
    </>
  );
}

/** Regions as a shaded table (darker = better within each column), values always as text. */
export function RegionHeat() {
  const { rpcFilters } = useAnalyticsFilters();
  const rows = useBreakdown('region', rpcFilters);
  return (
    <Card title="Regions" subtitle="Darker shading means a better result within each column.">
      <QueryView query={rows}>
        {(data) => {
          const visible = reliableFirst(data.filter((r) => r.n > 0));
          if (visible.length === 0) return <NoData />;
          const reliable = visible.filter((r) => !r.low_sample);
          const range = (k: (typeof TABLE_MEASURES)[number]) => {
            const vals = reliable.map((r) => r[k]).filter((v): v is number => v !== null);
            return [Math.min(...vals), Math.max(...vals)] as const;
          };
          return (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <caption className="sr-only">Regions, shaded from weakest to strongest per column</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className={th}>
                      Region
                    </th>
                    {TABLE_MEASURES.map((m) => (
                      <th key={m} scope="col" className={thNum} title={METRIC_INFO[m].explain}>
                        {METRIC_INFO[m].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.key} className="border-b-2 border-white">
                      <th scope="row" className={`${td} text-left font-medium`}>
                        {r.label}
                      </th>
                      {TABLE_MEASURES.map((m) => {
                        const [lo, hi] = range(m);
                        // Unhappy customers: lower is better, so the scale is reversed.
                        const raw = r.low_sample ? null : heatStep(r[m], lo, hi);
                        const step = raw === null ? null : m === 'negative_rate' ? 4 - raw : raw;
                        return (
                          <td
                            key={m}
                            className={tdNum}
                            style={
                              step === null
                                ? undefined
                                : { background: SEQUENTIAL[step], color: step >= 3 ? '#ffffff' : '#111111' }
                            }
                          >
                            <MetricValue metric={m} value={r[m]} few={r.low_sample} />
                          </td>
                        );
                      })}
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
