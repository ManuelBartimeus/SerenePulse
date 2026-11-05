import { describe, expect, it } from 'vitest';
import {
  activityValue,
  plainReason,
  findMentions,
  formatWorkingDays,
  isConflict,
  mentionQuery,
  slaSummary,
  slaTone,
  statusLabel,
  timeAgo,
} from './format';

describe('formatWorkingDays', () => {
  it('uses 9-hour working days', () => {
    expect(formatWorkingDays(1)).toBe('1 working day');
    expect(formatWorkingDays(1 + 3 / 9)).toBe('1 working day 3 h');
    expect(formatWorkingDays(2 / 9)).toBe('2 h');
    expect(formatWorkingDays(0.01)).toBe('under 1 working hour');
    expect(formatWorkingDays(null)).toBe('—');
  });
});

describe('slaSummary', () => {
  it('counts down while open', () => {
    expect(
      slaSummary({
        state: 'on_track',
        target_working_days: 3,
        elapsed_working_days: 1.5,
        remaining_working_days: 1.5,
        overdue_working_days: null,
      }),
    ).toEqual({ text: '1 working day 5 h left', pct: 50 });
  });
  it('shows how overdue a breached case is', () => {
    expect(
      slaSummary({
        state: 'breached',
        target_working_days: 1,
        elapsed_working_days: 2,
        remaining_working_days: 0,
        overdue_working_days: 1,
      }),
    ).toEqual({ text: 'Past deadline by 1 working day', pct: 100 });
  });
  it('tones', () => {
    expect(slaTone('breached')).toBe('danger');
    expect(slaTone('warning')).toBe('warning');
    expect(slaTone('met')).toBe('success');
  });
});

describe('mentions', () => {
  const people = [
    { user_id: 'a', display_name: 'Ama' },
    { user_id: 'b', display_name: 'Ama Mensah' },
    { user_id: 'c', display_name: 'Kofi' },
  ];
  it('finds the longest matching names', () => {
    expect(findMentions('Please check @Ama Mensah, thanks', people)).toEqual(['b']);
    expect(findMentions('@ama and @KOFI', people).sort()).toEqual(['a', 'c']);
    expect(findMentions('email kofi@example.com', people)).toEqual([]);
    expect(findMentions('@Kofiwhat', people)).toEqual([]);
  });
  it('detects the name being typed', () => {
    expect(mentionQuery('hello @Am')).toBe('Am');
    expect(mentionQuery('hello @')).toBe('');
    expect(mentionQuery('hello')).toBeNull();
  });
});

describe('labels', () => {
  it('maps statuses and activities', () => {
    expect(statusLabel('in_progress')).toBe('In progress');
    expect(activityValue('reopened', 'closed')).toBe('Closed');
    expect(activityValue('follow_up_recorded', 'unreachable')).toBe('Could not reach the customer');
    expect(activityValue('assigned', 'Ama')).toBe('Ama');
    expect(activityValue('priority_changed', 'P1')).toBe('Urgent');
  });
  it('rewrites system reasons in plain words', () => {
    expect(plainReason('Raised automatically: CSAT 2; comment keyword.')).toBe(
      'Raised automatically: Satisfaction rating 2 of 5; concerning comment.',
    );
  });
  it('recognises version conflicts', () => {
    expect(isConflict({ code: 'P0409' })).toBe(true);
    expect(isConflict(new Error('x'))).toBe(false);
  });
  it('relative time', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    expect(timeAgo('2026-11-05T11:58:00Z', now)).toBe('2 min ago');
    expect(timeAgo('2026-11-05T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-01T09:00:00Z', now)).toBe('01/11/2026');
  });
});
