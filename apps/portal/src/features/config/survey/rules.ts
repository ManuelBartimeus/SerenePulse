// Constrained rule builder (M04) for `visible_when` and `required`. It reads and writes the JSON-logic
// subset evaluated by @serene/survey-engine (var, eq, ne, in, and, or, not, lte, gte). Rules it cannot
// represent are shown read-only rather than rewritten.
import {
  questions,
  type Definition,
  type Json,
  type Question,
  type Rule,
  type Snapshot,
} from '@serene/survey-engine';

export type ConditionOp = 'is_true' | 'is_false' | 'eq' | 'ne' | 'in' | 'lte' | 'gte';

export interface Condition {
  /** A question id, or `id.attribute` for an attribute of the chosen option. */
  field: string;
  op: ConditionOp;
  value?: Json;
}

export interface RuleModel {
  combinator: 'all' | 'any';
  conditions: Condition[];
}

export type FieldKind = 'boolean' | 'code' | 'enum' | 'number' | 'text';

export interface RuleField {
  path: string;
  label: string;
  kind: FieldKind;
  /** Choices for code / enum fields. */
  options?: { value: string; label: string }[];
  /** Range for number fields. */
  range?: [number, number];
}

export const OPS_FOR_KIND: Record<FieldKind, ConditionOp[]> = {
  boolean: ['is_true', 'is_false'],
  text: ['is_true', 'is_false'],
  code: ['eq', 'ne', 'in'],
  enum: ['eq', 'ne', 'in'],
  number: ['eq', 'ne', 'lte', 'gte'],
};

export const OP_LABELS: Record<ConditionOp, string> = {
  is_true: 'is answered / on',
  is_false: 'is not answered / off',
  eq: 'is',
  ne: 'is not',
  in: 'is one of',
  lte: 'is at most',
  gte: 'is at least',
};

const BRANCH_REQUIREMENT = [
  { value: 'required', label: 'Required' },
  { value: 'optional', label: 'Optional' },
  { value: 'hidden', label: 'Hidden' },
];

function isVar(r: Json | undefined): r is { var: string } {
  return (
    typeof r === 'object' &&
    r !== null &&
    !Array.isArray(r) &&
    Object.keys(r).length === 1 &&
    typeof (r as Record<string, Json>).var === 'string'
  );
}

function single(rule: Json): [string, Json] | null {
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) return null;
  const entries = Object.entries(rule);
  return entries.length === 1 ? (entries[0] as [string, Json]) : null;
}

function isScalar(v: Json | undefined): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function parseCondition(rule: Json): Condition | null {
  if (isVar(rule)) return { field: rule.var, op: 'is_true' };
  const s = single(rule);
  if (!s) return null;
  const [op, raw] = s;
  if (op === 'not') {
    const inner = Array.isArray(raw) ? raw[0] : raw;
    return isVar(inner) && (!Array.isArray(raw) || raw.length === 1)
      ? { field: inner.var, op: 'is_false' }
      : null;
  }
  if (!Array.isArray(raw) || raw.length !== 2 || !isVar(raw[0])) return null;
  const field = raw[0].var;
  const value = raw[1];
  switch (op) {
    case 'eq':
    case 'ne':
      return isScalar(value) ? { field, op, value } : null;
    case 'lte':
    case 'gte':
      return typeof value === 'number' ? { field, op, value } : null;
    case 'in':
      return Array.isArray(value) && value.every(isScalar) ? { field, op, value } : null;
    default:
      return null;
  }
}

/** Reads a rule into the builder model. `undefined` → no conditions; unrepresentable → null. */
export function parseRule(rule: Rule | undefined): RuleModel | null {
  if (rule === undefined || rule === null) return { combinator: 'all', conditions: [] };
  const s = single(rule);
  if (s && (s[0] === 'and' || s[0] === 'or') && Array.isArray(s[1])) {
    const conditions = s[1].map(parseCondition);
    if (conditions.some((c) => c === null)) return null;
    return { combinator: s[0] === 'and' ? 'all' : 'any', conditions: conditions as Condition[] };
  }
  const c = parseCondition(rule);
  return c ? { combinator: 'all', conditions: [c] } : null;
}

export function serialiseCondition(c: Condition): Rule {
  const v = { var: c.field };
  switch (c.op) {
    case 'is_true':
      return v;
    case 'is_false':
      return { not: v };
    case 'in':
      return { in: [v, Array.isArray(c.value) ? c.value : []] };
    default:
      return { [c.op]: [v, c.value ?? null] };
  }
}

/** Writes the builder model back as engine JSON. No conditions → undefined (always). */
export function serialiseRule(model: RuleModel): Rule | undefined {
  if (model.conditions.length === 0) return undefined;
  if (model.conditions.length === 1) return serialiseCondition(model.conditions[0] as Condition);
  return { [model.combinator === 'all' ? 'and' : 'or']: model.conditions.map(serialiseCondition) };
}

