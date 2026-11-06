// Answer validation shared by the customer wizard (per step) and the Worker (whole form, on submit).
// Hidden fields (showIf false) are never required and their answers are dropped by `clean`.
import type {
  Answers,
  AnswerValue,
  Condition,
  Field,
  FieldError,
  FormDefinition,
  Section,
  Step,
  TableRow,
} from './schema';

export const FORMATS = {
  /** Ghana Card PIN: GHA-123456789-0 */
  ghanaCard: /^GHA-\d{9}-\d$/,
  /** GhanaPost GPS digital address: GA-123-4567 (2 letters, 3–4 digits, 3–4 digits). */
  digitalAddress: /^[A-Z]{2}-\d{3,4}-\d{3,4}$/,
  /** Ghana registration marks: GN 3181-18 (to 2025), GR 2224-AD (DVLA zone format from 1 Jan 2026), AS 552-Z … */
  vehicleReg: /^[A-Z]{1,3} ?\d{1,4} ?-? ?(\d{2}|[A-Z]{1,2})$/,
  passport: /^[A-Z0-9]{6,12}$/,
  /** Ghana TIN: P/C/G/Q/V + 10 digits; individuals now use their Ghana Card PIN. */
  tin: /^([PCGQV]\d{10}|GHA-\d{9}-\d)$/,
  chassis: /^[A-Z0-9-]{5,25}$/,
} as const;

const FORMAT_MESSAGES: Record<keyof typeof FORMATS, string> = {
  ghanaCard: 'Enter the Ghana Card number as printed, for example GHA-123456789-0.',
  digitalAddress: 'Enter a GhanaPost GPS address, for example GA-123-4567.',
  vehicleReg: 'Enter the registration number as on the plate, for example GN 3181-18.',
  passport: 'Enter the passport number (letters and digits only).',
  tin: 'Enter a TIN such as P0001234567, or your Ghana Card number.',
  chassis: 'Enter the chassis (VIN) number using letters and digits only.',
};

/** Normalises formatted values before checking/saving (upper case, standard separators). */
export function normaliseFormat(format: keyof typeof FORMATS, raw: string): string {
  const v = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (format === 'ghanaCard') {
    const digits = v.replace(/[^0-9]/g, '');
    return digits.length === 10 ? `GHA-${digits.slice(0, 9)}-${digits.slice(9)}` : v;
  }
  if (format === 'digitalAddress') return v.replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  if (format === 'vehicleReg') return v.replace(/\s*-\s*/g, '-');
  if (format === 'passport' || format === 'chassis') return v.replace(/\s+/g, '');
  return v;
}

