import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clean,
  guardrails,
  isRequired,
  isVisible,
  normalizePhone,
  questions,
  scaleSignature,
  validate,
} from './index';
import type { Definition, Snapshot } from './index';
import v1json from './v1.json';
import v2json from './v2.json';

const v1 = v1json as unknown as Definition;
const snapshot: Snapshot = {
  service_channels: [
    { code: 'MOBILE_APP', label: 'Mobile application', branch_requirement: 'hidden', is_other: false },
    { code: 'WALK_IN', label: 'Walk-in', branch_requirement: 'required', is_other: false },
    { code: 'OTHER', label: 'Other', branch_requirement: 'optional', is_other: true },
  ],
  branches: [
    { code: 'KASOA', label: 'Kasoa', is_other: false },
    { code: 'OTHER', label: 'Other branch', is_other: true },
  ],
  insurance_products: [
    { code: 'MOTOR', label: 'Motor insurance', is_other: false },
    { code: 'OTHER', label: 'Other', is_other: true },
  ],
  improvement_factors: [
    { code: 'SPEED', label: 'Speed', is_other: false, is_none: false },
    { code: 'OTHER', label: 'Other', is_other: true, is_none: false },
    { code: 'NONE', label: 'Nothing', is_other: false, is_none: true },
  ],
  phone_prefixes: ['020', '024', '054', '055'],
};
const q = (id: string) => questions(v1).find((x) => x.id === id)!;
const base = { channel: 'MOBILE_APP', product: 'MOTOR', csat: 4, ces: 5, nps: 9 };

describe('v1 definition', () => {
  it('passes every guardrail', () => {
    expect(guardrails(v1)).toEqual([]);
  });
  it('is the definition the migration publishes (T-M04-101)', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/202611060002_survey_definition.sql', import.meta.url),
      'utf8',
    );
    const embedded = sql.split('-- V1-BEGIN\n$v1$')[1]?.split('$v1$\n-- V1-END')[0] ?? '';
    expect(JSON.parse(embedded)).toEqual(v1);
  });
  it('has five pages with three transaction questions and one rating on pages 2–4 (FR-02)', () => {
    expect(v1.pages).toHaveLength(5);
    expect(scaleSignature(v1)).toEqual({ csat: '1-5', ces: '1-5', nps: '0-10' });
  });
});

describe('v2 definition (live from 2026-11-05)', () => {
  const v2 = v2json as unknown as Definition;
  it('passes every guardrail and keeps the v1 rating scales', () => {
    expect(guardrails(v2)).toEqual([]);
    expect(scaleSignature(v2)).toEqual(scaleSignature(v1));
  });
  it('is the definition the v2 migration publishes', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/202611120001_survey_v2.sql', import.meta.url),
      'utf8',
    );
    const embedded = sql.split('-- V2-BEGIN\n$v2$')[1]?.split('$v2$\n-- V2-END')[0] ?? '';
    expect(JSON.parse(embedded)).toEqual(v2);
  });
  it('has no Page 5 heading and requires the improvement question', () => {
    const p5 = v2.pages[4]!;
    expect(p5.title).toBe('');
    expect(p5.title_when_low_csat).toBeUndefined();
    const factor = questions(v2).find((x) => x.id === 'factor')!;
    expect(factor.label).toBe('What main thing should we improve upon?');
    expect(isRequired(v2, snapshot, base, factor)).toBe(true);
    expect(validate(v2, snapshot, base).errors).toContainEqual({ field: 'factor', code: 'required' });
    expect(validate(v2, snapshot, { ...base, factor: 'NONE' }).errors).toEqual([]);
  });
});

describe('branch rule (Rule 3, T-M04-001…004)', () => {
  it('is hidden for digital channels, required for walk-in, optional for Other', () => {
    expect(isVisible(v1, snapshot, { channel: 'MOBILE_APP' }, q('branch'))).toBe(false);
    expect(isRequired(v1, snapshot, { channel: 'WALK_IN' }, q('branch'))).toBe(true);
    expect(isVisible(v1, snapshot, { channel: 'OTHER' }, q('branch'))).toBe(true);
    expect(isRequired(v1, snapshot, { channel: 'OTHER' }, q('branch'))).toBe(false);
  });
  it('clears a branch when the channel stops asking for it', () => {
    expect(clean(v1, snapshot, { channel: 'MOBILE_APP', branch: 'KASOA' })).toEqual({
      channel: 'MOBILE_APP',
    });
  });
  it('offers no "I\'m not sure" option (T-M04-005)', () => {
    expect(snapshot.branches.map((b) => b.label.toLowerCase()).join()).not.toContain('not sure');
    expect(JSON.stringify(v1).toLowerCase()).not.toContain('not sure');
  });
  it('requires a branch for walk-in at submit', () => {
    expect(validate(v1, snapshot, { ...base, channel: 'WALK_IN' }).errors).toEqual([
      { field: 'branch', code: 'required' },
    ]);
  });
});

describe('validation', () => {
  it('accepts a minimal valid set and keeps optional page 5 optional (Rule 20)', () => {
    expect(validate(v1, snapshot, { ...base, csat: 1 }).errors).toEqual([]);
  });
  it('rejects out-of-range ratings (FR-08…FR-10)', () => {
    const r = validate(v1, snapshot, { ...base, csat: 6, ces: 0, nps: 11 });
    expect(r.errors.map((e) => e.field)).toEqual(['csat', 'ces', 'nps']);
  });
  it('requires a valid phone only while consent is on (T-M06-030)', () => {
    expect(validate(v1, snapshot, { ...base, contact_consent: true }).errors).toEqual([
      { field: 'phone', code: 'required' },
    ]);
    expect(
      validate(v1, snapshot, { ...base, contact_consent: false, phone: 'x' }).answers.phone,
    ).toBeUndefined();
    expect(
      validate(v1, snapshot, { ...base, contact_consent: true, phone: '024 123 4567' }).answers.phone,
    ).toBe('+233241234567');
  });
  it('limits free text', () => {
    expect(validate(v1, snapshot, { ...base, comment: 'x'.repeat(1001) }).errors).toEqual([
      { field: 'comment', code: 'too_long' },
    ]);
  });
});

describe('phone numbers (A-145)', () => {
  it.each([
    ['0241234567', '+233241234567'],
    ['+233 24 123 4567', '+233241234567'],
    ['233541234567', '+233541234567'],
    ['0301234567', null],
    ['024123456', null],
  ])('%s → %s', (raw, out) => expect(normalizePhone(raw, snapshot.phone_prefixes)).toBe(out));
});

describe('guardrails (T-M04-010, T-M04-110)', () => {
  const clone = () => JSON.parse(JSON.stringify(v1)) as Definition;
  it('refuses a sixth page, a new question, required free text and identity questions', () => {
    const d = clone();
    d.pages.push({ id: 'extra', title: 'Extra', questions: [] });
    d.pages[4]!.questions.push({ id: 'policy_no', type: 'text_short', label: 'Your policy number' });
    d.pages[4]!.questions.find((x) => x.id === 'comment')!.required = true;
    const msgs = guardrails(d)
      .map((p) => p.message)
      .join('\n');
    expect(msgs).toContain('1 to 5 pages');
    expect(msgs).toContain('Rule 15');
    expect(msgs).toContain('Rule 20');
    expect(msgs).toContain('Rule 12');
  });
  it('keeps the phone dependent on the consent toggle', () => {
    const d = clone();
    d.pages[4]!.questions.find((x) => x.id === 'phone')!.required = true;
    expect(
      guardrails(d)
        .map((p) => p.message)
        .join(),
    ).toContain('contact me');
  });
});
