#!/usr/bin/env node
// Sample data for a realistic, in-use portal (D-46). Clears ALL feedback activity first.
//   node scripts/seed-demo.mjs local|staging|production [--clear]
//     (production also needs --yes-sample-data-on-production)
//   --clear  removes every response, case, alert and notification and deactivates the sample
//            staff, leaving configuration and real users — run this before real customers start.
// Sample staff use @demo.sereneinsurance.test addresses (cannot receive mail) and random
// passwords that are never printed or stored: they exist to own cases, not to sign in.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { forEnv, readEnv, root } from './lib/env.mjs';

const target = process.argv[2];
const clearOnly = process.argv.includes('--clear');
if (!['local', 'staging', 'production'].includes(target)) {
  console.error('Usage: node scripts/seed-demo.mjs local|staging|production [--clear]');
  process.exit(2);
}
if (target === 'production' && !process.argv.includes('--yes-sample-data-on-production')) {
  console.error(
    'Refusing: production holds real customer feedback once live (Rule 14). Sample data on production\n' +
      'was approved for the pre-launch review (D-46); add --yes-sample-data-on-production to confirm.',
  );
  process.exit(1);
}

const STAFF = [
  'ama.owusu',
  'kwame.asante',
  'esi.quaye',
  'efua.mensah',
  'yaw.boateng',
  'abena.darko',
  'kofi.appiah',
  'adwoa.badu',
  'kwabena.osei',
  'akosua.frimpong',
  'selorm.agbeko',
  'mohammed.issah',
].map((n) => `${n}@demo.sereneinsurance.test`);

const env = readEnv();
const docker = process.env.DOCKER ?? 'docker';
const container = 'supabase_db_serene-pulse';

function localStatus() {
  const r = spawnSync('npx', ['supabase', 'status', '-o', 'env'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });
  return Object.fromEntries(
    r.stdout
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

let url;
let key;
if (target === 'local') {
  const s = localStatus();
  url = s.API_URL;
  key = s.SECRET_KEY || s.SERVICE_ROLE_KEY;
} else {
  url = forEnv(env, 'SUPABASE_URL', target);
  key = forEnv(env, 'SUPABASE_SERVICE_ROLE_KEY', target);
}
const headers = {
  apikey: key,
  'content-type': 'application/json',
  ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}),
};

async function ensureStaff() {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers });
  if (!res.ok) throw new Error(`listing users: HTTP ${res.status}`);
  const existing = new Set(((await res.json()).users ?? []).map((u) => u.email?.toLowerCase()));
  let created = 0;
  for (const email of STAFF) {
    if (existing.has(email)) continue;
    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password: randomBytes(24).toString('base64url'), email_confirm: true }),
    });
    if (!r.ok) throw new Error(`creating ${email}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    created++;
  }
  console.log(`  ✓ sample staff: ${STAFF.length} accounts (${created} new)`);
}

function runSql(file) {
  const sql = path.join(root, 'scripts/demo', file);
  // The SQL runs inside the local Supabase container, which has psql; hosted projects are reached
  // with their connection string, passed through the environment so it never appears in argv.
  const args =
    target === 'local'
      ? ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-tA']
      : ['exec', '-i', '-e', 'PGURL', container, 'sh', '-c', 'psql "$PGURL" -v ON_ERROR_STOP=1 -q -tA'];
  const r = spawnSync(docker, args, {
    input: readFileSync(sql, 'utf8'),
    encoding: 'utf8',
    env: {
      ...process.env,
      PGURL: target === 'local' ? '' : forEnv(env, 'SUPABASE_DB_URL', target),
      MSYS_NO_PATHCONV: '1',
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`${file} failed:\n${(r.stderr || '').slice(0, 2000)}`);
  return r.stdout.trim();
}

try {
  console.log(`${clearOnly ? 'Clearing' : 'Seeding'} sample data (${target})`);
  if (clearOnly) {
    console.log(runSql('demo-clear.sql') || '  ✓ cleared');
  } else {
    await ensureStaff();
    const out = runSql('demo-data.sql');
    for (const line of out.split(/\r?\n/).filter((l) => l.includes('|')))
      console.log(`  ✓ ${line.replace('|', ': ')}`);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
