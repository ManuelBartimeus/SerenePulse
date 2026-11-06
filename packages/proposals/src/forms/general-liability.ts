// GENERAL LIABILITY INSURANCE PROPOSAL FORM
// Source: PROPOSAL FORMS/ACCIDENTS/GL/GENERAL LIABILITY INSURANCE PROPOSAL FORM.docx (and the identical .pdf)
// Numbering as printed: items 1–12 run on across Sections 1 and 2. The paper misnumbers the
// second part of 11 as "iii."; it is (ii) here.
import { WALL_MATERIALS } from '../options';
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

const workInvolves = ['work_heat', 'work_ships', 'work_abroad', 'work_height'] as const;

export const generalLiability: FormDefinition = {
  id: 'general-liability',
  version: 1,
  title: 'GENERAL LIABILITY INSURANCE PROPOSAL FORM',
  source: 'ACCIDENTS/GL/GENERAL LIABILITY INSURANCE PROPOSAL FORM.docx',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'The business to be insured. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          number: 'Section 1',
          title: 'Details of proposer',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              number: '1',
              label: 'Full name of proposer',
              help: 'The registered name of the business.',
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
              id: 'address',
              type: 'textarea',
              number: '2',
              label: 'Address',
              help: 'Business location, with the GhanaPost GPS address if you have one.',
              required: true,
              role: 'riskAddress',
              prefill: 'postalAddress',
              maxLength: 200,
            },
            {
              id: 'postal_code',
              type: 'text',
              label: 'Postal code',
              width: 'half',
              maxLength: 20,
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
          ],
        },
        {
          id: 'period',
          number: '3',
          title: 'Period of insurance',
          fields: [
            {
              id: 'cover_start',
              type: 'date',
              label: 'From',
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
              role: 'coverEnd',
              help: 'Usually one year less a day after the start date.',
              required: true,
              minDays: 1,
              maxDays: 430,
              width: 'half',
              row: 'period',
            },
          ],
        },
      ],
    },
    {
      id: 'business',
      title: 'Business & premises',
      sections: [
        {
          id: 'business',
          number: 'Section 2',
          title: 'Details of your business and premises',
          fields: [
            {
              id: 'business_description',
              type: 'textarea',
              number: '4',
              label: 'Description of your business activities',
              required: true,
              maxLength: 600,
            },
            {
              id: 'years_established',
              type: 'number',
              number: '5',
              label: 'How long has the business been established?',
              min: 0,
              max: 200,
              unit: 'years',
              required: true,
              width: 'half',
            },
          ],
        },
        {
          id: 'premises',
          number: '6',
          fields: [
            // Paper: premises are columns (Premise 1–3) and the questions are rows; one row per premises here.
            {
              id: 'premises',
              type: 'table',
              number: 'a',
              label: 'Your premises',
              docLabel:
                'Please provide more information on the premises in the table below. Should you have more than 3 premises, please provide the details on an additional sheet.',
              required: true,
              minRows: 1,
              printRows: 3,
              addLabel: 'Add another premises',
              columns: [
                { id: 'address', label: 'Address', type: 'text', required: true, weight: 1.8 },
                {
                  id: 'description',
                  label: 'Description of business e.g. office',
                  type: 'text',
                  required: true,
                },
                {
                  id: 'construction',
                  label: 'Construction of premises e.g. brick',
                  type: 'select',
                  options: WALL_MATERIALS,
                  required: true,
                },
                { id: 'age', label: 'Approximate age', type: 'number', unit: 'years' },
                { id: 'built_for', label: 'What purpose was it built for?', type: 'text' },
                { id: 'storeys', label: 'No. of storeys', type: 'number' },
              ],
            },
            {
              id: 'prior_use_known',
              type: 'yesno',
              number: 'b',
              label:
                'If you are the owner or lessee, are you aware of the use to which the land/premises was put prior to your occupation?',
              required: true,
              details: {
                when: 'yes',
                label: 'Please provide more details',
                docLabel: 'If yes, please provide more details',
              },
            },
          ],
        },
        {
          id: 'condition',
          fields: [
            {
              id: 'good_condition',
              type: 'yesno',
              number: '7',
              label:
                'Are your premises, together with your plant, equipment, and machinery in good condition and well maintained?',
              required: true,
            },
          ],
        },
      ],
    },
    {
      id: 'operations',
      title: 'Work & hazards',
      sections: [
        {
          id: 'manual_work',
          fields: [
            {
              id: 'manual_work',
              type: 'yesno',
              number: '8',
              label: 'Will you undertake any manual work within or away from your premises?',
              required: true,
            },
          ],
        },
        {
          id: 'work_involves',
          number: '9',
          title: 'Does any of this work involve:',
          showIf: { field: 'manual_work', equals: 'yes' },
          fields: [
            {
              id: 'work_heat',
              type: 'yesno',
              number: 'i',
              label:
                'The application of heat (e.g. use of welding equipment, blowlamps or hot air strippers)?',
              docLabel:
                'the application of heat (e.g. use of welding equipment, blowlamps or no air strippers)?',
              required: true,
            },
            {
              id: 'work_ships',
              type: 'yesno',
              number: 'ii',
              label:
                'Any work on ships, at airports, chemical works, at offshore structures, oil or gas refineries?',
              docLabel:
                'Any work on ships, at airports, chemical works at offshore structures, oil or gas refineries?',
              required: true,
            },
            {
              id: 'work_abroad',
              type: 'yesno',
              number: 'iii',
              label: 'Any work outside the country?',
              required: true,
            },
            {
              id: 'work_height',
              type: 'yesno',
              number: 'iv',
              label: 'Work at a height above 10 metres or underground?',
              required: true,
            },
            {
              id: 'hazardous_work',
              type: 'table',
              label: 'Nature of work and approximate percentage',
              docLabel:
                'If you ticked Yes to questions 9 (i), (ii), (iii) or (iv), please provide details and indicate the approximate percentage proportion of works undertaken',
              required: true,
              minRows: 1,
              printRows: 3,
              addLabel: 'Add another type of work',
              showIf: { any: workInvolves.map((f) => ({ field: f, equals: 'yes' })) },
              columns: [
                { id: 'nature', label: 'Nature of work', type: 'text', required: true, weight: 2.5 },
                { id: 'percentage', label: 'Percentage (%)', type: 'number', unit: '%', required: true },
              ],
            },
          ],
        },
        {
          id: 'subcontract',
          number: '10',
          fields: [
            {
              id: 'subcontracts',
              type: 'yesno',
              label: 'Do you sub-contract any work?',
              required: true,
            },
            {
              id: 'subcontractor_insurance',
              type: 'yesno',
              number: 'i',
              label:
                'Do you ensure that the sub-contractors have adequate liability insurances in force with an indemnity limit at least as high as that which you are arranging, and that such insurances are maintained in force?',
              docLabel:
                'Do you ensure that the sub-contractors have adequate liability insurances in force with an indemnity limit at least as high as that which you are arranging and do you ensure that such insurance are maintained in force.',
              required: true,
              showIf: { field: 'subcontracts', equals: 'yes' },
            },
            {
              id: 'subcontracted_work',
              type: 'table',
              number: 'ii',
              label: 'Details of the work sub-contracted and estimated payments annually',
              required: true,
              minRows: 1,
              printRows: 3,
              addLabel: 'Add another',
              showIf: { field: 'subcontracts', equals: 'yes' },
              columns: [
                { id: 'nature', label: 'Nature of work', type: 'text', required: true, weight: 2.5 },
                { id: 'payments', label: 'Payments/fees (GH₵)', type: 'money', required: true },
              ],
            },
          ],
        },
        {
          id: 'hazardous',
          number: '11',
          fields: [
            {
              id: 'hazardous_substances',
              type: 'yesno',
              number: 'i',
              label:
                'Do you handle, store or transport any hazardous substances such as toxic chemicals, explosive substances, gases, asbestos, radioactive substances or any materials giving rise to dust, fumes or vapours?',
              required: true,
              details: {
                when: 'yes',
                label: 'Please provide more details',
                docLabel: 'If yes, please provide more details',
              },
            },
            {
              id: 'hazardous_waste',
              type: 'yesno',
              number: 'ii',
              label:
                'Do you handle, store or transport any hazardous waste product (e.g. toxic chemicals, gases, acids, radioactive substances, dust, fumes or vapours) into the atmosphere, grounds, sewers, waterways or elsewhere?',
              required: true,
            },
            {
              id: 'waste_type',
              type: 'text',
              label: 'Type of waste',
              required: true,
              showIf: { field: 'hazardous_waste', equals: 'yes' },
              maxLength: 200,
            },
            {
              id: 'waste_storage_disposal',
              type: 'text',
              label: 'Storage and disposal methods',
              required: true,
              showIf: { field: 'hazardous_waste', equals: 'yes' },
              maxLength: 300,
            },
            {
              id: 'waste_treatment',
              type: 'text',
              label: 'Treatment of waste',
              required: true,
              showIf: { field: 'hazardous_waste', equals: 'yes' },
              maxLength: 300,
            },
            {
              id: 'waste_licences',
              type: 'text',
              label: 'Disposal licences held',
              docLabel: 'Disposal licenses held',
              showIf: { field: 'hazardous_waste', equals: 'yes' },
              maxLength: 200,
            },
          ],
        },
        {
          id: 'abroad',
          fields: [
            {
              id: 'represented_abroad',
              type: 'yesno',
              number: '12',
              label:
                'Are you represented in any form (e.g. branch office, subsidiary or associated company, sales office, agent holding power of attorney) in another country?',
              required: true,
              details: {
                when: 'yes',
                label: 'Please provide more details',
                docLabel: 'If yes, please provide more details',
              },
            },
          ],
        },
      ],
    },
    {
      id: 'cover',
      title: 'Cover & claims',
      sections: [
        {
          id: 'limits',
          number: 'Section 3',
          title: 'Coverage limits required',
          description:
            'Please provide the following information. Leave a line blank if you do not need that cover.',
          fields: [
            {
              id: 'public_liability_per_occurrence',
              type: 'money',
              number: '1',
              label: 'Public liability: per occurrence',
              docLabel: 'Public Liability – Per Occurrence (GH₵)',
              // The public liability limit is the main limit of indemnity of this policy.
              role: 'sumInsured',
              min: 1,
              required: true,
              width: 'half',
              row: 'public',
            },
            {
              id: 'public_liability_aggregate',
              type: 'money',
              label: 'Public liability: aggregate limit',
              docLabel: 'Aggregate Limit (GH₵)',
              width: 'half',
              row: 'public',
            },
            {
              id: 'product_liability_per_occurrence',
              type: 'money',
              number: '2',
              label: 'Product liability: per occurrence',
              docLabel: 'Product Liability – Per Occurrence (GH₵)',
              width: 'half',
              row: 'product',
            },
            {
              id: 'product_liability_aggregate',
              type: 'money',
              label: 'Product liability: aggregate limit',
              docLabel: 'Aggregate Limit (GH₵)',
              width: 'half',
              row: 'product',
            },
            {
              id: 'pollution_liability_per_occurrence',
              type: 'money',
              number: '3',
              label: 'Pollution liability: per occurrence',
              docLabel: 'Pollution Liability – Per Occurrence (GH₵)',
              width: 'half',
              row: 'pollution',
            },
            {
              id: 'pollution_liability_aggregate',
              type: 'money',
              label: 'Pollution liability: aggregate limit',
              docLabel: 'Aggregate Limit (GH₵)',
              width: 'half',
              row: 'pollution',
            },
            {
              id: 'auto_liability_per_occurrence',
              type: 'money',
              number: '4',
              label: 'Auto liability: per occurrence',
              docLabel: 'Auto Liability – Per Occurrence (GH₵)',
              width: 'half',
              row: 'auto',
            },
            {
              id: 'auto_liability_aggregate',
              type: 'money',
              label: 'Auto liability: aggregate limit',
              docLabel: 'Aggregate Limit (GH₵)',
              width: 'half',
              row: 'auto',
            },
            {
              id: 'estimated_turnover',
              type: 'money',
              label: 'Total estimated turnover for the next 12 months',
              docLabel: 'Total estimated turnover to the next 12 months',
              required: true,
              width: 'half',
            },
          ],
        },
        {
          id: 'claims',
          number: 'Section 4',
          title: 'Claim experience',
          fields: [
            {
              id: 'claims_experience',
              type: 'textarea',
              label: 'Claim experience for the last 5 years',
              docLabel: 'Please provide details for the last 5 years',
              help: 'For each claim: the year, what happened, the amount paid and anything still outstanding. Write “None” if you have had no claims.',
              required: true,
              maxLength: 2000,
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
          id: 'risk_docs',
          title: 'Supporting documents',
          fields: [
            {
              id: 'additional_premises_sheet',
              type: 'file',
              kind: 'premises_schedule',
              label: 'Additional sheet of premises (if more than 3)',
              accept: ['image', 'pdf'],
              multiple: true,
              maxFiles: 3,
            },
            {
              id: 'premises_photos',
              type: 'file',
              kind: 'premises_photos',
              label: 'Photos of the premises (optional)',
              help: 'The outside, the main work areas and any safety measures.',
              accept: ['image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 6,
            },
            {
              id: 'waste_disposal_licence',
              type: 'file',
              kind: 'waste_disposal_licence',
              label: 'Waste disposal licence(s)',
              showIf: { field: 'hazardous_waste', equals: 'yes' },
              accept: ['image', 'pdf'],
              capture: 'environment',
              multiple: true,
              maxFiles: 3,
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    title: 'DECLARATION',
    paragraphs: [
      'I/We hereby declare and warrant that the articles mentioned above are my own property and that the above questions are fully and truthfully answered, that I/We have not withheld or concealed any circumstance affecting the proposed insurance and I/We agree that this declaration shall be deemed to be of a promissory nature and effect and the basis of the contract between me and SERENE INSURANCE GHANA LIMITED and I am willing to accept the Company’s Policy subject to the terms and conditions prescribed by the Company therein and to pay the premium thereon.',
      '(Liability does not commence until the Proposal has been accepted by the Company and the first Premium paid.)',
    ],
    confirmations: [
      {
        id: 'true_and_complete',
        label:
          'The questions are fully and truthfully answered and nothing affecting this insurance has been withheld.',
      },
      {
        id: 'basis_of_contract',
        label:
          'This declaration is the basis of the contract, and we accept the policy terms and will pay the premium.',
      },
      {
        id: 'cover_not_yet',
        label: 'Cover does not start until Serene accepts the proposal and the first premium is paid.',
      },
    ],
    fields: [
      // added for online sale: capacity of the person signing for the company
      {
        id: 'signatory_position',
        type: 'text',
        label: 'Position of the person signing',
        docLabel: 'Capacity',
        help: 'For example Managing Director.',
        required: true,
        maxLength: 80,
      },
    ],
    signatureLabel: 'Signature',
    dateLabel: 'Date',
  },
};
