import { describe, expect, it } from 'vitest';
import {
  computeQuote,
  ghs,
  identityStatus,
  localPhone,
  matchesSearch,
  paymentTotals,
  periodStart,
  proposalStatus,
  sortBy,
  tabStatuses,
  DEFAULT_PROPOSAL_TAB,
  PROPOSAL_TABS,
  taxesFromRates,
  DEFAULT_TAXES,
} from './format';

describe('status labels', () => {
  it('uses plain words for every proposal status', () => {
    expect(proposalStatus('submitted').label).toBe('Awaiting review');
    expect(proposalStatus('quoted').label).toBe('Price sent');
    expect(proposalStatus('issued').tone).toBe('success');
    expect(proposalStatus('something_new').label).toBe('Something new');
  });
  it('treats a missing identity status as not checked', () => {
    expect(identityStatus(null).label).toBe('Not checked');
    expect(identityStatus('verified').tone).toBe('success');
    expect(identityStatus('mismatch').label).toBe('Does not match');
  });
});

describe('proposal tabs', () => {
  it('Awaiting review covers submitted and under review', () => {
    expect(tabStatuses('review')).toEqual(['submitted', 'under_review']);
    expect(tabStatuses('all')).toEqual([]);
    // An unknown tab shows everything, like the default "All" view.
    expect(tabStatuses('nonsense')).toEqual([]);
    expect(DEFAULT_PROPOSAL_TAB).toBe('all');
    expect(PROPOSAL_TABS[0]?.key).toBe('all');
  });
});

describe('quote taxes', () => {
  it('adds VAT, NHIL and GETFund on non-motor products', () => {
    const q = computeQuote(1000, 'FIR', DEFAULT_TAXES);
    expect(q.taxes.map((t) => t.amount)).toEqual([150, 25, 25]);
    expect(q.total).toBe(1200);
  });
  it('charges no tax on motor', () => {
    const q = computeQuote(557, 'MTR', DEFAULT_TAXES);
    expect(q.taxes).toEqual([]);
    expect(q.total).toBe(557);
  });
  it('rounds to pesewas and never goes negative', () => {
    expect(computeQuote(333.333, 'FIR', DEFAULT_TAXES).total).toBe(399.99);
    expect(computeQuote(-5, 'FIR', DEFAULT_TAXES).total).toBe(0);
  });
  it('reads tax rates from the stored rate tables, falling back to the defaults', () => {
    expect(taxesFromRates({ taxes: [{ label: 'VAT', rate: 0.2 }] })).toEqual([{ label: 'VAT', rate: 0.2 }]);
    expect(taxesFromRates({ taxes: [{ label: 'Bad', rate: 15 }] })).toBe(DEFAULT_TAXES);
    expect(taxesFromRates(null)).toBe(DEFAULT_TAXES);
  });
});

describe('lists', () => {
  it('finds phone numbers typed in local format', () => {
    expect(matchesSearch('024 123 4567', '+233241234567')).toBe(true);
    expect(matchesSearch('ama', 'Ama Mensah')).toBe(true);
    expect(matchesSearch('kofi', 'Ama Mensah', null)).toBe(false);
    expect(matchesSearch('  ', 'x')).toBe(true);
  });
  it('sorts with empty values last in both directions', () => {
    const rows = [{ v: 2 }, { v: null }, { v: 10 }, { v: 1 }];
    expect(sortBy(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([1, 2, 10, null]);
    expect(sortBy(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([10, 2, 1, null]);
    expect(sortBy([{ v: 'b10' }, { v: 'b9' }], (r) => r.v, 'asc').map((r) => r.v)).toEqual(['b9', 'b10']);
  });
  it('formats money and phones', () => {
    expect(ghs(1234.5)).toBe('GH₵ 1,234.50');
    expect(ghs(null)).toBe('—');
    expect(localPhone('+233241234567')).toBe('024 123 4567');
  });
  it('totals payments by outcome', () => {
    const t = paymentTotals([
      { amount: 100, status: 'succeeded' },
      { amount: 50.25, status: 'succeeded' },
      { amount: 20, status: 'failed' },
      { amount: 5, status: 'pending' },
    ]);
    expect(t).toEqual({ collected: 150.25, pending: 5, failed: 20, count: 2 });
  });
  it('finds the start of the week and month', () => {
    const thu = new Date('2026-11-05T12:00:00Z');
    expect(periodStart('week', thu)).toBe('2026-11-02');
    expect(periodStart('month', thu)).toBe('2026-11-01');
  });
});
