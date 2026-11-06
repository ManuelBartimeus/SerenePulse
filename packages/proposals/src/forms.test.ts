// Structural checks every digitised proposal form must pass.
import { describe, expect, it } from 'vitest';
import { FORMS } from './forms';
import { PRODUCTS } from './products';
import type { Condition, Field, FormDefinition } from './schema';
import { allFields, validateForm } from './validate';

const ID = /^[a-z][a-z0-9_]*$/;

function condFields(c: Condition | undefined, out: string[] = []): string[] {
  if (!c) return out;
  if ('all' in c) c.all.forEach((x) => condFields(x, out));
  else if ('any' in c) c.any.forEach((x) => condFields(x, out));
  else if ('not' in c) condFields(c.not, out);
  else out.push(c.field);
  return out;
}

const declFields = (f: FormDefinition): Field[] => [...(f.declaration.fields ?? [])];

describe.each(Object.values(FORMS).map((f) => [f.id, f] as const))('form %s', (_id, form) => {
  const fields = [...allFields(form).map((x) => x.field), ...declFields(form)];

  it('is digitised (not a stub) and has 3–8 steps', () => {
    expect(form.title).not.toBe('TODO');
    expect(form.source).not.toBe('TODO');
    expect(form.steps.length).toBeGreaterThanOrEqual(3);
    expect(form.steps.length).toBeLessThanOrEqual(8);
  });

  it('has unique snake_case field ids', () => {
    const ids = fields.map((f) => f.id);
    for (const id of ids) expect(id).toMatch(ID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique step and section ids', () => {
    const steps = form.steps.map((s) => s.id);
    expect(new Set(steps).size).toBe(steps.length);
    const sections = form.steps.flatMap((s) => s.sections.map((x) => x.id));
    expect(new Set(sections).size).toBe(sections.length);
  });

  it('only refers to fields that come earlier (or in the same step) in conditions', () => {
    const order = new Map(fields.map((f, i) => [f.id, i]));
    const stepOf = new Map(allFields(form).map((x) => [x.field.id, x.step.id]));
    for (const { field, step, section } of allFields(form)) {
      for (const ref of [...condFields(field.showIf), ...condFields(section.showIf)]) {
        expect(order.has(ref), `${field.id} refers to unknown ${ref}`).toBe(true);
        const earlier = (order.get(ref) ?? 0) < (order.get(field.id) ?? 0) || stepOf.get(ref) === step.id;
        expect(earlier, `${field.id} depends on later field ${ref}`).toBe(true);
      }
    }
  });

  it('has choice options, table columns and file kinds', () => {
    for (const f of fields) {
      if (f.type === 'select' || f.type === 'radio' || f.type === 'checkboxes') {
        expect(f.options.length, f.id).toBeGreaterThan(0);
        const values = f.options.map((o) => o.value);
        expect(new Set(values).size, `${f.id} duplicate option`).toBe(values.length);
      }
      if (f.type === 'table') expect(f.columns.length, f.id).toBeGreaterThan(0);
      if (f.type === 'file') expect(f.kind, f.id).toMatch(/^[a-z][a-z0-9_]*$/);
      if (f.type === 'read') expect(f.paragraphs.length, f.id).toBeGreaterThan(0);
    }
  });

  it('collects the proposer’s name, phone and ID, and has a declaration to sign', () => {
    expect(fields.some((f) => f.prefill === 'fullName' || f.prefill === 'companyName')).toBe(true);
    expect(fields.some((f) => f.prefill === 'phone')).toBe(true);
    // Identity: a live photo for the NIA check (never a Ghana Card image, L.I. 2523).
    expect(fields.some((f) => f.type === 'file' && f.kind === 'id_selfie')).toBe(true);
    expect(fields.some((f) => f.type === 'file' && /^(id_front|id_back|ghana_card)/.test(f.kind))).toBe(
      false,
    );
    expect(form.declaration.paragraphs.length).toBeGreaterThan(0);
    expect(form.declaration.confirmations.length).toBeGreaterThan(0);
    expect(form.declaration.signatureLabel.length).toBeGreaterThan(0);
  });

  it('has a cover start date', () => {
    expect(fields.some((f) => f.role === 'coverStart')).toBe(true);
  });

  it('reports required-field errors on an empty answer set and none crash', () => {
    const errors = validateForm(form, {});
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('catalogue', () => {
  it('has one form per product and no orphan forms', () => {
    const formIds = PRODUCTS.map((p) => p.formId).sort();
    expect(Object.keys(FORMS).sort()).toEqual(formIds);
    expect(new Set(PRODUCTS.map((p) => p.code)).size).toBe(PRODUCTS.length);
  });
});
