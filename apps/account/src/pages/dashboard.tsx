import {
  CLAIM_STATUS_LABELS,
  CLAIM_TYPES,
  productByCode,
  type ClaimSummary,
  type PolicySummary,
  type ProposalStatus,
  type ProposalSummary,
} from '@serene/proposals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { errorMessage } from '../api/client';
import { claimsQuery, meQuery, policiesQuery, policyQuery, proposalsQuery } from '../api/queries';
import { downloadCertificate } from '../lib/documents';
import {
  daysUntil,
  firstName,
  formatDate,
  formatMoney,
  greeting,
  renewalText,
  sentence,
} from '../lib/format';
import { Banner, Button, SectionTitle, Skeleton, StatusChip, cx } from '../ui/components';
import { Icon, type IconName } from '../ui/icons';
import { PAGE, TitleBand, usePageTitle } from '../ui/shell';
import { RenewButton, canClaim, isRenewable, useRenew } from './renew';
import { claimTone } from './claims/status';

export const CATEGORY_ICON: Record<string, IconName> = {
  motor: 'car',
  property: 'home',
  travel: 'plane',
  accident: 'people',
  liability: 'scale',
  financial: 'coins',
  engineering: 'crane',
  marine: 'ship',
  bonds: 'document',
};
export const productIcon = (code: string): IconName =>
  CATEGORY_ICON[productByCode(code)?.category ?? ''] ?? 'shield';

const IN_PROGRESS: readonly ProposalStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'info_requested',
  'quoted',
  'declined',
  'paid',
  'expired',
];

export function nextAction(p: ProposalSummary): {
  label: string;
  to: '/proposals/$id' | '/proposals/$id/pay';
  primary: boolean;
} {
  switch (p.status) {
    case 'draft':
      return { label: 'Continue', to: '/proposals/$id', primary: true };
    case 'info_requested':
      return { label: 'Respond to underwriter', to: '/proposals/$id', primary: true };
    case 'quoted':
      return { label: 'Pay now', to: '/proposals/$id/pay', primary: true };
    default:
      return { label: 'View', to: '/proposals/$id', primary: false };
  }
}

function statusLine(p: ProposalSummary): string {
  switch (p.status) {
    case 'draft':
      return `Last saved ${formatDate(p.updatedAt)}`;
    case 'submitted':
    case 'under_review':
      return 'An underwriter is pricing this. Usually within 1 working day.';
    case 'info_requested':
      return 'The underwriter needs more information from you.';
    case 'quoted':
      return p.quote
        ? `${formatMoney(p.quote.total)} · price valid until ${formatDate(p.quote.validUntil)}`
        : 'Your price is ready.';
    case 'declined':
      return 'We could not offer cover for this proposal.';
    case 'paid':
      return 'Payment received. Your policy is being issued.';
    case 'expired':
      return 'The price has expired. Start again for a new price.';
    default:
      return '';
  }
}

