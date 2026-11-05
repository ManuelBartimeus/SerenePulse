// send-email (M14, A-129): drains queued rows of public.email_log over SMTP.
// Called by pg_cron through pg_net (ops.invoke_send_email) with header x-jobs-secret = Vault
// jobs_shared_secret, compared in constant time with the JOBS_SHARED_SECRET function secret.
// Budget: public.email_claim never hands out more than the remaining daily budget (setting
// email_daily_budget, capped by EMAIL_DAILY_BUDGET when set). Failures are reported back with a
// reason; email_report retries with exponential backoff and marks rows failed after 5 attempts.
// Note: hosted Edge Functions block outbound ports 25 and 587; use SMTP_PORT=465 (implicit TLS).
import nodemailer from 'npm:nodemailer@6.9.16';
import { classifyError, render, smtpConfig, timingSafeEqual, type EmailJob } from './lib.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Notification links are router paths; the portal router is mounted under /admin.
const PORTAL_URL =
  (Deno.env.get('PORTAL_URL') ?? 'http://127.0.0.1:5173').replace(/\/+$/, '') +
  (Deno.env.get('PORTAL_BASE_PATH') ?? '/admin');

function headers(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    'content-type': 'application/json',
    ...(SERVICE_KEY.startsWith('eyJ') ? { authorization: `Bearer ${SERVICE_KEY}` } : {}),
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'method-not-allowed' });
  const expected = Deno.env.get('JOBS_SHARED_SECRET') ?? '';
  if (!expected || !timingSafeEqual(req.headers.get('x-jobs-secret') ?? '', expected)) {
    return reply(401, { error: 'unauthorized' });
  }

  const capRaw = Number(Deno.env.get('EMAIL_DAILY_BUDGET'));
  const cap = Number.isInteger(capRaw) && capRaw >= 0 ? capRaw : null;
  const jobs = await rpc<EmailJob[]>('email_claim', { p_limit: 20, p_budget_cap: cap });
  const summary = { claimed: jobs.length, sent: 0, retry: 0, failed: 0 };
  if (!jobs.length) return reply(200, summary);

  const report = async (
    id: string,
    ok: boolean,
    messageId: string | null,
    error: string | null,
    retryable: boolean,
  ) => {
    const outcome = await rpc<string>('email_report', {
      p_id: id,
      p_ok: ok,
      p_provider_message_id: messageId,
      p_error: error,
      p_retryable: retryable,
    });
    if (outcome === 'sent') summary.sent++;
    else if (outcome === 'retry') summary.retry++;
    else if (outcome === 'failed') summary.failed++;
  };

  const cfg = smtpConfig((k) => Deno.env.get(k));
  if ('missing' in cfg) {
    const reason = `Email delivery is not configured: missing ${cfg.missing.join(', ')}.`;
    for (const job of jobs) await report(job.id, false, null, reason, false);
    console.error(JSON.stringify({ event: 'smtp_not_configured', missing: cfg.missing }));
    return reply(200, summary);
  }

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port !== 465,
    auth: { user: cfg.user, pass: cfg.password },
    pool: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transport.verify();
  } catch (err) {
    // One login failure fails the whole batch the same way, with the reason recorded on every row.
    const { reason, retryable } = classifyError(err);
    for (const job of jobs) await report(job.id, false, null, reason, retryable);
    console.error(JSON.stringify({ event: 'smtp_verify_failed', reason }));
    return reply(200, summary);
  }

  for (const job of jobs) {
    const mail = render(job, PORTAL_URL);
    try {
      const info = await transport.sendMail({
        from: cfg.from,
        to: job.to_name
          ? { name: job.to_name.replace(/[\r\n"]/g, ' '), address: job.to_email }
          : job.to_email,
        ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: { 'X-Serene-Email-Id': job.id },
      });
      await report(job.id, true, String(info.messageId ?? ''), null, false);
    } catch (err) {
      const { reason, retryable } = classifyError(err);
      await report(job.id, false, null, reason, retryable);
    }
  }
  transport.close();
  console.log(JSON.stringify({ event: 'send_email_run', ...summary }));
  return reply(200, summary);
});
