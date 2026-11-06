// ELECTRONIC EQUIPMENT PROPOSAL FORM
// Source: PROPOSAL FORMS/ENGINEERING/ELECTRONIC EQUIPMENT.pdf (July 2025).
// "THE ONE I LIKE.docx" (May 2024) is not a newer or a machinery form: it is the same Electronic
// Equipment proposal (questions 1–7, the same declaration and the same "Specification of items to
// be insured - Electronic" table), retyped in Word. Its text was used to read the wording where
// the PDF layout runs columns together; the newer PDF is the source. ELECTRONIC EQUIPMENT.doc is
// the legacy binary of the PDF.
import { businessIdentitySection } from '../kyc';
import type { FormDefinition } from '../schema';

const YES = (field: string) => ({ field, equals: 'yes' }) as const;

export const electronicEquipment: FormDefinition = {
  id: 'electronic-equipment',
  version: 1,
  title: 'ELECTRONIC EQUIPMENT PROPOSAL FORM',
  source: 'ENGINEERING/ELECTRONIC EQUIPMENT.pdf',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'The business that owns or hires the equipment. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          number: '1',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              label: 'Name of proposer',
              docLabel: 'Name and Address of Proposer',
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
              label: 'Address of proposer',
              docLabel: 'Address',
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
              width: 'half',
              row: 'contact',
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
            {
              id: 'email',
              type: 'email',
              label: 'Email address',
              docLabel: 'E-Mail Address',
              help: 'We send your policy documents and receipts here.',
              required: true,
              prefill: 'email',
              saveToProfile: 'email',
            },
            { id: 'business_type', type: 'text', label: 'Type of business', required: true, maxLength: 120 },
          ],
        },
      ],
    },
    {
      id: 'premises',
      title: 'Premises',
      sections: [
        {
          id: 'location',
          fields: [
            {
              id: 'equipment_location',
              type: 'textarea',
              label: 'Location of equipment to be insured (address of building, storey)',
              help: 'Include the GhanaPost GPS address and the floor the equipment is on.',
              role: 'riskAddress',
              required: true,
              maxLength: 300,
            },
            {
              id: 'building_structure',
              type: 'checkboxes',
              label: 'Structure of building',
              required: true,
              options: [
                { value: 'steel_skeleton', label: 'Steel skeleton' },
                { value: 'brickwork', label: 'Brickwork' },
                { value: 'concrete', label: 'Concrete' },
                { value: 'wood', label: 'Wood' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'equipment',
      title: 'Equipment',
      sections: [
        {
          id: 'specification',
          title: 'Specification of items to be insured - Electronic',
          fields: [
            {
              id: 'edp_note',
              type: 'read',
              label: 'Computer (EDP) equipment',
              paragraphs: [
                'For the insurance of electronic data processing (EDP) equipment, an additional questionnaire for EDP equipment has to be completed.',
              ],
            },
            {
              // Rows are numbered on screen and in the document ("Item No").
              id: 'items',
              type: 'table',
              label: 'Specification of items to be insured',
              required: true,
              minRows: 1,
              printRows: 10,
              addLabel: 'Add another item',
              columns: [
                {
                  id: 'description',
                  label:
                    'Description of items (full and exact description of all equipment, including name of manufacturer, type, serial number, voltage, power input, etc. In the case of outdoor lines, indicate length and method of laying)',
                  type: 'text',
                  required: true,
                  weight: 3,
                },
                { id: 'year_of_manufacture', label: 'Year of manufacture', type: 'year' },
                {
                  id: 'remarks',
                  label:
                    'Remarks (particulars of any part which has had a breakdown or failure during the last three years and shows any signs of repair; for mobile equipment, means and frequency of transport, areas of operation and distances; state if picture or admitter tubes are built in)',
                  type: 'text',
                  weight: 2.5,
                },
                {
                  id: 'bought_or_hired',
                  label: 'A / B',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'A', label: 'A — bought equipment' },
                    { value: 'B', label: 'B — hired equipment' },
                  ],
                  weight: 0.6,
                },
                {
                  id: 'replacement_value',
                  label:
                    'Replacement value (current cost of replacing the equipment by new equipment of the same kind plus freight charges, customs duties, costs of erection, package material)',
                  type: 'money',
                  required: true,
                  weight: 1.5,
                },
              ],
            },
            {
              id: 'total_replacement_value',
              type: 'money',
              label: 'Total',
              docLabel: 'Total replacement value',
              help: 'The total of the replacement values above.',
              role: 'sumInsured',
              required: true,
              min: 1,
              width: 'half',
            },
          ],
        },
        {
          id: 'new_equipment',
          number: '3',
          fields: [
            {
              id: 'all_new',
              type: 'yesno',
              label: 'Are all the equipment to be insured new?',
              required: true,
              details: {
                when: 'no',
                label: 'Which items of the specification are second-hand?',
                docLabel: 'If not, which items of the specification are second-hand?',
              },
            },
            {
              id: 'ex_works_items',
              type: 'textarea',
              label: 'What equipment can still be obtained ex works? State items of the specification.',
              docLabel: 'What equipment can still to obtain ex works? State items of the specification',
              help: 'Items the manufacturer still supplies new.',
              maxLength: 600,
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
          id: 'previous_insurance',
          number: '2',
          fields: [
            {
              id: 'previously_insured',
              type: 'yesno',
              label:
                'Has any of the equipment to be insured previously been covered by other insurance companies?',
              required: true,
              details: {
                when: 'yes',
                label: 'Which items of the specification, and by which companies?',
                docLabel: 'If so, which items of the specification and by which companies?',
              },
            },
          ],
        },
        {
          id: 'commencement',
          title: 'State when the insurance is to commence',
          fields: [
            {
              id: 'cover_start',
              type: 'date',
              label: 'Date',
              role: 'coverStart',
              required: true,
              minDays: 0,
              maxDays: 60,
              width: 'third',
              row: 'start',
            },
            {
              id: 'cover_start_time',
              type: 'text',
              label: 'Time',
              placeholder: 'For example: 12:00',
              width: 'third',
              row: 'start',
              maxLength: 10,
            },
            {
              id: 'cover_end',
              type: 'date',
              label: 'Expiry',
              docLabel: 'Period of the insurance to expire at the same date and time next year',
              help: 'The period of the insurance expires at the same date and time next year.',
              role: 'coverEnd',
              required: true,
              minDays: 1,
              maxDays: 430,
              width: 'third',
              row: 'start',
            },
          ],
        },
      ],
    },
    {
      id: 'risks',
      title: 'Risks',
      sections: [
        {
          id: 'condition',
          fields: [
            {
              id: 'maintained_per_manufacturer',
              type: 'yesno',
              number: '4',
              label:
                'Condition of equipment: is the equipment maintained in accordance with the manufacturers’ instructions?',
              required: true,
            },
            {
              id: 'operators_trained',
              type: 'yesno',
              number: '5',
              label: 'Quality of staff: have operators been trained with the manufacturer?',
              required: true,
            },
          ],
        },
        {
          id: 'flood',
          number: '6',
          fields: [
            {
              id: 'flood_risk',
              type: 'yesno',
              label: 'Is there a high risk of flood and inundation?',
              required: true,
            },
            {
              id: 'flood_causes',
              type: 'checkboxes',
              label: 'If so, by',
              required: true,
              allowOther: true,
              showIf: YES('flood_risk'),
              options: [
                { value: 'bodies_of_water', label: 'Bodies of water' },
                { value: 'torrential_rainfall', label: 'Torrential rainfall' },
                { value: 'sewer_backflow', label: 'Sewer backflow' },
              ],
            },
          ],
        },
        {
          id: 'dangerous_materials',
          number: '7',
          fields: [
            {
              id: 'dangerous_materials',
              type: 'yesno',
              label: 'Are dangerous materials used in the vicinity?',
              required: true,
            },
            {
              id: 'dangerous_materials_types',
              type: 'checkboxes',
              label: 'If so, specify',
              required: true,
              allowOther: true,
              showIf: YES('dangerous_materials'),
              options: [
                { value: 'acids', label: 'Acids' },
                { value: 'sensitized_papers', label: 'Prepared or sensitized papers' },
                { value: 'lyes', label: 'Lyes' },
                { value: 'test_solutions', label: 'Test solutions' },
                { value: 'developers', label: 'Developers' },
                { value: 'explosives', label: 'Explosives' },
                { value: 'isotopes', label: 'Isotopes' },
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
          id: 'equipment_docs',
          title: 'Equipment',
          fields: [
            {
              id: 'equipment_invoices',
              type: 'file',
              kind: 'equipment_invoices',
              label: 'Purchase invoices or valuation of the equipment',
              help: 'Optional, but it supports the replacement values you gave.',
              accept: ['pdf', 'image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 10,
            },
            {
              id: 'equipment_photos',
              type: 'file',
              kind: 'equipment_photos',
              label: 'Photos of the equipment with serial plates',
              accept: ['image'],
              capture: 'environment',
              multiple: true,
              maxFiles: 10,
            },
            {
              id: 'edp_questionnaire',
              type: 'file',
              kind: 'edp_questionnaire',
              label: 'Completed EDP equipment questionnaire',
              help: 'Only if you are insuring computer (electronic data processing) equipment. Ask us for the questionnaire if you do not have it.',
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
      'It is the duty of the proposer to disclose all material facts relevant to the risk. A material fact is one that is likely to influence our judgment and acceptance of your proposal. If your proposal is a renewal, it should include any change in facts previously advised to us. If you are in any doubt about facts considered material, disclose them. Please note that failure to disclose a material fact or if any information provided proves to be incorrect, we may void your policy and decline to pay any claim.',
      'I/We declare that the statements and particulars made by me/us in this proposal are, to the best of my/our belief, complete and true and I/we agree that this proposal, together with any other information supplied by me/us, shall form the basis of the contract of insurance effected thereon.',
      'I further declare and agree that if the statement and particulars above have been completed in the handwriting of any other person other than the undersigned, such person is deemed to be the representative of the proposer for the purpose of completing this proposal.',
      'Signing this proposal form does not bind the proposer or underwriter to complete this insurance.',
    ],
    confirmations: [
      { id: 'material_facts', label: 'I/we have disclosed all material facts relevant to the risk.' },
      {
        id: 'complete_and_true',
        label:
          'The statements and particulars in this proposal are complete and true to the best of my/our belief.',
      },
      {
        id: 'basis_of_contract',
        label:
          'This proposal and any other information supplied will form the basis of the contract of insurance.',
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
