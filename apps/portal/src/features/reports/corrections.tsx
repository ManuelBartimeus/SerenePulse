// Branch corrections (FR-41, MS-13): queue for approvers and the decision history.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Button, EmptyState, Spinner } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { attributionText, CorrectionStatus, type Correction } from './record-corrections';
import { formatDateTime } from './schedule';
import { ErrorBox, TextArea } from './ui';

export function CorrectionsPage() {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'proposed' | null>('proposed');
  const [rejecting, setRejecting] = useState<Correction | null>(null);
  const [reason, setReason] = useState('');
  const list = useQuery({
    queryKey: ['reports', 'corrections', 'list', tab],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('correction_list', { p_status: tab, p_limit: 200 });
      if (error) throw error;
      return data as Correction[];
    },
  });
  const done = () => qc.invalidateQueries({ queryKey: ['reports', 'corrections'] });
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('response_approve_correction', { p_correction_id: id });
      if (error) throw error;
    },
    onSuccess: done,
  });
  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('response_reject_correction', {
        p_correction_id: rejecting?.id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRejecting(null);
      setReason('');
      done();
    },
  });

  return (
    <>
      <PageHeader
        title="Branch corrections"
        subtitle="Changes to the branch a response counts towards. The customer’s answer is never overwritten, and a second person confirms each change."
      />
      <div className="mb-4 flex gap-2" role="group" aria-label="Show">
        {[
          { v: 'proposed' as const, l: 'Waiting for approval' },
          { v: null, l: 'All decisions' },
        ].map((t) => (
          <button
            key={String(t.v)}
            type="button"
            aria-pressed={tab === t.v}
            onClick={() => setTab(t.v)}
            className={`h-11 rounded-full border px-4 text-[14px] ${
              tab === t.v
                ? 'border-brand bg-brand-50 font-medium text-brand'
                : 'border-border hover:bg-surface-muted'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mb-4">
        {approve.isError && <ErrorBox error={approve.error} />}
        {approve.isSuccess && (
          <Alert tone="success">Approved. Dashboards for that day have been recalculated.</Alert>
        )}
      </div>
      <section className="rounded-lg bg-white">
        {list.isPending ? (
          <div className="p-4">
            <Spinner label="Loading corrections" />
          </div>
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBox error={list.error} />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState title={tab ? 'Nothing waiting for approval' : 'No corrections yet'}>
            Corrections are proposed from a customer response.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {c.reference} <CorrectionStatus c={c} />
                  </p>
                  <p className="text-[14px]">
                    {c.original_branch_name ?? 'No branch given'} →{' '}
                    {attributionText(c.corrected_branch_status, c.corrected_branch_name)}
                  </p>
                  <p className="text-[14px] text-secondary">
                    {c.proposed_by_name ?? 'A user'}, {formatDateTime(c.proposed_at)}: “{c.reason}”
                  </p>
                  {c.rejection_reason && (
                    <p className="text-[14px] text-secondary">Rejected: “{c.rejection_reason}”</p>
                  )}
                </div>
                {c.can_decide && (
                  <div className="flex gap-2">
                    <Button
                      busy={approve.isPending && approve.variables === c.id}
                      onClick={() => approve.mutate(c.id)}
                    >
                      Approve
                    </Button>
                    <Button variant="secondary" onClick={() => setRejecting(c)}>
                      Reject
                    </Button>
                  </div>
                )}
                {c.status === 'proposed' && !c.can_decide && (
                  <p className="text-[14px] text-secondary">Another approver must decide.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog
        open={rejecting !== null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="Reject this correction?"
        description="The response keeps its current branch. The person who proposed it sees your reason."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              busy={reject.isPending}
              disabled={reason.trim().length < 5}
              onClick={() => reject.mutate()}
            >
              Reject
            </Button>
          </>
        }
      >
        <TextArea label="Reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        <div aria-live="polite" className="mt-3">
          {reject.isError && <ErrorBox error={reject.error} />}
        </div>
      </Dialog>
    </>
  );
}
