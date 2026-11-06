import { describe, expect, it } from 'vitest';
import { buildCertificate, insuredSubject, policyCode, type CertificateInput } from './certificate';
import { productByFormId } from './products';
import { certDate, clockTime, slashDate } from './render/format';
import type { Answers } from './schema';

const motor = productByFormId('motor')!;
const travel = productByFormId('travel')!;
const fire = productByFormId('fire')!;

const motorAnswers: Answers = {
  full_name: 'Asante Isaac',
  vehicles: [{ reg_no: 'GN 3181-18', make: 'nissan', model: 'Rogue', seating_capacity: 5 }],
  chassis_no: '',
  vehicle_use: 'private',
  cover_type: 'tpo',
  tppd_increase: 'no',
};

const base = (over: Partial<CertificateInput> = {}): CertificateInput => ({
  product: motor,
  answers: motorAnswers,
  policyNo: 'SE24MTP91228-E',
  certificateNo: 'C04-24-89549',
  customerNo: 'USR00962',
  policyHolder: 'Asante Isaac',
  startsOn: '2024-11-26',
  expiresOn: '2025-05-25',
  issuedAt: '2024-11-21T18:45:57Z',
  tppdLimit: 6000,
  ...over,
});

const fact = (c: { facts: readonly { label: string; value: string }[] }, label: string) =>
  c.facts.find((f) => f.label.startsWith(label));

describe('formatting', () => {
  it('writes certificate dates and Accra times like the sample', () => {
    expect(certDate('2024-11-26')).toBe('26th November, 2024');
    expect(certDate('2025-05-01')).toBe('1st May, 2025');
    expect(certDate('2025-05-22')).toBe('22nd May, 2025');
    expect(certDate('2025-05-13')).toBe('13th May, 2025');
    expect(slashDate('2024-11-21T18:45:57Z')).toBe('21/11/2024');
    expect(clockTime('2024-11-21T18:45:57Z')).toBe('6:45:57 PM');
    expect(clockTime('2024-11-21T00:05:09Z')).toBe('12:05:09 AM');
  });
});

describe('motor certificate', () => {
  it('reproduces the sample third-party-only certificate', () => {
    const c = buildCertificate(base());
    expect(c.kind).toBe('motor');
    expect(c.coverTitle).toBe('MOTOR THIRD PARTY ONLY');
    expect(c.actLine).toBe('MOTOR THIRD PARTY ONLY INSURANCE ACT 1958 (GHANA)');
    expect(c.numberedItems.map((i) => i.value)).toEqual([
      'GN 3181-18',
      'ASANTE ISAAC',
      '26th November, 2024',
      '25th May, 2025',
    ]);
    expect(c.clauses[1]?.value).toBe('PRIVATE INDIVIDUAL');
    expect(c.clauses[1]?.lines[2]).toBe('3. Use only for social, domestic and pleasure purposes.');
    expect(c.clauses[2]?.lines).toHaveLength(3);
    expect(fact(c, 'CHASSIS NO')?.value).toBe('TBA');
    expect(fact(c, 'VEHICLE SEATING')?.value).toBe('5');
    expect(fact(c, 'VEHICLE MAKE')?.value).toBe('NISSAN ROGUE');
    expect(fact(c, 'GEOGRAPHICAL AREA')?.value).toBe('GHANA');
    expect(fact(c, 'T.P.P.D LIMIT')?.value).toBe('GHS 6,000.00');
    expect(fact(c, 'EXCESS')?.label).toBe('EXCESS NOT APPLICABLE');
    expect(fact(c, 'DATE OF ISSUE')?.value).toBe('21/11/2024');
    expect(fact(c, 'TIME OF ISSUE')?.value).toBe('6:45:57 PM');
    expect(c.signatoryTitle).toBe('CHIEF EXECUTIVE OFFICER');
    expect(c.verifyUrl).toBeUndefined();
  });

  it('adds the TPPD increase and names comprehensive cover', () => {
    const c = buildCertificate(
      base({
        answers: {
          ...motorAnswers,
          cover_type: 'comprehensive',
          tppd_increase: 'yes',
          tppd_increase_amount: 12000,
        },
        tppdLimit: 8000,
        verifyUrl: 'https://example.test/verify?certificate=C04-24-89549',
      }),
    );
    expect(c.coverTitle).toBe('COMPREHENSIVE');
    expect(c.actLine).toBe('MOTOR COMPREHENSIVE INSURANCE ACT 1958 (GHANA)');
    expect(fact(c, 'T.P.P.D LIMIT')?.value).toBe('GHS 20,000.00');
    expect(fact(c, 'EXCESS')?.value).toBe('AS PER POLICY SCHEDULE');
    expect(c.verifyUrl).toContain('verify');
  });

  it('uses class-of-use wording for commercial vehicles', () => {
    const taxi = buildCertificate(base({ answers: { ...motorAnswers, vehicle_use: 'taxi' } }));
    expect(taxi.clauses[1]?.value).toBe('TAXI');
    expect(taxi.clauses[0]?.lines.join(' ')).toMatch(/employ/);
    expect(taxi.clauses[2]?.lines.join(' ')).not.toMatch(/conveyance of passengers for hire/);
    const cartage = buildCertificate(base({ answers: { ...motorAnswers, vehicle_use: 'general_cartage' } }));
    expect(cartage.clauses[1]?.value).toBe('GENERAL CARTAGE (Z.301)');
    const own = buildCertificate(base({ answers: { ...motorAnswers, vehicle_use: 'own_goods' } }));
    expect(own.clauses[1]?.value).toBe('OWN GOODS (Z.300)');
    const other = buildCertificate(
      base({ answers: { ...motorAnswers, vehicle_use: '__other', vehicle_use__other: 'Ambulance' } }),
    );
    expect(other.clauses[1]?.value).toBe('AMBULANCE');
    for (const use of ['hiring', 'passenger_bus', 'motorcycle'])
      expect(
        buildCertificate(base({ answers: { ...motorAnswers, vehicle_use: use } })).clauses[1]?.lines.length,
      ).toBeGreaterThan(0);
  });

  it('extends the area for a brown card', () => {
    const c = buildCertificate(base({ answers: { ...motorAnswers, ecowas_brown_card: 'yes' } }));
    expect(fact(c, 'GEOGRAPHICAL AREA')?.value).toMatch(/ECOWAS/);
  });
});