export function isEmpty(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function evaluate(cond: Condition | undefined, answers: Answers): boolean {
  if (!cond) return true;
  if ('all' in cond) return cond.all.every((c) => evaluate(c, answers));
  if ('any' in cond) return cond.any.some((c) => evaluate(c, answers));
  if ('not' in cond) return !evaluate(cond.not, answers);
  const v = answers[cond.field];
  if ('equals' in cond) return v === cond.equals;
  if ('in' in cond) return typeof v === 'string' && cond.in.includes(v);
  if ('notIn' in cond) return typeof v === 'string' && !cond.notIn.includes(v);
  if ('includes' in cond) return Array.isArray(v) && (v as readonly unknown[]).includes(cond.includes);
  return !isEmpty(v) && v !== false && v !== 'no';
}

export const visibleSections = (step: Step, a: Answers): Section[] =>
  step.sections.filter((s) => evaluate(s.showIf, a));
export const visibleFields = (section: Section, a: Answers): Field[] =>
  section.fields.filter((f) => evaluate(f.showIf, a));

/** Every field of the form in order, with the step it belongs to. */
export function allFields(def: FormDefinition): { field: Field; step: Step; section: Section }[] {
  const out: { field: Field; step: Step; section: Section }[] = [];
  for (const step of def.steps)
    for (const section of step.sections)
      for (const field of section.fields) out.push({ field, step, section });
  return out;
}

function ageOn(dobIso: string, today: Date): number {
  const d = new Date(`${dobIso}T00:00:00Z`);
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Ghana mobile/landline in local (0XX XXX XXXX) or international (+233 …) form. */
const PHONE = /^(\+233|0)\d{9}$/;

function checkScalar(field: Field, v: AnswerValue, today: Date): string | null {
  switch (field.type) {
    case 'email':
      return typeof v === 'string' && EMAIL.test(v.trim()) ? null : 'Enter a valid email address.';
    case 'phone':
      return typeof v === 'string' && PHONE.test(v.replace(/[\s-]/g, ''))
        ? null
        : 'Enter a Ghana phone number, for example 024 123 4567.';
    case 'text':
    case 'textarea': {
      if (typeof v !== 'string') return 'Enter text.';
      if (field.maxLength && v.length > field.maxLength)
        return `Keep this under ${field.maxLength} characters.`;
      if (field.format) {
        const n = normaliseFormat(field.format, v);
        if (!FORMATS[field.format].test(n)) return FORMAT_MESSAGES[field.format];
      }
      return null;
    }
    case 'number':
    case 'money':
    case 'percent':
    case 'year': {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return 'Enter a number.';
      if (field.type === 'percent' && (n < 0 || n > 100)) return 'Enter a percentage between 0 and 100.';
      if (field.type === 'money' && n < 0) return 'Enter an amount of zero or more.';
      if (field.type === 'year') {
        const max = field.max ?? today.getUTCFullYear() + 1;
        if (!Number.isInteger(n) || n < (field.min ?? 1900) || n > max) return 'Enter a valid year.';
      }
      if (field.min !== undefined && n < field.min) return `Enter ${field.min} or more.`;
      if (field.max !== undefined && n > field.max) return `Enter ${field.max} or less.`;
      return null;
    }
    case 'date': {
      if (typeof v !== 'string' || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v)))
        return 'Enter a valid date.';
      const days = Math.round(
        (Date.parse(`${v}T00:00:00Z`) -
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) /
          86_400_000,
      );
      if (field.minDays !== undefined && days < field.minDays)
        return field.minDays === 0 ? 'The date cannot be in the past.' : 'Choose a later date.';
      if (field.maxDays !== undefined && days > field.maxDays) return 'Choose an earlier date.';
      const age = ageOn(v, today);
      if (field.minAge !== undefined && age < field.minAge) return `You must be at least ${field.minAge}.`;
      if (field.maxAge !== undefined && age > field.maxAge)
        return `The maximum age for this cover is ${field.maxAge}.`;
      return null;
    }
    case 'select':
    case 'radio': {
      if (typeof v !== 'string') return 'Choose an option.';
      if (v === '__other') return null;
      return field.options.some((op) => op.value === v) ? null : 'Choose one of the options.';
    }
    case 'yesno':
      return v === 'yes' || v === 'no' ? null : 'Choose Yes or No.';
    case 'checkboxes':
      return Array.isArray(v) &&
        (v as readonly unknown[]).every(
          (x) => typeof x === 'string' && (x === '__other' || field.options.some((op) => op.value === x)),
        )
        ? null
        : 'Choose from the options.';
    case 'read':
      return null;
    default:
      return null;
  }
}