/** Problems that would make the rule meaningless; shown inline in the builder. */
export function conditionProblem(c: Condition, fields: RuleField[]): string | null {
  const f = fields.find((x) => x.path === c.field);
  if (!f) return 'Choose an earlier question.';
  if (!OPS_FOR_KIND[f.kind].includes(c.op)) return 'Choose a comparison.';
  if (c.op === 'in' && (!Array.isArray(c.value) || c.value.length === 0)) return 'Choose at least one value.';
  if (f.kind === 'number' && typeof c.value !== 'number') return 'Choose a number.';
  if ((c.op === 'eq' || c.op === 'ne') && (c.value === undefined || c.value === null || c.value === ''))
    return 'Choose a value.';
  return null;
}

/** The fields a rule on question `qid` may refer to: earlier questions only (engine guardrail). */
export function fieldsBefore(def: Definition, qid: string, snapshot: Snapshot | null): RuleField[] {
  const all = questions(def);
  const idx = all.findIndex((q) => q.id === qid);
  const earlier = idx < 0 ? all : all.slice(0, idx);
  return earlier.flatMap((q) => fieldsOf(q, snapshot));
}

function short(q: Question): string {
  const text = q.label.length > 48 ? `${q.label.slice(0, 47)}…` : q.label;
  return `${q.id} (“${text}”)`;
}

function fieldsOf(q: Question, snapshot: Snapshot | null): RuleField[] {
  switch (q.type) {
    case 'single_choice': {
      const opts = q.options_source && snapshot ? snapshot[q.options_source] : [];
      const out: RuleField[] = [
        {
          path: q.id,
          label: `${short(q)}: chosen option`,
          kind: 'code',
          options: opts.map((o) => ({ value: o.code, label: o.label })),
        },
        { path: `${q.id}.is_other`, label: `${short(q)}: “Other” chosen`, kind: 'boolean' },
      ];
      if (q.options_source === 'improvement_factors')
        out.push({ path: `${q.id}.is_none`, label: `${short(q)}: “Nothing” chosen`, kind: 'boolean' });
      if (q.options_source === 'service_channels')
        out.push({
          path: `${q.id}.branch_requirement`,
          label: `${short(q)}: branch question for that channel`,
          kind: 'enum',
          options: BRANCH_REQUIREMENT,
        });
      return out;
    }
    case 'rating_5':
      return [{ path: q.id, label: `${short(q)}: score`, kind: 'number', range: [1, 5] }];
    case 'rating_0_10':
      return [{ path: q.id, label: `${short(q)}: score`, kind: 'number', range: [0, 10] }];
    case 'toggle':
      return [{ path: q.id, label: `${short(q)}: switched on`, kind: 'boolean' }];
    case 'text_short':
    case 'text_long':
    case 'phone':
      return [{ path: q.id, label: `${short(q)}: answered`, kind: 'text' }];
  }
}

/** A default condition for a newly added row. */
export function newCondition(fields: RuleField[]): Condition | null {
  const f = fields[0];
  if (!f) return null;
  return defaultConditionFor(f);
}

export function defaultConditionFor(f: RuleField): Condition {
  const op = OPS_FOR_KIND[f.kind][0] as ConditionOp;
  if (f.kind === 'number') return { field: f.path, op, value: f.range?.[0] ?? 0 };
  if (f.kind === 'code' || f.kind === 'enum')
    return { field: f.path, op, value: f.options?.[0]?.value ?? '' };
  return { field: f.path, op };
}

function valueText(v: Json | undefined, f: RuleField | undefined): string {
  const one = (x: Json) => {
    const o = f?.options?.find((opt) => opt.value === x);
    return o ? `“${o.label}”` : JSON.stringify(x);
  };
  if (Array.isArray(v)) return v.map(one).join(' or ');
  return v === undefined ? '' : one(v);
}

/** Plain-language summary for the outline, e.g. "Shown when channel: chosen option is “Walk-in…”". */
export function describeRule(model: RuleModel | null, fields: RuleField[]): string {
  if (model === null) return 'Custom rule (edit as JSON)';
  if (model.conditions.length === 0) return 'Always';
  const parts = model.conditions.map((c) => {
    const f = fields.find((x) => x.path === c.field);
    const name = f?.label ?? c.field;
    if (c.op === 'is_true' || c.op === 'is_false') return `${name} ${OP_LABELS[c.op]}`;
    return `${name} ${OP_LABELS[c.op]} ${valueText(c.value, f)}`;
  });
  return parts.join(model.combinator === 'all' ? ' and ' : ' or ');
}
