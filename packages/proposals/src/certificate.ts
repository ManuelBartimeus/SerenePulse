// Builds the certificate-of-insurance content from a product, its answers and the issued numbers.
// The motor layout copies Serene's statutory motor certificate (Motor Vehicles (Third Party
// Insurance) Act, 1958); every other product uses the same frame with general items.
import { formById } from './forms';
import type { Product } from './products';
import { certDate, clockTime, money, optionLabel, scalarText, slashDate, toNumber } from './render/format';
import type {
  AnswerValue,
  Answers,
  CertificateData,
  Field,
  FieldRole,
  FormDefinition,
  TableField,
  TableRow,
} from './schema';
import { allFields, evaluate } from './validate';

export interface CertificateInput {
  product: Product;
  answers: Answers;
  policyNo: string;
  certificateNo: string;
  customerNo: string;
  policyHolder: string;
  startsOn: string; // ISO date
  expiresOn: string; // ISO date
  issuedAt: string; // ISO timestamp
  tppdLimit: number; // GH₵ (motor)
  verifyUrl?: string;
}

const SIGNATORY = 'CHIEF EXECUTIVE OFFICER';

// ---------------------------------------------------------------------------------------------
// Field lookup by role (works for any digitised form)

function formFields(def: FormDefinition | undefined): Field[] {
  if (!def) return [];
  return [...allFields(def).map((x) => x.field), ...(def.declaration.fields ?? [])];
}

/** Visible fields with this role, in form order. */
function fieldsWithRole(def: FormDefinition | undefined, answers: Answers, role: FieldRole): Field[] {
  if (!def) return [];
  const out: Field[] = [];
  for (const step of def.steps)
    for (const section of step.sections) {
      if (!evaluate(section.showIf, answers)) continue;
      for (const f of section.fields) if (f.role === role && evaluate(f.showIf, answers)) out.push(f);
    }
  for (const f of def.declaration.fields ?? [])
    if (f.role === role && evaluate(f.showIf, answers)) out.push(f);
  return out;
}

const str = (v: AnswerValue | undefined): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

function roleText(def: FormDefinition | undefined, answers: Answers, role: FieldRole): string {
  for (const f of fieldsWithRole(def, answers, role)) {
    const t = scalarText(f, answers).trim();
    if (t) return t;
  }
  return '';
}

function insuredName(def: FormDefinition | undefined, answers: Answers): string {
  return (
    roleText(def, answers, 'insuredName') ||
    str(answers.company_name) ||
    str(answers.full_name) ||
    str(answers.name_of_proposer) ||
    str(answers.proposer_name)
  );
}

/** Best guess at the address of the risk when no field carries the riskAddress role. */
function riskAddress(def: FormDefinition | undefined, answers: Answers): string {
  const byRole = roleText(def, answers, 'riskAddress');
  if (byRole) return byRole;
  const candidates = formFields(def).filter(
    (f) =>
      (f.type === 'text' || f.type === 'textarea') &&
      /situation|location|premises|site|risk_address|property_address/.test(f.id),
  );
  for (const f of candidates) {
    const t = str(answers[f.id]);
    if (t) return t;
  }
  return '';
}

function firstVehicle(
  def: FormDefinition | undefined,
  answers: Answers,
): { row: TableRow; field: TableField | undefined } {
  const field = formFields(def).find((f): f is TableField => f.type === 'table' && f.role === 'vehicles');
  const rows = answers[field?.id ?? 'vehicles'];
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as TableRow) : {};
  return { row, field };
}

function cell(row: TableRow, field: TableField | undefined, col: string): string {
  const v = row[col];
  if (v === null || v === undefined || v === '') return '';
  const column = field?.columns.find((c) => c.id === col);
  return column?.options ? optionLabel(column.options, v) : String(v);
}

// ---------------------------------------------------------------------------------------------
// Public helpers

