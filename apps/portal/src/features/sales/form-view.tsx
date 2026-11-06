// The completed proposal shown in the browser like Serene's paper form: same order, numbering
// and wording as the printed document (docLabel), answers written on dotted lines, tick boxes,
// YES / NO with the answer circled, tables with the paper's columns and the signed declaration.
// Generic: it works from any FormDefinition, so every product's form renders the same way.
import { evaluate, visibleFields, visibleSections } from '@serene/proposals';
import type {
  Answers,
  AnswerValue,
  ChoiceField,
  Field,
  FormDefinition,
  OptionsRef,
  TableColumn,
  TableField,
  TableRow,
  YesNoField,
} from '@serene/proposals';
import type { ReactNode } from 'react';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2024-11-26" (or a timestamp) → "26 November 2024". */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

const amountFmt = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

function toNumber(v: AnswerValue | undefined): number | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function optionLabel(options: OptionsRef | undefined, value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return options?.find((o) => o.value === s)?.label ?? s;
}

function currencyOf(field: Field, answers: Answers): string {
  if (field.type !== 'money') return 'GHS';
  if (field.currency === 'select') {
    const c = answers[`${field.id}__currency`];
    return typeof c === 'string' && c ? c.toUpperCase() : 'GHS';
  }
  return field.currency ?? 'GHS';
}

const money = (n: number, currency: string) =>
  `${currency === 'GHS' ? 'GH₵' : currency} ${amountFmt.format(n)}`;

/**
 * The answer to one field as plain text ("" when unanswered). Choice fields give their option
 * label(s), "Other" gives the text written in, money carries its currency, dates are written out.
 */
