import { describe, expect, it } from 'vitest';
import { displayLink, qrLink, smsLength, smsLink, suggestedSmsWording, surveyLink } from './links';
import { PDFDocument } from 'pdf-lib';
import { MIN_QR_PT, MM, buildPosterPdf, posterLayout, winAnsi, wrapText } from './poster';
import { qrMatrix, qrPath, qrSvg } from './qr';
import { codeError, keywordError, normaliseCode, parseSetting, settingInput } from './validation';

describe('survey links (T-M05-020)', () => {
  it('joins the base with paths and queries without double slashes', () => {
    expect(surveyLink('https://x.test/customerfeedback/')).toBe('https://x.test/customerfeedback');
    expect(qrLink('https://x.test/customerfeedback/', 'K7P2')).toBe('https://x.test/customerfeedback/q/K7P2');
    expect(qrLink('https://x.test/customerfeedback', 'K7P2')).toBe('https://x.test/customerfeedback/q/K7P2');
    expect(smsLink('https://x.test/customerfeedback')).toBe('https://x.test/customerfeedback?src=sms');
    expect(smsLink('https://x.test/customerfeedback//')).toBe('https://x.test/customerfeedback?src=sms');
    expect(surveyLink('http://127.0.0.1:8787', '//q/A')).toBe('http://127.0.0.1:8787/q/A');
    expect(displayLink('https://x.test/q/A')).toBe('x.test/q/A');
  });
});

describe('SMS length', () => {
  it('counts GSM-7 characters and segments', () => {
    expect(smsLength('a'.repeat(160))).toMatchObject({
      encoding: 'GSM-7',
      units: 160,
      segments: 1,
      fitsOne: true,
    });
    expect(smsLength('a'.repeat(161))).toMatchObject({ segments: 2, fitsOne: false });
    expect(smsLength('€').units).toBe(2);
    expect(smsLength('').segments).toBe(0);
  });
  it('switches to UCS-2 for characters outside GSM-7', () => {
    expect(smsLength('Thank you ’')).toMatchObject({ encoding: 'UCS-2', limit: 70 });
    expect(smsLength('😀'.repeat(36)).segments).toBe(2);
  });
  it('keeps the suggested wording within one SMS for a realistic link', () => {
    const text = suggestedSmsWording(smsLink('https://feedback.sereneinsurance.com.gh/customerfeedback'));
    expect(smsLength(text).fitsOne).toBe(true);
  });
});

describe('poster layout (T-M05-031)', () => {
  for (const size of ['A4', 'A5'] as const) {
    for (const modules of [21, 29, 37, 45]) {
      it(`${size} with a ${modules}-module code keeps the QR at least 3 cm and inside the page`, () => {
        const L = posterLayout(size, modules);
        expect(L.qr.symbol).toBeGreaterThanOrEqual(MIN_QR_PT - 1e-6);
        expect(L.qr.x).toBeGreaterThanOrEqual(L.margin - 1e-6);
        expect(L.qr.x + L.qr.w).toBeLessThanOrEqual(L.page.w - L.margin + 1e-6);
        expect(Math.abs(L.qr.x + L.qr.w / 2 - L.page.w / 2)).toBeLessThan(1e-6);
        expect(L.logo.top + L.logo.h).toBeLessThan(L.headline.top);
        expect(L.subheadline.top + L.subheadline.size).toBeLessThan(L.qr.top);
        expect(L.qr.top + L.qr.h).toBeLessThan(L.scanHint.top);
        expect(L.url.top + L.url.size).toBeLessThan(L.privacy.top);
        expect(L.privacy.top + L.privacy.size * 1.4 * 2).toBeLessThanOrEqual(L.code.top);
        expect(L.code.top + L.code.size).toBeLessThanOrEqual(L.page.h - L.margin + 1e-6);
      });
    }
  }
  it('A4 prints a comfortably large code', () => {
    expect(posterLayout('A4', 29).qr.symbol / MM).toBeGreaterThan(80);
  });
  it('wraps text and strips characters WinAnsi cannot encode', () => {
    expect(wrapText('one two three four', 9, (s) => s.length)).toEqual(['one two', 'three', 'four']);
    expect(winAnsi('You’re “in” — 😀')).toBe('You\'re "in" - ');
  });
});

