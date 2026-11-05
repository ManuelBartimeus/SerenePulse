import * as Switch from '@radix-ui/react-switch';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toUserError } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Button, EmptyState } from '../../ui/controls';
import { formatDateTime, timeAgo } from './format';
import { Card, ErrorAlert, Loading } from './ui';

/** Plain wording for notification types whose stored names use jargon. */
const PLAIN_TYPES: Record<string, { label: string; description: string }> = {
  'case.created': {
    label: 'New case in the team queue',
    description: 'A case was opened automatically, from flagged feedback, or by a staff member.',
  },
  'case.sla_warning': {
    label: 'Case deadline approaching',
    description: 'A case has used three-quarters of the time allowed to resolve it.',
  },
  'case.sla_breached': { label: 'Case past its deadline', description: 'A case was not resolved in time.' },
};

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}
const PAGE = 30;

/** S-B22 Notification centre: list with deep links, mark read. */
export function NotificationsPage() {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list', unreadOnly],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let req = supabase
        .from('notifications')
        .select('id, type, title, body, link, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(PAGE);
      if (unreadOnly) req = req.is('read_at', null);
      if (pageParam) req = req.lt('created_at', pageParam);
      const { data, error } = await req;
      if (error) throw error;
      return data as NotificationRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1]?.created_at : undefined),
  });
  const mark = useMutation({
    mutationFn: async (ids: string[] | null) => {
      const { data, error } = await supabase.rpc('notifications_mark_read', { p_ids: ids });
      if (error) throw error;
      return data as number;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const rows = q.data?.pages.flat() ?? [];
  const markErr = mark.error ? toUserError(mark.error) : null;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Assignments, approaching deadlines, alerts and reports. Read notices are kept for 180 days."
        actions={
          <>
            <Link
              to="/notifications/preferences"
              className="inline-flex h-12 items-center font-medium text-brand hover:underline"
            >
              Email preferences
            </Link>
            <Button variant="secondary" busy={mark.isPending} onClick={() => mark.mutate(null)}>
              Mark all read
            </Button>
          </>
        }
      />
      <label className="mb-4 flex min-h-11 items-center gap-3 text-[14px]">
        <input
          type="checkbox"
          className="size-5"
          checked={unreadOnly}
          onChange={(e) => setUnreadOnly(e.target.checked)}
        />
        Unread only
      </label>
      <div aria-live="polite">
        {markErr && (
          <Alert tone="danger" detail={markErr.detail}>
            {markErr.message}
          </Alert>
        )}
      </div>
      {q.isPending ? (
        <Loading label="Loading notifications" />
      ) : q.isError ? (
        <ErrorAlert error={q.error} retry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <section className="rounded-lg bg-white">
          <EmptyState title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'} />
        </section>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`flex w-full flex-col items-start gap-1 rounded-lg border-l-4 bg-white p-4 text-left hover:bg-surface-muted ${
                  n.read_at ? 'border-transparent' : 'border-brand'
                }`}
                onClick={() => {
                  if (!n.read_at) mark.mutate([n.id]);
                  if (n.link) void navigate({ to: n.link });
                }}
              >
                <span className="flex w-full flex-wrap items-center justify-between gap-2">
                  <span className={n.read_at ? '' : 'font-medium'}>
                    {!n.read_at && <span className="sr-only">Unread: </span>}
                    {n.title}
                  </span>
                  <time
                    dateTime={n.created_at}
                    title={formatDateTime(n.created_at)}
                    className="text-[12px] text-muted"
                  >
                    {timeAgo(n.created_at)}
                  </time>
                </span>
                {n.body && <span className="text-[14px] text-secondary">{n.body}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="mt-4">
          <Button variant="secondary" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            Show more
          </Button>
        </div>
      )}
    </>
  );
}

interface TypeRow {
  key: string;
  label: string;
  description: string;
  email_supported: boolean;
  email_default: boolean;
  email_locked: boolean;
}

/** Email preferences per notification type; security emails cannot be turned off (M14). */
export function NotificationPreferencesPage() {
  const { supabase, claims } = useSession();
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: async () => {
      const [t, p] = await Promise.all([
        supabase.from('notification_types').select('*').order('sort_order'),
        supabase.from('notification_preferences').select('type, email_enabled'),
      ]);
      if (t.error) throw t.error;
      if (p.error) throw p.error;
      const prefs = new Map(
        (p.data as { type: string; email_enabled: boolean }[]).map((r) => [r.type, r.email_enabled]),
      );
      return { types: t.data as TypeRow[], prefs };
    },
  });
  const set = async (type: string, enabled: boolean) => {
    setError(null);
    setSaved(null);
    const { error: e } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: claims?.sub, type, email_enabled: enabled }, { onConflict: 'user_id,type' });
    if (e) setError(e);
    else setSaved('Saved.');
    await qc.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
  };
  const err = error ? toUserError(error) : null;

  return (
    <>
      <PageHeader
        title="Email preferences"
        subtitle="Notifications always appear in the portal. Choose which ones are also emailed to you."
      />
      <div aria-live="polite" className="mb-4">
        {err && (
          <Alert tone="danger" detail={err.detail}>
            {err.message}
          </Alert>
        )}
        {saved && <Alert tone="success">{saved}</Alert>}
      </div>
      {q.isPending ? (
        <Loading label="Loading preferences" />
      ) : q.isError ? (
        <ErrorAlert error={q.error} retry={() => void q.refetch()} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {q.data.types.map((t) => {
              const on = t.email_locked ? true : (q.data.prefs.get(t.key) ?? t.email_default);
              return (
                <li key={t.key} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="font-medium" id={`pref-${t.key}`}>
                      {PLAIN_TYPES[t.key]?.label ?? t.label}
                    </p>
                    <p className="text-[14px] text-secondary">
                      {PLAIN_TYPES[t.key]?.description ?? t.description}
                      {t.email_locked && ' Security emails can’t be turned off.'}
                      {!t.email_supported && ' Shown in the portal only.'}
                    </p>
                  </div>
                  {t.email_supported && (
                    <Switch.Root
                      aria-labelledby={`pref-${t.key}`}
                      checked={on}
                      disabled={t.email_locked}
                      onCheckedChange={(v) => void set(t.key, v)}
                      className="relative h-7 w-12 shrink-0 rounded-full bg-border-strong outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60 data-[state=checked]:bg-brand"
                    >
                      <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-white transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
