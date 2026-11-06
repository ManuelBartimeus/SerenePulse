import { CLAIM_STATUS_LABELS, CLAIM_TYPES, type ClaimDetail, type ClaimStatus } from '@serene/proposals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { accountApi, claimQuery, claimsQuery, keys } from '../../api/queries';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { Banner, Button, KeyValue, PageSkeleton, cx } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { usePageTitle } from '../../ui/shell';
import type { UploadedFile } from '../../wizard/context';
import { FileUploader } from '../../wizard/file-field';
import { NotFoundPage } from '../errors';
import { CLAIM_PATH, CLAIM_PRINCIPLE, claimTone } from './status';

const route = getRouteApi('/app/claims/$id');

export function ClaimDetailPage() {
  const { id } = route.useParams();
  const { submitted } = route.useSearch();
  const q = useQuery(claimQuery(id));
  usePageTitle(q.data ? `Claim ${q.data.claimNo}` : 'Claim');
  if (q.isPending) return <PageSkeleton cards={3} />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.isError)
    return (
      <div className="wrap wrap-narrow py-10">
        <Banner tone="danger">{errorMessage(q.error)}</Banner>
      </div>
    );
  return <ClaimView claim={q.data} justSubmitted={!!submitted} />;
}

/** Steps of the visual timeline, with the off-path states slotted in where they happen. */
export function timelineSteps(
  c: Pick<ClaimDetail, 'status' | 'events'>,
): { status: ClaimStatus; state: 'done' | 'current' | 'todo' | 'stop'; at?: string }[] {
  const reached = new Map<ClaimStatus, string>();
  for (const e of c.events) reached.set(e.status, e.at);
  const out: { status: ClaimStatus; state: 'done' | 'current' | 'todo' | 'stop'; at?: string }[] = [];
  const curIdx = CLAIM_PATH.indexOf(c.status);
  const lastPathIdx = Math.max(curIdx, ...CLAIM_PATH.map((s, i) => (reached.has(s) ? i : -1)));
  CLAIM_PATH.forEach((s, i) => {
    const at = reached.get(s);
    let state: 'done' | 'current' | 'todo' =
      i < lastPathIdx ? 'done' : i === lastPathIdx ? 'current' : 'todo';
    if (s === 'settled' && c.status === 'settled') state = 'done';
    out.push({ status: s, state, ...(at ? { at } : {}) });
    if (
      s === 'under_review' &&
      (c.status === 'info_requested' || c.status === 'declined' || c.status === 'withdrawn')
    ) {
      out.forEach((x) => x.state === 'current' && (x.state = 'done'));
      out.push({
        status: c.status,
        state: c.status === 'info_requested' ? 'current' : 'stop',
        ...(reached.get(c.status) ? { at: reached.get(c.status) as string } : {}),
      });
    }
  });
  if (c.status === 'declined' || c.status === 'withdrawn') return out.filter((x) => x.state !== 'todo');
  return out;
}

