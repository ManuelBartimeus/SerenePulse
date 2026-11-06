// HTTP contract between the customer app (apps/account) and the site Worker (/api/account/*).
// JSON bodies; errors are application/problem+json { title, status, detail?, errors?: FieldError[] }.
// Authentication: an HttpOnly session cookie set by POST /api/account/otp/verify.
import type { Answers, CertificateData, FieldError, SignatureInfo } from './schema';

export type ProposalStatus =
  | 'draft' // the customer is filling it in
  | 'submitted' // signed and sent; instant products move straight on to 'quoted'
  | 'under_review' // an underwriter has opened it
  | 'info_requested' // sent back to the customer with a message; editable again
  | 'quoted' // a price is available and valid until quote.validUntil
  | 'declined'
  | 'paid' // payment confirmed, policy being issued (normally instantaneous)
  | 'issued' // policy and certificate exist
  | 'cancelled' // withdrawn by the customer or staff
  | 'expired'; // the quote lapsed

export interface QuoteLine {
  label: string;
  amount: number; // GH₵, 2 dp; negative for discounts
}

export interface Quote {
  currency: 'GHS';
  /** Premium before taxes. */
  premium: number;
  lines: readonly QuoteLine[]; // how the premium is built up
  taxes: readonly QuoteLine[]; // VAT, NHIL, GETFund (empty for motor)
  total: number; // amount payable
  /** true = computed from indicative rates and subject to underwriting confirmation. */
  indicative: boolean;
  notes: readonly string[];
  /** Set by an underwriter for 'underwriter' products. */
  underwriterNote?: string;
  validUntil: string; // ISO date
  source: 'rating' | 'underwriter';
}

export interface CustomerProfile {
  customerNo: string;
  phone: string; // E.164, +233…
  title?: string;
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  email?: string;
  postalAddress?: string;
  residentialAddress?: string;
  digitalAddress?: string;
  occupation?: string;
  employer?: string;
  idType?: string;
  idNumber?: string;
  nationality?: string;
  tin?: string;
  companyName?: string;
  companyRegNo?: string;
  marketingConsent: boolean;
  createdAt: string;
}

export interface ProposalSummary {
  id: string;
  proposalNo: string;
  productCode: string;
  productName: string;
  status: ProposalStatus;
  /** 0-based index of the step the customer last reached (resume point). */
  currentStep: number;
  quote?: Quote;
  insuredSubject?: string; // e.g. "GN 3181-18 · Nissan Rogue"
  updatedAt: string;
  submittedAt?: string;
  policyId?: string;
}

