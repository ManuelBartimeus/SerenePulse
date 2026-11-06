// The proposal wizard: form steps (from the FormDefinition) → Review → Sign → (Pay).
import {
  allFields,
  formById,
  productByCode,
  validateStep,
  visibleFields,
  visibleSections,
  type AnswerValue,
  type Answers,
  type CustomerProfile,
  type FieldError,
  type FormDefinition,
  type Product,
  type ProposalFile,
} from '@serene/proposals';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { accountApi, keys } from '../api/queries';
import type { ProposalWithEvents } from '../api/types';
import {
  applyPrefill,
  baseFieldId,
  clampStep,
  declarationStep,
  deriveCoverEnd,
  errorTargetId,
  firstInvalidStep,
  hasRatingInput,
  nextStepIndex,
  prevStepIndex,
  ratingFingerprint,
  stepOfFirstError,
  visibleWizardSteps,
  wizardSteps,
} from '../lib/wizard';
import { Banner, Button, LiveText, Sheet, cx } from '../ui/components';
import { Icon } from '../ui/icons';
import { ActionBar, Breadcrumbs, usePageTitle } from '../ui/shell';
import { WizardContext, type UploadedFile, type WizardCtx } from './context';
import { FieldRenderer } from './fields';
import { QuoteBarButton, QuoteSheetBody, QuoteSidebar, type QuoteState } from './quote-panel';
import { ReviewStep } from './review';
import { SignStep, allConfirmations, validateSign, type SignErrors, type SignState } from './sign';
import { StepBar, StepList, type StepState } from './stepper';

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

const sentenceCase = (s: string) =>
  s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s;