describe('general certificate', () => {
  it('lists insured, situation, sum insured and period; never the premium', () => {
    const c = buildCertificate(
      base({
        product: fire,
        policyNo: 'SE26FIR10001-E',
        answers: {
          full_name: 'Ama Boateng',
          property_situation: 'House 12, Dzorwulu, Accra',
          total_sum_insured: 250000,
        },
        policyHolder: 'Ama Boateng',
      }),
    );
    expect(c.kind).toBe('general');
    expect(c.coverTitle).toBe('FIRE & SPECIAL PERILS');
    expect(c.actLine).toBe(
      'FIRE & SPECIAL PERILS — CERTIFICATE ISSUED UNDER THE INSURANCE ACT, 2021 (ACT 1061)',
    );
    expect(c.numberedItems[0]).toEqual({ label: '1. NAME OF THE INSURED', value: 'AMA BOATENG' });
    const values = c.numberedItems.map((i) => i.value);
    expect(values).toContain('HOUSE 12, DZORWULU, ACCRA');
    expect(values).toContain('GHS 250,000.00');
    expect(c.numberedItems.at(-1)?.value).toBe('FROM 26th November, 2024 TO 25th May, 2025');
    expect(c.clauses[0]?.lines[0]).toBe(
      'THE INSURED IS COVERED SUBJECT TO THE TERMS, CONDITIONS AND EXCEPTIONS OF THE POLICY.',
    );
    expect(JSON.stringify(c)).not.toMatch(/premium/i);
    expect(fact(c, 'DATE OF ISSUE')?.value).toBe('21/11/2024');
  });
});

describe('insuredSubject and policyCode', () => {
  it('describes the vehicle, the trip, the property or the insured', () => {
    expect(insuredSubject(motor, motorAnswers)).toBe('GN 3181-18 · Nissan Rogue');
    expect(
      insuredSubject(travel, {
        full_name: 'Kofi Mensah',
        final_destination: 'Germany',
        cover_start: '2026-12-01',
        cover_end: '2026-12-14',
      }),
    ).toBe('Germany · 1 December 2026 – 14 December 2026');
    const pa = productByFormId('personal-accident')!;
    expect(insuredSubject(pa, { full_name: 'Kofi Mensah' })).toBe('Kofi Mensah');
  });

  it('keeps the motor cover codes', () => {
    expect(policyCode(motor, { cover_type: 'comprehensive' })).toBe('MCO');
    expect(policyCode(motor, { cover_type: 'tpft' })).toBe('MTF');
    expect(policyCode(motor, { cover_type: 'tpo' })).toBe('MTP');
    expect(policyCode(fire, {})).toBe('FIR');
  });
});
