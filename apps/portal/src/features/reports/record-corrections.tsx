// Branch corrections in the response drawer (FR-41, MS-13): the submitted branch is always shown,
// then the effective one, the history and (with permission) a propose form. Rendered by C's drawer.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '../../lib/session';
import { Alert, Badge, Button, Spinner } from '../../ui/controls';
import { useCatalogues } from '../analytics/catalogues';
import { formatDateTime } from './schedule';
import { ErrorBox, SelectField, TextArea } from './ui';

export interface Correction {
  id: string;
  response_id: string;
  status: 'proposed' | 'approved' | 'rejected';
  reason: string;
  original_branch_name: string | null;
  corrected_branch_id: string | null;
  corrected_branch_status: 'selected' | 'other' | 'not_applicable' | 'not_provided';
  corrected_branch_name: string | null;
  proposed_by_name: string | null;
  proposed_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  can_decide: boolean;
  reference?: string;
  submitted_at?: string;
}
interface Attribution {
  branch_id: string | null;
  branch_status: string;
  branch_name: string | null;
}
interface PanelData {
  submitted: Attribution;
  effective: Attribution;
  corrections: Correction[];
  can_propose: boolean;
  can_approve: boolean;
}

const STATUS_TEXT: Record<string, string> = {
  other: 'Another branch (not listed)',
  not_applicable: 'No branch (not applicable)',
  not_provided: 'Not provided',
};
export const attributionText = (status: string, name: string | null) =>
  status === 'selected' ? (name ?? 'Unknown branch') : (STATUS_TEXT[status] ?? status);

export function CorrectionStatus({ c }: { c: Correction }) {
  if (c.status === 'approved') return <Badge tone="success">Approved</Badge>;
  if (c.status === 'rejected') return <Badge tone="danger">Rejected</Badge>;
  return <Badge tone="info">Waiting for approval</Badge>;
}

export function RecordCorrectionsPanel({ responseId }: { responseId: string }) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const catalogues = useCatalogues();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const key = ['reports', 'corrections', responseId];
  const panel = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('response_corrections', { p_response_id: responseId });
      if (error) throw error;
      return data as PanelData;
    },
  });
  const propose = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('response_propose_correction', {
        p_response_id: responseId,
        p_branch_code: target,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTarget('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['reports', 'corrections'] });
    },
  });

  if (panel.isPending) return <Spinner label="Loading corrections" />;
  if (panel.isError) return <ErrorBox error={panel.error} />;
  const d = panel.data;
  const open = d.corrections.some((c) => c.status === 'proposed');
  const changed = d.corrections.some((c) => c.status === 'approved');

  return (
    <section aria-labelledby={`corr-${responseId}`} className="grid gap-3">
      <h3 id={`corr-${responseId}`} className="font-medium">
        Branch
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
        <dt className="text-secondary">Customer said</dt>
        <dd>{attributionText(d.submitted.branch_status, d.submitted.branch_name)}</dd>
        <dt className="text-secondary">Used in reports</dt>
        <dd>
          {attributionText(d.effective.branch_status, d.effective.branch_name)}{' '}
          {changed && <Badge tone="warning">Corrected</Badge>}
        </dd>
      </dl>
      {d.corrections.length > 0 && (
        <ol className="grid gap-2">
          {d.corrections.map((c) => (
            <li key={c.id} className="rounded-sm bg-subtle p-3 text-[14px]">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  → {attributionText(c.corrected_branch_status, c.corrected_branch_name)}
                </span>
                <CorrectionStatus c={c} />
              </p>
              <p className="text-secondary">
                Proposed by {c.proposed_by_name ?? 'a user'} on {formatDateTime(c.proposed_at)}: “{c.reason}”
              </p>
              {c.approved_at && (
                <p className="text-secondary">
                  Approved by {c.approved_by_name ?? 'a user'} on {formatDateTime(c.approved_at)}
                </p>
              )}
              {c.rejected_at && (
                <p className="text-secondary">
                  Rejected by {c.rejected_by_name ?? 'a user'} on {formatDateTime(c.rejected_at)}: “
                  {c.rejection_reason}”
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {d.can_propose && !open && (
        <div className="grid gap-3 border-t border-border pt-3">
          <SelectField
            label="Correct the branch to"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Choose…</option>
            {(catalogues.data?.branches ?? []).map((b) => (
              <option key={b.id} value={b.code ?? ''}>
                {b.label}
                {b.inactive ? ' (inactive)' : ''}
              </option>
            ))}
            <option value="other">Another branch (not listed)</option>
            <option value="not_applicable">No branch (not applicable)</option>
            <option value="not_provided">Not provided</option>
          </SelectField>
          <TextArea
            label="Reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            helper="10–500 characters. Another approver must agree before reports change."
          />
          <div>
            <Button
              variant="secondary"
              busy={propose.isPending}
              disabled={!target || reason.trim().length < 10}
              onClick={() => propose.mutate()}
            >
              Propose correction
            </Button>
          </div>
        </div>
      )}
      <div aria-live="polite">
        {propose.isSuccess && (
          <Alert tone="success">Correction proposed. It takes effect once approved.</Alert>
        )}
        {propose.isError && <ErrorBox error={propose.error} />}
      </div>
    </section>
  );
}
