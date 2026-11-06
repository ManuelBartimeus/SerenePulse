// PERSONAL ACCIDENT INSURANCE PROPOSAL FORM
// Source: PROPOSAL FORMS/ACCIDENTS/PA/PA PROPOSAL FORM FINAL.pdf (numbering A–I; same wording as the
// FINAL .docx). The older "PA PROPOSAL FORM.pdf" has the same questions with the previous address.
import { individualIdentitySection } from '../kyc';
import { GHANA_INSURERS, ID_TYPES } from '../options';
import type { FormDefinition } from '../schema';

const hasPrevious = { field: 'previous_pa', equals: 'yes' } as const;

export const personalAccident: FormDefinition = {
  id: 'personal-accident',
  version: 1,
  title: 'PERSONAL ACCIDENT INSURANCE PROPOSAL FORM',
  source: 'ACCIDENTS/PA/PA PROPOSAL FORM FINAL.pdf',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'As they appear on your ID. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          number: 'A',
          title: 'Proposer’s details',
          fields: [
            {
              id: 'full_name',
              type: 'text',
              number: '1',
              label: 'Full name of applicant/insured',
              docLabel: 'Full Name of Applicant/Company/Insured',
              required: true,
              prefill: 'fullName',
              saveToProfile: 'fullName',
              role: 'insuredName',
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
              row: 'phone',
            },
            {
              id: 'occupation',
              type: 'text',
              number: '4',
              label: 'Business or occupation',
              help: 'Your actual job and what it involves, for example: site engineer, visits construction sites.',
              required: true,
              prefill: 'occupation',
              saveToProfile: 'occupation',
              width: 'half',
              row: 'phone',
              maxLength: 120,
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
            },
            // added for online sale
            {
              id: 'id_type',
              type: 'select',
              label: 'ID type',
              options: ID_TYPES,
              required: true,
              prefill: 'idType',
              saveToProfile: 'idType',
              width: 'half',
              row: 'id',
            },
            // added for online sale
            {
              id: 'id_number',
              type: 'text',
              label: 'ID number',
              docLabel: 'ID no.',
              help: 'Your Ghana Card number, for example GHA-123456789-0.',
              required: true,
              prefill: 'idNumber',
              saveToProfile: 'idNumber',
              width: 'half',
              row: 'id',
              maxLength: 30,
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
          id: 'company_policy',
          number: 'B',
          title: 'Company’s policy',
          fields: [
            {
              id: 'standard_cover',
              type: 'read',
              label: 'The Company’s standard cover provides the following benefits',
              paragraphs: [
                'The Company’s standard cover provides the following benefits',
                'a. Death Benefit: 100% of Capital Sums Insured',
                'b. Permanent Total Disability Benefit: 100% of Capital Sums Insured',
                'c. Temporary Total Disability Benefit: 1/52 of Annual Salary per week for 52 weeks',
                'd. Medical Benefit: 5% of Capital Sum',
                '(However, the applicant/Insured has the option to determine the limits of benefits preferable or adequate for (c) and (d) above).',
              ],
              acknowledge: 'I have read the standard benefits of this policy.',
            },
            {
              id: 'medical_increase_percent',
              type: 'percent',
              number: 'e',
              label: 'If you wish to increase your medical expenses, kindly state the percentage',
              help: 'Of the capital sum, instead of the standard 5%. Leave blank to keep 5%.',
              min: 5,
              max: 100,
              width: 'half',
            },
            {
              id: 'burns_disfigurement',
              type: 'yesno',
              number: 'f',
              label: 'Burns disfigurement?',
              help: 'Do you want cover for disfigurement caused by burns?',
              required: true,
            },
          ],
        },
        {
          id: 'capital_sum',
          fields: [
            {
              // Not on the paper form: the premium is a rate on the capital sum by occupation class.
              id: 'occupation_class',
              type: 'radio',
              label: 'Which best describes your occupation?',
              docLabel: 'Occupation class',
              help: 'The underwriter confirms the class from your occupation.',
              required: true,
              options: [
                {
                  value: 'class_1',
                  label: 'Class I: clerical and professional',
                  hint: 'Office, administrative and professional work, e.g. accountant, teacher, banker',
                },
                {
                  value: 'class_2',
                  label: 'Class II: non-clerical',
                  hint: 'Supervisory or light manual work, travel or site visits, e.g. sales rep, engineer, nurse',
                },
                {
                  value: 'class_3',
                  label: 'Class III: hazardous',
                  hint: 'Heavy manual work, machinery, heights or driving for a living, e.g. builder, mechanic, driver',
                },
              ],
            },
            {
              id: 'capital_sum',
              type: 'money',
              number: 'F',
              label: 'What is the capital sum to be insured?',
              help: 'The amount paid on accidental death or permanent total disability.',
              role: 'sumInsured',
              min: 1,
              required: true,
              width: 'half',
            },
          ],
        },
        {
          id: 'period',
          number: 'I',
          fields: [
            {
              id: 'cover_start',
              type: 'date',
              label: 'Proposed period of insurance from',
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
      id: 'health',
      title: 'Health & beneficiary',
      sections: [
        {
          id: 'health',
          number: 'C',
          fields: [
            {
              // The paper refers to a "declaration list attached hereto"; online the impairment is
              // described here instead.
              id: 'impairment',
              type: 'yesno',
              label: 'Do you (the applicant/insured to be insured) suffer from any impairment of health?',
              docLabel: 'Do applicant/Insured to be insured under suffer from any Impairment of health?',
              required: true,
              details: {
                when: 'yes',
                label: 'Describe the impairment',
                docLabel: 'If so, impairment must be indicated in the declaration list attached hereto',
              },
            },
          ],
        },
        {
          id: 'beneficiary',
          number: 'D',
          fields: [
            {
              id: 'beneficiaries',
              type: 'table',
              label: 'Who should receive the benefit in the event of a death claim?',
              docLabel:
                'Who is considered the beneficiary in the event of a death claim? Please state the Name & Relationship of beneficiary',
              required: true,
              minRows: 1,
              maxRows: 5,
              printRows: 1,
              addLabel: 'Add a beneficiary',
              columns: [
                { id: 'name', label: 'Name', type: 'text', required: true, weight: 2 },
                { id: 'relationship', label: 'Relationship', type: 'text', required: true },
              ],
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
          id: 'previous',
          number: 'E',
          fields: [
            {
              id: 'previous_pa',
              type: 'yesno',
              label: 'Do you have any existing or previous personal accident insurance?',
              required: true,
            },
            {
              id: 'previous_insurer',
              type: 'select',
              number: 'i',
              label: 'The name of the insurance company',
              options: GHANA_INSURERS,
              allowOther: true,
              required: true,
              showIf: hasPrevious,
              width: 'half',
            },
            {
              id: 'previous_capital_sum',
              type: 'money',
              number: 'ii',
              label: 'The capital sum',
              min: 0,
              showIf: hasPrevious,
              width: 'half',
            },
            {
              id: 'previous_date_issued',
              type: 'date',
              number: 'iii',
              label: 'Date issued',
              maxDays: 0,
              showIf: hasPrevious,
              width: 'half',
              row: 'previous_dates',
            },
            {
              id: 'previous_expiry',
              type: 'date',
              number: 'iv',
              label: 'Expiry date',
              showIf: hasPrevious,
              width: 'half',
              row: 'previous_dates',
            },
          ],
        },
        {
          id: 'declined',
          number: 'G',
          fields: [
            {
              id: 'previously_declined',
              type: 'yesno',
              label:
                'Has any insurance company declined your proposals for cover or refused renewal of your policy?',
              required: true,
              details: { when: 'yes', label: 'Give details', docLabel: 'If yes, give details' },
            },
          ],
        },
        {
          id: 'claims',
          number: 'H',
          fields: [
            {
              id: 'recent_claims',
              type: 'yesno',
              number: 'a',
              label: 'Have there been any accidents/claims in your company/association in the last 3 years?',
              docLabel:
                'Have there been any accident/claims in your company/association in the last 3 years?',
              help: 'Or, for you personally, in the last 3 years.',
              required: true,
            },
            {
              id: 'claims_history',
              type: 'table',
              label: 'Please give details',
              docLabel: 'If yes, please give details',
              required: true,
              minRows: 1,
              maxRows: 3,
              printRows: 3,
              addLabel: 'Add a year',
              showIf: { field: 'recent_claims', equals: 'yes' },
              columns: [
                { id: 'year', label: 'Year', type: 'year', required: true },
                { id: 'number', label: 'No. of accidents/claims', type: 'number', required: true },
                { id: 'amount', label: 'Amount of claims', type: 'money', required: true },
                { id: 'outstanding', label: 'Claims outstanding', type: 'money' },
              ],
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
        individualIdentitySection(),
        {
          id: 'medical_docs',
          title: 'Health',
          showIf: { field: 'impairment', equals: 'yes' },
          fields: [
            {
              id: 'medical_report',
              type: 'file',
              kind: 'medical_report',
              label: 'Medical report on the impairment (if you have one)',
              accept: ['image', 'pdf'],
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
      'I declare and warrant that the above statements are complete and true in every respect and that no material information has been withheld or suppressed. I agree to give notice to the Company of any variation in my profession or occupation, health, or pursuits and that this declaration shall be held to be promissory and shall form the basis of the Contract between me and SERENE Insurance. I further agree to accept this policy subject to the terms, provisions and conditions prescribed by the Company therein.',
    ],
    confirmations: [
      {
        id: 'true_and_complete',
        label: 'The statements above are complete and true, and no material information has been withheld.',
      },
      {
        id: 'notify_changes',
        label: 'I will tell Serene of any change in my profession or occupation, health or pursuits.',
      },
      {
        id: 'basis_of_contract',
        label:
          'This declaration forms the basis of my contract, and I accept the policy on the Company’s terms.',
      },
    ],
    signatureLabel: 'Signature of Proposer',
    dateLabel: 'Date',
  },
};
