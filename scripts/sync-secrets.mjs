#!/usr/bin/env node
// Pushes values from .env to where they run. Values travel over stdin or a 0600 temp file,
// never as command-line arguments, and are never printed.
//
//   node scripts/sync-secrets.mjs github            GitHub environments, secrets, variables
//   node scripts/sync-secrets.mjs worker <env>      survey Worker secrets (after first deploy)
//   node scripts/sync-secrets.mjs supabase <env>    Edge Function secrets + Vault keys
//   node scripts/sync-secrets.mjs local             .dev.vars + portal .env.local from `supabase status`
//   add --dry-run to list what would be set
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { forEnv, readEnv, root } from './lib/env.mjs';

const [target, envName] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dryRun = process.argv.includes('--dry-run');
const env = readEnv();
const ENVS = ['staging', 'production'];

function run(cmd, args, { input, extraEnv = {}, cwd = root } = {}) {
  if (dryRun) return { status: 0, stdout: '' };
  const res = spawnSync(cmd, args, {
    cwd,
    input,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  if (res.status !== 0) {
    // stderr from these CLIs never contains the piped value; show it for diagnosis.
    throw new Error(
      `${cmd} ${args.filter((a) => !a.includes('=')).join(' ')} failed: ${res.stderr || res.stdout}`,
    );
  }
  return res;
}

function requireKeys(names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')}`);
}

function needEnv() {
  if (!ENVS.includes(envName)) throw new Error(`Specify an environment: ${ENVS.join(' | ')}`);
  return envName;
}

function github() {
  requireKeys(['GITHUB_REPOSITORY', 'GITHUB_PAT']);
  const repo = env.GITHUB_REPOSITORY;
  const gh = { extraEnv: { GH_TOKEN: env.GITHUB_PAT } };

  const repoVars = { SERENE_ROOT_DOMAIN: env.SERENE_ROOT_DOMAIN, R2_BACKUP_BUCKET: env.R2_BACKUP_BUCKET };
  for (const [k, v] of Object.entries(repoVars)) {
    if (!v) {
      console.log(`  - skip variable ${k} (empty)`);
      continue;
    }
    run('gh', ['variable', 'set', k, '--repo', repo], { ...gh, input: v });
    console.log(`  ✓ variable ${k}`);
  }

  for (const e of ENVS) {
    run('gh', ['api', '--method', 'PUT', `repos/${repo}/environments/${e}`, '--silent'], gh);
    const secrets = {
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN,
      SUPABASE_PROJECT_REF: forEnv(env, 'SUPABASE_PROJECT_REF', e),
      SUPABASE_DB_PASSWORD: forEnv(env, 'SUPABASE_DB_PASSWORD', e),
      SUPABASE_DB_URL: forEnv(env, 'SUPABASE_DB_URL', e),
      ...(e === 'production'
        ? {
            R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
            R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
            BACKUP_HEARTBEAT_URL: env.BACKUP_HEARTBEAT_URL,
          }
        : {}),
      SENTRY_AUTH_TOKEN: env.SENTRY_AUTH_TOKEN,
    };
    const vars = {
      SUPABASE_URL: forEnv(env, 'SUPABASE_URL', e),
      SUPABASE_ANON_KEY: forEnv(env, 'SUPABASE_ANON_KEY', e),
      SENTRY_DSN_PORTAL: env.SENTRY_DSN_PORTAL,
      ...(e === 'production'
        ? { BACKUP_AGE_PUBLIC_KEY: env.BACKUP_AGE_PUBLIC_KEY, R2_BACKUP_BUCKET: env.R2_BACKUP_BUCKET }
        : {}),
    };
    for (const [k, v] of Object.entries(secrets)) {
      if (!v) {
        console.log(`  - skip ${e} secret ${k} (empty)`);
        continue;
      }
      run('gh', ['secret', 'set', k, '--env', e, '--repo', repo], { ...gh, input: v });
      console.log(`  ✓ ${e} secret ${k}`);
    }
    for (const [k, v] of Object.entries(vars)) {
      if (!v || v.includes('https://.supabase.co')) {
        console.log(`  - skip ${e} variable ${k} (empty)`);
        continue;
      }
      run('gh', ['variable', 'set', k, '--env', e, '--repo', repo], { ...gh, input: v });
      console.log(`  ✓ ${e} variable ${k}`);
    }
  }
}

function worker() {
  const e = needEnv();
  const cf = {
    extraEnv: {
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    },
  };
  const secrets = {
    SUPABASE_SERVICE_ROLE_KEY: forEnv(env, 'SUPABASE_SERVICE_ROLE_KEY', e),
    SURVEY_HMAC_KEY: forEnv(env, 'SURVEY_HMAC_KEY', e),
    TURNSTILE_SECRET_KEY: forEnv(env, 'TURNSTILE_SECRET_KEY', e),
    SENTRY_DSN: env.SENTRY_DSN_SURVEY,
  };
  for (const [k, v] of Object.entries(secrets)) {
    if (!v) {
      console.log(`  - skip ${k} (empty)`);
      continue;
    }
    run('pnpm', ['exec', 'wrangler', 'secret', 'put', k, '--env', e], {
      ...cf,
      input: v,
      cwd: path.join(root, 'apps/survey-worker'),
    });
    console.log(`  ✓ worker(${e}) ${k}`);
  }
}

function supabase() {
  const e = needEnv();
  const ref = forEnv(env, 'SUPABASE_PROJECT_REF', e);
  if (!ref) throw new Error(`SUPABASE_PROJECT_REF_${e.toUpperCase()} is empty`);
  const sb = { extraEnv: { SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN } };

  const fnSecrets = {
    APP_ENV: e,
    RESEND_API_KEY: env.RESEND_API_KEY,
    EMAIL_FROM: env.EMAIL_FROM,
    EMAIL_REPLY_TO: env.EMAIL_REPLY_TO,
    EMAIL_DAILY_BUDGET: env.EMAIL_DAILY_BUDGET,
    JOBS_SHARED_SECRET: forEnv(env, 'JOBS_SHARED_SECRET', e),
    SENTRY_DSN: env.SENTRY_DSN_EDGE,
    PORTAL_URL: `https://${forEnv(env, 'PORTAL_HOST', e)}`,
  };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'serene-secrets-'));
  const file = path.join(dir, 'functions.env');
  try {
    const body = Object.entries(fnSecrets)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('\n');
    writeFileSync(file, body + '\n', { mode: 0o600 });
    run('npx', ['supabase', 'secrets', 'set', '--project-ref', ref, '--env-file', file], sb);
    console.log(
      `  ✓ edge function secrets (${Object.keys(fnSecrets)
        .filter((k) => fnSecrets[k])
        .join(', ')})`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Vault keys go through a service-role-only RPC that accepts an allow-list of names.
  const url = forEnv(env, 'SUPABASE_URL', e);
  const key = forEnv(env, 'SUPABASE_SERVICE_ROLE_KEY', e);
  const vault = {
    pii_kek: forEnv(env, 'PII_KEK', e),
    pii_hmac_key: forEnv(env, 'PII_HMAC_KEY', e),
    jobs_shared_secret: forEnv(env, 'JOBS_SHARED_SECRET', e),
  };
  return Promise.all(
    Object.entries(vault).map(async ([name, secret]) => {
      if (dryRun) return console.log(`  ✓ vault ${name} (dry run)`);
      const res = await fetch(`${url}/rest/v1/rpc/vault_upsert_secret`, {
        method: 'POST',
        headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ p_name: name, p_secret: secret }),
      });
      if (!res.ok) throw new Error(`vault ${name}: HTTP ${res.status} (have migrations been pushed?)`);
      console.log(`  ✓ vault ${name}`);
    }),
  );
}

