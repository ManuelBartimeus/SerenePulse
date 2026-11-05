// Survey engine (M04): visibility, requiredness, clearing, validation and guardrails for a survey
// definition. The SQL validator in `survey.validate_answers` mirrors this file rule for rule, and
// tests check both agree on generated answer sets. Keep them in step.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** A small JSON-logic subset: var, eq, ne, in, and, or, not, lte, gte, plus literals. */
export type Rule = Json;

export type QuestionType =
  'single_choice' | 'rating_5' | 'rating_0_10' | 'text_short' | 'text_long' | 'toggle' | 'phone';

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  help?: string;
  options_source?: CatalogueKey;
  anchors?: string[];
  required?: boolean | Rule;
  visible_when?: Rule;
  max_length?: number;
}
export interface Page {
  id: string;
  title: string;
  title_when_low_csat?: string;
  questions: Question[];
}
export interface Definition {
  schema: 1;
  intro: string;
  pages: Page[];
}

export type CatalogueKey = 'service_channels' | 'branches' | 'insurance_products' | 'improvement_factors';
export interface Option {
  code: string;
  label: string;
  is_other?: boolean;
  is_none?: boolean;
  branch_requirement?: 'required' | 'optional' | 'hidden';
}
export type Snapshot = Record<CatalogueKey, Option[]> & { phone_prefixes: string[] };
export type Answers = Record<string, Json | undefined>;

export interface FieldError {
  field: string;
  code: 'required' | 'invalid_option' | 'out_of_range' | 'too_long' | 'invalid_type' | 'invalid_phone';
}

/** The fixed answer slots responses can store (SPEC §2.3). Definitions may not add others (Rule 15). */
export const ANSWER_SLOTS: Record<string, { type: QuestionType[]; source?: CatalogueKey }> = {
  channel: { type: ['single_choice'], source: 'service_channels' },
  channel_other: { type: ['text_short'] },
  branch: { type: ['single_choice'], source: 'branches' },
  branch_other: { type: ['text_short'] },
  product: { type: ['single_choice'], source: 'insurance_products' },
  product_other: { type: ['text_short'] },
  csat: { type: ['rating_5'] },
  ces: { type: ['rating_5'] },
  nps: { type: ['rating_0_10'] },
  factor: { type: ['single_choice'], source: 'improvement_factors' },
  factor_other: { type: ['text_short'] },
  comment: { type: ['text_long'] },
  contact_consent: { type: ['toggle'] },
  phone: { type: ['phone'] },
  first_name: { type: ['text_short'] },
};
const REQUIRED_SLOTS = ['channel', 'product', 'csat', 'ces', 'nps'];
const DEFAULT_MAX: Partial<Record<QuestionType, number>> = { text_short: 80, text_long: 1000 };

