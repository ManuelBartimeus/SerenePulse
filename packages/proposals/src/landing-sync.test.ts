// The public website (apps/landing, a dependency-free static build) keeps plain-JS copies of the
// product catalogue, claim types and per-product document lists. This test fails when those copies
// drift from the definitions here, so a form or catalogue change cannot silently leave the site wrong.
import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs content modules without type declarations
import { PRODUCTS as SITE_PRODUCTS } from '../../../apps/landing/src/content/products.mjs';
// @ts-expect-error: plain .mjs content modules without type declarations
import { CLAIM_TYPES as SITE_CLAIMS } from '../../../apps/landing/src/content/claims.mjs';
// @ts-expect-error: plain .mjs content modules without type declarations
import { DOCUMENTS as SITE_DOCUMENTS } from '../../../apps/landing/src/content/documents.mjs';
import { CLAIM_TYPES } from './claims';
import { FORMS } from './forms';
import { PRODUCTS } from './products';
import { allFields, isEmpty } from './validate';

type SiteProduct = { code: string; name: string; category: string; purchase: string; audience: string[] };
type SiteClaim = { id: string; label: string; documents: [string, boolean][] };
type SiteDocs = Record<string, { documents: unknown[] }>;

const IDENTITY_KINDS = new Set(['id_selfie', 'id_passport', 'company_registration']);

describe('website content matches @serene/proposals', () => {
  it('lists every product with the same name, line, audience and way of buying', () => {
    const site = SITE_PRODUCTS as SiteProduct[];
    expect(site.map((p) => p.code).sort()).toEqual(PRODUCTS.map((p) => p.code).sort());
    for (const p of PRODUCTS) {
      const s = site.find((x) => x.code === p.code)!;
      expect(
        { name: s.name, category: s.category, purchase: s.purchase, audience: [...s.audience].sort() },
        p.code,
      ).toEqual({
        name: p.name,
        category: p.category,
        purchase: p.purchase,
        audience: [...p.audience].sort(),
      });
    }
  });

  it('shows the same claim types and required documents', () => {
    const site = SITE_CLAIMS as SiteClaim[];
    for (const t of CLAIM_TYPES) {
      const s = site.find((x) => x.id === t.id);
      expect(s, t.id).toBeDefined();
      expect(s!.label).toBe(t.label);
      expect(s!.documents).toEqual(t.documents.map((d) => [d.label, d.required]));
    }
  });

  it('lists one document entry per kind of supporting document on each form', () => {
    const docs = SITE_DOCUMENTS as SiteDocs;
    for (const p of PRODUCTS) {
      const form = FORMS[p.formId]!;
      const kinds = new Set(
        allFields(form)
          .map(({ field }) => field)
          .filter((f) => f.type === 'file' && !IDENTITY_KINDS.has(f.kind) && !isEmpty(f.label))
          .map((f) => (f.type === 'file' ? f.kind : '')),
      );
      expect(docs[p.code]?.documents.length, `${p.code} document count`).toBe(kinds.size);
    }
  });
});
