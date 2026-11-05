// Golden-dataset parity (T-M08-001…009, T-M08-010, T-M08-020): the SQL analytics RPCs (roll-up path),
// the SQL raw path and these TypeScript metric functions agree on synthetic responses for many random
// filter combinations. Everything runs inside one transaction that is rolled back.
//
// Needs the local Supabase stack; runs when METRICS_PARITY_DB=1. If the analytics migrations are not
// applied to that database yet, list them in METRICS_PARITY_PRELUDE (comma-separated paths) and they
// are applied inside the same rolled-back transaction.
import { describe, expect, it } from 'vitest';
import { countResponses, lowSample, mainFactor, metricValues, type Counts } from './index';

interface NodeProcess {
  env: Record<string, string | undefined>;
}
const proc = (globalThis as unknown as { process?: NodeProcess }).process;
const enabled = proc?.env.METRICS_PARITY_DB === '1';
const container = proc?.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_serene-pulse';

type SpawnSync = (
  cmd: string,
  args: string[],
  opts: { input: string; encoding: 'utf8'; maxBuffer: number },
) => { status: number | null; stdout: string; stderr: string };

async function node() {
  const cp = (await import(/* @vite-ignore */ 'node:child_process' as string)) as { spawnSync: SpawnSync };
  const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
    readFileSync: (p: string, enc: 'utf8') => string;
  };
  return { spawnSync: cp.spawnSync, readFileSync: fs.readFileSync };
}

