/**
 * Serene Pulse metric definitions (SPEC M08, REQ §11 as overridden by D-33).
 *
 * The single TypeScript implementation of every customer-feedback metric. The SQL engine
 * (supabase/migrations/202611080002_analytics_engine.sql) mirrors these formulas, and
 * parity.test.ts checks the two agree on a golden dataset.
 *
 * Rules (REQ §10.2, Rule 7): only valid responses are counted; zero responses give `null`
 * ("No data"), never 0; every value is reported with its n; there is no "response rate".
 */

/** A CSAT or CES score (1–5). */
export type Score5 = 1 | 2 | 3 | 4 | 5;
export type NpsClass = 'promoter' | 'passive' | 'detractor';
export type SatisfactionBand = 'negative' | 'neutral' | 'positive';

/** Additive counters, the same shape the SQL engine sums from its roll-ups. */
export interface Counts {
  /** Valid responses. */
  n: number;
  /** csat[k - 1] = number of responses with CSAT k. */
  csat: number[];
  /** ces[k - 1] = number of responses with CES k. */
  ces: number[];
  /** nps[k] = number of responses with NPS score k (0–10). */
  nps: number[];
  /** Improvement-factor code → count (blank answers are not listed). */
  factors: Record<string, number>;
}

export interface ResponseScores {
  csat: number;
  ces: number;
  nps: number;
  /** Improvement-factor code, or null when the optional question was skipped. */
  factor: string | null;
}

export function emptyCounts(): Counts {
  return { n: 0, csat: [0, 0, 0, 0, 0], ces: [0, 0, 0, 0, 0], nps: Array<number>(11).fill(0), factors: {} };
}

