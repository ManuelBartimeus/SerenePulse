// Wizard step logic, driven entirely by the FormDefinition (no form-specific code; roles only).
import {
  evaluate,
  isEmpty,
  validateStep,
  visibleFields,
  visibleSections,
  type Answers,
  type AnswerValue,
  type CustomerProfile,
  type Field,
  type FieldError,
  type FieldRole,
  type FormDefinition,
  type Option,
  type Step,
} from '@serene/proposals';
import { addDays, addYears, formatPhoneLocal, isoDay } from './format';

export type WizardStep =
  | { kind: 'form'; index: number; id: string; title: string; step: Step }
  | { kind: 'review'; index: number; id: 'review'; title: 'Review' }
  | { kind: 'sign'; index: number; id: 'sign'; title: 'Sign' }
  | { kind: 'pay'; index: number; id: 'pay'; title: 'Pay' };

/**
 * All wizard stages: the form's steps, then Review, Sign and Pay. Indices are stable (they are
 * what `currentStep` stores), even when a form step is currently hidden.
 */
export function wizardSteps(def: FormDefinition): WizardStep[] {
  const n = def.steps.length;
  return [
    ...def.steps.map((step, index): WizardStep => ({
      kind: 'form',
      index,
      id: step.id,
      title: step.title,
      step,
    })),
    { kind: 'review', index: n, id: 'review', title: 'Review' },
    { kind: 'sign', index: n + 1, id: 'sign', title: 'Sign' },
    { kind: 'pay', index: n + 2, id: 'pay', title: 'Pay' },
  ];
}

/** A form step with no visible section is skipped. */
export function isStepVisible(s: WizardStep, answers: Answers): boolean {
  if (s.kind !== 'form') return true;
  return visibleSections(s.step, answers).some((sec) => visibleFields(sec, answers).length > 0);
}

/** The steps shown in the progress bar for the current answers. */
export const visibleWizardSteps = (def: FormDefinition, answers: Answers): WizardStep[] =>
  wizardSteps(def).filter((s) => isStepVisible(s, answers));

export function nextStepIndex(def: FormDefinition, answers: Answers, from: number): number {
  const steps = visibleWizardSteps(def, answers);
  return steps.find((s) => s.index > from)?.index ?? from;
}

export function prevStepIndex(def: FormDefinition, answers: Answers, from: number): number | null {
  const steps = visibleWizardSteps(def, answers).filter((s) => s.index < from);
  return steps.length ? (steps[steps.length - 1]?.index ?? null) : null;
}

/** Clamp a stored or requested step to one that exists and is visible (never Pay). */
export function clampStep(def: FormDefinition, answers: Answers, requested: number): number {
  const steps = visibleWizardSteps(def, answers).filter((s) => s.kind !== 'pay');
  if (steps.length === 0) return 0;
  const exact = steps.find((s) => s.index === requested);
  if (exact) return exact.index;
  const after = steps.find((s) => s.index > requested);
  return (after ?? steps[steps.length - 1])?.index ?? 0;
}

export function stepErrors(
  def: FormDefinition,
  answers: Answers,
  index: number,
  today = new Date(),
): FieldError[] {
  const step = def.steps[index];
  return step ? validateStep(step, answers, today) : [];
}

/** The pseudo-step for the declaration's own fields (agent, place of signing …). */
export function declarationStep(def: FormDefinition): Step {
  return {
    id: '__declaration',
    title: 'Declaration',
    sections: [{ id: '__declaration', fields: def.declaration.fields ?? [] }],
  };
}

/** Field id an error refers to (companions such as `x__other` / `x__details` map back to `x`). */
export const baseFieldId = (errField: string): string => errField.replace(/__(other|details|currency)$/, '');

