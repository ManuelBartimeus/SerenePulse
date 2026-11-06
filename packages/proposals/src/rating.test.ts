import { describe, expect, it } from 'vitest';
import { productByCode } from './products';
import {
  coverDays,
  DEFAULT_RATES,
  motorClass,
  priceProposal,
  resolveRates,
  shortPeriodFactor,
} from './rating';
import type { Answers, TableRow } from './schema';

const motor = productByCode('MTR')!;
const today = new Date('2026-11-06T10:00:00Z');
const car = (over: TableRow = {}): TableRow => ({
  reg_no: 'GN 3181-18',
  make: 'nissan',
  model: 'Rogue',
  body_type: 'suv',
  cubic_capacity: 2500,
  seating_capacity: 5,
  year_of_make: 2019,
  estimated_value: 120000,
  colour: 'black',
  ...over,
});
const motorAnswers = (over: Answers = {}): Answers => ({
  vehicles: [car()],
  vehicle_use: 'private',
  cover_type: 'tpo',
  tppd_increase: 'no',
  cover_start: '2026-11-10',
  cover_end: '2027-11-09',
  ...over,
});
const premium = (a: Answers) => {
  const r = priceProposal(motor, a, DEFAULT_RATES, today);
  return r.ok ? r.quote.premium : null;
};

describe('motor rating', () => {
  it('prices private third party at the 2026 NIC tariff, with no tax', () => {
    const r = priceProposal(motor, motorAnswers(), DEFAULT_RATES, today);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.premium).toBe(557);
    expect(r.quote.taxes).toEqual([]);
    expect(r.quote.total).toBe(557);
    expect(r.quote.indicative).toBe(false);
    expect(r.quote.validUntil).toBe('2026-12-06');
  });

  it('adds extra seats above five', () => {
    expect(premium(motorAnswers({ vehicles: [car({ seating_capacity: 7 })] }))).toBe(557 + 2 * 15);
    expect(premium(motorAnswers({ vehicle_use: 'taxi', vehicles: [car({ seating_capacity: 6 })] }))).toBe(
      744 + 25,
    );
  });

  it('maps buses by seats and refers large buses', () => {
    const bus = (seats: number) =>
      motorClass({ vehicle_use: 'passenger_bus' }, car({ body_type: 'minibus', seating_capacity: seats }));
    expect(bus(12)).toBe('minibus_12');
    expect(bus(15)).toBe('trotro_15');
    expect(bus(23)).toBe('trotro_23');
    expect(bus(33)).toHaveProperty('refer');
    expect(motorClass({ vehicle_use: 'own_goods' }, car({ body_type: 'tanker' }))).toBe('articulated');
    expect(motorClass({ vehicle_use: 'private' }, car({ body_type: 'motorcycle' }))).toBe('motorcycle');
  });

  it('prices comprehensive at 5% of value, indicative, never below third party', () => {
    const r = priceProposal(motor, motorAnswers({ cover_type: 'comprehensive' }), DEFAULT_RATES, today);
    expect(r.ok && r.quote.premium).toBe(6000);
    expect(r.ok && r.quote.indicative).toBe(true);
    expect(
      premium(motorAnswers({ cover_type: 'comprehensive', vehicles: [car({ estimated_value: 5000 })] })),
    ).toBe(557);
  });

  it('loads older vehicles and refers very old or very valuable ones', () => {
    // 14 years old: 10% loading on the own-damage part (6000 - 557).
    expect(
      premium(motorAnswers({ cover_type: 'comprehensive', vehicles: [car({ year_of_make: 2012 })] })),
    ).toBeCloseTo(6000 + (6000 - 557) * 0.1, 2);
    expect(premium(motorAnswers({ cover_type: 'tpft', vehicles: [car({ year_of_make: 2001 })] }))).toBeNull();
    expect(
      premium(motorAnswers({ cover_type: 'comprehensive', vehicles: [car({ estimated_value: 2_000_000 })] })),
    ).toBeNull();
    // Third party only is tariff-priced whatever the age or value.
    expect(premium(motorAnswers({ vehicles: [car({ year_of_make: 1998 })] }))).toBe(557);
  });

  it('applies the short-period scale', () => {
    expect(premium(motorAnswers({ cover_end: '2027-05-09' }))).toBeCloseTo(557 * 0.7, 2);
    expect(shortPeriodFactor(365, DEFAULT_RATES)).toEqual({ factor: 1, months: 12 });
    expect(shortPeriodFactor(367, DEFAULT_RATES)).toBeNull();
    expect(coverDays('2026-11-10', '2027-11-09')).toBe(365);
  });

  it('prices a higher TPPD limit', () => {
    expect(premium(motorAnswers({ tppd_increase: 'yes', tppd_increase_amount: 10000 }))).toBe(657);
  });

  it('refers underwriter products', () => {
    expect(priceProposal(productByCode('CAR')!, {}, DEFAULT_RATES, today).ok).toBe(false);
  });
});

