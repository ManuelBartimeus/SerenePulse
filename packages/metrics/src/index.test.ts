import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cesAvg,
  completionRate,
  completionTimeStats,
  countResponses,
  csatAvg,
  csatPct,
  delta,
  emptyCounts,
  lowSample,
  mainFactor,
  metricValues,
  negativeRate,
  nps,
  npsClass,
  percentile,
  satisfactionBand,
  targetStatus,
  type ResponseScores,
} from './index';

const r = (csat: number, ces: number, n: number, factor: string | null = null): ResponseScores => ({
  csat,
  ces,
  nps: n,
  factor,
});

describe('T-M08-001…005 KPI maths', () => {
  const c = countResponses([
    r(5, 5, 10, 'SPEED'),
    r(4, 4, 9, 'STAFF'),
    r(2, 2, 5, 'SPEED'),
    r(1, 3, 0, 'NONE'),
  ]);

  it('CSAT % counts 4 and 5 over valid responses', () => expect(csatPct(c)).toBe(50));
  it('average CSAT', () => expect(csatAvg(c)).toBe(3));
  it('average CES', () => expect(cesAvg(c)).toBe(3.5));
  it('NPS = %promoters − %detractors', () => expect(nps(c)).toBe(0));
  it('negative rate counts 1 and 2', () => expect(negativeRate(c)).toBe(50));
  it('all promoters → +100, all detractors → −100', () => {
    expect(nps(countResponses([r(5, 5, 9), r(5, 5, 10)]))).toBe(100);
    expect(nps(countResponses([r(1, 1, 0), r(1, 1, 6)]))).toBe(-100);
  });
  it('passives count in the denominator only', () =>
    expect(nps(countResponses([r(3, 3, 7), r(3, 3, 9)]))).toBe(50));
  it('metricValues bundles every KPI with n', () =>
    expect(metricValues(c)).toEqual({
      n: 4,
      csat_pct: 50,
      csat_avg: 3,
      ces_avg: 3.5,
      nps: 0,
      negative_rate: 50,
    }));
});

describe('T-M08-007 zero responses → "No data" (null), never 0', () => {
  const c = emptyCounts();
  it.each([csatPct, csatAvg, cesAvg, nps, negativeRate])('%o', (fn) => expect(fn(c)).toBeNull());
  it('completion rate with no started surveys', () => expect(completionRate(0, 0)).toBeNull());
  it('missing histogram slots count as zero', () =>
    expect(csatPct({ n: 1, csat: [1], ces: [], nps: [], factors: {} })).toBe(0));
});

describe('validation of answers', () => {
  it('rejects scores outside the scale', () => {
    expect(() => countResponses([r(0, 3, 5)])).toThrow(RangeError);
    expect(() => countResponses([r(3, 6, 5)])).toThrow(RangeError);
    expect(() => countResponses([r(3, 3, 11)])).toThrow(RangeError);
    expect(() => countResponses([r(2.5, 3, 5)])).toThrow(RangeError);
  });
  it('blank factors are not counted', () => expect(countResponses([r(3, 3, 5)]).factors).toEqual({}));
});

describe('T-M08-100 completion rate (submitted ÷ started)', () => {
  it('computes the percentage', () => expect(completionRate(71, 100)).toBe(71));
});

describe('classes and bands', () => {
  it('NPS classes', () => {
    expect([0, 6, 7, 8, 9, 10].map(npsClass)).toEqual([
      'detractor',
      'detractor',
      'passive',
      'passive',
      'promoter',
      'promoter',
    ]);
    expect(() => npsClass(-1)).toThrow(RangeError);
  });
  it('satisfaction bands', () => {
    expect([1, 2, 3, 4, 5].map(satisfactionBand)).toEqual([
      'negative',
      'negative',
      'neutral',
      'positive',
      'positive',
    ]);
    expect(() => satisfactionBand(6)).toThrow(RangeError);
  });
});