/** Short description of what is insured, e.g. "GN 3181-18 · Nissan Rogue" or the property address. */
export function insuredSubject(product: Product, answers: Answers): string {
  const def = formById(product.formId);
  if (product.certificate === 'motor' || product.category === 'motor') {
    const { row, field } = firstVehicle(def, answers);
    const reg = cell(row, field, 'reg_no').toUpperCase();
    const vehicle = [cell(row, field, 'make'), cell(row, field, 'model')].filter(Boolean).join(' ');
    const s = [reg, vehicle].filter(Boolean).join(' · ');
    if (s) return s;
  }
  if (product.category === 'travel') {
    const destination =
      str(answers.final_destination) ||
      roleText(def, answers, 'travelDestination') ||
      str(answers.destination);
    const start = roleText(def, answers, 'coverStart');
    const end = roleText(def, answers, 'coverEnd');
    const dates = start && end ? `${start} – ${end}` : start;
    const s = [destination, dates].filter(Boolean).join(' · ');
    if (s) return s;
  }
  if (product.category === 'property') {
    const addr = riskAddress(def, answers);
    if (addr) return addr.replace(/\s*\n\s*/g, ', ');
  }
  return insuredName(def, answers);
}

/** Product code used inside policy numbers; motor depends on the cover type (MTP / MTF / MCO). */
export function policyCode(product: Product, answers: Answers): string {
  if (product.code !== 'MTR') return product.code;
  return answers.cover_type === 'comprehensive' ? 'MCO' : answers.cover_type === 'tpft' ? 'MTF' : 'MTP';
}

// ---------------------------------------------------------------------------------------------
// Motor

type UseClass =
  'private' | 'taxi' | 'hiring' | 'own_goods' | 'general_cartage' | 'passenger_bus' | 'motorcycle' | 'other';

const USE_CLASSES: readonly UseClass[] = [
  'private',
  'taxi',
  'hiring',
  'own_goods',
  'general_cartage',
  'passenger_bus',
  'motorcycle',
];

const PROVISO =
  'Provided that the person driving is permitted in accordance with the licensing or other laws or regulations to drive the Motor Vehicle or has been so permitted and is not disqualified by order of a Court of Law or by reason of any enactment or regulation in that behalf from driving such Motor Vehicle.';

const NOT_COVERED = {
  hire: 'Use for the conveyance of passengers for hire or for reward.',
  racing: 'Use for racing, pace-making, reliability trial or speed-testing.',
  trailer:
    'Use whilst drawing a trailer except the towing (other than for reward) of any one disabled mechanically propelled vehicle.',
  goodsForHire: 'Use for the carriage of goods for hire or reward.',
  overload: 'Use for the carriage of more passengers than the licensed seating capacity of the vehicle.',
};

function lettered(lines: readonly string[], style: 'a)' | 'a.'): string[] {
  return lines.map((l, i) => `${String.fromCharCode(97 + i)}${style === 'a)' ? ')' : '.'} ${l}`);
}
const numbered = (lines: readonly string[]): string[] => lines.map((l, i) => `${i + 1}. ${l}`);

interface UseWording {
  heading: string;
  drivers: string[];
  use: string[];
  notCovered: string[];
}