export function isPresent(v: Json | undefined): boolean {
  return v !== undefined && v !== null && v !== '';
}
function truthy(v: Json | undefined): boolean {
  return isPresent(v) && v !== false;
}
function jsonEqual(a: Json | undefined, b: Json | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function questions(def: Definition): Question[] {
  return def.pages.flatMap((p) => p.questions);
}

function lookup(def: Definition, snapshot: Snapshot, answers: Answers, path: string): Json {
  const [id, attr] = path.split('.', 2) as [string, string | undefined];
  const value = answers[id];
  if (attr === undefined) return value ?? null;
  const q = questions(def).find((x) => x.id === id);
  if (!q?.options_source || typeof value !== 'string') return null;
  const option = snapshot[q.options_source].find((o) => o.code === value) as Record<string, Json> | undefined;
  return option?.[attr] ?? null;
}

export function evalRule(def: Definition, snapshot: Snapshot, answers: Answers, rule: Rule): Json {
  if (rule === null || typeof rule !== 'object') return rule;
  if (Array.isArray(rule)) return rule.map((r) => evalRule(def, snapshot, answers, r));
  const [op, raw] = Object.entries(rule)[0] ?? ['', null];
  const args = Array.isArray(raw) ? raw : [raw];
  const ev = (r: Rule | undefined) => evalRule(def, snapshot, answers, r ?? null);
  switch (op) {
    case 'var':
      return lookup(def, snapshot, answers, String(raw));
    case 'eq':
      return jsonEqual(ev(args[0]), ev(args[1]));
    case 'ne':
      return !jsonEqual(ev(args[0]), ev(args[1]));
    case 'in': {
      const list = ev(args[1]);
      const v = ev(args[0]);
      return Array.isArray(list) && list.some((x) => jsonEqual(x, v));
    }
    case 'and':
      return args.every((a) => truthy(ev(a)));
    case 'or':
      return args.some((a) => truthy(ev(a)));
    case 'not':
      return !truthy(ev(args[0]));
    case 'lte':
    case 'gte': {
      const a = ev(args[0]);
      const b = ev(args[1]);
      if (typeof a !== 'number' || typeof b !== 'number') return false;
      return op === 'lte' ? a <= b : a >= b;
    }
    default:
      throw new Error(`Unknown rule operator: ${op}`);
  }
}

export function isVisible(def: Definition, snapshot: Snapshot, answers: Answers, q: Question): boolean {
  return q.visible_when === undefined || truthy(evalRule(def, snapshot, answers, q.visible_when));
}
export function isRequired(def: Definition, snapshot: Snapshot, answers: Answers, q: Question): boolean {
  if (!isVisible(def, snapshot, answers, q)) return false;
  if (q.required === undefined || q.required === false) return false;
  if (q.required === true) return true;
  return truthy(evalRule(def, snapshot, answers, q.required));
}

/** Removes answers to questions that are hidden by earlier answers (REQ §2.4 clearing). */
export function clean(def: Definition, snapshot: Snapshot, answers: Answers): Answers {
  const out: Answers = {};
  for (const q of questions(def)) {
    if (answers[q.id] !== undefined && isVisible(def, snapshot, out, q)) out[q.id] = answers[q.id];
  }
  return out;
}

/** Ghana mobile number → E.164 (+233XXXXXXXXX), or null if invalid (A-145). */
export function normalizePhone(raw: string, prefixes: string[]): string | null {
  const digits = raw.replace(/[\s\-().]/g, '');
  let local: string;
  if (/^\+233\d{9}$/.test(digits)) local = `0${digits.slice(4)}`;
  else if (/^233\d{9}$/.test(digits)) local = `0${digits.slice(3)}`;
  else if (/^0\d{9}$/.test(digits)) local = digits;
  else return null;
  if (!prefixes.includes(local.slice(0, 3))) return null;
  return `+233${local.slice(1)}`;
}

/** Validates and normalises a complete answer set against a definition (submit-time rules). */
export function validate(
  def: Definition,
  snapshot: Snapshot,
  input: Answers,
): { answers: Answers; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const working: Answers = {};
  for (const q of questions(def)) {
    let v = input[q.id];
    if (typeof v === 'string' && (q.type === 'text_short' || q.type === 'text_long' || q.type === 'phone')) {
      v = v.trim();
    }
    if (!isVisible(def, snapshot, working, q)) continue;
    if (!isPresent(v)) {
      if (isRequired(def, snapshot, working, q)) errors.push({ field: q.id, code: 'required' });
      continue;
    }
    switch (q.type) {
      case 'single_choice': {
        const opts = q.options_source ? snapshot[q.options_source] : [];
        if (typeof v !== 'string' || !opts.some((o) => o.code === v)) {
          errors.push({ field: q.id, code: 'invalid_option' });
          continue;
        }
        break;
      }
      case 'rating_5':
      case 'rating_0_10': {
        const [lo, hi] = q.type === 'rating_5' ? [1, 5] : [0, 10];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
          errors.push({ field: q.id, code: 'out_of_range' });
          continue;
        }
        break;
      }
      case 'text_short':
      case 'text_long': {
        const max = q.max_length ?? DEFAULT_MAX[q.type] ?? 80;
        if (typeof v !== 'string') {
          errors.push({ field: q.id, code: 'invalid_type' });
          continue;
        }
        if ([...v].length > max) {
          errors.push({ field: q.id, code: 'too_long' });
          continue;
        }
        break;
      }
      case 'toggle':
        if (typeof v !== 'boolean') {
          errors.push({ field: q.id, code: 'invalid_type' });
          continue;
        }
        break;
      case 'phone': {
        const e164 = typeof v === 'string' ? normalizePhone(v, snapshot.phone_prefixes) : null;
        if (!e164) {
          errors.push({ field: q.id, code: 'invalid_phone' });
          continue;
        }
        v = e164;
        break;
      }
    }
    working[q.id] = v;
  }
  return { answers: working, errors };
}

export interface GuardrailProblem {
  path: string;
  message: string;
}

