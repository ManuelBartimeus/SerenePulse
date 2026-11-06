// S-B21 Operations (M17): free-tier usage against thresholds, job runs (backup, retention, roll-ups),
// scheduled jobs and health. Figures are measured, never sample values (Rule 14).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, EmptyState, Spinner } from '../../ui/controls';
import { formatBytes, formatDateTime } from './format';
import { ErrorBox } from './ui';

interface JobRun {
  id: number;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'succeeded' | 'failed';
  detail: Record<string, unknown> | null;
}
interface Overview {
  checked_at: string;
  thresholds: { db_bytes: number; storage_bytes: number; warn_ratio: number; emails_per_day: number | null };
  current: { db_bytes: number; storage_bytes: number; emails_today: number };
  snapshots: { taken_at: string; db_bytes: number; storage_bytes: number }[];
  latest_jobs: JobRun[];
  recent_runs: JobRun[];
  cron: {
    name: string;
    schedule: string;
    active: boolean;
    last_status: string | null;
    last_start: string | null;
    last_message: string | null;
  }[];
}

function Meter({
  label,
  used,
  limit,
  warn,
  unit,
}: {
  label: string;
  used: number;
  limit: number | null;
  warn: number;
  unit: 'bytes' | 'count';
}) {
  const ratio = limit ? used / limit : 0;
  const tone = ratio >= 1 ? 'bg-danger' : ratio >= warn ? 'bg-warning' : 'bg-brand';
  const fmt = (n: number) => (unit === 'bytes' ? formatBytes(n) : n.toLocaleString('en-GH'));
  return (
    <div className="rounded-lg bg-white p-4">
      <p className="text-[14px] text-secondary">{label}</p>
      <p className="mt-1 text-[24px] font-medium tabular-nums">
        {fmt(used)}{' '}
        <span className="text-[14px] font-normal text-secondary">
          of {limit ? fmt(limit) : 'no limit set'}
        </span>
      </p>
      {limit ? (
        <>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted"
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={used}
            aria-valuetext={`${Math.round(ratio * 100)}% used`}
          >
            <div className={`h-full ${tone}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
          </div>
          <p className="mt-1 text-[14px] text-secondary">
            {Math.round(ratio * 100)}% used
            {ratio >= warn ? ' · above the 80% warning level: plan an upgrade or clean-up' : ''}
          </p>
        </>
      ) : null}
    </div>
  );
}

const statusTone = (s: string | null): 'success' | 'danger' | 'info' | 'neutral' =>
  s === 'succeeded' ? 'success' : s === 'failed' ? 'danger' : s === 'running' ? 'info' : 'neutral';

export function OpsPage() {
  const { supabase, can } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['reports', 'ops'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ops_overview');
      if (error) throw error;
      return data as Overview;
    },
  });
  const snap = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('ops_record_quota_snapshot');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', 'ops'] }),
  });

  return (
    <>
      <PageHeader
        title="System status"
        subtitle="Free-tier usage, background jobs and health. Refreshes every minute."
        actions={
          can('settings.manage') ? (
            <Button variant="secondary" busy={snap.isPending} onClick={() => snap.mutate()}>
              Record usage now
            </Button>
          ) : undefined
        }
      />
      <div aria-live="polite" className="mb-4">
        {snap.isError && <ErrorBox error={snap.error} />}
      </div>
      {q.isPending ? (
        <Spinner label="Loading operations data" />
      ) : q.isError ? (
        <ErrorBox error={q.error} />
      ) : (
        <>
          <Alert tone="success">Database reachable · checked {formatDateTime(q.data.checked_at)}</Alert>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Meter
              label="Database size"
              used={q.data.current.db_bytes}
              limit={q.data.thresholds.db_bytes}
              warn={q.data.thresholds.warn_ratio}
              unit="bytes"
            />
            <Meter
              label="File storage"
              used={q.data.current.storage_bytes}
              limit={q.data.thresholds.storage_bytes}
              warn={q.data.thresholds.warn_ratio}
              unit="bytes"
            />
            <Meter
              label="Emails sent today"
              used={q.data.current.emails_today}
              limit={q.data.thresholds.emails_per_day}
              warn={q.data.thresholds.warn_ratio}
              unit="count"
            />
          </div>

          <section className="mt-6 rounded-lg bg-white" aria-labelledby="jobs">
            <h2 id="jobs" className="border-b border-border p-4 text-[18px] font-medium">
              Latest run of each job
            </h2>
            {q.data.latest_jobs.length === 0 ? (
              <EmptyState title="No job runs recorded yet">
                Backups, retention and roll-ups record their runs here.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {q.data.latest_jobs.map((j) => (
                  <li key={j.id} className="grid gap-1 px-4 py-3 md:grid-cols-[220px_120px_1fr]">
                    <code className="text-[14px] font-medium">{j.job}</code>
                    <span>
                      <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                    </span>
                    <span className="break-words text-[14px] text-secondary">
                      {formatDateTime(j.started_at)}
                      {j.detail ? ` · ${JSON.stringify(j.detail).slice(0, 240)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!q.data.latest_jobs.some((j) => j.job.startsWith('backup')) && (
              <div className="p-4">
                <Alert tone="warning">No backup run has been recorded. Check the backup workflow.</Alert>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-lg bg-white" aria-labelledby="cron">
            <h2 id="cron" className="border-b border-border p-4 text-[18px] font-medium">
              Scheduled jobs (UTC = Africa/Accra)
            </h2>
            <ul className="divide-y divide-border">
              {q.data.cron.map((c) => (
                <li key={c.name} className="grid gap-1 px-4 py-3 md:grid-cols-[220px_140px_120px_1fr]">
                  <code className="text-[14px] font-medium">{c.name}</code>
                  <code className="text-[14px] text-secondary">{c.schedule}</code>
                  <span>
                    {!c.active ? (
                      <Badge>Paused</Badge>
                    ) : (
                      <Badge tone={statusTone(c.last_status)}>{c.last_status ?? 'not run yet'}</Badge>
                    )}
                  </span>
                  <span className="break-words text-[14px] text-secondary">
                    {c.last_start ? formatDateTime(c.last_start) : ''}
                    {c.last_status === 'failed' && c.last_message ? ` · ${c.last_message}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 rounded-lg bg-white" aria-labelledby="snapshots">
            <h2 id="snapshots" className="border-b border-border p-4 text-[18px] font-medium">
              Daily usage snapshots
            </h2>
            {q.data.snapshots.length === 0 ? (
              <EmptyState title="No snapshots yet">A snapshot is taken every night at 00:15.</EmptyState>
            ) : (
              <table className="w-full text-left text-[14px]">
                <thead className="text-secondary">
                  <tr>
                    <th className="px-4 py-2 font-medium">Taken</th>
                    <th className="px-4 py-2 font-medium">Database</th>
                    <th className="px-4 py-2 font-medium">Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {q.data.snapshots.map((s) => (
                    <tr key={s.taken_at}>
                      <td className="px-4 py-2">{formatDateTime(s.taken_at)}</td>
                      <td className="px-4 py-2">{formatBytes(s.db_bytes)}</td>
                      <td className="px-4 py-2">{formatBytes(s.storage_bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
