// Premium rating for instant products, and the rate tables staff can edit (Products & rates).
//
// Sources and confidence: docs/sales/research-ghana-insurance.md. Motor third-party premiums are
// the NIC minimum tariff effective 16 Feb 2026 and are quoted as firm prices. Everything else
// (own damage, travel, personal accident, home) uses indicative market rates, so those quotes say
// "indicative" and an underwriter can adjust them before the customer pays.
//
// A product or answer set the tables cannot price safely is *referred*: the proposal goes to an
// underwriter instead of getting an automatic price. Referral is always the safe fallback.
import type { Quote, QuoteLine } from './api';
import type { Product } from './products';
import { formById } from './forms';
import type { Answers, AnswerValue, FormDefinition, TableRow } from './schema';
import { allFields } from './validate';

// ---------------------------------------------------------------------------------------------
// Tables

export const MOTOR_CLASSES = [
  'private',
  'taxi',
  'hiring',
  'minibus_12',
  'trotro_15',
  'trotro_23',
  'own_goods',
  'general_cartage',
  'articulated',
  'ambulance',
  'motorcycle',
  'tricycle',
] as const;
export type MotorClass = (typeof MOTOR_CLASSES)[number];

export const MOTOR_CLASS_LABELS: Record<MotorClass, string> = {
  private: 'Private individual / corporate',
  taxi: 'Taxi',
  hiring: 'Hiring / rental car',
  minibus_12: 'Mini bus / trotro, up to 12 seats',
  trotro_15: 'Trotro, 13–15 seats',
  trotro_23: 'Trotro, 16–23 seats',
  own_goods: 'Own goods (Z.300)',
  general_cartage: 'General cartage (Z.301)',
  articulated: 'Articulated / tanker',
  ambulance: 'Ambulance / hearse (Z.802)',
  motorcycle: 'Motorcycle',
  tricycle: 'Tricycle / aboboyaa',
};

export const TRAVEL_ZONES = [
  'africa',
  'schengen_europe',
  'worldwide_excl_us_ca',
  'worldwide_incl_us_ca',
] as const;
export type TravelZone = (typeof TRAVEL_ZONES)[number];

export interface TaxLine {
  label: string;
  rate: number; // fraction, 0.15 = 15%
}

export interface RateTables {
  version: number;
  updatedAt?: string;
  /** Taxes on non-motor premiums (motor is exempt). VAT Act 2025 (Act 1151). */
  taxes: readonly TaxLine[];
  /** Short-period scale: fraction of the annual premium for covers up to `months` months. */
  shortPeriod: readonly { months: number; factor: number }[];
  motor: {
    /** Annual third-party-only premium by class (NIC minimum tariff). */
    tpo: Record<MotorClass, number>;
    /** Extra-seat loading for cars: per seat above `includedSeats`. */
    extraSeat: { includedSeats: number; privateRate: number; commercialRate: number };
    /** Comprehensive: fraction of vehicle (+ trailer) value; never below the TPO premium. */
    comprehensiveRate: number;
    /** Third party, fire & theft: fire & theft fraction of value added to the TPO premium. */
    tpftRate: number;
    /** Extra TPPD limit: fraction of the increase requested. */
    tppdIncreaseRate: number;
    /** Own-damage loading by vehicle age (years since year of make). Highest matching row applies. */
    ageLoadings: readonly { overYears: number; rate: number }[];
    /** Own-damage covers for older or more valuable vehicles go to an underwriter. */
    referOverAgeYears: number;
    referOverValue: number;
    /** Buses above this many seats go to an underwriter. */
    referOverSeats: number;
  };
  travel: {
    /** Premium per traveller in EUR by zone and maximum trip length in days (ascending). */
    bands: Record<TravelZone, readonly { maxDays: number; eur: number }[]>;
    /** EUR → GH₵ conversion used for quoting (update with the day's rate). */
    eurToGhs: number;
    /** Age factor per traveller (first matching row by maximum age); travellers older than the last row are referred. */
    ageFactors: readonly { maxAge: number; factor: number }[];
  };
  personalAccident: {
    /** Annual premium as a fraction of the capital sum, by occupation class. */
    classRates: Record<string, number>;
    minPremium: number;
    referOverCapital: number;
  };
  home: {
    buildingsRate: number;
    contentsRate: number;
    allRisksRate: number;
    minPremium: number;
    referOverSum: number;
  };
  quoteValidityDays: number;
}

