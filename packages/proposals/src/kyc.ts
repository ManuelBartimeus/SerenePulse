// Identity checks shared by every proposal form.
//
// National Identity Register (Amendment) Regulations, 2026 (L.I. 2523), enforced from 2 Nov 2026:
// insurers may not request, reproduce or keep a photocopy, scan or image of the Ghana Card;
// identity is confirmed biometrically against the National Identity Register. So we collect the
// Ghana Card NUMBER and a live photo of the person's face, and Serene verifies them with NIA.
// We never ask for a picture of the Ghana Card. Foreign nationals without a Ghana Card give their
// passport bio page instead (passports are not covered by L.I. 2523).
// NIC directive (effective 1 Jan 2026): a Ghana Card is mandatory for motor policies; companies give their TIN.
import type { Field, Section } from './schema';

const CARD_TYPES = ['ghana_card', 'non_citizen_card'] as const;

export const SELFIE_GUIDANCE =
  'Face the camera in good light, without a hat or sunglasses. Serene matches this photo with your Ghana Card record at the National Identification Authority. We never ask for a photo of the card itself.';

/** The identity-verification uploads for an individual proposer (uses the form's `id_type` field). */
export function individualIdentitySection(idTypeField = 'id_type'): Section {
  const fields: Field[] = [
    {
      id: 'id_selfie',
      type: 'file',
      kind: 'id_selfie',
      label: 'A photo of your face',
      help: 'Take it now with your phone’s front camera.',
      accept: ['image'],
      capture: 'user',
      required: true,
      guidance: SELFIE_GUIDANCE,
    },
    {
      id: 'id_passport_page',
      type: 'file',
      kind: 'id_passport',
      label: 'Passport photo page',
      accept: ['image', 'pdf'],
      capture: 'environment',
      required: true,
      showIf: { field: idTypeField, equals: 'passport' },
      guidance: 'The page with your photo and details. All four corners visible, no glare.',
    },
  ];
  return {
    id: 'identity',
    title: 'Identity check',
    description:
      'The law no longer lets insurers take copies of the Ghana Card. Instead we check your card number and a photo of your face with the National Identification Authority.',
    showIf: {
      any: [
        { field: idTypeField, in: [...CARD_TYPES] },
        { field: idTypeField, equals: 'passport' },
      ],
    },
    fields,
  };
}

/** Company proposer: registration document and the signatory's identity check. */
export function businessIdentitySection(): Section {
  return {
    id: 'identity',
    title: 'Company and signatory',
    description:
      'We need the company’s registration document and an identity check of the person signing for the company.',
    fields: [
      {
        id: 'company_registration_doc',
        type: 'file',
        kind: 'company_registration',
        label: 'Certificate of incorporation or business registration',
        help: 'Or the company profile from the Office of the Registrar of Companies.',
        accept: ['image', 'pdf'],
        capture: 'environment',
        required: true,
      },
      {
        id: 'signatory_ghana_card',
        type: 'text',
        label: 'Ghana Card number of the person signing',
        format: 'ghanaCard',
        required: true,
        width: 'half',
      },
      {
        id: 'id_selfie',
        type: 'file',
        kind: 'id_selfie',
        label: 'A photo of the signatory’s face',
        help: 'Take it now with the phone’s front camera.',
        accept: ['image'],
        capture: 'user',
        required: true,
        guidance: SELFIE_GUIDANCE,
      },
    ],
  };
}
