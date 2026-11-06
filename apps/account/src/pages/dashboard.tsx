import {
  CLAIM_STATUS_LABELS,
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
import { Banner, Button, Skeleton, StatusChip, cx } from '../ui/components';
import { Icon, Leaf, type IconName } from '../ui/icons';
import { usePageTitle } from '../ui/shell';
import { RenewButton, canClaim, isRenewable } from './renew';
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
  const empty = !loading && activePolicies.length === 0 && open.length === 0;

  return (
    <div className="wrap py-6 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{greeting()}</p>
          <h1 className="h-display mt-1 break-words">{name ? `Hello, ${name}` : 'Your account'}</h1>
        </div>
        {!empty && (
          <Link to="/buy" className="btn btn-primary hidden md:inline-flex">
            <Icon name="plus" size={18} />
            Buy insurance
          </Link>
        )}
      </div>

      {(policies.isError || proposals.isError) && (
        <Banner tone="danger" className="mt-6" role="alert" title="Some of your account didn’t load">
          {errorMessage(policies.error ?? proposals.error)}
        </Banner>
      )}

      {renewals.map((p) => (
        <Banner
          key={p.id}
          tone="warning"
          icon="clock"
          className="mt-6"
          title={`${p.productName}${p.insuredSubject ? ` for ${p.insuredSubject}` : ''}: ${renewalText(p.expiresOn).toLowerCase()}`}
          action={<RenewButton policy={p} size="sm" />}
        >
          Renew now so you stay covered. We copy your details from last year.
        </Banner>
      ))}

      {loading ? (
        <DashboardSkeleton />
      ) : empty ? (
        <EmptyState />
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="grid min-w-0 content-start gap-10">
            <section aria-labelledby="policies-h">
              <SectionHead id="policies-h" title="Your policies" count={activePolicies.length} />
              {activePolicies.length === 0 ? (
                <p className="card card-pad text-secondary">
                  No active policies yet. When you pay for a proposal, your policy appears here.
                </p>
              ) : (
                <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
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
                <SectionHead id="proposals-h" title="Proposals in progress" count={open.length} />
                <ul className="card m-0 list-none divide p-0">
                  {open.map((p) => (
                    <li key={p.id}>
                      <ProposalRow p={p} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {openClaims.length > 0 && (
              <section aria-labelledby="claims-h">
                <SectionHead id="claims-h" title="Claims" count={openClaims.length} />
                <ul className="card m-0 list-none divide p-0">
                  {openClaims.map((c) => (
                    <li key={c.id}>
                      <ClaimRow c={c} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="grid content-start gap-4">
            <BuyCard />
            <ClaimCard policies={activePolicies.filter((p) => canClaim(p))} />
          </aside>
        </div>
      )}
    </div>
  );
}

function SectionHead({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <div className="mb-4 flex items-baseline gap-2">
      <h2 id={id} className="h-section">
        {title}
      </h2>
      <span className="tnum text-[15px] font-semibold text-muted">{count}</span>
    </div>
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
    <article className="card flex h-full flex-col overflow-hidden">
      <div className="relative bg-brand px-5 pt-5 pb-5 text-white">
        <Leaf className="pointer-events-none absolute right-4 bottom-4 text-accent" size={56} />
        <div className="flex items-center gap-2 text-[14px] font-semibold text-white/85">
          <Icon name={productIcon(p.productCode)} size={18} />
          {p.productName}
        </div>
        <p className="mt-2 pr-14 text-[20px] leading-7 font-bold break-words">
          {p.insuredSubject || sentence(p.coverTitle)}
        </p>
        <p className="mt-1 text-[14px] text-white/85">{sentence(p.coverTitle)}</p>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <dl className="m-0 grid grid-cols-2 gap-3 text-[14px]">
          <div className="min-w-0">
            <dt className="text-secondary">Policy number</dt>
            <dd className="tnum m-0 mt-0.5 font-semibold break-all">{p.policyNo}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-secondary">Covered until</dt>
            <dd className="m-0 mt-0.5 font-semibold">{formatDate(p.expiresOn)}</dd>
          </div>
        </dl>
        <p
          className={cx(
            'flex items-center gap-2 text-[14px] font-semibold',
            soon || p.status === 'expired' ? 'text-warning' : 'text-success',
          )}
        >
          <Icon name={soon || p.status === 'expired' ? 'clock' : 'shield'} size={18} />
          {p.status === 'active' ? renewalText(p.expiresOn) : `Expired on ${formatDate(p.expiresOn)}`}
        </p>
        <div className="mt-auto flex flex-wrap gap-2">
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
          <p className="error-text" role="alert">
            {err}
          </p>
        )}
      </div>
    </article>
  );
}

function ProposalRow({ p }: { p: ProposalSummary }) {
  const action = nextAction(p);
  return (
    <div className="flex flex-col gap-3 p-4 tab:flex-row tab:items-center tab:gap-4 md:p-5">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-50 text-brand">
          <Icon name={productIcon(p.productCode)} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-semibold">{p.productName}</p>
            <StatusChip status={p.status} />
          </div>
          <p className="mt-0.5 text-[14px] text-secondary">
            <span className="tnum">{p.proposalNo}</span>
            {p.insuredSubject ? ` · ${p.insuredSubject}` : ''}
          </p>
          <p className="mt-1 text-[14px] text-secondary">{statusLine(p)}</p>
        </div>
      </div>
      <Link
        to={action.to}
        params={{ id: p.id }}
        className={cx(
          'btn btn-sm flex-none self-stretch tab:self-auto',
          action.primary ? 'btn-primary' : 'btn-secondary',
        )}
      >
        {action.label}
        {action.primary && <Icon name="arrowRight" size={18} />}
      </Link>
    </div>
  );
}

function ClaimRow({ c }: { c: ClaimSummary }) {
  return (
    <Link
      to="/claims/$id"
      params={{ id: c.id }}
      className="flex items-center gap-3 p-4 text-ink no-underline hover:bg-subtle md:p-5"
    >
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-surface-muted text-ink">
        <Icon name="document" size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-semibold">
            Claim <span className="tnum">{c.claimNo}</span>
          </p>
          <span className={`chip chip-${claimTone(c.status)}`}>{CLAIM_STATUS_LABELS[c.status]}</span>
        </div>
        <p className="mt-0.5 text-[14px] text-secondary">
          {c.productName} · reported {formatDate(c.reportedAt)}
        </p>
      </div>
      <Icon name="chevronRight" className="flex-none text-muted" />
    </Link>
  );
}

function BuyCard() {
  return (
    <div className="card card-pad">
      <h2 className="h-section">Buy insurance</h2>
      <p className="mt-1 text-[15px] text-secondary">
        Motor, travel and home cover are priced instantly. Business covers are priced by an underwriter.
      </p>
      <div className="mt-4 grid gap-2">
        <Link to="/buy" search={{ product: 'MTR' }} className="btn btn-secondary btn-sm justify-start">
          <Icon name="car" size={18} /> Motor insurance
        </Link>
        <Link to="/buy" search={{ product: 'TRV' }} className="btn btn-secondary btn-sm justify-start">
          <Icon name="plane" size={18} /> Travel insurance
        </Link>
        <Link to="/buy" className="btn btn-primary btn-sm">
          See all 28 covers
        </Link>
      </div>
    </div>
  );
}

function ClaimCard({ policies }: { policies: PolicySummary[] }) {
  if (policies.length === 0) return null;
  return (
    <div className="card card-pad">
      <h2 className="h-section">Report a claim</h2>
      <p className="mt-1 text-[15px] text-secondary">
        Tell us what happened and upload your documents. We aim to settle every claim within one week of
        receiving your last document.
      </p>
      <div className="mt-4 grid gap-2">
        {policies.map((p) => (
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
    </div>
  );
}

function EmptyState() {
  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="relative overflow-hidden rounded-[28px] bg-brand p-6 text-white md:p-10">
        <Leaf className="pointer-events-none absolute right-6 bottom-6 text-accent" size={96} />
        <h2 className="max-w-md text-[26px] leading-8 font-bold tracking-tight md:text-[32px] md:leading-10">
          You don’t have any policies with us yet
        </h2>
        <p className="mt-3 max-w-md text-[16px] leading-6 text-white/90">
          Choose a cover, answer the proposal questions and sign on screen. For motor, travel and home you see
          the price as you go and get your certificate as soon as you pay.
        </p>
        <Link to="/buy" className="btn btn-lg mt-8 bg-white text-brand no-underline hover:bg-brand-50">
          Buy insurance
          <Icon name="arrowRight" size={18} />
        </Link>
      </div>
      <div className="grid gap-3">
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
            className="card flex items-center gap-4 p-4 text-ink no-underline transition-colors hover:border-brand"
          >
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand-50 text-brand">
              <Icon name={x.icon} size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{x.title}</span>
              <span className="block text-[14px] text-secondary">{x.text}</span>
            </span>
            <span className="chip chip-success hidden flex-none tab:inline-flex">Instant price</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading your policies">
      {[0, 1].map((i) => (
        <div key={i} className="card overflow-hidden">
          <Skeleton className="h-28 rounded-none" />
          <div className="p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-3 h-4 w-1/3" />
            <Skeleton className="mt-6 h-11 w-36 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
