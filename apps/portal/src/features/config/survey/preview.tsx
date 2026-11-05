// Live survey preview (M04, FR-44) rendered with @serene/survey-engine. Nothing is sent or stored:
// answers live in component state only.
import { useId, useState } from 'react';
import {
  clean,
  isRequired,
  isVisible,
  validate,
  type Answers,
  type Definition,
  type FieldError,
  type Json,
  type Question,
  type Snapshot,
} from '@serene/survey-engine';
import { Alert, Button } from '../../../ui/controls';

const ERROR_TEXT: Record<FieldError['code'], string> = {
  required: 'Please answer this question.',
  invalid_option: 'Please choose one of the options.',
  out_of_range: 'Please choose a score.',
  too_long: 'That’s a little long. Please shorten it.',
  invalid_type: 'Please check this answer.',
  invalid_phone: 'Enter a Ghana mobile number, for example 024 123 4567.',
};

function QuestionView({
  q,
  snapshot,
  value,
  error,
  onChange,
}: {
  q: Question;
  snapshot: Snapshot;
  value: Json | undefined;
  error: string | undefined;
  onChange: (v: Json | undefined) => void;
}) {
  const id = useId();
  const legend = (
    <>
      <span className="block text-[18px] font-medium leading-6">{q.label}</span>
      {q.help && (
        <span className="mt-1 block text-[14px] font-normal leading-5 text-secondary">{q.help}</span>
      )}
    </>
  );
  const err = error && (
    <p id={`${id}-err`} className="mt-2 rounded-xs bg-danger-bg px-3 py-2 text-[14px] text-danger">
      {error}
    </p>
  );
  switch (q.type) {
    case 'single_choice': {
      const opts = q.options_source ? snapshot[q.options_source] : [];
      return (
        <fieldset aria-describedby={error ? `${id}-err` : undefined}>
          <legend className="mb-3">{legend}</legend>
          <div className="flex flex-col gap-2">
            {opts.map((o) => {
              const checked = value === o.code;
              return (
                <label
                  key={o.code}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md px-4 ${
                    checked ? 'border-2 border-brand bg-brand-50' : 'border border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name={id}
                    className="size-5 accent-[var(--color-brand)]"
                    checked={checked}
                    onChange={() => onChange(o.code)}
                  />
                  <span>{o.label}</span>
                  {checked && (
                    <span aria-hidden className="ml-auto text-brand">
                      ✓
                    </span>
                  )}
                </label>
              );
            })}
            {opts.length === 0 && <p className="text-[14px] text-muted">No active options in this list.</p>}
          </div>
          {err}
        </fieldset>
      );
    }
    case 'rating_5':
    case 'rating_0_10': {
      const [lo, hi] = q.type === 'rating_5' ? [1, 5] : [0, 10];
      const scores = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      const anchor = (n: number) =>
        q.type === 'rating_5'
          ? q.anchors?.[n - 1]
          : n === 0
            ? q.anchors?.[0]
            : n === 10
              ? q.anchors?.[1]
              : undefined;
      return (
        <fieldset aria-describedby={error ? `${id}-err` : undefined}>
          <legend className="mb-3">{legend}</legend>
          <div
            className={
              q.type === 'rating_5' ? 'flex flex-col gap-2' : 'grid grid-cols-6 gap-2 @[560px]:grid-cols-11'
            }
            role="radiogroup"
          >
            {scores.map((n) => {
              const checked = value === n;
              const a = anchor(n);
              return (
                <label
                  key={n}
                  className={`flex min-h-12 cursor-pointer items-center justify-center gap-3 rounded-md px-3 ${
                    q.type === 'rating_5' ? 'justify-start' : ''
                  } ${checked ? 'border-2 border-brand bg-brand-50' : 'border border-border-strong'}`}
                >
                  <input
                    type="radio"
                    name={id}
                    className="sr-only"
                    checked={checked}
                    onChange={() => onChange(n)}
                    aria-label={a ? `${n}, ${a}` : String(n)}
                  />
                  <span className="font-medium tabular-nums">{n}</span>
                  {q.type === 'rating_5' && a && <span className="text-[14px]">{a}</span>}
                </label>
              );
            })}
          </div>
          {q.type === 'rating_0_10' && (
            <div className="mt-2 flex justify-between text-[12px] text-secondary">
              <span>0 = {q.anchors?.[0]}</span>
              <span>10 = {q.anchors?.[1]}</span>
            </div>
          )}
          {err}
        </fieldset>
      );
    }
    case 'toggle':
      return (
        <div>
          <label className="flex min-h-12 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-[var(--color-brand)]"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span>{legend}</span>
          </label>
          {err}
        </div>
      );
    case 'text_long':
    case 'text_short':
    case 'phone': {
      const max = q.max_length ?? (q.type === 'text_long' ? 1000 : 80);
      const s = typeof value === 'string' ? value : '';
      const common = {
        id,
        value: s,
        maxLength: q.type === 'phone' ? 20 : max,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-err` : undefined,
        className:
          'w-full rounded-sm border border-border-strong bg-white px-4 text-[16px] outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand',
      };
      return (
        <div>
          <label htmlFor={id} className="mb-2 block">
            {legend}
          </label>
          {q.type === 'text_long' ? (
            <textarea
              {...common}
              rows={4}
              className={`${common.className} py-3`}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <input
              {...common}
              type={q.type === 'phone' ? 'tel' : 'text'}
              inputMode={q.type === 'phone' ? 'tel' : undefined}
              className={`${common.className} h-14`}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
          {q.type !== 'phone' && (
            <p className="mt-1 text-right text-[12px] text-secondary">
              {[...s].length}/{max}
            </p>
          )}
          {err}
        </div>
      );
    }
  }
}

export function SurveyPreview({ def, snapshot }: { def: Definition; snapshot: Snapshot }) {
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone');
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const total = def.pages.length;
  const current = def.pages[Math.min(page, total - 1)];

  function set(id: string, v: Json | undefined) {
    const { [id]: _old, ...rest } = answers;
    const next: Answers = v === undefined || v === '' ? rest : { ...rest, [id]: v };
    setAnswers(clean(def, snapshot, next));
    setErrors((e) => {
      const { [id]: _drop, ...rest } = e;
      return rest;
    });
  }

  function next() {
    if (!current) return;
    const ids = new Set(current.questions.map((q) => q.id));
    const pageErrors = validate(def, snapshot, answers).errors.filter((e) => ids.has(e.field));
    if (pageErrors.length) {
      setErrors(Object.fromEntries(pageErrors.map((e) => [e.field, ERROR_TEXT[e.code]])));
      return;
    }
    setErrors({});
    if (page + 1 >= total) setFinished(true);
    else setPage(page + 1);
  }

  function restart() {
    setAnswers({});
    setErrors({});
    setPage(0);
    setFinished(false);
  }

  const lowCsat = typeof answers.csat === 'number' && answers.csat <= 2;
  const title = current
    ? lowCsat && current.title_when_low_csat
      ? current.title_when_low_csat
      : current.title
    : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Preview size" className="flex gap-1 rounded-full bg-surface-muted p-1">
          {(['phone', 'desktop'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={`h-10 rounded-full px-4 text-[14px] font-medium ${
                device === d ? 'bg-white text-brand shadow' : 'text-secondary'
              }`}
            >
              {d === 'phone' ? 'Phone' : 'Desktop'}
            </button>
          ))}
        </div>
        <Button variant="ghost" className="h-10 px-4 text-[14px]" onClick={restart}>
          Start again
        </Button>
      </div>
      <Alert tone="info">Preview only. Nothing you enter here is submitted or saved.</Alert>
      <div className="flex justify-center rounded-lg bg-subtle p-4">
        <div
          className={`@container w-full overflow-hidden rounded-lg border border-border bg-white ${
            device === 'phone' ? 'max-w-[390px]' : 'max-w-[960px]'
          }`}
        >
          <div className="h-1.5 bg-brand" aria-hidden />
          <div className="flex flex-col gap-6 p-5 @[560px]:p-10">
            {finished ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center" aria-live="polite">
                <p className="text-[24px] font-medium leading-8">Thank you!</p>
                <p className="text-secondary">
                  In the live survey the customer would now see the confirmation page. This preview submitted
                  nothing.
                </p>
                <Button variant="secondary" onClick={restart}>
                  Preview again
                </Button>
              </div>
            ) : current ? (
              <>
                <div>
                  <div className="mb-2 h-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                    <div className="h-full bg-brand" style={{ width: `${((page + 1) / total) * 100}%` }} />
                  </div>
                  <p className="text-[14px] text-secondary" aria-live="polite">
                    Question {page + 1} of {total}
                  </p>
                  {page === 0 && def.intro && <p className="mt-3 text-secondary">{def.intro}</p>}
                  <h3 className="mt-3 text-[28px] font-medium leading-9 tracking-[-0.5px]">{title}</h3>
                </div>
                {current.questions
                  .filter((q) => isVisible(def, snapshot, answers, q))
                  .map((q) => (
                    <div key={q.id}>
                      <QuestionView
                        q={q}
                        snapshot={snapshot}
                        value={answers[q.id]}
                        error={errors[q.id]}
                        onChange={(v) => set(q.id, v)}
                      />
                      {isRequired(def, snapshot, answers, q) &&
                        q.type !== 'rating_5' &&
                        q.type !== 'rating_0_10' && <p className="mt-1 text-[12px] text-muted">Required</p>}
                    </div>
                  ))}
                <div className="flex flex-col-reverse gap-3 @[560px]:flex-row @[560px]:justify-between">
                  <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Back
                  </Button>
                  <Button onClick={next}>{page + 1 >= total ? 'Submit feedback' : 'Continue'}</Button>
                </div>
              </>
            ) : (
              <p className="text-secondary">This survey has no pages.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
