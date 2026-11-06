import { formById, type CustomerProfile, type FormDefinition } from '@serene/proposals';
import { describe, expect, it } from 'vitest';
import {
  applyPrefill,
  baseFieldId,
  clampStep,
  coverStepIndex,
  deriveCoverEnd,
  displayAnswer,
  errorTargetId,
  firstInvalidStep,
  hasRatingInput,
  isStepVisible,
  nextStepIndex,
  oneYearLessADay,
  prevStepIndex,
  ratingFingerprint,
  stepOfFirstError,
  visibleWizardSteps,
  wizardSteps,
} from './wizard';

/** A small synthetic form so the logic is tested independently of the real forms' wording. */
const form: FormDefinition = {
  id: 'test',
  version: 1,
  title: 'TEST',
  source: 'test',
  steps: [
    {
      id: 'you',
      title: 'You',
      sections: [
        {
          id: 's1',
          fields: [
            {
              id: 'full_name',
              type: 'text',
              label: 'Full name',
              required: true,
              prefill: 'fullName',
              role: 'insuredName',
            },
            {
              id: 'title',
              type: 'select',
              label: 'Title',
              options: [{ value: 'mr', label: 'Mr' }],
              prefill: 'title',
            },
            { id: 'phone', type: 'phone', label: 'Phone', prefill: 'phone' },
            { id: 'has_vehicle', type: 'yesno', label: 'Vehicle?', required: true },
          ],
        },
      ],
    },
    {
      id: 'vehicle',
      title: 'Vehicle',
      sections: [
        {
          id: 's2',
          showIf: { field: 'has_vehicle', equals: 'yes' },
          fields: [{ id: 'reg', type: 'text', label: 'Reg', required: true }],
        },
      ],
    },
    {
      id: 'cover',
      title: 'Cover',
      sections: [
        {
          id: 's3',
          fields: [
            {
              id: 'cover_type',
              type: 'radio',
              label: 'Cover',
              required: true,
              role: 'coverType',
              options: [{ value: 'a', label: 'A' }],
            },
            { id: 'cover_start', type: 'date', label: 'Start', required: true, role: 'coverStart' },
            { id: 'cover_end', type: 'date', label: 'End', required: true, role: 'coverEnd' },
          ],
        },
      ],
    },
  ],
  declaration: {
    paragraphs: ['I declare.'],
    confirmations: [],
    fields: [{ id: 'agent', type: 'text', label: 'Agent' }],
    signatureLabel: 'Signature',
  },
};

