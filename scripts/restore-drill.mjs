#!/usr/bin/env node
// Monthly restore drill (ADR-0007): restores an encrypted backup into the LOCAL Supabase stack
// and verifies it. Never touches staging or production.
//
//   node scripts/restore-drill.mjs                      latest successful backup run on GitHub
//   node scripts/restore-drill.mjs --run <run id>       a specific backup run
//   node scripts/restore-drill.mjs --file <x.dump.age>  a file you already downloaded
//   --key <path>   age private key (default: %USERPROFILE%/serene-pulse-backup.agekey)
//
// Needs: Docker running with `pnpm db:start` done, `age` and `gh` on PATH (or GITHUB_PAT in .env).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readEnv } from './lib/env.mjs';

const CONTAINER = 'supabase_db_serene-pulse';
const APP_SCHEMAS = ['public', 'app', 'survey', 'analytics', 'pii', 'audit', 'ops'];
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (res.status !== 0) throw new Error(`${cmd} ${args[0]} failed: ${(res.stderr || res.stdout).trim()}`);
  return res.stdout;
}
const psql = (sql) =>
  run('docker', [
    'exec',
    CONTAINER,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-tAc',
    sql,
  ]).trim();

const env = readEnv();
const gh = (args) =>
  run('gh', args, { env: { ...process.env, ...(env.GITHUB_PAT ? { GH_TOKEN: env.GITHUB_PAT } : {}) } });
const keyPath = arg('--key') ?? path.join(os.homedir(), 'serene-pulse-backup.agekey');
const work = mkdtempSync(path.join(os.tmpdir(), 'serene-drill-'));

try {
  run('docker', ['inspect', CONTAINER]);

  let file = arg('--file');
  if (!file) {
    const runId =
      arg('--run') ??
      gh([
        'run',
        'list',
        '--repo',
        env.GITHUB_REPOSITORY,
        '--workflow',
        'backup',
        '--status',
        'success',
        '--limit',
        '1',
        '--json',
        'databaseId',
        '--jq',
        '.[0].databaseId',
      ]).trim();
    if (!runId) throw new Error('No successful backup run found');
    gh(['run', 'download', runId, '--repo', env.GITHUB_REPOSITORY, '--dir', work]);
    const find = (dir) =>
      readdirSync(dir).flatMap((n) => {
        const p = path.join(dir, n);
        return statSync(p).isDirectory() ? find(p) : n.endsWith('.dump.age') ? [p] : [];
      });
    file = find(work).find((p) => path.basename(p).startsWith('serene-pulse-'));
    if (!file) throw new Error(`Run ${runId} has no backup artifact`);
    console.log(`Backup run ${runId}: ${path.basename(file)}`);
  }

  const plain = path.join(work, 'restore.dump');
  run('age', ['-d', '-i', keyPath, '-o', plain, file]);
  console.log(`Decrypted ${statSync(plain).size} bytes`);
  run('docker', ['cp', plain, `${CONTAINER}:/tmp/restore.dump`]);

  // Empty the tables the backup covers (schema stays: it comes from the migrations).
  const tables = psql(
    `select string_agg(format('%I.%I', schemaname, tablename), ', ')
       from pg_tables
      where schemaname = any (array[${[...APP_SCHEMAS, 'auth'].map((s) => `'${s}'`).join(',')}])
        and not (schemaname = 'auth' and tablename = 'schema_migrations')
        and tablename not in (select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid)`,
  );
  psql(`truncate table ${tables} restart identity cascade`);

  // Triggers off for the load (replica role), so settings history and audit rows are copied,
  // not regenerated.
  const restore = spawnSync(
    'docker',
    [
      'exec',
      '-e',
      'PGOPTIONS=-c session_replication_role=replica',
      CONTAINER,
      'pg_restore',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '--data-only',
      '--no-owner',
      '--exit-on-error',
      '/tmp/restore.dump',
    ],
    { encoding: 'utf8' },
  );
  if (restore.status !== 0) throw new Error(`pg_restore failed:\n${restore.stderr.trim()}`);

  const chain = psql("select ok::text || ' (' || checked || ' rows)' from audit.verify_chain()");
  const counts = psql(
    `select string_agg(format('%s=%s', t, n), '  ') from (
       select 'auth.users' t, count(*) n from auth.users
       union all select 'public.settings', count(*) from public.settings
       union all select 'public.settings_history', count(*) from public.settings_history
       union all select 'audit.log', count(*) from audit.log) x`,
  );
  console.log(`Audit chain: ${chain}`);
  console.log(`Row counts: ${counts}`);
  if (!chain.startsWith('true')) throw new Error('Audit chain did not verify after restore');
  console.log('\nDRILL PASSED. Record the date, backup name and these counts in the next checkpoint.');
  console.log('Your local database now holds production data: run `pnpm db:reset` when you are done.');
} catch (err) {
  console.error(`\nDRILL FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  spawnSync('docker', ['exec', CONTAINER, 'rm', '-f', '/tmp/restore.dump']);
  rmSync(work, { recursive: true, force: true });
}
