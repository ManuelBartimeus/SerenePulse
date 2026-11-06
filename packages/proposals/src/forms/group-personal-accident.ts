// GROUP PERSONAL ACCIDENT INSURANCE PROPOSAL FORM
// Source: PROPOSAL FORMS/ACCIDENTS/GPA/GPA PROPOSAL FORMS-ORIGINAL.docx
// The GPA folder also holds "GPA.docx", "GPA.pdf" and "GPA proposal form.pdf"; despite the title
// ("GROUP PERSONAL INSURANCE PROPOSAL FORM") those are copies of the workmen's compensation form
// (wage roll, wages book declaration), so the ORIGINAL docx is the real GPA proposal form.
// The "MG MANAGEMENT CONSULT" files are issued policies (ages 18–60, benefits A–D), not proposals.
// Numbering follows the docx list numbering: sections A–I, items 1–4, (i)–(v) and (a)–(g).
import { GHANA_INSURERS } from '../options';
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

export const groupPersonalAccident: FormDefinition = {
  id: 'group-personal-accident',
  version: 1,
  title: 'GROUP PERSONAL ACCIDENT INSURANCE PROPOSAL FORM',
  source: 'ACCIDENTS/GPA/GPA PROPOSAL FORMS-ORIGINAL.docx',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description:
        'The company, association or employer applying for the cover. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          number: 'A',
          title: 'Proposers details',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              number: '1',
              label: 'Full name of applicant / company / insured',
              docLabel: 'Full Name of Applicant/Company/Insured',
              help: 'The registered name of the company, association or employer.',
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
              row: 'tel',
            },
            {
              id: 'occupation',
              type: 'text',
              number: '4',
              label: 'Business or occupation',
              required: true,
              width: 'half',
              row: 'tel',
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
          ],
        },
      ],
    },
    {
      id: 'staff',
      title: 'Staff',
      description: 'Who is to be insured. You can type the list here or attach it in the Documents step.',
      sections: [
        {
          id: 'activities',
          number: 'B',
          fields: [
            {
              id: 'activities_description',
              type: 'textarea',
              label: 'Description of activities / business or occupation',
              required: true,
              maxLength: 600,
            },
          ],
        },
        {
          id: 'categories',
          title: 'Please give number of employees/workers/members in the following categories',
          fields: [
            {
              id: 'count_administration',
              type: 'number',
              number: 'i',
              label: 'Administration (non-manual labour)',
              min: 0,
              unit: 'people',
              width: 'half',
            },
            {
              id: 'count_supervisory',
              type: 'number',
              number: 'ii',
              label: 'Supervisory roles',
              min: 0,
              unit: 'people',
              width: 'half',
            },
            {
              id: 'count_supervisory_working',
              type: 'number',
              number: 'iii',
              label: 'Supervisory & working roles',
              min: 0,
              unit: 'people',
              width: 'half',
            },
            {
              id: 'count_working',
              type: 'number',
              number: 'iv',
              label: 'Working roles (manual labour)',
              min: 0,
              unit: 'people',
              width: 'half',
            },
            {
              id: 'count_other',
              type: 'number',
              number: 'v',
              label: 'Other',
              docLabel: 'Other (please give details)',
              min: 0,
              unit: 'people',
              width: 'half',
              row: 'other',
            },
            {
              id: 'count_other_details',
              type: 'text',
              label: 'Details of other category',
              showIf: {
                all: [{ field: 'count_other', truthy: true }, { not: { field: 'count_other', equals: 0 } }],
              },
              required: true,
              width: 'half',
              row: 'other',
              maxLength: 200,
            },
          ],
        },
        {
          id: 'declaration_list',
          number: 'C',
          title: 'Group personal accident insurance – declaration list',
          description:
            'Please give names of employees/workers/members to be insured and the respective Capital Sums to be insured as per declaration list attached hereto.',
          fields: [
            {
              id: 'employees',
              type: 'table',
              label: 'Declaration list',
              docLabel: 'GROUP PERSONAL ACCIDENT INSURANCE – DECLARATION LIST',
              help: 'If you have a long staff list, you can attach it in the Documents step instead.',
              printRows: 10,
              addLabel: 'Add another person',
              // Paper columns: name, occupation/rank, annual salary, benefit required (capital sum /
              // permanent disability, temporary disability weekly benefit, medical expenses).
              // Date of birth and beneficiary were added at the underwriting lead's request (the policy
              // covers ages 18–60 and section E asks who is paid); impairment is the column question D
              // asks for ("impairment must be indicated in the declaration list").
              columns: [
                { id: 'name', label: 'Name of employee', type: 'text', required: true, weight: 1.6 },
                { id: 'occupation', label: 'Occupation / rank', type: 'text', required: true, weight: 1.2 },
                { id: 'date_of_birth', label: 'Date of birth', type: 'date' },
                { id: 'annual_salary', label: 'Annual salary', type: 'money' },
                {
                  id: 'capital_sum',
                  label: 'Capital sum / permanent disability',
                  type: 'money',
                  required: true,
                },
                { id: 'weekly_benefit', label: 'Temporary disability (weekly benefit)', type: 'money' },
                { id: 'medical_expenses', label: 'Medical expenses', type: 'money' },
                { id: 'impairment', label: 'Impairment of health (if any)', type: 'text' },
                { id: 'beneficiary', label: 'Beneficiary', type: 'text', weight: 1.2 },
              ],
            },
            {
              id: 'employees_note',
              type: 'read',
              label: 'If members are more than ten',
              paragraphs: ['(If member are more than ten, kindly attached a sheet)'],
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
          id: 'benefits',
          title: 'Notes',
          fields: [
            {
              id: 'standard_cover_notice',
              type: 'read',
              label: 'The Company’s standard cover provides the following benefits',
              paragraphs: [
                '(a) Death Benefit: 100% of Capital Sums Insured',
                '(b) Permanent Total Disability Benefit: 100% of Capital Sums Insured',
                '(c) Temporary Total Disability Benefit: 1/52 of Annual Salary per week for 52 weeks',
                '(d) Medical Benefit: 5% of Capital Sum',
                '(However, the applicant/Company/Insured has the option to determine the limits of benefits preferable or adequate for (c) and (d) above).',
              ],
              acknowledge: 'I have read the standard benefits of this cover.',
            },
            {
              id: 'medical_increase_percent',
              type: 'percent',
              number: 'e',
              label: 'Increased medical expenses (percentage of capital sum)',
              docLabel: 'If you wish to increase your medical expenses kindly state the percentage',
              help: 'Leave blank to keep the standard 5% of the capital sum.',
              width: 'half',
            },
            // The paper prints "Business Limitations" as item (f) with no answer space or boxes;
            // kept as an optional free-text answer so nothing on the form is lost.
            {
              id: 'business_limitations',
              type: 'textarea',
              number: 'f',
              label: 'Business limitations (if any)',
              docLabel: 'Business Limitations',
              help: 'For example, if cover should apply only during working hours or only on business duties.',
              maxLength: 400,
            },
            {
              id: 'burns_disfigurement',
              type: 'yesno',
              number: 'g',
              label: 'Do you require cover for burns disfigurement?',
              docLabel: 'Burns Disfigurement?',
              required: true,
            },
          ],
        },
        {
          id: 'impairment',
          number: 'D',
          fields: [
            {
              id: 'impairment_of_health',
              type: 'yesno',
              label:
                'Do any of the employees/workers/members to be insured suffer from any impairment of health?',
              docLabel:
                'Do employee/workers/members to be insured under suffer from any Impairment of health?',
              help: 'If so, impairment must be indicated in the declaration list (the “Impairment of health” column, or on the list you attach).',
              required: true,
            },
          ],
        },
        {
          id: 'beneficiary',
          number: 'E',
          fields: [
            // Paper: a Yes/No box beside each of (i) and (ii); they are alternatives, so one choice.
            {
              id: 'beneficiary',
              type: 'radio',
              label: 'Who is considered the beneficiary in the event of claim?',
              docLabel: 'Who is considered the beneficiary in the event of claim:',
              required: true,
              options: [
                { value: 'applicant', label: '(i) The applicant/principal/association/company' },
                {
                  value: 'insured',
                  label: '(ii) The insured or in the case of death the legal representative',
                },
              ],
            },
          ],
        },
        {
          id: 'period',
          number: 'I',
          title: 'Proposed period of insurance',
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
      id: 'history',
      title: 'History',
      sections: [
        {
          id: 'previous_insurance',
          number: 'F',
          fields: [
            {
              id: 'previous_gpa',
              type: 'yesno',
              label: 'Do you have any existing or previous Group Personal Accident Insurance?',
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
              showIf: { field: 'previous_gpa', equals: 'yes' },
              width: 'half',
            },
            {
              id: 'previous_capital_sum',
              type: 'money',
              number: 'ii',
              label: 'The capital sum',
              required: true,
              showIf: { field: 'previous_gpa', equals: 'yes' },
              width: 'half',
            },
            {
              id: 'previous_date_issued',
              type: 'date',
              number: 'iii',
              label: 'Date issued',
              required: true,
              showIf: { field: 'previous_gpa', equals: 'yes' },
              width: 'half',
              row: 'previous_dates',
            },
            {
              id: 'previous_expiry_date',
              type: 'date',
              number: 'iv',
              label: 'Expiry date',
              required: true,
              showIf: { field: 'previous_gpa', equals: 'yes' },
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
              id: 'declined',
              type: 'yesno',
              label:
                'Has any insurance company declined your proposals for cover or refused renewal of your policy?',
              required: true,
              details: { when: 'yes', label: 'Please give details', docLabel: 'If yes, give details' },
            },
          ],
        },
        {
          id: 'claims',
          number: 'H',
          fields: [
            {
              id: 'had_claims',
              type: 'yesno',
              number: 'a',
              label: 'Have there been any accidents/claims in your company/association in the last 3 years?',
              docLabel:
                'Have there been any accident/claims in your company/association in the last 3 years?',
              required: true,
            },
            {
              id: 'claims_history',
              type: 'table',
              label: 'Details of accidents / claims',
              docLabel: 'If yes, please give details',
              required: true,
              minRows: 1,
              printRows: 3,
              addLabel: 'Add another year',
              showIf: { field: 'had_claims', equals: 'yes' },
              columns: [
                { id: 'year', label: 'Year', type: 'year', required: true },
                { id: 'number_of_claims', label: 'No. of accidents/claims', type: 'number', required: true },
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
        businessIdentitySection(),
        {
          id: 'staff_docs',
          title: 'Staff list',
          fields: [
            {
              id: 'declaration_list_file',
              type: 'file',
              kind: 'gpa_declaration_list',
              label: 'Declaration list (staff list)',
              help: 'Required if you did not type the list in the Staff step.',
              accept: ['image', 'pdf'],
              multiple: true,
              maxFiles: 5,
              required: true,
              showIf: { not: { field: 'employees', truthy: true } },
              guidance:
                'Names, occupation/rank, date of birth, annual salary, capital sum and beneficiary for each person. A spreadsheet saved as PDF is fine.',
            },
            {
              id: 'declaration_list_extra',
              type: 'file',
              kind: 'gpa_declaration_list',
              label: 'Additional sheet of the declaration list (optional)',
              help: 'If you typed some names here but have more on a separate sheet.',
              accept: ['image', 'pdf'],
              multiple: true,
              maxFiles: 5,
              showIf: { field: 'employees', truthy: true },
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
        label:
          'We will tell Serene of any change in the occupation, health or pursuits of the people insured.',
      },
      {
        id: 'basis_of_contract',
        label:
          'This declaration forms the basis of the contract, and we accept the policy’s terms and conditions.',
      },
    ],
    fields: [
      // added for online sale: capacity of the person signing for the company
      {
        id: 'signatory_position',
        type: 'text',
        label: 'Position of the person signing',
        docLabel: 'Capacity',
        help: 'For example Managing Director or HR Manager.',
        required: true,
        maxLength: 80,
      },
      {
        id: 'agency',
        type: 'text',
        label: 'Agency (if any)',
        docLabel: 'Agency',
        help: 'Leave blank if you are buying directly from Serene.',
        maxLength: 120,
      },
    ],
    signatureLabel: 'Signature of Proposer',
    dateLabel: 'Date',
  },
};
