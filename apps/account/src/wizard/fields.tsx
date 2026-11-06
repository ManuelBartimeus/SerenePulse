// Renders any proposal-form Field. Driven only by the definition (type, format, prefill, role).
import {
  CURRENCIES,
  type ChoiceField,
  type DateField,
  type Field,
  type FieldError,
  type NumberField,
  type ProfileKey,
  type ReadField,
  type TextField,
  type YesNoField,
} from '@serene/proposals';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  addDays,
  amountToInput,
  currencySymbol,
  formatAmountInput,
  formatDigitalAddressInput,
  formatGhanaCardInput,
  formatPhoneInput,
  isoDay,
  parseAmount,
  upperInput,
} from '../lib/format';
import { OTHER } from '../lib/wizard';
import { cx } from '../ui/components';
import { Icon } from '../ui/icons';
import { ErrorText } from '../ui/inputs';
import { Combobox } from './combobox';
import { errorsFor, useDesktop, useWizard } from './context';
import { FileFieldInput } from './file-field';
import { TableFieldInput } from './table-field';

const AUTOCOMPLETE: Partial<Record<ProfileKey, string>> = {
  fullName: 'name',
  title: 'honorific-prefix',
  dateOfBirth: 'bday',
  gender: 'sex',
  phone: 'tel',
  email: 'email',
  postalAddress: 'street-address',
  residentialAddress: 'street-address',
  occupation: 'organization-title',
  employer: 'organization',
  companyName: 'organization',
  nationality: 'country-name',
};

const fieldDomId = (id: string) => `f-${id}`;

/** Field label with the paper form's question number, help text and errors. */
function FieldFrame({
  field,
  errors,
  children,
  as = 'div',
  labelFor,
}: {
  field: Field;
  errors: readonly FieldError[];
  children: ReactNode;
  as?: 'div' | 'fieldset';
  labelFor?: string;
}) {
  const own = errors.filter((e) => e.field === field.id && e.row === undefined);
  const id = fieldDomId(field.id);
  const labelInner = (
    <>
      {field.number && <span className="mr-1.5 text-secondary tnum">{field.number}.</span>}
      {field.label}
      {!field.required && field.type !== 'read' && (
        <span className="font-normal text-secondary"> (optional)</span>
      )}
    </>
  );
  const body = (
    <>
      {field.help && (
        <p id={`${id}-hint`} className="hint mt-1">
          {field.help}
        </p>
      )}
      <div className="mt-2.5">{children}</div>
      {own.map((e) => (
        <ErrorText key={e.message} id={`${id}-err`}>
          {e.message}
        </ErrorText>
      ))}
    </>
  );
  if (as === 'fieldset')
    return (
      <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={field.help ? `${id}-hint` : undefined}>
        <legend className="label float-left mb-2 w-full p-0">{labelInner}</legend>
        <div className="clear-both [&>*:first-child]:mt-0">{body}</div>
      </fieldset>
    );
  return (
    <div className="min-w-0">
      <label htmlFor={labelFor ?? id} className="label">
        {labelInner}
      </label>
      {body}
    </div>
  );
}

const describedBy = (field: Field, invalid: boolean) =>
  [field.help ? `f-${field.id}-hint` : '', invalid ? `f-${field.id}-err` : ''].filter(Boolean).join(' ') ||
  undefined;

export function FieldRenderer({ field }: { field: Field }) {
  const { errors } = useWizard();
  const errs = errorsFor(errors, field.id);
  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'textarea':
      return <TextInputField field={field} errors={errs} />;
    case 'number':
    case 'money':
    case 'percent':
    case 'year':
      return <NumberInputField field={field} errors={errs} />;
    case 'date':
      return <DateInputField field={field} errors={errs} />;
    case 'select':
      return <SelectField field={field} errors={errs} />;
    case 'radio':
    case 'checkboxes':
      return <ChoiceCards field={field} errors={errs} />;
    case 'yesno':
      return <YesNoInput field={field} errors={errs} />;
    case 'read':
      return <ReadPanel field={field} errors={errs} />;
    case 'table':
      return (
        <FieldFrame field={field} errors={errs} as="fieldset">
          <TableFieldInput field={field} />
        </FieldFrame>
      );
    case 'file':
      return <FileFieldInput field={field} errors={errs} />;
  }
}

// ---- Text ------------------------------------------------------------------------------------------

