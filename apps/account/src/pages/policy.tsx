import { CLAIM_STATUS_LABELS } from '@serene/proposals';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { accountApi, claimsQuery, meQuery, policyQuery, proposalQuery } from '../api/queries';
import { downloadCertificate, downloadProposal, type ProposalDocumentResponse } from '../lib/documents';
import { daysUntil, formatDate, formatDateTime, formatMoney, renewalText, sentence } from '../lib/format';
import { Banner, Button, KeyValue, PageSkeleton, cx } from '../ui/components';
import { Icon, Leaf } from '../ui/icons';
import { usePageTitle } from '../ui/shell';
import { claimTone } from './claims/status';
import { productIcon } from './dashboard';
import { NotFoundPage } from './errors';
import { RenewButton, canClaim, isRenewable } from './renew';

const route = getRouteApi('/app/policies/$id');
const NETWORK_LABEL = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', airteltigo: 'AirtelTigo Money' } as const;

export function PolicyPage() {
  const { id } = route.useParams();
  const q = useQuery(policyQuery(id));
  const me = useQuery(meQuery);
  const proposal = useQuery({ ...proposalQuery(q.data?.proposalId ?? ''), enabled: !!q.data?.proposalId });
  const claims = useQuery(claimsQuery);
  const [busy, setBusy] = useState<'cert' | 'prop' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  usePageTitle(q.data ? `Policy ${q.data.policyNo}` : 'Policy');

  if (q.isPending) return <PageSkeleton cards={3} />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.isError)
    return (
      <div className="wrap wrap-narrow py-10">
        <Banner tone="danger">{errorMessage(q.error)}</Banner>
      </div>
    );
  const p = q.data;
  const c = p.certificate;
  const days = daysUntil(p.expiresOn);
  const verifyUrl =
    c.verifyUrl ?? `${location.origin}/verify?certificate=${encodeURIComponent(p.certificateNo)}`;
  const policyClaims = (claims.data ?? []).filter((x) => x.policyId === p.id);

  async function cert() {
    setBusy('cert');
    setErr(null);
    try {
      await downloadCertificate(p);
    } catch (e) {
      setErr(errorMessage(e, 'The certificate could not be created. Please try again.'));
    } finally {
      setBusy(null);
    }
  }
  async function prop() {
    setBusy('prop');
    setErr(null);
    try {
      const doc = (await accountApi.proposalDocument(p.proposalId)) as ProposalDocumentResponse;
      await downloadProposal(doc, {
        proposalNo: proposal.data?.proposalNo ?? p.policyNo,
        productName: p.productName,
        status: proposal.data?.status ?? 'issued',
        phone: me.data?.phone ?? '',
        customerNo: me.data?.customerNo ?? c.customerNo,
      });
    } catch (e) {
      setErr(errorMessage(e, 'The proposal PDF could not be created. Please try again.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="wrap py-6 md:py-10">
      <Link to="/" className="btn btn-ghost -ml-3 text-secondary">
        <Icon name="arrowLeft" size={18} />
        My account
      </Link>

      <section className="relative mt-3 overflow-hidden rounded-[28px] bg-brand p-6 text-white md:p-9">
        <Leaf className="pointer-events-none absolute right-5 bottom-5 text-accent" size={88} />
        <p className="flex items-center gap-2 text-[15px] font-semibold text-white/85">
          <Icon name={productIcon(p.productCode)} size={18} />
          {p.productName} · {sentence(p.coverTitle)}
        </p>
        <h1 className="mt-2 pr-16 text-[26px] leading-8 font-bold tracking-tight break-words md:text-[34px] md:leading-[42px]">
          {p.insuredSubject || sentence(p.coverTitle)}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span
            className={cx(
              'chip',
              p.status === 'active' ? 'bg-white text-[#155b2a]' : 'bg-white/15 text-white',
            )}
          >
            {p.status === 'active' ? 'Active' : p.status === 'expired' ? 'Expired' : 'Cancelled'}
          </span>
          <span className="text-[15px] text-white/90">
            {p.status === 'active' ? renewalText(p.expiresOn) : `Ended ${formatDate(p.expiresOn)}`}
          </span>
        </div>
        <div className="mt-6 flex flex-col gap-2 tab:flex-row tab:flex-wrap">
          <Button
            className="!bg-white !text-brand hover:!bg-brand-50"
            size="lg"
            onClick={() => void cert()}
            busy={busy === 'cert'}
            busyLabel="Preparing PDF"
          >
            <Icon name="download" size={18} />
            Download certificate
          </Button>
          {isRenewable(p) && <RenewButton policy={p} size="lg" />}
          {canClaim(p) && (
            <Link
              to="/policies/$id/claim"
              params={{ id: p.id }}
              className="btn btn-lg border-white/50 bg-transparent text-white no-underline hover:bg-white/10"
            >
              Report a claim
            </Link>
          )}
        </div>
      </section>
      {err && (
        <Banner tone="danger" className="mt-4" role="alert">
          {err}
        </Banner>
      )}
      {days <= 30 && days >= 0 && p.status === 'active' && (
        <Banner tone="warning" icon="clock" className="mt-4">
          This policy ends on {formatDate(p.expiresOn)}. Renew before then to stay covered without a gap.
        </Banner>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 content-start gap-6">
          <section className="card card-pad" aria-labelledby="pd-h">
            <h2 id="pd-h" className="h-section">
              Policy details
            </h2>
            <div className="mt-5">
              <KeyValue
                items={[
                  { label: 'Policy number', value: <span className="tnum">{p.policyNo}</span> },
                  { label: 'Certificate number', value: <span className="tnum">{p.certificateNo}</span> },
                  { label: 'Policy holder', value: c.policyHolder },
                  { label: 'Customer number', value: <span className="tnum">{c.customerNo}</span> },
                  { label: 'Cover starts', value: formatDate(p.startsOn) },
                  { label: 'Cover ends', value: formatDate(p.expiresOn) },
                  { label: 'Premium', value: <span className="tnum">{formatMoney(p.premium)}</span> },
                  { label: 'Issued', value: formatDateTime(p.issuedAt) },
                ]}
              />
            </div>
            {(c.numberedItems.length > 0 || c.facts.length > 0) && (
              <div className="mt-6 border-t border-border-subtle pt-5">
                <h3 className="text-[15px] font-bold">On your certificate</h3>
                <dl className="m-0 mt-3 grid gap-x-6 gap-y-3 tab:grid-cols-2">
                  {[
                    ...c.numberedItems,
                    ...c.facts.filter((f) => !/^(date|time) of issue$/i.test(f.label)),
                  ].map((f) => (
                    <div key={f.label} className="min-w-0">
                      <dt className="text-[13px] text-secondary">{sentence(f.label)}</dt>
                      <dd className="m-0 font-semibold break-words">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>

          <section className="card card-pad" aria-labelledby="rc-h">
            <h2 id="rc-h" className="h-section">
              Payment receipt
            </h2>
            <div className="mt-5">
              <KeyValue
                items={[
                  { label: 'Receipt', value: <span className="tnum">{p.payment.reference}</span> },
                  { label: 'Amount', value: <span className="tnum">{formatMoney(p.payment.amount)}</span> },
                  {
                    label: 'Paid with',
                    value: `${p.payment.method === 'momo' ? (p.payment.network ? NETWORK_LABEL[p.payment.network] : 'Mobile Money') : 'Card'} · ${p.payment.maskedAccount}`,
                  },
                  { label: 'Paid on', value: formatDateTime(p.payment.completedAt ?? p.payment.createdAt) },
                ]}
              />
            </div>
          </section>

          {policyClaims.length > 0 && (
            <section className="card overflow-hidden" aria-labelledby="cl-h">
              <h2 id="cl-h" className="h-section px-5 pt-5 md:px-7 md:pt-7">
                Claims on this policy
              </h2>
              <ul className="m-0 mt-3 list-none divide p-0">
                {policyClaims.map((cl) => (
                  <li key={cl.id}>
                    <Link
                      to="/claims/$id"
                      params={{ id: cl.id }}
                      className="flex items-center justify-between gap-3 px-5 py-4 text-ink no-underline hover:bg-subtle md:px-7"
                    >
                      <span className="min-w-0">
                        <span className="tnum block font-semibold">{cl.claimNo}</span>
                        <span className="block text-[14px] text-secondary">
                          Reported {formatDate(cl.reportedAt)}
                        </span>
                      </span>
                      <span className={`chip chip-${claimTone(cl.status)}`}>
                        {CLAIM_STATUS_LABELS[cl.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <section className="card card-pad">
            <h2 className="h-section">Documents</h2>
            <div className="mt-4 grid gap-2">
              <Button
                variant="secondary"
                onClick={() => void cert()}
                busy={busy === 'cert'}
                busyLabel="Preparing PDF"
                className="justify-start"
              >
                <Icon name="pdf" size={18} />
                Certificate of insurance
              </Button>
              <Button
                variant="secondary"
                onClick={() => void prop()}
                busy={busy === 'prop'}
                busyLabel="Preparing PDF"
                className="justify-start"
              >
                <Icon name="pdf" size={18} />
                My proposal form
              </Button>
              <Link
                to="/proposals/$id"
                params={{ id: p.proposalId }}
                className="btn btn-ghost btn-sm justify-start"
              >
                Proposal and its history
                <Icon name="arrowRight" size={18} />
              </Link>
            </div>
          </section>
          <section className="card card-pad">
            <h2 className="h-section">Check this certificate</h2>
            <p className="mt-1 text-[14px] text-secondary">
              Anyone, such as the police or an embassy, can confirm this certificate is genuine at this
              address. The certificate PDF carries the same link as a QR code.
            </p>
            <a
              href={verifyUrl}
              className="mt-3 block rounded-xl bg-subtle p-3 text-[14px] font-semibold break-all"
              target="_blank"
              rel="noopener"
            >
              {verifyUrl.replace(/^https?:\/\//, '')}
            </a>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-2 -ml-3"
              onClick={() => {
                void navigator.clipboard?.writeText(verifyUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              <Icon name="copy" size={18} />
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <span className="sr-only" role="status">
              {copied ? 'Link copied' : ''}
            </span>
          </section>
          <section className="card card-pad text-[14px] text-secondary">
            <h2 className="h-section text-ink">Need help?</h2>
            <p className="mt-1">
              Call <a href="tel:+233302917444">030 291 7444</a> and quote your policy number.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
