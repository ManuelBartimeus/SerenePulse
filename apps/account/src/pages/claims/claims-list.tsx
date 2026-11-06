import { CLAIM_STATUS_LABELS, CLAIM_TYPES } from '@serene/proposals';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { errorMessage } from '../../api/client';
import { claimsQuery, policiesQuery } from '../../api/queries';
import { formatDate } from '../../lib/format';
import { Banner, PageSkeleton } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { usePageTitle } from '../../ui/shell';
import { canClaim } from '../renew';
import { CLAIM_PRINCIPLE, claimTone } from './status';

export function ClaimsListPage() {
  usePageTitle('Claims');
  const claims = useQuery(claimsQuery);
  const policies = useQuery(policiesQuery);
  if (claims.isPending) return <PageSkeleton />;
  const active = (policies.data ?? []).filter((p) => canClaim(p));
  return (
    <div className="wrap py-6 md:py-10">
      <Link to="/" className="btn btn-ghost -ml-3 text-secondary">
        <Icon name="arrowLeft" size={18} />
        My account
      </Link>
      <h1 className="h-display mt-2">Claims</h1>
      <p className="mt-2 max-w-2xl text-secondary">{CLAIM_PRINCIPLE}</p>
      {claims.isError && (
        <Banner tone="danger" className="mt-6">
          {errorMessage(claims.error)}
        </Banner>
      )}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Your claims">
          {(claims.data ?? []).length === 0 ? (
            <p className="card card-pad text-secondary">You haven’t reported any claims.</p>
          ) : (
            <ul className="card m-0 list-none divide p-0">
              {(claims.data ?? []).map((c) => (
                <li key={c.id}>
                  <Link
                    to="/claims/$id"
                    params={{ id: c.id }}
                    className="flex items-center gap-3 p-4 text-ink no-underline hover:bg-subtle md:p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="tnum font-semibold">{c.claimNo}</span>
                        <span className={`chip chip-${claimTone(c.status)}`}>
                          {CLAIM_STATUS_LABELS[c.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[14px] text-secondary">
                        {CLAIM_TYPES.find((t) => t.id === c.claimType)?.label ?? c.claimType} ·{' '}
                        {c.productName}
                      </p>
                      <p className="text-[13px] text-secondary">Reported {formatDate(c.reportedAt)}</p>
                    </div>
                    <Icon name="chevronRight" className="flex-none text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {active.length > 0 && (
          <aside className="card card-pad content-start">
            <h2 className="h-section">Report a new claim</h2>
            <p className="mt-1 text-[14px] text-secondary">Choose the policy it is about.</p>
            <div className="mt-4 grid gap-2">
              {active.map((p) => (
                <Link
                  key={p.id}
                  to="/policies/$id/claim"
                  params={{ id: p.id }}
                  className="btn btn-secondary btn-sm justify-between"
                >
                  <span className="truncate">{p.insuredSubject || p.productName}</span>
                  <Icon name="arrowRight" size={18} />
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
