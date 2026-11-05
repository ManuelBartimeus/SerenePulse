/**
 * Panels shown inside the feedback-record drawer (M10) for flags, the linked case, case creation and
 * the consented-contact reveal. Owned by the cases feature (MS-10); the analytics feature renders it.
 */
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toUserError } from '../../lib/errors';
import { Alert, Badge, Button } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { useCaseMutation, useRpc } from './api';
import { plainReason, PRIORITIES } from './format';
import { ErrorAlert, Loading, Select, StatusBadge, TextActionDialog, TextArea } from './ui';

interface PanelData {
  flags: {
    id: string;
    reason: string;
    status: string;
    rule_name: string;
    suggested_priority: string;
    dismissal_reason: string | null;
    case_id: string | null;
  }[];
  cases: { id: string; reference: string; status: string; priority: string }[];
  has_contact_consent: boolean;
  can_review_flags: boolean;
  can_create_case: boolean;
  can_reveal: boolean;
}

/**
 * "Reveal" for consented contact details (D-15): reason required, audited, shown once in this view.
 * The number is never cached or stored in the browser.
 */
export function ContactReveal({
  responseId,
  masked,
  canReveal,
  onRevealed,
}: {
  responseId: string;
  masked: string | null;
  canReveal: boolean;
  onRevealed?: () => void;
}) {
  const rpc = useRpc();
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<{ phone: string; first_name: string | null } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px]">
        The customer asked to be contacted. Number:{' '}
        <span className="font-medium">{contact ? contact.phone : (masked ?? 'hidden')}</span>
        {contact?.first_name && (
          <>
            {' '}
            · Name: <span className="font-medium">{contact.first_name}</span>
          </>
        )}
      </p>
      <div aria-live="polite">
        {contact && (
          <Alert tone="info">Revealed and recorded in the audit log. Don’t copy it elsewhere.</Alert>
        )}
      </div>
      {canReveal && !contact && (
        <div>
          <Button variant="secondary" className="h-11" onClick={() => setOpen(true)}>
            Reveal…
          </Button>
        </div>
      )}
      {!canReveal && !contact && (
        <p className="text-[12px] text-secondary">
          Only people with access to contact details can reveal them; officers only on cases assigned to them.
        </p>
      )}
      <TextActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Reveal contact details"
        description="Say why you need the number. The reason and your name are recorded in the audit log."
        label="Reason"
        minLength={5}
        confirmLabel="Reveal"
        onConfirm={async (reason) => {
          setContact(
            await rpc<{ phone: string; first_name: string | null }>('contact_reveal', {
              p_response_id: responseId,
              p_reason: reason,
            }),
          );
          onRevealed?.();
        }}
      />
    </div>
  );
}

export function RecordCasePanel({
  responseId,
  hasContactConsent,
}: {
  responseId: string;
  hasContactConsent: boolean;
}) {
  const rpc = useRpc();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['record-case-panel', responseId],
    queryFn: () => rpc<PanelData>('response_case_panel', { p_response_id: responseId }),
  });
  const [dismiss, setDismiss] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [priority, setPriority] = useState('P3');
  const [description, setDescription] = useState('');
  const dismissM = useCaseMutation((args: { id: string; reason: string }) =>
    rpc('flag_dismiss', { p_flag_ids: [args.id], p_reason: args.reason }),
  );
  const convertM = useCaseMutation((id: string) =>
    rpc<{ case_id: string }>('flag_convert_to_case', { p_flag_id: id }),
  );
  const createM = useCaseMutation(() =>
    rpc<{ id: string }>('case_create', {
      p_response_id: responseId,
      p_priority: priority,
      p_description: description,
    }),
  );

  if (q.isPending) return <Loading label="Loading flagged feedback and cases" />;
  if (q.isError) return <ErrorAlert error={q.error} retry={() => void q.refetch()} />;
  const d = q.data;
  const convertErr = convertM.error ? toUserError(convertM.error) : null;
  const createErr = createM.error ? toUserError(createM.error) : null;

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Flagged">
        <h3 className="mb-2 text-[14px] font-medium">Flagged for review</h3>
        {d.flags.length === 0 ? (
          <p className="text-[14px] text-secondary">This response hasn’t been flagged.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {d.flags.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-2 rounded-sm bg-subtle p-3 text-[14px]"
              >
                <span className="flex-1">{plainReason(f.reason)}</span>
                <Badge tone={f.status === 'open' ? 'warning' : 'neutral'}>
                  {f.status === 'open' ? 'Open' : f.status === 'dismissed' ? 'Dismissed' : 'Case opened'}
                </Badge>
                {f.status === 'open' && d.can_review_flags && (
                  <>
                    <Button
                      variant="ghost"
                      className="h-11 px-3 text-[14px]"
                      onClick={() => setDismiss(f.id)}
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-11 px-3 text-[14px]"
                      busy={convertM.isPending && convertM.variables === f.id}
                      onClick={() =>
                        convertM.mutate(f.id, {
                          onSuccess: (r) =>
                            void navigate({
                              to: '/cases/$caseId',
                              params: { caseId: (r as { case_id: string }).case_id },
                            }),
                        })
                      }
                    >
                      Open a case
                    </Button>
                  </>
                )}
                {f.status === 'dismissed' && f.dismissal_reason && (
                  <span className="w-full text-[12px] text-secondary">Reason: {f.dismissal_reason}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div aria-live="polite">
          {convertErr && (
            <Alert tone="danger" detail={convertErr.detail}>
              {convertErr.message}
            </Alert>
          )}
        </div>
      </section>

      <section aria-label="Case">
        <h3 className="mb-2 text-[14px] font-medium">Case</h3>
        {d.cases.length === 0 ? (
          <p className="text-[14px] text-secondary">No case for this response.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {d.cases.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-[14px]">
                <Link
                  to="/cases/$caseId"
                  params={{ caseId: c.id }}
                  className="font-medium text-brand hover:underline"
                >
                  {c.reference}
                </Link>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
        {d.can_create_case && (
          <Button variant="secondary" className="mt-3 h-11" onClick={() => setCreate(true)}>
            Create case
          </Button>
        )}
      </section>

      {(hasContactConsent || d.has_contact_consent) && (
        <section aria-label="Contact">
          <h3 className="mb-2 text-[14px] font-medium">Contact</h3>
          <ContactReveal responseId={responseId} masked={null} canReveal={d.can_reveal} />
        </section>
      )}

      <TextActionDialog
        open={dismiss !== null}
        onOpenChange={(o) => !o && setDismiss(null)}
        title="Dismiss this item"
        label="Reason"
        confirmLabel="Dismiss"
        onConfirm={(reason) => dismissM.mutateAsync({ id: dismiss ?? '', reason })}
      />
      <Dialog
        open={create}
        onOpenChange={setCreate}
        title="Create a case"
        description="The case goes to the customer experience team’s queue. Anything flagged on this response is linked to it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreate(false)}>
              Cancel
            </Button>
            <Button
              busy={createM.isPending}
              onClick={() =>
                createM.mutate(undefined, {
                  onSuccess: (r) => {
                    setCreate(false);
                    void navigate({ to: '/cases/$caseId', params: { caseId: (r as { id: string }).id } });
                  },
                })
              }
            >
              Create case
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} — {p.days} working day{p.days === 1 ? '' : 's'}
              </option>
            ))}
          </Select>
          <TextArea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div aria-live="polite">
            {createErr && (
              <Alert tone="danger" detail={createErr.detail}>
                {createErr.message}
              </Alert>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