async function psql(sql: string): Promise<string> {
  const { spawnSync } = await node();
  const r = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (r.status !== 0) throw new Error(`psql exited with ${String(r.status)}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Catalogue {
  branches: { id: string; region_id: string }[];
  channels: { id: string; code: string; branch_requirement: string }[];
  products: string[];
  factors: { id: string; code: string; is_none: boolean }[];
  sources: { id: string; code: string }[];
}

interface Row {
  i: number;
  day: number;
  src: string;
  src_code: string;
  ch: string;
  bs: 'selected' | 'other' | 'not_applicable' | 'not_provided';
  br: string | null;
  rg: string | null;
  pr: string;
  csat: number;
  ces: number;
  nps: number;
  f: string | null;
  verified: boolean;
}

type Filters = Record<string, unknown>;

const iso = (day: number) => `2098-03-${String(day).padStart(2, '0')}`;

function matches(r: Row, f: Filters): boolean {
  const inList = (key: string, value: string | null) =>
    !(key in f) || (value !== null && (f[key] as string[]).includes(value));
  const band = r.csat <= 2 ? 'negative' : r.csat === 3 ? 'neutral' : 'positive';
  const cls = r.nps >= 9 ? 'promoter' : r.nps >= 7 ? 'passive' : 'detractor';
  const branchOk =
    !('branch_ids' in f || 'branch_statuses' in f) ||
    (r.br !== null && ((f.branch_ids as string[] | undefined) ?? []).includes(r.br)) ||
    ((f.branch_statuses as string[] | undefined) ?? []).includes(r.bs);
  return (
    r.day >= Number(String(f.from).slice(8)) &&
    r.day <= Number(String(f.to).slice(8)) &&
    (r.verified || f.include_unverified === true) &&
    branchOk &&
    inList('region_ids', r.rg) &&
    inList('channel_ids', r.ch) &&
    inList('product_ids', r.pr) &&
    inList('factor_ids', r.f) &&
    inList('source_codes', r.src_code) &&
    inList('satisfaction', band) &&
    inList('nps_classes', cls)
  );
}

const close = (a: number | null | undefined, b: number | null | undefined) =>
  (a === null || a === undefined) && (b === null || b === undefined)
    ? true
    : a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) < 1e-6;

describe.skipIf(!enabled)(
  'analytics parity: SQL roll-ups = SQL raw = TypeScript (T-M08-001…010, 020)',
  () => {
    it('agrees for 120 random filter combinations over 800 synthetic responses', async () => {
      const cat = JSON.parse(
        await psql(`select json_build_object(
        'branches', (select json_agg(json_build_object('id', id, 'region_id', region_id)) from public.branches where is_active),
        'channels', (select json_agg(json_build_object('id', id, 'code', code, 'branch_requirement', branch_requirement)) from public.service_channels),
        'products', (select json_agg(id) from public.insurance_products),
        'factors', (select json_agg(json_build_object('id', id, 'code', code, 'is_none', is_none) order by sort_order, label) from public.improvement_factors),
        'sources', (select json_agg(json_build_object('id', id, 'code', code)) from public.survey_sources))`),
      ) as Catalogue;
      const rand = rng(20261108);
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
      const rows: Row[] = Array.from({ length: 800 }, (_, i) => {
        const ch = pick(cat.channels);
        const src = pick(cat.sources);
        let bs: Row['bs'] = 'not_applicable';
        let br: Catalogue['branches'][number] | null = null;
        if (ch.branch_requirement === 'required' || (ch.branch_requirement === 'optional' && rand() < 0.5)) {
          bs = 'selected';
          br = pick(cat.branches);
        } else if (ch.branch_requirement === 'optional') {
          bs = rand() < 0.5 ? 'other' : 'not_provided';
        }
        // Skew scores so that groups differ.
        const csat = Math.min(5, 1 + Math.floor(rand() * 5 + (br ? cat.branches.indexOf(br) % 2 : 0) * 0.5));
        return {
          i,
          day: 1 + Math.floor(rand() * 31),
          src: src.id,
          src_code: src.code,
          ch: ch.id,
          bs,
          br: br?.id ?? null,
          rg: br?.region_id ?? null,
          pr: pick(cat.products),
          csat,
          ces: 1 + Math.floor(rand() * 5),
          nps: Math.floor(rand() * 11),
          f: rand() < 0.2 ? null : pick(cat.factors).id,
          verified: rand() > 0.06,
        };
      });

      const some = <T>(xs: readonly T[], max: number) => {
        const k = 1 + Math.floor(rand() * max);
        return [...new Set(Array.from({ length: k }, () => pick(xs)))];
      };
      const combos: Filters[] = Array.from({ length: 120 }, () => {
        const a = 1 + Math.floor(rand() * 31);
        const b = 1 + Math.floor(rand() * 31);
        const f: Filters = { from: iso(Math.min(a, b)), to: iso(Math.max(a, b)) };
        if (rand() < 0.3)
          f.branch_ids = some(
            cat.branches.map((x) => x.id),
            3,
          );
        if (rand() < 0.15) f.branch_statuses = some(['other', 'not_applicable', 'not_provided'], 2);
        if (rand() < 0.15) f.region_ids = some([...new Set(cat.branches.map((x) => x.region_id))], 2);
        if (rand() < 0.25)
          f.channel_ids = some(
            cat.channels.map((x) => x.id),
            3,
          );
        if (rand() < 0.25) f.product_ids = some(cat.products, 3);
        if (rand() < 0.2)
          f.factor_ids = some(
            cat.factors.map((x) => x.id),
            3,
          );
        if (rand() < 0.2) f.source_codes = some(['sms', 'direct', 'qr'], 2);
        if (rand() < 0.15) f.satisfaction = some(['negative', 'neutral', 'positive'], 2);
        if (rand() < 0.15) f.nps_classes = some(['promoter', 'passive', 'detractor'], 2);
        if (rand() < 0.2) f.include_unverified = true;
        return f;
      });

      const { readFileSync } = await node();
      const prelude = (proc?.env.METRICS_PARITY_PRELUDE ?? '')
        .split(',')
        .filter(Boolean)
        .map((p) => readFileSync(p, 'utf8'))
        .join('\n');
      const lit = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      const user = '00000000-0000-0000-0000-0000000fa001';
      const out = await psql(`begin;
${prelude}
insert into auth.users (id, email) values ('${user}', 'parity@example.test');
update public.profiles set status = 'active', must_change_password = false where user_id = '${user}';
insert into public.user_role_grants (user_id, role_id, scope_type, status, approved_at)
  select '${user}', id, 'organisation', 'active', now() from public.roles where key = 'executive';
create temporary table g as select * from jsonb_to_recordset(${lit(
        rows.map((r) => ({ ...r, ts: `${iso(r.day)}T12:00:00Z` })),
      )}) as x(i int, ts timestamptz, src uuid, ch uuid, bs text, br uuid, rg uuid, pr uuid, csat int, ces int, nps int, f uuid, verified boolean);
insert into survey.sessions (session_secret_hash, device_id_hash, source_id, survey_version_id, opened_at, interactive_at,
  last_activity_at, status, max_page_reached)
select extensions.digest('parity' || i, 'sha256'), extensions.digest('parity' || i, 'sha256'), src,
  (select id from public.survey_versions where status = 'published'), ts, ts, ts, 'submitted', 5 from g;
insert into survey.responses (reference, session_id, survey_version_id, source_id, service_channel_id, branch_status,
  issuing_branch_id, region_id_at_submission, insurance_product_id, csat_score, ces_score, nps_score, improvement_factor_id,
  verification, opened_at, interactive_at, submitted_at, completion_duration_ms)
select 'FB-2098-' || lpad(g.i::text, 6, '0'), s.id, s.survey_version_id, g.src, g.ch, g.bs, g.br, g.rg, g.pr, g.csat, g.ces,
  g.nps, g.f, case when g.verified then 'verified' else 'unverified_no_js' end, g.ts, g.ts, g.ts, 30000
from g join survey.sessions s on s.session_secret_hash = extensions.digest('parity' || g.i, 'sha256');
select set_config('request.jwt.claims', (public.custom_access_token_hook(jsonb_build_object('user_id', '${user}'::uuid,
  'claims', jsonb_build_object('sub', '${user}', 'role', 'authenticated'))) -> 'claims')::text, true);
set local role authenticated;
select json_agg(json_build_object(
  's', public.analytics_summary(c.f),
  'raw', public.analytics_summary(c.f || case when c.f ? 'satisfaction' then '{}'::jsonb
                                              else '{"satisfaction":["negative","neutral","positive"]}'::jsonb end),
  'b', public.analytics_breakdown('branch', c.f)) order by c.i)
from jsonb_array_elements(${lit(combos)}) with ordinality c(f, i);
rollback;`);
      const results = JSON.parse(
        out
          .split('\n')
          .filter((l) => l.startsWith('['))
          .pop()!,
      ) as {
        s: Summary;
        raw: Summary;
        b: BreakdownRow[];
      }[];

      const none = new Set(cat.factors.filter((f) => f.is_none).map((f) => f.id));
      const order = cat.factors.map((f) => f.id);
      const codeOf = new Map(cat.factors.map((f) => [f.id, f.code]));
      const count = (rs: Row[]): Counts =>
        countResponses(rs.map((r) => ({ csat: r.csat, ces: r.ces, nps: r.nps, factor: r.f })));
      let compared = 0;
      combos.forEach((f, i) => {
        const res = results[i]!;
        const valid = rows.filter((r) => matches(r, f));
        const unverified = rows.filter((r) => !r.verified && matches(r, { ...f, include_unverified: true }));
        const ts = metricValues(count(valid));
        const ctx = { i, f };
        expect({ ...ctx, n: res.s.n }).toEqual({ ...ctx, n: ts.n });
        for (const k of ['csat_pct', 'csat_avg', 'nps', 'ces_avg', 'negative_rate'] as const) {
          const sql = res.s.metrics[k];
          expect({ ...ctx, k, ok: close(sql.value, ts[k]), sql: sql.value, ts: ts[k] }).toMatchObject({
            ok: true,
          });
          expect({ ...ctx, k, low: sql.low_sample }).toEqual({ ...ctx, k, low: lowSample(ts.n, 30) });
          // Roll-up path and raw path return identical figures.
          expect({ ...ctx, k, raw: res.raw.metrics[k].value }).toEqual({ ...ctx, k, raw: sql.value });
        }
        expect({ ...ctx, u: res.s.unverified_excluded }).toEqual({
          ...ctx,
          u: f.include_unverified === true ? 0 : unverified.length,
        });
        const mf = mainFactor(count(valid).factors, none, order);
        expect({ ...ctx, mf: res.s.main_factor.codes }).toEqual({
          ...ctx,
          mf: mf.codes.map((id) => codeOf.get(id)),
        });
        expect({ ...ctx, ok: close(res.s.main_factor.share, mf.share) }).toMatchObject({ ok: true });
        // Benchmark: the same period and non-branch filters, whole company (T-M08-020).
        const company = { ...f };
        delete company.branch_ids;
        delete company.branch_statuses;
        delete company.region_ids;
        const bench = metricValues(count(rows.filter((r) => matches(r, company))));
        expect({ ...ctx, ok: close(res.s.metrics.csat_pct.benchmark, bench.csat_pct) }).toMatchObject({
          ok: true,
        });
        // Branch breakdown: only responses with an effective branch, grouped.
        const byBranch = new Map<string, Row[]>();
        valid
          .filter((r) => r.br !== null)
          .forEach((r) => byBranch.set(r.br!, [...(byBranch.get(r.br!) ?? []), r]));
        // Groups with only unverified submissions come back as n = 0 ("No data") rows.
        expect(res.b.filter((b) => b.n === 0).every((b) => b.csat_pct === null)).toBe(true);
        expect({
          ...ctx,
          keys: res.b
            .filter((b) => b.n > 0)
            .map((b) => b.key)
            .sort(),
        }).toEqual({
          ...ctx,
          keys: [...byBranch.keys()].sort(),
        });
        for (const b of res.b.filter((x) => x.n > 0)) {
          const v = metricValues(count(byBranch.get(b.key)!));
          expect({
            ...ctx,
            key: b.key,
            n: b.n,
            ok: close(b.nps, v.nps) && close(b.csat_pct, v.csat_pct),
          }).toEqual({
            ...ctx,
            key: b.key,
            n: v.n,
            ok: true,
          });
        }
        compared += 1;
      });
      expect(compared).toBe(120);
    }, 300_000);
  },
);

interface M {
  value: number | null;
  n: number;
  low_sample: boolean;
  benchmark: number | null;
}
interface Summary {
  n: number;
  unverified_excluded: number;
  metrics: Record<'csat_pct' | 'csat_avg' | 'nps' | 'ces_avg' | 'negative_rate', M>;
  main_factor: { codes: string[]; share: number | null };
}
interface BreakdownRow {
  key: string;
  n: number;
  csat_pct: number | null;
  nps: number | null;
}