describe('T-M08-010 low sample', () => {
  it('flags 0 < n < threshold only', () => {
    expect(lowSample(0)).toBe(false);
    expect(lowSample(29)).toBe(true);
    expect(lowSample(30)).toBe(false);
    expect(lowSample(5, 5)).toBe(false);
    expect(lowSample(4, 5)).toBe(true);
  });
});

describe('T-M08-006 main improvement factor', () => {
  const none = new Set(['NONE']);
  it('is the mode excluding "none" and blanks', () =>
    expect(mainFactor({ SPEED: 3, STAFF: 1, NONE: 9 }, none)).toEqual({
      codes: ['SPEED'],
      share: 75,
      count: 3,
      n: 4,
    }));
  it('shows ties together in catalogue order', () =>
    expect(mainFactor({ STAFF: 2, SPEED: 2, ZED: 2, ABC: 2 }, none, ['SPEED', 'STAFF']).codes).toEqual([
      'SPEED',
      'STAFF',
      'ABC',
      'ZED',
    ]));
  it('no factor named → empty with share null', () =>
    expect(mainFactor({ NONE: 4, SPEED: 0 }, none)).toEqual({ codes: [], share: null, count: 0, n: 0 }));
});

describe('completion time', () => {
  it('nearest-rank percentiles', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([40, 10, 30, 20], 0.9)).toBe(40);
    expect(percentile([], 0.5)).toBeNull();
    expect(() => percentile([1], 0)).toThrow(RangeError);
    expect(() => percentile([1], 1.5)).toThrow(RangeError);
  });
  it('median, P90, mean and % ≤ 60 s in seconds', () =>
    expect(completionTimeStats([40_000, 40_000, 70_000, 40_049, 60_000])).toEqual({
      n: 5,
      medianS: 40,
      p90S: 70,
      meanS: 50,
      pctLe60: 80,
    }));
  it('no completions → No data', () =>
    expect(completionTimeStats([])).toEqual({ n: 0, medianS: null, p90S: null, meanS: null, pctLe60: null }));
});

describe('delta and targets', () => {
  it('delta is null when either side has no data', () => {
    expect(delta(5, 3)).toBe(2);
    expect(delta(null, 3)).toBeNull();
    expect(delta(5, null)).toBeNull();
  });
  it('target status by direction', () => {
    expect(targetStatus(80, 80, 'higher_is_better')).toBe('met');
    expect(targetStatus(79.9, 80, 'higher_is_better')).toBe('not_met');
    expect(targetStatus(5, 6, 'lower_is_better')).toBe('met');
    expect(targetStatus(7, 6, 'lower_is_better')).toBe('not_met');
    expect(targetStatus(null, 6, 'lower_is_better')).toBeNull();
  });
});

describe('properties', () => {
  const resp = fc.record({
    csat: fc.integer({ min: 1, max: 5 }),
    ces: fc.integer({ min: 1, max: 5 }),
    nps: fc.integer({ min: 0, max: 10 }),
    factor: fc.option(fc.constantFrom('SPEED', 'STAFF', 'NONE'), { nil: null }),
  });
  it('bounds hold for any non-empty set', () =>
    fc.assert(
      fc.property(fc.array(resp, { minLength: 1, maxLength: 60 }), (rows) => {
        const c = countResponses(rows);
        const v = metricValues(c);
        expect(v.csat_pct!).toBeGreaterThanOrEqual(0);
        expect(v.csat_pct!).toBeLessThanOrEqual(100);
        expect(v.nps!).toBeGreaterThanOrEqual(-100);
        expect(v.nps!).toBeLessThanOrEqual(100);
        expect(v.csat_avg!).toBeGreaterThanOrEqual(1);
        expect(v.ces_avg!).toBeLessThanOrEqual(5);
        expect(v.csat_pct! + v.negative_rate!).toBeLessThanOrEqual(100 + 1e-9);
      }),
    ));
});