type TextMode = 'ghanaCard' | 'digitalAddress' | 'upper' | 'phone' | 'plain';

function useTextMode(field: TextField): TextMode {
  const { form, answers } = useWizard();
  if (field.type === 'phone') return 'phone';
  if (field.format === 'ghanaCard') return 'ghanaCard';
  if (field.format === 'digitalAddress') return 'digitalAddress';
  if (field.format) return 'upper';
  // The ID number follows the chosen ID type (a field pre-filled from the profile's idType).
  if (field.prefill === 'idNumber') {
    const idTypeField = form.steps
      .flatMap((s) => s.sections.flatMap((sec) => sec.fields))
      .find((f) => f.prefill === 'idType');
    const t = idTypeField ? answers[idTypeField.id] : undefined;
    if (t === 'ghana_card') return 'ghanaCard';
    if (t === 'passport' || t === 'non_citizen_card') return 'upper';
  }
  return 'plain';
}

function applyMode(mode: TextMode, v: string): string {
  switch (mode) {
    case 'ghanaCard':
      return formatGhanaCardInput(v);
    case 'digitalAddress':
      return formatDigitalAddressInput(v);
    case 'upper':
      return upperInput(v);
    case 'phone':
      return formatPhoneInput(v);
    default:
      return v;
  }
}

function TextInputField({ field, errors }: { field: TextField; errors: readonly FieldError[] }) {
  const { answers, set } = useWizard();
  const mode = useTextMode(field);
  const raw = answers[field.id];
  const value = typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : String(raw);
  const invalid = errors.some((e) => e.field === field.id);
  const id = fieldDomId(field.id);
  const common = {
    id,
    className: cx('input', mode !== 'plain' && mode !== 'phone' && 'uppercase tracking-wide'),
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy(field, invalid),
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
  };

  // Reformat a prefilled Ghana Card number once the type is known.
  useEffect(() => {
    if (mode === 'ghanaCard' && value && value !== formatGhanaCardInput(value))
      set(field.id, formatGhanaCardInput(value));
  }, [mode]);

  if (field.type === 'textarea')
    return (
      <FieldFrame field={field} errors={errors}>
        <AutoTextarea
          {...common}
          value={value}
          maxLength={field.maxLength}
          onChange={(v) => set(field.id, v)}
        />
        {field.maxLength && value.length > field.maxLength * 0.7 && (
          <p className="hint tnum mt-1 text-right">
            {value.length} / {field.maxLength}
          </p>
        )}
      </FieldFrame>
    );

  const placeholder =
    mode === 'ghanaCard'
      ? 'GHA-123456789-0'
      : mode === 'digitalAddress'
        ? 'GA-123-4567'
        : mode === 'phone'
          ? '024 123 4567'
          : field.placeholder;
  return (
    <FieldFrame field={field} errors={errors}>
      <input
        {...common}
        type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
        inputMode={
          field.type === 'email'
            ? 'email'
            : field.type === 'phone'
              ? 'tel'
              : mode === 'ghanaCard'
                ? 'text'
                : undefined
        }
        autoComplete={
          field.prefill
            ? (AUTOCOMPLETE[field.prefill] ?? 'off')
            : field.type === 'email'
              ? 'email'
              : field.type === 'phone'
                ? 'tel'
                : 'off'
        }
        autoCapitalize={
          mode === 'plain' && field.prefill === 'fullName'
            ? 'words'
            : mode === 'plain'
              ? 'sentences'
              : 'characters'
        }
        autoCorrect={mode === 'plain' && field.type === 'text' ? 'on' : 'off'}
        spellCheck={mode === 'plain' && field.type === 'text' && !field.prefill}
        maxLength={mode === 'ghanaCard' ? 15 : field.maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => set(field.id, applyMode(mode, e.target.value))}
        onBlur={(e) => {
          const t = e.target.value.trim();
          if (t !== e.target.value) set(field.id, t);
        }}
      />
    </FieldFrame>
  );
}

