// MARINE CARGO INSURANCE PROPOSAL FORM
// Source: PROPOSAL FORMS/MARINE QUESTIONAIRE/MARINE CARGO QUESTIONNAIRE.pdf (and .docx, Aug 2025).
// "MARINE QUESTIONNAIRE" (.docx/.pdf) is the same form: questions 1–13 and the declaration are
// word-for-word the same. It is the older copy (2021 PDF), titled "MARINE CARGO INSURANCE
// QUESTIONNAIRE" with the "SERENE INSURANCE COMPANY LIMITED" letterhead. The newer file is used.
// The sum insured may be in a foreign currency (cargo is usually invoiced in US$, € or £).
import { COUNTRIES_COMMON } from '../options';
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

export const marineCargo: FormDefinition = {
  id: 'marine-cargo',
  version: 1,
  title: 'MARINE CARGO INSURANCE PROPOSAL FORM',
  subtitle: '(This form may be completed by insured or your broker)',
  source: 'MARINE QUESTIONAIRE/MARINE CARGO QUESTIONNAIRE.pdf',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'The importer or exporter of the cargo. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              number: '1',
              label: 'Full name of proposer',
              help: 'The registered name of the business (or your full name if you import in your own name).',
              required: true,
              prefill: 'companyName',
              saveToProfile: 'companyName',
              role: 'insuredName',
              maxLength: 160,
            },
            // added for online sale
            {
              id: 'registration_no',
              type: 'text',
              label: 'Company registration number',
              help: 'From the Office of the Registrar of Companies (ORC) certificate.',
              required: true,
              prefill: 'companyRegNo',
              saveToProfile: 'companyRegNo',
              width: 'half',
              row: 'reg',
              maxLength: 30,
            },
            // added for online sale
            {
              id: 'tin',
              type: 'text',
              label: 'Taxpayer identification number (TIN)',
              help: 'The TIN used on your customs declarations.',
              format: 'tin',
              required: true,
              prefill: 'tin',
              saveToProfile: 'tin',
              width: 'half',
              row: 'reg',
            },
            // added for online sale
            {
              id: 'contact_person',
              type: 'text',
              label: 'Contact person',
              help: 'Who we should speak to about this proposal.',
              required: true,
              maxLength: 120,
            },
            {
              id: 'postal_address',
              type: 'textarea',
              number: '2',
              label: 'Postal address',
              required: true,
              prefill: 'postalAddress',
              saveToProfile: 'postalAddress',
              maxLength: 200,
            },
            {
              id: 'phone',
              type: 'phone',
              number: '3',
              label: 'Telephone number',
              docLabel: 'Tel.',
              required: true,
              prefill: 'phone',
              width: 'half',
              row: 'contact',
            },
            {
              id: 'email',
              type: 'email',
              label: 'Email',
              docLabel: 'E-mail',
              help: 'We send your certificate and receipts here.',
              required: true,
              prefill: 'email',
              saveToProfile: 'email',
              width: 'half',
              row: 'contact',
            },
            {
              id: 'business',
              type: 'text',
              number: '4',
              label: 'Business or occupation',
              required: true,
              maxLength: 120,
            },
            {
              id: 'trade_occupancy',
              type: 'textarea',
              number: '5',
              label:
                'Trade and/or occupancy: please describe your business and operations for which this insurance is required',
              docLabel:
                'Trade and/or Occupancy: Please describe your Business and Operations for which this insurance is required (factory, shop, warehouse, offices etc)',
              help: 'For example: factory, shop, warehouse, offices.',
              required: true,
              maxLength: 500,
            },
          ],
        },
      ],
    },
    {
      id: 'cover',
      title: 'Cover',
      sections: [
        {
          id: 'cover',
          fields: [
            {
              id: 'cover_start',
              type: 'date',
              number: '6',
              label: 'Period of insurance required: from',
              docLabel: 'Please State the Period of insurance required: From',
              help: 'Usually the date the goods are loaded or leave the supplier.',
              role: 'coverStart',
              required: true,
              minDays: 0,
              maxDays: 60,
              width: 'half',
              row: 'period',
            },
            {
              id: 'cover_end',
              type: 'date',
              label: 'To',
              help: 'Usually when the goods reach your warehouse.',
              role: 'coverEnd',
              required: true,
              minDays: 0,
              maxDays: 430,
              width: 'half',
              row: 'period',
            },
            {
              id: 'sum_insured',
              type: 'money',
              number: '7',
              label: 'Sum insured',
              help: 'Normally the invoice value (CIF), in the invoice currency.',
              currency: 'select',
              role: 'sumInsured',
              required: true,
              min: 1,
              width: 'half',
            },
          ],
        },
      ],
    },
    {
      id: 'cargo',
      title: 'Cargo & voyage',
      sections: [
        {
          id: 'cargo',
          fields: [
            {
              id: 'cargo_type',
              type: 'text',
              number: '8',
              label: 'Name/type of cargo',
              required: true,
              maxLength: 160,
            },
            {
              id: 'cargo_description',
              type: 'textarea',
              number: '9',
              label: 'Description of cargo',
              help: 'Quantity, packing (containers, cartons, bulk) and condition (new or used).',
              required: true,
              maxLength: 600,
            },
            {
              id: 'tracking_id',
              type: 'text',
              number: '10',
              label: 'Any special ID/serial no. to track the cargo',
              help: 'For example: container number, chassis number or bill of lading number.',
              maxLength: 120,
            },
          ],
        },
        {
          id: 'voyage',
          number: '11',
          fields: [
            { id: 'vessel_name', type: 'text', label: 'Name of vessel', required: true, maxLength: 120 },
            {
              id: 'voyage_from',
              type: 'select',
              label: 'Voyage (from what country): from',
              docLabel: 'voyage (from what Country): From',
              options: COUNTRIES_COMMON,
              allowOther: true,
              required: true,
              width: 'half',
              row: 'voyage',
            },
            {
              id: 'voyage_to',
              type: 'select',
              label: 'To',
              options: COUNTRIES_COMMON,
              allowOther: true,
              required: true,
              width: 'half',
              row: 'voyage',
            },
          ],
        },
      ],
    },
    {
      id: 'history',
      title: 'History',
      sections: [
        {
          id: 'history',
          fields: [
            {
              id: 'policy_cancelled',
              type: 'yesno',
              number: '12',
              label: 'Have you ever had any previous policy cancelled?',
              required: true,
              details: {
                when: 'yes',
                label: 'Please state the reason',
                docLabel: 'If yes, please state reason',
              },
            },
            {
              id: 'losses_five_years',
              type: 'yesno',
              number: '13',
              label: 'Have you suffered any loss for the past five years?',
              required: true,
              details: { when: 'yes', label: 'Explain', docLabel: 'If Yes, Explain' },
            },
          ],
        },
      ],
    },
    {
      id: 'documents',
      title: 'Documents',
      description: 'Clear photos are fine. Use your phone camera, or attach files you already have.',
      sections: [
        businessIdentitySection(),
        {
          id: 'shipping_docs',
          title: 'Shipping documents',
          fields: [
            {
              id: 'commercial_invoice',
              type: 'file',
              kind: 'commercial_invoice',
              label: 'Proforma or commercial invoice',
              accept: ['pdf', 'image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 5,
              required: true,
              guidance:
                'The supplier’s invoice showing the goods, quantities, value, currency and terms (FOB, CFR, CIF).',
            },
            {
              id: 'bill_of_lading',
              type: 'file',
              kind: 'bill_of_lading',
              label: 'Bill of lading or airway bill',
              help: 'If the goods have already shipped.',
              accept: ['pdf', 'image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 3,
            },
            {
              id: 'packing_list',
              type: 'file',
              kind: 'packing_list',
              label: 'Packing list',
              accept: ['pdf', 'image'],
              capture: 'environment',
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    paragraphs: [
      'We, the undersigned, desire to effect an insurance as above stated in terms of the Policy to be issued by SERENE INSURANCE LTD.',
    ],
    confirmations: [
      {
        id: 'desire_to_insure',
        label:
          'We wish to take out the insurance stated above on the terms of the policy Serene Insurance will issue.',
      },
    ],
    fields: [
      // added for online sale: capacity of the person signing for the business
      {
        id: 'signatory_position',
        type: 'text',
        label: 'Your position in the business',
        docLabel: 'Capacity of signatory',
        required: true,
        maxLength: 80,
      },
    ],
    signatureLabel: 'Signature of Proposer',
    dateLabel: 'Date',
  },
};
