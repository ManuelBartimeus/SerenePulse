// BANKERS INDEMNITY PROPOSAL FORM
// Source: PROPOSAL FORMS/ACCIDENTS/BBI/BANKERS' INDEMNITY.docx (the only file in the folder).
// Sections A–B and items 1–9 as printed (docx list numbering). The paper has no period of
// insurance; one is added with the sums insured and printed with the declaration.
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

const NOTICE =
  'PLEASE NOTE: Every Proposer or Assured, when seeking a quotation, taking out or renewing an Insurance Policy, has a legal obligation to reveal to the Insurers any material fact or information which might affect the judgment of the Insurer in deciding whether to accept the insurance or assessing the conditions of the insurance. Failure to observe this obligation could avoid any contract entered into at inception.';

const sum = (id: string, number: string | undefined, label: string) =>
  ({ id, type: 'money', ...(number ? { number } : {}), label, min: 0, width: 'half' }) as const;

export const bankersIndemnity: FormDefinition = {
  id: 'bankers-indemnity',
  version: 1,
  title: 'BANKERS INDEMNITY PROPOSAL FORM',
  source: 'ACCIDENTS/BBI/BANKERS’ INDEMNITY.docx',
  preamble: [NOTICE],
  steps: [
    {
      id: 'bank',
      title: 'The bank',
      description: 'The bank or financial institution to be insured. We fill in what we already know.',
      sections: [
        {
          id: 'notice',
          fields: [
            {
              id: 'disclosure_notice',
              type: 'read',
              label: 'Please note',
              paragraphs: [NOTICE],
              acknowledge: 'I have read and understood this notice.',
            },
          ],
        },
        {
          id: 'particulars',
          number: 'Section ‘A’',
          title: 'Particulars of bank',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              number: '1',
              label: 'Title of the bank',
              help: 'The registered name of the bank, savings and loans or microfinance company.',
              required: true,
              prefill: 'companyName',
              saveToProfile: 'companyName',
              role: 'insuredName',
              maxLength: 160,
            },
            {
              id: 'subsidiaries',
              type: 'textarea',
              label: 'Banking subsidiary companies in which the bank has a controlling interest',
              docLabel:
                'Title of the Bank including all Banking subsidiary Companies in which the Bank has a controlling interest',
              help: 'Leave blank if there are none.',
              maxLength: 600,
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
            {
              id: 'principal_address',
              type: 'textarea',
              number: '2',
              label: 'Principal address',
              required: true,
              role: 'riskAddress',
              prefill: 'postalAddress',
              maxLength: 200,
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
              id: 'broker',
              type: 'text',
              label: 'Broker (if any)',
              docLabel: 'BROKER/ PROPOSER',
              help: 'Leave blank if the bank is applying directly.',
              maxLength: 120,
            },
          ],
        },
      ],
    },
    {
      id: 'business',
      title: 'Business',
      sections: [
        {
          id: 'figures',
          fields: [
            {
              id: 'date_established',
              type: 'date',
              number: '3',
              label: 'When established',
              required: true,
              maxDays: 0,
              width: 'half',
            },
            {
              id: 'figures_note',
              type: 'read',
              label: 'Financial figures',
              paragraphs: ['These should be as shown in the last Annual Statement or Report.'],
            },
            { ...sum('authorised_capital', '4', 'Authorised capital'), required: true, row: 'capital' },
            { ...sum('paid_up_capital', undefined, 'Paid up capital'), required: true, row: 'capital' },
            { ...sum('total_assets', undefined, 'Total assets'), required: true, row: 'assets' },
            { ...sum('total_deposits', undefined, 'Total deposits'), required: true, row: 'assets' },
            { ...sum('total_loans', undefined, 'Total loans and discounts'), required: true },
          ],
        },
        {
          id: 'character',
          number: '5',
          fields: [
            // Paper: a)–d) each with an answer line; they are alternatives, so one choice.
            {
              id: 'bank_type',
              type: 'radio',
              label: 'Do you consider the character of your business essentially to be that of a:',
              required: true,
              options: [
                { value: 'commercial', label: 'a) Commercial bank' },
                { value: 'private', label: 'b) Private bank' },
                { value: 'merchant', label: 'c) Merchant bank' },
                {
                  value: 'otherwise',
                  label: 'd) Otherwise',
                  hint: 'For example savings and loans, rural bank, microfinance.',
                },
              ],
            },
            {
              id: 'bank_type_details',
              type: 'text',
              label: 'Please give details',
              docLabel: 'Otherwise (please give details)',
              required: true,
              showIf: { field: 'bank_type', equals: 'otherwise' },
              maxLength: 200,
            },
            {
              id: 'main_activities',
              type: 'textarea',
              label: 'Please describe briefly the main activities of the bank to amplify answers',
              required: true,
              maxLength: 1000,
            },
          ],
        },
        {
          id: 'accounts',
          number: '6',
          title: 'State number of:',
          fields: [
            {
              id: 'current_accounts',
              type: 'number',
              number: 'a',
              label: 'Current cheque accounts',
              min: 0,
              required: true,
              width: 'third',
              row: 'accounts',
            },
            {
              id: 'inactive_accounts',
              type: 'number',
              number: 'b',
              label: 'Inactive accounts',
              docLabel:
                'Inactive Accounts (being those with no movements in or out during the past 12 months)',
              help: 'Those with no movements in or out during the past 12 months.',
              min: 0,
              required: true,
              width: 'third',
              row: 'accounts',
            },
            {
              id: 'savings_accounts',
              type: 'number',
              number: 'c',
              label: 'Savings and deposit accounts',
              min: 0,
              required: true,
              width: 'third',
              row: 'accounts',
            },
          ],
        },
        {
          id: 'correspondent',
          fields: [
            {
              id: 'london_correspondent',
              type: 'text',
              number: '7',
              label: 'Name of correspondent bank or agent in London',
              help: 'Leave blank if none.',
              maxLength: 200,
            },
          ],
        },
      ],
    },
    {
      id: 'staff',
      title: 'Staff & locations',
      sections: [
        {
          id: 'directors',
          number: 'Section ‘B’',
          title: 'Staff and location',
          fields: [
            {
              id: 'directors_count',
              type: 'number',
              number: '8',
              label: 'State the number of directors (salaried and permanent only)',
              min: 0,
              required: true,
              width: 'half',
            },
            {
              id: 'directors_details',
              type: 'textarea',
              label: 'Names of the directors (optional)',
              help: 'The paper form leaves several lines here.',
              maxLength: 600,
            },
          ],
        },
        {
          id: 'locations',
          number: '9',
          title: 'State the number falling into each of the following categories:',
          fields: [
            {
              id: 'staff_head_office',
              type: 'number',
              number: 'a',
              label: 'Head office',
              min: 0,
              required: true,
              width: 'third',
            },
            {
              id: 'staff_computer_centre',
              type: 'number',
              number: 'b',
              label: 'Computer centre',
              min: 0,
              required: true,
              width: 'third',
            },
            {
              id: 'staff_admin_centre',
              type: 'number',
              number: 'c',
              label: 'Administration centre',
              min: 0,
              required: true,
              width: 'third',
            },
            {
              id: 'main_branches',
              type: 'number',
              number: 'd',
              label: 'Main branches',
              min: 0,
              required: true,
              width: 'third',
            },
            {
              id: 'other_branches',
              type: 'number',
              number: 'e',
              label: 'Other branches',
              min: 0,
              required: true,
              width: 'third',
            },
          ],
        },
      ],
    },
    {
      id: 'cover',
      title: 'Sums insured',
      sections: [
        {
          id: 'sums_insured',
          title: 'Sum insured for the insuring clauses',
          description: 'Leave a clause blank if you do not want it covered.',
          fields: [
            sum('si_infidelity', 'a', 'Infidelity of employees'),
            sum('si_premises', 'b', 'Premises'),
            sum('si_transit', 'c', 'Transit'),
            sum('si_forged_cheques', 'd', 'Forged cheques et al'),
            sum('si_forged_securities', 'e', 'Forged securities et al'),
            sum('si_counterfeit', 'f', 'Counterfeit currency'),
            sum('si_office_damage', 'g', 'Damage to offices and contents'),
            sum('si_subscription_rights', 'h', 'Loss of subscription rights'),
            {
              id: 'total_sum_insured',
              type: 'money',
              number: 'i',
              label: 'Total sum insured',
              help: 'The sum of the clauses above.',
              role: 'sumInsured',
              min: 1,
              required: true,
              width: 'half',
            },
          ],
        },
        // added for online sale: the paper form has no period of insurance
        {
          id: 'period',
          title: 'Period of insurance',
          fields: [
            {
              id: 'cover_start',
              type: 'date',
              label: 'Cover to start on',
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
              role: 'coverEnd',
              help: 'Usually one year less a day after the start date.',
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
          id: 'supporting',
          title: 'Supporting documents',
          fields: [
            {
              id: 'annual_report',
              type: 'file',
              kind: 'audited_accounts',
              label: 'Last annual statement or report (audited accounts)',
              help: 'The figures in question 4 should match it.',
              accept: ['pdf', 'image'],
              multiple: true,
              maxFiles: 3,
              required: true,
            },
            {
              id: 'operating_licence',
              type: 'file',
              kind: 'bank_of_ghana_licence',
              label: 'Bank of Ghana licence (optional)',
              accept: ['pdf', 'image'],
              capture: 'environment',
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    title: 'DECLARATION BY PROPOSER',
    paragraphs: [
      'I/We hereby declare that the above particulars and statements are true, correct and complete and contain all information known to me/us affecting the risks to be insured, and that this and any other written statement made by me/us or on my/our behalf for the purpose of the proposed Insurance shall be the basis of and incorporated in, the terms and conditions set forth in the Company’s Policy.',
    ],
    confirmations: [
      {
        id: 'true_and_complete',
        label:
          'The particulars are true, correct and complete and contain all information known to us affecting the risks.',
      },
      {
        id: 'basis_of_contract',
        label: 'These statements will be the basis of, and incorporated in, the policy.',
      },
    ],
    fields: [
      // added for online sale: capacity of the person signing for the bank
      {
        id: 'signatory_position',
        type: 'text',
        label: 'Position of the person signing',
        docLabel: 'Capacity',
        help: 'For example Managing Director or Chief Risk Officer.',
        required: true,
        maxLength: 80,
      },
      {
        id: 'broker_agent',
        type: 'text',
        label: 'Broker / agent (if any)',
        docLabel: 'Broker/ Agent',
        help: 'Their signature is collected separately by Serene.',
        maxLength: 120,
      },
    ],
    signatureLabel: 'Proposer’s Signature',
    dateLabel: 'Date',
  },
};
