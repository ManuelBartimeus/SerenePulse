// PROPOSAL FORM (TRAVEL INSURANCE)
// Source: PROPOSAL FORMS/TRAVEL INSURANCE PROPOSAL FORM.docx (the only version in the archive).
// The paper form has no numbered questions; the order below is the paper's order.
import { individualIdentitySection } from '../kyc';
import { COUNTRIES_COMMON, ID_TYPES } from '../options';
import type { FormDefinition } from '../schema';

export const travel: FormDefinition = {
  id: 'travel',
  version: 1,
  title: 'PROPOSAL FORM (TRAVEL INSURANCE)',
  source: 'TRAVEL INSURANCE PROPOSAL FORM.docx',
  steps: [
    {
      id: 'proposer',
      title: 'Your details',
      description: 'As they appear in your passport. We fill in what we already know.',
      sections: [
        {
          id: 'proposer',
          fields: [
            {
              id: 'full_name',
              type: 'text',
              label: 'Full name of proposer',
              help: 'Exactly as printed in your passport.',
              required: true,
              prefill: 'fullName',
              saveToProfile: 'fullName',
              role: 'insuredName',
              maxLength: 120,
            },
            {
              id: 'date_of_birth',
              type: 'date',
              label: 'Date of birth',
              required: true,
              maxAge: 100,
              prefill: 'dateOfBirth',
              saveToProfile: 'dateOfBirth',
              width: 'half',
              row: 'dob',
            },
            {
              // The passport is the proposer's ID for travel cover, so it is not prefilled from the
              // profile ID (which is usually the Ghana Card).
              id: 'passport_no',
              type: 'text',
              label: 'Passport number',
              docLabel: 'Passport No.',
              format: 'passport',
              required: true,
              width: 'half',
              row: 'dob',
            },
            // added for online sale: identity is checked against the Ghana Card record (L.I. 2523)
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
              help: 'Your Ghana Card number, for example GHA-123456789-0, or your passport number if you have no Ghana Card.',
              required: true,
              prefill: 'idNumber',
              saveToProfile: 'idNumber',
              width: 'half',
              row: 'id',
              maxLength: 30,
            },
            {
              id: 'citizenship',
              type: 'select',
              label: 'Citizenship',
              options: COUNTRIES_COMMON,
              allowOther: true,
              required: true,
              width: 'half',
            },
            {
              id: 'address',
              type: 'textarea',
              label: 'Address',
              required: true,
              prefill: 'postalAddress',
              saveToProfile: 'postalAddress',
              maxLength: 200,
            },
            {
              id: 'phone',
              type: 'phone',
              label: 'Phone number',
              docLabel: 'Phone No.',
              required: true,
              prefill: 'phone',
              width: 'half',
              row: 'contact',
            },
            {
              id: 'email',
              type: 'email',
              label: 'Email address',
              docLabel: 'E-mail Address',
              help: 'We send your policy schedule and certificate here.',
              required: true,
              prefill: 'email',
              saveToProfile: 'email',
              width: 'half',
              row: 'contact',
            },
            {
              id: 'occupation',
              type: 'text',
              label: 'Occupation',
              required: true,
              prefill: 'occupation',
              saveToProfile: 'occupation',
              width: 'half',
              row: 'work',
              maxLength: 120,
            },
            {
              id: 'employer',
              type: 'text',
              label: 'Employer',
              prefill: 'employer',
              saveToProfile: 'employer',
              width: 'half',
              row: 'work',
              maxLength: 120,
            },
          ],
        },
      ],
    },
    {
      id: 'trip',
      title: 'Trip',
      sections: [
        {
          id: 'trip',
          fields: [
            {
              id: 'final_destination',
              type: 'text',
              label: 'Final destination',
              help: 'The country (and city, if you know it) you are travelling to.',
              required: true,
              maxLength: 120,
            },
            {
              // Not printed as a choice on the paper form: travel premiums are rated by zone, so the
              // zone of the final destination is asked here.
              id: 'destination_zone',
              type: 'select',
              label: 'Destination zone',
              help: 'For a Schengen visa choose Schengen & Europe: it meets the EUR 30,000 medical cover the embassies require.',
              role: 'travelDestination',
              required: true,
              options: [
                { value: 'africa', label: 'Africa' },
                { value: 'schengen_europe', label: 'Schengen & Europe' },
                { value: 'worldwide_excl_us_ca', label: 'Worldwide excl. USA & Canada' },
                { value: 'worldwide_incl_us_ca', label: 'Worldwide incl. USA & Canada' },
              ],
            },
            {
              id: 'cover_start',
              type: 'date',
              label: 'Start date',
              help: 'The day you leave Ghana.',
              role: 'coverStart',
              required: true,
              minDays: 0,
              maxDays: 60,
              width: 'half',
              row: 'dates',
            },
            {
              id: 'cover_end',
              type: 'date',
              label: 'End date',
              help: 'The day you return. Cover runs for up to a year.',
              role: 'coverEnd',
              required: true,
              minDays: 1,
              maxDays: 425,
              width: 'half',
              row: 'dates',
            },
            {
              // Key-facts statement from the paper declaration, shown where it applies.
              id: 'no_medical_treatment_abroad',
              type: 'read',
              label: 'Travelling for medical treatment is not covered',
              paragraphs: [
                'No policy Applicant will be travelling with the intention of receiving medical advice or treatment abroad.',
              ],
              acknowledge:
                'I confirm that nobody named on this application is travelling to receive medical advice or treatment abroad.',
            },
          ],
        },
      ],
    },
    {
      id: 'travellers',
      title: 'Travellers',
      sections: [
        {
          id: 'travellers',
          fields: [
            {
              id: 'accompanying_travellers',
              type: 'table',
              label: 'Spouse or children travelling with you',
              docLabel: 'Name & Ages of accompanying Spouse/Children (where applicable)',
              help: 'Leave empty if you are travelling alone. Ages are worked out from the dates of birth.',
              role: 'travelers',
              maxRows: 10,
              printRows: 3,
              addLabel: 'Add a traveller',
              columns: [
                { id: 'name', label: 'Name', type: 'text', required: true, weight: 2 },
                { id: 'date_of_birth', label: 'Date of birth', type: 'date', required: true },
              ],
            },
          ],
        },
        {
          id: 'emergency',
          title: 'In case of emergency',
          fields: [
            {
              id: 'emergency_contact_name',
              type: 'text',
              label: 'In case of emergency, please notify (name)',
              docLabel: 'In case of Emergency, please notify (Name)',
              required: true,
              width: 'half',
              row: 'emergency',
              maxLength: 120,
            },
            {
              id: 'emergency_contact_phone',
              type: 'phone',
              label: 'Their contact number',
              docLabel: 'Contact number',
              help: 'Someone staying in Ghana who can be reached while you are away.',
              required: true,
              width: 'half',
              row: 'emergency',
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
          id: 'passports',
          title: 'Passports',
          fields: [
            {
              // Proposers who chose passport as their ID already upload it in the identity check.
              id: 'passport_bio_page',
              type: 'file',
              kind: 'travel_passport_bio',
              label: 'Passport photo (bio-data) page',
              accept: ['image', 'pdf'],
              capture: 'environment',
              required: true,
              showIf: { field: 'id_type', notIn: ['passport'] },
              guidance:
                'Open the passport flat at the photo page. The whole page and the two code lines at the bottom must be readable.',
            },
            {
              id: 'traveller_passports',
              type: 'file',
              kind: 'travel_passport_bio_companion',
              label: 'Passport photo pages of the people travelling with you',
              accept: ['image', 'pdf'],
              capture: 'environment',
              multiple: true,
              maxFiles: 10,
              required: true,
              showIf: { field: 'accompanying_travellers', truthy: true },
            },
          ],
        },
        {
          id: 'trip_docs',
          title: 'Trip documents',
          fields: [
            {
              id: 'visa',
              type: 'file',
              kind: 'visa',
              label: 'Visa (if you already have it)',
              accept: ['image', 'pdf'],
              capture: 'environment',
            },
            {
              id: 'itinerary',
              type: 'file',
              kind: 'travel_itinerary',
              label: 'Flight ticket or itinerary',
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
    paragraphs: [
      'I confirm, on behalf of all people named on this application form that:',
      'All the information provided by me is true and complete.',
      'No policy Applicant will be travelling with the intention of receiving medical advice or treatment abroad.',
      'I understand that this declaration will, together with the policy wording, form the basis of the contract of insurance.',
      'I have read and understand the Key facts section of this leaflet.',
    ],
    confirmations: [
      {
        id: 'true_and_complete',
        label:
          'On behalf of everyone named on this form, all the information I have given is true and complete.',
      },
      {
        id: 'basis_of_contract',
        label:
          'This declaration, together with the policy wording, forms the basis of the contract of insurance.',
      },
      { id: 'key_facts', label: 'I have read and understood the key facts of this travel policy.' },
    ],
    fields: [
      {
        id: 'agency_no',
        type: 'text',
        label: 'Agency number (if any)',
        docLabel: 'Agency No.',
        help: 'Leave blank if you are buying directly from Serene.',
        maxLength: 40,
      },
    ],
    signatureLabel: 'Signature of Proposer',
    dateLabel: 'Date',
  },
};
