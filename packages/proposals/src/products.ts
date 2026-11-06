// Serene's product catalogue for online proposals. Every product has exactly one proposal form.
//
// purchase:
//   'instant'     the customer sees a price straight away, pays, and gets the certificate.
//   'underwriter' the customer submits the proposal; an underwriter prices it in the admin
//                 portal; the customer is told, accepts and pays online, then gets the certificate.
// This split follows market practice in Ghana: retail lines with tariff or table pricing are sold
// instantly; commercial and specialist risks are always individually underwritten.

export type ProductCategory =
  | 'motor'
  | 'property'
  | 'travel'
  | 'accident'
  | 'liability'
  | 'financial'
  | 'engineering'
  | 'marine'
  | 'bonds';

export interface Product {
  code: string; // short code used in policy numbers, e.g. "MTR"
  formId: string; // forms/<formId>.ts
  name: string;
  category: ProductCategory;
  audience: readonly ('individual' | 'business')[];
  purchase: 'instant' | 'underwriter';
  /** One line for product cards. */
  summary: string;
  /** Certificate layout: 'motor' is the statutory motor certificate; 'general' the same frame for other lines. */
  certificate: 'motor' | 'general';
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  motor: 'Motor',
  property: 'Home & property',
  travel: 'Travel',
  accident: 'Personal & group accident',
  liability: 'Liability',
  financial: 'Financial lines',
  engineering: 'Engineering',
  marine: 'Marine',
  bonds: 'Bonds',
};

