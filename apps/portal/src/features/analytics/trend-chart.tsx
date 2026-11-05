import { useMemo } from 'react';
import { WORDS } from '../../lib/terms';
import type { Trend } from './api';
import { Chart } from './chart';
import { BENCHMARK, BRAND, GRID, INK, MUTED } from './chart-palette';
import { formatDay, formatShortDay } from './filters-state';
import { formatMetric, formatMetricShort, METRIC_INFO } from './format';
import { NoData } from './ui';

/**
 * One measure over time (single axis). Points with too few responses are hollow; periods with no
 * responses are gaps, never zero. Where the rating questions changed, a plain note says the figures
 * either side aren't directly comparable.
 */
export function TrendChart({ trend, height = 280 }: { trend: Trend; height?: number }) {
  const info = METRIC_INFO[trend.metric];
  const hasData = trend.points.some((p) => p.value !== null);
  const hasCompany = trend.points.some((p) => p.benchmark !== null);
  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 48, right: 16, top: hasCompany ? 36 : 16, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: number | null) => formatMetric(trend.metric, v),
      },
      legend: hasCompany
        ? { top: 0, left: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 4, textStyle: { color: INK } }
        : undefined,
      xAxis: {
        type: 'category',
        data: trend.points.map((p) => formatShortDay(p.bucket)),
        axisLabel: { color: MUTED, fontSize: 12 },
        axisLine: { lineStyle: { color: GRID } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: trend.metric !== 'responses',
        axisLabel: {
          color: MUTED,
          fontSize: 12,
          formatter: (v: number) => formatMetricShort(trend.metric, v),
        },
        splitLine: { lineStyle: { color: GRID } },
      },
      series: [
        {
          name: info.label,
          type: 'line',
          connectNulls: false,
          smooth: false,
          lineStyle: { width: 2.5, color: BRAND },
          itemStyle: { color: BRAND },
          symbolSize: 7,
          data: trend.points.map((p) => ({
            value: p.value,
            itemStyle: p.low_sample ? { color: '#ffffff', borderColor: BRAND, borderWidth: 2 } : undefined,
          })),
        },
        ...(hasCompany
          ? [
              {
                name: WORDS.benchmark,
                type: 'line',
                connectNulls: false,
                lineStyle: { width: 2, color: BENCHMARK, type: 'dashed' },
                itemStyle: { color: BENCHMARK },
                symbolSize: 6,
                data: trend.points.map((p) => p.benchmark),
              },
            ]
          : []),
      ],
    }),
    [trend, info.label, hasCompany],
  );
  if (!hasData) return <NoData />;
  const questionsChanged = trend.annotations.find((a) => a.scale_changed);
  return (
    <>
      {questionsChanged && (
        <p className="mb-3 text-[13px] text-secondary">
          The rating questions changed on {formatDay(questionsChanged.date)}, so figures before and after that
          date aren’t directly comparable.
        </p>
      )}
      <Chart
        kind="line"
        height={height}
        option={option}
        label={`${info.label} by ${trend.granularity}, ${formatDay(trend.period.from)} to ${formatDay(trend.period.to)}`}
        table={
          <table className="w-full text-[14px]">
            <caption className="sr-only">{info.label} over time</caption>
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th scope="col" className="py-1 font-medium">
                  Period
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {info.label}
                </th>
                {hasCompany && (
                  <th scope="col" className="py-1 text-right font-medium">
                    {WORDS.benchmark}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {trend.points.map((p) => (
                <tr key={p.bucket} className="border-t border-border-subtle">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {formatDay(p.from)} – {formatDay(p.to)}
                  </th>
                  <td
                    className={`text-right tabular-nums ${p.low_sample || p.mixed_scales ? 'text-muted' : ''}`}
                    title={p.low_sample ? WORDS.fewResponses : undefined}
                  >
                    {p.mixed_scales ? '—' : formatMetric(trend.metric, p.value)}
                    {p.low_sample && p.value !== null && (
                      <span className="sr-only"> ({WORDS.fewResponses})</span>
                    )}
                  </td>
                  {hasCompany && (
                    <td className="text-right tabular-nums">{formatMetric(trend.metric, p.benchmark)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </>
  );
}
