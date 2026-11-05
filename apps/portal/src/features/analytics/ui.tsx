import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { toUserError } from '../../lib/errors';
import { Alert, Badge } from '../../ui/controls';
import type { BreakdownRow, KpiKey, Metric, Target } from './api';
import { periodLabel } from './filters-state';
import { deltaTone, formatCount, formatDelta, formatMetric } from './format';

export const BRANCH_SUBTITLE = 'Based on customers who obtained their policy by walking into a branch.';

/** A dashboard card: title, period and n always visible (REQ §6.1). */
export function Card({
  title,
  period,
  n,
  children,
  actions,
  className = '',
}: {
  title: string;
  period?: { from: string; to: string } | undefined;
  n?: number | undefined;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg bg-white p-4 md:p-6 ${className}`} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-medium leading-6">{title}</h2>
          {(period || n !== undefined) && (
            <p className="text-[12px] leading-4 text-muted">
              {period && periodLabel(period)}
              {period && n !== undefined && ' · '}
              {n !== undefined && `n = ${formatCount(n)}`}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function LowSampleBadge({ n, show }: { n: number; show: boolean }) {
  if (!show) return null;
  return <Badge tone="warning">Low sample (n = {formatCount(n)})</Badge>;
}

export function TargetBadge({ target }: { target: Target | null | undefined }) {
  if (!target) return <span className="text-[12px] text-muted">No target</span>;
  if (target.status === null) return <span className="text-[12px] text-muted">Target {target.value}</span>;
  return target.status === 'met' ? (
    <Badge tone="success">✓ Target met ({target.value})</Badge>
  ) : (
    <Badge tone="danger">✕ Below target ({target.value})</Badge>
  );
}

/** One KPI card: value, n, delta vs previous period, benchmark, target, low-sample badge. */
export function KpiCard({
  metric,
  label,
  m,
  hint,
}: {
  metric: KpiKey;
  label: string;
  m: Metric;
  hint?: ReactNode;
}) {
  const tone = deltaTone(metric, m.delta);
  return (
    <div className={`flex flex-col gap-1 rounded-lg bg-white p-4 ${m.low_sample ? 'opacity-90' : ''}`}>
      <p className="text-[14px] font-medium text-secondary">{label}</p>
      <p className={`text-[32px] font-medium leading-10 ${m.value === null ? 'text-muted' : ''}`}>
        {formatMetric(metric, m.value)}
      </p>
      <p className="text-[12px] text-muted">n = {formatCount(m.n)}</p>
      {m.value !== null && (
        <p
          className={`text-[12px] ${tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-secondary'}`}
        >
          {formatDelta(metric, m.delta)} vs previous period
        </p>
      )}
      {m.benchmark !== null && m.value !== null && (
        <p className="text-[12px] text-secondary">Company {formatMetric(metric, m.benchmark)}</p>
      )}
      <div className="flex flex-wrap gap-1">
        <TargetBadge target={m.target} />
        <LowSampleBadge n={m.n} show={m.low_sample} />
      </div>
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className = 'h-40' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-surface-muted motion-reduce:animate-none ${className}`}
    />
  );
}

/** Loading (skeleton), error and content states for a query. */
export function QueryView<T>({
  query,
  skeleton = 'h-40',
  children,
}: {
  query: UseQueryResult<T>;
  skeleton?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading">
        <Skeleton className={skeleton} />
      </div>
    );
  }
  if (query.isError) {
    const e = toUserError(query.error);
    return (
      <Alert tone="danger" detail={e.detail}>
        {e.message}
      </Alert>
    );
  }
  return <>{children(query.data)}</>;
}

export function NoData({
  children = 'No feedback matches these filters for this period.',
}: {
  children?: ReactNode;
}) {
  return <p className="py-8 text-center text-secondary">{children}</p>;
}

const th =
  'sticky top-0 bg-white px-3 py-2 text-left text-[12px] font-medium uppercase tracking-[1px] text-muted';
const thNum = `${th} text-right`;
const td = 'px-3 py-3 text-[14px]';
const tdNum = `${td} text-right tabular-nums`;

/** n · CSAT · Avg · NPS · CES · Negative · main factor · target · low-sample, for any breakdown. */
export function MetricsTable({
  rows,
  caption,
  linkTo,
  showTarget = false,
  showFactor = true,
}: {
  rows: BreakdownRow[];
  caption: string;
  linkTo?: ((row: BreakdownRow) => ReactNode) | undefined;
  showTarget?: boolean;
  showFactor?: boolean;
}) {
  if (rows.length === 0) return <NoData />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={th}>
              Name
            </th>
            <th scope="col" className={thNum}>
              n
            </th>
            <th scope="col" className={thNum}>
              CSAT %
            </th>
            <th scope="col" className={thNum}>
              Avg CSAT
            </th>
            <th scope="col" className={thNum}>
              NPS
            </th>
            <th scope="col" className={thNum}>
              Avg CES
            </th>
            <th scope="col" className={thNum}>
              Negative
            </th>
            {showFactor && (
              <th scope="col" className={th}>
                Main factor
              </th>
            )}
            {showTarget && (
              <th scope="col" className={th}>
                vs target (CSAT %)
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className={`border-b border-border hover:bg-surface-muted ${r.low_sample ? 'text-secondary' : ''}`}
            >
              <th scope="row" className={`${td} text-left font-medium`}>
                {linkTo ? linkTo(r) : r.label} <LowSampleBadge n={r.n} show={r.low_sample} />
              </th>
              <td className={tdNum}>{formatCount(r.n)}</td>
              <td className={tdNum}>{formatMetric('csat_pct', r.csat_pct)}</td>
              <td className={tdNum}>{formatMetric('csat_avg', r.csat_avg)}</td>
              <td className={tdNum}>{formatMetric('nps', r.nps)}</td>
              <td className={tdNum}>{formatMetric('ces_avg', r.ces_avg)}</td>
              <td className={tdNum}>{formatMetric('negative_rate', r.negative_rate)}</td>
              {showFactor && <td className={td}>{r.main_factor_label ?? '—'}</td>}
              {showTarget && (
                <td className={td}>
                  <TargetBadge target={r.target} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UnverifiedNote({ count, included }: { count: number; included: boolean }) {
  if (included) return <p className="text-[12px] text-muted">Unverified submissions are included.</p>;
  if (count === 0) return null;
  return (
    <p className="text-[12px] text-muted">
      {formatCount(count)} unverified submission{count === 1 ? '' : 's'} excluded (A-135).
    </p>
  );
}

/** A link that keeps the current filters (they live in the search params). */
export function FilterLink({
  to,
  extraSearch,
  children,
}: {
  to: string;
  extraSearch?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      search={((prev: Record<string, unknown>) => ({ ...prev, ...extraSearch })) as never}
      className="font-medium text-brand hover:underline"
    >
      {children}
    </Link>
  );
}
