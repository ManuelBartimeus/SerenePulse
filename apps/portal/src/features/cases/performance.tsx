import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../pages/shell';
import { EmptyState } from '../../ui/controls';
import { FilterBar, useAnalyticsFilters } from '../analytics/filters';
import { useRpc } from './api';
import { priorityLabel } from './format';
import { Card, ErrorAlert, Loading } from './ui';

interface Metric {
  value: number | null;
  n: number;
}
export interface CaseMetrics {
  period: { from: string; to: string; tz: string };
  created: number;
  resolution_time_days: { mean: number | null; median: number | null; n: number };
  sla_compliance_pct: Metric;
  resolution_rate: Metric;
  escalation_rate: Metric;
  open: number;
  overdue: number;
  repeat_complaints: Metric & { note: string };
  by_status: Record<string, number>;
  by_priority: { priority: string; created: number; resolved: number; sla_compliance_pct: number | null }[];
  resolution_histogram: { label: string; n: number }[];
}

/** "No data" when nothing was measured (Rule 7), never 0. */
export function metricText(v: number | null | undefined, unit = ''): string {
  return v === null || v === undefined
    ? 'No data'
    : `${v.toLocaleString('en-GH', { maximumFractionDigits: 1 })}${unit}`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-white p-4">
      <p className="text-[14px] text-secondary">{label}</p>
      <p className={`mt-1 text-[28px] font-medium leading-9 ${value === 'No data' ? 'text-muted' : ''}`}>
        {value}
      </p>
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/** S-A8 Case performance (REQ §8.5): time to resolve, cases resolved on time, resolution and escalation. */
export function CasePerformancePage() {
  const rpc = useRpc();
  const { rpcFilters, periodText } = useAnalyticsFilters();
  const q = useQuery({
    queryKey: ['cases', 'metrics', rpcFilters],
    queryFn: () => rpc<CaseMetrics>('case_metrics', { p_filters: rpcFilters }),
  });
  const max = Math.max(1, ...(q.data?.resolution_histogram.map((b) => b.n) ?? [1]));
  return (
    <>
      <PageHeader
        title="Case performance"
        subtitle={`Cases opened on feedback received ${periodText}. Times are in working days (Monday to Friday, 8 am to 5 pm, excluding public holidays).`}
      />
      <FilterBar />
      {q.isPending ? (
        <Loading label="Loading case performance" />
      ) : q.isError ? (
        <ErrorAlert error={q.error} retry={() => void q.refetch()} />
      ) : q.data.created === 0 ? (
        <section className="rounded-lg bg-white">
          <EmptyState title="No cases in this period">
            No cases were opened on feedback in this period.
          </EmptyState>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Cases opened" value={metricText(q.data.created)} />
            <Kpi label="Cases resolved on time" value={metricText(q.data.sla_compliance_pct.value, '%')} />
            <Kpi
              label="Average time to resolve (working days)"
              value={metricText(q.data.resolution_time_days.mean)}
            />
            <Kpi label="Escalated cases" value={metricText(q.data.escalation_rate.value, '%')} />
            <Kpi label="Cases resolved" value={metricText(q.data.resolution_rate.value, '%')} />
            <Kpi label="Still open" value={metricText(q.data.open)} />
            <Kpi label="Past deadline now" value={metricText(q.data.overdue)} />
            <Kpi
              label="Repeat complaints"
              value={metricText(q.data.repeat_complaints.value)}
              hint="Customers who complained again"
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Time to resolve">
              <table className="w-full text-[14px]">
                <caption className="sr-only">Resolved cases by working days to resolve</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Working days</th>
                    <th scope="col">Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.resolution_histogram.map((b) => (
                    <tr key={b.label}>
                      <th scope="row" className="w-32 py-1.5 pr-3 text-left font-normal text-secondary">
                        {b.label}
                      </th>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-5 rounded-xs bg-brand"
                            style={{ width: `${(b.n / max) * 100}%`, minWidth: b.n ? 4 : 0 }}
                          />
                          <span>{b.n}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="By priority">
              <table className="w-full text-left text-[14px]">
                <thead className="text-secondary">
                  <tr>
                    <th scope="col" className="py-2 font-medium">
                      Priority
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Opened
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Resolved
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Resolved on time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.by_priority.map((p) => (
                    <tr key={p.priority} className="border-t border-border">
                      <th scope="row" className="py-2 font-medium">
                        {priorityLabel(p.priority)}
                      </th>
                      <td className="py-2">{p.created}</td>
                      <td className="py-2">{p.resolved}</td>
                      <td className="py-2">{metricText(p.sla_compliance_pct, '%')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
