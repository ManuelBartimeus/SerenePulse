import { describe, expect, it } from 'vitest';
import {
  accraToday,
  activeFilterCount,
  DEFAULT_FILTERS,
  parseFilterSearch,
  periodLabel,
  resolvePeriod,
  toFilterSearch,
  toRpcFilters,
  type FilterState,
} from './filters-state';

const A = '0b5c7a2e-7d3a-4c1e-9b1a-1f2e3d4c5b6a';
const B = '1c6d8b3f-8e4b-4d2f-8c2b-2a3b4c5d6e7f';

describe('T-M09-e2e-005 filter URL round-trip', () => {
  it('state → search → state is lossless', () => {
    const state: FilterState = {
      preset: 'custom',
      from: '2026-10-01',
      to: '2026-10-31',
      granularity: 'week',
      lists: { branch: [A, B], bstatus: ['other'], sat: ['negative'], src: ['qr'], case: ['none'] },
      includeUnverified: true,
    };
    const search = toFilterSearch(state);
    expect(search).toEqual({
      period: 'custom',
      from: '2026-10-01',
      to: '2026-10-31',
      gran: 'week',
      branch: `${A},${B}`,
      bstatus: 'other',
      sat: 'negative',
      src: 'qr',
      case: 'none',
      unv: '1',
    });
    expect(parseFilterSearch(search)).toEqual(state);
  });
  it('defaults serialise to an empty search', () => {
    expect(toFilterSearch(DEFAULT_FILTERS)).toEqual({});
    expect(parseFilterSearch({})).toEqual(DEFAULT_FILTERS);
  });
  it('accepts arrays from JSON search params and drops junk', () => {
    const s = parseFilterSearch({ branch: [A, A, '<script>'], period: 'nope', gran: 'hour', unv: 1 });
    expect(s.lists.branch).toEqual([A]);
    expect(s.preset).toBe('last30');
    expect(s.granularity).toBe('day');
    expect(s.includeUnverified).toBe(true);
  });
  it('an invalid custom range falls back to the default period', () => {
    expect(parseFilterSearch({ period: 'custom', from: '2026-10-31', to: '2026-10-01' }).preset).toBe(
      'last30',
    );
    expect(parseFilterSearch({ period: 'custom', from: '2026-13-45', to: '2026-10-01' }).preset).toBe(
      'last30',
    );
  });
});

describe('presets (Africa/Accra, submission date)', () => {
  const at = (preset: FilterState['preset']) => resolvePeriod({ ...DEFAULT_FILTERS, preset }, '2026-02-10');
  it.each([
    ['today', '2026-02-10', '2026-02-10'],
    ['last7', '2026-02-04', '2026-02-10'],
    ['last30', '2026-01-12', '2026-02-10'],
    ['month', '2026-02-01', '2026-02-10'],
    ['prev_month', '2026-01-01', '2026-01-31'],
    ['quarter', '2026-01-01', '2026-02-10'],
    ['prev_quarter', '2025-10-01', '2025-12-31'],
    ['ytd', '2026-01-01', '2026-02-10'],
    ['custom', '2026-01-12', '2026-02-10'],
  ] as const)('%s', (preset, from, to) => expect(at(preset)).toEqual({ from, to }));
  it('previous month across a year boundary', () =>
    expect(resolvePeriod({ ...DEFAULT_FILTERS, preset: 'prev_month' }, '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    }));
  it('today in Accra', () => expect(accraToday(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-05'));
});

describe('RPC filter object (CONTRACTS)', () => {
  it('maps URL keys to contract keys', () => {
    const f = toRpcFilters(
      { ...DEFAULT_FILTERS, lists: { region: [A], nps: ['promoter'], ver: [B] }, includeUnverified: true },
      '2026-02-10',
    );
    expect(f).toEqual({
      from: '2026-01-12',
      to: '2026-02-10',
      region_ids: [A],
      nps_classes: ['promoter'],
      survey_version_ids: [B],
      include_unverified: true,
    });
  });
  it('counts active filters and labels the period', () => {
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, lists: { branch: [A], sat: [] }, includeUnverified: true }),
    ).toBe(2);
    expect(periodLabel({ from: '2026-10-01', to: '2026-10-31' })).toBe('01/10/2026 – 31/10/2026');
    expect(periodLabel({ from: '2026-10-01', to: '2026-10-01' })).toBe('01/10/2026');
  });
});
