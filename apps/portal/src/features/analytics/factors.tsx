import { useMemo, useState } from 'react';
import { WORDS } from '../../lib/terms';
import { PageHeader } from '../../pages/shell';
import { useBreakdown, useDistribution, useTrend, type Dimension } from './api';
import { Chart } from './chart';
import { BRAND, GRID, MUTED } from './chart-palette';
import { useCatalogues } from './catalogues';
import { FilterBar, GranularityControl, useAnalyticsFilters } from './filters';
import { formatDay, formatShortDay } from './filters-state';
import { formatPct } from './format';
import { Card, NoData, QueryView, reliableFirst, selectClass, td, tdNum, th, thNum } from './ui';

export const FACTORS_SUBTITLE = 'What customers said we could do better.';

/** What customers mentioned (incl. "Nothing, I am satisfied" and "Not answered"), as a labelled bar chart. */
export function FactorDistribution({ filters }: { filters: Record<string, unknown> }) {
  const q = useDistribution('factor', filters as never);
  return (
    <QueryView query={q} skeleton="h-56">
      {(d) => {
        if (d.n === 0) return <NoData />;
        const buckets = d.buckets.filter((b) => b.count > 0 || !b.is_none);
        return (
          <Chart
            kind="bar"
            height={Math.max(160, buckets.length * 40)}
            label={WORDS.factors}
            option={{
              animation: false,
              grid: { left: 190, right: 56, top: 4, bottom: 4 },
              tooltip: { trigger: 'item', valueFormatter: (v: number) => formatPct(v) },
              xAxis: { type: 'value', show: false, max: 100 },
              yAxis: {
                type: 'category',
                inverse: true,
                data: buckets.map((b) => b.label),
                axisLabel: { color: MUTED, fontSize: 13, width: 180, overflow: 'truncate' },
                axisLine: { show: false },
                axisTick: { show: false },
              },
              series: [
                {
                  type: 'bar',
                  barWidth: 14,
                  showBackground: true,
                  backgroundStyle: { color: GRID, borderRadius: 7 },
                  itemStyle: { color: BRAND, borderRadius: 7 },
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
                <caption className="sr-only">{WORDS.factors}</caption>
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th scope="col" className="py-1 font-medium">
                      {WORDS.factor}
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Share of customers
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.key} className="border-t border-border-subtle">
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {b.label}
                      </th>
                      <td className="text-right tabular-nums">{formatPct(b.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        );
      }}
    </QueryView>
  );
}

function CrossTab({ dimension, title }: { dimension: Dimension; title: string }) {
  const { rpcFilters } = useAnalyticsFilters();
  const rows = useBreakdown(dimension, rpcFilters);
  const catalogues = useCatalogues();
  const factors = (catalogues.data?.factors ?? []).filter((f) => !f.inactive);
  return (
    <Card title={title} subtitle="Share of customers mentioning each area.">
      <QueryView query={rows}>
        {(data) => {
          const visible = reliableFirst(data.filter((r) => r.n > 0));
          return visible.length === 0 ? (
            <NoData />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <caption className="sr-only">{title}: share of customers mentioning each area</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className={th}>
                      Name
                    </th>
                    {factors.map((f) => (
                      <th key={f.id} scope="col" className={thNum}>
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.key} className="border-b border-border-subtle last:border-0">
                      <th scope="row" className={`${td} text-left font-medium`}>
                        {r.label}
                      </th>
                      {factors.map((f) => (
                        <td
                          key={f.id}
                          className={`${tdNum} ${r.low_sample ? 'cursor-help text-muted' : ''}`}
                          title={r.low_sample ? WORDS.fewResponses : undefined}
                        >
                          {formatPct(((r.factor_counts[f.code ?? ''] ?? 0) * 100) / r.n)}
                          {r.low_sample && <span className="sr-only"> ({WORDS.fewResponses})</span>}
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

function FactorTrend() {
  const { rpcFilters, filters } = useAnalyticsFilters();
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
      return { bucket: p.bucket, from: p.from, to: p.to, share: p.n > 0 ? (k * 100) / p.n : null };
    });
  }, [all.data, only.data]);
  const label = options.find((o) => o.id === selected)?.label ?? WORDS.factor.toLowerCase();
  return (
    <Card
      title="Over time"
      subtitle={`Share of customers mentioning “${label}”.`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="factor-trend">
            {WORDS.factor}
          </label>
          <select
            id="factor-trend"
            className={selectClass}
            value={selected}
            onChange={(e) => setFactor(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <GranularityControl />
        </div>
      }
    >
      <QueryView query={only} skeleton="h-64">
        {() =>
          points.every((p) => p.share === null) ? (
            <NoData />
          ) : (
            <Chart
              kind="line"
              label={`Share mentioning ${label} by ${filters.granularity}`}
              option={{
                animation: false,
                grid: { left: 48, right: 16, top: 16, bottom: 32 },
                tooltip: { trigger: 'axis', valueFormatter: (v: number | null) => formatPct(v) },
                xAxis: {
                  type: 'category',
                  data: points.map((p) => formatShortDay(p.bucket)),
                  axisLabel: { color: MUTED },
                  axisTick: { show: false },
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
                    symbolSize: 7,
                    lineStyle: { width: 2.5, color: BRAND },
                    itemStyle: { color: BRAND },
                    data: points.map((p) => p.share),
                  },
                ],
              }}
              table={
                <table className="w-full text-[14px]">
                  <caption className="sr-only">Share mentioning {label}</caption>
                  <thead>
                    <tr className="text-left text-[12px] text-muted">
                      <th scope="col" className="py-1 font-medium">
                        Period
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Share of customers
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p) => (
                      <tr key={p.bucket} className="border-t border-border-subtle">
                        <th scope="row" className="py-1.5 text-left font-normal">
                          {formatDay(p.from)} – {formatDay(p.to)}
                        </th>
                        <td className="text-right tabular-nums">{formatPct(p.share)}</td>
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

/** Areas to improve: what customers mentioned, over time, and by channel / product / branch. */
export function FactorsPage() {
  const { rpcFilters } = useAnalyticsFilters();
  return (
    <>
      <PageHeader title={WORDS.factors} subtitle={FACTORS_SUBTITLE} />
      <FilterBar />
      <div className="grid gap-6">
        <Card title="What customers mentioned">
          <FactorDistribution filters={rpcFilters} />
        </Card>
        <FactorTrend />
        <CrossTab dimension="channel" title="By channel" />
        <CrossTab dimension="product" title="By product" />
        <CrossTab dimension="branch" title="By branch" />
      </div>
    </>
  );
}
