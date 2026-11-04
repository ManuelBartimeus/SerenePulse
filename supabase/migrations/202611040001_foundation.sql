-- MS-01 foundation: schemas, extensions, settings, audit log (hash chain), ops tables, healthz.
-- Conventions: docs/architecture/data-model.md and SPEC §2.6. Forward-only.

-- ---------------------------------------------------------------------------
-- Schemas. Only public and analytics are exposed through the Data API (config.toml).
-- ---------------------------------------------------------------------------
create schema if not exists app;        -- internal helpers used by policies and functions
create schema if not exists survey;     -- sessions, responses, telemetry (Worker functions only)
create schema if not exists analytics;  -- roll-ups and security_invoker views
create schema if not exists pii;        -- consented contact details (audited functions only)
create schema if not exists audit;      -- append-only, hash-chained log
create schema if not exists ops;        -- outbox, job runs, quota snapshots

revoke all on schema app, survey, pii, audit, ops from public, anon, authenticated;
revoke all on schema analytics from public, anon;
grant usage on schema analytics to authenticated;
grant usage on schema app to authenticated, service_role;

comment on schema survey is 'Customer survey data. Never exposed through the Data API; accessed only via survey.* SECURITY DEFINER functions.';
comment on schema pii is 'Consented contact details, encrypted. Readable only through audited functions (A-19).';
comment on schema audit is 'Append-only, SHA-256 hash-chained audit log (A-77, A-141).';
comment on schema ops is 'Operational state: outbox, job runs, quota snapshots, sign-in attempts.';

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgmq;

-- ---------------------------------------------------------------------------
-- Generic row helpers
-- ---------------------------------------------------------------------------
create or replace function app.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and to_jsonb(new) ? 'version' then
    new := jsonb_populate_record(new, jsonb_build_object('version', (to_jsonb(old) ->> 'version')::int + 1));
  end if;
  return new;
end;
$$;
comment on function app.touch_row() is 'Sets updated_at and increments version (optimistic locking) on mutable tables.';

-- ---------------------------------------------------------------------------
-- Settings (runtime-configurable defaults, A-27). No secrets are ever stored here.
-- ---------------------------------------------------------------------------
create table public.settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value       jsonb not null,
  description text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
comment on table public.settings is 'Runtime settings editable by System Administrators (M17). Never holds secrets.';

create table public.settings_history (
  id          bigint generated always as identity primary key,
  key         text not null,
  old_value   jsonb,
  new_value   jsonb not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid
);
comment on table public.settings_history is 'Every settings change, kept indefinitely.';

create or replace function app.settings_history_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into public.settings_history (key, old_value, new_value, changed_by)
  values (new.key, case when tg_op = 'UPDATE' then old.value end, new.value, auth.uid());
  return new;
end;
$$;

create trigger settings_history
  before insert or update on public.settings
  for each row execute function app.settings_history_trigger();

alter table public.settings enable row level security;
alter table public.settings_history enable row level security;
-- Reads: any signed-in staff user (values are non-sensitive configuration).
-- Writes: added in MS-02 once permissions exist (settings.manage). Until then, deny.
create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_history_read on public.settings_history for select to authenticated using (false);

insert into public.settings (key, value, description) values
  ('device_cooldown_hours', '24', 'Hours a device must wait after submitting before starting another survey (A-123).'),
  ('session_expiry_hours', '24', 'Hours of inactivity after which an unsubmitted survey session expires (D-33).'),
  ('minimum_sample', '30', 'Groups below this n are marked low sample and excluded from rankings (REQ §10.2).'),
  ('email_daily_budget', '90', 'Maximum emails sent per day; stays under the Resend free limit (A-129).'),
  ('comment_keywords', '["fraud","cheat","refund","claim not paid","insult","threat","lawyer","court","NIC"]',
     'Comment keywords that raise a flag (A-111). Matching is case-insensitive.'),
  ('ghana_mobile_prefixes', '["020","023","024","025","026","027","028","050","053","054","055","056","057","059"]',
     'Accepted Ghana mobile prefixes for the contact phone field (A-145).'),
  ('company_display_name', '"Serene Insurance"', 'Name used in customer-facing copy (D-01).'),
  ('company_legal_name', '"Serene Insurance LTD"', 'Legal name for the privacy notice and report footers (D-01).');