describe('QR code (T-M05-030)', () => {
  it('builds a symbol with finder patterns and a quiet zone', () => {
    const m = qrMatrix('https://x.test/customerfeedback/q/K7P2');
    expect(m.size).toBeGreaterThanOrEqual(21);
    expect(m.isDark(0, 0) && m.isDark(0, m.size - 1) && m.isDark(m.size - 1, 0)).toBe(true);
    expect(qrPath(m).startsWith('M4 4h7')).toBe(true);
    const svg = qrSvg('https://x.test/q/A', 'QR <A>');
    expect(svg).toContain('<title>QR &lt;A&gt;</title>');
    expect(svg).toContain(`viewBox="0 0 ${qrMatrix('https://x.test/q/A').size + 8}`);
  });
});

describe('codes', () => {
  it('normalises and validates new codes', () => {
    expect(normaliseCode(' walk in ')).toBe('WALK_IN');
    expect(codeError('WALK-IN')).toBeNull();
    expect(codeError('WALK-IN', { allowHyphen: false })).not.toBeNull();
    expect(codeError('1ABC')).not.toBeNull();
    expect(codeError('MOTOR', { taken: ['MOTOR'] })).toMatch(/never reused/);
  });
});

describe('settings validators (T-M17-010)', () => {
  it('validates whole numbers in range', () => {
    expect(parseSetting('device_cooldown_hours', '24')).toEqual({ ok: true, value: 24 });
    expect(parseSetting('device_cooldown_hours', '0').ok).toBe(false);
    expect(parseSetting('device_cooldown_hours', '169').ok).toBe(false);
    expect(parseSetting('device_cooldown_hours', '1.5').ok).toBe(false);
    expect(parseSetting('minimum_sample', '1,000')).toEqual({ ok: true, value: 1000 });
    expect(parseSetting('email_daily_budget', '0')).toEqual({ ok: true, value: 0 });
    expect(parseSetting('email_daily_budget', 'abc').ok).toBe(false);
  });
  it('validates text settings', () => {
    expect(parseSetting('company_display_name', '  ').ok).toBe(false);
    expect(parseSetting('support_email', '')).toEqual({ ok: true, value: '' });
    expect(parseSetting('support_email', 'nope').ok).toBe(false);
    expect(parseSetting('support_phone', '+233 30 200 0000')).toEqual({
      ok: true,
      value: '+233 30 200 0000',
    });
    expect(parseSetting('support_phone', 'call us').ok).toBe(false);
    expect(parseSetting('dpc_registration_number', 'PDC/123-45')).toEqual({ ok: true, value: 'PDC/123-45' });
    expect(parseSetting('dpc_registration_number', '#1').ok).toBe(false);
  });
  it('validates booleans and keyword lists', () => {
    expect(parseSetting('include_unverified_default', true)).toEqual({ ok: true, value: true });
    expect(parseSetting('comment_keywords', [' fraud ', 'claim  not paid'])).toEqual({
      ok: true,
      value: ['fraud', 'claim not paid'],
    });
    expect(parseSetting('comment_keywords', ['fraud', 'FRAUD']).ok).toBe(false);
    expect(parseSetting('comment_keywords', ['x']).ok).toBe(false);
    expect(keywordError('Fraud', ['fraud'])).toMatch(/already/);
    expect(keywordError('lawyer', ['fraud'])).toBeNull();
    expect(settingInput('comment_keywords', ['a'])).toEqual(['a']);
    expect(settingInput('include_unverified_default', false)).toBe(false);
    expect(settingInput('minimum_sample', 30)).toBe('30');
  });
});

describe('poster PDF (T-M05-032)', () => {
  // 1×1 transparent PNG stands in for the rasterised logo (the browser renders the real SVG).
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  );
  for (const [size, w, h] of [
    ['A4', 210, 297],
    ['A5', 148, 210],
  ] as const) {
    it(`builds a one-page ${size} PDF`, async () => {
      const bytes = await buildPosterPdf({
        size,
        url: 'https://x.test/customerfeedback/q/K7P2',
        code: 'K7P2',
        logoPng: png,
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      const page = doc.getPage(0);
      expect(page.getWidth() / MM).toBeCloseTo(w, 1);
      expect(page.getHeight() / MM).toBeCloseTo(h, 1);
    });
  }
});
