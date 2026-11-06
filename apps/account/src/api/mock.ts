// In-browser stand-in for /api/account/* (VITE_MOCK_API=1, `vite dev` only; never bundled in
// production because client.ts only imports it behind a build-time constant).
//
// Behaviour:
//   * Any Ghana mobile number signs in with code 123456 (shown via `simulatedCode`).
//   * Numbers ending in 1111 are new customers with no history; any other number is a returning
//     customer with a policy and proposals in several states.
//   * MoMo numbers ending 0000 and card 4000 0000 0000 0002 are declined (as on the real gateway).
// State lives in sessionStorage so a reload keeps it; uploaded file bytes live in memory only.
import {
  CLAIM_TYPES,
  formById,
  type ClaimDetail,
  type CreateClaimRequest,
  productByCode,
  type Answers,
  type CertificateData,
  type CreateProposalRequest,
  type CustomerProfile,
  type Payment,
  type PolicyDetail,
  type ProposalDetail,
  type ProposalFile,
  type ProposalStatus,
  type ProposalSummary,
  type Quote,
  type QuoteLine,
  type SaveDraftRequest,
  type StartPaymentRequest,
  type SubmitRequest,
} from '@serene/proposals';
import { ApiError, mockFileUrls, notifyUnauthorised, type Method } from './client';
import type { ProposalEvent } from './types';

const KEY = 'serene.mock.v1';
const CODE = '123456';

interface MockProposal extends ProposalDetail {
  events: ProposalEvent[];
  createdAt: string;
}
interface MockPayment extends Payment {
  proposalId: string;
  policyId?: string;
}
interface State {
  signedIn: boolean;
  phone?: string;
  profile?: CustomerProfile;
  proposals: MockProposal[];
  payments: MockPayment[];
  policies: PolicyDetail[];
  claims?: ClaimDetail[];
  challenges: Record<string, { phone: string; expires: number }>;
  seq: number;
}