export const PRODUCTS: readonly Product[] = [
  {
    code: 'MTR',
    formId: 'motor',
    name: 'Motor insurance',
    category: 'motor',
    audience: ['individual', 'business'],
    purchase: 'instant',
    summary:
      'Third party only, third party fire & theft, or comprehensive cover for private and commercial vehicles.',
    certificate: 'motor',
  },
  {
    code: 'TRV',
    formId: 'travel',
    name: 'Travel insurance',
    category: 'travel',
    audience: ['individual'],
    purchase: 'instant',
    summary: 'Emergency medical cover, evacuation and baggage protection, accepted for Schengen visas.',
    certificate: 'general',
  },
  {
    code: 'HMF',
    formId: 'home-flexi',
    name: 'Home insurance (Home Flexible)',
    category: 'property',
    audience: ['individual'],
    purchase: 'instant',
    summary: 'Your house and everything in it, against fire, flood, burglary and more.',
    certificate: 'general',
  },
  {
    code: 'FIR',
    formId: 'fire',
    name: 'Fire & special perils',
    category: 'property',
    audience: ['individual', 'business'],
    purchase: 'underwriter',
    summary: 'Buildings, contents, machinery and stock against fire, lightning, explosion and allied perils.',
    certificate: 'general',
  },
  {
    code: 'FBG',
    formId: 'fire-burglary',
    name: 'Fire & burglary',
    category: 'property',
    audience: ['individual', 'business'],
    purchase: 'underwriter',
    summary: 'One policy for fire and break-in theft at your home or shop.',
    certificate: 'general',
  },
  {
    code: 'BGP',
    formId: 'burglary-private',
    name: 'Burglary (private premises)',
    category: 'property',
    audience: ['individual'],
    purchase: 'underwriter',
    summary: 'Household contents against theft following forcible entry.',
    certificate: 'general',
  },
  {
    code: 'BGB',
    formId: 'burglary-business',
    name: 'Burglary (business premises)',
    category: 'property',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Stock, equipment and fittings at your business premises against break-in theft.',
    certificate: 'general',
  },
  {
    code: 'BIN',
    formId: 'business-interruption',
    name: 'Business interruption',
    category: 'property',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Lost gross profit and running costs while you recover from insured damage.',
    certificate: 'general',
  },
  {
    code: 'PAC',
    formId: 'personal-accident',
    name: 'Personal accident',
    category: 'accident',
    audience: ['individual'],
    purchase: 'instant',
    summary: 'Lump sums for accidental death or disability, plus medical expenses, 24 hours a day.',
    certificate: 'general',
  },
  {
    code: 'GPA',
    formId: 'group-personal-accident',
    name: 'Group personal accident',
    category: 'accident',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Accident cover for your staff or members, priced as a group.',
    certificate: 'general',
  },
  {
    code: 'WCA',
    formId: 'workmens-compensation',
    name: 'Workmen’s compensation',
    category: 'liability',
    audience: ['business'],
    purchase: 'underwriter',
    summary:
      'Your legal liability for employees injured at work, under the Workmen’s Compensation Law, 1987.',
    certificate: 'general',
  },
  {
    code: 'PLI',
    formId: 'public-liability',
    name: 'Public liability',
    category: 'liability',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Injury to members of the public or damage to their property caused by your business.',
    certificate: 'general',
  },
  {
    code: 'GLI',
    formId: 'general-liability',
    name: 'General liability',
    category: 'liability',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Broad third-party liability for your premises, operations and products.',
    certificate: 'general',
  },
  {
    code: 'PIN',
    formId: 'professional-indemnity',
    name: 'Professional indemnity',
    category: 'liability',
    audience: ['individual', 'business'],
    purchase: 'underwriter',
    summary: 'Claims for negligence, errors or omissions in your professional services.',
    certificate: 'general',
  },
  {
    code: 'DNO',
    formId: 'directors-officers',
    name: 'Directors & officers liability',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Personal liability of directors and officers for wrongful acts in managing the company.',
    certificate: 'general',
  },
  {
    code: 'CYB',
    formId: 'cyber',
    name: 'Cyber crime',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Data breaches, cyber extortion, funds-transfer fraud and the cost of getting back online.',
    certificate: 'general',
  },
  {
    code: 'FGT',
    formId: 'fidelity-guarantee',
    name: 'Fidelity guarantee',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Loss of money or goods through fraud or dishonesty by your employees.',
    certificate: 'general',
  },
  {
    code: 'BBI',
    formId: 'bankers-indemnity',
    name: 'Bankers’ indemnity',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Cash, securities and fraud risks for banks, savings and loans, and microfinance companies.',
    certificate: 'general',
  },
  {
    code: 'MNY',
    formId: 'money',
    name: 'Money insurance',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Cash in transit, in the safe and on the premises, against robbery and theft.',
    certificate: 'general',
  },
  {
    code: 'GIT',
    formId: 'goods-in-transit',
    name: 'Goods in transit',
    category: 'marine',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Goods carried by road within Ghana, against accident, fire and theft.',
    certificate: 'general',
  },
  {
    code: 'MCG',
    formId: 'marine-cargo',
    name: 'Marine cargo',
    category: 'marine',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Imports and exports by sea or air, single shipment or open cover.',
    certificate: 'general',
  },
  {
    code: 'MHL',
    formId: 'marine-hull',
    name: 'Marine hull',
    category: 'marine',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Vessels and boats, their machinery and equipment.',
    certificate: 'general',
  },
  {
    code: 'STV',
    formId: 'stevedore',
    name: 'Stevedores’ liability',
    category: 'marine',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Liability for cargo and property in your care during loading and discharge.',
    certificate: 'general',
  },
  {
    code: 'CAR',
    formId: 'contractors-all-risk',
    name: 'Contractors’ all risks',
    category: 'engineering',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Construction works, plant and third-party liability from groundbreaking to handover.',
    certificate: 'general',
  },
  {
    code: 'EAR',
    formId: 'erection-all-risk',
    name: 'Erection all risks',
    category: 'engineering',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Machinery and plant while being erected, installed and tested.',
    certificate: 'general',
  },
  {
    code: 'EEI',
    formId: 'electronic-equipment',
    name: 'Electronic equipment',
    category: 'engineering',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Computers, servers, medical and office electronics against sudden damage and theft.',
    certificate: 'general',
  },
  {
    code: 'PMB',
    formId: 'plant-machinery',
    name: 'Plant & machinery',
    category: 'engineering',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Contractors’ plant and machinery on site and in transit.',
    certificate: 'general',
  },
  {
    code: 'BND',
    formId: 'bonds',
    name: 'Bonds & guarantees',
    category: 'bonds',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Bid, performance, advance mobilisation, customs and other bonds for contractors and importers.',
    certificate: 'general',
  },
];

export const productByCode = (code: string): Product | undefined => PRODUCTS.find((p) => p.code === code);
export const productByFormId = (formId: string): Product | undefined =>
  PRODUCTS.find((p) => p.formId === formId);
