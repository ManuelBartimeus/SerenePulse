# Runbook: restore a backup (monthly drill and real incidents)

**When:** on the first working day of each month (drill), or during an incident.
**Needs:** Docker Desktop running, `age` installed, the age private key file (`serene-pulse-backup.agekey`, from your password manager), and `GITHUB_PAT` in `.env` or `gh auth login`.
**Time:** about 5 minutes.

## How backups work (D-41, ADR-0007)

* Every night `.github/workflows/backup.yml` takes a **data-only** dump of our schemas (`public app survey analytics pii audit ops`) plus `auth` (staff accounts), encrypts it to the age public key, and stores it as a GitHub Actions artifact: 35 days for daily copies, 90 days for the copy made on the 1st of the month.
* The **schema is not in the backup**; it comes from `supabase/migrations` in git. A whole-database dump can't be restored, because Supabase-managed objects belong to an admin role.
* **Vault secrets are not in the backup** (they're encrypted with a per-project key). They are reloaded from `.env` with `scripts/sync-secrets.mjs`.
* Before storing, the job checks that the dump contains `public.settings`, `audit.log` and `auth.users` data.

## Monthly drill (local only, never touches staging or production)

```powershell
pnpm db:start                          # local stack with current migrations
node scripts/restore-drill.mjs         # downloads the latest backup, decrypts, restores, verifies
pnpm db:reset                          # wipe the production data from your machine afterwards
```

**Pass:** the script prints `DRILL PASSED`, the audit chain verifies, and the row counts look plausible against production. Copy the output into the next checkpoint under "Backups". Options: `--run <id>` restores a specific backup run, `--file <path>` restores a file you downloaded, and `--key <path>` points at the key file if it isn't in your user folder.

## Real restore after data loss

Use this only after confirming that data has been lost. Restore into a **new** project rather than overwriting the broken one.

1. Create a new Supabase project (West EU, London). Put its values in `.env` (`SUPABASE_*_PRODUCTION`), or let me fill them from the access token.
2. Apply the schema: `pnpm exec supabase db push --db-url "<new session pooler URL>"`.
3. Download and decrypt the backup: `gh run download <run id>`, then `age -d -i <key> -o restore.dump <file>.dump.age`.
4. Empty the seeded rows, then load the data with triggers off:
   ```powershell
   # in psql against the new project: truncate public.settings, public.settings_history restart identity cascade;
   $env:PGOPTIONS = "-c session_replication_role=replica"
   pg_restore --data-only --no-owner --exit-on-error --dbname "<new session pooler URL>" restore.dump
   ```
5. Reload secrets and redeploy: `node scripts/sync-secrets.mjs supabase production`, `node scripts/sync-secrets.mjs github`, `node scripts/sync-secrets.mjs worker production`, then re-run the `deploy` workflow.
6. Verify: `select * from audit.verify_chain();`, `/healthz`, sign in, and dashboard counts as of the backup date.
7. Delete the decrypted `restore.dump`.
