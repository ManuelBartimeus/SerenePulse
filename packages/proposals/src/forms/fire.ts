// FIRE INSURANCE PROPOSAL FORM (fire and special perils)
// Source: PROPOSAL FORMS/FIRE/FSP/FIRE PROPOSAL FORM SERENE INS. 2.pdf (and .doc)
// Sold to individuals and businesses, so step 1 asks which, then the matching ID questions.
import { COUNTRIES_COMMON, CURRENCIES, ID_TYPES, ROOF_MATERIALS, WALL_MATERIALS } from '../options';
import { businessIdentitySection, individualIdentitySection } from '../kyc';
import type { FormDefinition, Section, TableColumn } from '../schema';

const isCompany = { field: 'proposer_type', equals: 'company' } as const;
const isIndividual = { field: 'proposer_type', equals: 'individual' } as const;
const isPrivate = { field: 'premises_type', equals: 'private' } as const;
const isBusiness = { field: 'premises_type', equals: 'business' } as const;

// Identity checks (L.I. 2523): the individual or the company version, whichever applies.
const individualIdentity = individualIdentitySection();
const personIdentity: Section = {
  ...individualIdentity,
  showIf: { all: [isIndividual, individualIdentity.showIf ?? isIndividual] },
};
const businessIdentity = businessIdentitySection();
const companyIdentity: Section = {
  ...businessIdentity,
  id: 'company_identity',
  showIf: isCompany,
  // Both sections ask for a face photo; field ids must be unique within the form.
  fields: businessIdentity.fields.map((f) => (f.id === 'id_selfie' ? { ...f, id: 'signatory_selfie' } : f)),
};

/** The paper's "Description (Breakdown) | Value | Currency" tables with printed rows. */
const breakdownColumns: readonly TableColumn[] = [
  {
    id: 'item',
    label: 'Item',
    type: 'select',
    required: true,
    options: [
      { value: 'building', label: 'Building' },
      { value: 'outbuilding', label: 'Outbuilding' },
      { value: 'wall_fence', label: 'Wall/Fence' },
      { value: 'other', label: 'Other, please specify' },
    ],
  },
  { id: 'description', label: 'Description (breakdown)', type: 'text', weight: 2 },
  { id: 'value', label: 'Value', type: 'money', required: true },
  { id: 'currency', label: 'Currency', type: 'select', options: CURRENCIES, required: true, weight: 0.7 },
];

