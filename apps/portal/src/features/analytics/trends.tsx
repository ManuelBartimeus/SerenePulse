import { useState } from 'react';
import { PageHeader } from '../../pages/shell';
import { useTrend, type TrendMetric } from './api';
import { FilterBar, GranularityControl, useAnalyticsFilters } from './filters';
import { MEASURE_OPTIONS, METRIC_INFO } from './format';
import { TrendChart } from './trend-chart';
import { Card, QueryView } from './ui';

function MetricTrend({ metric }: { metric: TrendMetric }) {
  const { rpcFilters, filters } = useAnalyticsFilters();
  const trend = useTrend(metric, filters.granularity, rpcFilters);
  return (
    <Card title={METRIC_INFO[metric].label} subtitle={METRIC_INFO[metric].explain}>
      <QueryView query={trend} skeleton="h-56">
        {(t) => <TrendChart trend={t} height={220} />}
      </QueryView>
    </Card>
  );
}

/** Trends (REQ §6.5): several measures over time as small multiples (one axis each, never a dual axis). */
export function TrendsPage() {
  const [metrics, setMetrics] = useState<TrendMetric[]>(['csat_pct', 'nps', 'ces_avg']);
  const toggle = (m: TrendMetric) =>
    setMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  return (
    <>
      <PageHeader title="Trends" subtitle="How customer experience changes over time." />
      <FilterBar />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Measures to show</legend>
          {MEASURE_OPTIONS.map((m) => (
            <label
              key={m}
              className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors has-[:focus-visible]:border-brand ${metrics.includes(m) ? 'border-brand bg-brand-50 text-brand' : 'border-border-strong bg-white text-secondary hover:text-ink'}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={metrics.includes(m)}
                onChange={() => toggle(m)}
              />
              {METRIC_INFO[m].label}
            </label>
          ))}
        </fieldset>
        <GranularityControl />
      </div>
      {metrics.length === 0 ? (
        <p className="text-secondary">Choose at least one measure.</p>
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
