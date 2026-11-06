// Claim types and the documents each needs online: CLAIM_TYPES in packages/proposals/src/claims.ts
// (snapshot 2026-11-06). `paper` is the fuller list Serene publishes for each line at
// sereneinsurance.com/sections/pages/claims (fetched 2026-11-06), which a branch may still ask for.

export const CLAIM_TYPES = [
  {
    id: 'motor_own_damage',
    label: 'Damage to my vehicle',
    hint: 'Accident, fire or attempted theft (comprehensive or fire & theft cover).',
    line: 'Motor',
    documents: [
      ['Photos of the damage', true],
      ['Repair estimate from a garage', true],
      ['Driver’s licence of the person driving', true],
      ['Police report (if the police attended)', false],
      ['Towing receipt', false],
    ],
  },
  {
    id: 'motor_theft',
    label: 'My vehicle was stolen',
    hint: 'Theft of the whole vehicle (comprehensive or fire & theft cover).',
    line: 'Motor',
    documents: [
      ['Police report', true],
      ['Vehicle registration document (DVLA)', true],
      ['Photo of all the vehicle’s keys', false],
    ],
  },
  {
    id: 'motor_third_party_property',
    label: 'Someone else’s property was damaged',
    hint: 'You damaged another vehicle or property. The other party can also claim against your policy.',
    line: 'Motor',
    documents: [
      ['Photos of the damage', true],
      ['Police report', true],
      ['Driver’s licence of the person driving', true],
      ['The other party’s repair estimate', false],
    ],
  },
  {
    id: 'motor_third_party_injury',
    label: 'Someone was injured or killed',
    hint: 'Injury or death of another person involving your vehicle.',
    line: 'Motor',
    documents: [
      ['Police report', true],
      ['Medical report or death certificate', true],
      ['Driver’s licence of the person driving', true],
      ['Medical bills and receipts', false],
    ],
  },
  {
    id: 'property_damage',
    label: 'Fire, flood or other damage to property',
    hint: 'Buildings, contents, stock or machinery.',
    line: 'Property and engineering',
    documents: [
      ['Photos of the damage', true],
      ['List of damaged items with values', true],
      ['Fire service report (for fire)', false],
      ['Repair or replacement quotations', false],
    ],
  },
  {
    id: 'burglary_theft',
    label: 'Burglary or theft',
    hint: 'Break-in at your home or premises.',
    line: 'Property',
    documents: [
      ['Police report', true],
      ['List of stolen items with values', true],
      ['Photos of the point of entry', false],
      ['Receipts or invoices for the items', false],
    ],
  },
  {
    id: 'cash_loss',
    label: 'Loss of money',
    hint: 'Robbery in transit, from a safe or on the premises.',
    line: 'Money and financial lines',
    documents: [
      ['Police report', true],
      ['Cash book or bank records for the period', true],
    ],
  },
  {
    id: 'personal_injury',
    label: 'Accidental injury or death',
    hint: 'Personal accident, group personal accident or workmen’s compensation.',
    line: 'Accident and workmen’s compensation',
    documents: [
      ['Medical report or death certificate', true],
      ['Medical bills and receipts', false],
      ['Police report (for road accidents)', false],
      ['Payslips or proof of earnings (workmen’s compensation)', false],
    ],
  },
  {
    id: 'travel_medical',
    label: 'Medical emergency while travelling',
    hint: 'Contact the assistance line on your certificate first for hospital admission.',
    line: 'Travel',
    documents: [
      ['Medical report', true],
      ['Bills and receipts', true],
      ['Passport page with entry stamp, or ticket', true],
    ],
  },
  {
    id: 'travel_baggage',
    label: 'Lost or delayed baggage',
    hint: 'Report it to the airline before you leave the airport.',
    line: 'Travel',
    documents: [
      ['Airline Property Irregularity Report', true],
      ['Boarding pass and baggage tag', true],
      ['Receipts for essential items bought', false],
    ],
  },
  {
    id: 'cargo_loss',
    label: 'Cargo lost or damaged',
    hint: 'Marine cargo or goods in transit.',
    line: 'Marine and transit',
    documents: [
      ['Commercial invoice', true],
      ['Bill of lading or airway bill', false],
      ['Survey or tally report', false],
      ['Photos of the damaged goods', false],
    ],
  },
  {
    id: 'liability_claim',
    label: 'A claim has been made against me',
    hint: 'Public, professional, directors’ or general liability.',
    line: 'Liability',
    documents: [
      ['The claimant’s letter or writ', true],
      ['Your account of what happened', false],
    ],
  },
  {
    id: 'other',
    label: 'Something else',
    hint: 'Describe what happened and we will tell you what we need.',
    line: 'Any policy',
    documents: [['Any supporting documents', false]],
  },
];