/** Wizard step that holds a field: form step index, the Sign step for declaration fields, else null. */
export function stepOfField(def: FormDefinition, fieldId: string): number | null {
  const id = baseFieldId(fieldId);
  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i];
    if (step?.sections.some((s) => s.fields.some((f) => f.id === id))) return i;
  }
  if ((def.declaration.fields ?? []).some((f) => f.id === id)) return def.steps.length + 1;
  return null;
}

/** First step containing one of the errors (for a 422 from submit). */
export function stepOfFirstError(def: FormDefinition, errors: readonly FieldError[]): number | null {
  let best: number | null = null;
  for (const e of errors) {
    const s = stepOfField(def, e.field);
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}

/** Index of the first form step that is visible and has errors, or null when all are complete. */
export function firstInvalidStep(def: FormDefinition, answers: Answers, today = new Date()): number | null {
  for (const s of visibleWizardSteps(def, answers)) {
    if (s.kind === 'form' && validateStep(s.step, answers, today).length > 0) return s.index;
  }
  return null;
}

/** DOM id of the input for a field error (table cells have their own ids). */
export function errorTargetId(e: FieldError): string {
  if (e.row !== undefined && e.column) return `f-${e.field}-${e.row}-${e.column}`;
  return `f-${e.field}`;
}

// ---- Prefill ---------------------------------------------------------------------------------------

function profileValue(profile: CustomerProfile, key: NonNullable<Field['prefill']>): AnswerValue | undefined {
  const v = profile[key];
  if (v === undefined || v === '') return undefined;
  if (key === 'phone') return formatPhoneLocal(String(v));
  return v;
}

function allFormFields(def: FormDefinition): Field[] {
  return [
    ...def.steps.flatMap((s) => s.sections.flatMap((sec) => sec.fields)),
    ...(def.declaration.fields ?? []),
  ];
}

/** Answers with empty prefilled fields filled from the profile. Never overwrites an answer. */
export function applyPrefill(
  def: FormDefinition,
  answers: Answers,
  profile: CustomerProfile | undefined,
): Answers {
  if (!profile) return answers;
  const out: Answers = { ...answers };
  for (const f of allFormFields(def)) {
    if (!f.prefill || !isEmpty(out[f.id])) continue;
    const v = profileValue(profile, f.prefill);
    if (v === undefined) continue;
    if ((f.type === 'select' || f.type === 'radio') && !f.options.some((o) => o.value === v)) continue;
    out[f.id] = v;
  }
  return out;
}

/** One year less a day after an ISO start date, or null. */
export function oneYearLessADay(startIso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso)) return null;
  const s = new Date(`${startIso}T00:00:00`);
  if (Number.isNaN(s.getTime())) return null;
  return isoDay(addDays(addYears(s, 1), -1));
}

/**
 * When the cover start (role coverStart) changes, fill the cover end (role coverEnd) with one year
 * less a day — but only if the end is empty or still the value we derived from the old start.
 */
export function deriveCoverEnd(def: FormDefinition, prev: Answers, next: Answers): Answers {
  const fields = allFormFields(def);
  const start = fields.find((f) => f.role === 'coverStart');
  const end = fields.find((f) => f.role === 'coverEnd');
  if (!start || !end || prev[start.id] === next[start.id]) return next;
  const newStart = next[start.id];
  if (typeof newStart !== 'string') return next;
  const oldDerived = typeof prev[start.id] === 'string' ? oneYearLessADay(String(prev[start.id])) : null;
  const curEnd = next[end.id];
  if (!isEmpty(curEnd) && curEnd !== oldDerived) return next;
  const derived = oneYearLessADay(newStart);
  return derived ? { ...next, [end.id]: derived } : next;
}

// ---- Rating ------------------------------------------------------------------------------------------

const RATING_ROLES: readonly FieldRole[] = [
  'coverStart',
  'coverEnd',
  'coverType',
  'sumInsured',
  'vehicles',
  'vehicleUse',
  'tppdIncrease',
  'travelDestination',
  'travelers',
];