export function answerText(field: Field, answers: Answers): string {
  const v = answers[field.id];
  if (v === undefined || v === null || v === '') return '';
  switch (field.type) {
    case 'money': {
      const n = toNumber(v);
      return n === null ? String(v) : money(n, currencyOf(field, answers));
    }
    case 'number': {
      const n = toNumber(v);
      if (n === null) return String(v);
      return field.unit ? `${intFmt.format(n)} ${field.unit}` : intFmt.format(n);
    }
    case 'percent':
      return `${String(v)}%`;
    case 'year':
      return String(v);
    case 'date':
      return typeof v === 'string' ? longDate(v) : String(v);
    case 'select':
    case 'radio': {
      if (v === '__other') {
        const other = answers[`${field.id}__other`];
        return typeof other === 'string' && other ? `Other: ${other}` : 'Other';
      }
      return optionLabel(field.options, v);
    }
    case 'checkboxes': {
      if (!Array.isArray(v)) return String(v);
      return (v as readonly string[])
        .map((x) =>
          x === '__other'
            ? `Other: ${String(answers[`${field.id}__other`] ?? '')}`.trim()
            : optionLabel(field.options, x),
        )
        .join(', ');
    }
    case 'yesno':
      return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : String(v);
    case 'table':
      return Array.isArray(v) ? `${v.length}` : '';
    case 'file':
      return Array.isArray(v) ? `${v.length}` : '';
    case 'read':
      return v === true ? 'Read and acknowledged' : '';
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

/** A table cell as text. */
export function cellText(col: TableColumn, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  switch (col.type) {
    case 'money': {
      const n = toNumber(value as AnswerValue);
      return n === null ? String(value) : money(n, 'GHS');
    }
    case 'number': {
      const n = toNumber(value as AnswerValue);
      if (n === null) return String(value);
      return col.unit ? `${intFmt.format(n)} ${col.unit}` : intFmt.format(n);
    }
    case 'date':
      return longDate(String(value));
    case 'select':
      return optionLabel(col.options, value);
    default:
      return String(value);
  }
}

/** Fields printed with the signature block: the declaration's own and those placed there. */
export function declarationFields(def: FormDefinition, answers: Answers): Field[] {
  const placed: Field[] = [];
  for (const step of def.steps)
    for (const section of visibleSections(step, answers))
      for (const f of visibleFields(section, answers)) if (f.docPlacement === 'declaration') placed.push(f);
  return [...placed, ...(def.declaration.fields ?? []).filter((f) => evaluate(f.showIf, answers))];
}

// ---- Rendering -------------------------------------------------------------------------------

interface FileRef {
  id: string;
  name: string;
  fieldId: string;
}

const labelOf = (f: Field) => f.docLabel ?? f.label;

function Num({ n }: { n?: string | undefined }) {
  if (!n) return null;
  return (
    <span className="mr-1.5 font-semibold text-ink">
      {/^[(\d]/.test(n) && !n.endsWith('.') ? `${n}.` : n}
    </span>
  );
}

/** "LABEL ………… answer" on a dotted line. */
function Line({ field, text }: { field: Field; text: string }) {
  return (
    <div className="flex min-w-[min(220px,100%)] flex-1 flex-wrap items-end gap-x-2 gap-y-0.5">
      <span className="text-[14px] leading-6 text-secondary">
        <Num n={field.number} />
        {labelOf(field)}
      </span>
      <span
        className={`min-w-[8rem] flex-1 border-b border-dotted border-border-strong pb-0.5 text-[15px] font-medium leading-6 break-words ${text ? 'text-brand-700' : ''}`}
      >
        {text || <span className="sr-only">Not answered</span>}
      </span>
    </div>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-grid size-[18px] shrink-0 place-items-center rounded-[3px] border text-[13px] font-bold leading-none ${
        on ? 'border-brand-700 bg-brand-50 text-brand-700' : 'border-border-strong text-transparent'
      }`}
    >
      ✓
    </span>
  );
}

function Choices({ field, answers }: { field: ChoiceField; answers: Answers }) {
  const v = answers[field.id];
  const chosen = new Set<string>(
    Array.isArray(v) ? (v as readonly string[]) : v == null || v === '' ? [] : [String(v)],
  );
  const other = answers[`${field.id}__other`];
  const options = [
    ...field.options,
    ...(field.allowOther ? [{ value: '__other', label: 'Others (please specify)' }] : []),
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] leading-6 text-secondary">
        <Num n={field.number} />
        {labelOf(field)}
      </p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 pl-1">
        {options.map((o) => {
          const on = chosen.has(o.value);
          return (
            <li key={o.value} className="flex items-center gap-2 text-[14px]">
              <Tick on={on} />
              <span className={on ? 'font-medium text-ink' : 'text-secondary'}>
                {o.label}
                {on && <span className="sr-only"> (selected)</span>}
                {o.value === '__other' && on && typeof other === 'string' && other && (
                  <span className="ml-1 font-medium text-brand-700">: {other}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function YesNo({ field, answers }: { field: YesNoField; answers: Answers }) {
  const v = answers[field.id];
  const details = answers[`${field.id}__details`];
  const showDetails = field.details && v === field.details.when;
  const mark = (value: 'yes' | 'no', text: string) => {
    const on = v === value;
    return (
      <span
        className={`inline-flex h-7 items-center rounded-full px-2.5 text-[13px] font-semibold tracking-[0.04em] ${
          on ? 'border-2 border-brand-700 text-brand-700' : 'border-2 border-transparent text-muted'
        }`}
      >
        {text}
        {on && <span className="sr-only"> (answer)</span>}
      </span>
    );
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 flex-1 text-[14px] leading-6 text-secondary">
          <Num n={field.number} />
          {labelOf(field)}
        </p>
        <span
          className="flex shrink-0 gap-1"
          aria-label={`Answer: ${v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'not answered'}`}
        >
          {mark('yes', 'YES')}
          {mark('no', 'NO')}
        </span>
      </div>
      {field.details && (showDetails || (typeof details === 'string' && details)) && (
        <div className="flex flex-wrap items-end gap-x-2 pl-4">
          <span className="text-[14px] leading-6 text-secondary">
            {field.details.docLabel ?? field.details.label}
          </span>
          <span className="min-w-[8rem] flex-1 border-b border-dotted border-border-strong pb-0.5 text-[15px] font-medium leading-6 break-words text-brand-700">
            {typeof details === 'string' ? details : ''}
          </span>
        </div>
      )}
    </div>
  );
}

function Table({ field, answers }: { field: TableField; answers: Answers }) {
  const v = answers[field.id];
  const data = Array.isArray(v) ? (v as readonly TableRow[]) : [];
  const printRows = Math.max(data.length, field.printRows ?? 0, 1);
  const rows: (TableRow | null)[] = Array.from({ length: printRows }, (_, i) => data[i] ?? null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] leading-6 text-secondary">
        <Num n={field.number} />
        {labelOf(field)}
      </p>
      <div className="-mx-1 max-w-full overflow-x-auto px-1">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <caption className="sr-only">{labelOf(field)}</caption>
          <thead>
            <tr>
              {field.columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="border border-border-strong bg-subtle px-2 py-1.5 text-left font-semibold text-ink"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {field.columns.map((c) => {
                  const numeric = c.type === 'money' || c.type === 'number' || c.type === 'year';
                  return (
                    <td
                      key={c.id}
                      className={`h-8 border border-border-strong px-2 py-1 font-medium text-brand-700 ${numeric ? 'text-right tabular-nums' : ''}`}
                    >
                      {r ? cellText(c, r[c.id]) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Files({ field, answers, files }: { field: Field; answers: Answers; files: readonly FileRef[] }) {
  const v = answers[field.id];
  const ids = Array.isArray(v) ? (v as readonly string[]) : [];
  const names = ids.map((id) => files.find((f) => f.id === id)?.name ?? 'Attached file');
  const extra = files.filter((f) => f.fieldId === field.id && !ids.includes(f.id)).map((f) => f.name);
  const all = [...names, ...extra];
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[14px] leading-6 text-secondary">
        <Num n={field.number} />
        {labelOf(field)}
      </p>
      {all.length ? (
        <ul className="list-disc pl-6 text-[14px] font-medium text-brand-700">
          {all.map((n, i) => (
            <li key={`${n}-${i}`} className="break-words">
              {n}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-1 text-[14px] text-muted">No file attached</p>
      )}
    </div>
  );
}

function Read({ field, answers }: { field: Extract<Field, { type: 'read' }>; answers: Answers }) {
  const ack = answers[field.id] === true;
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border-subtle bg-subtle p-3">
      <p className="text-[14px] font-semibold text-ink">
        <Num n={field.number} />
        {labelOf(field)}
      </p>
      {field.paragraphs.map((p, i) => (
        <p key={i} className="text-[13px] leading-5 text-secondary">
          {p}
        </p>
      ))}
      {field.acknowledge && (
        <p className="flex items-center gap-2 text-[14px]">
          <Tick on={ack} />
          <span className={ack ? 'font-medium text-ink' : 'text-muted'}>
            {ack ? 'Read and acknowledged' : 'Not acknowledged'}
          </span>
        </p>
      )}
    </div>
  );
}

function FieldView({ field, answers, files }: { field: Field; answers: Answers; files: readonly FileRef[] }) {
  switch (field.type) {
    case 'select':
      // A drop-down prints as a line, as on the paper form.
      return <Line field={field} text={answerText(field, answers)} />;
    case 'radio':
    case 'checkboxes':
      return <Choices field={field} answers={answers} />;
    case 'yesno':
      return <YesNo field={field} answers={answers} />;
    case 'table':
      return <Table field={field} answers={answers} />;
    case 'file':
      return <Files field={field} answers={answers} files={files} />;
    case 'read':
      return <Read field={field} answers={answers} />;
    default:
      return <Line field={field} text={answerText(field, answers)} />;
  }
}

const inline = (f: Field) => !['radio', 'checkboxes', 'yesno', 'table', 'file', 'read'].includes(f.type);

/** Consecutive fields sharing a `row` key print on one line (e.g. "FULL NAME … AGE …"). */
function groupRows(fields: readonly Field[]): Field[][] {
  const out: Field[][] = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && f.row && prev.row === f.row && inline(f) && inline(prev)) last.push(f);
    else out.push([f]);
  }
  return out;
}

function Fields({
  fields,
  answers,
  files,
}: {
  fields: readonly Field[];
  answers: Answers;
  files: readonly FileRef[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {groupRows(fields).map((group) => {
        const [first] = group;
        if (!first) return null;
        return group.length > 1 ? (
          <div key={first.id} className="flex flex-wrap gap-x-6 gap-y-3">
            {group.map((f) => (
              <FieldView key={f.id} field={f} answers={answers} files={files} />
            ))}
          </div>
        ) : (
          <FieldView key={first.id} field={first} answers={answers} files={files} />
        );
      })}
    </div>
  );
}

function Heading({
  number,
  title,
  description,
}: {
  number?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
}) {
  if (!title && !number) return null;
  return (
    <div className="mb-3">
      <h4 className="text-[14px] font-bold uppercase tracking-[0.04em] text-ink">
        {number && <span className="mr-2">{number}.</span>}
        {title}
      </h4>
      {description && <p className="mt-1 text-[13px] leading-5 text-secondary">{description}</p>}
    </div>
  );
}

export function ProposalFormView({
  def,
  answers,
  files = [],
  signature,
  submittedAt,
  signatureUrl,
  header,
}: {
  def: FormDefinition;
  answers: Answers;
  files?: readonly FileRef[];
  signature?:
    | { signedName?: string | undefined; signedAt?: string | undefined; method?: string | undefined }
    | null
    | undefined;
  submittedAt?: string | null | undefined;
  signatureUrl?: string | undefined;
  /** Optional line above the title (e.g. proposal number). */
  header?: ReactNode;
}) {
  const decl = def.declaration;
  const declFields = declarationFields(def, answers);
  const signedOn = signature?.signedAt ?? submittedAt ?? undefined;
  return (
    <article
      aria-label={def.title}
      className="mx-auto w-full max-w-[820px] rounded-lg border border-border-subtle bg-white p-4 shadow-xs sm:p-8"
    >
      {header && <div className="mb-4 text-[13px] text-muted">{header}</div>}
      <header className="mb-6 border-b-2 border-ink pb-4 text-center">
        <p className="text-[12px] font-semibold tracking-[0.18em] text-muted">SERENE INSURANCE GHANA LTD</p>
        <h3 className="mt-1 text-[18px] font-bold uppercase leading-7 tracking-[0.02em] text-ink sm:text-[20px]">
          {def.title}
        </h3>
        {def.subtitle && <p className="mt-1 text-[14px] italic text-secondary">{def.subtitle}</p>}
      </header>

      {def.preamble?.length ? (
        <div className="mb-6 flex flex-col gap-2 rounded-sm border border-border-strong p-3">
          {def.preamble.map((p, i) => (
            <p key={i} className="text-[13px] leading-5 text-secondary">
              {p}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-7">
        {def.steps.flatMap((step) =>
          visibleSections(step, answers).map((section) => {
            const fields = visibleFields(section, answers).filter((f) => f.docPlacement !== 'declaration');
            if (fields.length === 0) return null;
            return (
              <section key={`${step.id}:${section.id}`} aria-label={section.title ?? step.title}>
                <Heading number={section.number} title={section.title} description={section.description} />
                <Fields fields={fields} answers={answers} files={files} />
              </section>
            );
          }),
        )}

        <section aria-label="Declaration" className="border-t-2 border-ink pt-5">
          <Heading title={decl.title ?? 'Declaration'} />
          <div className="flex flex-col gap-2">
            {decl.paragraphs.map((p, i) => (
              <p key={i} className="text-[14px] leading-6 text-ink">
                {p}
              </p>
            ))}
          </div>
          {declFields.length > 0 && (
            <div className="mt-5">
              <Fields fields={declFields} answers={answers} files={files} />
            </div>
          )}
          <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-6">
            <div className="flex min-w-[220px] flex-1 flex-col">
              <div className="flex h-20 items-end">
                {signatureUrl ? (
                  <img
                    src={signatureUrl}
                    alt={`Signature of ${signature?.signedName ?? 'the proposer'}`}
                    className="max-h-20 max-w-[260px] object-contain"
                  />
                ) : (
                  <span className="text-[13px] text-muted">
                    {signature ? 'Signed electronically' : 'Not signed'}
                  </span>
                )}
              </div>
              <span className="border-t border-dotted border-border-strong pt-1 text-[13px] text-secondary">
                {decl.signatureLabel}
              </span>
              {signature?.signedName && (
                <span className="mt-1 text-[14px] font-medium text-brand-700">{signature.signedName}</span>
              )}
            </div>
            <div className="flex min-w-[160px] flex-col">
              <span className="pb-1 text-[15px] font-medium text-brand-700">
                {signedOn ? longDate(signedOn) : ''}
              </span>
              <span className="border-t border-dotted border-border-strong pt-1 text-[13px] text-secondary">
                {decl.dateLabel ?? 'Date'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
