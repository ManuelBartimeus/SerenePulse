// Online claim notification: claim types per product line and the documents each needs.
// Document lists follow Serene's published claims guidance (sereneinsurance.com/sections/pages/claims)
// and Ghanaian market practice (Star Assurance and SIC claim procedures). Serene's claim principle:
// no outstanding claim stays on the books more than one week after the last document is received.
import type { ProductCategory } from './products';

export type ClaimStatus =
  | 'draft' // opened online, documents still being added; not yet sent (POST …/claims/:id/submit sends it)
  | 'received' // notified online, not yet opened by staff
  | 'under_review'
  | 'info_requested' // the customer must add documents or answer a question
  | 'approved' // liability accepted, settlement being prepared
  | 'settled' // paid
  | 'declined'
  | 'withdrawn';

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: 'Not sent yet',
  received: 'Received',
  under_review: 'Being assessed',
  info_requested: 'We need more from you',
  approved: 'Approved',
  settled: 'Paid',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

export interface ClaimDocument {
  kind: string;
  label: string;
  required: boolean;
}

export interface ClaimType {
  id: string;
  label: string;
  hint: string;
  categories: readonly ProductCategory[];
  documents: readonly ClaimDocument[];
}

const doc = (kind: string, label: string, required = true): ClaimDocument => ({ kind, label, required });

export const CLAIM_TYPES: readonly ClaimType[] = [
  {
    id: 'motor_own_damage',
    label: 'Damage to my vehicle',
    hint: 'Accident, fire or attempted theft (comprehensive or fire & theft cover).',
    categories: ['motor'],
    documents: [
      doc('claim_photos', 'Photos of the damage'),
      doc('repair_estimate', 'Repair estimate from a garage'),
      doc('drivers_licence', 'Driver’s licence of the person driving'),
      doc('police_report', 'Police report (if the police attended)', false),
      doc('towing_receipt', 'Towing receipt', false),
    ],
  },
  {
    id: 'motor_theft',
    label: 'My vehicle was stolen',
    hint: 'Theft of the whole vehicle (comprehensive or fire & theft cover).',
    categories: ['motor'],
    documents: [
      doc('police_report', 'Police report'),
      doc('vehicle_registration', 'Vehicle registration document (DVLA)'),
      doc('vehicle_keys', 'Photo of all the vehicle’s keys', false),
    ],
  },
  {
    id: 'motor_third_party_property',
    label: 'Someone else’s property was damaged',
    hint: 'You damaged another vehicle or property. The other party can also claim against your policy.',
    categories: ['motor'],
    documents: [
      doc('claim_photos', 'Photos of the damage'),
      doc('police_report', 'Police report'),
      doc('drivers_licence', 'Driver’s licence of the person driving'),
      doc('repair_estimate', 'The other party’s repair estimate', false),
    ],
  },
  {
    id: 'motor_third_party_injury',
    label: 'Someone was injured or killed',
    hint: 'Injury or death of another person involving your vehicle.',
    categories: ['motor'],
    documents: [
      doc('police_report', 'Police report'),
      doc('medical_report', 'Medical report or death certificate'),
      doc('drivers_licence', 'Driver’s licence of the person driving'),
      doc('medical_bills', 'Medical bills and receipts', false),
    ],
  },
  {
    id: 'property_damage',
    label: 'Fire, flood or other damage to property',
    hint: 'Buildings, contents, stock or machinery.',
    categories: ['property', 'engineering'],
    documents: [
      doc('claim_photos', 'Photos of the damage'),
      doc('loss_schedule', 'List of damaged items with values'),
      doc('fire_service_report', 'Fire service report (for fire)', false),
      doc('repair_estimate', 'Repair or replacement quotations', false),
    ],
  },
  {
    id: 'burglary_theft',
    label: 'Burglary or theft',
    hint: 'Break-in at your home or premises.',
    categories: ['property', 'financial'],
    documents: [
      doc('police_report', 'Police report'),
      doc('loss_schedule', 'List of stolen items with values'),
      doc('claim_photos', 'Photos of the point of entry', false),
      doc('purchase_receipts', 'Receipts or invoices for the items', false),
    ],
  },
  {
    id: 'cash_loss',
    label: 'Loss of money',
    hint: 'Robbery in transit, from a safe or on the premises.',
    categories: ['financial'],
    documents: [
      doc('police_report', 'Police report'),
      doc('cash_records', 'Cash book or bank records for the period'),
    ],
  },
  {
    id: 'personal_injury',
    label: 'Accidental injury or death',
    hint: 'Personal accident, group personal accident or workmen’s compensation.',
    categories: ['accident', 'liability'],
    documents: [
      doc('medical_report', 'Medical report or death certificate'),
      doc('medical_bills', 'Medical bills and receipts', false),
      doc('police_report', 'Police report (for road accidents)', false),
      doc('payslips', 'Payslips or proof of earnings (workmen’s compensation)', false),
    ],
  },
  {
    id: 'travel_medical',
    label: 'Medical emergency while travelling',
    hint: 'Contact the assistance line on your certificate first for hospital admission.',
    categories: ['travel'],
    documents: [
      doc('medical_report', 'Medical report'),
      doc('medical_bills', 'Bills and receipts'),
      doc('travel_documents', 'Passport page with entry stamp, or ticket'),
    ],
  },
  {
    id: 'travel_baggage',
    label: 'Lost or delayed baggage',
    hint: 'Report it to the airline before you leave the airport.',
    categories: ['travel'],
    documents: [
      doc('property_irregularity_report', 'Airline Property Irregularity Report'),
      doc('travel_documents', 'Boarding pass and baggage tag'),
      doc('purchase_receipts', 'Receipts for essential items bought', false),
    ],
  },
  {
    id: 'cargo_loss',
    label: 'Cargo lost or damaged',
    hint: 'Marine cargo or goods in transit.',
    categories: ['marine'],
    documents: [
      doc('commercial_invoice', 'Commercial invoice'),
      doc('bill_of_lading', 'Bill of lading or airway bill', false),
      doc('survey_report', 'Survey or tally report', false),
      doc('claim_photos', 'Photos of the damaged goods', false),
    ],
  },
  {
    id: 'liability_claim',
    label: 'A claim has been made against me',
    hint: 'Public, professional, directors’ or general liability.',
    categories: ['liability', 'financial'],
    documents: [
      doc('claimant_letter', 'The claimant’s letter or writ'),
      doc('incident_report', 'Your account of what happened', false),
    ],
  },
  {
    id: 'other',
    label: 'Something else',
    hint: 'Describe what happened and we will tell you what we need.',
    categories: [
      'motor',
      'property',
      'travel',
      'accident',
      'liability',
      'financial',
      'engineering',
      'marine',
      'bonds',
    ],
    documents: [doc('supporting_documents', 'Any supporting documents', false)],
  },
];

