#!/usr/bin/env node
// End-to-end check of staff authentication against the LOCAL stack (MS-02, F16):
// sign-in via auth-sign-in, forced password change, claims, invites, lockout, enumeration safety.
// Needs: `pnpm db:start`, `supabase functions serve`, and `node scripts/seed-admin.mjs local`, with
// the same SEED_ADMIN_PASSWORD (from .env or the process environment) for both.
//   node tests/integration/auth-flow.mjs
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { URLSearchParams } from 'node:url';
import { readEnv } from '../../scripts/lib/env.mjs';

const env = readEnv();
const status = Object.fromEntries(
  spawnSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', shell: true })
    .stdout.split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const API = status.API_URL;
const ANON = status.PUBLISHABLE_KEY || status.ANON_KEY;
const MAILPIT = (status.INBUCKET_URL || status.MAILPIT_URL || 'http://127.0.0.1:54324').replace(/\/$/, '');
const ADMIN = env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? env.SEED_ADMIN_PASSWORD;
const ORIGIN = 'http://127.0.0.1:5173';

const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
const fn = (name, body, token) =>
  fetch(`${API}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON,
      origin: ORIGIN,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
const rpc = (name, args, token) =>
  fetch(`${API}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  });
const psql = (sql) =>
  spawnSync('docker', ['exec', 'supabase_db_serene-pulse', 'psql', '-U', 'postgres', '-tAc', sql], {
    encoding: 'utf8',
  }).stdout.trim();