export const fire: FormDefinition = {
  id: 'fire',
  version: 1,
  title: 'FIRE INSURANCE PROPOSAL FORM',
  source: 'FIRE/FSP/FIRE PROPOSAL FORM SERENE INS. 2.pdf',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'As they appear on your ID or business registration. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          fields: [
            // added for online sale: decides which ID questions apply
            {
              id: 'proposer_type',
              type: 'radio',
              label: 'Who is the proposer?',
              docLabel: 'Proposer',
              required: true,
              options: [
                { value: 'individual', label: 'An individual' },
                { value: 'company', label: 'A company or business' },
              ],
            },
            {
              id: 'full_name',
              type: 'text',
              label: 'Proposer’s name',
              docLabel: 'Proposer’s Name',
              required: true,
              prefill: 'fullName',
              saveToProfile: 'fullName',
              role: 'insuredName',
              showIf: isIndividual,
              maxLength: 120,
            },
            {
              id: 'company_name',
              type: 'text',
              label: 'Name of the company or business',
              docLabel: 'Proposer’s Name',
              help: 'As on the certificate of incorporation or business registration.',
              required: true,
              prefill: 'companyName',
              saveToProfile: 'companyName',
              role: 'insuredName',
              showIf: isCompany,
              maxLength: 160,
            },
            {
              id: 'address',
              type: 'textarea',
              label: 'Address',
              help: 'Where you live or where the business is located, with the GhanaPost GPS address if you have it.',
              required: true,
              prefill: 'residentialAddress',
              saveToProfile: 'residentialAddress',
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
              docLabel: 'Tel No.',
              required: true,
              prefill: 'phone',
              width: 'half',
              row: 'phone',
            },
            {
              id: 'alt_phone',
              type: 'phone',
              label: 'Alternative telephone number',
              docLabel: 'Alt. Tel No.',
              width: 'half',
              row: 'phone',
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
            {
              id: 'occupation',
              type: 'text',
              label: 'Occupation or business',
              required: true,
              prefill: 'occupation',
              saveToProfile: 'occupation',
              width: 'half',
              row: 'occupation',
              maxLength: 120,
            },
            {
              id: 'nationality',
              type: 'select',
              label: 'Nationality (if not Ghanaian)',
              help: 'Leave blank if Ghanaian.',
              options: COUNTRIES_COMMON.filter((c) => c.value !== 'ghana'),
              allowOther: true,
              width: 'half',
              row: 'occupation',
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
              showIf: isIndividual,
              width: 'half',
              row: 'id',
            },
            // added for online sale
            {
              id: 'id_number',
              type: 'text',
              label: 'ID number',
              docLabel: 'ID no.',
              required: true,
              prefill: 'idNumber',
              saveToProfile: 'idNumber',
              showIf: isIndividual,
              width: 'half',
              row: 'id',
              maxLength: 30,
            },
            // added for online sale
            {
              id: 'company_reg_no',
              type: 'text',
              label: 'Company registration number',
              docLabel: 'Registration no.',
              required: true,
              prefill: 'companyRegNo',
              saveToProfile: 'companyRegNo',
              showIf: isCompany,
              width: 'half',
              row: 'company_id',
              maxLength: 40,
            },
            // added for online sale
            {
              id: 'tin',
              type: 'text',
              label: 'Taxpayer identification number (TIN)',
              docLabel: 'TIN',
              format: 'tin',
              required: true,
              prefill: 'tin',
              saveToProfile: 'tin',
              showIf: isCompany,
              width: 'half',
              row: 'company_id',
            },
          ],
        },
      ],
    },
    {
      id: 'property',
      title: 'Property',
      sections: [
        {
          id: 'details',
          title: 'Details of the proposed insurance',
          fields: [
            {
              id: 'property_situation',
              type: 'textarea',
              label: 'Where is the property to be insured?',
              docLabel: 'SITUATION of property to be insured',
              help: 'House or plot number, street, area and town, plus the GhanaPost GPS address if you have it.',
              role: 'riskAddress',
              required: true,
              maxLength: 300,
            },
            {
              id: 'wall_material',
              type: 'select',
              label: 'Built with',
              docLabel: 'CONSTRUCTION: Built with',
              options: WALL_MATERIALS,
              allowOther: true,
              required: true,
              width: 'half',
              row: 'construction',
            },
            {
              id: 'roof_material',
              type: 'select',
              label: 'Roofed with',
              options: ROOF_MATERIALS,
              allowOther: true,
              required: true,
              width: 'half',
              row: 'construction',
            },
            {
              // The paper has two parts, "PRIVATE PREMISES ONLY" and "BUSINESS PREMISES ONLY";
              // this choice shows the part that applies.
              id: 'premises_type',
              type: 'radio',
              label: 'What kind of premises is it?',
              docLabel: 'Premises',
              required: true,
              options: [
                {
                  value: 'private',
                  label: 'Private premises',
                  hint: 'A private dwelling house and its outbuildings',
                },
                {
                  value: 'business',
                  label: 'Business premises',
                  hint: 'Shop, office, warehouse, factory and the like',
                },
              ],
            },
            {
              id: 'survey_notice',
              type: 'read',
              label: 'Special notice: trade or business premises',
              docLabel: 'SPECIAL NOTICE AGENTS TRADE OR BUSINESS',
              showIf: isBusiness,
              paragraphs: [
                'If the building(s) forming part of the subject of the proposal are used for business purposes it is necessary to have a Survey Report Form completed.',
              ],
              acknowledge: 'I understand Serene will need a survey report on the business premises.',
            },
          ],
        },
      ],
    },
    {
      id: 'sums',
      title: 'Sums insured',
      description: 'Amounts in Ghana cedis unless you choose another currency in a breakdown.',
      sections: [
        {
          id: 'private_building',
          number: '1',
          title: 'Private premises only',
          showIf: isPrivate,
          fields: [
            {
              id: 'private_building_sum_insured',
              type: 'money',
              label: 'Sum insured for the dwelling house, outbuildings, walls, gates and fences',
              docLabel:
                'The BUILDING OF THE PRIVATE DWELLING HOUSE and domestic offices, stables, garage and outbuildings (including landlord’s fixtures and fittings) on the same premises and used in connection therewith and walls, gate and fences around and pertaining thereto the property of the insured. Sum Insured GH₵',
              help: 'Includes domestic offices, stables, garage and outbuildings, landlord’s fixtures and fittings, and the walls, gate and fences. Use the cost to rebuild today.',
              min: 0,
              required: true,
              width: 'half',
            },
            {
              id: 'private_building_breakdown',
              type: 'table',
              label: 'Breakdown',
              docLabel: 'Description (Breakdown)',
              printRows: 4,
              maxRows: 10,
              addLabel: 'Add a line',
              columns: breakdownColumns,
            },
          ],
        },
        {
          id: 'household_goods',
          number: '2',
          showIf: isPrivate,
          fields: [
            {
              id: 'household_goods_sum_insured',
              type: 'money',
              label: 'Sum insured for household goods and personal effects',
              docLabel:
                'HOUSEHOLD GOODS AND PERSONAL EFFECTS of every description, the Property of the proposer or of permanently resident members of the family and of servants in the above dwelling. Sum Insured GH₵',
              help: 'Everything in the house belonging to you, your family living with you, and your household staff.',
              min: 0,
              width: 'half',
            },
            {
              id: 'specified_articles_note',
              type: 'read',
              label: 'Valuable single articles',
              paragraphs: [
                'Note: Any article (furniture, pianos and organs except) which exceed in value 5% of the sum insured must be specified below and insured separately.',
              ],
            },
            {
              id: 'other_property',
              type: 'table',
              label: 'Description of any other property to be insured',
              docLabel: 'DESCRIPTION OF ANY OTHER PROPERTY TO BE INSURED (See note above)',
              printRows: 4,
              addLabel: 'Add an article',
              columns: [
                {
                  id: 'description',
                  label: 'Description (breakdown)',
                  type: 'text',
                  required: true,
                  weight: 2.5,
                },
                { id: 'value', label: 'Value', type: 'money', required: true },
                {
                  id: 'currency',
                  label: 'Currency',
                  type: 'select',
                  options: CURRENCIES,
                  required: true,
                  weight: 0.7,
                },
              ],
            },
          ],
        },
        {
          id: 'business_building',
          number: '3',
          title: 'Business premises only',
          showIf: isBusiness,
          fields: [
            {
              id: 'business_occupied_for',
              type: 'text',
              label: 'What are the business premises used for?',
              docLabel: 'Building of business premises occupied for',
              help: 'For example: retail shop, offices, warehouse for building materials.',
              required: true,
              maxLength: 200,
            },
            {
              id: 'business_building_breakdown',
              type: 'table',
              label: 'Building of business premises: breakdown',
              docLabel: 'Description (Breakdown)',
              printRows: 4,
              maxRows: 10,
              addLabel: 'Add a line',
              columns: breakdownColumns,
            },
            {
              id: 'separate_schedule_note',
              type: 'read',
              label: 'More than one building',
              paragraphs: [
                'N.B. Where there are more than one building a separate schedule be prepared and attached.',
              ],
            },
            {
              id: 'building_schedule',
              type: 'file',
              kind: 'building_schedule',
              label: 'Schedule of buildings (if more than one building)',
              accept: ['image', 'pdf'],
              multiple: true,
              maxFiles: 3,
            },
          ],
        },
        {
          id: 'stock',
          number: '4',
          title: 'On stock in trade',
          showIf: isBusiness,
          fields: [
            {
              id: 'stock_raw_materials_description',
              type: 'text',
              number: '(i)',
              label: 'Raw material consisting of',
              maxLength: 200,
              width: 'half',
              row: 'raw',
            },
            {
              id: 'stock_raw_materials',
              type: 'money',
              label: 'Value of raw material',
              min: 0,
              width: 'half',
              row: 'raw',
            },
            {
              id: 'stock_wip',
              type: 'money',
              number: '(ii)',
              label: 'Semi-finished goods / work-in-progress',
              docLabel: 'Semi Finished goods/Work-in progress',
              min: 0,
              width: 'half',
            },
            {
              id: 'stock_finished_description',
              type: 'text',
              number: '(iii)',
              label: 'Finished goods consisting of',
              maxLength: 200,
              width: 'half',
              row: 'finished',
            },
            {
              id: 'stock_finished',
              type: 'money',
              label: 'Value of finished goods',
              min: 0,
              width: 'half',
              row: 'finished',
            },
          ],
        },
        {
          id: 'fixtures',
          number: '5',
          showIf: isBusiness,
          fields: [
            {
              id: 'trade_fixtures',
              type: 'money',
              label: 'On fixtures, fittings and utensils in trade',
              docLabel: 'On fixture, fitting and utensils in Trade',
              min: 0,
              width: 'half',
            },
          ],
        },
        {
          id: 'business_other',
          number: '6',
          showIf: isBusiness,
          fields: [
            {
              id: 'business_other_property_description',
              type: 'text',
              label: 'Other property to be insured',
              maxLength: 200,
              width: 'half',
              row: 'other',
            },
            {
              id: 'business_other_property',
              type: 'money',
              label: 'Value of other property',
              min: 0,
              width: 'half',
              row: 'other',
            },
          ],
        },
        {
          id: 'total',
          fields: [
            {
              // The paper asks for the total twice ("TOTAL SUM TO BE INSURED" at the top and
              // "TOTAL SUM INSURED" after item 6); one answer serves both.
              id: 'total_sum_insured',
              type: 'money',
              label: 'Total sum insured',
              docLabel: 'TOTAL SUM INSURED',
              help: 'The total of all the amounts above.',
              role: 'sumInsured',
              min: 1,
              required: true,
              width: 'half',
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
          id: 'allied_perils',
          title: 'Allied perils',
          fields: [
            {
              id: 'allied_perils',
              type: 'checkboxes',
              label: 'Do you wish to extend this insurance to cover loss or damage caused by:',
              docLabel:
                'Do you wish to extend this insurance cover loss of Damage caused by: (Please, tick whichever is applicable)',
              help: 'Fire and lightning are always covered. Tick any extra perils you want; leave all unticked for fire only.',
              options: [
                { value: 'impact', label: 'Impact' },
                { value: 'aircraft', label: 'Aircraft and/or articles dropped therefrom' },
                { value: 'explosion', label: 'Explosion' },
                { value: 'windstorm', label: 'Hurricane, cyclone, tornado, typhoon and/or windstorm' },
                {
                  value: 'burst_pipes',
                  label: 'Bursting or overflowing of water pipes, apparatus and the like',
                },
                { value: 'flood', label: 'Flood' },
                { value: 'earthquake', label: 'Earthquake and volcanic eruption (fire and shock)' },
                { value: 'riot_strike', label: 'Riot and strike, civil commotion and malicious damage' },
              ],
            },
            {
              id: 'loss_of_profits_notice',
              type: 'read',
              label: 'Have you thought about loss of profits cover?',
              showIf: isBusiness,
              paragraphs: [
                'You are now insuring your property against loss or damage by fire. Have you thought about LOSS OF PROFITS Policy?',
                'If fire seriously interrupts your business, Sales will fall and your profits will be much reduced. Protect yourself from financial loss in this way by taking a supplementary policy with the SERENE INSURANCE COMPANY LTD.',
              ],
            },
          ],
        },
        {
          id: 'history',
          title: 'History',
          fields: [
            {
              id: 'previous_loss',
              type: 'yesno',
              number: '7',
              label: 'Has the proposer ever suffered loss or damage by fire or any other peril?',
              required: true,
              details: { when: 'yes', label: 'Give details', docLabel: 'If so, give details' },
            },
            {
              id: 'previously_refused',
              type: 'yesno',
              number: '8',
              label:
                'Has any insurance company or underwriter ever refused a proposal from you, or cancelled or refused to renew a policy?',
              required: true,
              details: {
                when: 'yes',
                label: 'Name of the company concerned',
                docLabel: 'If so, state name of Company concerned',
              },
            },
            {
              id: 'insured_elsewhere',
              type: 'yesno',
              number: '9',
              label: 'Is the property proposed for insurance already insured with another company?',
              required: true,
              details: {
                when: 'yes',
                label: 'Give details (insurer, policy number, sum insured)',
                docLabel: 'If so, give details',
              },
            },
            {
              id: 'basis_note',
              type: 'read',
              label: 'When cover starts',
              paragraphs: [
                'Note: The information furnished in the replies to the above questions will constitute the basis of the Insurance and will regulate the rate of the premium. The responsibility of the Company does not commence until the proposal is accepted and cover note issued on payment of the agreed premium.',
              ],
              acknowledge:
                'I understand my answers set the premium, and cover starts only once Serene accepts the proposal and the premium is paid.',
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
              label: 'Period of insurance: from',
              docLabel: 'Period of Insurance: From',
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
              label: 'To',
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
        {
          id: 'regulator',
          fields: [
            {
              id: 'regulator_contact',
              type: 'read',
              label: 'Contacting our regulator',
              paragraphs: [
                'If you have any reason to contact our Regulator, you may reach them at the address below:',
                'National Insurance Commission, Insurance Place, Independence Avenue, P. O. Box CT 3456, Cantonments, Accra, Ghana. Tel: +233 302 238300 / 238301. Fax: +233 302 237248 / 246369. E-mail: info@nicgh.org. Website: www.nicgh.org',
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
        personIdentity,
        companyIdentity,
        {
          id: 'property_docs',
          title: 'The property',
          description: 'Photos help the underwriter accept the risk without delay.',
          fields: [
            {
              id: 'photo_building_front',
              type: 'file',
              kind: 'building_front',
              label: 'Front of the building',
              accept: ['image'],
              capture: 'environment',
              required: true,
              guidance: 'Stand back so the whole building is in the picture, in daylight.',
              width: 'half',
            },
            {
              id: 'photo_building_inside',
              type: 'file',
              kind: 'building_inside',
              label: 'Inside the building',
              accept: ['image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 6,
              required: true,
              width: 'half',
            },
            {
              id: 'valuation_report',
              type: 'file',
              kind: 'valuation_report',
              label: 'Valuation report (if you have one)',
              accept: ['image', 'pdf'],
            },
            {
              id: 'contents_inventory',
              type: 'file',
              kind: 'contents_inventory',
              label: 'Inventory of contents or stock (if you have one)',
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
    title: 'Declaration',
    paragraphs: [
      'I/WE hereby declare the truth and correctness of the above statements and particulars and agree that the statements represent the true position at the date shown in accordance with the information made available to me/us.',
    ],
    confirmations: [
      { id: 'true_and_correct', label: 'The statements and particulars above are true and correct.' },
      {
        id: 'true_position',
        label: 'They represent the true position at today’s date, from the information available to me/us.',
      },
    ],
    fields: [
      // The agent/broker's own signature on the paper form is collected by Serene, not the customer.
      {
        id: 'agent_broker_name',
        type: 'text',
        label: 'Agent or broker name (if any)',
        docLabel: 'Agent/Broker Name',
        help: 'Leave blank if you are buying directly from Serene.',
        width: 'half',
        row: 'agent',
        maxLength: 120,
      },
      {
        id: 'agent_broker_no',
        type: 'text',
        label: 'Agent or broker number',
        docLabel: 'No.',
        width: 'half',
        row: 'agent',
        maxLength: 40,
      },
    ],
    signatureLabel: 'Signature of Proposer',
    dateLabel: 'Date',
  },
};