const empty = (): State => ({
  signedIn: false,
  proposals: [],
  payments: [],
  policies: [],
  challenges: {},
  seq: 123,
});

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* ignore */
  }
  return empty();
}
let state = load();
const save = (): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => wait(180 + Math.random() * 320);
const now = () => new Date().toISOString();
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const rid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 12)}`;

function problem(status: number, title: string, detail?: string, errors?: ProposalDetail['answers']): never {
  void errors;
  throw new ApiError(status, { title, status, ...(detail ? { detail } : {}) });
}

function requireAuth(): CustomerProfile {
  if (!state.signedIn || !state.profile) {
    notifyUnauthorised();
    problem(401, 'Signed out', 'Please sign in again.');
  }
  return state.profile;
}

const summary = (p: MockProposal): ProposalSummary => {
  const {
    formId: _f,
    formVersion: _v,
    answers: _a,
    files: _fi,
    signature: _s,
    staffMessage: _m,
    events: _e,
    createdAt: _c,
    ...rest
  } = p;
  return rest;
};

const nextProposalNo = () => `PRP-26-${String(++state.seq).padStart(6, '0')}`;

// ---- Pricing (indicative, for screenshots only; the Worker uses rating.ts) ----------------------

const TPO: Record<string, number> = {
  private: 557,
  motorcycle: 331,
  taxi: 744,
  hiring: 744,
  own_goods: 761,
  general_cartage: 893,
  passenger_bus: 919,
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function mockQuote(productCode: string, a: Answers): Quote | null {
  const validUntil = day(30);
  if (productCode === 'MTR') {
    const use = typeof a.vehicle_use === 'string' ? a.vehicle_use : null;
    const cover = typeof a.cover_type === 'string' ? a.cover_type : null;
    if (!use || !cover) return null;
    const base = TPO[use] ?? 744;
    const vehicles = Array.isArray(a.vehicles) ? (a.vehicles as Record<string, unknown>[]) : [];
    const value = Number(vehicles[0]?.estimated_value ?? 0);
    const seats = Number(vehicles[0]?.seating_capacity ?? 5);
    const lines: QuoteLine[] = [];
    let premium = base;
    if (cover === 'tpo') lines.push({ label: 'Third party only, minimum premium', amount: base });
    else {
      const rate = cover === 'comprehensive' ? 0.05 : 0.025;
      premium = Math.max(base, value * rate);
      lines.push({
        label:
          cover === 'comprehensive'
            ? `Comprehensive, 5% of ${value.toLocaleString('en-GB')}`
            : `Fire & theft, 2.5% of value`,
        amount: round2(premium),
      });
    }
    if (seats > 5) {
      const extra = (seats - 5) * (use === 'private' ? 15 : 25);
      lines.push({ label: `Extra seats (${seats - 5})`, amount: extra });
      premium += extra;
    }
    if (a.tppd_increase === 'yes' && Number(a.tppd_increase_amount) > 0) {
      const extra = round2(Number(a.tppd_increase_amount) * 0.01);
      lines.push({ label: 'Higher third-party property damage limit', amount: extra });
      premium += extra;
    }
    if (a.ncd_entitled === 'yes' && cover !== 'tpo') {
      const disc = -round2(premium * 0.1);
      lines.push({ label: 'No claim discount (10%)', amount: disc });
      premium += disc;
    }
    premium = round2(premium);
    return {
      currency: 'GHS',
      premium,
      lines,
      taxes: [],
      total: premium,
      indicative: cover !== 'tpo',
      notes: ['Motor premiums are exempt from VAT.', 'ECOWAS Brown Card included.'],
      validUntil,
      source: 'rating',
    };
  }
  const sumRole = Number(a.sum_insured ?? a.buildings_value ?? 0) || 120_000;
  const premium = round2(productCode === 'TRV' ? 640 : Math.max(250, sumRole * 0.0035));
  const taxes = [
    { label: 'VAT (15%)', amount: round2(premium * 0.15) },
    { label: 'NHIL (2.5%)', amount: round2(premium * 0.025) },
    { label: 'GETFund levy (2.5%)', amount: round2(premium * 0.025) },
  ];
  return {
    currency: 'GHS',
    premium,
    lines: [{ label: 'Base premium', amount: premium }],
    taxes,
    total: round2(premium + taxes.reduce((s, t) => s + t.amount, 0)),
    indicative: true,
    notes: [],
    validUntil,
    source: 'rating',
  };
}

// ---- Seed data ---------------------------------------------------------------------------------------

function certificateFor(policyNo: string, certNo: string, holder: string): CertificateData {
  return {
    kind: 'motor',
    actLine: 'MOTOR VEHICLES (THIRD PARTY INSURANCE) ACT 1958 (GHANA)',
    coverTitle: 'COMPREHENSIVE',
    certificateNo: certNo,
    policyNo,
    customerNo: 'USR10042',
    policyHolder: holder,
    numberedItems: [
      { label: 'INDEX MARK AND REGISTRATION OF VEHICLE', value: 'GR 2224-AD' },
      { label: 'NAME OF POLICY HOLDER', value: holder },
    ],
    clauses: [
      {
        label: 'PERSONS OR CLASSES OF PERSONS ENTITLED TO DRIVE',
        lines: ['The policy holder.', 'Any other person driving with the policy holder’s permission.'],
      },
      {
        label: 'LIMITATIONS AS TO USE',
        lines: ['Use for social, domestic and pleasure purposes and for the policy holder’s business.'],
      },
    ],
    facts: [
      { label: 'MAKE', value: 'TOYOTA COROLLA' },
      { label: 'CHASSIS NO', value: 'JTDBR32E520123456' },
      { label: 'SEATING CAPACITY', value: '5' },
      { label: 'T.P.P.D LIMIT', value: 'GHS 8,000.00' },
    ],
    effectiveDate: day(-342),
    expiryDate: day(23),
    issuedAt: `${day(-342)}T09:14:00Z`,
    certifyText:
      'We hereby certify that the policy to which this certificate relates satisfies the requirements of the relevant law applicable in Ghana.',
    signatoryTitle: 'CHIEF EXECUTIVE OFFICER',
    verifyUrl: `${location.origin}/verify?certificate=${certNo}`,
  };
}

function seedReturning(profile: CustomerProfile): void {
  const holder = (profile.fullName ?? 'Ama Serwaa Mensah').toUpperCase();
  const motorQuote: Quote = {
    currency: 'GHS',
    premium: 4250,
    lines: [{ label: 'Comprehensive, 5% of 85,000', amount: 4250 }],
    taxes: [],
    total: 4250,
    indicative: false,
    notes: [],
    validUntil: day(-312),
    source: 'rating',
  };
  const ev = (status: ProposalStatus, at: string, note?: string): ProposalEvent => ({
    status,
    at,
    ...(note ? { note } : {}),
  });
  const base = (code: string, extra: Partial<MockProposal>): MockProposal => {
    const product = productByCode(code);
    const form = formById(product?.formId ?? '');
    return {
      id: rid('p_'),
      proposalNo: nextProposalNo(),
      productCode: code,
      productName: product?.name ?? code,
      status: 'draft',
      currentStep: 0,
      updatedAt: now(),
      formId: product?.formId ?? '',
      formVersion: form?.version ?? 1,
      answers: {},
      files: [],
      events: [ev('draft', `${day(-1)}T10:00:00Z`)],
      createdAt: `${day(-1)}T10:00:00Z`,
      ...extra,
    };
  };
  const issued = base('MTR', {
    status: 'issued',
    insuredSubject: 'GR 2224-AD · Toyota Corolla',
    submittedAt: `${day(-343)}T08:40:00Z`,
    quote: motorQuote,
    currentStep: 7,
    events: [
      ev('draft', `${day(-343)}T08:02:00Z`),
      ev('submitted', `${day(-343)}T08:40:00Z`),
      ev('quoted', `${day(-343)}T08:40:01Z`),
      ev('paid', `${day(-342)}T09:13:40Z`),
      ev('issued', `${day(-342)}T09:14:00Z`),
    ],
  });
  const policyId = rid('pol_');
  issued.policyId = policyId;
  const payment: MockPayment = {
    reference: 'PAY-7KQ2M9XB4D',
    amount: 4250,
    method: 'momo',
    network: 'mtn',
    maskedAccount: '024 *** 4567',
    status: 'succeeded',
    createdAt: `${day(-342)}T09:12:10Z`,
    completedAt: `${day(-342)}T09:13:40Z`,
    proposalId: issued.id,
    policyId,
  };
  const policy: PolicyDetail = {
    id: policyId,
    policyNo: 'SE26MCO10001-E',
    certificateNo: 'C01-26-10001',
    productCode: 'MTR',
    productName: 'Motor insurance',
    coverTitle: 'Comprehensive',
    insuredSubject: 'GR 2224-AD · Toyota Corolla',
    startsOn: day(-342),
    expiresOn: day(23),
    status: 'active',
    premium: 4250,
    issuedAt: `${day(-342)}T09:14:00Z`,
    proposalId: issued.id,
    certificate: certificateFor('SE26MCO10001-E', 'C01-26-10001', holder),
    payment,
  };
  const homeQuote = mockQuote('HMF', { sum_insured: 350_000 });
  const quoted = base('HMF', {
    status: 'quoted',
    insuredSubject: 'GA-543-0125 · East Legon',
    submittedAt: `${day(-2)}T15:20:00Z`,
    ...(homeQuote ? { quote: homeQuote } : {}),
    currentStep: 9,
    events: [
      ev('draft', `${day(-2)}T14:51:00Z`),
      ev('submitted', `${day(-2)}T15:20:00Z`),
      ev('quoted', `${day(-2)}T15:20:01Z`),
    ],
  });
  const info = base('FIR', {
    status: 'info_requested',
    insuredSubject: 'Shop 14, Kejetia Market, Kumasi',
    submittedAt: `${day(-4)}T11:00:00Z`,
    staffMessage:
      'Thank you. Please add the value of the stock you usually keep in the shop, and a photo of the fire extinguisher.',
    events: [
      ev('draft', `${day(-5)}T09:00:00Z`),
      ev('submitted', `${day(-4)}T11:00:00Z`),
      ev('under_review', `${day(-3)}T08:30:00Z`, 'Opened by an underwriter'),
      ev('info_requested', `${day(-3)}T10:05:00Z`, 'More information needed'),
    ],
  });
  const draft = base('TRV', { status: 'draft', currentStep: 1, insuredSubject: 'Schengen & Europe' });
  state.proposals = [draft, quoted, info, issued];
  state.payments = [payment];
  state.policies = [policy];
  state.claims = [
    {
      id: rid('c_'),
      claimNo: 'CLM-26-000041',
      policyId,
      policyNo: policy.policyNo,
      productName: 'Motor insurance',
      claimType: 'motor_own_damage',
      status: 'info_requested',
      incidentDate: day(-9),
      reportedAt: `${day(-8)}T13:20:00Z`,
      updatedAt: `${day(-6)}T10:00:00Z`,
      staffMessage:
        'Thank you for the photos. Please send the repair estimate from the garage, with the garage’s stamp on it.',
      incidentLocation: 'Spintex Road, near Coca-Cola roundabout, Accra',
      description:
        'A taxi reversed out of a side road and hit the rear passenger door. The door is dented and will not close properly. The taxi driver admitted fault.',
      estimatedAmount: 3800,
      files: [
        {
          id: rid('f_'),
          kind: 'claim_photos',
          name: 'door-damage-1.jpg',
          mime: 'image/jpeg',
          size: 412_000,
          createdAt: `${day(-8)}T13:25:00Z`,
        },
        {
          id: rid('f_'),
          kind: 'drivers_licence',
          name: 'licence.jpg',
          mime: 'image/jpeg',
          size: 288_000,
          createdAt: `${day(-8)}T13:26:00Z`,
        },
      ],
      events: [
        { status: 'received', at: `${day(-8)}T13:30:00Z` },
        { status: 'under_review', at: `${day(-7)}T09:10:00Z` },
        { status: 'info_requested', at: `${day(-6)}T10:00:00Z`, note: 'Repair estimate needed' },
      ],
    },
  ];
}

// ---- Router -----------------------------------------------------------------------------------------

function findProposal(id: string): MockProposal {
  const p = state.proposals.find((x) => x.id === id);
  if (!p) problem(404, 'Not found', 'We could not find that proposal.');
  return p;
}

function insuredSubjectOf(code: string, a: Answers): string | undefined {
  if (code === 'MTR' && Array.isArray(a.vehicles)) {
    const v = (a.vehicles as Record<string, unknown>[])[0];
    if (v?.reg_no) return `${String(v.reg_no).toUpperCase()}${v.model ? ` · ${String(v.model)}` : ''}`;
  }
  return undefined;
}

function detail(p: MockProposal): ProposalDetail {
  const { createdAt: _c, events, ...rest } = p;
  return {
    ...rest,
    history: events.map((e, i) => ({
      at: e.at,
      event: e.status === 'draft' ? 'created' : e.status,
      toStatus: e.status,
      ...(i > 0 ? { fromStatus: events[i - 1]?.status ?? 'draft' } : {}),
      ...(e.note ? { note: e.note } : {}),
      by:
        e.status === 'under_review' || e.status === 'info_requested'
          ? 'serene'
          : e.status === 'quoted' || e.status === 'issued'
            ? 'system'
            : 'customer',
    })),
  };
}

export async function handle<T>(method: Method, fullPath: string, body: unknown): Promise<T> {
  await latency();
  const [path = '', query = ''] = fullPath.split('?');
  const params = new URLSearchParams(query);
  void params;
  const seg = path.split('/').filter(Boolean);
  // Fresh copies, like JSON from a real server (callers must never share the mock's objects).
  const r = (v: unknown) => (v === undefined ? undefined : structuredClone(v)) as T;

  // Auth
  if (method === 'POST' && path === '/otp/start') {
    const phone = String((body as { phone?: string }).phone ?? '');
    const digits = phone.replace(/\D/g, '');
    const nsn = digits.startsWith('233') ? digits.slice(3) : digits.replace(/^0/, '');
    if (!/^[25]\d{8}$/.test(nsn))
      problem(422, 'Invalid phone', 'Enter a Ghana mobile number, for example 024 123 4567.');
    const challengeId = rid('ch_');
    state.challenges[challengeId] = { phone: `+233${nsn}`, expires: Date.now() + 300_000 };
    save();
    return r({
      challengeId,
      expiresInSeconds: 300,
      resendInSeconds: 30,
      maskedPhone: `0${nsn.slice(0, 2)} *** ${nsn.slice(5)}`,
      simulatedCode: CODE,
    });
  }
  if (method === 'POST' && path === '/otp/verify') {
    const { challengeId, code } = body as { challengeId: string; code: string };
    const ch = state.challenges[challengeId];
    if (!ch || ch.expires < Date.now())
      problem(410, 'Code expired', 'This code has expired. Send a new one.');
    if (code !== CODE) problem(422, 'Wrong code', 'That code is not right. Check the SMS and try again.');
    const isNew = ch.phone.endsWith('1111');
    if (!state.profile || state.profile.phone !== ch.phone) {
      state = { ...empty(), seq: state.seq };
      state.profile = {
        customerNo: isNew ? 'USR10043' : 'USR10042',
        phone: ch.phone,
        marketingConsent: false,
        createdAt: now(),
        ...(isNew
          ? {}
          : {
              title: 'ms',
              fullName: 'Ama Serwaa Mensah',
              email: 'ama.mensah@example.com',
              dateOfBirth: '1989-04-17',
              postalAddress: 'P.O. Box CT 4512, Cantonments, Accra',
              digitalAddress: 'GA-543-0125',
              occupation: 'Pharmacist',
              idType: 'ghana_card',
              idNumber: 'GHA-723456781-4',
            }),
      };
      if (!isNew) seedReturning(state.profile);
    }
    state.signedIn = true;
    save();
    return r({ profile: state.profile, isNew: isNew && !state.profile.fullName });
  }
  if (method === 'POST' && path === '/sign-out') {
    state.signedIn = false;
    save();
    return r(undefined);
  }
  if (path === '/me') {
    const profile = requireAuth();
    if (method === 'PATCH') {
      state.profile = {
        ...profile,
        ...(body as Partial<CustomerProfile>),
        phone: profile.phone,
        customerNo: profile.customerNo,
      };
      save();
      return r(state.profile);
    }
    return r(profile);
  }

  // Proposals
  if (seg[0] === 'proposals') {
    requireAuth();
    if (seg.length === 1 && method === 'GET') return r(state.proposals.map(summary));
    if (seg.length === 1 && method === 'POST') {
      const req = body as CreateProposalRequest;
      const product = productByCode(req.productCode);
      const form = product ? formById(product.formId) : undefined;
      if (!product || !form) problem(422, 'Unknown product');
      const p: MockProposal = {
        id: rid('p_'),
        proposalNo: nextProposalNo(),
        productCode: product.code,
        productName: product.name,
        status: 'draft',
        currentStep: 0,
        updatedAt: now(),
        formId: form.id,
        formVersion: form.version,
        answers: req.answers ?? {},
        files: [],
        events: [{ status: 'draft', at: now() }],
        createdAt: now(),
      };
      state.proposals.unshift(p);
      save();
      return r(detail(p));
    }
    const p = findProposal(seg[1] ?? '');
    if (seg.length === 2 && method === 'GET') return r(detail(p));
    if (seg.length === 2 && method === 'PATCH') {
      if (p.status !== 'draft' && p.status !== 'info_requested')
        problem(409, 'Locked', 'This proposal has been submitted.');
      const req = body as SaveDraftRequest;
      p.answers = req.answers;
      p.currentStep = req.currentStep;
      p.updatedAt = now();
      const subject = insuredSubjectOf(p.productCode, p.answers);
      if (subject) p.insuredSubject = subject;
      save();
      return r(summary(p));
    }
    if (seg[2] === 'quote' && method === 'POST') {
      const q = mockQuote(p.productCode, p.answers);
      if (!q) problem(422, 'Not enough answers', 'Answer the cover questions to see a price.');
      return r(q);
    }
    if (seg[2] === 'files' && method === 'DELETE') {
      p.files = p.files.filter((f) => f.id !== seg[3]);
      save();
      return r(undefined);
    }
    if (seg[2] === 'submit' && method === 'POST') {
      const req = body as SubmitRequest;
      if (!req.signature?.imagePng) problem(422, 'Signature missing', 'Please sign the proposal.');
      p.answers = req.answers;
      p.submittedAt = now();
      p.signature = {
        method: req.signature.method,
        signedName: req.signature.signedName,
        signedAt: req.signature.signedAt,
        hasImage: true,
      };
      p.events.push({ status: 'submitted', at: now() });
      const product = productByCode(p.productCode);
      const q = product?.purchase === 'instant' ? mockQuote(p.productCode, p.answers) : null;
      if (q) {
        p.quote = q;
        p.status = 'quoted';
        p.events.push({ status: 'quoted', at: now() });
      } else {
        p.status = 'submitted';
      }
      p.updatedAt = now();
      save();
      return r(detail(p));
    }
    if (seg[2] === 'cancel' && method === 'POST') {
      p.status = 'cancelled';
      p.events.push({ status: 'cancelled', at: now(), note: 'Cancelled by you' });
      save();
      return r(summary(p));
    }
    if (seg[2] === 'payments' && method === 'POST') {
      if (p.status !== 'quoted' || !p.quote) problem(409, 'Not payable', 'This proposal cannot be paid yet.');
      const req = body as StartPaymentRequest;
      const digits = req.account.replace(/\D/g, '');
      const pay: MockPayment = {
        reference: `PAY-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
        amount: p.quote.total,
        method: req.method,
        ...(req.network ? { network: req.network } : {}),
        maskedAccount:
          req.method === 'momo'
            ? `0${digits.slice(-9, -7)} *** ${digits.slice(-4)}`
            : `•••• ${digits.slice(-4)}`,
        status: 'pending',
        createdAt: now(),
        proposalId: p.id,
      };
      if (req.method === 'momo' ? digits.endsWith('0000') : digits === '4000000000000002') {
        pay.status = 'failed';
        pay.failureReason =
          req.method === 'momo' ? 'The payment was declined by the network.' : 'Your bank declined the card.';
      }
      state.payments.push(pay);
      save();
      return r(pay);
    }
    if (seg[2] === 'document' && method === 'GET') {
      const form = formById(p.formId);
      return r({
        form,
        answers: p.answers,
        files: p.files,
        signature: p.signature,
        meta: { proposalNo: p.proposalNo, submittedAt: p.submittedAt },
      });
    }
  }

  if (seg[0] === 'payments') {
    requireAuth();
    const pay = state.payments.find((x) => x.reference === seg[1]);
    if (!pay) problem(404, 'Not found');
    if (seg[2] === 'simulate' && method === 'POST') {
      const { approve } = body as { approve: boolean };
      if (pay.status === 'pending') {
        if (!approve) {
          pay.status = 'failed';
          pay.failureReason = 'You declined the payment.';
        } else issuePolicy(pay);
      }
      save();
      return r(pay);
    }
    return r(pay);
  }

  if (seg[0] === 'policies' && method === 'GET' && seg.length <= 2) {
    requireAuth();
    if (seg.length === 1) {
      return r(state.policies.map(({ certificate: _c, payment: _p, ...s }) => s));
    }
    const pol = state.policies.find((x) => x.id === seg[1]);
    if (!pol) problem(404, 'Not found', 'We could not find that policy.');
    return r(pol);
  }

  if (seg[0] === 'policies' && seg[2] === 'signature') problem(404, 'No signature');
  if (seg[0] === 'policies' && seg[2] === 'renew' && method === 'POST') {
    requireAuth();
    const pol = state.policies.find((x) => x.id === seg[1]);
    if (!pol) problem(404, 'Not found');
    const old = state.proposals.find((x) => x.id === pol.proposalId);
    const product = productByCode(pol.productCode);
    const form = formById(product?.formId ?? '');
    if (!product || !form) problem(422, 'Not renewable');
    const answers: Answers = { ...(old?.answers ?? {}) };
    const start = new Date(`${pol.expiresOn}T00:00:00`);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (pol.productCode === 'MTR' && Object.keys(answers).length < 4) {
      Object.assign(answers, {
        title: 'ms',
        full_name: state.profile?.fullName ?? '',
        vehicles: [
          {
            reg_no: 'GR 2224-AD',
            make: 'toyota',
            model: 'Corolla',
            body_type: 'saloon',
            cubic_capacity: 1800,
            seating_capacity: 5,
            year_of_make: 2019,
            estimated_value: 85000,
            colour: 'silver',
          },
        ],
        chassis_no: 'JTDBR32E520123456',
        vehicle_use: 'private',
        is_owner: 'yes',
        registered_in_name: 'yes',
        hire_purchase: 'no',
        physical_defect: 'no',
        previously_insured: 'yes',
        previous_insurer: 'serene',
        years_insured: 1,
        ncd_entitled: 'no',
        cover_type: 'comprehensive',
        tppd_increase: 'no',
      });
    }
    answers.cover_start = iso(start);
    answers.cover_end = iso(end);
    const p: MockProposal = {
      id: rid('p_'),
      proposalNo: nextProposalNo(),
      productCode: pol.productCode,
      productName: pol.productName,
      status: 'draft',
      currentStep: form.steps.length - 1,
      updatedAt: now(),
      formId: form.id,
      formVersion: form.version,
      answers,
      files: [],
      ...(pol.insuredSubject ? { insuredSubject: pol.insuredSubject } : {}),
      events: [{ status: 'draft', at: now(), note: `Renewal of ${pol.policyNo}` }],
      createdAt: now(),
    };
    state.proposals.unshift(p);
    save();
    return r(detail(p));
  }

  if (seg[0] === 'policies' && seg[2] === 'claims' && method === 'POST') {
    requireAuth();
    const pol = state.policies.find((x) => x.id === seg[1]);
    if (!pol) problem(404, 'Not found');
    const req = body as CreateClaimRequest;
    if (!CLAIM_TYPES.some((t) => t.id === req.claimType)) problem(422, 'Unknown claim type');
    const c: ClaimDetail = {
      id: rid('c_'),
      claimNo: `CLM-26-${String(++state.seq).padStart(6, '0')}`,
      policyId: pol.id,
      policyNo: pol.policyNo,
      productName: pol.productName,
      claimType: req.claimType,
      status: 'draft',
      incidentDate: req.incidentDate,
      reportedAt: now(),
      updatedAt: now(),
      incidentLocation: req.incidentLocation,
      description: req.description,
      ...(req.estimatedAmount !== undefined ? { estimatedAmount: req.estimatedAmount } : {}),
      ...(req.thirdParty ? { thirdParty: req.thirdParty } : {}),
      files: [],
      events: [],
    };
    state.claims = [c, ...(state.claims ?? [])];
    save();
    return r(c);
  }

  if (seg[0] === 'claims') {
    requireAuth();
    const list = state.claims ?? [];
    if (seg.length === 1)
      return r(
        list.map(
          ({
            incidentLocation: _l,
            description: _d,
            estimatedAmount: _e,
            thirdParty: _t,
            files: _f,
            events: _ev,
            ...rest
          }) => rest,
        ),
      );
    const c = list.find((x) => x.id === seg[1]);
    if (!c) problem(404, 'Not found', 'We could not find that claim.');
    if (seg[2] === 'submit' && method === 'POST') {
      const type = CLAIM_TYPES.find((t) => t.id === c.claimType);
      const missing = (type?.documents ?? []).filter(
        (d) => d.required && !c.files.some((f) => f.kind === d.kind),
      );
      if (missing.length)
        problem(422, 'Documents missing', `Please attach: ${missing.map((m) => m.label).join(', ')}.`);
      c.status = 'received';
      c.events = [{ status: 'received', at: now() }];
      c.reportedAt = now();
      save();
      return r(c);
    }
    if (seg[2] === 'respond' && method === 'POST') {
      c.status = 'under_review';
      c.updatedAt = now();
      c.events = [...c.events, { status: 'under_review', at: now(), note: 'You replied' }];
      delete c.staffMessage;
      save();
      return r(c);
    }
    return r(c);
  }

  if (path === '/catalogue') return r({ products: [] });
  problem(404, 'Not found', `No mock for ${method} ${path}`);
}