const profile: CustomerProfile = {
  customerNo: 'USR10001',
  phone: '+233241234567',
  fullName: 'Ama Mensah',
  title: 'mrs', // not an option of this form: must be skipped
  marketingConsent: false,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('wizard steps', () => {
  it('adds Review, Sign and Pay after the form steps with stable indices', () => {
    const steps = wizardSteps(form);
    expect(steps.map((s) => s.title)).toEqual(['You', 'Vehicle', 'Cover', 'Review', 'Sign', 'Pay']);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('skips steps whose sections are all hidden (live showIf)', () => {
    const vehicle = wizardSteps(form)[1]!;
    expect(isStepVisible(vehicle, { has_vehicle: 'no' })).toBe(false);
    expect(isStepVisible(vehicle, { has_vehicle: 'yes' })).toBe(true);
    expect(visibleWizardSteps(form, { has_vehicle: 'no' }).map((s) => s.id)).toEqual([
      'you',
      'cover',
      'review',
      'sign',
      'pay',
    ]);
    expect(nextStepIndex(form, { has_vehicle: 'no' }, 0)).toBe(2);
    expect(nextStepIndex(form, { has_vehicle: 'yes' }, 0)).toBe(1);
    expect(prevStepIndex(form, { has_vehicle: 'no' }, 2)).toBe(0);
    expect(prevStepIndex(form, {}, 0)).toBeNull();
  });
  it('clamps a resume point to a visible step and never to Pay', () => {
    expect(clampStep(form, { has_vehicle: 'no' }, 1)).toBe(2);
    expect(clampStep(form, {}, 99)).toBe(4);
    expect(clampStep(form, {}, 5)).toBe(4);
  });
  it('finds the first invalid step', () => {
    expect(firstInvalidStep(form, {})).toBe(0);
    expect(firstInvalidStep(form, { full_name: 'A B', has_vehicle: 'yes' })).toBe(1);
    expect(
      firstInvalidStep(form, {
        full_name: 'A B',
        has_vehicle: 'no',
        cover_type: 'a',
        cover_start: '2030-01-01',
        cover_end: '2030-12-31',
      }),
    ).toBeNull();
  });
  it('maps server errors to the step holding the field', () => {
    expect(
      stepOfFirstError(form, [
        { field: 'cover_type', message: 'x' },
        { field: 'reg', message: 'y' },
      ]),
    ).toBe(1);
    expect(stepOfFirstError(form, [{ field: 'has_vehicle__details', message: 'x' }])).toBe(0);
    expect(stepOfFirstError(form, [{ field: 'agent', message: 'x' }])).toBe(4);
    expect(stepOfFirstError(form, [{ field: 'nope', message: 'x' }])).toBeNull();
    expect(baseFieldId('make__other')).toBe('make');
    expect(errorTargetId({ field: 'vehicles', row: 0, column: 'make', message: '' })).toBe(
      'f-vehicles-0-make',
    );
  });
  it('opens renewals at the cover step', () => {
    expect(coverStepIndex(form)).toBe(2);
    const motor = formById('motor');
    if (motor) expect(motor.steps[coverStepIndex(motor)]?.id).toBe('cover');
  });
});

describe('prefill', () => {
  it('fills empty fields from the profile without overwriting answers', () => {
    const a = applyPrefill(form, { full_name: 'Kofi Boateng' }, profile);
    expect(a.full_name).toBe('Kofi Boateng');
    expect(a.phone).toBe('024 123 4567');
    expect(a.title).toBeUndefined();
    expect(applyPrefill(form, {}, profile).full_name).toBe('Ama Mensah');
  });
});

describe('cover dates and rating', () => {
  it('derives the end date as one year less a day, unless the customer changed it', () => {
    expect(oneYearLessADay('2026-11-07')).toBe('2027-11-06');
    expect(oneYearLessADay('2028-02-29')).toBe('2029-02-28');
    const a1 = deriveCoverEnd(form, {}, { cover_start: '2026-11-07' });
    expect(a1.cover_end).toBe('2027-11-06');
    const a2 = deriveCoverEnd(form, a1, { ...a1, cover_start: '2026-12-01' });
    expect(a2.cover_end).toBe('2027-11-30');
    const custom = { ...a2, cover_end: '2027-05-31' };
    expect(deriveCoverEnd(form, custom, { ...custom, cover_start: '2026-12-02' }).cover_end).toBe(
      '2027-05-31',
    );
  });
  it('fingerprints only the answers that change the price', () => {
    const base = { cover_type: 'a', full_name: 'A' };
    expect(ratingFingerprint(form, base)).toBe(ratingFingerprint(form, { ...base, full_name: 'B' }));
    expect(ratingFingerprint(form, base)).not.toBe(
      ratingFingerprint(form, { ...base, cover_start: '2027-01-01' }),
    );
    expect(hasRatingInput(form, { full_name: 'A' })).toBe(false);
    expect(hasRatingInput(form, base)).toBe(true);
  });
});

describe('review display', () => {
  it('shows labels, not stored values', () => {
    const f = form.steps[2]!.sections[0]!.fields;
    expect(displayAnswer(f[0]!, { cover_type: 'a' }, () => '')).toBe('A');
    expect(displayAnswer(f[1]!, { cover_start: '2026-11-07' }, () => '')).toBe('7 Nov 2026');
    const yn = form.steps[0]!.sections[0]!.fields[3]!;
    expect(displayAnswer(yn, { has_vehicle: 'yes' }, () => '')).toBe('Yes');
  });
});