export function DashboardPage() {
  const me = useQuery(meQuery);
  const policies = useQuery(policiesQuery);
  const proposals = useQuery(proposalsQuery);
  const claims = useQuery(claimsQuery);
  const name = firstName(me.data?.fullName);
  usePageTitle('My account');

  const loading = policies.isPending || proposals.isPending;
  const activePolicies = (policies.data ?? []).filter(
    (p) => p.status === 'active' || (p.status === 'expired' && daysUntil(p.expiresOn) > -60),
  );
  const open = (proposals.data ?? []).filter((p) => IN_PROGRESS.includes(p.status));
  const openClaims = (claims.data ?? []).filter(
    (c) => !['settled', 'declined', 'withdrawn'].includes(c.status) || daysUntil(c.updatedAt) > -30,
  );
  const renewals = activePolicies.filter((p) => isRenewable(p));
  const claimable = activePolicies.filter((p) => canClaim(p));
  const onlyClaimable = claimable.length === 1 ? claimable[0] : undefined;
  const empty = !loading && activePolicies.length === 0 && open.length === 0;
  const claimText =
    'Tell us what happened and upload photos. We aim to settle within one week of your last document.';

  return (
    <>
      <TitleBand
        crumbs={[{ label: 'My account' }]}
        title={name ? `Hello, ${name}` : 'Your account'}
        intro={
          <>
            {greeting()}. Your policies, proposals and claims in one place.
            {me.data?.customerNo ? (
              <>
                {' '}
                Customer number <span className="tnum font-medium text-ink">{me.data.customerNo}</span>.
              </>
            ) : null}
          </>
        }
      />
      <div className={PAGE}>
        {(policies.isError || proposals.isError) && (
          <Banner tone="danger" className="mb-8" role="alert" title="Some of your account didn’t load">
            {errorMessage(policies.error ?? proposals.error)}
          </Banner>
        )}

        {renewals.length > 0 && (
          <div className="mb-10 grid gap-3">
            {renewals.map((p) => (
              <Banner
                key={p.id}
                tone="warning"
                icon="clock"
                title={`${p.productName}${p.insuredSubject ? ` for ${p.insuredSubject}` : ''}: ${renewalText(p.expiresOn).toLowerCase()}`}
                action={<RenewButton policy={p} size="sm" />}
              >
                Renew now so you stay covered. We copy your answers from last year.
              </Banner>
            ))}
          </div>
        )}

        <section aria-labelledby="quick-h">
          <h2 id="quick-h" className="h-content">
            Quick links
          </h2>
          <ul className="m-0 mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            <li>
              <Link to="/buy" className="qlink">
                <QuickLinkBody
                  icon="plus"
                  title="Buy insurance"
                  text="Motor, travel and home cover are priced as you answer. Business covers by an underwriter."
                  more="Get started"
                />
              </Link>
            </li>
            <li>
              <RenewQuickLink renewals={renewals} hasPolicies={activePolicies.length > 0} />
            </li>
            <li>
              {onlyClaimable ? (
                <Link to="/policies/$id/claim" params={{ id: onlyClaimable.id }} className="qlink">
                  <QuickLinkBody icon="claim" title="Make a claim" text={claimText} more="Start a claim" />
                </Link>
              ) : (
                <Link to="/claims" className="qlink">
                  <QuickLinkBody
                    icon="claim"
                    title="Make a claim"
                    text={claimText}
                    more={claimable.length ? 'Start a claim' : 'Your claims'}
                  />
                </Link>
              )}
            </li>
            <li>
              <a href="/verify/" className="qlink">
                <QuickLinkBody
                  icon="shieldCheck"
                  title="Verify a certificate"
                  text="Check that a Serene certificate of insurance is genuine, as the police and embassies do."
                  more="Check a certificate"
                />
              </a>
            </li>
          </ul>
        </section>

        {loading ? (
          <DashboardSkeleton />
        ) : empty ? (
          <EmptyState />
        ) : (
          <div className="mt-12 grid gap-12 lg:mt-16 lg:gap-16">
            <section aria-labelledby="policies-h" id="policies" className="scroll-mt-24">
              <SectionTitle id="policies-h" count={activePolicies.length}>
                Your policies
              </SectionTitle>
              {activePolicies.length === 0 ? (
                <p className="card card-pad text-secondary">
                  No active policies yet. When you pay for a proposal, your policy appears here.
                </p>
              ) : (
                <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
                  {activePolicies.map((p) => (
                    <li key={p.id}>
                      <PolicyCard policy={p} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {open.length > 0 && (
              <section aria-labelledby="proposals-h">
                <SectionTitle id="proposals-h" count={open.length}>
                  Proposals in progress
                </SectionTitle>
                <div className="rtable-wrap">
                  <table className="rtable">
                    <thead>
                      <tr>
                        <th scope="col">Cover</th>
                        <th scope="col">Status</th>
                        <th scope="col">Where it stands</th>
                        <th scope="col">
                          <span className="sr-only">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {open.map((p) => (
                        <ProposalRow key={p.id} p={p} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {openClaims.length > 0 && (
              <section aria-labelledby="claims-h">
                <SectionTitle
                  id="claims-h"
                  count={openClaims.length}
                  action={
                    <Link to="/claims" className="more min-h-11">
                      All claims
                      <Icon name="chevronRight" size={16} />
                    </Link>
                  }
                >
                  Claims
                </SectionTitle>
                <ClaimsTable claims={openClaims} />
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function QuickLinkBody({
  icon,
  title,
  text,
  more,
}: {
  icon: IconName;
  title: string;
  text: string;
  more: string;
}) {
  return (
    <>
      <span className="icon-tile max-sm:row-span-3" aria-hidden="true">
        <Icon name={icon} size={24} />
      </span>
      <span className="mt-4 block text-[18px] leading-7 font-semibold max-sm:mt-0">{title}</span>
      <span className="card-text mt-1.5 block max-sm:mt-0.5">{text}</span>
      <span className="more mt-auto pt-4 max-sm:pt-2">
        {more}
        <Icon name="chevronRight" size={16} />
      </span>
    </>
  );
}

function RenewQuickLink({ renewals, hasPolicies }: { renewals: PolicySummary[]; hasPolicies: boolean }) {
  const { renew, busy, err } = useRenew();
  const one = renewals.length === 1 ? renewals[0] : undefined;
  if (one)
    return (
      <div className="flex h-full flex-col">
        <button
          type="button"
          className="qlink flex-1"
          onClick={() => void renew(one)}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          <QuickLinkBody
            icon="refresh"
            title="Renew"
            text={`${one.insuredSubject || one.productName}: ${renewalText(one.expiresOn).toLowerCase()}. We copy last year’s answers.`}
            more={busy ? 'Starting renewal…' : 'Renew now'}
          />
        </button>
        {err && (
          <p className="error-text mt-2" role="alert">
            {err}
          </p>
        )}
      </div>
    );
  if (hasPolicies)
    return (
      <a href="#policies" className="qlink">
        <QuickLinkBody
          icon="refresh"
          title="Renew"
          text={
            renewals.length
              ? `${renewals.length} policies can be renewed now. We copy last year’s answers.`
              : 'Renew from 30 days before your cover ends. We copy last year’s answers.'
          }
          more="Your policies"
        />
      </a>
    );
  return (
    <Link to="/buy" search={{ product: 'MTR' }} className="qlink">
      <QuickLinkBody
        icon="refresh"
        title="Renew"
        text="Insured elsewhere? Start a motor proposal with us before your current cover ends."
        more="Start motor cover"
      />
    </Link>
  );
}

function PolicyCard({ policy: p }: { policy: PolicySummary }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const days = daysUntil(p.expiresOn);
  const soon = p.status === 'active' && days <= 30;
  async function download() {
    setBusy(true);
    setErr(null);
    try {
      const detail = await qc.fetchQuery(policyQuery(p.id));
      await downloadCertificate(detail);
    } catch (e) {
      setErr(errorMessage(e, 'The certificate could not be created. Please try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card flex h-full flex-col p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p className="kicker flex min-w-0 items-center gap-2 pt-0.5">
          <Icon name={productIcon(p.productCode)} size={16} className="flex-none text-brand" />
          <span className="min-w-0 break-words">{p.productName}</span>
        </p>
        <span
          className={cx(
            'chip flex-none',
            p.status === 'expired' ? 'chip-neutral' : soon ? 'chip-warning' : 'chip-success',
          )}
        >
          {p.status === 'expired' ? 'Expired' : soon ? 'Renew soon' : 'Active'}
        </span>
      </div>
      <h3 className="h-section mt-2 break-words">{p.insuredSubject || sentence(p.coverTitle)}</h3>
      <span className="accent-bar mt-3" aria-hidden="true" />
      <p className="card-text mt-3">{sentence(p.coverTitle)}</p>
      <dl className="m-0 mt-4 grid grid-cols-2 gap-3 text-[14px] leading-5">
        <div className="min-w-0">
          <dt className="text-secondary">Policy number</dt>
          <dd className="tnum m-0 mt-1 font-medium break-all">{p.policyNo}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-secondary">Covered until</dt>
          <dd className="m-0 mt-1 font-medium">{formatDate(p.expiresOn)}</dd>
        </div>
      </dl>
      <p
        className={cx(
          'mt-4 flex items-start gap-2 text-[14px] leading-5 font-medium',
          soon || p.status === 'expired' ? 'text-warning' : 'text-success',
        )}
      >
        <Icon name={soon || p.status === 'expired' ? 'clock' : 'shield'} size={18} className="flex-none" />
        {p.status === 'active' ? renewalText(p.expiresOn) : `Expired on ${formatDate(p.expiresOn)}`}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {isRenewable(p) ? (
          <RenewButton policy={p} size="sm" />
        ) : (
          <Button
            variant="soft"
            size="sm"
            onClick={() => void download()}
            busy={busy}
            busyLabel="Preparing PDF"
          >
            <Icon name="download" size={18} />
            Certificate
          </Button>
        )}
        <Link to="/policies/$id" params={{ id: p.id }} className="btn btn-secondary btn-sm">
          Details
        </Link>
      </div>
      {err && (
        <p className="error-text mt-2" role="alert">
          {err}
        </p>
      )}
    </article>
  );
}

function ProposalRow({ p }: { p: ProposalSummary }) {
  const action = nextAction(p);
  return (
    <tr>
      <td className="cell-title" data-label="Cover">
        <span className="flex items-start gap-3">
          <span className="icon-tile icon-tile-sm" aria-hidden="true">
            <Icon name={productIcon(p.productCode)} size={20} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{p.productName}</span>
            <span className="block text-[14px] leading-5 text-secondary">
              <span className="tnum">{p.proposalNo}</span>
              {p.insuredSubject ? ` · ${p.insuredSubject}` : ''}
            </span>
          </span>
        </span>
      </td>
      <td data-label="Status">
        <span>
          <StatusChip status={p.status} />
        </span>
      </td>
      <td data-label="Where it stands" className="text-secondary">
        {statusLine(p)}
      </td>
      <td className="cell-action">
        <Link
          to={action.to}
          params={{ id: p.id }}
          className={cx('btn btn-sm', action.primary ? 'btn-primary' : 'btn-secondary')}
        >
          {action.label}
          {action.primary && <Icon name="arrowRight" size={18} />}
        </Link>
      </td>
    </tr>
  );
}

/** Claims as a table from 640px and stacked cards below (dashboard, claims page). */
export function ClaimsTable({ claims }: { claims: ClaimSummary[] }) {
  return (
    <div className="rtable-wrap">
      <table className="rtable">
        <thead>
          <tr>
            <th scope="col">Claim</th>
            <th scope="col">Cover</th>
            <th scope="col">Reported</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => {
            const type = CLAIM_TYPES.find((t) => t.id === c.claimType)?.label;
            return (
              <tr key={c.id}>
                <td className="cell-title" data-label="Claim">
                  <Link
                    to="/claims/$id"
                    params={{ id: c.id }}
                    className="inline-flex min-h-11 items-center font-semibold"
                  >
                    Claim&nbsp;<span className="tnum">{c.claimNo}</span>
                  </Link>
                  {type && <span className="block text-[14px] leading-5 text-secondary">{type}</span>}
                </td>
                <td data-label="Cover">{c.productName}</td>
                <td data-label="Reported" className="tnum">
                  {formatDate(c.reportedAt)}
                </td>
                <td data-label="Status">
                  <span>
                    <span className={`chip chip-${claimTone(c.status)}`}>
                      {CLAIM_STATUS_LABELS[c.status]}
                    </span>
                  </span>
                </td>
                <td className="cell-action">
                  <Link
                    to="/claims/$id"
                    params={{ id: c.id }}
                    className="btn btn-secondary btn-sm"
                    aria-label={`Open claim ${c.claimNo}`}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <section
      className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      aria-labelledby="empty-h"
    >
      <div className="relative overflow-hidden rounded-[12px] bg-brand p-6 text-white sm:p-8 lg:p-10">
        <span className="accent-bar accent-bar-yellow" aria-hidden="true" />
        <h2 id="empty-h" className="mt-5 max-w-md text-[30px] leading-9 font-bold tracking-[-0.025em]">
          You don’t have any policies with us yet
        </h2>
        <p className="mt-3 max-w-md text-[16px] leading-[26px] text-white/90">
          Choose a cover, answer the proposal questions and sign on screen. For motor, travel and home you see
          the price as you go and get your certificate as soon as you pay.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link to="/buy" className="btn btn-lg btn-on-dark">
            Buy insurance
            <Icon name="arrowRight" size={18} />
          </Link>
          <a href="/insurance/" className="btn btn-lg btn-outline-dark">
            Compare covers
          </a>
        </div>
      </div>
      <div className="grid content-start gap-3">
        <h2 className="kicker pt-1">Priced instantly</h2>
        {[
          {
            code: 'MTR',
            title: 'Motor insurance',
            text: 'Third party, fire & theft, or comprehensive',
            icon: 'car' as const,
          },
          {
            code: 'TRV',
            title: 'Travel insurance',
            text: 'Accepted for Schengen visa applications',
            icon: 'plane' as const,
          },
          {
            code: 'HMF',
            title: 'Home insurance',
            text: 'Your house and what’s in it',
            icon: 'home' as const,
          },
        ].map((x) => (
          <Link
            key={x.code}
            to="/buy"
            search={{ product: x.code }}
            className="card card-link flex items-center gap-4 p-4 text-ink no-underline hover:text-ink"
          >
            <span className="icon-tile" aria-hidden="true">
              <Icon name={x.icon} size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{x.title}</span>
              <span className="block text-[14px] leading-5 text-secondary">{x.text}</span>
            </span>
            <Icon name="chevronRight" size={18} className="flex-none text-brand" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Loading your policies"
    >
      {[0, 1].map((i) => (
        <div key={i} className="card p-6">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-3 h-6 w-2/3" />
          <Skeleton className="mt-3 h-1.5 w-12" />
          <Skeleton className="mt-6 h-4 w-1/2" />
          <Skeleton className="mt-6 h-11 w-36" />
        </div>
      ))}
    </div>
  );
}