export function Wizard({
  detail,
  profile,
  requestedStep,
  renewed,
}: {
  detail: ProposalWithEvents;
  profile: CustomerProfile | undefined;
  requestedStep: number | undefined;
  renewed: boolean;
}) {
  const form = formById(detail.formId) as FormDefinition;
  const product = productByCode(detail.productCode) as Product;
  const instant = product.purchase === 'instant';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [answers, setAnswers] = useState<Answers>(() => applyPrefill(form, detail.answers, profile));
  const [files, setFiles] = useState<Map<string, UploadedFile>>(
    () => new Map(detail.files.map((f) => [f.id, f])),
  );
  const [attempted, setAttempted] = useState<Set<number>>(() => new Set());
  const [serverErrors, setServerErrors] = useState<FieldError[]>([]);
  const [focusToken, setFocusToken] = useState(0);
  const [save, setSave] = useState<SaveState>('idle');
  const [quote, setQuote] = useState<QuoteState>(
    detail.quote ? { kind: 'ready', quote: detail.quote } : { kind: 'idle' },
  );
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [sign, setSign] = useState<SignState>(() => ({
    confirmations: {},
    signedName: String(
      answers[allFields(form).find((x) => x.field.role === 'insuredName')?.field.id ?? ''] ??
        profile?.fullName ??
        '',
    ),
    signature: null,
    marketingConsent: profile?.marketingConsent ?? false,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---- Step ------------------------------------------------------------------------------------
  const [maxReached, setMaxReached] = useState(() => Math.max(detail.currentStep, 0));
  const stepIndex = useMemo(() => {
    const wanted = requestedStep ?? detail.currentStep;
    let s = clampStep(form, answers, wanted);
    if (s > maxReached) {
      const bad = firstInvalidStep(form, answers);
      if (bad !== null && bad < s) s = bad;
    }
    return s;
  }, [requestedStep, detail.currentStep, form, answers, maxReached]);
  useEffect(() => {
    if (stepIndex > maxReached) setMaxReached(stepIndex);
  }, [stepIndex, maxReached]);

  const all = wizardSteps(form);
  const current = all[stepIndex] ?? all[0];
  const n = form.steps.length;
  usePageTitle(current ? `${current.title} · ${product.name}` : product.name);

  // ---- Autosave ------------------------------------------------------------------------------------
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const maxRef = useRef(maxReached);
  maxRef.current = Math.max(maxReached, stepIndex);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const locked = useRef(false);
  const lastQuoted = useRef<string | null>(detail.quote ? ratingFingerprint(form, detail.answers) : null);
  const quoteAbort = useRef<AbortController | null>(null);

  const requote = useCallback(async () => {
    if (!instant) return;
    const fp = ratingFingerprint(form, answersRef.current);
    if (fp === lastQuoted.current || !hasRatingInput(form, answersRef.current)) return;
    lastQuoted.current = fp;
    quoteAbort.current?.abort();
    const ac = new AbortController();
    quoteAbort.current = ac;
    setQuote((q) => ({
      kind: 'loading',
      previous: q.kind === 'ready' ? q.quote : q.kind === 'loading' ? q.previous : undefined,
    }));
    try {
      const q = await accountApi.quote(detail.id, ac.signal);
      if (!ac.signal.aborted) setQuote({ kind: 'ready', quote: q });
    } catch (e) {
      if (ac.signal.aborted) return;
      lastQuoted.current = null;
      setQuote({
        kind: 'unavailable',
        message:
          e instanceof ApiError && e.status === 422 && /referred/i.test(e.problem?.title ?? '')
            ? 'We can’t price this automatically. Carry on: an underwriter will price it after you submit, usually within 1 working day.'
            : e instanceof ApiError && e.status === 422
              ? 'Answer the remaining cover questions to see your price.'
              : 'We couldn’t work out a price just now. You can carry on; we’ll try again as you answer.',
      });
    }
  }, [instant, form, detail.id]);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (locked.current) return;
    if (inFlight.current) {
      await inFlight.current;
      if (!dirty.current) return;
    }
    if (!dirty.current) return;
    dirty.current = false;
    setSave('saving');
    const run = (async () => {
      try {
        await accountApi.saveDraft(detail.id, { answers: answersRef.current, currentStep: maxRef.current });
        setSave('saved');
        void requote();
      } catch (e) {
        dirty.current = true;
        setSave(navigator.onLine ? 'error' : 'offline');
        if (!(e instanceof ApiError && e.status === 409))
          timer.current = window.setTimeout(() => void flush(), 5000);
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [detail.id, requote]);

  const schedule = useCallback(() => {
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 1200);
  }, [flush]);

  // Save on leaving the page (keepalive survives the unload).
  useEffect(() => {
    const onHide = () => {
      if (dirty.current && !locked.current) {
        dirty.current = false;
        void accountApi
          .saveDraft(
            detail.id,
            { answers: answersRef.current, currentStep: maxRef.current },
            { keepalive: true },
          )
          .catch(() => undefined);
      }
    };
    const onVis = () => document.visibilityState === 'hidden' && onHide();
    const onOnline = () => dirty.current && void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      onHide();
      window.clearTimeout(timer.current);
    };
  }, [detail.id, flush]);

  // Prefilled answers are saved once so the draft reflects them.
  useEffect(() => {
    if (JSON.stringify(answers) !== JSON.stringify(detail.answers)) schedule();
    if (instant && !detail.quote) void requote();
  }, []);

  // ---- Answers -------------------------------------------------------------------------------------
  const set = useCallback(
    (key: string, value: AnswerValue | undefined) => {
      setAnswers((prev) => {
        const rest = Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)) as Answers;
        const next: Answers = value === undefined ? rest : { ...rest, [key]: value };
        return deriveCoverEnd(form, prev, next);
      });
      setServerErrors((xs) => (xs.length ? xs.filter((e) => baseFieldId(e.field) !== baseFieldId(key)) : xs));
      schedule();
    },
    [form, schedule],
  );

  const ctx: WizardCtx = useMemo(
    () => ({
      proposalId: detail.id,
      form,
      answers,
      set,
      errors: [],
      files,
      addFile: (f) => setFiles((m) => new Map(m).set(f.id, f)),
      removeFile: (id) =>
        setFiles((m) => {
          const c = new Map(m);
          c.delete(id);
          return c;
        }),
      upload: async (fd, onProgress, signal) =>
        (await accountApi.uploadFile(detail.id, fd, onProgress, signal)) as ProposalFile,
      remove: async (id) => {
        await accountApi.deleteFile(detail.id, id);
        setFiles((m) => {
          const c = new Map(m);
          c.delete(id);
          return c;
        });
      },
    }),
    [detail.id, form, answers, set, files],
  );

  // ---- Errors ---------------------------------------------------------------------------------------
  const stepErrs: FieldError[] = useMemo(() => {
    if (current?.kind === 'form' && (attempted.has(stepIndex) || serverErrors.length)) {
      const live = attempted.has(stepIndex) ? validateStep(current.step, answers) : [];
      const fieldsHere = new Set(current.step.sections.flatMap((s) => s.fields.map((f) => f.id)));
      const server = serverErrors.filter(
        (e) =>
          fieldsHere.has(baseFieldId(e.field)) && !live.some((l) => l.field === e.field && l.row === e.row),
      );
      return [...live, ...server];
    }
    if (current?.kind === 'sign' && attempted.has(stepIndex))
      return validateStep(declarationStep(form), answers);
    return [];
  }, [current, attempted, stepIndex, answers, serverErrors, form]);
  const signErrs: SignErrors = useMemo(() => validateSign(form, sign), [form, sign]);
  const showSignErrors = current?.kind === 'sign' && attempted.has(stepIndex);

  const ctxWithErrors = useMemo(() => ({ ...ctx, errors: stepErrs }), [ctx, stepErrs]);

  useEffect(() => {
    if (!focusToken) return;
    const first = stepErrs[0];
    const target = first
      ? document.getElementById(errorTargetId(first))
      : current?.kind === 'sign'
        ? document.getElementById(
            Object.keys(signErrs)[0]?.startsWith('c:')
              ? `f-c-${Object.keys(signErrs)[0]?.slice(2)}`
              : Object.keys(signErrs)[0] === 'name'
                ? 'f-signed-name'
                : 'f-signature',
          )
        : null;
    const summary = document.getElementById('error-summary');
    (target ?? summary)?.focus({ preventScroll: true });
    (target ?? summary)?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [focusToken]);

  // ---- Navigation -------------------------------------------------------------------------------------
  const goTo = useCallback(
    (index: number) => {
      void flush();
      setSubmitError(null);
      void navigate({ to: '/proposals/$id', params: { id: detail.id }, search: { step: index } });
      window.scrollTo({ top: 0, behavior: 'auto' });
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }),
      );
    },
    [flush, navigate, detail.id],
  );

  function onContinue() {
    if (!current) return;
    if (current.kind === 'form') {
      const errs = validateStep(current.step, answers);
      if (errs.length) {
        setAttempted((s) => new Set(s).add(stepIndex));
        setFocusToken((t) => t + 1);
        return;
      }
      goTo(nextStepIndex(form, answers, stepIndex));
    } else if (current.kind === 'review') {
      const bad = firstInvalidStep(form, answers);
      if (bad !== null) {
        setAttempted((s) => new Set(s).add(bad));
        goTo(bad);
        setTimeout(() => setFocusToken((t) => t + 1), 120);
        return;
      }
      goTo(n + 1);
    } else if (current.kind === 'sign') void submit();
  }

  function onBack() {
    const prev = prevStepIndex(form, answers, stepIndex);
    if (prev !== null) goTo(prev);
  }

  async function submit() {
    const declErrs = validateStep(declarationStep(form), answers);
    if (declErrs.length || Object.keys(signErrs).length) {
      setAttempted((s) => new Set(s).add(stepIndex));
      setFocusToken((t) => t + 1);
      return;
    }
    const bad = firstInvalidStep(form, answers);
    if (bad !== null) {
      setAttempted((s) => new Set(s).add(bad));
      goTo(bad);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    locked.current = true;
    try {
      const res = await accountApi.submit(detail.id, {
        answers,
        confirmations: allConfirmations(form).map((c) => c.id),
        signature: {
          method: sign.signature?.method ?? 'drawn',
          signedName: sign.signedName.trim().replace(/\s+/g, ' '),
          signedAt: new Date().toISOString(),
          imagePng: sign.signature?.png ?? '',
        },
        marketingConsent: sign.marketingConsent,
      });
      dirty.current = false;
      qc.setQueryData(keys.proposal(detail.id), res);
      void qc.invalidateQueries({ queryKey: keys.proposals });
      void qc.invalidateQueries({ queryKey: keys.me });
      if (res.status === 'quoted') await navigate({ to: '/proposals/$id/pay', params: { id: detail.id } });
      else await navigate({ to: '/proposals/$id', params: { id: detail.id }, search: { submitted: true } });
    } catch (e) {
      locked.current = false;
      setSubmitting(false);
      if (e instanceof ApiError && e.status === 422 && e.errors.length) {
        const target = stepOfFirstError(form, e.errors);
        setServerErrors([...e.errors]);
        if (target !== null && target !== stepIndex) {
          setAttempted((s) => new Set(s).add(target));
          goTo(target);
          setTimeout(() => setFocusToken((t) => t + 1), 150);
          return;
        }
      }
      const signMsgs =
        e instanceof ApiError
          ? e.errors.filter((x) => stepOfFirstError(form, [x]) === null).map((x) => x.message)
          : [];
      setSubmitError(
        signMsgs.length
          ? signMsgs.join(' ')
          : errorMessage(e, 'We could not submit your proposal. Please try again.'),
      );
    }
  }

  // ---- Stepper state -------------------------------------------------------------------------------
  const steps: StepState[] = visibleWizardSteps(form, answers).map((s) => {
    const done =
      s.kind === 'form'
        ? s.index !== stepIndex && s.index <= maxRef.current && validateStep(s.step, answers).length === 0
        : s.kind === 'review'
          ? stepIndex > s.index
          : false;
    return { step: s, done, reachable: s.index <= maxRef.current };
  });

  if (!current) return null;
  const visibleSecs =
    current.kind === 'form'
      ? visibleSections(current.step, answers).filter((s) => visibleFields(s, answers).length > 0)
      : [];
  const hasSelfie = visibleSecs.some((s) =>
    visibleFields(s, answers).some((f) => f.type === 'file' && f.kind === 'id_selfie'),
  );
  const isFirst = prevStepIndex(form, answers, stepIndex) === null;
  const continueLabel =
    current.kind === 'sign'
      ? instant
        ? 'Sign and continue to payment'
        : 'Sign and send to underwriter'
      : current.kind === 'review'
        ? 'Continue to sign'
        : 'Continue';
  const summaryErrors =
    current.kind === 'sign'
      ? [...stepErrs.map((e) => e.message), ...(showSignErrors ? Object.values(signErrs) : [])]
      : stepErrs.map((e) => e.message);
  const showSummary = summaryErrors.length > 0 && (attempted.has(stepIndex) || serverErrors.length > 0);

  return (
    <WizardContext.Provider value={ctxWithErrors}>
      <div className="band band-compact">
        <div className="wrap">
          <Breadcrumbs items={[{ label: 'My account', to: '/' }, { label: product.name }]} />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
            <p className="meta min-w-0">
              <span className="hidden font-medium text-ink sm:inline">{product.name} · </span>
              <span className="tnum">{detail.proposalNo}</span>
            </p>
            <div className="-mr-3 ml-auto flex flex-wrap items-center justify-end gap-x-1">
              <SaveIndicator state={save} />
              <Link to="/" className="btn btn-ghost btn-sm" onClick={() => void flush()}>
                Save and exit
              </Link>
            </div>
          </div>
          <div className="mt-2 lg:hidden">
            <StepBar steps={steps} current={stepIndex} onGo={goTo} />
          </div>
        </div>
      </div>

      <div
        className={cx(
          'wrap grid gap-8 pt-6 sm:pt-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:pt-10',
          instant && 'xl:grid-cols-[240px_minmax(0,1fr)_320px]',
        )}
      >
        <aside className="hidden lg:block">
          <div className="sticky top-[88px] grid max-h-[calc(100dvh-104px)] gap-6 overflow-y-auto pb-2">
            <StepList steps={steps} current={stepIndex} onGo={goTo} />
            {instant && (
              <div className="xl:hidden">
                <QuoteSidebar state={quote} productName={product.name} />
              </div>
            )}
          </div>
        </aside>
        <div className="min-w-0 max-w-[760px]">
          {detail.status === 'info_requested' && detail.staffMessage && (
            <Banner tone="warning" title="Message from the underwriter" className="mb-5" icon="info">
              <p className="whitespace-pre-line">{detail.staffMessage}</p>
              <p className="mt-1 text-[14px]">
                Update your answers or add documents, then sign and send it back.
              </p>
            </Banner>
          )}
          {renewed && stepIndex < n && (
            <Banner tone="info" className="mb-5" icon="refresh">
              We’ve copied your details from last year. Check anything that has changed.
            </Banner>
          )}

          <div key={stepIndex} className="enter">
            <h1 className="h-display outline-none" tabIndex={-1}>
              {current.kind === 'review'
                ? 'Check your answers'
                : current.kind === 'sign'
                  ? 'Declaration and signature'
                  : current.title}
            </h1>
            {current.kind === 'form' && current.step.description && (
              <p className="prose-w mt-2 text-[16px] leading-[26px] text-secondary">
                {current.step.description}
              </p>
            )}
            {current.kind === 'review' && (
              <p className="mt-2 text-secondary">Make sure everything is right. You can edit any section.</p>
            )}
            {current.kind === 'sign' && (
              <p className="mt-2 text-secondary">Read the declaration, tick the statements and sign.</p>
            )}

            {showSummary && (
              <div
                id="error-summary"
                tabIndex={-1}
                role="alert"
                className="mt-6 rounded-[8px] border-2 border-danger bg-white p-4 md:p-5"
              >
                <h2 className="flex items-center gap-2 text-[18px] leading-7 font-semibold text-danger">
                  <Icon name="alert" size={20} />
                  {current.kind === 'sign'
                    ? 'Before you can sign'
                    : summaryErrors.length === 1
                      ? 'One thing needs your attention'
                      : `${summaryErrors.length} things need your attention`}
                </h2>
                <ul className="m-0 mt-2 grid list-none gap-1 p-0">
                  {stepErrs.map((e, i) => (
                    <li key={`${e.field}-${e.row ?? ''}-${e.column ?? ''}-${i}`}>
                      <a
                        href={`#${errorTargetId(e)}`}
                        className="flex min-h-11 items-center py-1 text-[15px] leading-[22px] font-medium"
                        onClick={(ev) => {
                          ev.preventDefault();
                          const el = document.getElementById(errorTargetId(e));
                          el?.focus();
                          el?.scrollIntoView({ block: 'center' });
                        }}
                      >
                        {errorLabel(form, e)}
                      </a>
                    </li>
                  ))}
                  {showSignErrors && Object.keys(signErrs).length > 0 && (
                    <li className="text-[15px] font-semibold text-ink">
                      {[
                        signErrs.name && 'Enter your full name',
                        Object.keys(signErrs).some((k) => k.startsWith('c:')) && 'tick every statement',
                        signErrs.signature && 'add your signature',
                      ]
                        .filter(Boolean)
                        .join(', ')
                        .replace(/^./, (c) => c.toUpperCase())}
                      .
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="mt-6">
              {current.kind === 'form' && (
                <div className="grid gap-5">
                  {stepIndex === 0 && form.preamble && form.preamble.length > 0 && (
                    <Banner tone="neutral" title="Important notice" icon="info">
                      <div className="grid gap-2">
                        {form.preamble.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    </Banner>
                  )}
                  {hasSelfie && (
                    <Banner tone="info" icon="shield">
                      We check your Ghana Card number and photo with the National Identification Authority. We
                      don’t take copies of the card.
                    </Banner>
                  )}
                  {visibleSecs.map((sec) => (
                    <section
                      key={sec.id}
                      className="card card-pad"
                      aria-labelledby={sec.title ? `sec-${sec.id}` : undefined}
                    >
                      {(sec.title || sec.description) && (
                        <div className="mb-5">
                          {sec.title && (
                            <>
                              <h2 id={`sec-${sec.id}`} className="h-section">
                                {sec.number && <span className="mr-1.5 text-secondary">{sec.number}.</span>}
                                {sentenceCase(sec.title)}
                              </h2>
                              <span className="accent-bar mt-3" aria-hidden="true" />
                            </>
                          )}
                          {sec.description && (
                            <p className={cx('card-text', sec.title ? 'mt-3' : '')}>{sec.description}</p>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-6 gap-x-4 gap-y-7">
                        {visibleFields(sec, answers).map((f) => (
                          <div
                            key={f.id}
                            className={cx(
                              'col-span-6 min-w-0',
                              f.width === 'half' &&
                                f.type !== 'radio' &&
                                f.type !== 'checkboxes' &&
                                f.type !== 'table' &&
                                'md:col-span-3',
                              f.width === 'third' && 'md:col-span-2',
                            )}
                          >
                            <FieldRenderer field={f} />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {current.kind === 'review' && (
                <ReviewStep form={form} answers={answers} files={files} onEdit={goTo} />
              )}
              {current.kind === 'sign' && (
                <SignStep
                  form={form}
                  answers={answers}
                  state={sign}
                  setState={setSign}
                  errors={signErrs}
                  showErrors={showSignErrors}
                />
              )}
            </div>

            {submitError && (
              <Banner tone="danger" className="mt-6" role="alert">
                {submitError}
              </Banner>
            )}

            {/* Desktop actions */}
            <div className="mt-8 hidden items-center justify-between gap-3 lg:flex">
              {!isFirst ? (
                <Button variant="secondary" size="lg" onClick={onBack}>
                  <Icon name="arrowLeft" size={18} />
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button size="lg" onClick={onContinue} busy={submitting} busyLabel="Submitting">
                {continueLabel}
                {current.kind !== 'sign' && <Icon name="arrowRight" size={18} />}
              </Button>
            </div>
          </div>
        </div>
        {instant && (
          <div className="hidden xl:block">
            <div className="sticky top-[88px]">
              <QuoteSidebar state={quote} productName={product.name} />
            </div>
          </div>
        )}
      </div>
      <div className="h-12 lg:h-16" aria-hidden="true" />

      {/* Phones and tablets: sticky bottom action bar within thumb reach */}
      <ActionBar>
        {instant && <QuoteBarButton state={quote} onOpen={() => setQuoteOpen(true)} />}
        <div className="flex gap-2">
          {!isFirst && (
            <button
              type="button"
              className="btn btn-secondary btn-lg btn-icon !h-12 !w-12 flex-none !p-0"
              onClick={onBack}
              aria-label="Back"
            >
              <Icon name="arrowLeft" />
            </button>
          )}
          <Button
            size="lg"
            block
            onClick={onContinue}
            busy={submitting}
            busyLabel="Submitting"
            className="min-w-0 !px-4"
          >
            {current.kind === 'sign'
              ? instant
                ? 'Sign and pay'
                : 'Sign and send'
              : current.kind === 'review'
                ? 'Continue to sign'
                : 'Continue'}
          </Button>
        </div>
      </ActionBar>
      {instant && (
        <Sheet open={quoteOpen} onClose={() => setQuoteOpen(false)} title="Your price">
          <QuoteSheetBody state={quote} />
        </Sheet>
      )}
    </WizardContext.Provider>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'error'
          ? 'Not saved yet, retrying'
          : state === 'offline'
            ? 'Offline: will save later'
            : '';
  return (
    <LiveText
      className={cx(
        'inline-flex items-center gap-1.5 text-[13px] font-semibold',
        state === 'error' || state === 'offline' ? 'text-warning' : 'text-secondary',
      )}
    >
      {state === 'saved' && <Icon name="check" size={16} className="text-success" />}
      {text}
    </LiveText>
  );
}

function errorLabel(form: FormDefinition, e: FieldError): string {
  const base = baseFieldId(e.field);
  const all = [...allFields(form).map((x) => x.field), ...(form.declaration.fields ?? [])];
  const f = all.find((x) => x.id === base);
  if (!f) return e.message;
  if (e.row !== undefined && f.type === 'table') {
    const col = f.columns.find((c) => c.id === e.column);
    return `${f.label}, ${e.row + 1}: ${col ? col.label : ''}. ${e.message}`;
  }
  if (e.field.endsWith('__details') && f.type === 'yesno' && f.details)
    return `${f.details.label}: ${e.message}`;
  return `${f.label}: ${e.message}`;
}
