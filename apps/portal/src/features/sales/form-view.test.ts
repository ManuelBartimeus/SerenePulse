import { allFields, formById, type Field } from '@serene/proposals';
import { describe, expect, it } from 'vitest';
import { answerText, cellText, declarationFields, longDate } from './form-view';

const motor = formById('motor')!;
const field = (id: string): Field => {
  const f = allFields(motor).find((x) => x.field.id === id)?.field;
  if (!f) throw new Error(`no field ${id}`);
  return f;
};

describe('answerText', () => {
  it('writes money in cedis with two decimals', () => {
    expect(answerText(field('tppd_increase_amount'), { tppd_increase_amount: 12500 })).toBe('GH₵ 12,500.00');
  });

  it('writes dates out in full', () => {
    expect(answerText(field('date_of_birth'), { date_of_birth: '1990-03-07' })).toBe('7 March 1990');
    expect(longDate('2026-11-26T10:00:00Z')).toBe('26 November 2026');
  });

  it('gives option labels, and the text written in for "Other"', () => {
    expect(answerText(field('vehicle_use'), { vehicle_use: 'taxi' })).toBe('Taxi');
    expect(
      answerText(field('vehicle_use'), { vehicle_use: '__other', vehicle_use__other: 'Driving school' }),
    ).toBe('Other: Driving school');
  });

  it('lists ticked checkboxes', () => {
    const f: Field = {
      id: 'perils',
      type: 'checkboxes',
      label: 'Perils',
      options: [
        { value: 'fire', label: 'Fire' },
        { value: 'flood', label: 'Flood' },
      ],
      allowOther: true,
    };
    expect(answerText(f, { perils: ['fire', '__other'], perils__other: 'Riot' })).toBe('Fire, Other: Riot');
  });

  it('writes yes / no and leaves unanswered fields blank', () => {
    expect(answerText(field('physical_defect'), { physical_defect: 'yes' })).toBe('Yes');
    expect(answerText(field('physical_defect'), { physical_defect: 'no' })).toBe('No');
    expect(answerText(field('physical_defect'), {})).toBe('');
  });

  it('formats table cells by column type', () => {
    expect(cellText({ id: 'v', label: 'Value', type: 'money' }, 80000)).toBe('GH₵ 80,000.00');
    expect(cellText({ id: 'c', label: 'cc', type: 'number', unit: 'cc' }, 1800)).toBe('1,800 cc');
    expect(cellText({ id: 'x', label: 'x', type: 'text' }, null)).toBe('');
  });

  it('collects the fields printed with the signature block', () => {
    const ids = declarationFields(motor, {}).map((f) => f.id);
    for (const f of motor.declaration.fields ?? []) if (!f.showIf) expect(ids).toContain(f.id);
  });
});