function AutoTextarea({
  value,
  onChange,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 2, 104), 360)}px`;
  }, [value]);
  return <textarea ref={ref} rows={3} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

// ---- Numbers and money ------------------------------------------------------------------------------

function NumberInputField({ field, errors }: { field: NumberField; errors: readonly FieldError[] }) {
  const { answers, set } = useWizard();
  const v = answers[field.id];
  const decimals = field.type === 'money' ? 2 : field.type === 'percent' ? 2 : 0;
  const [text, setText] = useState(() =>
    field.type === 'year' ? (typeof v === 'number' ? String(v) : '') : amountToInput(v, decimals),
  );
  const last = useRef(v);
  useEffect(() => {
    // Sync when the answer changes from elsewhere (prefill, quick quote).
    if (v !== last.current) {
      last.current = v;
      setText(field.type === 'year' ? (typeof v === 'number' ? String(v) : '') : amountToInput(v, decimals));
    }
  }, [v, decimals, field.type]);
  const invalid = errors.some((e) => e.field === field.id);
  const id = fieldDomId(field.id);
  const currency =
    field.type === 'money'
      ? field.currency === 'select'
        ? String(answers[`${field.id}__currency`] ?? 'GHS')
        : (field.currency ?? 'GHS')
      : null;
  const prefix = currency ? currencySymbol(currency) : null;
  const suffix = field.type === 'percent' ? '%' : field.unit;

  function onText(raw: string) {
    let next: string;
    let n: number | null;
    if (field.type === 'year') {
      next = raw.replace(/\D/g, '').slice(0, 4);
      n = next ? Number(next) : null;
    } else if (field.type === 'number' && !field.unit?.match(/\./)) {
      next = formatAmountInput(raw, 0);
      n = parseAmount(next);
    } else {
      next = formatAmountInput(raw, decimals);
      n = parseAmount(next);
    }
    setText(next);
    last.current = n ?? undefined;
    set(field.id, n ?? undefined);
  }

  return (
    <FieldFrame field={field} errors={errors}>
      <div className={cx('flex min-w-0 gap-2', field.width !== 'full' && 'max-w-sm')}>
        {field.currency === 'select' && (
          <select
            className="input w-[96px] flex-none"
            aria-label="Currency"
            value={String(answers[`${field.id}__currency`] ?? 'GHS')}
            onChange={(e) => set(`${field.id}__currency`, e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
              </option>
            ))}
          </select>
        )}
        <div className="input-affix min-w-0 flex-1">
          {prefix && <span className="affix affix-start text-[15px]">{prefix}</span>}
          <input
            id={id}
            className="input tnum"
            style={{
              ...(prefix ? { paddingLeft: `${prefix.length * 9 + 24}px` } : {}),
              ...(suffix ? { paddingRight: `${suffix.length * 9 + 28}px` } : {}),
            }}
            type="text"
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            autoComplete="off"
            enterKeyHint="next"
            placeholder={
              field.type === 'year'
                ? 'YYYY'
                : (field.placeholder ?? (field.type === 'money' ? '0.00' : undefined))
            }
            value={text}
            onChange={(e) => onText(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy(field, invalid)}
          />
          {suffix && <span className="affix affix-end text-[15px] font-medium">{suffix}</span>}
        </div>
      </div>
    </FieldFrame>
  );
}

// ---- Dates ----------------------------------------------------------------------------------------------

export function dateBounds(
  field: Pick<DateField, 'minDays' | 'maxDays' | 'minAge' | 'maxAge'>,
  today = new Date(),
): { min?: string; max?: string } {
  const out: { min?: string; max?: string } = {};
  if (field.minDays !== undefined) out.min = isoDay(addDays(today, field.minDays));
  if (field.maxDays !== undefined) out.max = isoDay(addDays(today, field.maxDays));
  if (field.minAge !== undefined) {
    const d = new Date(today.getFullYear() - field.minAge, today.getMonth(), today.getDate());
    out.max = isoDay(d);
  }
  if (field.maxAge !== undefined) {
    const d = new Date(today.getFullYear() - field.maxAge - 1, today.getMonth(), today.getDate() + 1);
    out.min = isoDay(d);
  }
  return out;
}

function DateInputField({ field, errors }: { field: DateField; errors: readonly FieldError[] }) {
  const { answers, set } = useWizard();
  const v = answers[field.id];
  const invalid = errors.some((e) => e.field === field.id);
  const b = dateBounds(field);
  return (
    <FieldFrame field={field} errors={errors}>
      <input
        id={fieldDomId(field.id)}
        className="input tnum max-w-xs"
        type="date"
        autoComplete={field.prefill === 'dateOfBirth' ? 'bday' : 'off'}
        min={b.min}
        max={b.max}
        value={typeof v === 'string' ? v : ''}
        onChange={(e) => set(field.id, e.target.value || undefined)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(field, invalid)}
      />
    </FieldFrame>
  );
}

// ---- Choices ----------------------------------------------------------------------------------------------

function OtherText({ field, errors }: { field: ChoiceField; errors: readonly FieldError[] }) {
  const { answers, set } = useWizard();
  const key = `${field.id}__other`;
  const err = errors.find((e) => e.field === key);
  const id = fieldDomId(key);
  return (
    <div className="mt-3">
      <label htmlFor={id} className="label text-[14px]">
        Please specify
      </label>
      <input
        id={id}
        className="input mt-1.5"
        value={typeof answers[key] === 'string' ? String(answers[key]) : ''}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${id}-err` : undefined}
        maxLength={200}
      />
      {err && <ErrorText id={`${id}-err`}>{err.message}</ErrorText>}
    </div>
  );
}