-- ---------------------------------------------------------------------------
-- Audit log: append-only, monthly partitions, SHA-256 hash chain (A-77, A-141).
-- ---------------------------------------------------------------------------
create table audit.log (
  id           bigint generated always as identity,
  occurred_at  timestamptz not null default clock_timestamp(),
  actor_type   text not null check (actor_type in ('user', 'system')),
  actor_id     uuid,
  action       text not null,
  entity_type  text,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  ip           inet,
  user_agent   text,
  request_id   text,
  prev_hash    bytea,
  hash         bytea not null,
  primary key (id, occurred_at)
) partition by range (occurred_at);
comment on table audit.log is 'Append-only audit trail; each row hashes the previous row''s hash. Verify with audit.verify_chain().';

create table audit.log_default partition of audit.log default;
create index log_id_idx on audit.log (id);
create index log_entity_idx on audit.log (entity_type, entity_id);
create index log_actor_idx on audit.log (actor_id, occurred_at);

create or replace function audit.ensure_partitions(p_months_ahead int default 2)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m date := date_trunc('month', now() at time zone 'UTC')::date;
  part text;
begin
  for i in 0..p_months_ahead loop
    part := format('log_%s', to_char(m, 'YYYY_MM'));
    if to_regclass('audit.' || part) is null then
      execute format(
        'create table audit.%I partition of audit.log for values from (%L) to (%L)',
        part, m::timestamptz, (m + interval '1 month')::timestamptz);
    end if;
    m := (m + interval '1 month')::date;
  end loop;
end;
$$;
comment on function audit.ensure_partitions(int) is 'Creates monthly audit partitions ahead of time; run monthly by pg_cron.';

select audit.ensure_partitions(2);

-- The exact bytes that are hashed. Timestamps are normalised to UTC so verification is
-- independent of the session time zone.
create or replace function audit.canonical(
  p_occurred_at timestamptz, p_actor_type text, p_actor_id uuid, p_action text,
  p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb, p_request_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'occurred_at', to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'actor_type', p_actor_type, 'actor_id', p_actor_id, 'action', p_action,
    'entity_type', p_entity_type, 'entity_id', p_entity_id,
    'before', p_before, 'after', p_after, 'request_id', p_request_id)::text;
$$;

create or replace function audit.append(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_actor_type text default null,
  p_request_id text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_type text := coalesce(p_actor_type, case when auth.uid() is null then 'system' else 'user' end);
  v_at timestamptz := clock_timestamp();
  v_prev bytea;
  v_id bigint;
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
begin
  -- Serialise appends so the chain has exactly one successor per row (A-141).
  perform pg_advisory_xact_lock(hashtext('audit.log'));
  select l.hash into v_prev from audit.log l order by l.id desc limit 1;
  v_at := clock_timestamp();

  insert into audit.log (occurred_at, actor_type, actor_id, action, entity_type, entity_id,
                         before, after, ip, user_agent, request_id, prev_hash, hash)
  values (
    v_at, v_actor_type, v_actor, p_action, p_entity_type, p_entity_id, p_before, p_after,
    nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), '')::inet,
    v_headers ->> 'user-agent', p_request_id, v_prev,
    extensions.digest(
      coalesce(v_prev, ''::bytea) ||
      convert_to(audit.canonical(v_at, v_actor_type, v_actor, p_action, p_entity_type, p_entity_id,
                                 p_before, p_after, p_request_id), 'UTF8'),
      'sha256'))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function audit.append(text, text, text, jsonb, jsonb, text, text) is
  'The only way to write the audit log. Callers redact before/after; never pass secrets or raw contact details.';