function local() {
  const res = spawnSync('npx', ['supabase', 'status', '-o', 'env'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0)
    throw new Error('`supabase status` failed: is Docker running and `pnpm db:start` done?');
  const s = Object.fromEntries(
    res.stdout
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  const devVars = {
    APP_ENV: 'local',
    SUPABASE_URL: s.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: s.SECRET_KEY || s.SERVICE_ROLE_KEY,
    SURVEY_HMAC_KEY: env.SURVEY_HMAC_KEY_STAGING,
    TURNSTILE_SITE_KEY: '1x00000000000000000000AA', // Cloudflare's documented always-pass test key
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  };
  const portal = {
    VITE_APP_ENV: 'local',
    VITE_SUPABASE_URL: s.API_URL,
    VITE_SUPABASE_ANON_KEY: s.PUBLISHABLE_KEY || s.ANON_KEY,
  };
  const fmt = (o) =>
    Object.entries(o)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';
  if (!dryRun) {
    writeFileSync(path.join(root, 'apps/survey-worker/.dev.vars'), fmt(devVars), { mode: 0o600 });
    writeFileSync(path.join(root, 'apps/portal/.env.local'), fmt(portal), { mode: 0o600 });
  }
  console.log('  ✓ apps/survey-worker/.dev.vars and apps/portal/.env.local (git-ignored)');
}

const targets = { github, worker, supabase, local };
if (!targets[target]) {
  console.error(
    `Usage: node scripts/sync-secrets.mjs <${Object.keys(targets).join('|')}> [staging|production] [--dry-run]`,
  );
  process.exit(2);
}
try {
  console.log(`Syncing ${target}${envName ? ` (${envName})` : ''}${dryRun ? ' [dry run]' : ''}`);
  await targets[target]();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