function issuePolicy(pay: MockPayment): void {
  const p = findProposal(pay.proposalId);
  pay.status = 'succeeded';
  pay.completedAt = now();
  const n = 10001 + state.policies.length;
  const policyId = rid('pol_');
  const isMotor = p.productCode === 'MTR';
  const coverTitle = isMotor
    ? ({ comprehensive: 'Comprehensive', tpft: 'Third party, fire & theft', tpo: 'Third party only' }[
        String(p.answers.cover_type)
      ] ?? 'Motor')
    : p.productName;
  const policyNo = `SE26${isMotor ? 'MCO' : p.productCode}${n}-E`;
  const certNo = `C01-26-${n}`;
  const holder = String(p.answers.full_name ?? state.profile?.fullName ?? 'Customer').toUpperCase();
  const start = typeof p.answers.cover_start === 'string' ? p.answers.cover_start : day(1);
  const end = typeof p.answers.cover_end === 'string' ? p.answers.cover_end : day(365);
  const cert = {
    ...certificateFor(policyNo, certNo, holder),
    coverTitle: coverTitle.toUpperCase(),
    effectiveDate: start,
    expiryDate: end,
    issuedAt: now(),
  };
  const { proposalId: _pid, policyId: _pol, ...payment } = pay;
  state.policies.unshift({
    id: policyId,
    policyNo,
    certificateNo: certNo,
    productCode: p.productCode,
    productName: p.productName,
    coverTitle,
    ...(p.insuredSubject ? { insuredSubject: p.insuredSubject } : {}),
    startsOn: start,
    expiresOn: end,
    status: 'active',
    premium: pay.amount,
    issuedAt: now(),
    proposalId: p.id,
    certificate: cert,
    payment: { ...payment },
  });
  pay.policyId = policyId;
  p.status = 'issued';
  p.policyId = policyId;
  p.events.push({ status: 'paid', at: now() }, { status: 'issued', at: now() });
}

