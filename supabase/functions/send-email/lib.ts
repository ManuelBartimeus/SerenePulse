// Pure helpers for send-email: no Deno or network APIs, so they run under Deno and vitest alike.
// Templates are plain text plus a minimal branded HTML version. Payloads come from public.email_log and
// never contain customer contact data or customer free text (enforced where they are built, in SQL).

export interface EmailJob {
  id: string;
  to_email: string;
  to_name: string | null;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const BRAND = '#1108BF';
const ACCENT = '#FBDE04';

/** Constant-time comparison of two secrets (length leaks only through the early return). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0 && ea.length > 0;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strips CR/LF so a value can never inject extra mail headers. */
export function headerSafe(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

/** Joins the portal origin and a portal path; anything that isn't a same-site path is dropped. */
export function portalLink(portalUrl: string, link: unknown): string | null {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//')) return null;
  return portalUrl.replace(/\/+$/, '') + link;
}

const INTROS: Record<string, string> = {
  security_lockout: 'Security notice',
  security_new_device: 'Security notice',
  flag_digest: 'Flagged feedback summary',
  alert_fired: 'Alert',
  report_ready: 'Report',
  export_ready: 'Export',
};

/** Renders any queued template. Every template uses the same safe fields: subject, summary, link. */
export function render(job: EmailJob, portalUrl: string, companyName = 'Serene Insurance'): RenderedEmail {
  const p = job.payload ?? {};
  const subject = headerSafe(String(p.subject ?? 'Notification from Serene CX')).slice(0, 200);
  const summary = String(p.summary ?? '').slice(0, 2000);
  const url = portalLink(portalUrl, p.link);
  const label = INTROS[job.template] ?? (job.template.startsWith('case_') ? 'Case update' : 'Notification');
  const greeting = job.to_name ? `Hello ${job.to_name},` : 'Hello,';
  const security = job.template.startsWith('security_');
  const footer = security
    ? 'You receive security emails for your account. They cannot be turned off.'
    : 'You can change which emails you receive under Notifications → Preferences in the portal.';

  const text = [
    greeting,
    '',
    subject,
    summary ? `\n${summary}` : '',
    url ? `\nOpen in the portal: ${url}` : '',
    '',
    '—',
    `${companyName} · Customer Experience portal`,
    footer,
  ]
    .filter((l) => l !== '')
    .join('\n');

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#F7F7F7;font-family:Arial,Helvetica,sans-serif;color:#111111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden">
<tr><td style="background:${BRAND};padding:16px 24px;color:#FFFFFF;font-size:16px;font-weight:bold">${escapeHtml(companyName)} · CX</td></tr>
<tr><td style="height:4px;background:${ACCENT}"></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5C5C5C">${escapeHtml(label)}</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px">${escapeHtml(subject)}</h1>
<p style="margin:0 0 8px;font-size:16px;line-height:24px">${escapeHtml(greeting)}</p>
${summary ? `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${escapeHtml(summary)}</p>` : ''}
${url ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:${BRAND};color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;display:inline-block">Open in the portal</a></p>` : ''}
<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#5C5C5C">${escapeHtml(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}

/** Classifies an SMTP/transport error into a reason people can act on, and whether retrying may help. */
export function classifyError(err: unknown): { reason: string; retryable: boolean } {
  const e = (err ?? {}) as { message?: string; code?: string; responseCode?: number; response?: string };
  const raw = headerSafe(String(e.response ?? e.message ?? err ?? 'Unknown error')).slice(0, 300);
  const code = e.responseCode;
  if (e.code === 'EAUTH' || code === 535 || code === 534 || /\b53[45]\b/.test(raw)) {
    return {
      reason: `The SMTP server refused the login (${raw}). Check SMTP_USER/SMTP_PASSWORD; Gmail needs an app password.`,
      retryable: true,
    };
  }
  if (code !== undefined && code >= 500 && code < 600) {
    return { reason: `The SMTP server rejected the message permanently (${raw}).`, retryable: false };
  }
  if (e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT' || e.code === 'ESOCKET' || e.code === 'EDNS') {
    return { reason: `Could not reach the SMTP server (${raw}).`, retryable: true };
  }
  return { reason: `Sending failed (${raw}).`, retryable: true };
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  replyTo: string | null;
}

/** Reads SMTP settings from an env getter; returns the missing variable names if incomplete. */
export function smtpConfig(get: (k: string) => string | undefined): SmtpConfig | { missing: string[] } {
  const need = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'];
  const missing = need.filter((k) => !get(k));
  const port = Number(get('SMTP_PORT'));
  if (!missing.length && !(Number.isInteger(port) && port > 0 && port < 65536))
    missing.push('SMTP_PORT (not a port)');
  if (missing.length) return { missing };
  return {
    host: get('SMTP_HOST') as string,
    port,
    user: get('SMTP_USER') as string,
    password: get('SMTP_PASSWORD') as string,
    from: get('EMAIL_FROM') as string,
    replyTo: get('EMAIL_REPLY_TO') || null,
  };
}
