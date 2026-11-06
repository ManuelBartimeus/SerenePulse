// STEVEDORES' LIABILITY PROPOSAL FORM
// Source: PROPOSAL FORMS/MARINE QUESTIONAIRE/STEVEDORE PROPOSAL FORM.docx (the only version; no PDF).
// Blank table rows on paper: owners 3, vessels 4, losses 4. The paper form has no period of
// insurance; one is added in the Cover step (rule 6). Wording fixes: "the policy do not" → "does
// not", "terminator operator" → "terminal operator", and the missing "declare" in the first
// declaration sentence ("I/We [declare] to the best of my/our knowledge …").
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

const YES = (field: string) => ({ field, equals: 'yes' }) as const;

const PREAMBLE =
  'Please note that this proposal form is for those in the business of stevedoring activities i.e. providing services of loading or unloading cargoes to/from vessels.';

export const stevedore: FormDefinition = {
  id: 'stevedore',
  version: 1,
  title: 'STEVEDORES’ LIABILITY PROPOSAL FORM',
  source: 'MARINE QUESTIONAIRE/STEVEDORE PROPOSAL FORM.docx',
  preamble: [PREAMBLE],
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'The stevedoring company. We fill in what we already know.',
      sections: [
        {
          id: 'notice',
          fields: [
            {
              id: 'stevedoring_notice',
              type: 'read',
              label: 'Who this form is for',
              paragraphs: [PREAMBLE],
              acknowledge: 'I confirm the proposer is in the business of stevedoring.',
            },
            {
              id: 'intermediary',
              type: 'text',
              label: 'Intermediary’s name / code',
              help: 'Your agent or broker, if any. Leave blank if you are buying directly from Serene.',
              maxLength: 120,
            },
          ],
        },
        {
          id: 'general',
          number: '1',
          title: 'General information',
          description:
            'To complete a separate form for each other named proposer (if there is more than one).',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              label: 'Proposer’s name',
              required: true,
              prefill: 'companyName',
              saveToProfile: 'companyName',
              role: 'insuredName',
              maxLength: 160,
            },
            {
              id: 'business_description',
              type: 'textarea',
              label: 'Business description',
              required: true,
              maxLength: 400,
            },
            {
              id: 'registration_no',
              type: 'text',
              label: 'ROC (company registration number)',
              docLabel: 'ROC',
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
              id: 'address',
              type: 'textarea',
              label: 'Address',
              required: true,
              prefill: 'postalAddress',
              saveToProfile: 'postalAddress',
              maxLength: 240,
            },
            { id: 'fax', type: 'text', label: 'Facsimile no.', width: 'third', row: 'tel', maxLength: 30 },
            {
              id: 'phone',
              type: 'phone',
              label: 'Telephone no.',
              required: true,
              prefill: 'phone',
              width: 'third',
              row: 'tel',
            },
            { id: 'website', type: 'text', label: 'Website', width: 'third', row: 'tel', maxLength: 120 },
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
              row: 'email',
            },
            // added for online sale
            {
              id: 'contact_person',
              type: 'text',
              label: 'Contact person',
              required: true,
              width: 'half',
              row: 'email',
              maxLength: 120,
            },
          ],
        },
        {
          id: 'owners',
          number: '2',
          title: 'Information on owners, partners, officers and directors',
          fields: [
            {
              id: 'owners',
              type: 'table',
              label: 'Owners, partners, officers and directors',
              required: true,
              minRows: 1,
              printRows: 3,
              addLabel: 'Add another person',
              columns: [
                { id: 'name', label: 'Name', type: 'text', required: true, weight: 2 },
                { id: 'title', label: 'Title', type: 'text', required: true },
                {
                  id: 'years_experience',
                  label: 'Years of relevant / working experience',
                  type: 'number',
                  unit: 'years',
                },
                { id: 'years_with_company', label: 'Years with the company', type: 'number', unit: 'years' },
              ],
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
          id: 'receipts',
          number: '3',
          title: 'Business activities and gross receipts',
          fields: [
            {
              id: 'stevedoring_receipts_actual',
              type: 'money',
              number: 'i',
              label: 'Stevedoring activities: actual annual gross receipts for last 12 months',
              docLabel: 'Stevedoring activities — Actual Annual Gross Receipts for last 12 months',
              required: true,
              min: 0,
              width: 'half',
              row: 'stev',
            },
            {
              id: 'stevedoring_receipts_estimated',
              type: 'money',
              label: 'Estimated annual gross receipts for next 12 months',
              required: true,
              min: 0,
              width: 'half',
              row: 'stev',
            },
            {
              // The paper lists the non-stevedoring activities (a, b) twice: once for gross
              // receipts and once for the share sub-contracted. One row per activity holds both.
              id: 'non_stevedoring_activities',
              type: 'table',
              number: 'ii',
              label: 'Non stevedoring activities (if any), to list below',
              help: 'Leave empty if you only do stevedoring.',
              maxRows: 6,
              printRows: 2,
              addLabel: 'Add an activity',
              columns: [
                {
                  id: 'activity',
                  label: 'Type of business activity',
                  type: 'text',
                  required: true,
                  weight: 2,
                },
                {
                  id: 'actual_receipts',
                  label: 'Actual annual gross receipts for last 12 months',
                  type: 'money',
                  required: true,
                },
                {
                  id: 'estimated_receipts',
                  label: 'Estimated annual gross receipts for next 12 months',
                  type: 'money',
                  required: true,
                },
                {
                  id: 'subcontracted_percent',
                  label: '% of work sub-contracted to third parties',
                  type: 'number',
                  unit: '%',
                },
              ],
            },
            {
              id: 'total_receipts_actual',
              type: 'money',
              label: 'Total gross receipts: actual (last 12 months)',
              docLabel: 'Total Gross Receipts — actual',
              required: true,
              min: 0,
              width: 'half',
              row: 'total',
            },
            {
              id: 'total_receipts_estimated',
              type: 'money',
              label: 'Total gross receipts: estimated (next 12 months)',
              docLabel: 'Total Gross Receipts — estimated',
              required: true,
              min: 0,
              width: 'half',
              row: 'total',
            },
            {
              id: 'stevedoring_subcontracted_percent',
              type: 'percent',
              label:
                'Of the above, please advise the percentage of work that you sub-contracted to third parties: (i) stevedoring',
              docLabel:
                'Of the above please advise percentage of work that you sub-contracted to third parties. i. Stevedoring',
              help: 'For non stevedoring activities, give the percentage in the table above.',
              required: true,
              width: 'half',
            },
            {
              id: 'bailee_note',
              type: 'read',
              label: 'Warehousing',
              paragraphs: [
                'If your non stevedoring activities include warehousing facilities, a separate Bailee’s Liability policy should be taken up. Please complete the Bailee’s Liability Proposal form for this purpose.',
              ],
              acknowledge: 'I understand warehousing is not covered by this policy.',
            },
            {
              id: 'subcontractors_lodge_insurance',
              type: 'yesno',
              label:
                'Do you require that your sub-contractors lodge a copy of their own Stevedores’ Liability Insurance with you?',
              required: true,
            },
            {
              id: 'extend_to_subcontractors',
              type: 'yesno',
              label:
                'Do you wish to extend your Stevedores’ Liability policy to include the liabilities of your subcontractors?',
              required: true,
            },
            {
              id: 'hold_harmless',
              type: 'yesno',
              label:
                'Are there any ‘hold harmless and indemnity agreements’ affecting insurers’ right of recovery in force?',
              required: true,
              help: 'Please also supply copies of any operating contractual arrangements (in the Documents step).',
              details: {
                when: 'yes',
                label: 'Please provide details',
                docLabel: 'If “Yes”, please provide details',
              },
            },
          ],
        },
        {
          id: 'employees',
          number: '11',
          title: 'Employees information',
          fields: [
            {
              id: 'employees_permanent',
              type: 'number',
              label: 'Number of employees on permanent employment',
              min: 0,
              required: true,
              width: 'half',
              row: 'emp',
            },
            {
              id: 'employees_part_time',
              type: 'number',
              label: 'Number of employees on part time employment',
              min: 0,
              required: true,
              width: 'half',
              row: 'emp',
            },
          ],
        },
      ],
    },
    {
      id: 'operations',
      title: 'Operations',
      sections: [
        {
          id: 'locations',
          fields: [
            {
              id: 'locations',
              type: 'textarea',
              number: '4',
              label: 'State locations where operations are done',
              placeholder: 'For example: Tema Port, Takoradi Port',
              role: 'riskAddress',
              required: true,
              maxLength: 400,
            },
            {
              id: 'vessels',
              type: 'table',
              number: '5',
              label: 'Please advise size and type of vessels loaded and unloaded',
              required: true,
              minRows: 1,
              printRows: 4,
              addLabel: 'Add a vessel type',
              columns: [
                { id: 'vessel_type', label: 'Type of vessel', type: 'text', required: true, weight: 2 },
                { id: 'gross_tonnage', label: 'Gross tonnage', type: 'number', unit: 'GT' },
              ],
            },
            {
              id: 'vessels_per_year',
              type: 'number',
              number: '6',
              label: 'Please advise number of vessels handled each year',
              min: 0,
              required: true,
              width: 'half',
            },
          ],
        },
        {
          id: 'cargo',
          number: '7',
          title: 'Type of cargo handled by percentage (%)',
          description: 'The four figures should add up to 100%.',
          fields: [
            {
              id: 'cargo_commodities',
              type: 'percent',
              number: 'a',
              label: 'Commodities, e.g. coffee beans, rice, sugar etc.',
              required: true,
              width: 'half',
            },
            {
              id: 'cargo_perishable',
              type: 'percent',
              number: 'b',
              label: 'Perishable cargo, e.g. fruits, foodstuff',
              required: true,
              width: 'half',
            },
            {
              id: 'cargo_general',
              type: 'percent',
              number: 'c',
              label: 'General cargo, e.g. construction equipment, steel products',
              required: true,
              width: 'half',
            },
            {
              id: 'cargo_temperature',
              type: 'percent',
              number: 'd',
              label: 'Temperature controlled cargoes',
              required: true,
              width: 'half',
            },
          ],
        },
        {
          id: 'facilities',
          number: '8',
          title: 'Facilities and equipment',
          fields: [
            {
              id: 'operate_wharf',
              type: 'yesno',
              number: 'a',
              label: 'Are the wharf and/or port operated and controlled by you?',
              required: true,
            },
            {
              id: 'wharf_note',
              type: 'read',
              label: 'Wharf and terminal operators',
              paragraphs: [
                'Please note that the policy does not extend to cover your liability as a wharf and/or terminal operator. This should be specifically insured separately.',
              ],
              acknowledge: 'I understand my liability as a wharf/terminal operator is not covered.',
              showIf: YES('operate_wharf'),
            },
            {
              id: 'cranes_leased',
              type: 'yesno',
              number: 'b',
              label: 'Are the cranes and/or other equipment leased or hired by you?',
              required: true,
            },
            {
              id: 'accept_crane_liability',
              type: 'yesno',
              number: 'c',
              label: 'Do you accept liability for loss or damage to these cranes/equipment?',
              docLabel: 'If “Yes”, do you accept liability for loss or damage to these cranes/equipment?',
              required: true,
              showIf: YES('cranes_leased'),
            },
            {
              id: 'crane_liability_note',
              type: 'read',
              label: 'Hired cranes and equipment',
              paragraphs: [
                'Please note that the policy does not extend to cover your contractual liability for loss or damage to these cranes/equipment. They should be specifically insured separately.',
              ],
              acknowledge: 'I understand contractual liability for hired cranes/equipment is not covered.',
              showIf: YES('cranes_leased'),
            },
            {
              id: 'own_operators',
              type: 'yesno',
              number: 'd',
              label: 'Are the cranes and equipment operated by your own employees?',
              required: true,
              details: { when: 'no', label: 'By whom?', docLabel: 'If “No”, by whom?' },
            },
            {
              id: 'ships_tackle',
              type: 'yesno',
              number: 'e',
              label: 'Is ships’ tackle used?',
              required: true,
              details: { when: 'yes', label: 'Who operates it?', docLabel: 'If “Yes”, who operates it?' },
            },
          ],
        },
      ],
    },
    {
      id: 'cover',
      title: 'Cover & history',
      sections: [
        {
          id: 'limit',
          number: '9',
          title: 'Limit of liability required under this insurance',
          fields: [
            {
              id: 'limit_of_liability',
              type: 'money',
              label: 'Limit of liability any one accident and in the aggregate',
              role: 'sumInsured',
              required: true,
              min: 1,
              width: 'half',
            },
          ],
        },
        {
          id: 'losses',
          number: '10',
          title: 'Loss experience',
          fields: [
            {
              id: 'losses',
              type: 'table',
              label:
                'Please list all claims and/or losses for the last 5 years regardless of whether there was insurance cover',
              docLabel:
                'Please list all claims &/or losses for the last 5 years regardless of whether there was insurance cover (To attach separate sheet if necessary)',
              help: 'Leave empty if there were none. Attach a separate sheet in the Documents step if necessary.',
              printRows: 4,
              addLabel: 'Add a claim or loss',
              columns: [
                { id: 'nature', label: 'Nature of loss', type: 'text', required: true, weight: 2 },
                { id: 'deductible', label: 'Policy deductible', type: 'money' },
                { id: 'claim_amount', label: 'Original claim amount', type: 'money', required: true },
                { id: 'status', label: 'Claim status', type: 'text' },
              ],
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
          id: 'operations_docs',
          title: 'Contracts and history',
          fields: [
            {
              id: 'operating_contracts',
              type: 'file',
              kind: 'operating_contracts',
              label: 'Copies of operating contractual arrangements',
              docLabel:
                'Copies of any operating contractual arrangements (hold harmless and indemnity agreements)',
              accept: ['pdf', 'image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 10,
              required: true,
              showIf: YES('hold_harmless'),
            },
            {
              id: 'loss_history_sheet',
              type: 'file',
              kind: 'loss_history',
              label: 'Separate sheet of claims and losses (if necessary)',
              accept: ['pdf', 'image'],
              capture: 'environment',
            },
            {
              id: 'port_licence',
              type: 'file',
              kind: 'port_operating_licence',
              label: 'Port authority (GPHA) stevedoring licence or permit',
              help: 'If you have one.',
              accept: ['pdf', 'image'],
              capture: 'environment',
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    title: 'Declaration',
    paragraphs: [
      'I/We declare to the best of my/our knowledge and belief that all answers given in this Proposal Form are true, accurate and complete and all material factors affecting the assessment of the risks have been disclosed. I/We agree that this Proposal and Declaration shall be the basis of the contract between me/us and Serene Insurance Company Ltd. (“Serene”) and shall be deemed to be incorporated in such contract, subject to the terms and conditions of the Policy. No insurance will be in force until this Proposal has been accepted by Serene.',
      'I/We acknowledge and agree (in case of corporate policy, I/we represent that I/we have obtained the consent of the individuals in relation to this policy) that Serene may collect, use, disclose and/or process my/our personal data (in case of corporate policy, personal data of individuals in relation to this policy) in accordance with the Data Protection Act for the purposes and uses described in Serene’s Privacy Policy (including the provision of protection, services related to this insurance policy, screening activities in accordance with legal/regulatory obligations/risk management procedures). This may include disclosure to Serene’s business partners, intermediaries, third party service providers and industry associations.',
    ],
    confirmations: [
      {
        id: 'true_and_complete',
        label: 'All answers are true, accurate and complete, and all material facts have been disclosed.',
      },
      {
        id: 'basis_of_contract',
        label: 'This proposal and declaration will be the basis of the contract with Serene.',
      },
      { id: 'not_in_force', label: 'No insurance is in force until Serene accepts this proposal.' },
    ],
    fields: [
      {
        id: 'authorised_signatory',
        type: 'text',
        label: 'Name of authorised signatory',
        docLabel: 'Name of Authorized Signatory',
        required: true,
        maxLength: 120,
        width: 'half',
        row: 'signatory',
      },
      {
        id: 'designation',
        type: 'text',
        label: 'Designation',
        help: 'Your position in the company, e.g. Managing Director.',
        required: true,
        maxLength: 80,
        width: 'half',
        row: 'signatory',
      },
    ],
    signatureLabel: 'Company Stamp and/or Signature of Proposer',
    dateLabel: 'Date',
  },
};
