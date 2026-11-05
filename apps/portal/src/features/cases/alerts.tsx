import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { toUserError } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, EmptyState, TextField } from '../../ui/controls';
import { useCaseMutation, useCasePeople, useRpc } from './api';
import { formatDateTime } from './format';
import { Card, ErrorAlert, Loading, Select, TextActionDialog } from './ui';

interface AlertEvent {
  id: string;
  rule_id: string;
  scope_type: string;
  scope_label: string;
  observed_value: number | null;
  threshold_value: number | null;
  window_from: string | null;
  window_to: string | null;
  detail: Record<string, unknown>;
  fired_at: string;
  status: 'open' | 'acknowledged' | 'resolved';
  resolution_note: string | null;
  alert_rules: { name: string; type: string; severity: string } | null;
}

const SEVERITY_TONE = { info: 'info', warning: 'warning', critical: 'danger' } as const;

/** S-B14 Alert inbox: fired alerts with acknowledge / resolve (alerts.manage). */
export function AlertInboxPage() {
  const { supabase, can } = useSession();
  const rpc = useRpc();
  const search = useSearch({ strict: false }) as { event?: string };
  const [status, setStatus] = useState<'open' | 'acknowledged' | 'resolved' | 'all'>('open');
  const [resolving, setResolving] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['cases', 'alerts', status],
    queryFn: async () => {
      let req = supabase
        .from('alert_events')
        .select('*, alert_rules(name, type, severity)')
        .order('fired_at', { ascending: false })
        .limit(200);
      if (status !== 'all') req = req.eq('status', status);
      const { data, error } = await req;
      if (error) throw error;
      return data as AlertEvent[];
    },
  });
  const ack = useCaseMutation((id: string) => rpc('alert_acknowledge', { p_event_id: id }));
  const ackErr = ack.error ? toUserError(ack.error) : null;
  const manage = can('alerts.manage');

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Alerts are checked every 15 minutes. Each rule fires at most once per scope within its cooldown."
      />
      <div className="mb-4 max-w-xs">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </Select>
      </div>
      <div aria-live="polite" className="mb-4">
        {ackErr && (
          <Alert tone="danger" detail={ackErr.detail}>
            {ackErr.message}
          </Alert>
        )}
      </div>
      {q.isPending ? (
        <Loading label="Loading alerts" />
      ) : q.isError ? (
        <ErrorAlert error={q.error} retry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <section className="rounded-lg bg-white">
          <EmptyState title={status === 'open' ? 'No open alerts' : 'No alerts here'} />
        </section>
      ) : (
        <ul className="flex flex-col gap-2">
          {q.data.map((e) => (
            <li
              key={e.id}
              className={`rounded-lg bg-white p-4 ${search.event === e.id ? 'ring-2 ring-brand' : ''}`}
              aria-current={search.event === e.id ? 'true' : undefined}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={SEVERITY_TONE[(e.alert_rules?.severity ?? 'info') as keyof typeof SEVERITY_TONE]}
                >
                  {e.alert_rules?.severity ?? 'info'}
                </Badge>
                <span className="font-medium">{e.alert_rules?.name ?? 'Alert'}</span>
                <span className="text-secondary">· {e.scope_label}</span>
                <Badge
                  tone={e.status === 'open' ? 'warning' : e.status === 'resolved' ? 'success' : 'neutral'}
                >
                  {e.status === 'open' ? 'Open' : e.status === 'resolved' ? 'Resolved' : 'Acknowledged'}
                </Badge>
              </div>
              <p className="mt-1 text-[14px]">
                {e.observed_value !== null && <>Observed {e.observed_value}</>}
                {e.threshold_value !== null && <> · threshold {e.threshold_value}</>}
                {typeof e.detail.n === 'number' && <> · n = {e.detail.n}</>}
                {typeof e.detail.n_recent === 'number' && <> · n = {e.detail.n_recent}</>}
              </p>
              <p className="text-[12px] text-muted">
                Fired {formatDateTime(e.fired_at)}
                {e.window_from && (
                  <>
                    {' '}
                    · window {formatDateTime(e.window_from)} – {formatDateTime(e.window_to)}
                  </>
                )}
              </p>
              {e.resolution_note && (
                <p className="mt-1 text-[14px] text-secondary">Resolution: {e.resolution_note}</p>
              )}
              {manage && e.status !== 'resolved' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.status === 'open' && (
                    <Button
                      variant="secondary"
                      className="h-11"
                      busy={ack.isPending && ack.variables === e.id}
                      onClick={() => ack.mutate(e.id)}
                    >
                      Acknowledge
                    </Button>
                  )}
                  <Button variant="secondary" className="h-11" onClick={() => setResolving(e.id)}>
                    Resolve…
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <TextActionDialog
        open={resolving !== null}
        onOpenChange={(o) => !o && setResolving(null)}
        title="Resolve the alert"
        label="What was done (optional)"
        minLength={0}
        confirmLabel="Resolve"
        onConfirm={async (note) => {
          await rpc('alert_resolve', { p_event_id: resolving, p_note: note || null });
          await q.refetch();
        }}
      />
    </>
  );
}

interface AlertRule {
  id: string;
  name: string;
  type: string;
  description: string;
  params: Record<string, unknown>;
  severity: string;
  recipient_roles: string[];
  recipient_department_ids: string[];
  recipient_user_ids: string[];
  notify_branch_managers: boolean;
  cooldown_minutes: number;
  is_active: boolean;
  version: number;
}

export const PARAM_LABELS: Record<string, string> = {
  recent_days: 'Recent window (days)',
  baseline_days: 'Baseline window (days)',
  drop_points: 'Drop (CSAT points)',
  min_n: 'Minimum responses (n)',
  hours: 'Window (hours)',
  min_count: 'Minimum negative responses',
  increase_pct: 'Increase week on week (%)',
  min_open: 'Minimum open cases',
  days: 'Window (days)',
  share_pct: 'Share of responses (%)',
  ratio: 'Ratio to prior window',
};
const ROLES = [
  { key: 'executive', label: 'Executives' },
  { key: 'cx_admin', label: 'CX Administrators' },
  { key: 'branch_manager', label: 'Branch managers (all)' },
  { key: 'resolution_officer', label: 'Resolution officers' },
  { key: 'system_admin', label: 'System Administrators' },
  { key: 'auditor', label: 'Auditors' },
];

/** S-B13 Alert rules: the seven M12 types with editable parameters and recipients. */
export function AlertRulesPage() {
  const { supabase } = useSession();
  const q = useQuery({
    queryKey: ['cases', 'alert-rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('alert_rules').select('*').order('name');
      if (error) throw error;
      return data as AlertRule[];
    },
  });
  return (
    <>
      <PageHeader
        title="Alert rules"
        subtitle="Recipients get an in-app notice and an email (D-30). Cooldown stops repeats for the same rule and scope."
      />
      {q.isPending ? (
        <Loading label="Loading alert rules" />
      ) : q.isError ? (
        <ErrorAlert error={q.error} retry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          {q.data.map((r) => (
            <RuleEditor key={`${r.id}:${r.version}`} rule={r} />
          ))}
        </div>
      )}
    </>
  );
}

function RuleEditor({ rule }: { rule: AlertRule }) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const people = useCasePeople();
  const [draft, setDraft] = useState(rule);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{
    tone: 'danger' | 'success';
    text: string;
    detail?: string | undefined;
  } | null>(null);
  const numericKeys = Object.keys(rule.params).filter((k) => typeof rule.params[k] === 'number');
  const toggleIn = (list: string[], v: string, on: boolean) =>
    on ? [...new Set([...list, v])] : list.filter((x) => x !== v);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase
      .from('alert_rules')
      .update({
        name: draft.name,
        params: draft.params,
        severity: draft.severity,
        recipient_roles: draft.recipient_roles,
        recipient_department_ids: draft.recipient_department_ids,
        recipient_user_ids: draft.recipient_user_ids,
        notify_branch_managers: draft.notify_branch_managers,
        cooldown_minutes: draft.cooldown_minutes,
        is_active: draft.is_active,
      })
      .eq('id', rule.id)
      .eq('version', rule.version)
      .select('id');
    setBusy(false);
    if (error) {
      const e = toUserError(error);
      setMsg({ tone: 'danger', text: e.message, detail: e.detail });
    } else if (!data?.length) {
      setMsg({ tone: 'danger', text: 'Someone else changed this rule. Reload the page and try again.' });
    } else {
      await qc.invalidateQueries({ queryKey: ['cases', 'alert-rules'] });
    }
  };

  return (
    <Card
      title={rule.name}
      actions={<Badge tone={draft.is_active ? 'success' : 'neutral'}>{draft.is_active ? 'On' : 'Off'}</Badge>}
    >
      <p className="mb-4 text-[14px] text-secondary">{rule.description}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <TextField
          label="Name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Select
          label="Severity"
          value={draft.severity}
          onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
        >
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical (high-priority email)</option>
        </Select>
        <TextField
          label="Cooldown (hours)"
          type="number"
          min={1}
          max={720}
          value={String(draft.cooldown_minutes / 60)}
          onChange={(e) => setDraft({ ...draft, cooldown_minutes: Math.round(Number(e.target.value) * 60) })}
        />
        {numericKeys.map((k) => (
          <TextField
            key={k}
            label={PARAM_LABELS[k] ?? k}
            type="number"
            min={0}
            step="any"
            value={String(draft.params[k] ?? '')}
            onChange={(e) => setDraft({ ...draft, params: { ...draft.params, [k]: Number(e.target.value) } })}
          />
        ))}
      </div>
      <fieldset className="mt-4">
        <legend className="text-[14px] font-medium">Recipients</legend>
        <div className="mt-2 flex flex-wrap gap-x-6">
          {ROLES.map((r) => (
            <label key={r.key} className="flex min-h-11 items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                className="size-5"
                checked={draft.recipient_roles.includes(r.key)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    recipient_roles: toggleIn(draft.recipient_roles, r.key, e.target.checked),
                  })
                }
              />
              {r.label}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.notify_branch_managers}
              onChange={(e) => setDraft({ ...draft, notify_branch_managers: e.target.checked })}
            />
            Managers of the affected branch
          </label>
        </div>
        {people.data && (
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[14px] text-secondary">Departments (members and head)</p>
              <div className="flex flex-wrap gap-x-4">
                {people.data.departments.map((d) => (
                  <label key={d.id} className="flex min-h-11 items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={draft.recipient_department_ids.includes(d.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          recipient_department_ids: toggleIn(
                            draft.recipient_department_ids,
                            d.id,
                            e.target.checked,
                          ),
                        })
                      }
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[14px] text-secondary">Individual people</p>
              <div className="flex max-h-48 flex-col overflow-y-auto">
                {people.data.people.map((p) => (
                  <label key={p.user_id} className="flex min-h-11 items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={draft.recipient_user_ids.includes(p.user_id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          recipient_user_ids: toggleIn(draft.recipient_user_ids, p.user_id, e.target.checked),
                        })
                      }
                    />
                    {p.display_name || 'Unnamed user'}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            className="size-5"
            checked={draft.is_active}
            onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
          />
          Rule is on
        </label>
        <Button busy={busy} onClick={() => void save()}>
          Save rule
        </Button>
      </div>
      <div aria-live="polite" className="mt-3">
        {msg && (
          <Alert tone={msg.tone} detail={msg.detail}>
            {msg.text}
          </Alert>
        )}
      </div>
    </Card>
  );
}