export const DEFAULT_RATES: RateTables = {
  version: 1,
  taxes: [
    { label: 'VAT (15%)', rate: 0.15 },
    { label: 'NHIL (2.5%)', rate: 0.025 },
    { label: 'GETFund levy (2.5%)', rate: 0.025 },
  ],
  shortPeriod: [
    { months: 1, factor: 0.2 },
    { months: 2, factor: 0.3 },
    { months: 3, factor: 0.4 },
    { months: 4, factor: 0.5 },
    { months: 5, factor: 0.6 },
    { months: 6, factor: 0.7 },
    { months: 7, factor: 0.75 },
    { months: 8, factor: 0.8 },
    { months: 9, factor: 0.85 },
    { months: 12, factor: 1 },
  ],
  motor: {
    tpo: {
      private: 557,
      taxi: 744,
      hiring: 744,
      minibus_12: 919,
      trotro_15: 894,
      trotro_23: 1194,
      own_goods: 761,
      general_cartage: 893,
      articulated: 1052,
      ambulance: 733,
      motorcycle: 331,
      tricycle: 431,
    },
    extraSeat: { includedSeats: 5, privateRate: 15, commercialRate: 25 },
    comprehensiveRate: 0.05,
    tpftRate: 0.0125,
    tppdIncreaseRate: 0.01,
    ageLoadings: [
      { overYears: 10, rate: 0.1 },
      { overYears: 15, rate: 0.2 },
    ],
    referOverAgeYears: 20,
    referOverValue: 1_500_000,
    referOverSeats: 23,
  },
  travel: {
    bands: {
      africa: [
        { maxDays: 7, eur: 14 },
        { maxDays: 15, eur: 21 },
        { maxDays: 21, eur: 27 },
        { maxDays: 31, eur: 34 },
        { maxDays: 45, eur: 46 },
        { maxDays: 62, eur: 56 },
        { maxDays: 92, eur: 74 },
        { maxDays: 180, eur: 119 },
        { maxDays: 365, eur: 182 },
      ],
      schengen_europe: [
        { maxDays: 7, eur: 20 },
        { maxDays: 15, eur: 30 },
        { maxDays: 21, eur: 38 },
        { maxDays: 31, eur: 48 },
        { maxDays: 45, eur: 65 },
        { maxDays: 62, eur: 80 },
        { maxDays: 92, eur: 105 },
        { maxDays: 180, eur: 170 },
        { maxDays: 365, eur: 260 },
      ],
      worldwide_excl_us_ca: [
        { maxDays: 7, eur: 24 },
        { maxDays: 15, eur: 36 },
        { maxDays: 21, eur: 46 },
        { maxDays: 31, eur: 58 },
        { maxDays: 45, eur: 78 },
        { maxDays: 62, eur: 96 },
        { maxDays: 92, eur: 126 },
        { maxDays: 180, eur: 204 },
        { maxDays: 365, eur: 312 },
      ],
      worldwide_incl_us_ca: [
        { maxDays: 7, eur: 40 },
        { maxDays: 15, eur: 60 },
        { maxDays: 21, eur: 76 },
        { maxDays: 31, eur: 96 },
        { maxDays: 45, eur: 130 },
        { maxDays: 62, eur: 160 },
        { maxDays: 92, eur: 210 },
        { maxDays: 180, eur: 340 },
        { maxDays: 365, eur: 520 },
      ],
    },
    eurToGhs: 13,
    ageFactors: [
      { maxAge: 17, factor: 0.5 },
      { maxAge: 65, factor: 1 },
      { maxAge: 75, factor: 1.75 },
      { maxAge: 80, factor: 2.5 },
    ],
  },
  personalAccident: {
    classRates: { class_1: 0.002, class_2: 0.0035, class_3: 0.0075 },
    minPremium: 100,
    referOverCapital: 500_000,
  },
  home: {
    buildingsRate: 0.001,
    contentsRate: 0.0035,
    allRisksRate: 0.015,
    minPremium: 250,
    referOverSum: 5_000_000,
  },
  quoteValidityDays: 30,
};

