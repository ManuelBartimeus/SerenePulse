import { describe, expect, it } from 'vitest';
import { passwordProblem, safeNext } from './auth';

describe('safeNext (where sign-in goes afterwards)', () => {
  it('keeps same-site pages', () => {
    expect(safeNext('/customers')).toBe('/customers');
    expect(safeNext('/proposals/123')).toBe('/proposals/123');
  });

  it('falls back to the overview for anything unsafe or circular', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/sign-in')).toBe('/');
    expect(safeNext('/sign-in?next=%2Fcustomers')).toBe('/');
  });
});

describe('passwordProblem', () => {
  it('still enforces the password rules', () => {
    expect(passwordProblem('short')).toMatch(/at least 8/);
    expect(passwordProblem('password123')).toMatch(/too common/);
    expect(passwordProblem('a.person@serene.test', 'a.person@serene.test')).toMatch(/email/);
    expect(passwordProblem('Correct-Horse-9')).toBeNull();
  });
});