function useWording(cls: UseClass, otherText: string): UseWording {
  const commercialDrivers = lettered(
    [
      'The Policy holder.',
      "Any person who is driving on the Policy holder's order or with his permission, including any driver in the Policy holder's employ.",
    ],
    'a)',
  ).concat(PROVISO);
  switch (cls) {
    case 'private':
      return {
        heading: 'PRIVATE INDIVIDUAL',
        drivers: lettered(
          [
            'The Policy holder. The Policy holder may also drive a motor car not belonging to him and not hired to him under a hire-purchase agreement.',
            "Any person who is driving on the Policy holder's order or with his permission.",
          ],
          'a)',
        ).concat(PROVISO),
        use: numbered([
          "Use for carriage of the Insured's own goods or in connection with the Policy holder's business or trade.",
          'Whilst the vehicle is being so used, the carriage of passengers (other than for hire or reward) is permitted.',
          'Use only for social, domestic and pleasure purposes.',
        ]),
        notCovered: lettered([NOT_COVERED.hire, NOT_COVERED.racing, NOT_COVERED.trailer], 'a.'),
      };
    case 'motorcycle':
      return {
        heading: 'MOTOR CYCLE',
        drivers: lettered(
          [
            'The Policy holder.',
            "Any person who is riding on the Policy holder's order or with his permission.",
          ],
          'a)',
        ).concat(PROVISO),
        use: numbered([
          "Use for social, domestic and pleasure purposes and in connection with the Policy holder's business.",
          'The carriage of one pillion passenger (other than for hire or reward) is permitted.',
        ]),
        notCovered: lettered([NOT_COVERED.hire, NOT_COVERED.goodsForHire, NOT_COVERED.racing], 'a.'),
      };
    case 'taxi':
      return {
        heading: 'TAXI',
        drivers: commercialDrivers,
        use: numbered([
          'Use for the carriage of passengers for hire or reward as a licensed taxi.',
          "Use for social, domestic and pleasure purposes and for the Policy holder's business.",
        ]),
        notCovered: lettered([NOT_COVERED.overload, NOT_COVERED.racing, NOT_COVERED.trailer], 'a.'),
      };
    case 'hiring':
      return {
        heading: 'HIRING / RENTAL CAR',
        drivers: commercialDrivers,
        use: numbered([
          'Use for hiring out, with or without a driver, and for the carriage of passengers for hire or reward under a hiring agreement or through a ride-hailing service.',
          "Use for social, domestic and pleasure purposes and for the Policy holder's business.",
        ]),
        notCovered: lettered([NOT_COVERED.overload, NOT_COVERED.racing, NOT_COVERED.trailer], 'a.'),
      };
    case 'own_goods':
      return {
        heading: 'OWN GOODS (Z.300)',
        drivers: commercialDrivers,
        use: numbered([
          "Use for the carriage of the Policy holder's own goods in connection with the Policy holder's business or trade.",
          'Whilst the vehicle is being so used, the carriage of passengers (other than for hire or reward) is permitted.',
        ]),
        notCovered: lettered(
          [NOT_COVERED.goodsForHire, NOT_COVERED.hire, NOT_COVERED.racing, NOT_COVERED.trailer],
          'a.',
        ),
      };
    case 'general_cartage':
      return {
        heading: 'GENERAL CARTAGE (Z.301)',
        drivers: commercialDrivers,
        use: numbered([
          "Use for the carriage of goods for hire or reward (general cartage) and in connection with the Policy holder's business.",
          "Whilst the vehicle is being so used, the carriage of the owner's or consignee's attendants is permitted.",
        ]),
        notCovered: lettered([NOT_COVERED.hire, NOT_COVERED.racing, NOT_COVERED.trailer], 'a.'),
      };
    case 'passenger_bus':
      return {
        heading: 'PASSENGER BUS',
        drivers: commercialDrivers,
        use: numbered([
          'Use for the carriage of fare-paying passengers and their luggage for hire or reward.',
          "Use in connection with the Policy holder's business.",
        ]),
        notCovered: lettered([NOT_COVERED.overload, NOT_COVERED.racing, NOT_COVERED.trailer], 'a.'),
      };
    case 'other':
      return {
        heading: (otherText || 'AS PER POLICY SCHEDULE').toUpperCase(),
        drivers: commercialDrivers,
        use: numbered(['Use only for the purposes stated in the proposal form and the Policy schedule.']),
        notCovered: lettered([NOT_COVERED.racing, NOT_COVERED.trailer], 'a.'),
      };
  }
}

const COVER_NAMES: Record<string, { title: string; act: string }> = {
  tpo: { title: 'MOTOR THIRD PARTY ONLY', act: 'THIRD PARTY ONLY' },
  tpft: { title: 'THIRD PARTY, FIRE & THEFT', act: 'THIRD PARTY, FIRE & THEFT' },
  comprehensive: { title: 'COMPREHENSIVE', act: 'COMPREHENSIVE' },
};

/** Brown card (ECOWAS) answers, whatever the form calls them. */
function hasBrownCard(answers: Answers): boolean {
  return Object.entries(answers).some(
    ([k, v]) =>
      /brown_card|ecowas/.test(k) && (v === true || v === 'yes' || (Array.isArray(v) && v.length > 0)),
  );
}