create or replace function audit.verify_chain()
returns table (ok boolean, checked bigint, first_bad_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_prev bytea;
  v_n bigint := 0;
begin
  for r in select * from audit.log order by id loop
    v_n := v_n + 1;
    if r.prev_hash is distinct from v_prev
       or r.hash <> extensions.digest(
            coalesce(v_prev, ''::bytea) ||
            convert_to(audit.canonical(r.occurred_at, r.actor_type, r.actor_id, r.action, r.entity_type,
                                       r.entity_id, r.before, r.after, r.request_id), 'UTF8'),
            'sha256') then
      return query select false, v_n, r.id;
      return;
    end if;
    v_prev := r.hash;
  end loop;
  return query select true, v_n, null::bigint;
end;
$$;
comment on function audit.verify_chain() is 'Recomputes every hash; returns the first broken row, if any.';

create or replace function audit.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit.log is append-only' using errcode = '42501';
end;
$$;

create trigger log_append_only
  before update or delete on audit.log
  for each row execute function audit.reject_change();

revoke all on all tables in schema audit from public, anon, authenticated;
revoke all on function audit.append(text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function audit.verify_chain() from public, anon, authenticated;
revoke all on function audit.ensure_partitions(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ops tables
-- ---------------------------------------------------------------------------
create table ops.job_runs (
  id           bigint generated always as identity primary key,
  job          text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  detail       jsonb
);
create index job_runs_job_idx on ops.job_runs (job, started_at desc);
comment on table ops.job_runs is 'Status of backups, roll-ups and retention jobs, shown on the health page.';

create table ops.quota_snapshots (
  taken_at               timestamptz primary key default now(),
  db_bytes               bigint not null,
  storage_bytes          bigint not null,
  emails_today           int,
  worker_requests_today  int
);
comment on table ops.quota_snapshots is 'Daily free-tier usage, feeding the 80% quota alerts (A-129).';

create table ops.auth_sign_in_attempts (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  email_hmac  bytea not null,
  ip_hmac     bytea,
  outcome     text not null check (outcome in ('success', 'bad_credentials', 'locked', 'suspended'))
);
create index auth_sign_in_attempts_email_idx on ops.auth_sign_in_attempts (email_hmac, at desc);
comment on table ops.auth_sign_in_attempts is 'Sign-in outcomes keyed by HMAC (no raw emails or IPs); 30-day retention (A-139).';

revoke all on all tables in schema ops from public, anon, authenticated;

create or replace function ops.record_quota_snapshot()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into ops.quota_snapshots (db_bytes, storage_bytes)
  select pg_database_size(current_database()),
         coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0);
$$;

-- Transactional outbox (A-34). Producers call pgmq.send('events', ...) in their own transaction.
select pgmq.create('events');

-- ---------------------------------------------------------------------------
-- healthz: the survey Worker's liveness probe and the daily keep-alive.
-- ---------------------------------------------------------------------------
create or replace function public.healthz()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select 'ok'::text $$;
comment on function public.healthz() is 'Cheap DB round-trip for /healthz and the keep-alive cron. service_role only.';
revoke all on function public.healthz() from public, anon, authenticated;
grant execute on function public.healthz() to service_role;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (times are UTC = Africa/Accra)
-- ---------------------------------------------------------------------------
select cron.schedule('audit-partitions', '0 1 1 * *', 'select audit.ensure_partitions(2)');
select cron.schedule('quota-snapshot', '15 0 * * *', 'select ops.record_quota_snapshot()');
select cron.schedule('sign-in-attempts-retention', '30 3 * * *',
  $$delete from ops.auth_sign_in_attempts where at < now() - interval '30 days'$$);

-- ---------------------------------------------------------------------------
-- Vault loader used once per environment by `scripts/sync-secrets.mjs supabase <env>`.
-- service_role only, and only for the named application keys.
-- ---------------------------------------------------------------------------
create or replace function public.vault_upsert_secret(p_name text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_name not in ('pii_kek', 'pii_hmac_key', 'jobs_shared_secret') then
    raise exception 'vault name % is not allowed', p_name using errcode = '22023';
  end if;
  if length(coalesce(p_secret, '')) < 32 then
    raise exception 'vault secret % is too short', p_name using errcode = '22023';
  end if;
  select s.id into v_id from vault.secrets s where s.name = p_name;
  if v_id is null then
    perform vault.create_secret(p_secret, p_name, 'Loaded by scripts/sync-secrets.mjs');
  else
    perform vault.update_secret(v_id, p_secret, p_name);
  end if;
  perform audit.append('vault.secret_loaded', 'vault_secret', p_name, null, null, 'system');
end;
$$;
comment on function public.vault_upsert_secret(text, text) is 'Loads an allow-listed application key into Vault. service_role only; audited (name only).';
revoke all on function public.vault_upsert_secret(text, text) from public, anon, authenticated;
grant execute on function public.vault_upsert_secret(text, text) to service_role;
