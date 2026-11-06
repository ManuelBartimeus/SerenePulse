// Report a claim: type → what happened → documents → review and submit.
import {
  claimTypesFor,
  productByCode,
  type ClaimDetail,
  type CreateClaimRequest,
  type PolicySummary,
} from '@serene/proposals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../api/client';
import { accountApi, keys, policyQuery } from '../../api/queries';
import {
  formatDate,
  formatMoney,
  formatPhoneInput,
  isoDay,
  parseAmount,
  formatAmountInput,
} from '../../lib/format';
import { Banner, Button, PageSkeleton, cx } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { TextArea, TextInput } from '../../ui/inputs';
import { ActionBar, Breadcrumbs, usePageTitle } from '../../ui/shell';
import type { UploadedFile } from '../../wizard/context';
import { FileUploader } from '../../wizard/file-field';
import { StepBar, StepList, type StepState } from '../../wizard/stepper';
import { CLAIM_PRINCIPLE } from './status';

const route = getRouteApi('/app/policies/$id/claim');
const STEPS = ['What happened', 'Details', 'Documents', 'Review'] as const;

interface Draft {
  claimType: string;
  incidentDate: string;
  incidentLocation: string;
  description: string;
  amount: string;
  tpName: string;
  tpPhone: string;
  tpReg: string;
}
const emptyDraft: Draft = {
  claimType: '',
  incidentDate: '',
  incidentLocation: '',
  description: '',
  amount: '',
  tpName: '',
  tpPhone: '',
  tpReg: '',
};
const isThirdParty = (id: string) => id.startsWith('motor_third_party');

export function NewClaimPage() {
  const { id } = route.useParams();
  const policy = useQuery(policyQuery(id));
  usePageTitle('Report a claim');
  if (policy.isPending) return <PageSkeleton />;
  if (policy.isError)
    return (
      <div className="wrap wrap-narrow py-10">
        <Banner tone="danger">{errorMessage(policy.error)}</Banner>
      </div>
    );
  return <ClaimFlow policy={policy.data} />;
}