export async function handleUpload<T>(
  path: string,
  form: FormData,
  onProgress: (f: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  requireAuth();
  const parts = path.split('/');
  const id = parts[2] ?? '';
  const file = form.get('file');
  if (!(file instanceof Blob)) problem(422, 'No file');
  if (parts[1] === 'claims') {
    const c = (state.claims ?? []).find((x) => x.id === id);
    if (!c) problem(404, 'Not found');
    for (let i = 1; i <= 8; i++) {
      await wait(60);
      onProgress(i / 8);
    }
    const rec = {
      id: rid('f_'),
      kind: String(form.get('kind') ?? ''),
      name: file instanceof File ? file.name : 'upload',
      mime: file.type,
      size: file.size,
      createdAt: now(),
    };
    mockFileUrls.set(rec.id, URL.createObjectURL(file));
    c.files = [...c.files, rec];
    save();
    return structuredClone(rec) as T;
  }
  const p = findProposal(id);
  for (let i = 1; i <= 10; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await wait(60 + Math.random() * 60);
    onProgress(i / 10);
  }
  const rec: ProposalFile = {
    id: rid('f_'),
    fieldId: String(form.get('fieldId') ?? ''),
    kind: String(form.get('kind') ?? ''),
    name: file instanceof File ? file.name : 'upload',
    mime: file.type,
    size: file.size,
    createdAt: now(),
  };
  mockFileUrls.set(rec.id, URL.createObjectURL(file));
  p.files = [...p.files, rec];
  save();
  return structuredClone(rec) as T;
}
