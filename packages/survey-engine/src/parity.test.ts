// JS and SQL validators agree on generated answer sets (MS-04 TESTS). Needs the local Supabase
// stack; runs when SURVEY_PARITY_DB=1 (CI database job, or locally after `pnpm db:start`).
import { spawnSync } from 'node:child_process';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clean, validate, type Answers, type Definition, type Snapshot } from './index';

const enabled = process.env.SURVEY_PARITY_DB === '1';
const container = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_serene-pulse';

function psql(sql: string): string {
  const r = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

const maybe = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined, freq: 3 });

describe.skipIf(!enabled)('survey engine parity with SQL (T-M04-parity)', () => {
  it('validate and clean agree for 2,000 generated answer sets', () => {
    const row = JSON.parse(
      psql(
        `select json_build_object('d', definition, 's', catalogue_snapshot) from public.survey_versions where status = 'published'`,
      ),
    ) as { d: Definition; s: Snapshot };
    const codes = (k: keyof Omit<Snapshot, 'phone_prefixes'>) => row.s[k].map((o) => o.code);
    const answers = fc.record(
      {
        channel: maybe(fc.oneof(fc.constantFrom(...codes('service_channels')), fc.constant('NOPE'))),
        channel_other: maybe(fc.string({ maxLength: 90 })),
        branch: maybe(fc.oneof(fc.constantFrom(...codes('branches')), fc.constant(''))),
        branch_other: maybe(fc.string({ maxLength: 90 })),
        product: maybe(fc.constantFrom(...codes('insurance_products'))),
        product_other: maybe(fc.string({ maxLength: 90 })),
        csat: maybe(fc.oneof(fc.integer({ min: -1, max: 7 }), fc.double({ min: 1, max: 5, noNaN: true }))),
        ces: maybe(fc.integer({ min: 0, max: 6 })),
        nps: maybe(fc.integer({ min: -1, max: 11 })),
        // EASE / PRICE were retired in v3: both validators must refuse them as invalid options.
        factor: maybe(
          fc.oneof(fc.constantFrom(...codes('improvement_factors')), fc.constantFrom('EASE', 'PRICE')),
        ),
        factor_other: maybe(fc.string({ maxLength: 210 })),
        comment: maybe(fc.string({ maxLength: 1010 })),
        contact_consent: maybe(fc.boolean()),
        phone: maybe(
          fc.oneof(
            fc.constantFrom('0241234567', '+233 54 123 4567', '0301234567', '24'),
            fc.string({ maxLength: 14 }),
          ),
        ),
        first_name: maybe(fc.string({ maxLength: 45 })),
      },
      { requiredKeys: [] },
    );
    const sets = fc
      .sample(answers, { numRuns: 2000, seed: 20261106 })
      .map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))) as Answers[];
    const literal = JSON.stringify(sets).replace(/'/g, "''");
    const out = JSON.parse(
      psql(`select json_agg(json_build_object('v', survey.validate_answers(v.definition, v.catalogue_snapshot, s.a),
                                              'c', survey.clean_answers(v.definition, v.catalogue_snapshot, s.a)) order by s.i)
            from public.survey_versions v, jsonb_array_elements('${literal}'::jsonb) with ordinality s(a, i)
            where v.status = 'published'`),
    ) as { v: { answers: Answers; errors: unknown[] }; c: Answers }[];
    sets.forEach((a, i) => {
      const js = validate(row.d, row.s, a);
      expect({ i, v: out[i]!.v }).toEqual({ i, v: { answers: js.answers, errors: js.errors } });
      expect({ i, c: out[i]!.c }).toEqual({ i, c: clean(row.d, row.s, a) });
    });
  }, 120_000);
});