describe('rate tables', () => {
  it('fills missing keys from the defaults', () => {
    const r = resolveRates({ motor: { tpo: { private: 600 } } });
    expect(r.motor.tpo.private).toBe(600);
    expect(r.motor.tpo.taxi).toBe(744);
    expect(r.taxes).toHaveLength(3);
    expect(resolveRates(null)).toBe(DEFAULT_RATES);
  });
});

describe('travel, personal accident and home rating', () => {
  it('prices travel per traveller by zone, days and age, with taxes', () => {
    const r = priceProposal(
      productByCode('TRV')!,
      {
        date_of_birth: '1990-03-12',
        destination_zone: 'schengen_europe',
        cover_start: '2026-12-01',
        cover_end: '2026-12-14',
        accompanying_travellers: [{ name: 'Ama', date_of_birth: '2015-06-01' }],
      },
      DEFAULT_RATES,
      today,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 14 days → 15-day band, EUR 30 × 13 = 390; child at 50%.
    expect(r.quote.premium).toBe(390 + 195);
    expect(r.quote.taxes.map((t) => t.amount)).toEqual([87.75, 14.63, 14.63]);
    expect(r.quote.indicative).toBe(true);
  });

  it('refers travellers over 80', () => {
    const r = priceProposal(
      productByCode('TRV')!,
      {
        date_of_birth: '1940-01-01',
        destination_zone: 'africa',
        cover_start: '2026-12-01',
        cover_end: '2026-12-05',
      },
      DEFAULT_RATES,
      today,
    );
    expect(r.ok).toBe(false);
  });

  it('prices personal accident by occupation class with a minimum premium', () => {
    const pa = productByCode('PAC')!;
    const base = { cover_start: '2026-11-10', cover_end: '2027-11-09' };
    const r = priceProposal(
      pa,
      { ...base, occupation_class: 'class_2', capital_sum: 100000 },
      DEFAULT_RATES,
      today,
    );
    expect(r.ok && r.quote.premium).toBe(350);
    const small = priceProposal(
      pa,
      { ...base, occupation_class: 'class_1', capital_sum: 10000 },
      DEFAULT_RATES,
      today,
    );
    expect(small.ok && small.quote.premium).toBe(100);
  });

  it('prices home buildings and contents, and refers other sections', () => {
    const home = productByCode('HMF')!;
    const base = { cover_start: '2026-11-10', cover_end: '2027-11-09' };
    const r = priceProposal(
      home,
      {
        ...base,
        sections_required: ['buildings', 'contents'],
        buildings_sum_insured: 800000,
        contents_sum_insured: 100000,
      },
      DEFAULT_RATES,
      today,
    );
    expect(r.ok && r.quote.premium).toBe(800 + 350);
    const pa = priceProposal(
      home,
      { ...base, sections_required: ['buildings', 'family_pa'], buildings_sum_insured: 1 },
      DEFAULT_RATES,
      today,
    );
    expect(pa.ok).toBe(false);
  });
});
