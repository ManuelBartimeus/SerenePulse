import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatBytes, isWorkingDay, nextRunAt, periodFor, type Frequency } from './schedule';

// Ghana public holidays as seeded in public.holidays.
const HOLIDAYS = new Set(['2026-07-01', '2026-12-25', '2026-12-26', '2027-01-01', '2027-01-07']);
const t = (s: string) => new Date(s);

describe('nextRunAt (T-M13-110, same cases as pgTAP 041)', () => {
  it.each<[Frequency, string, string]>([
    ['daily', '2026-11-05T06:59:59Z', '2026-11-05T07:00:00.000Z'],
    ['daily', '2026-11-05T07:00:00Z', '2026-11-06T07:00:00.000Z'],
    ['weekly', '2026-11-05T10:00:00Z', '2026-11-09T07:00:00.000Z'],
    ['weekly', '2026-11-09T06:00:00Z', '2026-11-09T07:00:00.000Z'],
    ['weekly', '2026-11-08T23:00:00Z', '2026-11-09T07:00:00.000Z'],
    ['monthly', '2026-11-05T10:00:00Z', '2026-12-01T07:00:00.000Z'],
    ['monthly', '2026-12-31T23:00:00Z', '2027-01-01T07:00:00.000Z'],
    ['quarterly', '2026-11-05T10:00:00Z', '2027-01-04T07:00:00.000Z'],
    ['quarterly', '2026-06-10T10:00:00Z', '2026-07-02T07:00:00.000Z'],
    ['quarterly', '2027-01-04T07:00:00Z', '2027-04-01T07:00:00.000Z'],
    ['quarterly', '2026-09-30T12:00:00Z', '2026-10-01T07:00:00.000Z'],
  ])('%s after %s → %s', (f, after, expected) => {
    expect(nextRunAt(f, t(after), HOLIDAYS).toISOString()).toBe(expected);
  });

  it('quarterly runs fall on the first working day of a quarter, at 07:00', () => {
    fc.assert(
      fc.property(fc.date({ min: t('2026-01-01'), max: t('2027-12-31'), noInvalidDate: true }), (after) => {
        const at = nextRunAt('quarterly', after, HOLIDAYS);
        expect(at > after).toBe(true);
        expect(at.getUTCHours()).toBe(7);
        expect(at.getUTCMonth() % 3).toBe(0);
        expect(isWorkingDay(at, HOLIDAYS)).toBe(true);
        for (let d = 1; d < at.getUTCDate(); d++) {
          expect(isWorkingDay(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), d)), HOLIDAYS)).toBe(
            false,
          );
        }
      }),
    );
  });

  it('every frequency returns a time strictly after the input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Frequency>('daily', 'weekly', 'monthly', 'quarterly'),
        fc.date({ min: t('2025-01-01'), max: t('2030-12-31'), noInvalidDate: true }),
        (f, after) => {
          const at = nextRunAt(f, after, HOLIDAYS);
          expect(at.getTime()).toBeGreaterThan(after.getTime());
          expect(at.getTime() - after.getTime()).toBeLessThanOrEqual(100 * 86_400_000);
        },
      ),
    );
  });
});

describe('periodFor', () => {
  it('matches reports.period_for', () => {
    expect(periodFor('daily', '2026-11-05')).toEqual({ from: '2026-11-04', to: '2026-11-04' });
    expect(periodFor('daily', '2027-01-01')).toEqual({ from: '2026-12-31', to: '2026-12-31' });
    expect(periodFor('weekly', '2026-11-09')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(periodFor('weekly', '2026-11-11')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(periodFor('monthly', '2026-12-01')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(periodFor('monthly', '2026-03-01')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodFor('quarterly', '2027-01-04')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodFor('quarterly', '2026-07-02')).toEqual({ from: '2026-04-01', to: '2026-06-30' });
  });
});

describe('formatBytes', () => {
  it('uses binary units', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(524288000)).toBe('500.0 MB');
    expect(formatBytes(1073741824)).toBe('1.00 GB');
  });
});
