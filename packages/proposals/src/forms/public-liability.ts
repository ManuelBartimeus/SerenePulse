// PROPOSAL FOR INSURANCE AGAINST LIABILITY TO THE PUBLIC FOR PERSONAL INJURIES AND DAMAGE TO PROPERTY
// Source: PROPOSAL FORMS/ACCIDENTS/PL PROPOSAL/PUBLIC LIABILITY PROPOSAL FORM NEWEST 1.pdf
// (the only complete file in the folder; the ~$ .docx is a Word lock file).
// Not digitised: the PREMIUM block (premises risk / wages / turnover / annual, odd time and first
// premium) and "Policy No", which the office fills in; and a stray word "Hoist" at the foot of page 2.
import { COUNTRIES_COMMON, YES_NO } from '../options';
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

const risk = (value: string) => ({ field: 'risks_required', includes: value }) as const;
/** A count above zero (`truthy` alone treats 0 as an answer). */
const positive = (field: string) =>
  ({ all: [{ field, truthy: true }, { not: { field, equals: 0 } }] }) as const;

export const publicLiability: FormDefinition = {
  id: 'public-liability',
  version: 1,
  title:
    'PROPOSAL FOR INSURANCE AGAINST LIABILITY TO THE PUBLIC FOR PERSONAL INJURIES AND DAMAGE TO PROPERTY',
  source: 'ACCIDENTS/PL PROPOSAL/PUBLIC LIABILITY PROPOSAL FORM NEWEST 1.pdf',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'The business to be insured. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              label: 'Full name of proposer',
              docLabel: 'Full name of proposer Mr., Ms. Mrs.',
              help: 'The registered name of the business (or your full name if you trade in your own name).',
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
              prefill: 'postalAddress',
              maxLength: 200,
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
              id: 'occupation',
              type: 'text',
              label: 'Occupation or business',
              required: true,
              width: 'half',
              row: 'occ',
              maxLength: 120,
            },
            {
              id: 'nationality',
              type: 'select',
              label: 'Nationality',
              options: COUNTRIES_COMMON,
              allowOther: true,
              width: 'half',
              row: 'occ',
            },
          ],
        },
      ],
    },
    {
      id: 'risks',
      title: 'Risks to cover',
      sections: [
        {
          id: 'schedule',
          title: 'Schedule or risk to be covered',
          fields: [
            {
              id: 'schedule_notice',
              type: 'read',
              label: 'Please read carefully',
              paragraphs: [
                '(Please read carefully and make sure you are taking out a policy giving fullest protection)',
                'Complete the details only for the risks where cover is required.',
              ],
            },
            // Paper: "RISK | COMPLETE THIS COLUMN WHERE COVER REQUIRED" for (a)–(e); (f) and (g) are questions.
            {
              id: 'risks_required',
              type: 'checkboxes',
              label: 'Which risks do you want covered?',
              docLabel: 'Risk – complete this column where cover required',
              required: true,
              options: [
                {
                  value: 'general_premises',
                  label: '(a) General premises risk',
                  hint: 'Including liability for fire and explosion, except liability for injury or damage insurable by a Boiler policy.',
                },
                { value: 'goods_hoists', label: '(b) Goods hoist, crane, lifting tackle, etc.' },
                {
                  value: 'work_away',
                  label: '(c) Work away from your premises',
                  hint: 'Including liability for fire and explosion, except liability for injury/damage insurable by a Boiler policy.',
                },
                { value: 'pedal_cycles', label: '(d) Pedal cycles and handcarts' },
                { value: 'subcontractors', label: '(e) Employees of sub-contractors' },
              ],
            },
          ],
        },
        {
          id: 'general_premises',
          number: '(a)',
          title: 'General premises risk',
          showIf: risk('general_premises'),
          fields: [
            {
              id: 'premises_description',
              type: 'textarea',
              label: 'Description of premises (workshop, warehouse, etc.)',
              required: true,
              maxLength: 400,
            },
            {
              id: 'premises_employees',
              type: 'number',
              label: 'Estimated number of employees working at the premises',
              min: 0,
              unit: 'people',
              required: true,
              width: 'half',
              row: 'premises_staff',
            },
            {
              id: 'premises_wage_roll',
              type: 'money',
              label: 'Annual wages roll',
              required: true,
              width: 'half',
              row: 'premises_staff',
            },
          ],
        },
        {
          id: 'goods_hoists',
          number: '(b)',
          title: 'Goods hoist crane lifting tackle, etc.',
          showIf: risk('goods_hoists'),
          fields: [
            {
              id: 'hoists',
              type: 'table',
              label: 'Hoists, cranes and lifting tackle',
              required: true,
              minRows: 1,
              printRows: 2,
              addLabel: 'Add another item',
              columns: [
                { id: 'description', label: 'Description', type: 'text', required: true, weight: 1.8 },
                { id: 'number', label: 'Number', type: 'number', required: true },
                { id: 'motive_power', label: 'Motive power', type: 'text' },
                {
                  id: 'over_public_street',
                  label: 'Whether over public street',
                  type: 'select',
                  options: YES_NO,
                },
                { id: 'floors_served', label: 'Number of floors served', type: 'number' },
              ],
            },
            {
              id: 'hoists_examination',
              type: 'text',
              label: 'Who examines them for defects, and how often?',
              required: true,
              maxLength: 200,
            },
          ],
        },
        {
          id: 'work_away',
          number: '(c)',
          title: 'Work away from your premises',
          showIf: risk('work_away'),
          fields: [
            {
              id: 'work_away_where',
              type: 'text',
              label: 'Where will the work be carried out?',
              required: true,
              maxLength: 200,
            },
            {
              id: 'work_away_kind',
              type: 'textarea',
              label: 'What kind of work will it be?',
              required: true,
              maxLength: 400,
            },
            {
              id: 'work_away_employees',
              type: 'number',
              label: 'Estimated number of employees working away from the premises',
              min: 0,
              unit: 'people',
              required: true,
              width: 'half',
              row: 'work_away_staff',
            },
            {
              id: 'work_away_wage_roll',
              type: 'money',
              label: 'Annual wages roll',
              required: true,
              width: 'half',
              row: 'work_away_staff',
            },
          ],
        },
        {
          id: 'pedal_cycles',
          number: '(d)',
          title: 'Pedal cycles and handcarts',
          showIf: risk('pedal_cycles'),
          fields: [
            {
              id: 'pedal_cycles_count',
              type: 'number',
              label: 'Number of pedal cycles used in your business',
              docLabel: 'Number used in your business – Pedal cycles',
              min: 0,
              width: 'half',
              row: 'cycles',
            },
            {
              id: 'handcarts_count',
              type: 'number',
              label: 'Number of handcarts used in your business',
              docLabel: 'Handcarts',
              min: 0,
              width: 'half',
              row: 'cycles',
            },
          ],
        },
        {
          id: 'subcontractors',
          number: '(e)',
          title: 'Employees of sub-contractors',
          showIf: risk('subcontractors'),
          fields: [
            {
              id: 'subcontractors_amount',
              type: 'money',
              label: 'Estimated amount paid to sub-contractors',
              docLabel: 'Estimated amount of sub Contractors',
              required: true,
              width: 'half',
            },
          ],
        },
        {
          id: 'products',
          number: '(f)',
          fields: [
            {
              id: 'harmful_ingredients',
              type: 'yesno',
              label:
                'Do you desire cover in respect of your liability for injury or illness arising from harmful ingredients in goods or beverages sold by you?',
              help: 'Additional premium required for this risk.',
              required: true,
            },
            {
              id: 'products_notice',
              type: 'read',
              label: 'About this extension',
              showIf: { field: 'harmful_ingredients', equals: 'yes' },
              paragraphs: [
                '(Additional premium required for this risk)',
                'Under this extension the indemnity for any one event is also the yearly limit.',
              ],
              acknowledge:
                'I understand that the limit for any one event is also the yearly limit for this extension.',
            },
            {
              id: 'annual_turnover',
              type: 'money',
              label: 'Annual turnover',
              required: true,
              showIf: { field: 'harmful_ingredients', equals: 'yes' },
              width: 'half',
            },
          ],
        },
        {
          id: 'other_risk',
          number: '(g)',
          fields: [
            {
              id: 'other_risk',
              type: 'yesno',
              label:
                'Does your trade involve any risk (other than as described in (a) to (f) above) of injury to third parties or damage to their property?',
              docLabel:
                'Does your trade involve any risk (other than as described in (a) to (f) above) of injury to third parties or damage to their property:',
              required: true,
              details: {
                when: 'yes',
                label: 'Please give full details',
                docLabel: 'If so, please give full details',
              },
            },
          ],
        },
        {
          id: 'outside_scope',
          fields: [
            {
              id: 'outside_scope_notice',
              type: 'read',
              label: 'Risks not covered by this policy',
              paragraphs: [
                'Note: The following risks fall outside the scope of the Public Liability Policy. Please indicate if you required quotations for any of them.',
                'Accident to employees, Accident arising out of ownership of land/building not in your occupation.',
                'Accidents caused by motor vehicles, horse drawn vehicles, boiler and other steam pressure apparatus, Passenger lifts.',
              ],
              acknowledge: 'I understand that these risks are not covered by the Public Liability Policy.',
            },
            {
              id: 'quotations_wanted',
              type: 'checkboxes',
              label: 'Would you like a quotation for any of these? (optional)',
              docLabel: 'Quotations required for',
              options: [
                { value: 'employees', label: 'Accident to employees' },
                { value: 'land_buildings', label: 'Ownership of land/building not in your occupation' },
                { value: 'motor', label: 'Motor vehicles' },
                { value: 'horse_drawn', label: 'Horse drawn vehicles' },
                { value: 'boiler', label: 'Boiler and other steam pressure apparatus' },
                { value: 'passenger_lifts', label: 'Passenger lifts' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'history',
      title: 'Premises & history',
      sections: [
        {
          id: 'machinery',
          number: '1',
          title: 'Give full particulars and details of any machinery and electrical appliances used',
          fields: [
            {
              id: 'machinery_own_premises',
              type: 'textarea',
              number: '(a)',
              label: 'At your own premises',
              required: true,
              maxLength: 400,
            },
            {
              id: 'machinery_outside_work',
              type: 'textarea',
              number: '(b)',
              label: 'On outside work',
              maxLength: 400,
            },
          ],
        },
        {
          id: 'repair',
          number: '2',
          fields: [
            {
              id: 'sound_repair',
              type: 'yesno',
              label: 'Are all your premises and appliances in a sound state of repair?',
              required: true,
              details: { when: 'no', label: 'Please give details' },
            },
          ],
        },
        {
          id: 'public_contact',
          number: '3',
          title:
            'Has any person other than your own employees occasion to use or come in contact with your (a) lifts, hoists, etc.; or (b) any other machinery?',
          fields: [
            {
              id: 'public_use_lifts',
              type: 'yesno',
              number: '(a)',
              label: 'Lifts, hoists, etc.',
              required: true,
              details: { when: 'yes', label: 'Please give particulars' },
            },
            {
              id: 'public_use_machinery',
              type: 'yesno',
              number: '(b)',
              label: 'Any other machinery',
              required: true,
              details: { when: 'yes', label: 'Please give particulars' },
            },
          ],
        },
        {
          id: 'claims',
          number: '4',
          title:
            'How long have you been in business and what claims have been made on you during that period (or are pending) in respect of risks to be covered by this insurance?',
          fields: [
            {
              id: 'years_in_business',
              type: 'number',
              label: 'Number of years in business',
              min: 0,
              max: 200,
              unit: 'years',
              required: true,
              width: 'half',
            },
            {
              id: 'injury_claims_number',
              type: 'number',
              label: 'Personal injury claims: number',
              docLabel: 'Personal injury No.',
              min: 0,
              required: true,
              width: 'half',
              row: 'injury',
            },
            {
              id: 'injury_claims_cost',
              type: 'money',
              label: 'Personal injury claims: cost',
              docLabel: 'Cost',
              showIf: positive('injury_claims_number'),
              required: true,
              width: 'half',
              row: 'injury',
            },
            {
              id: 'damage_claims_number',
              type: 'number',
              label: 'Damage to property claims: number',
              docLabel: 'Damage to property No.',
              min: 0,
              required: true,
              width: 'half',
              row: 'damage',
            },
            {
              id: 'damage_claims_cost',
              type: 'money',
              label: 'Damage to property claims: cost',
              docLabel: 'Cost',
              showIf: positive('damage_claims_number'),
              required: true,
              width: 'half',
              row: 'damage',
            },
            {
              id: 'claims_particulars',
              type: 'textarea',
              label: 'Full particulars of each claim',
              docLabel: 'Please for risk full particulars',
              showIf: { any: [positive('injury_claims_number'), positive('damage_claims_number')] },
              required: true,
              maxLength: 1000,
            },
          ],
        },
        {
          id: 'insurance',
          number: '5',
          fields: [
            {
              id: 'presently_insured',
              type: 'yesno',
              number: '(a)',
              label: 'Are you at present insured in respect of the said liabilities?',
              required: true,
              width: 'half',
              row: 'insured',
            },
            {
              id: 'proposed_before',
              type: 'yesno',
              number: '(b)',
              label: 'Have you proposed for insurance in respect of the said liabilities?',
              required: true,
              width: 'half',
              row: 'insured',
            },
          ],
        },
        {
          id: 'declined',
          number: '6',
          title: 'Has any proposal or renewal ever been',
          fields: [
            {
              id: 'declined',
              type: 'yesno',
              number: '(a)',
              label: 'Declined?',
              required: true,
              details: { when: 'yes', label: 'Please give details' },
            },
            {
              id: 'withdrawn',
              type: 'yesno',
              number: '(b)',
              label: 'Withdrawn?',
              required: true,
              details: { when: 'yes', label: 'Please give details' },
            },
            {
              id: 'increased_rate',
              type: 'yesno',
              number: '(c)',
              label: 'Charged an increased rate or subjected to special restrictions?',
              docLabel: 'Charged an increased rate or subjected to special restrictions',
              required: true,
              details: { when: 'yes', label: 'Please give details' },
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
          id: 'limit',
          title: 'Limit of indemnity',
          fields: [
            {
              id: 'limit_any_one_accident',
              type: 'money',
              label: 'Limit of indemnity for any one accident',
              docLabel: 'For any one Accident',
              role: 'sumInsured',
              min: 1,
              required: true,
              width: 'half',
              row: 'limit',
            },
            {
              id: 'limit_any_one_year',
              type: 'money',
              label: 'Limit in any one year (product and services risk only)',
              docLabel: 'In any one year (product and services risk only)',
              showIf: { field: 'harmful_ingredients', equals: 'yes' },
              min: 1,
              required: true,
              width: 'half',
              row: 'limit',
            },
          ],
        },
        {
          id: 'period',
          title: 'Period of insurance',
          fields: [
            {
              id: 'period_months',
              type: 'number',
              label: 'Insurance for how many months?',
              docLabel: 'Insurance for … month(s)',
              min: 1,
              max: 18,
              unit: 'months',
              required: true,
              docPlacement: 'declaration',
              width: 'third',
              row: 'period',
            },
            {
              id: 'cover_start',
              type: 'date',
              label: 'From',
              role: 'coverStart',
              required: true,
              minDays: 0,
              maxDays: 60,
              docPlacement: 'declaration',
              width: 'third',
              row: 'period',
            },
            {
              id: 'cover_end',
              type: 'date',
              label: 'To',
              role: 'coverEnd',
              required: true,
              minDays: 1,
              maxDays: 560,
              docPlacement: 'declaration',
              width: 'third',
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
          id: 'risk_docs',
          title: 'Premises and equipment',
          fields: [
            {
              id: 'premises_photos',
              type: 'file',
              kind: 'premises_photos',
              label: 'Photos of the premises (optional)',
              help: 'The entrance and the areas the public uses, and any safety measures (fire extinguishers, signage, railings).',
              accept: ['image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 6,
            },
            {
              id: 'hoist_inspection_certificate',
              type: 'file',
              kind: 'hoist_inspection_certificate',
              label: 'Latest inspection certificate for hoists, cranes or lifting tackle (optional)',
              showIf: risk('goods_hoists'),
              accept: ['image', 'pdf'],
              capture: 'environment',
              multiple: true,
              maxFiles: 4,
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    paragraphs: [
      'I/We warrant that the above statements are true, and that I/We have not withheld or concealed anything affecting the proposed insurance, and I have agreed that this proposal and declaration shall be the basis of the contract between me/us and the company.',
      'I/we agree also to accept the company’s application to the insurance.',
      'The liability of the company does not commence until the acceptance of the proposal has been intimated by this company, or official cover note issued.',
    ],
    confirmations: [
      {
        id: 'true_and_complete',
        label:
          'The statements above are true and nothing affecting this insurance has been withheld or concealed.',
      },
      {
        id: 'basis_of_contract',
        label: 'This proposal and declaration will be the basis of the contract with Serene.',
      },
      {
        id: 'cover_not_yet',
        label: 'Cover does not start until Serene accepts the proposal or issues an official cover note.',
      },
    ],
    fields: [
      // added for online sale: capacity of the person signing for the company
      {
        id: 'signatory_position',
        type: 'text',
        label: 'Position of the person signing',
        docLabel: 'Capacity',
        help: 'For example Managing Director or Owner.',
        required: true,
        maxLength: 80,
      },
      {
        id: 'agent',
        type: 'text',
        label: 'Agent (if any)',
        docLabel: 'Agent',
        help: 'Leave blank if you are buying directly from Serene.',
        maxLength: 120,
      },
    ],
    signatureLabel: 'Signature',
    dateLabel: 'Date',
  },
};
