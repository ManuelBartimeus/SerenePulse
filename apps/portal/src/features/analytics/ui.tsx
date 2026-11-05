import * as Popover from '@radix-ui/react-popover';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { toUserError } from '../../lib/errors';
import { MEASURES, WORDS } from '../../lib/terms';
import { Alert } from '../../ui/controls';
import type { BreakdownRow, KpiKey, Metric, TrendMetric } from './api';
import { deltaTone, formatChange, formatMetric, formatMetricShort, METRIC_INFO } from './format';

export const BRANCH_SUBTITLE = 'Based on customers who bought their policy at a branch.';

/** A small "?" that opens a one-sentence explanation (click, tap or keyboard). */
export function Explain({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`What does “${label}” mean?`}
        className="inline-grid size-5 shrink-0 place-items-center rounded-full border border-border-strong text-[11px] font-semibold leading-none text-muted hover:border-brand hover:text-brand focus-visible:border-brand focus-visible:text-brand focus-visible:outline-none"
      >
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-50 max-w-[280px] rounded-sm border border-border bg-white px-3 py-2 text-[13px] leading-5 text-ink shadow-float"
        >
          {children}
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A measure's plain label with its explanation behind a "?". */
export function MeasureLabel({ metric, className = '' }: { metric: TrendMetric; className?: string }) {
  const info = METRIC_INFO[metric];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {info.label}
      <Explain label={info.label}>{info.explain}</Explain>
    </span>
  );
}

/**
 * A value for a table cell. When the group has too few responses the value is greyed with an
 * explanation instead of a badge or a count; it is also kept out of rankings by the caller.
 */
export function MetricValue({
  metric,
  value,
  few = false,
  short = true,
}: {
  metric: TrendMetric;
  value: number | null | undefined;
  few?: boolean | undefined;
  short?: boolean;
}) {
  const text = short ? formatMetricShort(metric, value) : formatMetric(metric, value);
  if (value === null || value === undefined) {
    return (
      <span className="text-muted" title={WORDS.noData}>
        {text}
        {short && <span className="sr-only"> {WORDS.noData}</span>}
      </span>
    );
  }
  if (!few) return <>{text}</>;
  return (
    <span className="cursor-help text-muted" title={WORDS.fewResponses}>
      {text}
      <span className="sr-only"> ({WORDS.fewResponses})</span>
    </span>
  );
}

