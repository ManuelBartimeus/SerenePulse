// Unit tests for the send-email helpers. Run with: pnpm exec vitest run supabase/functions/send-email
import { describe, expect, it } from 'vitest';
import {
  classifyError,
  escapeHtml,
  headerSafe,
  portalLink,
  render,
  smtpConfig,
  timingSafeEqual,
} from './lib';

describe('timingSafeEqual', () => {
  it('matches equal secrets only', () => {
    expect(timingSafeEqual('a'.repeat(40), 'a'.repeat(40))).toBe(true);
    expect(timingSafeEqual('a'.repeat(40), 'a'.repeat(39) + 'b')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(false);
  });
});

describe('render', () => {
  const job = {
    id: '1',
    to_email: 'a@example.test',
    to_name: 'Ama <b>',
    template: 'case_assigned',
    attempts: 1,
    payload: {
      subject: 'Case CASE-2026-00001\r\nBcc: x@evil.test',
      summary: '<script>x</script>',
      link: '/cases/1',
    },
  };
  it('escapes HTML and keeps the subject on one line', () => {
    const m = render(job, 'https://portal.example/admin/');
    expect(m.subject).toBe('Case CASE-2026-00001 Bcc: x@evil.test');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('Ama &lt;b&gt;');
    expect(m.text).toContain('Open in the portal: https://portal.example/admin/cases/1');
  });
  it('drops off-site links', () => {
    expect(portalLink('https://p', 'https://evil.test')).toBeNull();
    expect(portalLink('https://p', '//evil.test')).toBeNull();
    expect(
      render({ ...job, payload: { subject: 's', link: 'javascript:x' } }, 'https://p').html,
    ).not.toContain('href');
  });
  it('says security emails cannot be turned off', () => {
    expect(render({ ...job, template: 'security_lockout' }, 'https://p').text).toContain(
      'cannot be turned off',
    );
  });
});

describe('helpers', () => {
  it('escapes and strips headers', () => {
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
    expect(headerSafe('a\r\nb')).toBe('a b');
  });
  it('classifies SMTP login failures as retryable with a clear reason', () => {
    const r = classifyError({
      code: 'EAUTH',
      responseCode: 535,
      response: '535-5.7.8 Username and Password not accepted',
    });
    expect(r.retryable).toBe(true);
    expect(r.reason).toMatch(/refused the login/);
    expect(classifyError({ responseCode: 550, response: '550 no such user' }).retryable).toBe(false);
  });
  it('reports missing SMTP settings', () => {
    expect(smtpConfig(() => undefined)).toEqual({
      missing: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'],
    });
    const env: Record<string, string> = {
      SMTP_HOST: 'h',
      SMTP_PORT: '465',
      SMTP_USER: 'u',
      SMTP_PASSWORD: 'p',
      EMAIL_FROM: 'f',
    };
    expect(smtpConfig((k) => env[k])).toMatchObject({ host: 'h', port: 465, replyTo: null });
  });
});
