import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toUserError } from '../lib/errors';
import { useSession } from '../lib/session';
import { Alert, Badge, Button, EmptyState, Spinner } from '../ui/controls';
import { PageHeader } from './shell';

interface AuditRow {
  id: number;
  occurred_at: string;
  actor_type: 'user' | 'system';
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const PAGE = 50;
const dateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Africa/Accra',
});
const FILTERS = [
  { value: '', label: 'All events' },
  { value: 'auth.', label: 'Sign-in and passwords' },
  { value: 'public.user_role_grants', label: 'Role grants' },
  { value: 'public.profiles', label: 'Accounts' },
  { value: 'public.settings', label: 'Settings' },
];

/** Plain-language summary of what changed between before and after. */
function changes(row: AuditRow): string {
  if (!row.before || !row.after) return '';
  const skip = new Set(['updated_at', 'version']);
  return Object.keys(row.after)
    .filter((k) => !skip.has(k) && JSON.stringify(row.before?.[k]) !== JSON.stringify(row.after?.[k]))
    .map((k) => `${k}: ${JSON.stringify(row.before?.[k])} → ${JSON.stringify(row.after?.[k])}`)
    .join(' · ');
}

/** S-B20 Audit log (M15): append-only, hash-chained; filter, page and verify. */
export function AuditPage() {
  const { supabase, can } = useSession();
  const [prefix, setPrefix] = useState('');
  const log = useInfiniteQuery({
    queryKey: ['audit', prefix],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('audit_log_list', {
        p_before_id: pageParam,
        p_limit: PAGE,
        p_action_prefix: prefix || null,
      });
      if (error) throw error;
      return data as AuditRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? (last[last.length - 1]?.id ?? null) : null),
  });
  const verify = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('audit_verify');
      if (error) throw error;
      return (data as { ok: boolean; checked: number; first_bad_id: number | null }[])[0];
    },
  });

  const rows = log.data?.pages.flat() ?? [];
  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every administrative action, in order. Entries can't be edited or deleted."
        actions={
          <>
            {can('audit.view_all') && (
              <Link
                to="/audit/export"
                className="inline-flex h-12 items-center rounded-full border border-border-strong bg-white px-5 font-medium hover:bg-surface-muted"
              >
                Export CSV
              </Link>
            )}
            <Button variant="secondary" busy={verify.isPending} onClick={() => verify.mutate()}>
              Verify integrity
            </Button>
          </>
        }
      />
      {verify.data && (
        <div className="mb-4">
          {verify.data.ok ? (
            <Alert tone="success">
              Integrity verified: all {verify.data.checked} entries are unchanged and in order.
            </Alert>
          ) : (
            <Alert tone="danger" title="Integrity check failed">
              Entry {verify.data.first_bad_id} doesn’t match the chain. Follow the audit-chain incident
              runbook and tell the auditor.
            </Alert>
          )}
        </div>
      )}
      {verify.isError && (
        <div className="mb-4">
          <Alert tone="danger">{toUserError(verify.error).message}</Alert>
        </div>
      )}
      <section className="rounded-lg bg-white">
        <div
          className="flex flex-wrap gap-2 border-b border-border p-4"
          role="group"
          aria-label="Filter events"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={prefix === f.value}
              onClick={() => setPrefix(f.value)}
              className={`h-10 rounded-full border px-4 text-[14px] ${
                prefix === f.value
                  ? 'border-brand bg-brand-50 font-medium text-brand'
                  : 'border-border hover:bg-surface-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {log.isPending ? (
          <div className="p-4">
            <Spinner label="Loading audit log" />
          </div>
        ) : log.isError ? (
          <div className="p-4">
            <Alert tone="danger">{toUserError(log.error).message}</Alert>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No events match this filter" />
        ) : (
          <>
            <ol className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="grid gap-1 px-4 py-3 md:grid-cols-[180px_1fr]">
                  <time className="text-[14px] tabular-nums text-secondary" dateTime={r.occurred_at}>
                    {dateTime.format(new Date(r.occurred_at))}
                  </time>
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <code className="text-[14px] font-medium">{r.action}</code>
                      <Badge>{r.actor_type === 'system' ? 'system' : r.actor_name || 'a user'}</Badge>
                    </p>
                    {changes(r) && (
                      <p className="mt-1 break-words text-[14px] text-secondary">{changes(r)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {log.hasNextPage && (
              <div className="border-t border-border p-4">
                <Button variant="secondary" busy={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
                  Load older events
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
