import { useMemo } from 'react';
import type { Trend } from './api';
import { Chart } from './chart';
import { BENCHMARK, BRAND, GRID, INK, MUTED } from './chart-palette';
import { formatDay } from './filters-state';
import { formatCount, formatMetric, METRIC_INFO } from './format';
import { NoData } from './ui';

/**
 * One metric over time (single axis). Low-sample points are hollow and labelled in the table; buckets
 * with no data are gaps, never zero; survey-version changes are marked, with "Not comparable" where
 * the rating scale changed (S-A5).
 */
export function TrendChart({ trend, height = 280 }: { trend: Trend; height?: number }) {
  const info = METRIC_INFO[trend.metric];
  const hasData = trend.points.some((p) => p.value !== null);
  const hasBenchmark = trend.points.some((p) => p.benchmark !== null);
  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: number | null) => formatMetric(trend.metric, v),
      },
      legend: hasBenchmark ? { top: 0, textStyle: { color: INK } } : undefined,
      xAxis: {
        type: 'category',
        data: trend.points.map((p) => formatDay(p.bucket)),
        axisLabel: { color: MUTED, fontSize: 12 },
        axisLine: { lineStyle: { color: GRID } },
      },
      yAxis: {
        type: 'value',
        scale: trend.metric !== 'responses',
        axisLabel: { color: MUTED, fontSize: 12 },
        splitLine: { lineStyle: { color: GRID } },
      },
      series: [
        {
          name: info.label,
          type: 'line',
          connectNulls: false,
          lineStyle: { width: 2, color: BRAND },
          itemStyle: { color: BRAND },
          symbolSize: 8,
          data: trend.points.map((p) => ({
            value: p.value,
            itemStyle: p.low_sample ? { color: '#ffffff', borderColor: BRAND, borderWidth: 2 } : undefined,
          })),
          markLine: trend.annotations.length
            ? {
                symbol: 'none',
                label: { formatter: (d: { name: string }) => d.name, color: INK, fontSize: 12 },
                lineStyle: { color: MUTED, type: 'dashed' },
                data: trend.annotations.map((a) => ({
                  name: a.scale_changed ? `v${a.version_no} · scale changed` : `v${a.version_no}`,
                  xAxis: formatDay(
                    trend.points.find((p) => p.from <= a.date && p.to >= a.date)?.bucket ?? trend.period.from,
                  ),
                })),
              }
            : undefined,
        },
        ...(hasBenchmark
          ? [
              {
                name: 'Company',
                type: 'line',
                connectNulls: false,
                lineStyle: { width: 2, color: BENCHMARK, type: 'dashed' },
                itemStyle: { color: BENCHMARK },
                symbolSize: 8,
                data: trend.points.map((p) => p.benchmark),
              },
            ]
          : []),
      ],
    }),
    [trend, info.label, hasBenchmark],
  );
  if (!hasData) return <NoData />;
  const scaleChange = trend.annotations.find((a) => a.scale_changed);
  return (
    <>
      {scaleChange && (
        <p className="mb-2 text-[14px] text-warning">
          Not comparable across {formatDay(scaleChange.date)}: the survey scale changed with version{' '}
          {scaleChange.version_no}.
        </p>
      )}
      <Chart
        kind="line"
        height={height}
        option={option}
        label={`${info.label} by ${trend.granularity}, ${formatDay(trend.period.from)} to ${formatDay(trend.period.to)}`}
        table={
          <table className="w-full text-[14px]">
            <caption className="sr-only">{info.label} trend</caption>
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                <th scope="col">Period</th>
                <th scope="col" className="text-right">
                  {info.short}
                </th>
                <th scope="col" className="text-right">
                  n
                </th>
                {hasBenchmark && (
                  <th scope="col" className="text-right">
                    Company
                  </th>
                )}
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {trend.points.map((p) => (
                <tr key={p.bucket} className="border-t border-border">
                  <th scope="row" className="py-1 text-left font-normal">
                    {formatDay(p.from)} – {formatDay(p.to)}
                  </th>
                  <td className="text-right tabular-nums">{formatMetric(trend.metric, p.value)}</td>
                  <td className="text-right tabular-nums">{formatCount(p.n)}</td>
                  {hasBenchmark && (
                    <td className="text-right tabular-nums">{formatMetric(trend.metric, p.benchmark)}</td>
                  )}
                  <td className="text-secondary">
                    {p.mixed_scales ? 'Different scales; not combined' : p.low_sample ? 'Low sample' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </>
  );
}