/** Merges stored settings over the defaults so a partial or older table never breaks rating. */
export function resolveRates(stored: unknown): RateTables {
  if (!stored || typeof stored !== 'object') return DEFAULT_RATES;
  const s = stored as Partial<RateTables>;
  return {
    ...DEFAULT_RATES,
    ...s,
    motor: {
      ...DEFAULT_RATES.motor,
      ...(s.motor ?? {}),
      tpo: { ...DEFAULT_RATES.motor.tpo, ...(s.motor?.tpo ?? {}) },
      extraSeat: { ...DEFAULT_RATES.motor.extraSeat, ...(s.motor?.extraSeat ?? {}) },
    },
    travel: {
      ...DEFAULT_RATES.travel,
      ...(s.travel ?? {}),
      bands: { ...DEFAULT_RATES.travel.bands, ...(s.travel?.bands ?? {}) },
    },
    personalAccident: {
      ...DEFAULT_RATES.personalAccident,
      ...(s.personalAccident ?? {}),
      classRates: { ...DEFAULT_RATES.personalAccident.classRates, ...(s.personalAccident?.classRates ?? {}) },
    },
    home: { ...DEFAULT_RATES.home, ...(s.home ?? {}) },
  };
}

// ---------------------------------------------------------------------------------------------
// Helpers

