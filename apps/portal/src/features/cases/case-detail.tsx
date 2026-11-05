import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { toUserError } from '../../lib/errors';
import { MEASURES, RECOMMEND_GROUPS, WORDS } from '../../lib/terms';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { useCaseCategories, useCaseMutation, useCasePeople, useRpc, type CaseDetail } from './api';
import {
  ACTIVITY_LABELS,
  activityValue,
  findMentions,
  FOLLOW_UP_OUTCOMES,
  formatDateTime,
  isConflict,
  mentionQuery,
  plainReason,
  PRIORITIES,
  slaSummary,
  slaTone,
} from './format';
import { ContactReveal } from './record-panels';
import {
  Card,
  ErrorAlert,
  Loading,
  PriorityBadge,
  Select,
  SlaBadge,
  StatusBadge,
  TextActionDialog,
  TextArea,
} from './ui';

type Action =
  | 'assign'
  | 'priority'
  | 'escalate'
  | 'deescalate'
  | 'investigate'
  | 'resolve'
  | 'close'
  | 'reopen'
  | 'followup'
  | null;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-medium uppercase tracking-[1px] text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** S-B5 case detail: summary, linked response, response-deadline countdown, actions by permission, timeline, notes. */
export function CaseDetailPage() {
  const { caseId } = useParams({ strict: false }) as { caseId: string };
  const rpc = useRpc();
  const [action, setAction] = useState<Action>(null);
  const [conflict, setConflict] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const q = useQuery({
    queryKey: ['cases', 'detail', caseId],
    queryFn: () => rpc<CaseDetail>('case_detail', { p_case_id: caseId }),
  });
  const run = useCaseMutation(async ({ fn, args }: { fn: string; args: Record<string, unknown> }) =>
    rpc(fn, { p_case_id: caseId, ...args }),
  );
  /** Runs an action with the version we loaded; a P0409 shows the conflict banner. */
  const act = async (fn: string, args: Record<string, unknown> = {}) => {
    setActionError(null);
    try {
      await run.mutateAsync({ fn, args: { p_expected_version: q.data?.case.version, ...args } });
      setConflict(false);
    } catch (e) {
      if (isConflict(e)) {
        setConflict(true);
        await q.refetch();
        throw new Error(
          'Someone else updated this case. We reloaded it; check the latest details and try again.',
        );
      }
      throw e;
    }
  };

  if (q.isPending) return <Loading label="Loading the case" />;
  if (q.isError) return <ErrorAlert error={q.error} retry={() => void q.refetch()} />;
  const { case: c, sla, response, activities, permissions: can, flags } = q.data;
  const s = slaSummary(sla);
  const open = c.status !== 'resolved' && c.status !== 'closed';
  const actionErr = actionError ? toUserError(actionError) : null;

  const buttons: {
    key: Exclude<Action, null> | 'start';
    label: string;
    show: boolean;
    variant?: 'primary' | 'secondary';
  }[] = [
    { key: 'start', label: 'Start work', show: can.work && c.status === 'assigned', variant: 'primary' },
    { key: 'assign', label: c.assigned_officer_id ? 'Reassign' : 'Assign', show: can.assign },
    { key: 'priority', label: 'Change priority', show: can.assign },
    { key: 'investigate', label: 'Record investigation', show: can.work && c.status === 'in_progress' },
    { key: 'resolve', label: 'Resolve', show: can.work && c.status === 'in_progress', variant: 'primary' },
    { key: 'escalate', label: 'Escalate', show: can.work && open && c.escalation_level < 3 },
    { key: 'deescalate', label: 'De-escalate', show: can.work && c.escalation_level > 0 },
    {
      key: 'followup',
      label: 'Record follow-up',
      show: can.work && (c.status === 'in_progress' || c.status === 'resolved'),
    },
    { key: 'close', label: 'Close', show: can.close, variant: 'primary' },
    { key: 'reopen', label: 'Reopen', show: can.reopen },
  ];

  return (
    <>
      <PageHeader
        title={c.reference}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={c.priority} />
            <StatusBadge status={c.status} />
            {c.is_escalated && <Badge tone="danger">Escalated to {c.escalation_label}</Badge>}
            <SlaBadge state={sla.state} />
          </span>
        }
        actions={
          <Link to="/cases" className="inline-flex h-12 items-center font-medium text-brand hover:underline">
            All cases
          </Link>
        }
      />
      <div aria-live="polite" className="mb-4 flex flex-col gap-2">
        {conflict && (
          <Alert tone="warning" title="This case changed while you were looking at it">
            We loaded the latest version. Check it before trying again.
          </Alert>
        )}
        {actionErr && (
          <Alert tone="danger" detail={actionErr.detail}>
            {actionErr.message}
          </Alert>
        )}
      </div>

      <section className="mb-6 rounded-lg bg-white p-4 md:p-6" aria-label="Response deadline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{s.text}</p>
          <p className="text-[14px] text-secondary">
            Due {formatDateTime(c.target_resolution_at)} · {sla.target_working_days} working day
            {sla.target_working_days === 1 ? '' : 's'} (Mon–Fri, 8 am–5 pm)
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-label="Time used before the deadline"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.pct}
        >
          <div
            className={`h-full ${slaTone(sla.state) === 'danger' ? 'bg-danger' : slaTone(sla.state) === 'warning' ? 'bg-warning' : 'bg-brand'}`}
            style={{ width: `${s.pct}%` }}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {buttons
            .filter((b) => b.show)
            .map((b) => (
              <Button
                key={b.key}
                variant={b.variant ?? 'secondary'}
                className="h-11"
                busy={b.key === 'start' && run.isPending}
                onClick={() => {
                  if (b.key === 'start') act('case_start').catch(setActionError);
                  else setAction(b.key);
                }}
              >
                {b.label}
              </Button>
            ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card title="Summary">
            <p className="whitespace-pre-wrap">{plainReason(c.description)}</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Assigned to">{c.officer_name ?? 'Not yet assigned'}</Field>
              <Field label="Department">{c.department_name ?? '—'}</Field>
              <Field label="Branch">{c.branch_name ?? 'No branch'}</Field>
              <Field label="Category">{c.category_label ?? '—'}</Field>
              <Field label="Opened on">{formatDateTime(c.created_at)}</Field>
              <Field label="Opened">
                {c.source === 'auto'
                  ? 'Automatically, by a flagging rule'
                  : c.source === 'flag'
                    ? 'From flagged feedback'
                    : 'By a staff member'}
              </Field>
              {c.resolved_at && <Field label="Resolved">{formatDateTime(c.resolved_at)}</Field>}
              {c.closed_at && <Field label="Closed">{formatDateTime(c.closed_at)}</Field>}
              {c.follow_up_outcome && (
                <Field label="Follow-up">
                  {FOLLOW_UP_OUTCOMES.find((o) => o.key === c.follow_up_outcome)?.label ??
                    c.follow_up_outcome}
                </Field>
              )}
              {c.reopen_count > 0 && <Field label="Reopened">{c.reopen_count} time(s)</Field>}
            </dl>
            {c.resolution_notes && (
              <div className="mt-4">
                <h3 className="text-[14px] font-medium">Resolution</h3>
                <p className="whitespace-pre-wrap text-[14px]">{c.resolution_notes}</p>
              </div>
            )}
            {c.corrective_action && (
              <div className="mt-4">
                <h3 className="text-[14px] font-medium">Corrective action</h3>
                <p className="whitespace-pre-wrap text-[14px]">{c.corrective_action}</p>
              </div>
            )}
          </Card>

          {response && (
            <Card title={`Feedback ${response.reference}`}>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Submitted">{formatDateTime(response.submitted_at)}</Field>
                <Field label="Channel">{response.channel_label}</Field>
                <Field label="Branch">
                  {response.branch_name ?? response.branch_status.replace(/_/g, ' ')}
                </Field>
                <Field label="Product">{response.product_label}</Field>
                <Field label="Overall satisfaction">{response.csat_score} out of 5</Field>
                <Field label={MEASURES.ces_avg.label}>{response.ces_score} out of 5</Field>
                <Field label="Likelihood to recommend">
                  {response.nps_score} out of 10
                  {response.nps_class in RECOMMEND_GROUPS
                    ? ` · ${RECOMMEND_GROUPS[response.nps_class as keyof typeof RECOMMEND_GROUPS]}`
                    : ''}
                </Field>
                <Field label={WORDS.factor}>{response.factor_label ?? '—'}</Field>
              </dl>
              <div className="mt-4">
                <h3 className="text-[14px] font-medium">Comment</h3>
                {response.text_redacted ? (
                  <p className="text-[14px] text-secondary">Removed under the retention policy.</p>
                ) : response.comment_hidden ? (
                  <p className="text-[14px] text-secondary">You don’t have access to comments.</p>
                ) : response.comment ? (
                  <p className="whitespace-pre-wrap text-[14px]">{response.comment}</p>
                ) : (
                  <p className="text-[14px] text-secondary">No comment.</p>
                )}
                {response.other_texts && Object.keys(response.other_texts).length > 0 && (
                  <ul className="mt-2 text-[14px] text-secondary">
                    {Object.entries(response.other_texts).map(([k, v]) => (
                      <li key={k}>
                        Other {k}: {v}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {flags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {flags.map((f) => (
                    <Badge key={f.id} tone={f.status === 'open' ? 'warning' : 'neutral'}>
                      {plainReason(f.reason)}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card title="Customer contact">
            {c.has_contact_consent ? (
              <ContactReveal
                responseId={c.response_id}
                masked={response?.contact_masked ?? null}
                canReveal={can.reveal}
                onRevealed={() => void q.refetch()}
              />
            ) : (
              <p className="text-[14px] text-secondary">
                The customer didn’t ask to be contacted, so no contact details were collected.
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {can.work && c.status !== 'closed' && <NoteComposer caseId={caseId} />}
          <Card title="Timeline">
            <ol className="flex flex-col gap-4" aria-label="Case timeline">
              {[...activities].reverse().map((a) => (
                <li key={a.id} className="border-l-2 border-border pl-4">
                  <p className="text-[14px]">
                    <span className="font-medium">{ACTIVITY_LABELS[a.type] ?? a.type}</span>
                    {(a.from_value || a.to_value) && (
                      <span className="text-secondary">
                        {' '}
                        {[activityValue(a.type, a.from_value), activityValue(a.type, a.to_value)]
                          .filter(Boolean)
                          .join(' → ')}
                      </span>
                    )}
                  </p>
                  {a.body && <p className="mt-1 whitespace-pre-wrap text-[14px]">{a.body}</p>}
                  {a.mentions.length > 0 && (
                    <p className="mt-1 text-[12px] text-secondary">Mentioned: {a.mentions.join(', ')}</p>
                  )}
                  <p className="mt-1 text-[12px] text-muted">
                    {a.actor_name ?? 'Unknown user'} · {formatDateTime(a.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {action === 'assign' && <AssignDialog detail={q.data} onClose={() => setAction(null)} act={act} />}
      {action === 'priority' && (
        <PriorityDialog current={c.priority} onClose={() => setAction(null)} act={act} />
      )}
      {action === 'resolve' && <ResolveDialog onClose={() => setAction(null)} act={act} />}
      {action === 'followup' && <FollowUpDialog onClose={() => setAction(null)} act={act} />}
      {action === 'investigate' && <InvestigateDialog onClose={() => setAction(null)} act={act} />}
      <TextActionDialog
        open={action === 'escalate'}
        onOpenChange={(o) => !o && setAction(null)}
        title="Escalate the case"
        description={`It moves from ${c.escalation_label} to the next level: officer → department head → customer experience administrator → Executive.`}
        label="Reason"
        confirmLabel="Escalate"
        onConfirm={(t) => act('case_escalate', { p_reason: t })}
      />
      <TextActionDialog
        open={action === 'deescalate'}
        onOpenChange={(o) => !o && setAction(null)}
        title="De-escalate the case"
        label="Reason"
        confirmLabel="De-escalate"
        onConfirm={(t) => act('case_de_escalate', { p_reason: t })}
      />
      <TextActionDialog
        open={action === 'close'}
        onOpenChange={(o) => !o && setAction(null)}
        title="Close the case"
        description="Closing is final. Only an Executive can reopen a closed case."
        label="Closing note"
        minLength={0}
        confirmLabel="Close case"
        onConfirm={(t) => act('case_close', { p_note: t || null })}
      />
      <TextActionDialog
        open={action === 'reopen'}
        onOpenChange={(o) => !o && setAction(null)}
        title="Reopen the case"
        description={
          c.status === 'closed'
            ? 'Executives can reopen closed cases. The reason is kept on the timeline.'
            : 'Resolved cases can be reopened within 30 days.'
        }
        label="Reason"
        minLength={5}
        confirmLabel="Reopen"
        onConfirm={(t) => act('case_reopen', { p_reason: t })}
      />
    </>
  );
}

type Act = (fn: string, args?: Record<string, unknown>) => Promise<void>;

function FormDialog({
  title,
  description,
  confirm,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  description?: string;
  confirm: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const err = error ? toUserError(error) : null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit();
                onClose();
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        <div aria-live="polite">
          {err && (
            <Alert tone="danger" detail={err.detail}>
              {err.message}
            </Alert>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function AssignDialog({ detail, onClose, act }: { detail: CaseDetail; onClose: () => void; act: Act }) {
  const people = useCasePeople();
  const [officer, setOfficer] = useState(detail.case.assigned_officer_id ?? '');
  const [dept, setDept] = useState(detail.case.department_id ?? '');
  const [note, setNote] = useState('');
  return (
    <FormDialog
      title="Assign the case"
      description="Choose an officer, a department, or both. The officer's department is used when you leave it blank."
      confirm="Assign"
      onClose={onClose}
      onSubmit={() =>
        act('case_assign', {
          p_officer_id: officer || null,
          p_department_id: dept || null,
          p_note: note || null,
        })
      }
    >
      {people.isPending ? (
        <Loading label="Loading people" />
      ) : people.isError ? (
        <ErrorAlert error={people.error} />
      ) : (
        <>
          <Select label="Officer" value={officer} onChange={(e) => setOfficer(e.target.value)}>
            <option value="">No officer (department only)</option>
            {people.data.people
              .filter((p) => p.can_work)
              .map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.display_name || 'Unnamed user'}
                </option>
              ))}
          </Select>
          <Select label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Officer’s department</option>
            {people.data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </>
      )}
      <TextArea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
    </FormDialog>
  );
}

function PriorityDialog({ current, onClose, act }: { current: string; onClose: () => void; act: Act }) {
  const [priority, setPriority] = useState(current);
  const [reason, setReason] = useState('');
  return (
    <FormDialog
      title="Change priority"
      description="The response deadline is recalculated from when the case was opened."
      confirm="Save priority"
      onClose={onClose}
      onSubmit={() => act('case_set_priority', { p_priority: priority, p_reason: reason || null })}
    >
      <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
        {PRIORITIES.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label} — {p.days} working day{p.days === 1 ? '' : 's'}
          </option>
        ))}
      </Select>
      <TextArea
        label="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
      />
    </FormDialog>
  );
}

function ResolveDialog({ onClose, act }: { onClose: () => void; act: Act }) {
  const categories = useCaseCategories();
  const [notes, setNotes] = useState('');
  const [corrective, setCorrective] = useState('');
  const [category, setCategory] = useState('');
  return (
    <FormDialog
      title="Resolve the case"
      description="A customer experience administrator or an Executive closes it afterwards."
      confirm="Resolve"
      onClose={onClose}
      onSubmit={() =>
        act('case_resolve', {
          p_resolution_notes: notes,
          p_corrective_action: corrective || null,
          p_category_id: category || null,
        })
      }
    >
      <TextArea label="What was done" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <TextArea
        label="Corrective action (optional)"
        helper="What changes so this doesn't happen again."
        value={corrective}
        onChange={(e) => setCorrective(e.target.value)}
        rows={2}
      />
      <Select label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">Keep the current category</option>
        {(categories.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
    </FormDialog>
  );
}

function InvestigateDialog({ onClose, act }: { onClose: () => void; act: Act }) {
  const [findings, setFindings] = useState('');
  const [corrective, setCorrective] = useState('');
  return (
    <FormDialog
      title="Record the investigation"
      confirm="Save"
      onClose={onClose}
      onSubmit={() =>
        act('case_record_investigation', { p_findings: findings, p_corrective_action: corrective || null })
      }
    >
      <TextArea label="Findings" value={findings} onChange={(e) => setFindings(e.target.value)} />
      <TextArea
        label="Corrective action (optional)"
        value={corrective}
        onChange={(e) => setCorrective(e.target.value)}
        rows={2}
      />
    </FormDialog>
  );
}

function FollowUpDialog({ onClose, act }: { onClose: () => void; act: Act }) {
  const [outcome, setOutcome] = useState<string>('contacted_resolved');
  const [note, setNote] = useState('');
  return (
    <FormDialog
      title="Record the follow-up"
      confirm="Save"
      onClose={onClose}
      onSubmit={() => act('case_record_follow_up', { p_outcome: outcome, p_note: note || null })}
    >
      <Select label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
        {FOLLOW_UP_OUTCOMES.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
      <TextArea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
    </FormDialog>
  );
}

/** Internal note with @mentions (mentioned colleagues get an in-app notification). */
function NoteComposer({ caseId }: { caseId: string }) {
  const rpc = useRpc();
  const { claims } = useSession();
  const people = useCasePeople();
  const [body, setBody] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const m = useCaseMutation(() =>
    rpc<number>('case_add_note', {
      p_case_id: caseId,
      p_body: body,
      p_mentions: findMentions(body, people.data?.people ?? []).filter((id) => id !== claims?.sub),
    }),
  );
  const query = mentionQuery(body);
  const suggestions =
    query === null
      ? []
      : (people.data?.people ?? [])
          .filter((p) => p.display_name && p.display_name.toLowerCase().startsWith(query.toLowerCase()))
          .slice(0, 5);
  const err = m.error ? toUserError(m.error) : null;
  return (
    <Card title="Add a note">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setDone(null);
          m.mutate(undefined, {
            onSuccess: () => {
              setBody('');
              setDone('Note added.');
            },
          });
        }}
      >
        <TextArea
          label="Note"
          helper="Type @ and a name to mention a colleague. Notes are internal and never shown to the customer."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        {suggestions.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Mention suggestions">
            {suggestions.map((p) => (
              <li key={p.user_id}>
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-brand-50 px-4 text-[14px] text-brand"
                  onClick={() =>
                    setBody((b) => b.replace(/@([\p{L}\p{N} .'-]{0,40})$/u, `@${p.display_name} `))
                  }
                >
                  @{p.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div aria-live="polite">
          {err && (
            <Alert tone="danger" detail={err.detail}>
              {err.message}
            </Alert>
          )}
          {done && <Alert tone="success">{done}</Alert>}
        </div>
        <div>
          <Button type="submit" busy={m.isPending} disabled={!body.trim()}>
            Add note
          </Button>
        </div>
      </form>
    </Card>
  );
}
