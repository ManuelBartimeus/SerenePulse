import { GLOBAL_CONFIRMATIONS, evaluate, type Answers, type FormDefinition } from '@serene/proposals';
import type { ReactNode } from 'react';
import { formatDate, isoDay } from '../lib/format';
import { Icon } from '../ui/icons';
import { CheckboxRow, ErrorText } from '../ui/inputs';
import { FieldRenderer } from './fields';
import { SignaturePad, type SignatureValue } from './signature-pad';

export interface SignState {
  confirmations: Record<string, boolean>;
  signedName: string;
  signature: SignatureValue | null;
  marketingConsent: boolean;
}

export type SignErrors = Partial<Record<'name' | 'signature' | `c:${string}`, string>>;

export const allConfirmations = (form: FormDefinition) => [
  ...form.declaration.confirmations,
  ...GLOBAL_CONFIRMATIONS,
];

export function validateSign(form: FormDefinition, s: SignState): SignErrors {
  const out: SignErrors = {};
  for (const c of allConfirmations(form)) if (!s.confirmations[c.id]) out[`c:${c.id}`] = 'Tick this to sign.';
  if (s.signedName.trim().split(/\s+/).filter(Boolean).length < 2)
    out.name = 'Enter your full name (first name and surname).';
  if (!s.signature) out.signature = 'Add your signature.';
  return out;
}

/** Puts links on the phrases the global confirmations refer to. */
function withLinks(id: string, label: string): ReactNode {
  const links: Record<string, [string, string]> = {
    terms: ['terms and conditions', '/terms'],
    data_processing: ['privacy notice', '/privacy'],
  };
  const l = links[id];
  if (!l) return label;
  const i = label.indexOf(l[0]);
  if (i === -1) return label;
  return (
    <>
      {label.slice(0, i)}
      <a
        href={l[1]}
        target="_blank"
        rel="noopener"
        className="font-semibold"
        onClick={(e) => e.stopPropagation()}
      >
        {l[0]}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {label.slice(i + l[0].length)}
    </>
  );
}

export function SignStep({
  form,
  answers,
  state,
  setState,
  errors,
  showErrors,
}: {
  form: FormDefinition;
  answers: Answers;
  state: SignState;
  setState: (update: (s: SignState) => SignState) => void;
  errors: SignErrors;
  showErrors: boolean;
}) {
  const d = form.declaration;
  const fields = (d.fields ?? []).filter((f) => evaluate(f.showIf, answers));
  const e = showErrors ? errors : {};
  return (
    <div className="grid gap-6">
      <section className="card overflow-hidden" aria-labelledby="decl-h">
        <div className="flex items-center gap-2 border-b border-border-subtle bg-subtle px-5 py-3.5">
          <Icon name="document" size={20} className="text-brand" />
          <h3 id="decl-h" className="text-[17px] font-bold">
            {d.title ? d.title.charAt(0) + d.title.slice(1).toLowerCase() : 'Declaration'}
          </h3>
        </div>
        <div className="read-panel !max-h-[360px] px-5 py-4" tabIndex={0} aria-label="Declaration text">
          <div className="grid max-w-prose gap-3 text-[16px] leading-[26px]">
            {d.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      {fields.length > 0 && (
        <section className="card card-pad grid gap-6">
          {fields.map((f) => (
            <FieldRenderer key={f.id} field={f} />
          ))}
        </section>
      )}

      <section className="card card-pad" aria-labelledby="confirm-h">
        <h3 id="confirm-h" className="h-section">
          Please confirm
        </h3>
        <p className="hint mt-1">Tick each statement. All are needed to sign.</p>
        <div className="mt-4 grid gap-3">
          {allConfirmations(form).map((c) => (
            <CheckboxRow
              key={c.id}
              id={`f-c-${c.id}`}
              checked={!!state.confirmations[c.id]}
              onChange={(v) =>
                setState((st) => ({ ...st, confirmations: { ...st.confirmations, [c.id]: v } }))
              }
              error={e[`c:${c.id}`]}
            >
              {withLinks(c.id, c.label)}
            </CheckboxRow>
          ))}
        </div>
        <div className="mt-5 border-t border-border-subtle pt-4">
          <CheckboxRow
            checked={state.marketingConsent}
            onChange={(v) => setState((st) => ({ ...st, marketingConsent: v }))}
          >
            <span className="text-secondary">
              Optional: send me news and offers from Serene Insurance by SMS or email. You can stop these at
              any time.
            </span>
          </CheckboxRow>
        </div>
      </section>

      <section className="card card-pad" aria-labelledby="sig-h">
        <h3 id="sig-h" className="h-section">
          {d.signatureLabel.replace(/’s Signature$/, '’s signature')}
        </h3>
        <div className="mt-4 max-w-md">
          <label htmlFor="f-signed-name" className="label">
            Full name of signatory
          </label>
          <input
            id="f-signed-name"
            className="input mt-2"
            autoComplete="name"
            autoCapitalize="words"
            value={state.signedName}
            onChange={(ev) => {
              const v = ev.target.value;
              setState((st) => ({ ...st, signedName: v }));
            }}
            aria-invalid={e.name ? true : undefined}
            aria-describedby={e.name ? 'f-signed-name-err' : undefined}
          />
          {e.name && <ErrorText id="f-signed-name-err">{e.name}</ErrorText>}
        </div>
        <div className="mt-5" id="f-signature" tabIndex={-1}>
          <SignaturePad
            name={state.signedName}
            onChange={(sig) => setState((st) => ({ ...st, signature: sig }))}
            invalid={!!e.signature}
          />
          {e.signature && <ErrorText>{e.signature}</ErrorText>}
        </div>
        <p className="mt-4 text-[14px] text-secondary">
          {d.dateLabel ?? 'Date'}:{' '}
          <span className="font-semibold text-ink">{formatDate(isoDay(new Date()))}</span>
        </p>
      </section>
    </div>
  );
}
