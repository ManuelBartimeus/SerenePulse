// PLANT & MACHINERY INSURANCE PROPOSAL FORM
// Source: PROPOSAL FORMS/ENGINEERING/PLANT  MACH PROPOSAL FORM.pdf (the only version).
// The paper form has no period of insurance; one is added in the Cover step and printed in the
// signature block (rule 6).
import { GHANA_INSURERS } from '../options';
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

export const plantMachinery: FormDefinition = {
  id: 'plant-machinery',
  version: 1,
  title: 'PLANT & MACHINERY INSURANCE PROPOSAL FORM',
  source: 'ENGINEERING/PLANT  MACH PROPOSAL FORM.pdf',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'The business that owns the plant and machinery. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              number: '1',
              label: 'Name of proposer',
              help: 'The registered name of the business.',
              required: true,
              prefill: 'companyName',
              saveToProfile: 'companyName',
              role: 'insuredName',
              maxLength: 160,
            },
            {
              id: 'address',
              type: 'textarea',
              number: '2',
              label: 'Address',
              help: 'Postal address and office location.',
              required: true,
              prefill: 'postalAddress',
              saveToProfile: 'postalAddress',
              maxLength: 240,
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
            // added for online sale
            {
              id: 'phone',
              type: 'phone',
              label: 'Telephone number',
              required: true,
              prefill: 'phone',
              width: 'half',
              row: 'contact',
            },
            // added for online sale
            {
              id: 'email',
              type: 'email',
              label: 'Email address',
              help: 'We send your policy documents and receipts here.',
              required: true,
              prefill: 'email',
              saveToProfile: 'email',
              width: 'half',
              row: 'contact',
            },
            {
              id: 'business',
              type: 'text',
              number: '3',
              label: 'Occupation or business',
              required: true,
              maxLength: 120,
            },
            {
              id: 'years_in_business',
              type: 'number',
              number: '4',
              label: 'How long have you been in business?',
              unit: 'years',
              min: 0,
              max: 150,
              required: true,
              width: 'half',
            },
          ],
        },
      ],
    },
    {
      id: 'plant',
      title: 'Plant & machinery',
      sections: [
        {
          id: 'location',
          fields: [
            {
              id: 'plant_location',
              type: 'textarea',
              number: '5',
              label: 'Location of plant and machinery',
              help: 'Site or yard address, with the GhanaPost GPS address if it has one.',
              role: 'riskAddress',
              required: true,
              maxLength: 300,
            },
            {
              id: 'transferred',
              type: 'yesno',
              number: '6',
              label:
                'Will some or all the plant and machinery be at any time transferred from the location named in (5) above to another place?',
              required: true,
              details: {
                when: 'yes',
                label: 'State the purpose of transfer',
                docLabel: 'If so, state purpose of transfer',
              },
            },
            {
              id: 'transit_risk',
              type: 'yesno',
              number: '7',
              label: 'Would you like the policy to cover transit risk?',
              docLabel: 'Do you like the policy to cover transit risk',
              required: true,
            },
          ],
        },
        {
          id: 'description',
          number: '8',
          title: 'Description of plant and machinery (attached list)',
          fields: [
            {
              id: 'plant_items',
              type: 'table',
              label: 'Description of plant and machinery',
              help: 'List each item here, or attach your own list in the Documents step and enter the main items.',
              required: true,
              minRows: 1,
              printRows: 4,
              addLabel: 'Add another item',
              columns: [
                { id: 'name_type', label: 'Name / type', type: 'text', required: true, weight: 1.5 },
                { id: 'serial_make', label: 'Serial no. & make', type: 'text', required: true, weight: 1.5 },
                { id: 'manufacturer', label: 'Name of manufacturer', type: 'text' },
                { id: 'value', label: 'Value', type: 'money', required: true },
              ],
            },
            {
              id: 'total_value',
              type: 'money',
              label: 'Total value',
              help: 'The total of the values above (or of your attached list).',
              required: true,
              min: 1,
              width: 'half',
            },
            {
              id: 'total_sum_insured',
              type: 'money',
              number: '9',
              label: 'Total sum insured',
              help: 'Usually the same as the total value.',
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
      id: 'history',
      title: 'History & cover',
      sections: [
        {
          id: 'history',
          fields: [
            {
              id: 'previous_loss',
              type: 'yesno',
              number: '10',
              label: 'Has the proposer ever suffered loss or damage to any plant or machinery?',
              required: true,
              details: { when: 'yes', label: 'Give details', docLabel: 'If so give details' },
            },
            {
              id: 'refused_or_cancelled',
              type: 'yesno',
              number: '11',
              label:
                'Has any insurance company or underwriter ever refused a proposal from you, or cancelled or refused to renew a policy?',
              required: true,
            },
            {
              id: 'refusing_insurer',
              type: 'select',
              label: 'Name of the company concerned',
              docLabel: 'If so, state name of company concerned',
              options: GHANA_INSURERS,
              allowOther: true,
              required: true,
              showIf: { field: 'refused_or_cancelled', equals: 'yes' },
            },
            {
              id: 'insured_elsewhere',
              type: 'yesno',
              number: '12',
              label:
                'Is/are the plant and machinery proposed for insurance already insured with another company?',
              required: true,
              details: {
                when: 'yes',
                label: 'Give details (insurer, policy number, sum insured)',
                docLabel: 'If so give details',
              },
            },
          ],
        },
        {
          id: 'period',
          title: 'Period of insurance',
          fields: [
            {
              id: 'cover_start',
              type: 'date',
              label: 'Insurance to commence on',
              role: 'coverStart',
              required: true,
              minDays: 0,
              maxDays: 60,
              docPlacement: 'declaration',
              width: 'half',
              row: 'period',
            },
            {
              id: 'cover_end',
              type: 'date',
              label: 'To expire on',
              help: 'Usually one year less a day after the start date.',
              role: 'coverEnd',
              required: true,
              minDays: 1,
              maxDays: 430,
              docPlacement: 'declaration',
              width: 'half',
              row: 'period',
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
          id: 'plant_docs',
          title: 'Plant and machinery',
          fields: [
            {
              id: 'plant_list',
              type: 'file',
              kind: 'plant_machinery_schedule',
              label: 'Attached list of plant and machinery',
              docLabel: 'Description of plant and machinery (attached list)',
              help: 'Your own list with serial numbers, makes and values, if you have more items than you entered.',
              accept: ['pdf', 'image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 5,
            },
            {
              id: 'plant_photos',
              type: 'file',
              kind: 'plant_photos',
              label: 'Photos of the plant and machinery, with serial plates',
              accept: ['image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 12,
              guidance: 'One photo of each machine, and one of its serial/chassis plate.',
            },
            {
              id: 'ownership_documents',
              type: 'file',
              kind: 'plant_ownership_documents',
              label: 'Purchase invoices or valuation report',
              accept: ['pdf', 'image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 10,
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    title: 'Declaration',
    paragraphs: [
      'I declare that the information provided is to the best of my knowledge true and will constitute the basis of the insurance and will regulate the rate of the premium.',
    ],
    confirmations: [
      { id: 'true', label: 'The information provided is true to the best of my knowledge.' },
      {
        id: 'basis_of_insurance',
        label: 'It will be the basis of the insurance and will set the rate of the premium.',
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
      {
        id: 'agent',
        type: 'text',
        number: '14',
        label: 'Agent (if any)',
        docLabel: 'Agent',
        help: 'Leave blank if you are buying directly from Serene.',
        maxLength: 120,
      },
    ],
    signatureLabel: 'Signature of Proposer',
    dateLabel: 'Date',
  },
};
