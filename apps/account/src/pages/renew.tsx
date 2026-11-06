import { formById, productByCode, type PolicySummary } from '@serene/proposals';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { errorMessage } from '../api/client';
import { accountApi, keys } from '../api/queries';
import { daysUntil } from '../lib/format';
import { coverStepIndex } from '../lib/wizard';
import { Button } from '../ui/components';
import { Icon } from '../ui/icons';

/** Claims can be reported once cover has started (the incident must fall inside the cover period). */
export function canClaim(p: Pick<PolicySummary, 'status' | 'startsOn'>, today = new Date()): boolean {
  return p.status === 'active' && daysUntil(p.startsOn, today) <= 0;
}

/** Active policies expiring within 30 days, and recently expired ones, can be renewed. */
export function isRenewable(p: Pick<PolicySummary, 'status' | 'expiresOn'>, today = new Date()): boolean {
  if (p.status === 'cancelled') return false;
  const d = daysUntil(p.expiresOn, today);
  return d <= 30 && d > -90;
}

/** Starts a renewal draft for a policy and opens it at the cover step. */
export function useRenew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function renew(policy: PolicySummary) {
    setBusy(true);
    setErr(null);
    try {
      const draft = await accountApi.renew(policy.id);
      qc.setQueryData(keys.proposal(draft.id), draft);
      void qc.invalidateQueries({ queryKey: keys.proposals });
      const form = formById(draft.formId || productByCode(policy.productCode)?.formId || '');
      const step = form ? coverStepIndex(form) : 0;
      await navigate({ to: '/proposals/$id', params: { id: draft.id }, search: { step, renewed: true } });
    } catch (e) {
      setErr(errorMessage(e, 'We could not start the renewal. Please try again.'));
      setBusy(false);
    }
  }
  return { renew, busy, err };
}

export function RenewButton({
  policy,
  size,
  block,
  variant,
}: {
  policy: PolicySummary;
  size?: 'sm' | 'lg';
  block?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const { renew, busy, err } = useRenew();
  return (
    <span className={block ? 'flex flex-col gap-1' : 'inline-flex flex-col gap-1'}>
      <Button
        size={size}
        block={block}
        variant={variant}
        onClick={() => void renew(policy)}
        busy={busy}
        busyLabel="Starting renewal"
      >
        <Icon name="refresh" size={18} />
        Renew
      </Button>
      {err && (
        <span className="error-text" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