function ClaimFlow({ policy }: { policy: PolicySummary }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const storeKey = `serene.claimDraft.${policy.id}`;
  const category = productByCode(policy.productCode)?.category ?? 'property';
  const types = useMemo(() => claimTypesFor(category), [category]);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = sessionStorage.getItem(storeKey);
      return raw ? { ...emptyDraft, ...(JSON.parse(raw) as Partial<Draft>) } : emptyDraft;
    } catch {
      return emptyDraft;
    }
  });
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [files, setFiles] = useState<Map<string, UploadedFile>>(new Map());
  const [byKind, setByKind] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const type = types.find((t) => t.id === draft.claimType);

  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft, storeKey]);

  const up = (k: keyof Draft, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };
  const go = (i: number) => {
    setStep(i);
    setFailure(null);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }),
    );
  };
  const focusFirst = (e: Record<string, string>) => {
    const k = Object.keys(e).find((x) => e[x]);
    if (k) document.getElementById(`c-${k}`)?.focus();
  };

  function validateDetails(): Record<string, string> {
    const e: Record<string, string> = {};
    const today = isoDay(new Date());
    if (!draft.incidentDate) e.incidentDate = 'Enter the date it happened.';
    else if (draft.incidentDate > today) e.incidentDate = 'The date cannot be in the future.';
    else if (draft.incidentDate < policy.startsOn)
      e.incidentDate = `Your cover started on ${formatDate(policy.startsOn)}. Enter a date on or after that.`;
    if (draft.incidentLocation.trim().length < 3) e.incidentLocation = 'Tell us where it happened.';
    if (draft.description.trim().length < 20)
      e.description = 'Describe what happened in a few sentences (at least 20 characters).';
    if (draft.amount && parseAmount(draft.amount) === null)
      e.amount = 'Enter an amount in cedis, or leave it blank.';
    if (type && isThirdParty(type.id) && draft.tpPhone && draft.tpPhone.replace(/\D/g, '').length < 10)
      e.tpPhone = 'Enter a full phone number, or leave it blank.';
    return e;
  }

  async function next() {
    setFailure(null);
    if (step === 0) {
      if (!type) {
        setErrors({ claimType: 'Choose what happened.' });
        document.getElementById('c-claimType')?.focus();
        return;
      }
      return go(1);
    }
    if (step === 1) {
      if (claim) return go(2);
      const e = validateDetails();
      setErrors(e);
      if (Object.values(e).some(Boolean)) return focusFirst(e);
      setBusy(true);
      try {
        const amount = parseAmount(draft.amount);
        const thirdParty =
          type && isThirdParty(type.id) && (draft.tpName || draft.tpPhone || draft.tpReg)
            ? {
                ...(draft.tpName.trim() ? { name: draft.tpName.trim() } : {}),
                ...(draft.tpPhone.trim() ? { phone: draft.tpPhone.trim() } : {}),
                ...(draft.tpReg.trim() ? { vehicleReg: draft.tpReg.trim().toUpperCase() } : {}),
              }
            : undefined;
        const req: CreateClaimRequest = {
          claimType: draft.claimType,
          incidentDate: draft.incidentDate,
          incidentLocation: draft.incidentLocation.trim(),
          description: draft.description.trim(),
          ...(amount !== null ? { estimatedAmount: amount } : {}),
          ...(thirdParty ? { thirdParty } : {}),
        };
        setClaim(await accountApi.createClaim(policy.id, req));
        go(2);
      } catch (err) {
        setFailure(errorMessage(err, 'We could not start your claim. Please try again.'));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 2 && type) {
      const missing = type.documents.filter((d) => d.required && !byKind[d.kind]?.length);
      if (missing.length) {
        const e = Object.fromEntries(missing.map((d) => [`doc_${d.kind}`, 'Please attach this.']));
        setErrors(e);
        document.getElementById(`c-doc-${missing[0]?.kind}`)?.focus();
        return;
      }
      setErrors({});
      return go(3);
    }
    if (step === 3 && claim) {
      setBusy(true);
      try {
        const done = await accountApi.submitClaim(claim.id);
        sessionStorage.removeItem(storeKey);
        qc.setQueryData(keys.claim(done.id), done);
        void qc.invalidateQueries({ queryKey: keys.claims });
        await navigate({ to: '/claims/$id', params: { id: done.id }, search: { submitted: true } });
      } catch (err) {
        setFailure(errorMessage(err, 'We could not submit your claim. Please try again.'));
        setBusy(false);
      }
    }
  }

  const stepStates: StepState[] = STEPS.map((title, i) => ({
    step: { index: i, id: `s${i}`, title, kind: 'claim' },
    done: i < step,
    reachable: i <= step && !(claim && i < 2),
  }));
  const nextLabel = step === 3 ? 'Submit claim' : 'Continue';

  return (
    <>
      <div className="band band-compact">
        <div className="wrap">
          <Breadcrumbs
            items={[
              { label: 'My account', to: '/' },
              { label: `Policy ${policy.policyNo}`, to: '/policies/$id', params: { id: policy.id } },
              { label: 'Report a claim' },
            ]}
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="meta min-w-0">
              <span className="hidden sm:inline">
                <span className="font-medium text-ink">Claim</span> · {policy.productName} ·{' '}
              </span>
              <span className="tnum">{policy.policyNo}</span>
            </p>
            <Link to="/policies/$id" params={{ id: policy.id }} className="btn btn-ghost btn-sm -mr-3">
              Cancel
            </Link>
          </div>
          <div className="mt-2 lg:hidden">
            <StepBar steps={stepStates} current={step} onGo={go} label="Claim progress" />
          </div>
        </div>
      </div>

      <div className="wrap grid gap-8 pt-6 sm:pt-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:pt-10">
        <aside className="hidden lg:block">
          <div className="sticky top-[88px]">
            <StepList steps={stepStates} current={step} onGo={go} label="Claim progress" />
          </div>
        </aside>
        <div key={step} className="enter min-w-0 max-w-[760px]">
          {step === 0 && (
            <>
              <h1 className="h-display outline-none" tabIndex={-1}>
                What happened?
              </h1>
              <p className="mt-2 text-secondary">
                {policy.insuredSubject ? `${policy.insuredSubject} · ` : ''}
                {policy.coverTitle}
              </p>
              <Banner tone="neutral" icon="clock" className="mt-5">
                {CLAIM_PRINCIPLE}
              </Banner>
              <fieldset
                className="m-0 mt-6 border-0 p-0"
                aria-describedby={errors.claimType ? 'c-claimType-err' : undefined}
              >
                <legend className="sr-only">Type of claim</legend>
                <div className="grid gap-2.5 sm:grid-cols-2" id="c-claimType" tabIndex={-1}>
                  {types.map((t) => (
                    <label key={t.id} className={cx('option', errors.claimType && 'option-invalid')}>
                      <input
                        type="radio"
                        name="claimType"
                        checked={draft.claimType === t.id}
                        onChange={() => up('claimType', t.id)}
                        disabled={!!claim}
                      />
                      <span className="radio-dot mt-0.5" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block font-semibold">{t.label}</span>
                        <span className="mt-0.5 block text-[14px] leading-5 text-secondary">{t.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.claimType && (
                  <p id="c-claimType-err" className="error-text mt-2">
                    {errors.claimType}
                  </p>
                )}
              </fieldset>
              <p className="mt-6 text-[14px] text-secondary">
                Someone injured, or the vehicle can’t be moved? Call us now on{' '}
                <a href="tel:+233302917444">030 291 7444</a>.
              </p>
            </>
          )}

          {step === 1 && type && (
            <>
              <h1 className="h-display outline-none" tabIndex={-1}>
                Tell us about it
              </h1>
              <p className="mt-2 text-secondary">{type.label}</p>
              {claim ? (
                <Banner tone="info" className="mt-5">
                  Your claim <span className="tnum font-semibold">{claim.claimNo}</span> has been started with
                  these details. If anything is wrong, call us on 030 291 7444 after you submit.
                </Banner>
              ) : null}
              <div className="card card-pad mt-6 grid gap-6">
                <TextInput
                  id="c-incidentDate"
                  label="When did it happen?"
                  type="date"
                  value={draft.incidentDate}
                  onChange={(v) => up('incidentDate', v)}
                  min={policy.startsOn}
                  max={isoDay(new Date())}
                  error={errors.incidentDate}
                  disabled={!!claim}
                  className="max-w-xs"
                />
                <TextInput
                  id="c-incidentLocation"
                  label="Where did it happen?"
                  hint="Town and street, landmark or GhanaPost GPS address."
                  value={draft.incidentLocation}
                  onChange={(v) => up('incidentLocation', v)}
                  error={errors.incidentLocation}
                  maxLength={200}
                  disabled={!!claim}
                />
                <TextArea
                  id="c-description"
                  label="What happened?"
                  hint="In your own words: what you were doing, what happened and what was damaged or lost."
                  value={draft.description}
                  onChange={(v) => up('description', v)}
                  error={errors.description}
                  maxLength={5000}
                  rows={6}
                  disabled={!!claim}
                />
                {isThirdParty(type.id) && (
                  <div className="grid gap-5 rounded-[8px] bg-subtle p-4">
                    <p className="font-semibold">The other party</p>
                    <TextInput
                      id="c-tpName"
                      label="Their name"
                      optional
                      value={draft.tpName}
                      onChange={(v) => up('tpName', v)}
                      autoComplete="off"
                    />
                    <div className="grid gap-5 tab:grid-cols-2">
                      <TextInput
                        id="c-tpPhone"
                        label="Their phone number"
                        optional
                        type="tel"
                        inputMode="tel"
                        value={draft.tpPhone}
                        onChange={(v) => up('tpPhone', formatPhoneInput(v))}
                        error={errors.tpPhone}
                        autoComplete="off"
                      />
                      <TextInput
                        id="c-tpReg"
                        label="Their vehicle registration"
                        optional
                        value={draft.tpReg}
                        onChange={(v) => up('tpReg', v.toUpperCase())}
                        autoCapitalize="characters"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}
                <TextInput
                  id="c-amount"
                  label="Roughly how much is the loss?"
                  optional
                  hint="Your best estimate. Leave it blank if you don’t know yet."
                  prefix="GH₵"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(v) => up('amount', formatAmountInput(v))}
                  error={errors.amount}
                  className="max-w-sm"
                  disabled={!!claim}
                />
              </div>
            </>
          )}

          {step === 2 && type && claim && (
            <>
              <h1 className="h-display outline-none" tabIndex={-1}>
                Documents
              </h1>
              <p className="mt-2 text-secondary">
                Photos are fine. The sooner we have everything, the sooner we can settle.
              </p>
              <div className="mt-6 grid gap-4">
                {type.documents.map((d) => (
                  <div key={d.kind} className="card card-pad">
                    <FileUploader
                      domId={`c-doc-${d.kind}`}
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
                        setErrors((e) => ({ ...e, [`doc_${d.kind}`]: '' }));
                      }}
                      files={files}
                      addFile={(f) => setFiles((m) => new Map(m).set(f.id, f))}
                      remove={(fid) => accountApi.deleteClaimFile(claim.id, fid)}
                      upload={async (fd, onProgress, signal) => {
                        fd.delete('fieldId');
                        const rec = await accountApi.uploadClaimFile(claim.id, fd, onProgress, signal);
                        return { ...rec, fieldId: d.kind };
                      }}
                      error={errors[`doc_${d.kind}`] || undefined}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 3 && type && claim && (
            <>
              <h1 className="h-display outline-none" tabIndex={-1}>
                Check and submit
              </h1>
              <div className="card mt-6 overflow-hidden">
                <dl className="m-0 divide">
                  {[
                    ['Claim number', <span className="tnum">{claim.claimNo}</span>],
                    ['What happened', type.label],
                    ['Date', formatDate(draft.incidentDate)],
                    ['Where', draft.incidentLocation],
                    ['Description', draft.description],
                    ...(draft.amount
                      ? [['Estimated loss', formatMoney(parseAmount(draft.amount) ?? 0)] as const]
                      : []),
                    ...(isThirdParty(type.id) && (draft.tpName || draft.tpPhone || draft.tpReg)
                      ? [
                          [
                            'Other party',
                            [draft.tpName, draft.tpPhone, draft.tpReg].filter(Boolean).join(' · '),
                          ] as const,
                        ]
                      : []),
                    [
                      'Documents',
                      type.documents
                        .filter((d) => byKind[d.kind]?.length)
                        .map((d) => `${d.label} (${byKind[d.kind]?.length})`)
                        .join(', ') || 'None',
                    ],
                  ].map(([k, v], i) => (
                    <div key={i} className="grid gap-1 px-5 py-3 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6">
                      <dt className="text-[14px] text-secondary">{k}</dt>
                      <dd className="m-0 font-semibold break-words whitespace-pre-line">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <Banner tone="neutral" icon="clock" className="mt-5">
                {CLAIM_PRINCIPLE}
              </Banner>
            </>
          )}

          {failure && (
            <Banner tone="danger" className="mt-6" role="alert">
              {failure}
            </Banner>
          )}

          <div className="mt-8 hidden items-center justify-between gap-3 lg:flex">
            {step > 0 && !(claim && step === 2) ? (
              <Button variant="secondary" size="lg" onClick={() => go(step - 1)}>
                <Icon name="arrowLeft" size={18} />
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button
              size="lg"
              onClick={() => void next()}
              busy={busy}
              busyLabel={step === 3 ? 'Submitting' : 'Saving'}
            >
              {nextLabel}
              {step < 3 && <Icon name="arrowRight" size={18} />}
            </Button>
          </div>
        </div>
      </div>

      <div className="h-12 lg:h-16" aria-hidden="true" />

      <ActionBar>
        <div className="flex gap-2">
          {step > 0 && !(claim && step === 2) && (
            <button
              type="button"
              className="btn btn-secondary btn-lg btn-icon !h-12 !w-12 flex-none !p-0"
              onClick={() => go(step - 1)}
              aria-label="Back"
            >
              <Icon name="arrowLeft" />
            </button>
          )}
          <Button
            size="lg"
            block
            onClick={() => void next()}
            busy={busy}
            busyLabel={step === 3 ? 'Submitting' : 'Saving'}
          >
            {nextLabel}
          </Button>
        </div>
      </ActionBar>
    </>
  );
}