function SelectField({ field, errors }: { field: ChoiceField; errors: readonly FieldError[] }) {
  const { answers, set } = useWizard();
  const desktop = useDesktop();
  const v = answers[field.id];
  const value = typeof v === 'string' ? v : '';
  const invalid = errors.some((e) => e.field === field.id);
  const options = field.allowOther
    ? [...field.options, { value: OTHER, label: 'Other (please specify)' }]
    : field.options;
  const id = fieldDomId(field.id);
  return (
    <FieldFrame field={field} errors={errors}>
      <div
        className={cx(field.width === 'third' ? 'max-w-[220px]' : field.width === 'half' ? 'max-w-md' : '')}
      >
        {desktop && options.length > 12 ? (
          <Combobox
            id={id}
            options={options}
            value={value}
            onChange={(x) => set(field.id, x)}
            invalid={invalid}
            describedBy={describedBy(field, invalid)}
          />
        ) : (
          <select
            id={id}
            className={cx('input', !value && 'text-[#6b6b6b]')}
            value={value}
            onChange={(e) => set(field.id, e.target.value || undefined)}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy(field, invalid)}
            autoComplete={field.prefill ? (AUTOCOMPLETE[field.prefill] ?? 'off') : 'off'}
          >
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value} className="text-ink">
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {value === OTHER && <OtherText field={field} errors={errors} />}
    </FieldFrame>
  );
}

