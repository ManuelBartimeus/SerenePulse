# Runbook: restore a backup from R2 (monthly drill and real incidents)

**When:** on the first working day of each month (drill), or during an incident.
**Needs:** Docker Desktop running, `age` installed, the age private key file (from your password manager), and `.env` with the Cloudflare values.
**Time:** about 10 minutes.

## Drill (local only, never touches staging or production)

```powershell
# 1. Start the local stack (empty database with current migrations)
pnpm db:start

# 2. Download the latest daily backup
pnpm exec wrangler r2 object list serene-pulse-backups --prefix daily/   # note the newest name
pnpm exec wrangler r2 object get serene-pulse-backups/daily/serene-pulse-YYYY-MM-DD.dump.age --file backup.dump.age --remote

# 3. Decrypt (the key file path is wherever you keep it; never inside this repo)
age -d -i C:\path\to\serene-backup.agekey -o backup.dump backup.dump.age

# 4. Restore into the local database container
docker cp backup.dump supabase_db_serene-pulse:/tmp/backup.dump
docker exec supabase_db_serene-pulse pg_restore -U postgres -d postgres --clean --if-exists --no-owner /tmp/backup.dump

# 5. Verify
docker exec supabase_db_serene-pulse psql -U postgres -d postgres -c "select * from audit.verify_chain();"
docker exec supabase_db_serene-pulse psql -U postgres -d postgres -c "select (select count(*) from audit.log) audit_rows;"

# 6. Clean up: delete the decrypted dump
Remove-Item backup.dump, backup.dump.age
docker exec supabase_db_serene-pulse rm /tmp/backup.dump
```

**Pass:** `verify_chain` returns `ok = t`, and row counts are plausible against the production dashboard (once MS-06 lands, also compare `survey.responses` counts). Record the date, backup name and result in the next checkpoint under "Backups".

`pg_restore` warnings about extensions or roles that already exist are expected. Errors on application tables are a failed drill: open an incident.

## Real restore into production

Use this only after confirming with Nii that data loss has happened.

1. Create a **new** Supabase project (eu-west-2) rather than overwriting the broken one, and run `supabase db push` against it.
2. Restore as in step 4, using the new project's session-pooler URL: `pg_restore --dbname "<pooler URL>" --clean --if-exists --no-owner backup.dump`.
3. Load Vault keys: `node scripts/sync-secrets.mjs supabase production` (after updating `SUPABASE_*_PRODUCTION` in `.env` to the new project).
4. Update the GitHub production environment (`node scripts/sync-secrets.mjs github`) and the Worker secrets (`node scripts/sync-secrets.mjs worker production`), then redeploy.
5. Verify `/healthz`, sign in, and check that the dashboards' counts match the backup date.