function checkField(field: Field, a: Answers, today: Date, out: FieldError[]): void {
  const v = a[field.id];
  if (field.type === 'read') {
    if (field.acknowledge && v !== true)
      out.push({ field: field.id, message: 'Please confirm you have read this.' });
    return;
  }
  if (isEmpty(v)) {
    if (field.required) {
      const message =
        field.type === 'file'
          ? 'Please attach this.'
          : field.type === 'select' ||
              field.type === 'radio' ||
              field.type === 'yesno' ||
              field.type === 'checkboxes'
            ? 'Please choose an answer.'
            : field.type === 'table'
              ? 'Please add at least one entry.'
              : 'Please answer this question.';
      out.push({ field: field.id, message });
    }
    return;
  }
  if (field.type === 'file') {
    const ids = v as readonly string[];
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string'))
      out.push({ field: field.id, message: 'Attach the file again.' });
    else if (field.maxFiles && ids.length > field.maxFiles)
      out.push({ field: field.id, message: `Attach at most ${field.maxFiles} files.` });
    return;
  }
  if (field.type === 'table') {
    const rows = v as readonly TableRow[];
    if (!Array.isArray(rows)) {
      out.push({ field: field.id, message: 'Add the entries again.' });
      return;
    }
    if (field.minRows && rows.length < field.minRows)
      out.push({ field: field.id, message: `Add at least ${field.minRows}.` });
    if (field.maxRows && rows.length > field.maxRows)
      out.push({ field: field.id, message: `Add at most ${field.maxRows}.` });
    rows.forEach((row, i) => {
      for (const col of field.columns) {
        const cell = row[col.id];
        if (cell === undefined || cell === null || cell === '') {
          if (col.required)
            out.push({
              field: field.id,
              row: i,
              column: col.id,
              message: `Enter ${col.label.toLowerCase()}.`,
            });
          continue;
        }
        if (['number', 'money', 'year'].includes(col.type) && !Number.isFinite(Number(cell)))
          out.push({ field: field.id, row: i, column: col.id, message: 'Enter a number.' });
        if (col.type === 'select' && col.options && !col.options.some((op) => op.value === cell))
          out.push({ field: field.id, row: i, column: col.id, message: 'Choose one of the options.' });
      }
    });
    return;
  }
  const msg = checkScalar(field, v as AnswerValue, today);
  if (msg) {
    out.push({ field: field.id, message: msg });
    return;
  }
  if (
    (field.type === 'select' || field.type === 'radio') &&
    v === '__other' &&
    isEmpty(a[`${field.id}__other`])
  )
    out.push({ field: `${field.id}__other`, message: 'Please specify.' });
  if (field.type === 'checkboxes') {
    const picked = v as readonly string[];
    if (field.required && picked.length < (field.minSelected ?? 1))
      out.push({ field: field.id, message: `Choose at least ${field.minSelected ?? 1}.` });
    if (picked.includes('__other') && isEmpty(a[`${field.id}__other`]))
      out.push({ field: `${field.id}__other`, message: 'Please specify.' });
  }
  if (
    field.type === 'yesno' &&
    field.details &&
    v === field.details.when &&
    field.details.required !== false
  ) {
    if (isEmpty(a[`${field.id}__details`]))
      out.push({ field: `${field.id}__details`, message: 'Please give the details.' });
  }
}

/** Errors for one step (what the wizard checks before "Continue"). */
export function validateStep(step: Step, answers: Answers, today = new Date()): FieldError[] {
  const out: FieldError[] = [];
  for (const section of visibleSections(step, answers))
    for (const field of visibleFields(section, answers)) checkField(field, answers, today, out);
  return out;
}

/** Errors for the whole form, including the declaration's fields (not the signature). */
export function validateForm(def: FormDefinition, answers: Answers, today = new Date()): FieldError[] {
  const out: FieldError[] = [];
  for (const step of def.steps) out.push(...validateStep(step, answers, today));
  for (const f of def.declaration.fields ?? [])
    if (evaluate(f.showIf, answers)) checkField(f, answers, today, out);
  return out;
}

/** Index of the first step with an error (the step to resume on), or `steps.length` when complete. */
export function firstIncompleteStep(def: FormDefinition, answers: Answers, today = new Date()): number {
  const i = def.steps.findIndex((s) => validateStep(s, answers, today).length > 0);
  return i === -1 ? def.steps.length : i;
}

/** Keys an answer set may contain for a field (the field id plus its companions). */
function keysFor(field: Field): string[] {
  const k = [field.id];
  if (field.type === 'yesno' && field.details) k.push(`${field.id}__details`);
  if ((field.type === 'select' || field.type === 'radio' || field.type === 'checkboxes') && field.allowOther)
    k.push(`${field.id}__other`);
  if (field.type === 'money' && field.currency === 'select') k.push(`${field.id}__currency`);
  return k;
}

/**
 * Keeps only answers to visible fields, normalising formatted text. Run on the server before
 * storing a submitted proposal so hidden or unknown keys never reach the document.
 */
export function clean(def: FormDefinition, answers: Answers): Answers {
  const out: Answers = {};
  const fields: Field[] = [];
  for (const step of def.steps)
    for (const section of visibleSections(step, answers)) fields.push(...visibleFields(section, answers));
  for (const f of def.declaration.fields ?? []) if (evaluate(f.showIf, answers)) fields.push(f);
  for (const field of fields) {
    for (const key of keysFor(field)) {
      const v = answers[key];
      if (v === undefined) continue;
      if (key === field.id && field.type === 'text' && field.format && typeof v === 'string')
        out[key] = normaliseFormat(field.format, v);
      else out[key] = typeof v === 'string' ? v.trim() : v;
    }
  }
  return out;
}