/** Field ids whose answers change the price (fields with a rating role, plus their companions). */
export function ratingFieldIds(def: FormDefinition): string[] {
  return allFormFields(def)
    .filter((f) => f.role && RATING_ROLES.includes(f.role))
    .map((f) => f.id);
}

/** Stable fingerprint of the rating answers: requote only when it changes. */
export function ratingFingerprint(def: FormDefinition, answers: Answers): string {
  const ids = ratingFieldIds(def);
  return JSON.stringify(ids.map((id) => [id, answers[id] ?? null, answers[`${id}__other`] ?? null]));
}

/** True once at least one rating answer exists (before that the price panel shows a hint). */
export function hasRatingInput(def: FormDefinition, answers: Answers): boolean {
  return ratingFieldIds(def).some((id) => !isEmpty(answers[id]));
}

// ---- Answer display (Review step) ----------------------------------------------------------------

export const OTHER = '__other';

function optionLabel(options: readonly Option[], v: unknown): string {
  return options.find((o) => o.value === v)?.label ?? String(v);
}

/** Human-readable answer for the Review step. `fileName` resolves uploaded file ids. */
export function displayAnswer(field: Field, answers: Answers, fileName: (id: string) => string): string {
  const v = answers[field.id];
  if (field.type === 'read')
    return v === true ? 'Read and confirmed' : field.acknowledge ? 'Not confirmed' : 'Read';
  if (isEmpty(v)) return '';
  switch (field.type) {
    case 'select':
    case 'radio':
      return v === OTHER
        ? `Other: ${String(answers[`${field.id}__other`] ?? '')}`
        : optionLabel(field.options, v);
    case 'checkboxes':
      return (v as readonly string[])
        .map((x) =>
          x === OTHER
            ? `Other: ${String(answers[`${field.id}__other`] ?? '')}`
            : optionLabel(field.options, x),
        )
        .join(', ');
    case 'yesno': {
      const base = v === 'yes' ? 'Yes' : 'No';
      const details = answers[`${field.id}__details`];
      return field.details && v === field.details.when && typeof details === 'string' && details.trim()
        ? `${base}: ${details.trim()}`
        : base;
    }
    case 'money': {
      const cur =
        field.currency === 'select'
          ? String(answers[`${field.id}__currency`] ?? 'GHS')
          : (field.currency ?? 'GHS');
      const sym = { GHS: 'GH₵', USD: 'US$', EUR: '€', GBP: '£' }[cur] ?? cur;
      return `${sym} ${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    case 'percent':
      return `${String(v)}%`;
    case 'number':
      return field.unit ? `${String(v)} ${field.unit}` : String(v);
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
      if (!m) return String(v);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? ''} ${m[1]}`;
    }
    case 'file':
      return (v as readonly string[]).map(fileName).join(', ');
    case 'table':
      return `${(v as readonly unknown[]).length} ${(v as readonly unknown[]).length === 1 ? 'entry' : 'entries'}`;
    default:
      return String(v);
  }
}

/** Visible fields of a step, flattened with their section (for the Review step). */
export function reviewRows(step: Step, answers: Answers): { field: Field; sectionTitle?: string }[] {
  const out: { field: Field; sectionTitle?: string }[] = [];
  for (const sec of visibleSections(step, answers))
    for (const f of visibleFields(sec, answers)) {
      if (f.type === 'read' && !f.acknowledge) continue;
      out.push(sec.title ? { field: f, sectionTitle: sec.title } : { field: f });
    }
  return out;
}

export { evaluate };

/** Step holding the cover choice or cover dates (where a renewal opens). Falls back to 0. */
export function coverStepIndex(def: FormDefinition): number {
  const roles: FieldRole[] = ['coverType', 'coverStart', 'sumInsured'];
  for (const role of roles) {
    const i = def.steps.findIndex((s) => s.sections.some((sec) => sec.fields.some((f) => f.role === role)));
    if (i >= 0) return i;
  }
  return 0;
}
