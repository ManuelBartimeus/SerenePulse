#!/usr/bin/env node
// Applies the hosted Supabase Auth settings for an environment via the Management API, so the
// cloud projects match supabase/config.toml. Values are never printed.
//   node scripts/configure-auth.mjs staging|production [--dry-run]
import { forEnv, readEnv } from './lib/env.mjs';

const target = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!['staging', 'production'].includes(target)) {
  console.error('Usage: node scripts/configure-auth.mjs staging|production [--dry-run]');
  process.exit(2);
}
const env = readEnv();
const ref = forEnv(env, 'SUPABASE_PROJECT_REF', target);
const portal = `https://${forEnv(env, 'PORTAL_HOST', target)}`;
const from = env.EMAIL_FROM.match(/^(.*?)\s*<([^>]+)>$/);
const senderName = from ? from[1].trim() : 'Serene Insurance';
const senderEmail = from ? from[2].trim() : env.EMAIL_FROM.trim();

const button = (href, label) =>
  `<a href="${href}" style="display:inline-block;background:#1108BF;color:#ffffff;text-decoration:none;` +
  `font-weight:500;padding:14px 24px;border-radius:9999px">${label}</a>`;
const layout = (title, body) => `<!doctype html><html><body style="margin:0;background:#F7F7F7;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111111">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border-radius:24px;padding:32px;border-top:4px solid #FBDE04">
<p style="margin:0 0 24px;font-size:20px;font-weight:600;color:#1108BF">Serene Insurance</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:32px;font-weight:500">${title}</h1>
${body}
</div>
<p style="font-size:12px;line-height:16px;color:#666666;text-align:center;margin-top:16px">Serene Insurance LTD · Confidential · Staff portal</p>
</div></body></html>`;

const settings = {
  site_url: portal,
  uri_allow_list: `${portal}/**`,
  disable_signup: true,
  external_email_enabled: true,
  mailer_autoconfirm: false,
  password_min_length: 8, // D-43
  password_required_characters: '',
  jwt_exp: 900,
  refresh_token_rotation_enabled: true,
  // One expiry covers every email link; invites need 24 h (A-153).
  mailer_otp_exp: 86400,
  mfa_totp_enroll_enabled: false, // D-23, D-44
  mfa_totp_verify_enabled: false,
  mfa_phone_enroll_enabled: false,
  mfa_phone_verify_enabled: false,
  hook_custom_access_token_enabled: true,
  hook_custom_access_token_uri: 'pg-functions://postgres/public/custom_access_token_hook',
  smtp_host: env.SMTP_HOST,
  smtp_port: String(env.SMTP_PORT),
  smtp_user: env.SMTP_USER,
  smtp_pass: env.SMTP_PASSWORD,
  smtp_admin_email: senderEmail,
  smtp_sender_name: senderName,
  smtp_max_frequency: 30,
  rate_limit_email_sent: 60,
  mailer_subjects_invite: 'You’ve been invited to Serene CX',
  mailer_templates_invite_content: layout(
    'You’ve been invited to Serene CX',
    `<p style="font-size:16px;line-height:24px;color:#545454">Serene’s customer-experience portal shows customer feedback and the cases that follow from it. Set your password to get started.</p>
<p style="margin:24px 0">${button('{{ .ConfirmationURL }}', 'Set your password')}</p>
<p style="font-size:14px;line-height:20px;color:#666666">This link works once and expires in 24 hours. If you weren’t expecting it, you can ignore this email.</p>`,
  ),
  mailer_subjects_recovery: 'Reset your Serene CX password',
  mailer_templates_recovery_content: layout(
    'Reset your password',
    `<p style="font-size:16px;line-height:24px;color:#545454">Someone asked to reset the password for {{ .Email }}.</p>
<p style="margin:24px 0">${button('{{ .ConfirmationURL }}', 'Choose a new password')}</p>
<p style="font-size:14px;line-height:20px;color:#666666">The link works once. If you didn’t ask for this, ignore this email; your password stays the same.</p>`,
  ),
};

const missing = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'].filter((k) => !env[k]);
if (!ref || missing.length) {
  console.error(`Missing: ${[!ref && `SUPABASE_PROJECT_REF_${target.toUpperCase()}`, ...missing].filter(Boolean).join(', ')}`);
  process.exit(1);
}
if (dryRun) {
  console.log(`[dry run] would set ${Object.keys(settings).length} Auth settings on ${target}: ${Object.keys(settings).join(', ')}`);
  process.exit(0);
}
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify(settings),
});
if (!res.ok) {
  console.error(`✗ ${target}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const applied = await res.json();
const check = ['site_url', 'disable_signup', 'password_min_length', 'jwt_exp', 'hook_custom_access_token_enabled', 'mfa_totp_enroll_enabled', 'smtp_host'];
const mismatched = check.filter((k) => String(applied[k]) !== String(settings[k]));
console.log(`✓ ${target}: ${Object.keys(settings).length} Auth settings applied${mismatched.length ? `; NOT reflected: ${mismatched.join(', ')}` : ''}.`);
