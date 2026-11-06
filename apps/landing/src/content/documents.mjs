// Supporting documents per product, taken from the file fields of each proposal form in
// packages/proposals/src/forms/*.ts (snapshot 2026-11-06). Identity uploads (face photo, passport page,
// company registration) are described once per page by `identity`, so they are not repeated here.
// Regenerate this file when a form's Documents step changes.
export const DOCUMENTS = {
  MTR: {
    identity: 'individual',
    documents: [
      {
        label: 'Renewal notice from your previous insurer',
        required: true,
        when: 'if you are claiming a no-claim discount',
      },
      {
        label: 'Vehicle registration document (DVLA)',
        required: true,
        when: 'for comprehensive and third party, fire & theft only',
      },
      {
        label: 'Roadworthy certificate',
        required: false,
      },
      {
        label: 'Vehicle photo: front, with the number plate',
        required: true,
        when: 'for comprehensive and third party, fire & theft only',
      },
      {
        label: 'Vehicle photo: rear, with the number plate',
        required: true,
        when: 'for comprehensive and third party, fire & theft only',
      },
      {
        label: 'Vehicle photo: left side',
        required: true,
        when: 'for comprehensive and third party, fire & theft only',
      },
      {
        label: 'Vehicle photo: right side',
        required: true,
        when: 'for comprehensive and third party, fire & theft only',
      },
      {
        label: 'Vehicle photo: dashboard with the mileage showing',
        required: true,
        when: 'for comprehensive only',
      },
      {
        label: 'Vehicle photo: chassis number (VIN plate or windscreen)',
        required: true,
        when: 'for comprehensive only',
      },
      {
        label: 'Vehicle photos: any existing dents or scratches',
        required: false,
        when: 'for comprehensive and third party, fire & theft only',
      },
    ],
  },
  TRV: {
    identity: 'individual',
    documents: [
      {
        label: 'Passport photo (bio-data) page',
        required: true,
      },
      {
        label: 'Passport photo pages of the people travelling with you',
        required: true,
        when: 'if others travel with you',
      },
      {
        label: 'Visa (if you already have it)',
        required: false,
      },
      {
        label: 'Flight ticket or itinerary',
        required: false,
      },
    ],
  },
  HMF: {
    identity: 'individual',
    documents: [
      {
        label: 'Front of the house',
        required: true,
        when: 'if you insure the building',
      },
      {
        label: 'Inside the house (main rooms)',
        required: true,
      },
      {
        label: 'Locks, burglar-proofing and other security',
        required: false,
        when: 'if you add burglary cover',
      },
      {
        label: 'Valuation report (if you have one)',
        required: false,
        when: 'if you insure the building',
      },
      {
        label: 'Inventory of contents (if you have one)',
        required: false,
        when: 'if you insure contents or add burglary cover',
      },
    ],
  },
  FIR: {
    identity: 'either',
    documents: [
      {
        label: 'Schedule of buildings (if more than one building)',
        required: false,
        when: 'for business premises with more than one building',
      },
      {
        label: 'Front of the building',
        required: true,
      },
      {
        label: 'Inside the building',
        required: true,
      },
      {
        label: 'Valuation report (if you have one)',
        required: false,
      },
      {
        label: 'Inventory of contents or stock (if you have one)',
        required: false,
      },
    ],
  },
  FBG: {
    identity: 'either',
    documents: [
      {
        label: 'Schedule of buildings (if more than one building)',
        required: false,
        when: 'for business premises with more than one building',
      },
      {
        label: 'Front of the building',
        required: true,
      },
      {
        label: 'Inside the building',
        required: true,
      },
      {
        label: 'Doors, locks, burglar-proofing, fence and fire extinguishers',
        required: false,
      },
      {
        label: 'Valuation report (if you have one)',
        required: false,
      },
      {
        label: 'Inventory of contents or stock (if you have one)',
        required: false,
      },
    ],
  },
  BGP: {
    identity: 'individual',
    documents: [
      {
        label: 'Loss details sheet (optional, instead of or as well as the table)',
        required: false,
        when: 'if you have had losses before',
      },
      {
        label: 'Front of the building',
        required: true,
      },
      {
        label: 'Inside (main rooms with the insured items)',
        required: true,
      },
      {
        label: 'Doors, locks, burglar-proofing, fence, alarm or CCTV',
        required: true,
      },
      {
        label: 'Inventory, receipts or valuations of the items (if you have them)',
        required: false,
      },
    ],
  },
  BGB: {
    identity: 'business',
    documents: [
      {
        label: 'Loss details sheet (optional, instead of or as well as the table)',
        required: false,
        when: 'if you have had losses before',
      },
      {
        label: 'Lists of stock and office contents (optional)',
        required: false,
      },
      {
        label: 'Front of the building',
        required: true,
      },
      {
        label: 'Inside (shop floor, store rooms, offices)',
        required: true,
      },
      {
        label: 'Doors, locks, burglar-proofing, fence, alarm or CCTV',
        required: true,
      },
    ],
  },
  BIN: {
    identity: 'business',
    documents: [
      {
        label: 'Latest audited accounts',
        required: false,
      },
    ],
  },
  PAC: {
    identity: 'individual',
    documents: [
      {
        label: 'Medical report on the impairment (if you have one)',
        required: false,
        when: 'if you have a physical impairment',
      },
    ],
  },
  GPA: {
    identity: 'business',
    documents: [
      {
        label: 'Declaration list (staff list)',
        required: true,
        when: 'unless you type the staff list into the form',
      },
    ],
  },
  WCA: {
    identity: 'business',
    documents: [
      {
        label: 'Staff list with names, occupations and annual earnings',
        required: false,
      },
    ],
  },
  PLI: {
    identity: 'business',
    documents: [
      {
        label: 'Photos of the premises (optional)',
        required: false,
      },
      {
        label: 'Latest inspection certificate for hoists, cranes or lifting tackle (optional)',
        required: false,
        when: 'if you use hoists, cranes or lifting tackle',
      },
    ],
  },
  GLI: {
    identity: 'business',
    documents: [
      {
        label: 'Additional sheet of premises (if more than 3)',
        required: false,
      },
      {
        label: 'Photos of the premises (optional)',
        required: false,
      },
      {
        label: 'Waste disposal licence(s)',
        required: false,
        when: 'if you handle hazardous waste',
      },
    ],
  },
  PIN: {
    identity: 'business',
    documents: [
      {
        label: 'Professional certificates or licences to practise',
        required: true,
      },
      {
        label: 'Latest audited accounts (optional)',
        required: false,
      },
      {
        label: 'Company brochure (optional)',
        required: false,
      },
      {
        label: 'Environmental classification certificate (optional)',
        required: false,
        when: 'if you hold one',
      },
      {
        label: 'Documentary evidence of work done (optional)',
        required: false,
        when: 'if you list completed projects',
      },
      {
        label: 'Evidence of policy documents for contract terms',
        required: true,
        when: 'if your contracts extend, transfer or waive liability',
      },
    ],
  },
  DNO: {
    identity: 'business',
    documents: [
      {
        label: 'The latest audited accounts of the company',
        required: true,
      },
      {
        label: 'The latest interim statement (if applicable)',
        required: false,
      },
      {
        label: 'The latest audited accounts of the ultimate holding company',
        required: true,
        when: 'if the company has a holding company',
      },
      {
        label: 'A current organisational diagram',
        required: true,
      },
      {
        label: 'Continuation sheets on headed paper (optional)',
        required: false,
      },
    ],
  },
  CYB: {
    identity: 'business',
    documents: [
      {
        label: 'Latest audited accounts (optional)',
        required: false,
      },
      {
        label: 'Information security certificates (e.g. ISO 27001, PCI DSS attestation)',
        required: false,
        when: 'if you hold them',
      },
      {
        label: 'Separate sheet of outsourced services (optional)',
        required: false,
        when: 'if you outsource IT services',
      },
    ],
  },
  FGT: {
    identity: 'business',
    documents: [
      {
        label: 'Testimonials from the applicant’s previous employers (optional)',
        required: false,
      },
      {
        label: 'Latest audited accounts (optional)',
        required: false,
        when: 'if your books are audited',
      },
    ],
  },
  BBI: {
    identity: 'business',
    documents: [
      {
        label: 'Last annual statement or report (audited accounts)',
        required: true,
      },
      {
        label: 'Bank of Ghana licence (optional)',
        required: false,
      },
    ],
  },
  MNY: {
    identity: 'business',
    documents: [
      {
        label: 'The safe or strong room, showing how it is anchored',
        required: true,
        when: 'if you insure money kept in a safe',
      },
      {
        label: 'Other security at the premises (optional)',
        required: false,
      },
    ],
  },
  GIT: {
    identity: 'business',
    documents: [
      {
        label: 'Separate sheet of vehicles (if more than 5)',
        required: false,
        when: 'if you carry goods in your own vehicles',
      },
      {
        label: 'Photos of the truck(s)',
        required: false,
        when: 'if you carry goods in your own vehicles',
      },
    ],
  },
  MCG: {
    identity: 'business',
    documents: [
      {
        label: 'Proforma or commercial invoice',
        required: true,
      },
      {
        label: 'Bill of lading or airway bill',
        required: false,
      },
      {
        label: 'Packing list',
        required: false,
      },
    ],
  },
  MHL: {
    identity: 'business',
    documents: [
      {
        label: 'Survey report',
        required: true,
        when: 'if the vessel has been surveyed',
      },
      {
        label: 'Certificate of registry of the vessel',
        required: false,
      },
      {
        label: 'Photos of the vessel and engine(s)',
        required: false,
      },
      {
        label: 'Separate sheet: individual items of personal effects',
        required: false,
        when: 'if you insure personal effects',
      },
      {
        label: 'Separate sheet: individual high value items of equipment',
        required: false,
      },
    ],
  },
  STV: {
    identity: 'business',
    documents: [
      {
        label: 'Copies of operating contractual arrangements',
        required: true,
        when: 'if you have hold-harmless arrangements',
      },
      {
        label: 'Separate sheet of claims and losses (if necessary)',
        required: false,
      },
      {
        label: 'Port authority (GPHA) stevedoring licence or permit',
        required: false,
      },
    ],
  },
  CAR: {
    identity: 'business',
    documents: [
      {
        label: 'Contract document (or letter of award)',
        required: true,
      },
      {
        label: 'Schedule of quantities and rates and/or values',
        required: true,
      },
      {
        label: 'Site plan of contract works / complete layout of the site',
        required: false,
      },
      {
        label: 'Project schedule (programme of works)',
        required: false,
      },
      {
        label: 'Individual values of plant & machinery',
        required: false,
        when: 'if you insure plant and machinery',
      },
    ],
  },
  EAR: {
    identity: 'business',
    documents: [
      {
        label: 'Contract document (or letter of award)',
        required: true,
      },
      {
        label: 'Bill of quantities / breakdown of the sums insured',
        required: false,
      },
      {
        label: 'General drawing of plant (complete factories) or site plan',
        required: false,
      },
      {
        label: 'Project schedule (erection and testing programme)',
        required: false,
      },
      {
        label: 'Plans of the existing plant',
        required: true,
        when: 'if the existing plant keeps running during the work',
      },
      {
        label: 'List of major machines with individual new replacement values',
        required: true,
        when: 'if you insure the machinery',
      },
      {
        label: 'Maps of the surroundings',
        required: false,
        when: 'if you add third-party liability',
      },
    ],
  },
  EEI: {
    identity: 'business',
    documents: [
      {
        label: 'Purchase invoices or valuation of the equipment',
        required: false,
      },
      {
        label: 'Photos of the equipment with serial plates',
        required: false,
      },
      {
        label: 'Completed EDP equipment questionnaire',
        required: false,
      },
    ],
  },
  PMB: {
    identity: 'business',
    documents: [
      {
        label: 'Attached list of plant and machinery',
        required: false,
      },
      {
        label: 'Photos of the plant and machinery, with serial plates',
        required: false,
      },
      {
        label: 'Purchase invoices or valuation report',
        required: false,
      },
    ],
  },
  BND: {
    identity: 'business',
    documents: [
      {
        label: 'Board resolution authorising the bond application',
        required: false,
      },
      {
        label: 'Tender document (bid bonds) or a copy of contract signed with applicant’s client',
        required: true,
      },
      {
        label: 'Audited accounts for the past three years',
        required: true,
      },
      {
        label: 'Signed counter indemnity',
        required: false,
      },
      {
        label: 'Valuation report on property being offered as counter indemnity',
        required: false,
      },
      {
        label: 'Evidence of ownership of property offered as counter indemnity',
        required: false,
      },
      {
        label: 'List of the management and technical staff showing their qualifications and experience',
        required: false,
      },
      {
        label: 'Copies of completion certificates (questions 10 and 22)',
        required: false,
      },
      {
        label: 'Copies of progress reports on contracts at hand (question 20)',
        required: false,
      },
      {
        label: 'Equipment owned by you for use in connection with the project',
        required: false,
      },
      {
        label: 'Equipment you intend purchasing for this contract',
        required: false,
      },
    ],
  },
};