export interface ProposalFile {
  id: string;
  fieldId: string;
  kind: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface ProposalDetail extends ProposalSummary {
  formId: string;
  formVersion: number;
  answers: Answers;
  files: readonly ProposalFile[];
  signature?: Omit<SignatureInfo, 'imagePng'> & { hasImage: boolean };
  /** Message from the underwriter when status is 'info_requested' or 'declined'. */
  staffMessage?: string;
  /** The proposal's history (sales.proposal_events), oldest first. Staff appear as 'serene', never by name. */
  history?: readonly ProposalHistoryItem[];
}

export interface ProposalHistoryItem {
  at: string;
  /** created, submitted, resubmitted, under_review, quoted, info_requested, declined, cancelled, expired,
   *  payment_started, payment_failed, paid, issued, policy_cancelled */
  event: string;
  fromStatus?: ProposalStatus;
  toStatus?: ProposalStatus;
  /** Shown to the customer: the underwriter's message, the payment reference, the policy number … */
  note?: string;
  by: 'customer' | 'serene' | 'system';
}

export interface Payment {
  reference: string;
  amount: number;
  method: 'momo' | 'card';
  network?: 'mtn' | 'telecel' | 'airteltigo';
  maskedAccount: string; // "024 *** 4567" or "•••• 4242"
  status: 'pending' | 'succeeded' | 'failed';
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PolicySummary {
  id: string;
  policyNo: string;
  certificateNo: string;
  productCode: string;
  productName: string;
  coverTitle: string;
  insuredSubject?: string;
  startsOn: string;
  expiresOn: string;
  status: 'active' | 'expired' | 'cancelled';
  premium: number;
  issuedAt: string;
  proposalId: string;
}

export interface PolicyDetail extends PolicySummary {
  certificate: CertificateData;
  payment: Payment;
  /**
   * GET this (same origin, with the session cookie) for the signature image that was in force when
   * the certificate was issued. Absent: the certificate shows a dotted signature line only.
   */
  signatureUrl?: string;
}

// ---- Requests / responses -------------------------------------------------------------------

/** POST /api/account/otp/start */
export interface OtpStartRequest {
  phone: string; // any Ghana format; normalised to +233
  turnstileToken?: string;
}
export interface OtpStartResponse {
  challengeId: string;
  expiresInSeconds: number; // 300
  resendInSeconds: number; // 30
  maskedPhone: string;
  /** Only while SMS sending is simulated (no SMS provider configured): the code to show on screen. */
  simulatedCode?: string;
}

/** POST /api/account/otp/verify → sets the session cookie. */
export interface OtpVerifyRequest {
  challengeId: string;
  code: string;
}
export interface OtpVerifyResponse {
  profile: CustomerProfile;
  isNew: boolean;
}

// GET    /api/account/me                         → CustomerProfile (401 when signed out)
// PATCH  /api/account/me                         Partial<CustomerProfile> → CustomerProfile
// POST   /api/account/sign-out                   → 204
// GET    /api/account/catalogue                  → { products: Product[]; rates: public subset } (no auth)
// POST   /api/account/quick-quote                QuickQuoteRequest → Quote (no auth; instant products only)
// GET    /api/account/proposals                  → ProposalSummary[]
// POST   /api/account/proposals                  CreateProposalRequest → ProposalDetail
// GET    /api/account/proposals/:id              → ProposalDetail
// PATCH  /api/account/proposals/:id              SaveDraftRequest → ProposalSummary   (draft / info_requested only)
// POST   /api/account/proposals/:id/quote        → Quote  (instant products: price the current answers)
// POST   /api/account/proposals/:id/files        multipart: fieldId, kind, file → ProposalFile
// DELETE /api/account/proposals/:id/files/:fid   → 204
// GET    /api/account/files/:fid                 → the file (owner only)
// POST   /api/account/proposals/:id/submit       SubmitRequest → ProposalDetail (422 with errors[] when invalid)
// POST   /api/account/proposals/:id/cancel       → ProposalSummary
// POST   /api/account/proposals/:id/payments     StartPaymentRequest → Payment (status 'pending')
// GET    /api/account/payments/:ref              → Payment & { policyId?: string }
// POST   /api/account/payments/:ref/simulate     { approve: boolean } → Payment & { policyId?: string }
//                                                (simulated gateway only: stands in for the MoMo prompt / 3-D Secure)
// GET    /api/account/policies                   → PolicySummary[]
// GET    /api/account/policies/:id               → PolicyDetail
// GET    /api/account/proposals/:id/document     → { form, answers, files, signature (with imagePng), meta } for rendering
// GET    /api/verify?certificate=&reg=           → VerifyResponse (public, rate limited)

export interface QuickQuoteRequest {
  productCode: string;
  answers: Answers; // only the fields the rating needs, keyed by form field ids
}

export interface CreateProposalRequest {
  productCode: string;
  /** Answers carried over from a quick quote on the public site. */
  answers?: Answers;
}

export interface SaveDraftRequest {
  answers: Answers;
  currentStep: number;
}

export interface SubmitRequest {
  answers: Answers;
  /** Ids of the global confirmations and the form's own confirmations, all must be present. */
  confirmations: readonly string[];
  signature: SignatureInfo; // imagePng required
  marketingConsent?: boolean;
}

export interface StartPaymentRequest {
  method: 'momo' | 'card';
  network?: 'mtn' | 'telecel' | 'airteltigo';
  /** MoMo number, or card number (simulated gateway only; never stored, only last 4 kept). */
  account: string;
  cardExpiry?: string; // MM/YY
  cardCvc?: string;
  cardName?: string;
}

export interface VerifyResponse {
  found: boolean;
  status?: 'active' | 'expired' | 'cancelled' | 'not_yet_active';
  certificateNo?: string;
  policyNo?: string;
  productName?: string;
  coverTitle?: string;
  insuredSubject?: string; // e.g. registration number
  holderInitials?: string; // "A. I." — never the full name
  startsOn?: string;
  expiresOn?: string;
}

export interface Problem {
  title: string;
  status: number;
  detail?: string;
  errors?: readonly FieldError[];
}

/** Confirmations every proposal adds to the form's own (terms, privacy, e-signature). */
export const GLOBAL_CONFIRMATIONS = [
  {
    id: 'terms',
    label: 'I have read and agree to Serene Insurance’s terms and conditions for buying insurance online.',
  },
  {
    id: 'data_processing',
    label:
      'I consent to Serene Insurance processing the personal data in this proposal, including my ID, to assess and administer my insurance, as described in the privacy notice (Data Protection Act, 2012, Act 843).',
  },
  {
    id: 'electronic_signature',
    label:
      'I agree that my electronic signature below has the same effect as my handwritten signature (Electronic Transactions Act, 2008, Act 772).',
  },
] as const;
