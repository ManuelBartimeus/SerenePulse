// WORKMEN'S COMPENSATION INSURANCE PROPOSAL FORM
// Source: PROPOSAL FORMS/ACCIDENTS/WC/SERENE INS. WORKMEN COMPENSATION PROPOSAL FORM CURRENT.docx (and .pdf)
// The folder also holds an older version and a "- Copy"; the CURRENT file is used. The
// "MG MANAGEMENT CONSULT" file is an issued policy, not a proposal form.
// Sections are lettered A–C as printed; the paper has no item numbers inside section A.
import { GHANA_INSURERS } from '../options';
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

export const workmensCompensation: FormDefinition = {
  id: 'workmens-compensation',
  version: 1,
  title: 'WORKMEN’S COMPENSATION INSURANCE PROPOSAL FORM',
  source: 'ACCIDENTS/WC/SERENE INS. WORKMEN COMPENSATION PROPOSAL FORM CURRENT.docx',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'The employer applying for the cover. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          number: 'A',
          title: 'Proposers details',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              label: 'Proposer’s name',
              help: 'The registered name of the business (or your full name if you employ staff in your own name).',
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
              label: 'Address',
              help: 'Business location, with the GhanaPost GPS address if you have one.',
              required: true,
              role: 'riskAddress',
              maxLength: 200,
            },
            {
              id: 'post_office',
              type: 'text',
              label: 'Post office (postal address)',
              docLabel: 'Post Office',
              prefill: 'postalAddress',
              saveToProfile: 'postalAddress',
              maxLength: 120,
            },
            {
              id: 'phone',
              type: 'phone',
              label: 'Telephone number',
              docLabel: 'Tel No',
              required: true,
              prefill: 'phone',
              width: 'half',
              row: 'tel',
            },
            {
              id: 'alt_phone',
              type: 'phone',
              label: 'Alternative telephone number',
              docLabel: 'Alt. Tel No.',
              width: 'half',
              row: 'tel',
            },
            {
              id: 'email',
              type: 'email',
              label: 'Email',
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
      id: 'business',
      title: 'Business & cover',
      sections: [
        {
          id: 'business',
          fields: [
            {
              id: 'occupation',
              type: 'text',
              label: 'Business or occupation',
              required: true,
              maxLength: 120,
            },
            {
              id: 'business_description',
              type: 'textarea',
              label: 'Please describe your business and operations for which this insurance is required',
              docLabel:
                'Trade /Business: Please describe your Business and Operations for which this insurance is required',
              required: true,
              maxLength: 600,
            },
            {
              id: 'years_established',
              type: 'number',
              label: 'How long have you been established in the business to which this proposal applies?',
              min: 0,
              max: 200,
              unit: 'years',
              required: true,
              width: 'half',
            },
          ],
        },
        {
          id: 'period',
          title: 'Please state the period of insurance required',
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
      id: 'employees',
      title: 'Employees & wages',
      sections: [
        {
          id: 'wages',
          number: 'B',
          title: 'Employee occupation and remuneration/wage details',
          fields: [
            {
              id: 'wage_notes',
              type: 'read',
              label: 'How to complete the wage details',
              paragraphs: [
                '1. Please be as specific as possible concerning the different types of occupation or work performed by your employees.',
                '2. The different types of work should be categorised and the wage details entered for each.',
                '3. The wages figure must include all forms of remuneration.',
                'N/B: Please you can add additional sheet for No. of employees if it exceeds the below space provided.',
              ],
              acknowledge: 'I understand that the wages must include all forms of remuneration.',
            },
            {
              id: 'wage_roll',
              type: 'table',
              label: 'Wage roll by type of occupation / work',
              help: 'One line per type of work, for example Office staff, Drivers, Security, Factory hands.',
              required: true,
              minRows: 1,
              printRows: 8,
              addLabel: 'Add another type of work',
              columns: [
                {
                  id: 'occupation',
                  label: 'Type of occupation/work',
                  type: 'text',
                  required: true,
                  weight: 2,
                },
                { id: 'employees', label: 'No. of employees', type: 'number', required: true },
                {
                  id: 'annual_wages',
                  label: 'Total annual wages/earnings (GH₵)',
                  type: 'money',
                  required: true,
                  weight: 1.4,
                },
              ],
            },
            // The paper's TOTALS row of the table; asked separately because the quote is rated on it.
            {
              id: 'total_employees',
              type: 'number',
              label: 'Total number of employees',
              docLabel: 'TOTALS – No. of employees',
              min: 1,
              required: true,
              width: 'half',
              row: 'totals',
            },
            {
              id: 'total_wage_roll',
              type: 'money',
              label: 'Total annual wages/earnings',
              docLabel: 'TOTALS – Total annual wages/earnings (GH₵)',
              help: 'The sum of the wages column above.',
              role: 'sumInsured',
              min: 1,
              required: true,
              width: 'half',
              row: 'totals',
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
          id: 'claims',
          number: 'C',
          title: 'Previous claims/ losses',
          description:
            'Please detail below all incidents involving employee injuries during the last 3 years. This must include all injuries which were not insured if you did not have a workmen’s compensation insurance policy at the time.',
          fields: [
            // Gate for the paper's claims table, so a proposer with no injuries can say so explicitly.
            {
              id: 'had_injuries',
              type: 'yesno',
              label: 'Have any employees been injured at work during the last 3 years?',
              help: 'Include injuries that were not insured.',
              required: true,
            },
            {
              id: 'claims_history',
              type: 'table',
              label: 'Incidents involving employee injuries',
              required: true,
              minRows: 1,
              printRows: 5,
              addLabel: 'Add another incident',
              showIf: { field: 'had_injuries', equals: 'yes' },
              columns: [
                { id: 'date_of_injury', label: 'Date of injury', type: 'date', required: true },
                { id: 'employee_name', label: 'Employee’s name', type: 'text', required: true, weight: 1.4 },
                { id: 'type_of_injury', label: 'Type of injury', type: 'text', required: true, weight: 1.4 },
                { id: 'compensation', label: 'Compensation paid or outstanding', type: 'money' },
              ],
            },
          ],
        },
        {
          id: 'previous_insurance',
          fields: [
            {
              id: 'previously_insured',
              type: 'yesno',
              label:
                'Are you at present insured, or have you ever proposed for an insurance in respect of your liability to your employees?',
              required: true,
            },
            {
              id: 'previous_insurer',
              type: 'select',
              number: 'a',
              label: 'Name of the insurance company',
              docLabel: 'If so, please state name of Company',
              options: GHANA_INSURERS,
              allowOther: true,
              required: true,
              showIf: { field: 'previously_insured', equals: 'yes' },
              width: 'half',
            },
            {
              id: 'declined',
              type: 'yesno',
              number: 'b',
              label: 'Has any such proposal or renewal ever been declined or withdrawn?',
              required: true,
              showIf: { field: 'previously_insured', equals: 'yes' },
              details: {
                when: 'yes',
                label: 'Please state the reason',
                docLabel: 'If Yes, please state the reason',
              },
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
              id: 'staff_list',
              type: 'file',
              kind: 'staff_list',
              label: 'Staff list with names, occupations and annual earnings',
              help: 'Optional, because you entered the wage roll on the form. Attach it if you have more types of work than fit, or if your payroll export is easier.',
              accept: ['image', 'pdf'],
              multiple: true,
              maxFiles: 5,
              guidance: 'A payroll summary or spreadsheet saved as PDF is fine.',
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    paragraphs: [
      'We, the undersigned, desire to effect an insurance as above stated in terms of the Policy to be issued by SERENE Insurance Company Limited.',
      'I/We agree to keep a proper Wages Book and to render at the end of each period of insurance a statement in the form required by the company of all wages actually paid and to pay premium on any wages paid in excess of the amount estimated above. I/We hereby declare that all the above statements and particulars which I/We have read over and checked are true, and I/We have not suppressed, misrepresented or mis-stated any material fact, I/We have fairly estimated my/our total wages and salaries expenditure and I/We agree that this declaration shall be the basis of the contract between me/us and SERENE Insurance Company Limited.',
    ],
    confirmations: [
      {
        id: 'true_and_fair',
        label: 'The statements above are true and our total wages and salaries are fairly estimated.',
      },
      {
        id: 'wages_book',
        label:
          'We will keep a proper wages book, send a statement of wages actually paid at the end of each period, and pay premium on any excess.',
      },
      {
        id: 'basis_of_contract',
        label: 'This declaration will be the basis of our contract with Serene Insurance.',
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
    ],
    signatureLabel: 'Signature of Proposer',
    dateLabel: 'Date',
  },
};