function ChoiceCards({ field, errors }: { field: ChoiceField; errors: readonly FieldError[] }) {
  const { answers, set } = useWizard();
  const name = useId();
  const multi = field.type === 'checkboxes';
  const v = answers[field.id];
  const picked: readonly string[] = multi
    ? Array.isArray(v)
      ? (v as string[])
      : []
    : typeof v === 'string'
      ? [v]
      : [];
  const invalid = errors.some((e) => e.field === field.id);
  const options = field.allowOther
    ? [...field.options, { value: OTHER, label: 'Other (please specify)' }]
    : field.options;
  const twoCol = options.length > 3 && options.every((o) => !o.hint && o.label.length < 32);
  return (
    <FieldFrame field={field} errors={errors} as="fieldset">
      <div className={cx('grid gap-2', twoCol && 'sm:grid-cols-2')} id={fieldDomId(field.id)} tabIndex={-1}>
        {options.map((o, i) => {
          const checked = picked.includes(o.value);
          const inputId = `${name}-${i}`;
          return (
            <label key={o.value} htmlFor={inputId} className={cx('option', invalid && 'option-invalid')}>
              <input
                id={inputId}
                type={multi ? 'checkbox' : 'radio'}
                name={name}
                className={multi ? 'check mt-px' : undefined}
                checked={checked}
                aria-invalid={invalid || undefined}
                onChange={(e) => {
                  if (!multi) return set(field.id, o.value);
                  const next = e.target.checked ? [...picked, o.value] : picked.filter((x) => x !== o.value);
                  set(field.id, next.length ? next : undefined);
                }}
              />
              {!multi && <span className="radio-dot mt-0.5" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block leading-[22px] font-medium break-words">{o.label}</span>
                {o.hint && (
                  <span className="mt-0.5 block text-[14px] leading-5 text-secondary">{o.hint}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {picked.includes(OTHER) && <OtherText field={field} errors={errors} />}
    </FieldFrame>
  );
}

function YesNoInput({ field, errors }: { field: YesNoField; errors: readonly FieldError[] }) {
  const { answers, set } = useWizard();
  const name = useId();
  const v = answers[field.id];
  const invalid = errors.some((e) => e.field === field.id);
  const open = !!field.details && v === field.details.when;
  const detailsKey = `${field.id}__details`;
  const detailsErr = errors.find((e) => e.field === detailsKey);
  const dId = fieldDomId(detailsKey);
  return (
    <FieldFrame field={field} errors={errors} as="fieldset">
      <div
        className={cx('segmented', invalid && 'segmented-invalid')}
        id={fieldDomId(field.id)}
        tabIndex={-1}
      >
        {(['yes', 'no'] as const).map((x) => (
          <label key={x}>
            <input
              type="radio"
              name={name}
              checked={v === x}
              onChange={() => set(field.id, x)}
              aria-invalid={invalid || undefined}
            />
            {x === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
      {field.details && (
        <div className="reveal" data-open={open}>
          <div>
            <div className="pt-4" inert={!open}>
              <label htmlFor={dId} className="label text-[15px]">
                {field.details.label}
              </label>
              <AutoTextarea
                id={dId}
                className="input mt-2"
                value={typeof answers[detailsKey] === 'string' ? String(answers[detailsKey]) : ''}
                onChange={(t) => set(detailsKey, t)}
                maxLength={1000}
                aria-invalid={detailsErr ? true : undefined}
                aria-describedby={detailsErr ? `${dId}-err` : undefined}
              />
              {detailsErr && <ErrorText id={`${dId}-err`}>{detailsErr.message}</ErrorText>}
            </div>
          </div>
        </div>
      )}
    </FieldFrame>
  );
}

// ---- Notices the customer must read ------------------------------------------------------------------

function ReadPanel({ field, errors }: { field: ReadField; errors: readonly FieldError[] }) {
  const { answers, set } = useWizard();
  const panel = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const acknowledged = answers[field.id] === true;
  const [reachedEnd, setReachedEnd] = useState(acknowledged);
  const [scrollable, setScrollable] = useState(false);
  const err = errors.find((e) => e.field === field.id);
  const id = fieldDomId(field.id);

  useEffect(() => {
    const p = panel.current;
    const e = end.current;
    if (!p || !e) return;
    setScrollable(p.scrollHeight > p.clientHeight + 4);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) setReachedEnd(true);
      },
      { root: p, threshold: 1 },
    );
    io.observe(e);
    return () => io.disconnect();
  }, []);

  return (
    <section
      className="min-w-0 overflow-hidden rounded-[8px] border border-border bg-white"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex items-center gap-2 border-b border-border bg-subtle px-4 py-3 md:px-5">
        <Icon name="document" size={20} className="flex-none text-brand" />
        <h3 id={`${id}-title`} className="min-w-0 text-[16px] leading-6 font-semibold break-words">
          {field.number && <span className="mr-1.5 text-secondary">{field.number}.</span>}
          {field.label}
        </h3>
      </div>
      <div
        ref={panel}
        className="read-panel px-4 py-4 md:px-5"
        tabIndex={0}
        aria-label={`${field.label}, scrollable text`}
      >
        <div className="prose-w grid gap-3 text-[16px] leading-[26px]">
          {field.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div ref={end} className="h-px" />
        {scrollable && !reachedEnd && <div className="read-fade" />}
      </div>
      {field.acknowledge && (
        <div className="border-t border-border px-4 py-1.5 md:px-5">
          <label
            htmlFor={id}
            className={cx('check-row !py-2.5', !reachedEnd && !acknowledged && 'cursor-not-allowed')}
          >
            <input
              id={id}
              type="checkbox"
              className="check"
              checked={acknowledged}
              disabled={!reachedEnd && !acknowledged}
              onChange={(e) => set(field.id, e.target.checked ? true : undefined)}
              aria-invalid={err ? true : undefined}
              aria-describedby={
                [!reachedEnd ? `${id}-scroll` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ') ||
                undefined
              }
            />
            <span className="min-w-0 flex-1 font-medium">{field.acknowledge}</span>
          </label>
          {!reachedEnd && (
            <p id={`${id}-scroll`} className="hint mb-2 flex items-center gap-1.5 pl-[34px]">
              <Icon name="chevronDown" size={16} />
              Scroll to the end of the text to confirm.
            </p>
          )}
          {err && <ErrorText id={`${id}-err`}>{err.message}</ErrorText>}
        </div>
      )}
    </section>
  );
}