/** A dashboard card. */
export function Card({
  title,
  subtitle,
  children,
  actions,
  className = '',
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border-subtle bg-white p-5 shadow-xs md:p-6 ${className}`}
      aria-label={title}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.01em]">{title}</h2>
          {subtitle && <p className="mt-1 text-[14px] leading-5 text-secondary">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A headline figure tile (shared by KPI cards and simple stats). */
export function StatTile({
  label,
  explain,
  value,
  muted = false,
  mutedTitle,
  footer,
  large = true,
}: {
  label: string;
  explain?: string | undefined;
  value: ReactNode;
  muted?: boolean;
  mutedTitle?: string | undefined;
  footer?: ReactNode;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-white p-5 shadow-xs">
      <p className="flex items-center gap-1.5 text-[14px] font-medium leading-5 text-secondary">
        {label}
        {explain && <Explain label={label}>{explain}</Explain>}
      </p>
      <p
        title={mutedTitle}
        className={`${large ? 'text-[30px] leading-9 tracking-[-0.02em]' : 'text-[20px] leading-7'} font-semibold tabular-nums ${muted ? 'text-muted' : 'text-ink'}`}
      >
        {value}
      </p>
      {footer && <div className="mt-auto text-[13px] leading-5">{footer}</div>}
    </div>
  );
}

/** "▲ 3 points vs previous period", coloured by whether it is an improvement (words carry the meaning). */
export function ChangeLine({
  metric,
  delta,
}: {
  metric: KpiKey | 'responses';
  delta: number | null | undefined;
}) {
  const text = formatChange(metric, delta);
  if (text === null) return null;
  const tone = deltaTone(metric, delta);
  return (
    <p className={tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-secondary'}>
      {text} <span className="text-muted">{WORDS.vsPrevious}</span>
    </p>
  );
}

/** One KPI card: plain label, value, change vs previous period and (branch view) the company average. */
export function KpiCard({ metric, m, company = false }: { metric: KpiKey; m: Metric; company?: boolean }) {
  const info = METRIC_INFO[metric];
  const none = m.value === null;
  return (
    <StatTile
      label={info.label}
      explain={info.explain}
      value={formatMetric(metric, m.value)}
      large={!none}
      muted={none || m.low_sample}
      mutedTitle={!none && m.low_sample ? WORDS.fewResponses : undefined}
      footer={
        !none && (
          <>
            {m.low_sample ? (
              <p className="text-muted">{WORDS.fewResponses}</p>
            ) : (
              <ChangeLine metric={metric} delta={m.delta} />
            )}
            {company && m.benchmark !== null && (
              <p className="text-secondary">
                {WORDS.benchmark}: {formatMetric(metric, m.benchmark)}
              </p>
            )}
          </>
        )
      }
    />
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

export function NoData({ children = WORDS.noData }: { children?: ReactNode }) {
  return <p className="py-10 text-center text-[15px] text-secondary">{children}</p>;
}

export const th = 'px-3 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] text-muted';
export const thNum = `${th} text-right`;
export const td = 'px-3 py-3 text-[14px]';
export const tdNum = `${td} text-right tabular-nums`;

/** The four headline measures shown in comparison tables. */
export const TABLE_MEASURES = ['csat_pct', 'nps', 'ces_avg', 'negative_rate'] as const;

/** Rows with enough responses first (in the given order), then the rest — kept out of the ranking. */
export function reliableFirst<T extends { low_sample?: boolean | undefined }>(rows: T[]): T[] {
  return [...rows.filter((r) => !r.low_sample), ...rows.filter((r) => r.low_sample)];
}

/** Name · the four headline measures · top area to improve, for any breakdown. */
export function MetricsTable({
  rows,
  caption,
  linkTo,
  showFactor = true,
  nameHeader = 'Name',
}: {
  rows: BreakdownRow[];
  caption: string;
  linkTo?: ((row: BreakdownRow) => ReactNode) | undefined;
  showFactor?: boolean;
  nameHeader?: string;
}) {
  const visible = reliableFirst(rows.filter((r) => r.n > 0));
  if (visible.length === 0) return <NoData />;
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={th}>
              {nameHeader}
            </th>
            {TABLE_MEASURES.map((k) => (
              <th key={k} scope="col" className={thNum} title={METRIC_INFO[k].explain}>
                {METRIC_INFO[k].label}
              </th>
            ))}
            {showFactor && (
              <th scope="col" className={th} title={MEASURES.main_factor.explain}>
                {MEASURES.main_factor.label}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.key} className="border-b border-border-subtle last:border-0 hover:bg-subtle">
              <th scope="row" className={`${td} text-left font-medium`}>
                {linkTo ? linkTo(r) : r.label}
              </th>
              {TABLE_MEASURES.map((k) => (
                <td key={k} className={tdNum}>
                  <MetricValue metric={k} value={r[k]} few={r.low_sample} />
                </td>
              ))}
              {showFactor && (
                <td className={`${td} ${r.low_sample ? 'text-muted' : 'text-secondary'}`}>
                  {r.main_factor_label ?? '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A small segmented control (e.g. Day / Week / Month / Quarter). */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (next: K) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-surface-muted p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${value === o.key ? 'bg-white text-ink shadow-xs' : 'text-secondary hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const selectClass =
  'h-10 rounded-full border border-border-strong bg-white px-4 text-[14px] outline-none hover:border-ink focus-visible:border-brand';

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
