#!/usr/bin/env node
// Reports which .env values are still missing, grouped by the milestone that needs them.
//   node scripts/env-check.mjs              check .env
//   node scripts/env-check.mjs --generate   also fill empty GEN keys with random values
// Values are never printed: only variable names and problems.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { envPath, parseEnv, root } from './lib/env.mjs';

const examplePath = path.join(root, '.env.example');

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log('Created .env from .env.example');
}

const GENERATED = ['SURVEY_HMAC_KEY', 'PII_KEK', 'PII_HMAC_KEY', 'JOBS_SHARED_SECRET'].flatMap((k) => [
  `${k}_STAGING`,
  `${k}_PRODUCTION`,
]);

const perEnv = (keys) => keys.flatMap((k) => [`${k}_STAGING`, `${k}_PRODUCTION`]);
const REQUIRED_BY = {
  'MS-01 Platform foundation': [
    'WORKERS_SUBDOMAIN',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
    'CF_WEB_ANALYTICS_TOKEN',
    'R2_BACKUP_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'BACKUP_AGE_PUBLIC_KEY',
    'SUPABASE_ACCESS_TOKEN',
    ...perEnv([
      'SUPABASE_PROJECT_REF',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_DB_PASSWORD',
      'SUPABASE_DB_URL',
    ]),
    ...GENERATED,
    'SENTRY_DSN_SURVEY',
    'SENTRY_DSN_PORTAL',
    'SENTRY_DSN_EDGE',
    'SENTRY_ORG',
    'SENTRY_AUTH_TOKEN',
    'BACKUP_HEARTBEAT_URL',
    'GITHUB_REPOSITORY',
  ],
  'MS-02 Identity & access': [
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'EMAIL_REPLY_TO',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD',
  ],
  'MS-05 Survey access (Turnstile)': perEnv(['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']),
  'MS-09 Go-live (privacy notice)': [
    'SUPPORT_PHONE',
    'SUPPORT_EMAIL',
    'DATA_PROTECTION_CONTACT_EMAIL',
    'DPC_REGISTRATION_NUMBER',
  ],
};

// The committed template must never carry real secrets (it is tracked by git).
const leakedIntoTemplate = readFileSync(examplePath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.match(/^([A-Z0-9_]+)=(.*?)\s+#\s*SECRET/))
  .filter((m) => m && m[2].trim())
  .map((m) => m[1]);

let text = readFileSync(envPath, 'utf8');

if (process.argv.includes('--generate')) {
  let filled = 0;
  for (const key of GENERATED) {
    const re = new RegExp(`^(${key}=)(\\s*)(#.*)?$`, 'm');
    if (re.test(text)) {
      text = text.replace(
        re,
        (_, k, _ws, comment) =>
          `${k}${randomBytes(32).toString('base64url')}${comment ? `   ${comment}` : ''}`,
      );
      filled++;
    }
  }
  writeFileSync(envPath, text);
  console.log(`Generated ${filled} application key(s) into .env (values not shown).`);
}

const env = parseEnv(text);
const isEmpty = (k) => !env[k];
const problems = [];
const check = (cond, msg) => {
  if (!cond) problems.push(msg);
};

for (const k of leakedIntoTemplate)
  problems.push(`${k} has a value in .env.example (committed to git). Move it to .env and blank it there.`);

if (env.SEED_ADMIN_PASSWORD)
  check(env.SEED_ADMIN_PASSWORD.length >= 12, 'SEED_ADMIN_PASSWORD must be at least 12 characters');
if (env.BACKUP_AGE_PUBLIC_KEY)
  check(
    env.BACKUP_AGE_PUBLIC_KEY.startsWith('age1'),
    'BACKUP_AGE_PUBLIC_KEY should start with "age1" (public key only, never AGE-SECRET-KEY)',
  );
check(!/AGE-SECRET-KEY/.test(text), 'An age PRIVATE key is in .env: remove it and store it offline');
for (const e of ['STAGING', 'PRODUCTION']) {
  const anon = env[`SUPABASE_ANON_KEY_${e}`],
    svc = env[`SUPABASE_SERVICE_ROLE_KEY_${e}`];
  if (anon && svc)
    check(anon !== svc, `SUPABASE_ANON_KEY_${e} and SUPABASE_SERVICE_ROLE_KEY_${e} are identical`);
  if (anon)
    check(
      !anon.startsWith('sb_secret_'),
      `SUPABASE_ANON_KEY_${e} looks like a SECRET key: it would leak into the portal bundle`,
    );
  const ref = env[`SUPABASE_PROJECT_REF_${e}`];
  if (ref)
    check(/^[a-z0-9]{20}$/.test(ref), `SUPABASE_PROJECT_REF_${e} should be the 20-character project id`);
}
if (env.SUPABASE_PROJECT_REF_STAGING && env.SUPABASE_PROJECT_REF_PRODUCTION)
  check(
    env.SUPABASE_PROJECT_REF_STAGING !== env.SUPABASE_PROJECT_REF_PRODUCTION,
    'Staging and production must be different Supabase projects',
  );
if (env.WORKERS_SUBDOMAIN)
  check(
    /^[a-z0-9-]+$/.test(env.WORKERS_SUBDOMAIN),
    'WORKERS_SUBDOMAIN is only the account part, e.g. myaccount (not myaccount.workers.dev)',
  );

let allReady = true;
for (const [milestone, keys] of Object.entries(REQUIRED_BY)) {
  const missing = keys.filter(isEmpty);
  allReady &&= missing.length === 0;
  console.log(
    `\n${missing.length ? '✗' : '✓'} ${milestone}${missing.length ? `: ${missing.length} missing` : ''}`,
  );
  for (const k of missing) console.log(`    - ${k}${GENERATED.includes(k) ? '  (run with --generate)' : ''}`);
}
if (problems.length) {
  console.log('\nProblems:');
  for (const p of problems) console.log(`    ! ${p}`);
}
process.exitCode = problems.length ? 1 : 0;
if (allReady && !problems.length) console.log('\nAll values present.');
