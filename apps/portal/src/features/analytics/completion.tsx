import { useMemo } from 'react';
import { MEASURES, WORDS } from '../../lib/terms';
import { PageHeader } from '../../pages/shell';
import { useCompletionTime, useFunnel, type FunnelCounts } from './api';
import { Chart } from './chart';
import { BRAND, GRID, MUTED } from './chart-palette';
import { FilterBar, useAnalyticsFilters } from './filters';
import { formatCount, formatDuration, formatPct } from './format';
import { Card, NoData, QueryView, StatTile } from './ui';

const share = (part: number, whole: number) => (whole > 0 ? (part * 100) / whole : null);

/** Started → each question page → finished, as labelled bars (share of those who started). */
function Progress({ f }: { f: FunnelCounts }) {
  const pages = f.reached.length;
  const steps = [
    { label: 'Started the survey', value: f.started },
    ...f.reached.slice(1).map((v, i) => ({ label: `Reached question page ${i + 2}`, value: v })),
    { label: 'Finished', value: f.submitted },
  ];
  return (
    <ol className="grid gap-4" aria-label={`Progress through the survey's ${pages} question pages`}>
      {steps.map((s) => {
        const pct = share(s.value, f.started) ?? 0;
        return (
          <li key={s.label} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span>{s.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{formatPct(pct)}</span>{' '}
                <span className="text-muted">· {formatCount(s.value)}</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
              <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** How many customers left the survey on each question page. */
function Stopped({ f }: { f: FunnelCounts }) {
  const total = f.abandoned_by_page.reduce((a, b) => a + b, 0);
  if (total === 0) return <NoData>Everyone who started finished the survey.</NoData>;
  const most = Math.max(...f.abandoned_by_page);
  return (
    <ul className="grid gap-3">
      {f.abandoned_by_page.map((n, i) => (
        <li key={i} className="flex items-center justify-between gap-3 text-[14px]">
          <span className={n === most && n > 0 ? 'font-semibold' : ''}>Question page {i + 1}</span>
          <span className="tabular-nums">
            {formatCount(n)}{' '}
            <span className="text-muted">({formatPct(share(n, f.started))} of those who started)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Survey completion: started → finished, where customers stopped, and how long it takes. */
export function CompletionPage() {
  const { period } = useAnalyticsFilters();
  // Only the period applies here: opening and leaving a survey happen before any answer is known.
  const f = useMemo(() => ({ from: period.from, to: period.to }), [period.from, period.to]);
  const funnel = useFunnel(f);
  const time = useCompletionTime(f);
  return (
    <>
      <PageHeader
        title={MEASURES.completion_rate.label}
        subtitle="How many customers finish the survey once they start it, where others stop, and how long it takes."
      />
      <FilterBar periodOnly />
      <QueryView query={funnel} skeleton="h-72">
        {({ totals: t }) => (
          <div className="grid gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile
                label={MEASURES.completion_rate.label}
                explain={MEASURES.completion_rate.explain}
                value={t.started === 0 ? WORDS.noData : formatPct(t.completion_rate)}
                large={t.started > 0}
                muted={t.started === 0 || t.low_sample}
                mutedTitle={t.started > 0 && t.low_sample ? WORDS.fewResponses : undefined}
              />
              <StatTile
                label="Started"
                value={formatCount(t.started)}
                explain="Customers who began answering."
              />
              <StatTile
                label="Finished"
                value={formatCount(t.submitted)}
                explain="Customers who sent the survey."
              />
            </div>
            {t.started === 0 ? (
              <Card title="Progress through the survey">
                <NoData>No one started the survey in this period.</NoData>
              </Card>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Progress through the survey" subtitle="Share of customers who started.">
                  <Progress f={t} />
                </Card>
                <Card title="Where customers stopped">
                  <Stopped f={t} />
                </Card>
              </div>
            )}
          </div>
        )}
      </QueryView>
      <div className="mt-6">
        <QueryView query={time} skeleton="h-72">
          {(c) => (
            <Card title={MEASURES.completion_time.label} subtitle={MEASURES.completion_time.explain}>
              {c.n === 0 ? (
                <NoData />
              ) : (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatTile
                      label="Typical time"
                      explain="Half of customers finish faster than this."
                      value={formatDuration(c.median_s)}
                      muted={c.low_sample}
                      mutedTitle={c.low_sample ? WORDS.fewResponses : undefined}
                    />
                    <StatTile
                      label="Finished within a minute"
                      explain="Share of customers who completed the survey in 60 seconds or less."
                      value={formatPct(c.pct_le_60)}
                      muted={c.low_sample}
                      mutedTitle={c.low_sample ? WORDS.fewResponses : undefined}
                    />
                    <StatTile
                      label="Nine in ten finish within"
                      value={formatDuration(c.p90_s)}
                      muted={c.low_sample}
                      mutedTitle={c.low_sample ? WORDS.fewResponses : undefined}
                    />
                  </div>
                  <Chart
                    kind="bar"
                    label="How long customers took to finish the survey"
                    height={240}
                    option={{
                      animation: false,
                      grid: { left: 40, right: 8, top: 8, bottom: 32 },
                      tooltip: { trigger: 'item' },
                      xAxis: {
                        type: 'category',
                        data: c.histogram.map((h) =>
                          h.to_s === null ? `Over ${h.from_s}s` : `${h.from_s}–${h.to_s}s`,
                        ),
                        axisLabel: { color: MUTED, fontSize: 12 },
                        axisTick: { show: false },
                        axisLine: { lineStyle: { color: GRID } },
                      },
                      yAxis: {
                        type: 'value',
                        minInterval: 1,
                        axisLabel: { color: MUTED },
                        splitLine: { lineStyle: { color: GRID } },
                      },
                      series: [
                        {
                          type: 'bar',
                          name: 'Customers',
                          barCategoryGap: '25%',
                          itemStyle: { color: BRAND, borderRadius: [4, 4, 0, 0] },
                          data: c.histogram.map((h) => h.count),
                        },
                      ],
                    }}
                    table={
                      <table className="w-full text-[14px]">
                        <caption className="sr-only">How long customers took</caption>
                        <thead>
                          <tr className="text-left text-[12px] text-muted">
                            <th scope="col" className="py-1 font-medium">
                              Time taken
                            </th>
                            <th scope="col" className="py-1 text-right font-medium">
                              Customers
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.histogram.map((h) => (
                            <tr key={h.from_s} className="border-t border-border-subtle">
                              <th scope="row" className="py-1.5 text-left font-normal">
                                {h.to_s === null
                                  ? `More than ${h.from_s} seconds`
                                  : `${h.from_s}–${h.to_s} seconds`}
                              </th>
                              <td className="text-right tabular-nums">{formatCount(h.count)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    }
                  />
                </>
              )}
            </Card>
          )}
        </QueryView>
      </div>
    </>
  );
}
