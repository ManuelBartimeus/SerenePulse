import { useState } from 'react';
import { PageHeader } from '../../pages/shell';
import { useTrend, type TrendMetric } from './api';
import { FilterBar, useAnalyticsFilters } from './filters';
import { METRIC_INFO } from './format';
import { TrendChart } from './trend-chart';
import { Card, QueryView } from './ui';

const OPTIONS: TrendMetric[] = [
  'csat_pct',
  'nps',
  'ces_avg',
  'csat_avg',
  'negative_rate',
  'responses',
  'completion_rate',
];

function MetricTrend({ metric }: { metric: TrendMetric }) {
  const { rpcFilters, period, filters } = useAnalyticsFilters();
  const trend = useTrend(metric, filters.granularity, rpcFilters);
  return (
    <Card
      title={METRIC_INFO[metric].label}
      period={period}
      n={trend.data?.points.reduce((a, p) => a + p.n, 0)}
    >
      <QueryView query={trend} skeleton="h-56">
        {(t) => <TrendChart trend={t} height={220} />}
      </QueryView>
    </Card>
  );
}

/**
 * S-A5 Trends (REQ §6.5): several metrics over time as small multiples (one axis each, never a dual
 * axis), with survey-version change annotations.
 */
export function TrendsPage() {
  const [metrics, setMetrics] = useState<TrendMetric[]>(['csat_pct', 'nps', 'ces_avg']);
  const toggle = (m: TrendMetric) =>
    setMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  return (
    <>
      <PageHeader title="Trends" subtitle="How the experience changes over time, by submission date." />
      <FilterBar granularity />
      <fieldset className="mb-4 flex flex-wrap gap-2">
        <legend className="mb-2 text-[14px] font-medium">Metrics</legend>
        {OPTIONS.map((m) => (
          <label
            key={m}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[14px] ${metrics.includes(m) ? 'border-brand bg-brand-50 text-brand' : 'border-border bg-white'}`}
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-brand)]"
              checked={metrics.includes(m)}
              onChange={() => toggle(m)}
            />
            {METRIC_INFO[m].label}
          </label>
        ))}
      </fieldset>
      {metrics.length === 0 ? (
        <p className="text-secondary">Choose at least one metric.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {metrics.map((m) => (
            <MetricTrend key={m} metric={m} />
          ))}
        </div>
      )}
    </>
  );
}