export type RatingResult = { ok: true; quote: Quote } | { ok: false; refer: readonly string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;
const ghs = (n: number) =>
  `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (r: number) => `${+(r * 100).toFixed(3)}%`;

function num(v: AnswerValue | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v.replace(/,/g, ''));
  return NaN;
}

const DAY = 86_400_000;
const isoDay = (s: string) => Date.parse(`${s}T00:00:00Z`);

/** Days covered, inclusive of both dates. */
export function coverDays(start: string, end: string): number {
  return Math.round((isoDay(end) - isoDay(start)) / DAY) + 1;
}

/** The annual-premium fraction for a cover of `days`; null if longer than a year (+1 day for leap years). */
export function shortPeriodFactor(
  days: number,
  rates: RateTables,
): { factor: number; months: number } | null {
  if (days > 366) return null;
  if (days >= 365) return { factor: 1, months: 12 };
  const months = Math.max(1, Math.ceil(days / 30.4375));
  const row = rates.shortPeriod.find((r) => months <= r.months) ?? { months: 12, factor: 1 };
  return { factor: row.factor, months };
}

function ageOn(dob: string, on: string): number {
  const d = new Date(`${dob}T00:00:00Z`);
  const t = new Date(`${on}T00:00:00Z`);
  let age = t.getUTCFullYear() - d.getUTCFullYear();
  const m = t.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && t.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function finish(
  product: Product,
  lines: QuoteLine[],
  rates: RateTables,
  today: Date,
  opts: { indicative: boolean; notes: string[] },
): Quote {
  const premium = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxable = product.category !== 'motor';
  const taxes = taxable ? rates.taxes.map((t) => ({ label: t.label, amount: round2(premium * t.rate) })) : [];
  const total = round2(premium + taxes.reduce((s, t) => s + t.amount, 0));
  const valid = new Date(today.getTime() + rates.quoteValidityDays * DAY).toISOString().slice(0, 10);
  return {
    currency: 'GHS',
    premium,
    lines: lines.map((l) => ({ label: l.label, amount: round2(l.amount) })),
    taxes,
    total,
    indicative: opts.indicative,
    notes: opts.notes,
    validUntil: valid,
    source: 'rating',
  };
}

function periodOf(answers: Answers, rates: RateTables, refer: string[], roles: RoleMap = {}) {
  const start = answers[roles.coverStart ?? 'cover_start'];
  const end = answers[roles.coverEnd ?? 'cover_end'];
  if (typeof start !== 'string' || typeof end !== 'string') {
    refer.push('Choose the start and end dates of the cover.');
    return null;
  }
  const days = coverDays(start, end);
  if (!(days >= 1)) {
    refer.push('The end date must be after the start date.');
    return null;
  }
  const sp = shortPeriodFactor(days, rates);
  if (!sp) refer.push('Covers longer than one year are arranged by an underwriter.');
  return sp ? { start, end, days, ...sp } : null;
}

// ---------------------------------------------------------------------------------------------
// Motor

/** The tariff class for the vehicle, or a reason it must be referred. */
export function motorClass(answers: Answers, vehicle: TableRow): MotorClass | { refer: string } {
  const use = answers.vehicle_use;
  const body = vehicle.body_type;
  const seats = num(vehicle.seating_capacity ?? undefined);
  if (body === 'tricycle') return 'tricycle';
  if (body === 'motorcycle' || use === 'motorcycle') return 'motorcycle';
  if (body === 'ambulance') return 'ambulance';
  if (body === 'tractor') return { refer: 'Agricultural vehicles are rated by an underwriter.' };
  switch (use) {
    case 'private':
      return 'private';
    case 'taxi':
      return 'taxi';
    case 'hiring':
      return 'hiring';
    case 'own_goods':
      return body === 'articulator' || body === 'tanker' ? 'articulated' : 'own_goods';
    case 'general_cartage':
      return body === 'articulator' || body === 'tanker' ? 'articulated' : 'general_cartage';
    case 'passenger_bus':
      if (!Number.isFinite(seats)) return { refer: 'Enter the seating capacity.' };
      if (seats <= 12) return 'minibus_12';
      if (seats <= 15) return 'trotro_15';
      if (seats <= 23) return 'trotro_23';
      return { refer: 'Buses with more than 23 seats are rated by an underwriter.' };
    default:
      return { refer: 'This use of vehicle is rated by an underwriter.' };
  }
}

function priceMotor(product: Product, answers: Answers, rates: RateTables, today: Date): RatingResult {
  const refer: string[] = [];
  const m = rates.motor;
  const vehicles = answers.vehicles;
  const v = Array.isArray(vehicles) ? (vehicles[0] as TableRow | undefined) : undefined;
  if (!v) return { ok: false, refer: ['Add the vehicle’s details.'] };
  const cls = motorClass(answers, v);
  if (typeof cls !== 'string') return { ok: false, refer: [cls.refer] };
  const cover = answers.cover_type;
  if (cover !== 'tpo' && cover !== 'tpft' && cover !== 'comprehensive')
    return { ok: false, refer: ['Choose the type of cover.'] };
  const period = periodOf(answers, rates, refer);

  const seats = num(v.seating_capacity ?? undefined);
  const value = (num(v.estimated_value ?? undefined) || 0) + (num(v.trailer_value ?? undefined) || 0);
  const year = num(v.year_of_make ?? undefined);
  const age = Number.isFinite(year) ? today.getUTCFullYear() - year : NaN;

  const lines: QuoteLine[] = [];
  lines.push({ label: `Third-party premium: ${MOTOR_CLASS_LABELS[cls]}`, amount: m.tpo[cls] });

  const carClass = cls === 'private' || cls === 'ambulance' || cls === 'taxi' || cls === 'hiring';
  if (carClass && Number.isFinite(seats) && seats > m.extraSeat.includedSeats) {
    const extra = seats - m.extraSeat.includedSeats;
    const rate =
      cls === 'private' || cls === 'ambulance' ? m.extraSeat.privateRate : m.extraSeat.commercialRate;
    lines.push({ label: `Extra seats: ${extra} × ${ghs(rate)}`, amount: extra * rate });
  }
  const tpo = lines.reduce((s, l) => s + l.amount, 0);

  const notes: string[] = [];
  let indicative = false;
  if (cover !== 'tpo') {
    indicative = true;
    if (!(value > 0)) refer.push('Enter the vehicle’s estimated value.');
    if (value > m.referOverValue)
      refer.push(`Vehicles valued above ${ghs(m.referOverValue)} are rated by an underwriter.`);
    if (age > m.referOverAgeYears)
      refer.push(
        `Own-damage cover for vehicles over ${m.referOverAgeYears} years old is arranged by an underwriter.`,
      );
    if (cover === 'comprehensive') {
      const od = value * m.comprehensiveRate;
      // The comprehensive premium includes third-party cover and is never below the TPO premium.
      const extra = Math.max(od - tpo, 0);
      lines.push({
        label: `Own damage, fire & theft: ${pct(m.comprehensiveRate)} of ${ghs(value)}`,
        amount: extra,
      });
      if (od < tpo) notes.push('The comprehensive premium cannot be lower than the third-party premium.');
    } else {
      lines.push({ label: `Fire & theft: ${pct(m.tpftRate)} of ${ghs(value)}`, amount: value * m.tpftRate });
    }
    const loading = [...m.ageLoadings]
      .sort((a, b) => b.overYears - a.overYears)
      .find((r) => age > r.overYears);
    if (loading) {
      const base = lines.slice(-1)[0]?.amount ?? 0;
      lines.push({
        label: `Vehicle over ${loading.overYears} years old: +${pct(loading.rate)}`,
        amount: base * loading.rate,
      });
    }
    notes.push(
      'Subject to the vehicle photos and documents you attach. An underwriter confirms the price before cover starts.',
    );
    if (answers.ncd_entitled === 'yes')
      notes.push(
        'Your no-claim discount is applied after we check the renewal notice from your previous insurer.',
      );
  }
  if (answers.tppd_increase === 'yes') {
    const inc = num(answers.tppd_increase_amount);
    if (inc > 0) {
      lines.push({ label: `Higher property-damage limit: +${ghs(inc)}`, amount: inc * m.tppdIncreaseRate });
      indicative = true;
    }
  }
  if (refer.length) return { ok: false, refer };
  if (period && period.factor < 1) {
    const annual = lines.reduce((s, l) => s + l.amount, 0);
    lines.push({
      label: `Short period: ${period.months} month${period.months === 1 ? '' : 's'} at ${pct(period.factor)} of the annual premium`,
      amount: annual * period.factor - annual,
    });
  }
  return { ok: true, quote: finish(product, lines, rates, today, { indicative, notes }) };
}

// ---------------------------------------------------------------------------------------------
// Travel, personal accident, home (fields read by role or by the ids used in their forms)

function travellerRows(answers: Answers, roles: RoleMap): TableRow[] {
  for (const key of [roles.travelers, 'travellers', 'travelers', 'accompanying']) {
    if (!key) continue;
    const rows = answers[key];
    if (Array.isArray(rows)) return rows as TableRow[];
  }
  return [];
}

function priceTravel(
  product: Product,
  answers: Answers,
  rates: RateTables,
  today: Date,
  roles: RoleMap,
): RatingResult {
  const refer: string[] = [];
  const zone = answers[roles.travelDestination ?? 'destination_zone'];
  if (typeof zone !== 'string' || !(TRAVEL_ZONES as readonly string[]).includes(zone))
    return { ok: false, refer: ['Choose where you are travelling.'] };
  const start = answers[roles.coverStart ?? 'cover_start'];
  const end = answers[roles.coverEnd ?? 'cover_end'];
  if (typeof start !== 'string' || typeof end !== 'string')
    return { ok: false, refer: ['Choose your travel dates.'] };
  const days = coverDays(start, end);
  const bands = rates.travel.bands[zone as TravelZone];
  const band = bands.find((b) => days <= b.maxDays);
  if (!band || days < 1)
    return { ok: false, refer: ['Trips longer than a year are arranged by an underwriter.'] };

  const dobs: { who: string; dob: string }[] = [];
  const own = answers.date_of_birth;
  if (typeof own === 'string') dobs.push({ who: 'You', dob: own });
  for (const row of travellerRows(answers, roles)) {
    const dob = row.date_of_birth ?? row.dob;
    if (typeof dob === 'string' && dob) dobs.push({ who: String(row.name ?? 'Traveller'), dob });
  }
  if (!dobs.length) return { ok: false, refer: ['Enter your date of birth.'] };

  const lines: QuoteLine[] = [];
  const base = band.eur * rates.travel.eurToGhs;
  for (const t of dobs) {
    const age = ageOn(t.dob, start);
    const f = rates.travel.ageFactors.find((r) => age <= r.maxAge);
    if (!f) {
      refer.push(
        `Travellers over ${rates.travel.ageFactors.slice(-1)[0]?.maxAge ?? 80} are covered by an underwriter.`,
      );
      continue;
    }
    lines.push({
      label: `${t.who}, age ${age}: ${days} day${days === 1 ? '' : 's'}${f.factor !== 1 ? ` (× ${f.factor})` : ''}`,
      amount: base * f.factor,
    });
  }
  if (refer.length) return { ok: false, refer };
  const notes = [`Priced at EUR 1 = GH₵ ${rates.travel.eurToGhs.toFixed(2)}.`];
  if (zone === 'schengen_europe')
    notes.push('Medical cover of at least EUR 30,000, as Schengen visas require.');
  return { ok: true, quote: finish(product, lines, rates, today, { indicative: true, notes }) };
}

function pricePersonalAccident(
  product: Product,
  answers: Answers,
  rates: RateTables,
  today: Date,
  roles: RoleMap,
): RatingResult {
  const refer: string[] = [];
  const capital = num(answers[roles.sumInsured ?? 'capital_sum']);
  const cls = answers.occupation_class;
  if (!(capital > 0)) return { ok: false, refer: ['Enter the capital sum to insure.'] };
  const rate = typeof cls === 'string' ? rates.personalAccident.classRates[cls] : undefined;
  if (rate === undefined) return { ok: false, refer: ['Your occupation is rated by an underwriter.'] };
  if (capital > rates.personalAccident.referOverCapital)
    return {
      ok: false,
      refer: [
        `Capital sums above ${ghs(rates.personalAccident.referOverCapital)} are arranged by an underwriter.`,
      ],
    };
  const period = periodOf(answers, rates, refer, roles);
  if (refer.length) return { ok: false, refer };
  const annual = capital * rate;
  const lines: QuoteLine[] = [{ label: `Annual premium: ${pct(rate)} of ${ghs(capital)}`, amount: annual }];
  if (annual < rates.personalAccident.minPremium)
    lines.push({ label: 'Minimum premium adjustment', amount: rates.personalAccident.minPremium - annual });
  if (period && period.factor < 1) {
    const a = lines.reduce((s, l) => s + l.amount, 0);
    lines.push({
      label: `Short period: ${period.months} months at ${pct(period.factor)}`,
      amount: a * period.factor - a,
    });
  }
  return { ok: true, quote: finish(product, lines, rates, today, { indicative: true, notes: [] }) };
}

function priceHome(
  product: Product,
  answers: Answers,
  rates: RateTables,
  today: Date,
  roles: RoleMap,
): RatingResult {
  const refer: string[] = [];
  const h = rates.home;
  const sections = Array.isArray(answers.sections_required)
    ? (answers.sections_required as readonly string[])
    : [];
  const others = sections.filter((x) => x !== 'buildings' && x !== 'contents');
  if (others.length)
    return {
      ok: false,
      refer: [
        'Burglary, personal accident, glass, pedal cycle, legal expenses and rent sections are priced by an underwriter.',
      ],
    };
  const buildings = sections.includes('buildings') ? num(answers.buildings_sum_insured) || 0 : 0;
  const contents = sections.includes('contents') ? num(answers.contents_sum_insured) || 0 : 0;
  const total = buildings + contents;
  if (!(total > 0)) return { ok: false, refer: ['Enter the value of the buildings or contents to insure.'] };
  if (total > h.referOverSum)
    return { ok: false, refer: [`Sums above ${ghs(h.referOverSum)} are arranged by an underwriter.`] };
  const period = periodOf(answers, rates, refer, roles);
  if (refer.length) return { ok: false, refer };
  const lines: QuoteLine[] = [];
  if (buildings)
    lines.push({
      label: `Buildings: ${pct(h.buildingsRate)} of ${ghs(buildings)}`,
      amount: buildings * h.buildingsRate,
    });
  if (contents)
    lines.push({
      label: `Contents: ${pct(h.contentsRate)} of ${ghs(contents)}`,
      amount: contents * h.contentsRate,
    });
  const annual = lines.reduce((s, l) => s + l.amount, 0);
  if (annual < h.minPremium)
    lines.push({ label: 'Minimum premium adjustment', amount: h.minPremium - annual });
  if (period && period.factor < 1) {
    const a = lines.reduce((s, l) => s + l.amount, 0);
    lines.push({
      label: `Short period: ${period.months} months at ${pct(period.factor)}`,
      amount: a * period.factor - a,
    });
  }
  return {
    ok: true,
    quote: finish(product, lines, rates, today, {
      indicative: true,
      notes: [
        'Subject to the photos of your home you attach. An underwriter confirms the price before cover starts.',
      ],
    }),
  };
}

/** Field ids by role, from the product's form, so rating does not hard-code form-specific ids. */
export type RoleMap = Partial<
  Record<'coverStart' | 'coverEnd' | 'sumInsured' | 'travelDestination' | 'travelers', string>
>;

/** Maps each role to the id of the field that carries it in `def`. */
export function rolesOf(def: FormDefinition | undefined): RoleMap {
  const out: RoleMap = {};
  if (!def) return out;
  const fields = [...allFields(def).map((x) => x.field), ...(def.declaration.fields ?? [])];
  for (const f of fields) {
    const r = f.role;
    if (
      r === 'coverStart' ||
      r === 'coverEnd' ||
      r === 'sumInsured' ||
      r === 'travelDestination' ||
      r === 'travelers'
    )
      out[r] ??= f.id;
  }
  return out;
}

/**
 * Prices `answers` for `product`. Products that cannot be priced automatically are referred to an
 * underwriter (`ok: false`, with the reasons to show the customer).
 */
export function priceProposal(
  product: Product,
  answers: Answers,
  rates: RateTables,
  today = new Date(),
  roles: RoleMap = rolesOf(formById(product.formId)),
): RatingResult {
  if (product.purchase !== 'instant')
    return { ok: false, refer: ['This cover is priced by an underwriter.'] };
  const r = resolveRates(rates);
  switch (product.formId) {
    case 'motor':
      return priceMotor(product, answers, r, today);
    case 'travel':
      return priceTravel(product, answers, r, today, roles);
    case 'personal-accident':
      return pricePersonalAccident(product, answers, r, today, roles);
    case 'home-flexi':
      return priceHome(product, answers, r, today, roles);
    default:
      return { ok: false, refer: ['This cover is priced by an underwriter.'] };
  }
}