function checkScore(value: number, min: number, max: number, what: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${what} must be a whole number from ${min} to ${max}, got ${value}`);
  }
}

const at = (xs: readonly number[], i: number): number => xs[i] ?? 0;

/** Builds counters from individual valid responses. */
export function countResponses(rows: readonly ResponseScores[]): Counts {
  const c = emptyCounts();
  for (const r of rows) {
    checkScore(r.csat, 1, 5, 'CSAT');
    checkScore(r.ces, 1, 5, 'CES');
    checkScore(r.nps, 0, 10, 'NPS');
    c.n += 1;
    c.csat[r.csat - 1] = at(c.csat, r.csat - 1) + 1;
    c.ces[r.ces - 1] = at(c.ces, r.ces - 1) + 1;
    c.nps[r.nps] = at(c.nps, r.nps) + 1;
    if (r.factor !== null) c.factors[r.factor] = (c.factors[r.factor] ?? 0) + 1;
  }
  return c;
}

/** CSAT % = count(CSAT ∈ {4,5}) ÷ count(valid CSAT) × 100. */
export function csatPct(c: Counts): number | null {
  return c.n > 0 ? ((at(c.csat, 3) + at(c.csat, 4)) * 100) / c.n : null;
}

/** Average CSAT = ΣCSAT ÷ count(valid CSAT), out of 5. */
export function csatAvg(c: Counts): number | null {
  return c.n > 0 ? c.csat.reduce((sum, k, i) => sum + k * (i + 1), 0) / c.n : null;
}

/** Average CES = ΣCES ÷ count(valid CES), out of 5 (higher = easier). */
export function cesAvg(c: Counts): number | null {
  return c.n > 0 ? c.ces.reduce((sum, k, i) => sum + k * (i + 1), 0) / c.n : null;
}

/** NPS = %promoters (9–10) − %detractors (0–6), from −100 to +100. */
export function nps(c: Counts): number | null {
  if (c.n === 0) return null;
  const promoters = at(c.nps, 9) + at(c.nps, 10);
  const detractors = c.nps.slice(0, 7).reduce((a, b) => a + b, 0);
  return ((promoters - detractors) * 100) / c.n;
}

/** Negative feedback rate = count(CSAT ∈ {1,2}) ÷ count(valid CSAT) × 100. */
export function negativeRate(c: Counts): number | null {
  return c.n > 0 ? ((at(c.csat, 0) + at(c.csat, 1)) * 100) / c.n : null;
}

/** Completion rate = submitted ÷ started (became interactive) surveys × 100. Never a "response rate". */
export function completionRate(submitted: number, started: number): number | null {
  return started > 0 ? (submitted * 100) / started : null;
}

export function npsClass(score: number): NpsClass {
  checkScore(score, 0, 10, 'NPS');
  return score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor';
}

export function satisfactionBand(csat: number): SatisfactionBand {
  checkScore(csat, 1, 5, 'CSAT');
  return csat <= 2 ? 'negative' : csat === 3 ? 'neutral' : 'positive';
}

/** Low sample: some data, but fewer responses than the threshold (default 30). n = 0 is "No data". */
export function lowSample(n: number, minimum = 30): boolean {
  return n > 0 && n < minimum;
}

export interface MainFactor {
  /** Tied most frequent factors, in catalogue order. Empty when nobody named one. */
  codes: string[];
  /** Share of the factor-naming responses, %. */
  share: number | null;
  /** Count for each tied factor. */
  count: number;
  /** Responses that named a factor other than "none" (the denominator). */
  n: number;
}

/**
 * Main improvement factor (A-108): the mode, excluding "Nothing, I am satisfied" and blanks; ties are
 * shown together. `order` is the catalogue order used to list ties (unknown codes sort last, by code).
 */
export function mainFactor(
  factors: Record<string, number>,
  noneCodes: ReadonlySet<string>,
  order: readonly string[] = [],
): MainFactor {
  const entries = Object.entries(factors).filter(([code, k]) => !noneCodes.has(code) && k > 0);
  const n = entries.reduce((sum, [, k]) => sum + k, 0);
  const top = entries.reduce((max, [, k]) => Math.max(max, k), 0);
  const rank = (code: string) => {
    const i = order.indexOf(code);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const codes = entries
    .filter(([, k]) => k === top)
    .map(([code]) => code)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return { codes, share: n > 0 ? (top * 100) / n : null, count: top, n };
}

/** Nearest-rank percentile (the SQL engine uses percentile_disc): the ⌈p·n⌉-th smallest value. */
export function percentile(values: readonly number[], p: number): number | null {
  if (p <= 0 || p > 1) throw new RangeError(`percentile must be in (0, 1], got ${p}`);
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1] ?? null;
}

export interface CompletionTimeStats {
  n: number;
  medianS: number | null;
  p90S: number | null;
  meanS: number | null;
  /** % of completions within 60 s (target ≥ 90 %, Rule 1). */
  pctLe60: number | null;
}

const seconds1 = (ms: number | null): number | null => (ms === null ? null : Math.round(ms / 100) / 10);

/** Completion time from interactivity to submission (Rule 18), in seconds to one decimal. */
export function completionTimeStats(durationsMs: readonly number[]): CompletionTimeStats {
  const n = durationsMs.length;
  const mean = n > 0 ? durationsMs.reduce((a, b) => a + b, 0) / n : null;
  return {
    n,
    medianS: seconds1(percentile(durationsMs, 0.5)),
    p90S: seconds1(percentile(durationsMs, 0.9)),
    meanS: seconds1(mean),
    pctLe60: n > 0 ? (durationsMs.filter((ms) => ms <= 60_000).length * 100) / n : null,
  };
}

/** All KPI values for one group, in the SQL engine's `metric_values` shape. */
export function metricValues(c: Counts): {
  n: number;
  csat_pct: number | null;
  csat_avg: number | null;
  ces_avg: number | null;
  nps: number | null;
  negative_rate: number | null;
} {
  return {
    n: c.n,
    csat_pct: csatPct(c),
    csat_avg: csatAvg(c),
    ces_avg: cesAvg(c),
    nps: nps(c),
    negative_rate: negativeRate(c),
  };
}

/** Difference between two figures; null when either is "No data". */
export function delta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}

export type TargetDirection = 'higher_is_better' | 'lower_is_better';

/** Target status: met / not_met, or null when the figure is "No data". */
export function targetStatus(
  value: number | null,
  target: number,
  direction: TargetDirection,
): 'met' | 'not_met' | null {
  if (value === null) return null;
  const met = direction === 'higher_is_better' ? value >= target : value <= target;
  return met ? 'met' : 'not_met';
}
