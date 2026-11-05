import { describe, expect, it } from 'vitest';
import { evalRule, guardrails, type Definition, type Rule, type Snapshot } from '@serene/survey-engine';
import v1 from '@serene/survey-engine/v1.json';
import { describeRule, fieldsBefore, parseRule, serialiseRule, type RuleModel } from './rules';
import { diffDefinitions, scaleChanged } from './diff';

const def = v1 as unknown as Definition;
const snapshot: Snapshot = {
  service_channels: [
    { code: 'WALK_IN', label: 'Walk-in', branch_requirement: 'required' },
    { code: 'WEBSITE', label: 'Website', branch_requirement: 'hidden' },
    { code: 'OTHER', label: 'Other', branch_requirement: 'optional', is_other: true },
  ],
  branches: [{ code: 'KASOA', label: 'Kasoa' }],
  insurance_products: [{ code: 'MOTOR', label: 'Motor' }],
  improvement_factors: [{ code: 'NONE', label: 'Nothing', is_none: true }],
  phone_prefixes: ['024'],
};

describe('rule builder serialisation (T-M04-100)', () => {
  it('reads every v1 rule and writes it back unchanged', () => {
    for (const q of def.pages.flatMap((p) => p.questions)) {
      for (const rule of [q.visible_when, typeof q.required === 'object' ? q.required : undefined]) {
        if (rule === undefined) continue;
        const model = parseRule(rule);
        expect(model, JSON.stringify(rule)).not.toBeNull();
        expect(serialiseRule(model!)).toEqual(rule);
      }
    }
  });
  it('round-trips combined conditions and keeps engine semantics', () => {
    const model: RuleModel = {
      combinator: 'any',
      conditions: [
        { field: 'channel', op: 'eq', value: 'WALK_IN' },
        { field: 'channel.is_other', op: 'is_true' },
        { field: 'csat', op: 'lte', value: 2 },
        { field: 'contact_consent', op: 'is_false' },
        { field: 'channel', op: 'in', value: ['WEBSITE'] },
        { field: 'nps', op: 'ne', value: 10 },
      ],
    };
    const rule = serialiseRule(model) as Rule;
    expect(parseRule(rule)).toEqual(model);
    const answers = { channel: 'WEBSITE', csat: 4, contact_consent: true, nps: 10 };
    expect(evalRule(def, snapshot, answers, rule)).toBe(true);
    expect(evalRule(def, snapshot, { ...answers, channel: 'X' }, rule)).toBe(false);
    expect(evalRule(def, snapshot, { ...answers, channel: 'X', csat: 2 }, rule)).toBe(true);
  });
  it('serialises an empty model as "always" and a single condition without a wrapper', () => {
    expect(serialiseRule({ combinator: 'all', conditions: [] })).toBeUndefined();
    expect(parseRule(undefined)).toEqual({ combinator: 'all', conditions: [] });
    expect(serialiseRule({ combinator: 'all', conditions: [{ field: 'x', op: 'is_false' }] })).toEqual({
      not: { var: 'x' },
    });
  });
  it('refuses rules it cannot represent rather than rewriting them', () => {
    expect(parseRule({ and: [{ or: [{ var: 'a' }] }] })).toBeNull();
    expect(parseRule({ eq: [1, 2] })).toBeNull();
    expect(parseRule({ lte: [{ var: 'csat' }, 'two'] })).toBeNull();
    expect(parseRule(true)).toBeNull();
  });
  it('offers only earlier questions as fields', () => {
    const paths = fieldsBefore(def, 'branch', snapshot).map((f) => f.path);
    expect(paths).toContain('channel.branch_requirement');
    expect(paths).not.toContain('product');
    expect(fieldsBefore(def, 'channel', snapshot)).toEqual([]);
    const ch = fieldsBefore(def, 'branch', snapshot).find((f) => f.path === 'channel');
    expect(ch?.options?.map((o) => o.value)).toEqual(['WALK_IN', 'WEBSITE', 'OTHER']);
  });
  it('describes rules in plain language', () => {
    const fields = fieldsBefore(def, 'phone', snapshot);
    expect(describeRule(parseRule({ var: 'contact_consent' }), fields)).toMatch(
      /contact_consent.*switched on/,
    );
    expect(describeRule(null, fields)).toMatch(/Custom/);
    expect(describeRule(parseRule(undefined), fields)).toBe('Always');
  });
});

describe('definition diff (T-M04-101)', () => {
  it('reports no changes for an identical copy', () => {
    expect(diffDefinitions(def, structuredClone(def))).toEqual([]);
    expect(guardrails(def)).toEqual([]);
  });
  it('reports wording, title, position and removal changes', () => {
    const next = structuredClone(def);
    next.pages[1]!.questions[0]!.label = 'New CSAT wording';
    next.pages[0]!.title = 'Your policy';
    const p5 = next.pages[4]!;
    p5.questions = p5.questions.filter((q) => q.id !== 'first_name');
    const [a, b] = [p5.questions[0]!, p5.questions[1]!];
    p5.questions[0] = b;
    p5.questions[1] = a;
    const d = diffDefinitions(def, next);
    expect(d).toContainEqual(
      expect.objectContaining({ kind: 'changed', target: 'csat', field: 'label', after: 'New CSAT wording' }),
    );
    expect(d).toContainEqual(expect.objectContaining({ kind: 'changed', target: 'page:1', field: 'title' }));
    expect(d).toContainEqual(expect.objectContaining({ kind: 'removed', target: 'first_name' }));
    expect(d).toContainEqual(expect.objectContaining({ target: 'factor', field: 'position' }));
  });
  it('detects rating-scale changes but ignores reordering', () => {
    const next = structuredClone(def);
    expect(scaleChanged(def, next)).toBe(false);
    next.pages[2]!.questions[0]!.type = 'rating_0_10';
    expect(scaleChanged(def, next)).toBe(true);
    expect(scaleChanged(null, next)).toBe(false);
  });
});