function ClaimView({ claim: c, justSubmitted }: { claim: ClaimDetail; justSubmitted: boolean }) {
  const qc = useQueryClient();
  const type = CLAIM_TYPES.find((t) => t.id === c.claimType);
  const steps = timelineSteps(c);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [files, setFiles] = useState<Map<string, UploadedFile>>(new Map());
  const [extra, setExtra] = useState<string[]>([]);

  async function respond() {
    if (message.trim().length < 2 && extra.length === 0) {
      setErr('Write a reply or add a document.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const next = await accountApi.respondClaim(c.id, message.trim() || 'Documents added.');
      qc.setQueryData(keys.claim(c.id), next);
      void qc.invalidateQueries({ queryKey: claimsQuery.queryKey });
      setMessage('');
      setExtra([]);
      setSent(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap py-6 md:py-10">
      <Link to="/claims" className="btn btn-ghost -ml-3 text-secondary">
        <Icon name="arrowLeft" size={18} />
        All claims
      </Link>
      {c.status === 'draft' && (
        <Banner tone="warning" className="mt-3" title="This claim has not been sent yet">
          Add the documents below and send it. We start assessing as soon as we receive it.
        </Banner>
      )}
      {justSubmitted && (
        <div className="enter mt-3 rounded-[24px] bg-success-bg p-5 md:p-7" role="status">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--success-strong)] text-white">
            <Icon name="check" size={26} />
          </span>
          <p className="mt-4 text-[20px] leading-7 font-bold text-[#0f4a22]">
            Claim <span className="tnum">{c.claimNo}</span> received.
          </p>
          <p className="mt-1 text-[16px] text-[#155b2a]">{CLAIM_PRINCIPLE}</p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="h-display">
          Claim <span className="tnum">{c.claimNo}</span>
        </h1>
        <span className={`chip chip-${claimTone(c.status)}`}>{CLAIM_STATUS_LABELS[c.status]}</span>
      </div>
      <p className="mt-1 text-secondary">
        {type?.label ?? c.claimType} · {c.productName} · <span className="tnum">{c.policyNo}</span>
      </p>

      <section className="card card-pad mt-6" aria-labelledby="tl-h">
        <h2 id="tl-h" className="sr-only">
          Progress
        </h2>
        <ol className="m-0 grid list-none gap-0 p-0 md:flex md:items-start">
          {steps.map((s, i) => (
            <li
              key={s.status}
              className="relative flex gap-3 pb-5 last:pb-0 md:flex-1 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center"
            >
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute top-8 bottom-0 left-[15px] w-[2px] md:top-[15px] md:right-[-50%] md:bottom-auto md:left-1/2 md:h-[2px] md:w-auto',
                    s.state === 'done' ? 'bg-brand' : 'bg-border',
                  )}
                />
              )}
              <span
                className={cx(
                  'relative z-10 grid h-8 w-8 flex-none place-items-center rounded-full ring-4 ring-white',
                  s.state === 'done' && 'bg-brand text-white',
                  s.state === 'current' &&
                    (s.status === 'info_requested'
                      ? 'bg-warning text-white'
                      : 'bg-brand-50 text-brand ring-brand-100'),
                  s.state === 'todo' && 'border-[1.5px] border-border-strong bg-white text-muted',
                  s.state === 'stop' && 'bg-danger text-white',
                )}
              >
                {s.state === 'done' ? (
                  <Icon name="check" size={16} />
                ) : s.state === 'stop' ? (
                  <Icon name="close" size={16} />
                ) : s.state === 'current' ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-current" />
                ) : null}
              </span>
              <div className="min-w-0 pt-1 md:pt-0">
                <p className={cx('text-[15px] font-semibold', s.state === 'todo' && 'text-secondary')}>
                  {CLAIM_STATUS_LABELS[s.status]}
                </p>
                {s.at && <p className="text-[13px] text-secondary">{formatDate(s.at)}</p>}
                <span className="sr-only">
                  {s.state === 'done'
                    ? 'completed'
                    : s.state === 'current'
                      ? 'current stage'
                      : s.state === 'stop'
                        ? ''
                        : 'not reached yet'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 content-start gap-6">
          {c.staffMessage && (
            <section
              className={cx(
                'rounded-[20px] p-5 md:p-6',
                c.status === 'info_requested' ? 'bg-warning-bg' : 'card',
              )}
            >
              <h2 className="h-section">
                {c.status === 'info_requested' ? 'We need more from you' : 'Message from our claims team'}
              </h2>
              <p className="mt-2 whitespace-pre-line">{c.staffMessage}</p>
            </section>
          )}
          {c.status === 'draft' && type && <FinishDraft claim={c} docs={type.documents} />}
          {c.status === 'info_requested' && (
            <section className="card card-pad grid gap-5" aria-labelledby="reply-h">
              <h2 id="reply-h" className="h-section">
                Reply
              </h2>
              {sent && (
                <Banner tone="success" role="status">
                  Thank you. We’ve passed this to the claims team.
                </Banner>
              )}
              <div>
                <label htmlFor="claim-reply" className="label">
                  Your answer
                </label>
                <textarea
                  id="claim-reply"
                  className="input mt-2"
                  rows={4}
                  maxLength={5000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <FileUploader
                domId="claim-extra"
                fieldId="extra"
                kind="supporting_documents"
                label="Add documents"
                accept={['image', 'pdf']}
                multiple
                maxFiles={10}
                capture="environment"
                value={extra}
                onChange={(ids) => setExtra(ids ?? [])}
                files={files}
                addFile={(f) => setFiles((m) => new Map(m).set(f.id, f))}
                remove={(fid) => accountApi.deleteClaimFile(c.id, fid)}
                upload={async (fd, onProgress, signal) => {
                  fd.delete('fieldId');
                  const rec = await accountApi.uploadClaimFile(c.id, fd, onProgress, signal);
                  return { ...rec, fieldId: 'extra' };
                }}
              />
              {err && (
                <p className="error-text" role="alert">
                  {err}
                </p>
              )}
              <Button
                size="lg"
                onClick={() => void respond()}
                busy={busy}
                busyLabel="Sending"
                className="w-full tab:w-auto tab:justify-self-start"
              >
                Send to the claims team
              </Button>
            </section>
          )}
          <section className="card card-pad">
            <h2 className="h-section">What you told us</h2>
            <div className="mt-5">
              <KeyValue
                items={[
                  { label: 'Date of incident', value: formatDate(c.incidentDate) },
                  { label: 'Where', value: c.incidentLocation },
                  { label: 'Reported', value: formatDateTime(c.reportedAt) },
                  ...(c.estimatedAmount !== undefined
                    ? [{ label: 'Estimated loss', value: formatMoney(c.estimatedAmount) }]
                    : []),
                  ...(c.thirdParty && (c.thirdParty.name || c.thirdParty.phone || c.thirdParty.vehicleReg)
                    ? [
                        {
                          label: 'Other party',
                          value: [c.thirdParty.name, c.thirdParty.phone, c.thirdParty.vehicleReg]
                            .filter(Boolean)
                            .join(' · '),
                        },
                      ]
                    : []),
                ]}
              />
              <p className="mt-5 text-[13px] font-medium text-secondary">Description</p>
              <p className="mt-0.5 whitespace-pre-line">{c.description}</p>
            </div>
          </section>
        </div>
        <aside className="grid content-start gap-4">
          <section className="card card-pad">
            <h2 className="h-section">Documents</h2>
            {c.files.length === 0 ? (
              <p className="mt-2 text-[14px] text-secondary">None yet.</p>
            ) : (
              <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[14px]">
                {c.files.map((f) => (
                  <li key={f.id} className="flex min-w-0 items-start gap-2">
                    <Icon
                      name={f.mime === 'application/pdf' ? 'pdf' : 'file'}
                      size={16}
                      className="flex-none text-secondary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{f.name}</span>
                      <span className="block text-[13px] text-secondary">
                        {type?.documents.find((d) => d.kind === f.kind)?.label.split(' (')[0] ?? ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card card-pad text-[14px] text-secondary">
            <h2 className="h-section text-ink">Questions?</h2>
            <p className="mt-1">
              Call <a href="tel:+233302917444">030 291 7444</a> and quote{' '}
              <span className="tnum font-semibold text-ink">{c.claimNo}</span>.
            </p>
            <p className="mt-2">{CLAIM_PRINCIPLE}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function FinishDraft({
  claim,
  docs,
}: {
  claim: ClaimDetail;
  docs: readonly { kind: string; label: string; required: boolean }[];
}) {
  const qc = useQueryClient();
  const [files, setFiles] = useState<Map<string, UploadedFile>>(
    () => new Map(claim.files.map((f) => [f.id, { ...f, fieldId: f.kind }])),
  );
  const [byKind, setByKind] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const f of claim.files) m[f.kind] = [...(m[f.kind] ?? []), f.id];
    return m;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    const missing = docs.filter((d) => d.required && !byKind[d.kind]?.length);
    if (missing.length) {
      setErrors(Object.fromEntries(missing.map((d) => [d.kind, 'Please attach this.'])));
      document.getElementById(`d-doc-${missing[0]?.kind}`)?.focus();
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const next = await accountApi.submitClaim(claim.id);
      qc.setQueryData(keys.claim(claim.id), next);
      void qc.invalidateQueries({ queryKey: claimsQuery.queryKey });
    } catch (e) {
      setErr(errorMessage(e, 'We could not send your claim. Please try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card card-pad grid gap-6" aria-labelledby="finish-h">
      <h2 id="finish-h" className="h-section">
        Documents
      </h2>
      {docs.map((d) => (
        <FileUploader
          key={d.kind}
          domId={`d-doc-${d.kind}`}
          fieldId={d.kind}
          kind={d.kind}
          label={
            <>
              {d.label}
              {!d.required && <span className="font-normal text-secondary"> (optional)</span>}
            </>
          }
          accept={['image', 'pdf']}
          multiple
          maxFiles={d.kind === 'claim_photos' ? 12 : 5}
          capture="environment"
          value={byKind[d.kind] ?? []}
          onChange={(ids) => {
            setByKind((m) => ({ ...m, [d.kind]: ids ?? [] }));
            setErrors((e) => ({ ...e, [d.kind]: '' }));
          }}
          files={files}
          addFile={(f) => setFiles((m) => new Map(m).set(f.id, f))}
          remove={(fid) => accountApi.deleteClaimFile(claim.id, fid)}
          upload={async (fd, onProgress, signal) => {
            fd.delete('fieldId');
            const rec = await accountApi.uploadClaimFile(claim.id, fd, onProgress, signal);
            return { ...rec, fieldId: d.kind };
          }}
          error={errors[d.kind] || undefined}
        />
      ))}
      {err && (
        <p className="error-text" role="alert">
          {err}
        </p>
      )}
      <Button
        size="lg"
        onClick={() => void send()}
        busy={busy}
        busyLabel="Sending"
        className="w-full tab:w-auto tab:justify-self-start"
      >
        Send claim
      </Button>
    </section>
  );
}