export const claimTypesFor = (category: ProductCategory): ClaimType[] =>
  CLAIM_TYPES.filter((t) => t.categories.includes(category));

export interface ClaimSummary {
  id: string;
  claimNo: string; // CLM-26-000123
  policyId: string;
  policyNo: string;
  productName: string;
  claimType: string;
  status: ClaimStatus;
  incidentDate: string;
  reportedAt: string;
  updatedAt: string;
  staffMessage?: string;
}

export interface ClaimDetail extends ClaimSummary {
  incidentLocation: string;
  description: string;
  estimatedAmount?: number;
  /** Third-party claims: the other party's name and phone. */
  thirdParty?: { name?: string; phone?: string; vehicleReg?: string };
  files: readonly { id: string; kind: string; name: string; mime: string; size: number; createdAt: string }[];
  events: readonly { at: string; status: ClaimStatus; note?: string }[];
}

/** POST /api/account/policies/:id/claims → ClaimDetail (files are added afterwards). */
export interface CreateClaimRequest {
  claimType: string;
  incidentDate: string; // ISO date, not in the future, not before the policy started
  incidentLocation: string;
  description: string; // 20–5000 characters
  estimatedAmount?: number;
  thirdParty?: { name?: string; phone?: string; vehicleReg?: string };
}
// GET    /api/account/claims                         → ClaimSummary[]
// GET    /api/account/claims/:id                     → ClaimDetail
// POST   /api/account/claims/:id/files               multipart: kind, file → file
// POST   /api/account/claims/:id/submit              → ClaimDetail (status received; checks required documents)
// POST   /api/account/claims/:id/respond             { message } → ClaimDetail (when info_requested)
// POST   /api/account/policies/:id/renew             → ProposalDetail (new draft, answers copied, dates moved on)
