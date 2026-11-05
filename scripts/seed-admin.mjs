#!/usr/bin/env node
// Creates the first System Administrator + Executive (D-23, A-120), once per environment.
//   node scripts/seed-admin.mjs local|staging|production
// Reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env. The password is never printed or
// logged, the account must change it at first sign-in, and the command refuses to run if the
// account (or any System Administrator) already exists.
import { spawnSync } from 'node:child_process';
import { forEnv, readEnv, root } from './lib/env.mjs';

const target = process.argv[2];
if (!['local', 'staging', 'production'].includes(target)) {
  console.error('Usage: node scripts/seed-admin.mjs local|staging|production');
  process.exit(2);
}
const env = readEnv();
const email = env.SEED_ADMIN_EMAIL;
const password = env.SEED_ADMIN_PASSWORD;
if (!email || !password || password.length < 8) {
  console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ characters, D-43) must be set in .env');
  process.exit(1);
}

let url;
let key;
if (target === 'local') {
  const res = spawnSync('npx', ['supabase', 'status', '-o', 'env'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });
  const s = Object.fromEntries(
    res.stdout
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  url = s.API_URL;
  key = s.SECRET_KEY || s.SERVICE_ROLE_KEY;
} else {
  url = forEnv(env, 'SUPABASE_URL', target);
  key = forEnv(env, 'SUPABASE_SERVICE_ROLE_KEY', target);
}
if (!url || !key) {
  console.error(`No Supabase URL/key for ${target}`);
  process.exit(1);
}

// New-format secret keys go in `apikey` only; legacy JWT keys also as the bearer token.
const headers = {
  apikey: key,
  'content-type': 'application/json',
  ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}),
};
const call = async (path, init = {}) => {
  const res = await fetch(`${url}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  return text ? JSON.parse(text) : null;
};

try {
  const { users } = await call('/auth/v1/admin/users?per_page=1000');
  if (users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
    console.error(`${email} already exists in ${target}; nothing to do.`);
    process.exit(1);
  }
  const user = await call('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: 'Nii' } }),
  });
  await call('/rest/v1/rpc/seed_bootstrap_admin', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: user.id, p_display_name: 'Nii' }),
  });
  console.log(
    `✓ ${target}: ${email} is System Administrator + Executive (must change password at first sign-in).`,
  );
  console.log('  Remove SEED_ADMIN_PASSWORD from .env once every environment is seeded.');
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