let passed = 0;
async function step(name, run) {
  try {
    await run();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

// Wait for the function server.
for (let i = 0; i < 60; i++) {
  const r = await fetch(`${API}/functions/v1/auth-sign-in`, {
    method: 'OPTIONS',
    headers: { origin: ORIGIN },
  }).catch(() => null);
  if (r && r.status < 500) break;
  await new Promise((res) => setTimeout(res, 2000));
}

let token;
await step('sign-in with email and password returns a session', async () => {
  const r = await fn('auth-sign-in', { email: ADMIN, password: PASSWORD, deviceId: 'test-device-1' });
  assert.equal(r.status, 200, await r.clone().text());
  // The local gateway rewrites CORS to '*'; the hosted gateway passes the function's own header.
  assert.ok([ORIGIN, '*'].includes(r.headers.get('access-control-allow-origin') ?? ''));
  token = (await r.json()).access_token;
  assert.ok(token);
});

await step('before the forced password change the token carries no permissions', async () => {
  const c = claims(token);
  assert.equal(c.app_must_change_password, true);
  assert.deepEqual(c.app_permissions, []);
  assert.deepEqual([...c.app_roles].sort(), ['executive', 'system_admin']);
  assert.equal(c.exp - c.iat, 900, '15-minute access tokens');
});

await step('admin RPCs are refused until the password is changed', async () => {
  const r = await rpc('admin_list_users', {}, token);
  assert.equal(r.status, 403);
});

await step('after completing the password change the next token has permissions', async () => {
  const done = await rpc('me_complete_password_change', {}, token);
  assert.equal(done.status, 204, await done.text());
  const r = await fn('auth-sign-in', { email: ADMIN, password: PASSWORD, deviceId: 'test-device-1' });
  token = (await r.json()).access_token;
  const c = claims(token);
  assert.equal(c.app_must_change_password, false);
  assert.ok(c.app_permissions.includes('users.manage'));
  assert.equal(c.app_org_scope, true);
});

const stamp = Date.now();
// Following an access link signs the person in: GoTrue redirects to /set-password with a session.
const follow = async (link) => {
  const r = await fetch(link, { redirect: 'manual' });
  const to = r.headers.get('location') ?? '';
  assert.ok(to.startsWith(`${ORIGIN}/set-password`), `redirects to the portal (${to.split('#')[0]})`);
  return new URLSearchParams(to.split('#')[1] ?? '').get('access_token');
};
const mailCount = () =>
  fetch(`${MAILPIT}/api/v1/messages`)
    .then((r) => r.json())
    .then((j) => j.total ?? 0)
    .catch(() => 0);

let auditorId;
let auditorLink;
await step('inviting a user with a non-sensitive role grants it immediately and returns a link', async () => {
  const before = await mailCount();
  const r = await fn(
    'invite-user',
    { email: `auditor-${stamp}@example.test`, displayName: 'Test Auditor', grants: [{ role: 'auditor' }] },
    token,
  );
  assert.equal(r.status, 201, await r.clone().text());
  const body = await r.json();
  assert.equal(body.pendingApproval, 0);
  assert.match(body.link, /\/auth\/v1\/verify\?.*type=invite/);
  auditorId = body.userId;
  auditorLink = body.link;
  await new Promise((res) => setTimeout(res, 1000));
  assert.equal(await mailCount(), before, 'no email is sent (D-45)');
});

await step('a new invitation link replaces the first, and the new one signs the person in', async () => {
  const r = await fn('invite-user', { action: 'link', userId: auditorId }, token);
  assert.equal(r.status, 200, await r.clone().text());
  const body = await r.json();
  assert.equal(body.kind, 'invite');
  const old = await fetch(auditorLink, { redirect: 'manual' });
  assert.ok(
    !(old.headers.get('location') ?? '').includes('access_token'),
    'the earlier link no longer works',
  );
  const session = await follow(body.link);
  assert.ok(session, 'the link produced a session');
  assert.equal(claims(session).app_must_change_password, true);
});

await step('an active user gets a password-reset link; no link for your own account', async () => {
  psql(`update public.profiles set status = 'active' where user_id = '${auditorId}'`);
  const r = await fn('invite-user', { action: 'link', userId: auditorId }, token);
  assert.equal(r.status, 200, await r.clone().text());
  const body = await r.json();
  assert.equal(body.kind, 'recovery');
  assert.ok(await follow(body.link), 'the reset link produced a session');
  const self = await fn('invite-user', { action: 'link', userId: claims(token).sub }, token);
  assert.equal(self.status, 422);
});

await step('inviting a user with a contact-data role waits for a second approver', async () => {
  const r = await fn(
    'invite-user',
    { email: `cx-${stamp}@example.test`, displayName: 'Test CX', grants: [{ role: 'cx_admin' }] },
    token,
  );
  assert.equal(r.status, 201, await r.clone().text());
  assert.equal((await r.json()).pendingApproval, 1);
});

await step('inviting the same email again is refused clearly', async () => {
  const r = await fn(
    'invite-user',
    { email: `cx-${stamp}@example.test`, displayName: 'Again', grants: [{ role: 'auditor' }] },
    token,
  );
  assert.equal(r.status, 409);
});

await step('inviting without users.manage is refused', async () => {
  const r = await fn(
    'invite-user',
    { email: `x-${stamp}@example.test`, displayName: 'X', grants: [{ role: 'auditor' }] },
    'not-a-token',
  );
  // The gateway rejects an invalid JWT (401) before the function's own check (403).
  assert.ok([401, 403].includes(r.status), String(r.status));
});

await step('wrong passwords and unknown emails get the same message (enumeration-safe)', async () => {
  const a = await (await fn('auth-sign-in', { email: ADMIN, password: 'wrong-password' })).json();
  const b = await (
    await fn('auth-sign-in', { email: `nobody-${stamp}@example.test`, password: 'wrong-password' })
  ).json();
  assert.equal(a.detail, b.detail);
});

await step('five wrong passwords lock the account; the right one is then refused', async () => {
  for (let i = 0; i < 4; i++) await fn('auth-sign-in', { email: ADMIN, password: 'wrong-password' });
  const r = await fn('auth-sign-in', { email: ADMIN, password: PASSWORD });
  assert.equal(r.status, 401, 'locked account refused even with the correct password');
});

await step('a locked account is refused by direct Auth API calls too (A-152)', async () => {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN, password: PASSWORD }),
  });
  assert.notEqual(r.status, 200);
});

// Leave the local account usable.
psql(
  `update public.profiles set locked_until = null, failed_login_count = 0 where user_id = (select id from auth.users where email = '${ADMIN}')`,
);

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}.`);
