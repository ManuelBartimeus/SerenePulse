import { CLAIM_STATUS_LABELS } from '@serene/proposals';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { accountApi, claimsQuery, meQuery, policyQuery, proposalQuery } from '../api/queries';
import { downloadCertificate, downloadProposal, type ProposalDocumentResponse } from '../lib/documents';
import { daysUntil, formatDate, formatDateTime, formatMoney, renewalText, sentence } from '../lib/format';
import { Banner, Button, KeyValue, PageSkeleton, cx } from '../ui/components';
import { Icon } from '../ui/icons';
import { PAGE, TitleBand, usePageTitle } from '../ui/shell';
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
    <>
      <TitleBand
        crumbs={[{ label: 'My account', to: '/' }, { label: `Policy ${p.policyNo}` }]}
        title={p.insuredSubject || sentence(p.coverTitle)}
        aside={
          <span
            className={cx(
              'chip',
              p.status === 'active'
                ? days <= 30
                  ? 'chip-warning'
                  : 'chip-success'
                : p.status === 'expired'
                  ? 'chip-neutral'
                  : 'chip-danger',
            )}
          >
            {p.status === 'active' ? 'Active' : p.status === 'expired' ? 'Expired' : 'Cancelled'}
          </span>
        }
        intro={
          <span className="flex items-start gap-2">
            <Icon name={productIcon(p.productCode)} size={18} className="mt-1 flex-none text-brand" />
            <span>
              {p.productName} · {sentence(p.coverTitle)} ·{' '}
              {p.status === 'active' ? renewalText(p.expiresOn) : `Ended ${formatDate(p.expiresOn)}`}
            </span>
          </span>
        }
      >
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button size="lg" onClick={() => void cert()} busy={busy === 'cert'} busyLabel="Preparing PDF">
            <Icon name="download" size={18} />
            Download certificate
          </Button>
          {isRenewable(p) && <RenewButton policy={p} size="lg" variant="secondary" />}
          {canClaim(p) && (
            <Link to="/policies/$id/claim" params={{ id: p.id }} className="btn btn-secondary btn-lg">
              <Icon name="claim" size={18} />
              Report a claim
            </Link>
          )}
        </div>
      </TitleBand>
      <div className={PAGE}>
        {err && (
          <Banner tone="danger" className="mb-6" role="alert">
            {err}
          </Banner>
        )}
        {days <= 30 && days >= 0 && p.status === 'active' && (
          <Banner tone="warning" icon="clock" className="mb-6">
            This policy ends on {formatDate(p.expiresOn)}. Renew before then to stay covered without a gap.
          </Banner>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="grid min-w-0 content-start gap-6">
            <section className="card card-pad" aria-labelledby="pd-h">
              <h2 id="pd-h" className="h-section">
                Policy details
              </h2>
              <span className="accent-bar mt-3" aria-hidden="true" />
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
                  <h3 className="h-card-sm">On your certificate</h3>
                  <dl className="m-0 mt-3 grid gap-x-6 gap-y-3 tab:grid-cols-2">
                    {[
                      ...c.numberedItems,
                      ...c.facts.filter((f) => !/^(date|time) of issue$/i.test(f.label)),
                    ].map((f) => (
                      <div key={f.label} className="min-w-0">
                        <dt className="text-[14px] leading-5 text-secondary">{sentence(f.label)}</dt>
                        <dd className="m-0 mt-1 font-medium break-words">{f.value}</dd>
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
                className="mt-3 block rounded-[8px] bg-subtle p-3 text-[14px] leading-5 font-medium break-all"
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
    </>
  );
}
