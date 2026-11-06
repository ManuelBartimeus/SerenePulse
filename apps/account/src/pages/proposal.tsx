import { formById, productByCode, type ProposalStatus } from '@serene/proposals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { accountApi, keys, meQuery, proposalQuery } from '../api/queries';
import type { ProposalWithEvents } from '../api/types';
import { downloadProposal, type ProposalDocumentResponse } from '../lib/documents';
import { formatDate, formatDateTime, formatMoney } from '../lib/format';
import { Banner, Button, PageSkeleton, StatusChip, STATUS_LABEL, cx } from '../ui/components';
import { Icon } from '../ui/icons';
import { PAGE, TitleBand, usePageTitle } from '../ui/shell';
import { QuoteBreakdown } from '../wizard/quote-panel';
import { Wizard } from '../wizard/wizard';
import { NotFoundPage } from './errors';

const route = getRouteApi('/app/proposals/$id');

export function ProposalPage() {
  const { id } = route.useParams();
  const search = route.useSearch();
  const q = useQuery(proposalQuery(id));
  const me = useQuery(meQuery);
  if (q.isPending || me.isPending) return <PageSkeleton cards={3} />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.isError)
    return (
      <div className="wrap wrap-narrow py-10">
        <Banner
          tone="danger"
          title="We couldn’t load this proposal"
          action={<Button onClick={() => void q.refetch()}>Try again</Button>}
        >
          {errorMessage(q.error)}
        </Banner>
      </div>
    );
  const detail = q.data;
  const form = formById(detail.formId);
  const editable = detail.status === 'draft' || detail.status === 'info_requested';
  if (editable && form && form.steps.length > 0 && productByCode(detail.productCode))
    return (
      <Wizard
        key={detail.id}
        detail={detail}
        profile={me.data}
        requestedStep={search.step}
        renewed={!!search.renewed}
      />
    );
  return <ProposalStatusView detail={detail} justSubmitted={!!search.submitted} />;
}

const NEXT_TEXT: Partial<Record<ProposalStatus, string>> = {
  submitted:
    'Our underwriters will review your proposal and work out your price, usually within 1 working day. We’ll text you when it’s ready.',
  under_review: 'An underwriter is reviewing your proposal. We’ll text you when your price is ready.',
  quoted: 'Your price is ready. Pay to receive your policy and certificate straight away.',
  declined:
    'We are sorry we can’t offer cover this time. Call us on 030 291 7444 if you would like to talk it through.',
  paid: 'Payment received. Your policy is being issued and will appear on your account shortly.',
  issued: 'Your policy has been issued.',
  cancelled: 'This proposal was cancelled.',
  expired: 'The price for this proposal has expired. Start a new proposal for an up-to-date price.',
};

interface HistoryRow {
  at: string;
  text: string;
  note?: string;
}

const EVENT_TEXT: Record<string, string> = {
  created: 'Proposal started',
  submitted: 'Signed and submitted',
  resubmitted: 'Sent back to the underwriter',
  under_review: 'Opened by an underwriter',
  info_requested: 'More information requested',
  quoted: 'Price ready',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Price expired',
  payment_started: 'Payment started',
  payment_failed: 'Payment not completed',
  paid: 'Payment received',
  issued: 'Policy issued',
  policy_cancelled: 'Policy cancelled',
};

export function historyOf(d: ProposalWithEvents): HistoryRow[] {
  if (d.history && d.history.length)
    return d.history.map((h) => ({
      at: h.at,
      text:
        EVENT_TEXT[h.event] ??
        (h.toStatus ? STATUS_LABEL[h.toStatus as ProposalStatus] : h.event.replace(/_/g, ' ')),
      ...(h.note ? { note: h.note } : {}),
    }));
  const out: HistoryRow[] = [{ at: d.updatedAt, text: 'Proposal started' }];
  if (d.submittedAt) out.push({ at: d.submittedAt, text: 'Signed and submitted' });
  if (d.status !== 'draft' && d.status !== 'submitted')
    out.push({ at: d.updatedAt, text: STATUS_LABEL[d.status] });
  return out;
}