function buildMotor(input: CertificateInput, def: FormDefinition | undefined): CertificateData {
  const { answers } = input;
  const coverKey =
    typeof answers.cover_type === 'string' && answers.cover_type in COVER_NAMES ? answers.cover_type : 'tpo';
  const cover = COVER_NAMES[coverKey] ?? { title: 'MOTOR THIRD PARTY ONLY', act: 'THIRD PARTY ONLY' };

  const useField = formFields(def).find((f) => f.role === 'vehicleUse');
  const useValue = str(answers[useField?.id ?? 'vehicle_use']);
  const cls: UseClass = (USE_CLASSES as readonly string[]).includes(useValue)
    ? (useValue as UseClass)
    : 'other';
  const otherText = str(answers[`${useField?.id ?? 'vehicle_use'}__other`]);
  const wording = useWording(cls, otherText);

  const { row, field } = firstVehicle(def, answers);
  const reg = cell(row, field, 'reg_no').toUpperCase() || 'TBA';
  const make =
    [cell(row, field, 'make'), cell(row, field, 'model')].filter(Boolean).join(' ').toUpperCase() || 'TBA';
  const seats = cell(row, field, 'seating_capacity') || 'TBA';
  const chassis = (str(answers.chassis_no) || cell(row, field, 'chassis_no')).toUpperCase() || 'TBA';

  let increase = 0;
  for (const f of fieldsWithRole(def, answers, 'tppdIncrease')) increase += toNumber(answers[f.id]) ?? 0;
  const tppd = input.tppdLimit + increase;

  const comprehensiveLike = coverKey !== 'tpo';

  return {
    kind: 'motor',
    actLine: `MOTOR ${cover.act} INSURANCE ACT 1958 (GHANA)`,
    coverTitle: cover.title,
    certificateNo: input.certificateNo,
    policyNo: input.policyNo,
    customerNo: input.customerNo,
    policyHolder: input.policyHolder,
    numberedItems: [
      { label: '1. INDEX MARK AND REGISTRATION OF VEHICLE', value: reg },
      { label: '2. NAME OF POLICY HOLDER', value: input.policyHolder.toUpperCase() },
      {
        label: '3. EFFECTIVE DATE OF THE COMMENCEMENT OF INSURANCE FOR THE PURPOSE OF STATUTE(S)',
        value: certDate(input.startsOn),
      },
      { label: '4. DATE OF EXPIRY OF INSURANCE', value: certDate(input.expiresOn) },
    ],
    clauses: [
      { label: '5. PERSONS OR CLASSES OF PERSONS ENTITLED TO DRIVE', lines: wording.drivers },
      { label: '6. LIMITATION AS TO USE', value: wording.heading, lines: wording.use },
      { label: '7. THE POLICY DOES NOT COVER:', lines: wording.notCovered },
    ],
    facts: [
      { label: 'CHASSIS NO', value: chassis },
      { label: 'VEHICLE SEATING CAPACITY', value: seats },
      { label: 'VEHICLE MAKE', value: make },
      { label: 'GEOGRAPHICAL AREA', value: hasBrownCard(answers) ? 'GHANA & ECOWAS (BROWN CARD)' : 'GHANA' },
      { label: 'T.P.P.D LIMIT', value: money(tppd) },
      comprehensiveLike
        ? { label: 'EXCESS', value: 'AS PER POLICY SCHEDULE' }
        : { label: 'EXCESS NOT APPLICABLE', value: '' },
      { label: 'DATE OF ISSUE', value: slashDate(input.issuedAt) },
      { label: 'TIME OF ISSUE', value: clockTime(input.issuedAt) },
    ],
    effectiveDate: input.startsOn,
    expiryDate: input.expiresOn,
    issuedAt: input.issuedAt,
    footnote:
      '* Limitations rendered imperative by the provisions of the Motor Vehicles (Third Party Insurance) Act 1958 (Ghana) are not to be included under this heading.',
    certifyText: `* I/WE HEREBY CERTIFY that the policy to which this certificate relates is issued in accordance with the provisions of the Motor Vehicles (Third Party Insurance) Act 1958 (Ghana).\nFor and on behalf of Serene Insurance`,
    signatoryTitle: SIGNATORY,
    ...(input.verifyUrl ? { verifyUrl: input.verifyUrl } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// General (every other product)

function travellerNames(def: FormDefinition | undefined, answers: Answers, holder: string): string[] {
  const names = [holder];
  for (const f of fieldsWithRole(def, answers, 'travelers')) {
    if (f.type !== 'table') continue;
    const rows = answers[f.id];
    if (!Array.isArray(rows)) continue;
    const nameCol = f.columns.find((c) => /name/.test(c.id));
    if (!nameCol) continue;
    for (const r of rows as readonly TableRow[]) {
      const n = r[nameCol.id];
      if (typeof n === 'string' && n.trim()) names.push(n.trim());
    }
  }
  return names;
}

function buildGeneral(input: CertificateInput, def: FormDefinition | undefined): CertificateData {
  const { product, answers } = input;
  const name = product.name.toUpperCase();
  const items: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => items.push({ label: `${items.length + 1}. ${label}`, value });

  add('NAME OF THE INSURED', input.policyHolder.toUpperCase());
  if (product.category === 'travel') {
    const names = travellerNames(def, answers, input.policyHolder);
    if (names.length > 1) add('INSURED PERSONS', names.join(', ').toUpperCase());
    const destination = str(answers.final_destination) || str(answers.destination);
    if (destination) add('DESTINATION', destination.toUpperCase());
    const zone = roleText(def, answers, 'travelDestination');
    if (zone) add('AREA OF COVER', zone.toUpperCase());
  } else {
    const address = riskAddress(def, answers);
    if (address) add('SITUATION OF RISK', address.replace(/\s*\n\s*/g, ', ').toUpperCase());
    else {
      const subject = insuredSubject(product, answers);
      if (subject && subject.toUpperCase() !== input.policyHolder.toUpperCase())
        add('SUBJECT OF INSURANCE', subject.toUpperCase());
    }
  }
  const cover = roleText(def, answers, 'coverType');
  if (cover) add('COVER', cover.toUpperCase());
  const sumFields = fieldsWithRole(def, answers, 'sumInsured');
  for (const f of sumFields) {
    const t = scalarText(f, answers);
    if (t) add(sumFields.length > 1 ? (f.docLabel ?? f.label).toUpperCase() : 'SUM INSURED', t);
  }
  add('PERIOD OF INSURANCE', `FROM ${certDate(input.startsOn)} TO ${certDate(input.expiresOn)}`);

  const n = items.length;
  return {
    kind: 'general',
    actLine: `${name} — CERTIFICATE ISSUED UNDER THE INSURANCE ACT, 2021 (ACT 1061)`,
    coverTitle: name,
    certificateNo: input.certificateNo,
    policyNo: input.policyNo,
    customerNo: input.customerNo,
    policyHolder: input.policyHolder,
    numberedItems: items,
    clauses: [
      {
        label: `${n + 1}. COVER`,
        lines: ['THE INSURED IS COVERED SUBJECT TO THE TERMS, CONDITIONS AND EXCEPTIONS OF THE POLICY.'],
      },
      {
        label: `${n + 2}. BASIS OF CONTRACT`,
        lines: [
          'THE PROPOSAL FORM AND DECLARATION SIGNED BY THE INSURED ARE THE BASIS OF THE CONTRACT AND ARE INCORPORATED IN THE POLICY.',
        ],
      },
    ],
    facts: [
      { label: 'DATE OF ISSUE', value: slashDate(input.issuedAt) },
      { label: 'TIME OF ISSUE', value: clockTime(input.issuedAt) },
    ],
    effectiveDate: input.startsOn,
    expiryDate: input.expiresOn,
    issuedAt: input.issuedAt,
    certifyText:
      '* I/WE HEREBY CERTIFY that a policy of insurance has been issued to the Insured named above in accordance with the Insurance Act, 2021 (Act 1061), and is in force for the period stated, subject to its terms, conditions and exceptions.\nFor and on behalf of Serene Insurance',
    signatoryTitle: SIGNATORY,
    ...(input.verifyUrl ? { verifyUrl: input.verifyUrl } : {}),
  };
}

export function buildCertificate(input: CertificateInput): CertificateData {
  const def = formById(input.product.formId);
  return input.product.certificate === 'motor' ? buildMotor(input, def) : buildGeneral(input, def);
}