function ruleVars(rule: Rule | undefined): string[] {
  if (rule === null || rule === undefined || typeof rule !== 'object') return [];
  if (Array.isArray(rule)) return rule.flatMap(ruleVars);
  return Object.entries(rule).flatMap(([op, v]) =>
    op === 'var' ? [String(v).split('.')[0] ?? ''] : ruleVars(v as Rule),
  );
}

const IDENTITY_WORDS =
  /policy\s*(number|no\.?)|ghana\s*card|national\s*id|id\s*number|e-?mail|date of birth|address|surname|last name/i;

/** SPEC M04 guardrails, which cannot be overridden in the UI (REQ §2.9, §16, Rule 1, Rule 15). */
export function guardrails(def: Definition): GuardrailProblem[] {
  const out: GuardrailProblem[] = [];
  const all = questions(def);
  if (def.pages.length < 1 || def.pages.length > 5)
    out.push({ path: 'pages', message: 'A survey has 1 to 5 pages.' });
  const seen = new Set<string>();
  all.forEach((q, i) => {
    const path = `questions.${q.id}`;
    const slot = ANSWER_SLOTS[q.id];
    if (!slot)
      out.push({
        path,
        message: `"${q.id}" is not an answer the system can store. New questions need approval (Rule 15).`,
      });
    else {
      if (!slot.type.includes(q.type))
        out.push({ path, message: `"${q.id}" must be a ${slot.type.join(' or ')} question.` });
      if (slot.source && q.options_source !== slot.source)
        out.push({ path, message: `"${q.id}" must use the ${slot.source} list.` });
    }
    if (seen.has(q.id)) out.push({ path, message: `"${q.id}" appears twice.` });
    seen.add(q.id);
    if (!q.label.trim()) out.push({ path, message: 'Every question needs wording.' });
    if (IDENTITY_WORDS.test(`${q.label} ${q.help ?? ''}`)) {
      out.push({ path, message: 'The survey may not ask for identity details (Rule 12).' });
    }
    const earlier = new Set(all.slice(0, i).map((x) => x.id));
    for (const v of [
      ...ruleVars(q.visible_when),
      ...ruleVars(typeof q.required === 'object' ? q.required : null),
    ]) {
      if (!earlier.has(v)) out.push({ path, message: `Rules may only refer to earlier questions ("${v}").` });
    }
    if (
      (q.type === 'text_short' || q.type === 'text_long') &&
      q.required !== undefined &&
      q.required !== false
    ) {
      out.push({ path, message: 'Free-text answers are always optional (Rule 20).' });
    }
    if (
      q.type === 'phone' &&
      (q.required === true || !ruleVars(q.visible_when).includes('contact_consent'))
    ) {
      out.push({
        path,
        message: 'The phone number may be asked only when the customer switches on "contact me".',
      });
    }
    if (q.max_length !== undefined) {
      const cap = q.id.endsWith('_other')
        ? q.id === 'factor_other'
          ? 200
          : 80
        : (DEFAULT_MAX[q.type] ?? 80);
      if (q.max_length < 1 || q.max_length > cap)
        out.push({ path, message: `Maximum length is 1 to ${cap} characters.` });
    }
  });
  for (const id of REQUIRED_SLOTS) {
    const q = all.find((x) => x.id === id);
    if (!q) out.push({ path: `questions.${id}`, message: `The survey must ask "${id}".` });
    else if (q.required !== true) out.push({ path: `questions.${id}`, message: `"${id}" must be required.` });
  }
  const [p1, p2, p3, p4] = def.pages;
  if (p1) {
    const primary = p1.questions.filter((q) => q.visible_when === undefined || q.type === 'single_choice');
    if (primary.length > 3)
      out.push({ path: 'pages.0', message: 'Page 1 has at most 3 questions (plus clarifications).' });
  }
  [p2, p3, p4].forEach((p, i) => {
    if (p && (p.questions.length !== 1 || !p.questions[0]?.type.startsWith('rating'))) {
      out.push({ path: `pages.${i + 1}`, message: `Page ${i + 2} has exactly one rating question.` });
    }
  });
  return out;
}

/** Rating scales of a definition. Versions with different signatures are never mixed (Rule 6). */
export function scaleSignature(def: Definition): Record<string, string> {
  const sig: Record<string, string> = {};
  for (const q of questions(def)) {
    if (q.type === 'rating_5') sig[q.id] = '1-5';
    if (q.type === 'rating_0_10') sig[q.id] = '0-10';
  }
  return sig;
}

/** The page index (0-based) holding a question. */
export function pageOf(def: Definition, id: string): number {
  return def.pages.findIndex((p) => p.questions.some((q) => q.id === id));
}