export function ProposalStatusView({
  detail,
  justSubmitted,
}: {
  detail: ProposalWithEvents;
  justSubmitted: boolean;
}) {
  usePageTitle(`Proposal ${detail.proposalNo}`);
  const me = useQuery(meQuery);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const withUnderwriter = detail.status === 'submitted' || detail.status === 'under_review';
  const history = historyOf(detail);

  async function download() {
    setBusy(true);
    setErr(null);
    try {
      const doc = (await accountApi.proposalDocument(detail.id)) as ProposalDocumentResponse;
      await downloadProposal(doc, {
        proposalNo: detail.proposalNo,
        productName: detail.productName,
        status: detail.status,
        phone: me.data?.phone ?? '',
        customerNo: me.data?.customerNo ?? '',
      });
    } catch (e) {
      setErr(errorMessage(e, 'The PDF could not be created. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TitleBand
        crumbs={[{ label: 'My account', to: '/' }, { label: `Proposal ${detail.proposalNo}` }]}
        title={detail.productName}
        aside={<StatusChip status={detail.status} />}
        intro={
          <>
            Proposal <span className="tnum font-medium text-ink">{detail.proposalNo}</span>
            {detail.insuredSubject ? ` · ${detail.insuredSubject}` : ''}
          </>
        }
      />
      <div className={PAGE}>
        {justSubmitted && withUnderwriter && (
          <div
            className="enter mb-8 rounded-[12px] border border-[#b7dcc8] bg-success-bg p-5 md:p-7"
            role="status"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--success-strong)] text-white">
              <Icon name="check" size={26} />
            </span>
            <p className="mt-4 text-[20px] leading-7 font-bold text-[#00492b] md:text-[24px] md:leading-8">
              Proposal <span className="tnum">{detail.proposalNo}</span> is with our underwriters.
            </p>
            <p className="mt-1 text-[16px] text-[#00492b]">
              We’ll text you when your price is ready. This is usually within 1 working day.
            </p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="grid min-w-0 content-start gap-6">
            {NEXT_TEXT[detail.status] && !(justSubmitted && withUnderwriter) && (
              <Banner
                tone={
                  detail.status === 'declined' ? 'danger' : detail.status === 'quoted' ? 'success' : 'info'
                }
              >
                {NEXT_TEXT[detail.status]}
              </Banner>
            )}
            {detail.staffMessage && (
              <section className="card card-pad">
                <h2 className="h-section">Message from the underwriter</h2>
                <p className="mt-2 whitespace-pre-line">{detail.staffMessage}</p>
              </section>
            )}
            {detail.status === 'quoted' && detail.quote && (
              <section className="card card-pad">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="h-section">Your price</h2>
                  <span className="text-[14px] text-secondary">
                    Valid until {formatDate(detail.quote.validUntil)}
                  </span>
                </div>
                {detail.quote.underwriterNote && (
                  <p className="mt-2 rounded-[8px] bg-subtle p-3 text-[14px] leading-[22px]">
                    {detail.quote.underwriterNote}
                  </p>
                )}
                <div className="mt-4">
                  <QuoteBreakdown quote={detail.quote} />
                </div>
                <Link
                  to="/proposals/$id/pay"
                  params={{ id: detail.id }}
                  className="btn btn-primary btn-lg mt-6 w-full sm:w-auto"
                >
                  Pay {formatMoney(detail.quote.total)}
                  <Icon name="arrowRight" size={18} />
                </Link>
              </section>
            )}
            {detail.status === 'issued' && detail.policyId && (
              <Link
                to="/policies/$id"
                params={{ id: detail.policyId }}
                className="btn btn-primary btn-lg w-full sm:w-fit"
              >
                View your policy
                <Icon name="arrowRight" size={18} />
              </Link>
            )}
            <section className="card card-pad" aria-labelledby="hist-h">
              <h2 id="hist-h" className="h-section">
                History
              </h2>
              <ol className="m-0 mt-5 list-none p-0">
                {history.map((ev, i) => {
                  const last = i === history.length - 1;
                  return (
                    <li key={`${ev.text}-${ev.at}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
                      {!last && (
                        <span
                          className="absolute top-7 bottom-0 left-[13px] w-[2px] bg-border"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={cx(
                          'relative z-10 grid h-7 w-7 flex-none place-items-center rounded-full',
                          last ? 'bg-brand text-white' : 'bg-accent-surface text-brand ring-1 ring-brand-100',
                        )}
                      >
                        <Icon name="check" size={15} />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="font-medium">{ev.text}</p>
                        <p className="text-[14px] text-secondary">{formatDateTime(ev.at)}</p>
                        {ev.note && <p className="mt-0.5 text-[14px] text-secondary">{ev.note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
          <aside className="grid content-start gap-4">
            <section className="card card-pad">
              <h2 className="h-section">Documents</h2>
              <Button
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => void download()}
                busy={busy}
                busyLabel="Preparing PDF"
              >
                <Icon name="download" size={18} />
                Proposal form (PDF)
              </Button>
              {err && (
                <p className="error-text mt-2" role="alert">
                  {err}
                </p>
              )}
              {detail.files.length > 0 && (
                <>
                  <h3 className="mt-5 text-[14px] font-bold text-secondary">Attached</h3>
                  <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[14px]">
                    {detail.files.map((f) => (
                      <li key={f.id} className="flex min-w-0 items-center gap-2">
                        <Icon
                          name={f.mime === 'application/pdf' ? 'pdf' : 'file'}
                          size={16}
                          className="flex-none text-secondary"
                        />
                        <span className="truncate">{f.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            {detail.signature && (
              <section className="card card-pad text-[14px]">
                <h2 className="h-section">Signed</h2>
                <p className="mt-2">
                  {detail.signature.signedName} · {formatDateTime(detail.signature.signedAt)}
                </p>
              </section>
            )}
            {(detail.status === 'submitted' ||
              detail.status === 'under_review' ||
              detail.status === 'quoted') && (
              <CancelProposal
                id={detail.id}
                onDone={() => void qc.invalidateQueries({ queryKey: keys.proposal(detail.id) })}
              />
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function CancelProposal({ id, onDone }: { id: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirm)
    return (
      <button
        type="button"
        className="btn btn-danger-ghost btn-sm justify-self-start"
        onClick={() => setConfirm(true)}
      >
        Cancel this proposal
      </button>
    );
  return (
    <div className="card card-pad">
      <p className="font-semibold">Cancel this proposal?</p>
      <p className="mt-1 text-[14px] text-secondary">You can start a new one at any time.</p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await accountApi.cancel(id);
              onDone();
            } finally {
              setBusy(false);
              setConfirm(false);
            }
          }}
        >
          Yes, cancel it
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
