import { describe, expect, it } from 'vitest';
import { firstOpenPage, formatStarted, hasDraftAnswers } from '../shared/resume';
import { definition, snapshot } from './test-fixtures';

describe('resume rules (shared by the Worker and the island)', () => {
  it('only real answers make a draft worth offering back', () => {
    expect(hasDraftAnswers({})).toBe(false);
    expect(hasDraftAnswers({ contact_consent: false, comment: '', branch: null })).toBe(false);
    expect(hasDraftAnswers({ nps: 0 })).toBe(true);
    expect(hasDraftAnswers({ contact_consent: true })).toBe(true);
  });

  it.each([
    [{}, 1],
    [{ channel: 'MOBILE_APP' }, 1], // product still missing on page 1
    [{ channel: 'WALK_IN', product: 'MOTOR', csat: 4, ces: 4, nps: 9 }, 1], // walk-in needs a branch
    [{ channel: 'MOBILE_APP', product: 'MOTOR' }, 2],
    [{ channel: 'MOBILE_APP', product: 'MOTOR', csat: 4, nps: 9 }, 3], // the gap, not the furthest page
    [{ channel: 'MOBILE_APP', product: 'MOTOR', csat: 4, ces: 4, nps: 9 }, 5], // improvement question
    [{ channel: 'MOBILE_APP', product: 'MOTOR', csat: 4, ces: 4, nps: 9, factor: 'SPEED' }, 5],
  ])('first open page for %j is %i', (answers, page) => {
    expect(firstOpenPage(definition, snapshot, answers)).toBe(page);
  });

  it('formats the start time in Ghana time', () => {
    expect(formatStarted('2026-11-05T14:05:00Z')).toBe('5 November 2026 at 2:05 pm');
    expect(formatStarted('2026-11-06T00:30:00Z')).toBe('6 November 2026 at 12:30 am');
    expect(formatStarted('not a date')).toBeNull();
    expect(formatStarted(null)).toBeNull();
  });
});
