import { PageHeader } from '../../pages/shell';
import { Alert } from '../../ui/controls';
import { useCompletionTime, useFunnel, type FunnelCounts } from './api';
import { Chart } from './chart';
import { BRAND, GRID, MUTED } from './chart-palette';
import { FilterBar, useAnalyticsFilters } from './filters';
import { formatCount, formatPct, formatSeconds } from './format';
import { Card, LowSampleBadge, NoData, QueryView } from './ui';

const STEPS: { label: string; value: (f: FunnelCounts) => number }[] = [
  { label: 'Visits (survey opened)', value: (f) => f.visits },
  { label: 'Started (became interactive)', value: (f) => f.started },
  { label: 'Reached page 2', value: (f) => f.reached[1] ?? 0 },
  { label: 'Reached page 3', value: (f) => f.reached[2] ?? 0 },
  { label: 'Reached page 4', value: (f) => f.reached[3] ?? 0 },
  { label: 'Reached page 5', value: (f) => f.reached[4] ?? 0 },
  { label: 'Submitted', value: (f) => f.submitted },
];

function FunnelTable({
  rows,
  caption,
}: {
  rows: (FunnelCounts & { key: string | null; label: string })[];
  caption: string;
}) {
  if (rows.length === 0) return <NoData>No surveys were opened in this period.</NoData>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
            <th scope="col" className="px-2 py-2">
              Where opened
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Visits
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Started
            </th>
            {[2, 3, 4, 5].map((p) => (
              <th key={p} scope="col" className="px-2 py-2 text-right">
                Page {p}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right">
              Submitted
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Completion rate
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Abandoned p1–p5
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Cooldown blocks
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Turnstile failures
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Unverified
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key ?? 'none'} className="border-t border-border">
              <th scope="row" className="px-2 py-2 text-left font-medium">
                {r.label} <LowSampleBadge n={r.started} show={r.low_sample} />
              </th>
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(r.visits)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(r.started)}</td>
              {[1, 2, 3, 4].map((i) => (
                <td key={i} className="px-2 py-2 text-right tabular-nums">
                  {formatCount(r.reached[i] ?? 0)}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(r.submitted)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatPct(r.completion_rate)}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {r.abandoned_by_page.map((a) => formatCount(a)).join(' · ')}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(r.cooldown_blocked)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(r.turnstile_failed)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(r.unverified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** S-A7 Sources & funnel (D-33): where the survey was opened — never branch performance. */
export function SourcesPage() {
  const { rpcFilters, period } = useAnalyticsFilters();
  const funnel = useFunnel(rpcFilters);
  return (
    <>
      <PageHeader
        title="Sources and funnel"
        subtitle="Where the survey was opened (SMS link, direct visit, QR poster). This is not branch performance: a poster’s location never says which branch issued a policy."
      />
      <FilterBar hide={['branch', 'region', 'channel', 'product', 'factor', 'sat', 'nps', 'ver']} />
      <QueryView query={funnel} skeleton="h-72">
        {(f) => (
          <div className="grid gap-6">
            <Alert tone="info">{f.note}</Alert>
            <Card title="Funnel, all sources" period={period} n={f.totals.visits}>
              {f.totals.visits === 0 ? (
                <NoData>No surveys were opened in this period.</NoData>
              ) : (
                <>
                  <Chart
                    kind="bar"
                    height={280}
                    label={`Survey funnel: ${f.totals.visits} visits, ${f.totals.submitted} submitted`}
                    option={{
                      animation: false,
                      grid: { left: 200, right: 64, top: 8, bottom: 8 },
                      tooltip: { trigger: 'item' },
                      xAxis: { type: 'value', show: false },
                      yAxis: {
                        type: 'category',
                        inverse: true,
                        data: STEPS.map((s) => s.label),
                        axisLabel: { color: MUTED, fontSize: 12 },
                        axisLine: { lineStyle: { color: GRID } },
                      },
                      series: [
                        {
                          type: 'bar',
                          barWidth: 18,
                          itemStyle: { color: BRAND, borderRadius: [0, 4, 4, 0] },
                          label: { show: true, position: 'right', color: '#111111' },
                          data: STEPS.map((s) => s.value(f.totals)),
                        },
                      ],
                    }}
                    table={
                      <FunnelTable
                        rows={[{ ...f.totals, key: 'all', label: 'All sources' }]}
                        caption="Funnel totals"
                      />
                    }
                  />
                  <p className="mt-2 text-[14px]">
                    Completion rate (submitted ÷ started surveys):{' '}
                    <strong>{formatPct(f.totals.completion_rate)}</strong> · n ={' '}
                    {formatCount(f.totals.started)} started · {formatCount(f.totals.unverified)} unverified
                    submissions
                  </p>
                </>
              )}
            </Card>
            <Card title="By source" period={period} n={f.totals.visits}>
              <FunnelTable rows={f.by_source} caption="Funnel by source" />
            </Card>
            <Card title="By QR point" period={period} n={f.by_qr_point.reduce((a, r) => a + r.visits, 0)}>
              <FunnelTable
                rows={f.by_qr_point.map((q) => ({
                  ...q,
                  label: `${q.label} (${q.code})${q.is_active ? '' : ' · inactive'}`,
                }))}
                caption="Funnel by QR point"
              />
            </Card>
          </div>
        )}
      </QueryView>
    </>
  );
}

/** S-A9 Survey completion and usability (REQ §12): histogram, % ≤ 60 s, median, P90, back/change rates. */
export function CompletionPage() {
  const { rpcFilters, period } = useAnalyticsFilters();
  const q = useCompletionTime(rpcFilters);
  return (
    <>
      <PageHeader
        title="Completion and usability"
        subtitle="Time from the survey becoming interactive to submission (Rule 18). Target: 90% within 60 s, median 40 s or less."
      />
      <FilterBar />
      <QueryView query={q} skeleton="h-72">
        {(c) => (
          <div className="grid gap-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                {
                  label: 'Within 60 s',
                  value: formatPct(c.pct_le_60),
                  note: `target ≥ ${c.targets.pct_le_60}%`,
                  ok: c.pct_le_60 === null ? null : c.pct_le_60 >= c.targets.pct_le_60,
                },
                {
                  label: 'Median',
                  value: formatSeconds(c.median_s),
                  note: `target ≤ ${c.targets.median_s} s`,
                  ok: c.median_s === null ? null : c.median_s <= c.targets.median_s,
                },
                {
                  label: 'P90',
                  value: formatSeconds(c.p90_s),
                  note: 'nine in ten finish within this',
                  ok: null,
                },
                {
                  label: 'Back navigation',
                  value: formatPct(c.back_navigation_rate),
                  note: `answer changed: ${formatPct(c.answer_change_rate)}`,
                  ok: null,
                },
              ].map((k) => (
                <div key={k.label} className="rounded-lg bg-white p-4">
                  <p className="text-[14px] font-medium text-secondary">{k.label}</p>
                  <p className="text-[32px] font-medium leading-10">{k.value}</p>
                  <p className="text-[12px] text-muted">
                    n = {formatCount(k.label === 'Back navigation' ? c.n_all : c.n)} · {k.note}
                  </p>
                  {k.ok !== null && (
                    <p className={`text-[12px] ${k.ok ? 'text-success' : 'text-danger'}`}>
                      {k.ok ? '✓ Meets target' : '✕ Misses target'}
                    </p>
                  )}
                  <LowSampleBadge n={c.n} show={c.low_sample} />
                </div>
              ))}
            </div>
            <Card title="Completion-time distribution" period={period} n={c.n}>
              {c.n === 0 ? (
                <NoData />
              ) : (
                <Chart
                  kind="bar"
                  label={`Completion time histogram, n = ${c.n}`}
                  option={{
                    animation: false,
                    grid: { left: 48, right: 16, top: 16, bottom: 40 },
                    tooltip: { trigger: 'item' },
                    xAxis: {
                      type: 'category',
                      data: c.histogram.map((h) =>
                        h.to_s === null ? `> ${h.from_s} s` : `${h.from_s}–${h.to_s} s`,
                      ),
                      axisLabel: { color: MUTED, fontSize: 12, rotate: 30 },
                    },
                    yAxis: {
                      type: 'value',
                      axisLabel: { color: MUTED },
                      splitLine: { lineStyle: { color: GRID } },
                    },
                    series: [
                      {
                        type: 'bar',
                        barCategoryGap: '20%',
                        itemStyle: { color: BRAND, borderRadius: [4, 4, 0, 0] },
                        data: c.histogram.map((h) => h.count),
                      },
                    ],
                  }}
                  table={
                    <table className="w-full text-[14px]">
                      <caption className="sr-only">Completion time histogram</caption>
                      <thead>
                        <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                          <th scope="col">Time</th>
                          <th scope="col" className="text-right">
                            Responses
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.histogram.map((h) => (
                          <tr key={h.from_s} className="border-t border-border">
                            <th scope="row" className="py-1 text-left font-normal">
                              {h.to_s === null ? `More than ${h.from_s} s` : `${h.from_s}–${h.to_s} s`}
                            </th>
                            <td className="text-right tabular-nums">{formatCount(h.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                />
              )}
              {c.excluded_no_interactive > 0 && (
                <p className="mt-2 text-[12px] text-muted">
                  {formatCount(c.excluded_no_interactive)} submission(s) without an interactive timestamp are
                  left out of the timings.
                </p>
              )}
            </Card>
          </div>
        )}
      </QueryView>
    </>
  );
}
