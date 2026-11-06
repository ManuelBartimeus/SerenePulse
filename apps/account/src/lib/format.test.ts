import { describe, expect, it } from 'vitest';
import {
  amountToInput,
  cardBrand,
  daysUntil,
  expiryValid,
  firstName,
  formatAmountInput,
  formatCardNumber,
  formatCountdown,
  formatDate,
  formatDigitalAddressInput,
  formatExpiryInput,
  formatGhanaCardInput,
  formatMoney,
  formatPhoneInput,
  formatPhoneLocal,
  initials,
  isGhanaMobile,
  luhnValid,
  maskPhone,
  parseAmount,
  renewalText,
  sentence,
  toE164,
} from './format';

describe('phone numbers', () => {
  it('normalises local and international Ghana numbers to E.164', () => {
    expect(toE164('024 123 4567')).toBe('+233241234567');
    expect(toE164('0241234567')).toBe('+233241234567');
    expect(toE164('+233 24 123 4567')).toBe('+233241234567');
    expect(toE164('00233241234567')).toBe('+233241234567');
    expect(toE164('233241234567')).toBe('+233241234567');
    expect(toE164('024 123 456')).toBeNull();
    expect(toE164('+44 7700 900123')).toBeNull();
  });
  it('accepts only mobile prefixes for sign-in', () => {
    expect(isGhanaMobile('0551234567')).toBe(true);
    expect(isGhanaMobile('0201234567')).toBe(true);
    expect(isGhanaMobile('0302917444')).toBe(false);
  });
  it('formats as you type', () => {
    expect(formatPhoneInput('0')).toBe('0');
    expect(formatPhoneInput('0241')).toBe('024 1');
    expect(formatPhoneInput('0241234567')).toBe('024 123 4567');
    expect(formatPhoneInput('02412345678999')).toBe('024 123 4567');
    expect(formatPhoneInput('+23324')).toBe('+233 24');
    expect(formatPhoneInput('+233241234567')).toBe('+233 24 123 4567');
    expect(formatPhoneInput('233241234567')).toBe('+233 24 123 4567');
  });
  it('displays and masks', () => {
    expect(formatPhoneLocal('+233241234567')).toBe('024 123 4567');
    expect(maskPhone('+233241234567')).toBe('024 *** 4567');
  });
});

describe('money', () => {
  it('formats cedi amounts', () => {
    expect(formatMoney(1234.5)).toBe('GH₵\u00a01,234.50');
    expect(formatMoney(-50)).toBe('−GH₵\u00a050.00');
    expect(formatMoney(10, 'USD')).toBe('US$\u00a010.00');
  });
  it('groups thousands while typing and parses back', () => {
    expect(formatAmountInput('1234567')).toBe('1,234,567');
    expect(formatAmountInput('1234.5')).toBe('1,234.5');
    expect(formatAmountInput('1234.567')).toBe('1,234.56');
    expect(formatAmountInput('00012')).toBe('12');
    expect(formatAmountInput('.5')).toBe('0.5');
    expect(formatAmountInput('12a3')).toBe('123');
    expect(formatAmountInput('1.2.3')).toBe('1.23');
    expect(formatAmountInput('1234.5', 0)).toBe('1,234');
    expect(parseAmount('12,500.50')).toBe(12500.5);
    expect(parseAmount('')).toBeNull();
    expect(amountToInput(85000)).toBe('85,000');
    expect(amountToInput(undefined)).toBe('');
  });
});

describe('field formats', () => {
  it('Ghana Card', () => {
    expect(formatGhanaCardInput('')).toBe('');
    expect(formatGhanaCardInput('g')).toBe('G');
    expect(formatGhanaCardInput('gha')).toBe('GHA');
    expect(formatGhanaCardInput('7')).toBe('GHA-7');
    expect(formatGhanaCardInput('GHA-123456789')).toBe('GHA-123456789');
    expect(formatGhanaCardInput('gha1234567890')).toBe('GHA-123456789-0');
    expect(formatGhanaCardInput('GHA-123456789-0')).toBe('GHA-123456789-0');
    expect(formatGhanaCardInput('GHA-123456789-01')).toBe('GHA-123456789-0');
  });
  it('GhanaPost GPS', () => {
    expect(formatDigitalAddressInput('ga')).toBe('GA');
    expect(formatDigitalAddressInput('ga543')).toBe('GA-543');
    expect(formatDigitalAddressInput('ga5430125')).toBe('GA-543-0125');
    expect(formatDigitalAddressInput('GA-543-0125')).toBe('GA-543-0125');
    expect(formatDigitalAddressInput('ak48641234')).toBe('AK-4864-1234');
  });
});

describe('cards', () => {
  it('detects brands', () => {
    expect(cardBrand('4242')).toBe('visa');
    expect(cardBrand('5399')).toBe('mastercard');
    expect(cardBrand('2221 00')).toBe('mastercard');
    expect(cardBrand('5061')).toBe('verve');
    expect(cardBrand('3782')).toBe('amex');
    expect(cardBrand('9')).toBeNull();
  });
  it('spaces numbers and checks Luhn', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
    expect(luhnValid('4242 4242 4242 4242')).toBe(true);
    expect(luhnValid('4000 0000 0000 0002')).toBe(true);
    expect(luhnValid('4242 4242 4242 4241')).toBe(false);
  });
  it('expiry', () => {
    expect(formatExpiryInput('0')).toBe('0');
    expect(formatExpiryInput('4')).toBe('04/');
    expect(formatExpiryInput('0429')).toBe('04/29');
    expect(formatExpiryInput('04', '04/')).toBe('0');
    const today = new Date(Date.UTC(2026, 10, 6));
    expect(expiryValid('11/26', today)).toBe(true);
    expect(expiryValid('10/26', today)).toBe(false);
    expect(expiryValid('13/30', today)).toBe(false);
  });
});

describe('dates and people', () => {
  it('formats dates', () => {
    expect(formatDate('2026-11-06')).toBe('6 Nov 2026');
    expect(formatDate('2026-01-31T10:00:00Z')).toBe('31 Jan 2026');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(-3)).toBe('0:00');
  });
  it('counts days to expiry', () => {
    const today = new Date(2026, 10, 6);
    expect(daysUntil('2026-11-29', today)).toBe(23);
    expect(renewalText('2026-11-29', today)).toBe('Renews in 23 days');
    expect(renewalText('2026-11-07', today)).toBe('Renews tomorrow');
    expect(renewalText('2026-11-01', today)).toBe('Expired on 1 Nov 2026');
  });
  it('first name and initials skip titles', () => {
    expect(firstName('Dr. Ama Serwaa Mensah')).toBe('Ama');
    expect(firstName('Nana Kwame Boateng')).toBe('Kwame');
    expect(firstName(undefined)).toBe('');
    expect(initials('Ama Serwaa Mensah')).toBe('AM');
    expect(initials('Kofi')).toBe('K');
  });
});

describe('sentence case', () => {
  it('only rewrites all-caps text', () => {
    expect(sentence('COMPREHENSIVE')).toBe('Comprehensive');
    expect(sentence('1. INDEX MARK AND REGISTRATION OF VEHICLE')).toBe(
      '1. Index mark and registration of vehicle',
    );
    expect(sentence('T.P.P.D LIMIT')).toBe('T.P.P.D limit');
    expect(sentence('Third party only')).toBe('Third party only');
  });
});
