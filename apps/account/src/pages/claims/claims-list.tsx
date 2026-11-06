import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { errorMessage } from '../../api/client';
import { claimsQuery, policiesQuery } from '../../api/queries';
import { Banner, PageSkeleton, SectionTitle } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { PAGE, PHONE_DISPLAY, PHONE_TEL, TitleBand, usePageTitle } from '../../ui/shell';
import { ClaimsTable, productIcon } from '../dashboard';
import { canClaim } from '../renew';
import { CLAIM_PRINCIPLE } from './status';

export function ClaimsListPage() {
  usePageTitle('Claims');
  const claims = useQuery(claimsQuery);
  const policies = useQuery(policiesQuery);
  if (claims.isPending) return <PageSkeleton />;
  const active = (policies.data ?? []).filter((p) => canClaim(p));
  const list = claims.data ?? [];
  return (
    <>
      <TitleBand
        crumbs={[{ label: 'My account', to: '/' }, { label: 'Claims' }]}
        title="Claims"
        intro={CLAIM_PRINCIPLE}
      />
      <div className={PAGE}>
        {claims.isError && (
          <Banner tone="danger" className="mb-8">
            {errorMessage(claims.error)}
          </Banner>
        )}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <section aria-labelledby="your-claims-h" className="min-w-0">
            <SectionTitle id="your-claims-h" count={list.length}>
              Your claims
            </SectionTitle>
            {list.length === 0 ? (
              <p className="card card-pad text-secondary">You haven’t reported any claims.</p>
            ) : (
              <ClaimsTable claims={list} />
            )}
          </section>
          <aside className="grid content-start gap-4">
            {active.length > 0 && (
              <section className="card card-pad" aria-labelledby="new-claim-h">
                <h2 id="new-claim-h" className="h-section">
                  Report a new claim
                </h2>
                <span className="accent-bar mt-3" aria-hidden="true" />
                <p className="card-text mt-3">Choose the policy it is about.</p>
                <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                  {active.map((p) => (
                    <li key={p.id}>
                      <Link
                        to="/policies/$id/claim"
                        params={{ id: p.id }}
                        className="btn btn-secondary w-full justify-between text-left"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon
                            name={productIcon(p.productCode)}
                            size={18}
                            className="flex-none text-brand"
                          />
                          <span className="min-w-0 break-words">{p.insuredSubject || p.productName}</span>
                        </span>
                        <Icon name="arrowRight" size={18} className="flex-none" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="card card-pad">
              <h2 className="h-section">Urgent help</h2>
              <p className="card-text mt-1">
                Someone injured, or the vehicle can’t be moved? Call us now on{' '}
                <a href={`tel:${PHONE_TEL}`} className="font-medium">
                  {PHONE_DISPLAY}
                </a>
                .
              </p>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