/** Serene's published claims checklist (paper claim form route). Source: /sections/pages/claims. */
export const PAPER_LISTS = [
  [
    'Motor: partial loss',
    [
      'Fully completed and signed claim form',
      'Detailed estimate of repairs from a garage',
      'Receipt for towage, if needed',
      'Photographs of the damaged vehicle',
      'Driver’s licence',
    ],
  ],
  [
    'Motor: total loss',
    [
      'Fully completed and signed claim form',
      'Original purchase receipt or invoice',
      'Original vehicle licence (roadworthy)',
      'Original certificate of insurance',
      'Car keys in duplicate',
      'Interim and final police report, for theft',
      'Driver’s licence',
    ],
  ],
  [
    'Motor: third-party injury or death',
    [
      'Fully completed and signed claim form',
      'Police report',
      'Medical report (injury)',
      'Driver’s licence',
      'Affidavit',
      'Two passport pictures of the injured person endorsed by the treating doctor (for death, of the administrators)',
      'Death certificate or burial permit (death)',
      'Letters of administration (death)',
    ],
  ],
  [
    'Motor: third-party property damage',
    [
      'Fully completed and signed claim form',
      'Police report',
      'Third party’s claim letter with repair estimate',
      'Driver’s licence',
    ],
  ],
  [
    'Fire: material damage',
    [
      'Fully completed claim form',
      'Estimate of loss',
      'Loss adjuster’s report',
      'Purchase receipts or invoices of items lost',
      'Stock taken before and after the loss',
    ],
  ],
  ['Fire: consequential loss', ['Fully completed claim form', 'Description of the loss']],
  [
    'Burglary',
    [
      'Fully completed claim form',
      'Police report (tell the police immediately)',
      'Purchase receipts or invoices of stolen items',
      'Stock taken before and after the loss',
    ],
  ],
  [
    'Money (in transit and in safe)',
    ['Fully completed claim form', 'Police report', 'Evidence of loss', 'Statement of the amount lost'],
  ],
  [
    'Goods in transit',
    [
      'Fully completed claim form',
      'Police report',
      'Waybill, delivery note and debit note',
      'Statement of the amount lost',
      'Correspondence between the consignee and the transporter',
    ],
  ],
  [
    'Fidelity guarantee',
    [
      'Fully completed claim form',
      'Police report',
      'Statement of the amount lost',
      'Statements from at least two witnesses',
      'Court proceedings or judgement',
    ],
  ],
  [
    'Public liability',
    [
      'Fully completed claim form',
      'Statement of the amount lost',
      'Replacement invoice',
      'Claim letter from the affected third party',
      'Survey report',
    ],
  ],
  [
    'Workmen’s compensation and group personal accident: injury',
    [
      'Fully completed claim form',
      'Medical bills',
      'Doctor’s report on any permanent disability',
      'Excuse duty and discharge certificate',
      'Six payslips from before the accident',
    ],
  ],
  [
    'Workmen’s compensation and group personal accident: death',
    [
      'Fully completed claim form',
      'Death or burial certificate',
      'Payslips showing the salary for the months before death',
      'Post-mortem report',
      'Medical bill',
    ],
  ],
  [
    'Contractors’ all risks',
    [
      'Fully completed claim form',
      'Repair estimate',
      'Statements from two or three witnesses',
      'Survey report',
      'Police report, for theft',
      'Purchase receipts or replacement invoices for stolen items',
    ],
  ],
  [
    'Marine cargo',
    [
      'Original certificate of insurance',
      'Original bill of lading',
      'Original supplier’s invoice',
      'Original short-landing or discrepancy certificate',
    ],
  ],
];

/** Claim types grouped for the claims page; each group's id is a link target (/claims/#motor). */
export const CLAIM_GROUPS = [
  {
    id: 'motor',
    title: 'Motor',
    types: ['motor_own_damage', 'motor_theft', 'motor_third_party_property', 'motor_third_party_injury'],
  },
  { id: 'property', title: 'Home, property and engineering', types: ['property_damage', 'burglary_theft'] },
  { id: 'travel', title: 'Travel', types: ['travel_medical', 'travel_baggage'] },
  { id: 'accident', title: 'Injury and death', types: ['personal_injury'] },
  { id: 'financial', title: 'Money and fraud', types: ['cash_loss'] },
  { id: 'marine', title: 'Cargo and goods in transit', types: ['cargo_loss'] },
  { id: 'liability', title: 'A claim made against you', types: ['liability_claim'] },
  { id: 'other', title: 'Anything else, including marine hull and bonds', types: ['other'] },
];

/** The claims-page section for a product (its first claim type decides). */
export const claimAnchor = (product) =>
  CLAIM_GROUPS.find((g) => g.types.includes(product.claimTypes[0]))?.id ?? 'other';
