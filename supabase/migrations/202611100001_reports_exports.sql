-- MS-09 exports and MS-12 scheduled reports (M13, FR-25, D-26), plus the auditors' audit-log export (M15).
-- Files are built by the Edge Functions `export` and `generate-report`; this migration holds the
-- tables, the private Storage bucket, the permission/scope checks and the row sources they call.
--
-- Depends on stream C (analytics.filtered_responses, public.analytics_summary/analytics_breakdown) and
-- stream D (public.case_metrics, public.notifications, public.email_log). Those are referenced only
-- from plpgsql bodies, which are resolved at call time.

create schema if not exists reports;
revoke all on schema reports from public, anon, authenticated;
comment on schema reports is 'Report and export internals (M13). Not exposed; reached through public RPCs only.';

insert into public.settings (key, value, description) values
  ('functions_base_url', '"http://supabase_kong_serene-pulse:8000/functions/v1"',
   'Base URL that scheduled jobs use to call Edge Functions (generate-report). Hosted: https://<project-ref>.supabase.co/functions/v1.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Tables (SPEC §2.3 "report_schedules", "report_files")
-- ---------------------------------------------------------------------------
create table public.report_schedules (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(btrim(name)) between 1 and 120),
  report_key          text not null check (report_key in ('daily_operational', 'weekly_branch', 'monthly_executive', 'quarterly_trend')),
  frequency           text not null check (frequency in ('daily', 'weekly', 'monthly', 'quarterly')),
  filters             jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  formats             text[] not null check (cardinality(formats) between 1 and 2 and formats <@ array['pdf', 'xlsx']),
  recipient_user_ids  uuid[] not null check (cardinality(recipient_user_ids) between 1 and 50),
  owner_id            uuid not null references public.profiles (user_id),
  next_run_at         timestamptz not null,
  last_run_at         timestamptz,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             int not null default 1,
  check (frequency = case report_key when 'daily_operational' then 'daily' when 'weekly_branch' then 'weekly'
                                     when 'monthly_executive' then 'monthly' else 'quarterly' end)
);
comment on table public.report_schedules is 'Scheduled reports (M13, D-26). Paused, never deleted. Figures use the owner''s access scope.';
create index report_schedules_due on public.report_schedules (next_run_at) where is_active;

create table public.report_files (
  id            uuid primary key default gen_random_uuid(),
  report_key    text not null check (report_key in ('responses_export', 'audit_export', 'daily_operational',
                  'weekly_branch', 'monthly_executive', 'quarterly_trend')),
  kind          text generated always as (
                  case when report_key in ('responses_export', 'audit_export') then 'export' else 'report' end) stored,
  schedule_id   uuid references public.report_schedules (id),
  run_id        uuid,
  requested_by  uuid references public.profiles (user_id),
  filters       jsonb not null default '{}'::jsonb,
  options       jsonb not null default '{}'::jsonb,
  format        text not null check (format in ('csv', 'xlsx', 'pdf')),
  status        text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'expired')),
  storage_path  text unique,
  row_count     int,
  byte_size     bigint,
  contains_pii  boolean not null default false,
  pii_reason    text,
  period_from   date,
  period_to     date,
  summary       jsonb,
  attempts      int not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  expires_at    timestamptz not null,
  check (schedule_id is not null or requested_by is not null),
  check (not contains_pii or length(btrim(pii_reason)) >= 10),
  check ((report_key in ('responses_export', 'audit_export')) = (schedule_id is null))
);
comment on table public.report_files is 'Generated exports (7 days) and report files (30 days) in Storage bucket "reports" (A-76).';
create index report_files_requested on public.report_files (requested_by, created_at desc);
create index report_files_schedule on public.report_files (schedule_id, created_at desc);
create index report_files_run on public.report_files (run_id);
create index report_files_expiry on public.report_files (expires_at) where status <> 'expired';

-- Response ids (and their effective attribution) of one export, captured once under the caller's
-- scope so later pages don't re-run the filter. Unlogged: transient, deleted when the file is done.
create unlogged table reports.export_rows (
  file_id      uuid not null,
  seq          int not null,
  response_id  uuid not null,
  eff          jsonb not null,
  primary key (file_id, seq)
);
revoke all on all tables in schema reports from public, anon, authenticated;

create trigger report_schedules_touch before update on public.report_schedules
  for each row execute function app.touch_row();
create trigger report_schedules_audit after insert or update on public.report_schedules
  for each row execute function app.audit_row();
create trigger report_files_audit after insert or update or delete on public.report_files
  for each row execute function app.audit_row();

alter table public.report_schedules enable row level security;
alter table public.report_files enable row level security;

create policy report_schedules_read on public.report_schedules for select to authenticated using (
  owner_id = (select auth.uid())
  or (select auth.uid()) = any (recipient_user_ids)
  or ((select app.has_perm('reports.schedule')) and (select app.org_scope()))
);
create policy report_files_read on public.report_files for select to authenticated using (
  requested_by = (select auth.uid())
  or exists (select 1 from public.report_schedules s
             where s.id = schedule_id
               and (s.owner_id = (select auth.uid()) or (select auth.uid()) = any (s.recipient_user_ids)))
);

revoke all on public.report_schedules, public.report_files from anon;
revoke insert, update, delete, truncate on public.report_schedules, public.report_files from authenticated;
grant select on public.report_schedules, public.report_files to authenticated;
grant select on public.report_schedules, public.report_files to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket. Clients never touch it directly; the Edge Functions upload with the
-- service role and hand out 15-minute signed URLs after a permission re-check.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 52428800,
        array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive, so no permissive policy added later can open the bucket to portal users.
create policy reports_bucket_no_client_access on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'reports') with check (bucket_id <> 'reports');

-- ---------------------------------------------------------------------------
-- Schedule maths (Africa/Accra = UTC). Reports run at 07:00; the quarterly report runs on the
-- first working day of the quarter (Mon–Fri, not in public.holidays).
-- ---------------------------------------------------------------------------
create or replace function reports.frequency_for(p_report_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_report_key when 'daily_operational' then 'daily' when 'weekly_branch' then 'weekly'
                           when 'monthly_executive' then 'monthly' when 'quarterly_trend' then 'quarterly' end
$$;

create or replace function reports.is_working_day(p_day date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(isodow from p_day) < 6
     and not exists (select 1 from public.holidays h where h.holiday_date = p_day)
$$;

create or replace function reports.first_working_day_on_or_after(p_day date)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day date := p_day;
begin
  while not reports.is_working_day(v_day) loop
    v_day := v_day + 1;
  end loop;
  return v_day;
end;
$$;

create or replace function reports.next_run_at(p_frequency text, p_after timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_after at time zone 'Africa/Accra';
  v_day date := (p_after at time zone 'Africa/Accra')::date;
  v_at timestamp;
  v_quarter date;
begin
  case p_frequency
    when 'daily' then
      v_at := v_day + time '07:00';
      if v_at <= v_local then v_at := v_at + interval '1 day'; end if;
    when 'weekly' then
      v_at := date_trunc('week', v_day::timestamp) + time '07:00';
      if v_at <= v_local then v_at := v_at + interval '7 days'; end if;
    when 'monthly' then
      v_at := date_trunc('month', v_day::timestamp) + time '07:00';
      if v_at <= v_local then v_at := v_at + interval '1 month'; end if;
    when 'quarterly' then
      v_quarter := date_trunc('quarter', v_day::timestamp)::date;
      loop
        v_at := reports.first_working_day_on_or_after(v_quarter) + time '07:00';
        exit when v_at > v_local;
        v_quarter := (v_quarter + interval '3 months')::date;
      end loop;
    else
      raise exception 'Unknown report frequency: %', p_frequency using errcode = '22023';
  end case;
  return v_at at time zone 'Africa/Accra';
end;
$$;
comment on function reports.next_run_at(text, timestamptz) is 'Next 07:00 Africa/Accra run strictly after p_after. Mirrored by apps/portal/src/features/reports/schedule.ts.';

-- The complete period a run on p_run_date reports on: yesterday, last Mon–Sun week, last month, last quarter.
create or replace function reports.period_for(p_frequency text, p_run_date date)
returns table (period_from date, period_to date)
language sql
immutable
set search_path = ''
as $$
  select case p_frequency
           when 'daily' then p_run_date - 1
           when 'weekly' then date_trunc('week', p_run_date::timestamp)::date - 7
           when 'monthly' then (date_trunc('month', p_run_date::timestamp) - interval '1 month')::date
           else (date_trunc('quarter', p_run_date::timestamp) - interval '3 months')::date end,
         case p_frequency
           when 'daily' then p_run_date - 1
           when 'weekly' then date_trunc('week', p_run_date::timestamp)::date - 1
           when 'monthly' then date_trunc('month', p_run_date::timestamp)::date - 1
           else date_trunc('quarter', p_run_date::timestamp)::date - 1 end
$$;

-- ---------------------------------------------------------------------------
-- Scope helpers. A user's live scope is what the access-token hook would mint for them now.
-- ---------------------------------------------------------------------------
create or replace function reports.claims_for(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event jsonb;
begin
  v_event := public.custom_access_token_hook(jsonb_build_object(
    'user_id', p_user,
    'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aud', 'authenticated')));
  if v_event ? 'error' then
    return null;
  end if;
  return v_event -> 'claims';
end;
$$;

create or replace function reports.json_uuids(p_value jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(
    case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end)::uuid), '{}'::uuid[])
$$;

-- Why a user can't receive a report with these filters, or null when they can (A-114: portal users only).
create or replace function reports.recipient_problem(p_user uuid, p_filters jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := reports.claims_for(p_user);
  v_need uuid[] := reports.json_uuids(p_filters -> 'branch_ids');
begin
  if v_claims is null or not coalesce((v_claims -> 'app_permissions') ? 'analytics.view', false) then
    return 'has no access to dashboards';
  end if;
  if coalesce((v_claims ->> 'app_org_scope')::boolean, false) then
    return null;
  end if;
  if cardinality(v_need) = 0 then
    return 'can only see their own branches, and this report covers the whole organisation';
  end if;
  if not (v_need <@ reports.json_uuids(v_claims -> 'app_branch_ids')) then
    return 'can''t see every branch this report covers';
  end if;
  return null;
end;
$$;

-- Runs the rest of the transaction as p_user (their claims), for building a report with the
-- owner's scope. Returns the previous claims so the caller can restore them.
create or replace function reports.act_as(p_claims jsonb)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_old text := coalesce(current_setting('request.jwt.claims', true), '');
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_claims ->> 'sub', ''), true);
  return v_old;
end;
$$;

create or replace function reports.restore_claims(p_old text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', p_old, true);
  perform set_config('request.jwt.claim.sub', coalesce(nullif(p_old, '')::jsonb ->> 'sub', ''), true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedules (portal)
-- ---------------------------------------------------------------------------
create or replace function public.report_schedule_save(
  p_id uuid, p_name text, p_report_key text, p_filters jsonb, p_formats text[], p_recipient_user_ids uuid[],
  p_is_active boolean default true, p_expected_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.report_schedules%rowtype;
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb) - 'from' - 'to';
  v_recipients uuid[];
  v_formats text[];
  v_branches uuid[];
  v_problem text;
  v_user uuid;
begin
  perform app.require_perm('reports.schedule', true);
  if jsonb_typeof(v_filters) <> 'object' then
    raise exception 'Filters must be an object.' using errcode = '22023';
  end if;
  if reports.frequency_for(p_report_key) is null then
    raise exception 'Choose which report to schedule.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'Give the schedule a name (up to 120 characters).' using errcode = '22023';
  end if;
  v_formats := array(select distinct f from unnest(coalesce(p_formats, '{}'::text[])) f order by f);
  if cardinality(v_formats) = 0 or not (v_formats <@ array['pdf', 'xlsx']) then
    raise exception 'Choose PDF, Excel or both.' using errcode = '22023';
  end if;
  v_recipients := array(select distinct u from unnest(coalesce(p_recipient_user_ids, '{}'::uuid[])) u where u is not null);
  if cardinality(v_recipients) = 0 then
    raise exception 'Choose at least one recipient.' using errcode = '22023';
  end if;
  if cardinality(v_recipients) > 50 then
    raise exception 'A schedule can have up to 50 recipients.' using errcode = '22023';
  end if;

  -- Branch-scoped owners can only schedule their own branches.
  if not app.org_scope() then
    v_branches := reports.json_uuids(v_filters -> 'branch_ids');
    if cardinality(v_branches) = 0 then
      v_filters := jsonb_set(v_filters, '{branch_ids}', to_jsonb(app.branch_ids()));
    elsif not (v_branches <@ app.branch_ids()) then
      raise exception 'You can only schedule reports for your own branches.' using errcode = '42501';
    end if;
  end if;

  foreach v_user in array v_recipients loop
    v_problem := reports.recipient_problem(v_user, v_filters);
    if v_problem is not null then
      raise exception '% can''t receive this report: they %.',
        coalesce((select nullif(p.display_name, '') from public.profiles p where p.user_id = v_user), 'A recipient'),
        v_problem using errcode = '22023';
    end if;
  end loop;

  if p_id is null then
    insert into public.report_schedules (name, report_key, frequency, filters, formats, recipient_user_ids, owner_id,
                                         next_run_at, is_active)
    values (btrim(p_name), p_report_key, reports.frequency_for(p_report_key), v_filters, v_formats, v_recipients,
            auth.uid(), reports.next_run_at(reports.frequency_for(p_report_key), now()), coalesce(p_is_active, true))
    returning * into v_row;
  else
    select * into v_row from public.report_schedules where id = p_id for update;
    if not found then
      raise exception 'That schedule no longer exists.' using errcode = 'P0002';
    end if;
    if v_row.owner_id <> auth.uid() and not app.org_scope() then
      raise exception 'Only the owner can change this schedule.' using errcode = '42501';
    end if;
    if p_expected_version is not null and p_expected_version <> v_row.version then
      raise exception 'Someone else changed this schedule. Reload it and try again.' using errcode = 'P0409';
    end if;
    update public.report_schedules
       set name = btrim(p_name), report_key = p_report_key, frequency = reports.frequency_for(p_report_key),
           filters = v_filters, formats = v_formats, recipient_user_ids = v_recipients,
           is_active = coalesce(p_is_active, true),
           next_run_at = case when p_report_key <> v_row.report_key or (coalesce(p_is_active, true) and not v_row.is_active)
                              then reports.next_run_at(reports.frequency_for(p_report_key), now())
                              else v_row.next_run_at end
     where id = p_id
     returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.report_schedule_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(s) || jsonb_build_object(
             'owner_name', (select p.display_name from public.profiles p where p.user_id = s.owner_id),
             'can_edit', app.has_perm('reports.schedule') and (s.owner_id = auth.uid() or app.org_scope()),
             'recipients', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name)
                                                     order by p.display_name), '[]'::jsonb)
                            from public.profiles p where p.user_id = any (s.recipient_user_ids)))
           order by s.is_active desc, s.name)
    from public.report_schedules s
    where s.owner_id = auth.uid() or auth.uid() = any (s.recipient_user_ids)
       or (app.has_perm('reports.schedule') and app.org_scope())), '[]'::jsonb);
end;
$$;

-- People who can be chosen as recipients: active portal users with dashboard access.
create or replace function public.report_recipient_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('reports.schedule', true);
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'display_name', x.display_name,
                                        'org_scope', coalesce((x.c ->> 'app_org_scope')::boolean, false),
                                        'branch_ids', coalesce(x.c -> 'app_branch_ids', '[]'::jsonb))
                     order by lower(x.display_name))
    from (select p.user_id, p.display_name, reports.claims_for(p.user_id) as c
          from public.profiles p where p.status = 'active') x
    where coalesce((x.c -> 'app_permissions') ? 'analytics.view', false)), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Runs: one pending file per format, built by generate-report.
-- ---------------------------------------------------------------------------
create or replace function reports.create_run(p_schedule public.report_schedules, p_requested_by uuid, p_run_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid := gen_random_uuid();
  v_from date;
  v_to date;
begin
  select pf.period_from, pf.period_to into v_from, v_to from reports.period_for(p_schedule.frequency, p_run_date) pf;
  insert into public.report_files (report_key, schedule_id, run_id, requested_by, filters, format, period_from,
                                   period_to, expires_at)
  select p_schedule.report_key, p_schedule.id, v_run, p_requested_by, p_schedule.filters, f, v_from, v_to,
         now() + interval '30 days'
  from unnest(p_schedule.formats) f;
  return v_run;
end;
$$;

create or replace function public.report_schedule_run_now(p_schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.report_schedules%rowtype;
  v_run uuid;
begin
  perform app.require_perm('reports.schedule', true);
  select * into v_s from public.report_schedules where id = p_schedule_id;
  if not found then
    raise exception 'That schedule no longer exists.' using errcode = 'P0002';
  end if;
  if v_s.owner_id <> auth.uid() and not app.org_scope() then
    raise exception 'Only the owner can run this schedule.' using errcode = '42501';
  end if;
  if exists (select 1 from public.report_files f where f.schedule_id = v_s.id and f.status = 'pending'
             and f.created_at > now() - interval '10 minutes') then
    raise exception 'This report is already being generated. It will appear in Report files shortly.'
      using errcode = '22023';
  end if;
  v_run := reports.create_run(v_s, auth.uid(), (now() at time zone 'Africa/Accra')::date);
  perform audit.append('report.run_requested', 'report_schedule', v_s.id::text, null,
                       jsonb_build_object('run_id', v_run));
  return jsonb_build_object('run_id', v_run);
end;
$$;

-- Human-readable filter description for report headers.
create or replace function reports.describe_filters(p_filters jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.value) order by x.ord), '[]'::jsonb)
  from (
    select 1 as ord, 'Branches' as label,
           (select string_agg(b.name, ', ' order by b.name) from public.branches b
             where b.id = any (reports.json_uuids(p_filters -> 'branch_ids'))) as value
    union all
    select 2, 'Regions', (select string_agg(r.name, ', ' order by r.name) from public.regions r
                           where r.id = any (reports.json_uuids(p_filters -> 'region_ids')))
    union all
    select 3, 'Channels', (select string_agg(c.label, ', ' order by c.label) from public.service_channels c
                            where c.id = any (reports.json_uuids(p_filters -> 'channel_ids')))
    union all
    select 4, 'Products', (select string_agg(p.label, ', ' order by p.label) from public.insurance_products p
                            where p.id = any (reports.json_uuids(p_filters -> 'product_ids')))
    union all
    select 5, 'Improvement factors', (select string_agg(f.label, ', ' order by f.label) from public.improvement_factors f
                                       where f.id = any (reports.json_uuids(p_filters -> 'factor_ids')))
    union all
    select 6, 'Sources', (select string_agg(value, ', ') from jsonb_array_elements_text(
                            case when jsonb_typeof(p_filters -> 'source_codes') = 'array' then p_filters -> 'source_codes' end))
    union all
    select 7, 'Satisfaction', (select string_agg(value, ', ') from jsonb_array_elements_text(
                                 case when jsonb_typeof(p_filters -> 'satisfaction') = 'array' then p_filters -> 'satisfaction' end))
    union all
    select 8, 'Unverified submissions', case when (p_filters ->> 'include_unverified')::boolean then 'Included' end
  ) x
  where x.value is not null
$$;

-- Figures for one report, from C's analytics RPCs and D's case metrics. Runs with the caller's claims.
create or replace function reports.build_report_data(p_report_key text, p_filters jsonb, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f jsonb := coalesce(p_filters, '{}'::jsonb) || jsonb_build_object('from', p_from, 'to', p_to);
  v_dims text[];
  v_dim text;
  v_breakdowns jsonb := '{}'::jsonb;
  v_months jsonb := '[]'::jsonb;
  v_month date;
  v_versions jsonb;
begin
  v_dims := case p_report_key
              when 'daily_operational' then array['branch', 'factor']
              when 'weekly_branch' then array['branch', 'region', 'channel']
              when 'monthly_executive' then array['region', 'branch', 'channel', 'product', 'factor', 'source']
              else array['region', 'branch'] end;
  foreach v_dim in array v_dims loop
    v_breakdowns := v_breakdowns || jsonb_build_object(v_dim, public.analytics_breakdown(v_dim, v_f));
  end loop;
  if p_report_key = 'quarterly_trend' then
    v_month := p_from;
    while v_month <= p_to loop
      v_months := v_months || jsonb_build_array(jsonb_build_object(
        'from', v_month, 'to', least(p_to, (v_month + interval '1 month')::date - 1),
        'summary', public.analytics_summary(v_f || jsonb_build_object(
                     'from', v_month, 'to', least(p_to, (v_month + interval '1 month')::date - 1)))));
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end if;
  select coalesce(jsonb_agg(distinct sv.version_no order by sv.version_no), '[]'::jsonb) into v_versions
  from analytics.filtered_responses(v_f) f
  join public.survey_versions sv on sv.id = (to_jsonb(f) ->> 'survey_version_id')::uuid;

  return jsonb_build_object(
    'summary', public.analytics_summary(v_f),
    'breakdowns', v_breakdowns,
    'months', v_months,
    'cases', public.case_metrics(v_f),
    'survey_versions', v_versions);
end;
$$;

-- Notifications for a finished run (in-app + email with a portal link; files are never attached, M13).
-- All of it goes through this one function, so notification wiring can be adapted in one place.
create or replace function reports.notify_recipients(p_run_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.report_files%rowtype;
  v_s public.report_schedules%rowtype;
  v_users uuid[];
  v_title text;
  v_body text;
  v_link text := '/reports/files?run=' || p_run_id::text;
  v_user uuid;
  v_n int := 0;
begin
  select * into v_file from public.report_files where run_id = p_run_id order by created_at limit 1;
  if not found then
    return 0;
  end if;
  select * into v_s from public.report_schedules where id = v_file.schedule_id;
  -- On-demand runs go to the person who asked; scheduled runs to recipients who still qualify.
  v_users := case when v_file.requested_by is not null then array[v_file.requested_by]
                  else array(select u from unnest(v_s.recipient_user_ids) u
                             where reports.recipient_problem(u, v_s.filters) is null) end;
  if exists (select 1 from public.report_files where run_id = p_run_id and status = 'ready') then
    v_title := v_s.name || ' is ready';
    v_body := format('%s for %s to %s is ready to download until %s. %s', v_s.name,
                     to_char(v_file.period_from, 'DD/MM/YYYY'), to_char(v_file.period_to, 'DD/MM/YYYY'),
                     to_char(v_file.expires_at at time zone 'Africa/Accra', 'DD/MM/YYYY'),
                     coalesce(format('Responses: %s.', v_file.summary ->> 'n'), ''));
  else
    v_title := v_s.name || ' could not be generated';
    v_body := 'The report run failed: ' || coalesce(v_file.error, 'unknown error') || '. Try "Run now" or contact your system administrator.';
    v_users := array[coalesce(v_file.requested_by, v_s.owner_id)];
  end if;

  -- D's app.notify: in-app row + queued email (respecting preferences and the daily budget), deduped per run.
  foreach v_user in array v_users loop
    perform app.notify(v_user, 'report.ready', v_title, v_body, v_link, true, true,
                       format('report:%s:%s', p_run_id, v_user),
                       jsonb_build_object('entity_type', 'report_run', 'entity_id', p_run_id::text, 'run_id', p_run_id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- generate-report (service_role)
-- ---------------------------------------------------------------------------
create or replace function public.report_run_claim(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.report_files%rowtype;
  v_s public.report_schedules%rowtype;
  v_claims jsonb;
  v_old text;
  v_data jsonb;
  v_actor uuid;
begin
  select * into v_file from public.report_files
   where run_id = p_run_id and status = 'pending' order by created_at limit 1 for update;
  if not found then
    return null;
  end if;
  update public.report_files set attempts = attempts + 1 where run_id = p_run_id and status = 'pending';
  select * into v_s from public.report_schedules where id = v_file.schedule_id;
  v_claims := reports.claims_for(v_s.owner_id);
  if v_claims is null or not coalesce((v_claims -> 'app_permissions') ? 'analytics.view', false) then
    update public.report_files
       set status = 'failed', completed_at = now(),
           error = 'The schedule owner no longer has access to dashboards. Ask an administrator to take it over.'
     where run_id = p_run_id and status = 'pending';
    perform reports.notify_recipients(p_run_id);
    return jsonb_build_object('run_id', p_run_id, 'failed', true);
  end if;

  v_old := reports.act_as(v_claims);
  v_data := reports.build_report_data(v_s.report_key, v_s.filters, v_file.period_from, v_file.period_to);
  perform reports.restore_claims(v_old);

  update public.report_files
     set summary = jsonb_build_object('n', v_data #> '{summary,n}',
                                      'csat_pct', v_data #> '{summary,metrics,csat_pct,value}',
                                      'nps', v_data #> '{summary,metrics,nps,value}')
   where run_id = p_run_id;
  v_actor := coalesce(v_file.requested_by, v_s.owner_id);
  return jsonb_build_object(
    'run_id', p_run_id,
    'report_key', v_s.report_key,
    'schedule_id', v_s.id,
    'schedule_name', v_s.name,
    'period', jsonb_build_object('from', v_file.period_from, 'to', v_file.period_to, 'tz', 'Africa/Accra'),
    'filters', reports.describe_filters(v_s.filters),
    'generated_at', now(),
    'generated_by', (select p.display_name from public.profiles p where p.user_id = v_actor),
    'trigger', case when v_file.requested_by is null then 'schedule' else 'on_demand' end,
    'files', (select jsonb_agg(jsonb_build_object('id', f.id, 'format', f.format) order by f.format)
              from public.report_files f where f.run_id = p_run_id and f.status = 'pending'),
    'settings', jsonb_build_object(
      'legal_name', (select s.value #>> '{}' from public.settings s where s.key = 'company_legal_name'),
      'display_name', (select s.value #>> '{}' from public.settings s where s.key = 'company_display_name'),
      'minimum_sample', (select s.value from public.settings s where s.key = 'minimum_sample')),
    'data', v_data);
end;
$$;

create or replace function public.report_file_complete(p_file_id uuid, p_storage_path text, p_byte_size bigint,
                                                       p_row_count int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.report_files%rowtype;
begin
  update public.report_files
     set status = 'ready', storage_path = p_storage_path, byte_size = p_byte_size, row_count = p_row_count,
         completed_at = now(), expires_at = now() + interval '30 days', error = null
   where id = p_file_id and status = 'pending' and kind = 'report'
   returning * into v_file;
  if not found then
    raise exception 'No pending report file %', p_file_id using errcode = 'P0002';
  end if;
  if p_storage_path is distinct from format('scheduled/%s/%s.%s', v_file.schedule_id, v_file.id, v_file.format) then
    raise exception 'Unexpected storage path for report file %', p_file_id using errcode = '22023';
  end if;
  perform audit.append('report.generated', 'report_file', v_file.id::text, null,
    jsonb_build_object('schedule_id', v_file.schedule_id, 'run_id', v_file.run_id, 'format', v_file.format,
                       'period_from', v_file.period_from, 'period_to', v_file.period_to, 'bytes', p_byte_size),
    'system');
  if not exists (select 1 from public.report_files where run_id = v_file.run_id and status = 'pending') then
    perform reports.notify_recipients(v_file.run_id);
  end if;
end;
$$;

create or replace function public.report_file_fail(p_file_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.report_files%rowtype;
begin
  update public.report_files
     set status = case when attempts >= 3 or requested_by is not null then 'failed' else 'pending' end,
         error = left(coalesce(p_error, 'unknown error'), 500),
         completed_at = case when attempts >= 3 or requested_by is not null then now() end
   where id = p_file_id and status = 'pending' and kind = 'report'
   returning * into v_file;
  if found and v_file.status = 'failed'
     and not exists (select 1 from public.report_files where run_id = v_file.run_id and status = 'pending') then
    perform reports.notify_recipients(v_file.run_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exports (portal → Edge Function `export`, all with the caller's JWT)
-- ---------------------------------------------------------------------------
create or replace function reports.export_columns(p_report_key text, p_text boolean, p_pii boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_report_key
    when 'audit_export' then
      '[{"key":"id","label":"Entry","type":"number"},{"key":"occurred_at","label":"Time (Africa/Accra)","type":"text"},
        {"key":"actor_type","label":"Actor type","type":"text"},{"key":"actor_name","label":"Actor","type":"text"},
        {"key":"actor_id","label":"Actor id","type":"text"},{"key":"action","label":"Action","type":"text"},
        {"key":"entity_type","label":"Entity type","type":"text"},{"key":"entity_id","label":"Entity id","type":"text"},
        {"key":"before","label":"Before","type":"text"},{"key":"after","label":"After","type":"text"},
        {"key":"hash","label":"Hash (SHA-256)","type":"text"}]'::jsonb
    else
      '[{"key":"reference","label":"Reference","type":"text"},
        {"key":"submitted_at","label":"Submitted (Africa/Accra)","type":"text"},
        {"key":"submission_date","label":"Submission date","type":"text"},
        {"key":"source","label":"Source","type":"text"},{"key":"qr_point","label":"QR point","type":"text"},
        {"key":"survey_version","label":"Survey version","type":"number"},
        {"key":"channel","label":"Service channel","type":"text"},
        {"key":"branch_status","label":"Branch answer","type":"text"},
        {"key":"branch_code","label":"Branch code","type":"text"},{"key":"branch","label":"Branch","type":"text"},
        {"key":"region","label":"Region","type":"text"},
        {"key":"attribution_corrected","label":"Attribution corrected","type":"boolean"},
        {"key":"product","label":"Insurance product","type":"text"},
        {"key":"csat","label":"Satisfaction (1-5)","type":"number"},
        {"key":"ces","label":"Effort (1-5)","type":"number"},
        {"key":"nps","label":"Recommend (0-10)","type":"number"},{"key":"nps_class","label":"NPS group","type":"text"},
        {"key":"improvement_factor","label":"Improvement factor","type":"text"},
        {"key":"verification","label":"Verification","type":"text"},
        {"key":"completion_seconds","label":"Completion time (s)","type":"number"},
        {"key":"contact_consent","label":"Asked to be contacted","type":"boolean"},
        {"key":"text_redacted","label":"Text removed (retention)","type":"boolean"}]'::jsonb
      || case when p_text then
      '[{"key":"channel_other","label":"Channel (other)","type":"text"},
        {"key":"branch_other","label":"Branch (other)","type":"text"},
        {"key":"product_other","label":"Product (other)","type":"text"},
        {"key":"improvement_other","label":"Improvement (other)","type":"text"},
        {"key":"comment","label":"Comment","type":"text"}]'::jsonb else '[]'::jsonb end
      || case when p_pii then
      '[{"key":"contact_first_name","label":"Contact first name","type":"text"},
        {"key":"contact_phone","label":"Contact phone","type":"text"}]'::jsonb else '[]'::jsonb end
  end
$$;

create or replace function public.export_begin(p_report_key text, p_filters jsonb, p_format text,
                                               p_include_pii boolean default false, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_pii boolean := coalesce(p_include_pii, false);
  v_text boolean := false;
  v_total int;
begin
  if p_report_key not in ('responses_export', 'audit_export') then
    raise exception 'Unknown export.' using errcode = '22023';
  end if;
  if p_format not in ('csv', 'xlsx') then
    raise exception 'Choose CSV or Excel.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_filters) <> 'object' then
    raise exception 'Filters must be an object.' using errcode = '22023';
  end if;

  if p_report_key = 'audit_export' then
    perform app.require_perm('audit.view', true);
    v_pii := false;
    if (v_filters ->> 'from') is null or (v_filters ->> 'to') is null then
      raise exception 'Choose the period to export.' using errcode = '22023';
    end if;
    select count(*) into v_total from audit.log l
     where l.occurred_at >= ((v_filters ->> 'from')::date)::timestamp at time zone 'Africa/Accra'
       and l.occurred_at < ((v_filters ->> 'to')::date + 1)::timestamp at time zone 'Africa/Accra'
       and (v_filters ->> 'action_prefix' is null or l.action like (v_filters ->> 'action_prefix') || '%')
       and (app.has_perm('audit.view_all') or l.action like 'public.%' or l.action like 'auth.%' or l.action like 'vault.%');
  else
    perform app.require_perm('exports.create', true);
    v_text := app.has_perm('responses.comment.view') and app.user_has_perm_now(auth.uid(), 'responses.comment.view');
    if v_pii then
      perform app.require_perm('pii.export', true);
      if length(btrim(coalesce(p_reason, ''))) < 10 then
        raise exception 'Say why this export needs contact details (at least 10 characters).' using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.report_files (id, report_key, requested_by, filters, options, format, contains_pii, pii_reason,
                                   period_from, period_to, expires_at)
  values (v_id, p_report_key, auth.uid(), v_filters, jsonb_build_object('text', v_text), p_format, v_pii,
          case when v_pii then left(btrim(p_reason), 500) end,
          (v_filters ->> 'from')::date, (v_filters ->> 'to')::date, now() + interval '7 days');

  if p_report_key = 'responses_export' then
    -- The caller's branch scope and filters are applied by analytics.filtered_responses (C).
    insert into reports.export_rows (file_id, seq, response_id, eff)
    select v_id, row_number() over (order by r.submitted_at, r.id), r.id,
           jsonb_build_object(
             'b', coalesce(x.j ->> 'branch_id', x.j ->> 'effective_branch_id', x.j ->> 'issuing_branch_id'),
             's', coalesce(x.j ->> 'branch_status', x.j ->> 'effective_branch_status'),
             'r', coalesce(x.j ->> 'region_id', x.j ->> 'effective_region_id', x.j ->> 'region_id_at_submission'),
             'c', coalesce((x.j ->> 'is_corrected')::boolean, false),
             'd', x.j ->> 'local_date')
    from (select to_jsonb(f) as j from analytics.filtered_responses(v_filters) f) x
    join survey.responses r on r.id = (x.j ->> 'id')::uuid;
    get diagnostics v_total = row_count;
  end if;

  if v_total = 0 then
    raise exception 'Nothing matches these filters, so there is nothing to export.' using errcode = '22023';
  end if;
  if v_total > 200000 then
    raise exception 'This export would have % rows; the limit is 200,000. Narrow the period or filters.', v_total
      using errcode = '22023';
  end if;
  return jsonb_build_object('file_id', v_id, 'total', v_total,
                            'columns', reports.export_columns(p_report_key, v_text, v_pii));
end;
$$;

create or replace function public.export_page(p_file_id uuid, p_after bigint default 0, p_limit int default 5000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.report_files%rowtype;
  v_limit int := least(greatest(coalesce(p_limit, 5000), 1), 10000);
  v_after bigint := coalesce(p_after, 0);
  v_text boolean;
  v_rows jsonb;
  v_last bigint;
  v_n int;
begin
  select * into v_file from public.report_files
   where id = p_file_id and requested_by = auth.uid() and status = 'pending' and kind = 'export';
  if not found then
    raise exception 'That export is no longer in progress.' using errcode = 'P0002';
  end if;

  if v_file.report_key = 'audit_export' then
    perform app.require_perm('audit.view', true);
    select coalesce(jsonb_agg(jsonb_build_array(
             l.id, to_char(l.occurred_at at time zone 'Africa/Accra', 'YYYY-MM-DD HH24:MI:SS'), l.actor_type,
             p.display_name, l.actor_id, l.action, l.entity_type, l.entity_id, l.before::text, l.after::text,
             encode(l.hash, 'hex')) order by l.id), '[]'::jsonb),
           max(l.id), count(*)
      into v_rows, v_last, v_n
    from (select * from audit.log a
           where a.id > v_after
             and a.occurred_at >= ((v_file.filters ->> 'from')::date)::timestamp at time zone 'Africa/Accra'
             and a.occurred_at < ((v_file.filters ->> 'to')::date + 1)::timestamp at time zone 'Africa/Accra'
             and (v_file.filters ->> 'action_prefix' is null or a.action like (v_file.filters ->> 'action_prefix') || '%')
             and (app.has_perm('audit.view_all') or a.action like 'public.%' or a.action like 'auth.%'
                  or a.action like 'vault.%')
           order by a.id limit v_limit) l
    left join public.profiles p on p.user_id = l.actor_id;
  else
    perform app.require_perm('exports.create', true);
    if v_file.contains_pii then
      perform app.require_perm('pii.export', true);
    end if;
    v_text := coalesce((v_file.options ->> 'text')::boolean, false);
    select coalesce(jsonb_agg(
             jsonb_build_array(
               r.reference, to_char(r.submitted_at at time zone 'Africa/Accra', 'YYYY-MM-DD HH24:MI:SS'),
               coalesce(e.eff ->> 'd', to_char(r.submitted_at at time zone 'Africa/Accra', 'YYYY-MM-DD')),
               src.label, qp.code, sv.version_no, ch.label, e.eff ->> 's', b.code, b.name, rg.name,
               (e.eff ->> 'c')::boolean, pr.label, r.csat_score, r.ces_score, r.nps_score, r.nps_class, fa.label,
               r.verification, round(r.completion_duration_ms / 1000.0, 1), r.contact_consent,
               r.text_redacted_at is not null)
             || case when v_text then jsonb_build_array(r.service_channel_other_text, r.issuing_branch_other_text,
                                                         r.insurance_product_other_text, r.improvement_other_text,
                                                         r.comment)
                     else '[]'::jsonb end
             || case when v_file.contains_pii then
                  jsonb_build_array(pii.decrypt_field(c.dek_enc, c.first_name_enc), pii.decrypt_field(c.dek_enc, c.phone_e164_enc))
                     else '[]'::jsonb end
             order by e.seq), '[]'::jsonb),
           max(e.seq), count(*)
      into v_rows, v_last, v_n
    from (select * from reports.export_rows x where x.file_id = p_file_id and x.seq > v_after
           order by x.seq limit v_limit) e
    join survey.responses r on r.id = e.response_id
    join public.survey_sources src on src.id = r.source_id
    join public.survey_versions sv on sv.id = r.survey_version_id
    join public.service_channels ch on ch.id = r.service_channel_id
    join public.insurance_products pr on pr.id = r.insurance_product_id
    left join public.qr_points qp on qp.id = r.qr_point_id
    left join public.branches b on b.id = (e.eff ->> 'b')::uuid
    left join public.regions rg on rg.id = (e.eff ->> 'r')::uuid
    left join public.improvement_factors fa on fa.id = r.improvement_factor_id
    left join pii.contact_requests c on v_file.contains_pii and c.response_id = r.id and c.erased_at is null;
  end if;
  return jsonb_build_object('rows', v_rows, 'next', case when v_n = v_limit then v_last end);
end;
$$;

create or replace function public.export_finish(p_file_id uuid, p_storage_path text, p_row_count int, p_byte_size bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.report_files%rowtype;
begin
  update public.report_files
     set status = 'ready', storage_path = p_storage_path, row_count = p_row_count, byte_size = p_byte_size,
         completed_at = now()
   where id = p_file_id and requested_by = auth.uid() and status = 'pending' and kind = 'export'
     and p_storage_path = format('exports/%s/%s.%s', auth.uid(), p_file_id, format)
   returning * into v_file;
  if not found then
    raise exception 'That export is no longer in progress.' using errcode = 'P0002';
  end if;
  delete from reports.export_rows where file_id = p_file_id;
  perform audit.append('export.created', 'report_file', v_file.id::text, null,
    jsonb_build_object('report_key', v_file.report_key, 'format', v_file.format, 'filters', v_file.filters,
                       'row_count', p_row_count, 'contains_pii', v_file.contains_pii, 'pii_reason', v_file.pii_reason,
                       'includes_text', coalesce((v_file.options ->> 'text')::boolean, false)));
end;
$$;

create or replace function public.export_fail(p_file_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.report_files
     set status = 'failed', error = left(coalesce(p_error, 'unknown error'), 500), completed_at = now()
   where id = p_file_id and requested_by = auth.uid() and status = 'pending' and kind = 'export';
  delete from reports.export_rows where file_id = p_file_id;
end;
$$;

-- Permission re-check before a signed URL is issued; every download is audited (SPEC FILES).
create or replace function public.report_file_authorize_download(p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.report_files%rowtype;
  v_s public.report_schedules%rowtype;
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;
  select * into v_file from public.report_files where id = p_file_id;
  if not found then
    raise exception 'That file no longer exists.' using errcode = 'P0002';
  end if;
  if v_file.kind = 'export' then
    v_ok := v_file.requested_by = auth.uid()
            and app.user_has_perm_now(auth.uid(), case v_file.report_key when 'audit_export' then 'audit.view'
                                                                         else 'exports.create' end)
            and (not v_file.contains_pii or app.user_has_perm_now(auth.uid(), 'pii.export'));
  else
    select * into v_s from public.report_schedules where id = v_file.schedule_id;
    v_ok := (v_file.requested_by = auth.uid() or v_s.owner_id = auth.uid() or auth.uid() = any (v_s.recipient_user_ids))
            and reports.recipient_problem(auth.uid(), v_s.filters) is null;
  end if;
  if not v_ok then
    raise exception 'You don''t have permission to download this file.' using errcode = '42501';
  end if;
  if v_file.status <> 'ready' or v_file.expires_at <= now() then
    raise exception 'This file has expired or is not ready. Create it again.' using errcode = '22023';
  end if;
  perform audit.append(case v_file.kind when 'export' then 'export.downloaded' else 'report.downloaded' end,
                       'report_file', v_file.id::text, null,
                       jsonb_build_object('report_key', v_file.report_key, 'format', v_file.format,
                                          'contains_pii', v_file.contains_pii));
  return jsonb_build_object(
    'storage_path', v_file.storage_path,
    'file_name', format('serene-%s-%s.%s', replace(v_file.report_key, '_', '-'),
                        coalesce(to_char(v_file.period_to, 'YYYYMMDD'), to_char(v_file.created_at, 'YYYYMMDD')),
                        v_file.format));
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduler: due schedules → pending files → pg_net call to generate-report (jobs secret).
-- ---------------------------------------------------------------------------
create or replace function reports.invoke_generator(p_body jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jobs_shared_secret');
  v_url text := (select s.value #>> '{}' from public.settings s where s.key = 'functions_base_url');
begin
  if v_secret is null or v_url is null then
    insert into ops.job_runs (job, finished_at, status, detail)
    values ('reports.invoke', now(), 'failed', jsonb_build_object(
      'reason', case when v_secret is null then 'jobs_shared_secret is not in Vault' else 'functions_base_url is not set' end));
    return null;
  end if;
  return net.http_post(
    url := v_url || '/generate-report',
    body := p_body,
    headers := jsonb_build_object('content-type', 'application/json', 'x-jobs-secret', v_secret),
    timeout_milliseconds := 5000);
end;
$$;

create or replace function reports.dispatch_due()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.report_schedules%rowtype;
  v_runs uuid[] := '{}'::uuid[];
  v_job bigint;
begin
  for v_s in select * from public.report_schedules
              where is_active and next_run_at <= now() order by next_run_at for update skip locked loop
    v_runs := v_runs || reports.create_run(v_s, null, (v_s.next_run_at at time zone 'Africa/Accra')::date);
    update public.report_schedules
       set last_run_at = now(), next_run_at = reports.next_run_at(v_s.frequency, now())
     where id = v_s.id;
  end loop;
  -- Retry scheduled runs whose call was lost (up to 3 attempts, then report_file_fail marks them failed).
  v_runs := v_runs || array(
    select distinct f.run_id from public.report_files f
     where f.status = 'pending' and f.kind = 'report' and f.requested_by is null
       and f.created_at < now() - interval '10 minutes' and f.attempts < 3);
  update public.report_files set status = 'failed', completed_at = now(),
         error = coalesce(error, 'Report generation did not complete after 3 attempts.')
   where status = 'pending' and kind = 'report' and attempts >= 3;
  if cardinality(v_runs) = 0 then
    return 0;
  end if;
  insert into ops.job_runs (job, status, detail)
  values ('reports.dispatch', 'running', jsonb_build_object('runs', cardinality(v_runs))) returning id into v_job;
  perform reports.invoke_generator(jsonb_build_object('action', 'run', 'run_ids', to_jsonb(v_runs)));
  update ops.job_runs set status = 'succeeded', finished_at = now() where id = v_job;
  return cardinality(v_runs);
end;
$$;

select cron.schedule('reports-dispatch', '*/15 * * * *', 'select reports.dispatch_due()');

-- Expired files: rows are marked here; generate-report deletes the objects through the Storage API
-- (direct deletes from storage.objects are refused) and then calls report_files_purged.
create or replace function public.report_files_due_purge(p_limit int default 500)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'storage_path', f.storage_path)), '[]'::jsonb)
  from (select id, storage_path from public.report_files where status = 'expired'
        order by expires_at limit least(greatest(coalesce(p_limit, 500), 1), 1000)) f
$$;

create or replace function public.report_files_purged(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  delete from public.report_files where id = any (p_ids) and status = 'expired';
  get diagnostics v_n = row_count;
  insert into ops.job_runs (job, finished_at, status, detail)
  values ('retention.files_purged', now(), 'succeeded', jsonb_build_object('deleted', v_n));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all functions in schema reports from public, anon, authenticated;
revoke all on function public.report_schedule_save(uuid, text, text, jsonb, text[], uuid[], boolean, int),
  public.report_schedule_list(), public.report_recipient_options(), public.report_schedule_run_now(uuid),
  public.export_begin(text, jsonb, text, boolean, text), public.export_page(uuid, bigint, int),
  public.export_finish(uuid, text, int, bigint), public.export_fail(uuid, text),
  public.report_file_authorize_download(uuid),
  public.report_run_claim(uuid), public.report_file_complete(uuid, text, bigint, int),
  public.report_file_fail(uuid, text), public.report_files_due_purge(int), public.report_files_purged(uuid[])
  from public, anon;
grant execute on function public.report_schedule_save(uuid, text, text, jsonb, text[], uuid[], boolean, int),
  public.report_schedule_list(), public.report_recipient_options(), public.report_schedule_run_now(uuid),
  public.export_begin(text, jsonb, text, boolean, text), public.export_page(uuid, bigint, int),
  public.export_finish(uuid, text, int, bigint), public.export_fail(uuid, text),
  public.report_file_authorize_download(uuid)
  to authenticated;
revoke all on function public.report_run_claim(uuid), public.report_file_complete(uuid, text, bigint, int),
  public.report_file_fail(uuid, text), public.report_files_due_purge(int), public.report_files_purged(uuid[])
  from authenticated;
grant execute on function public.report_run_claim(uuid), public.report_file_complete(uuid, text, bigint, int),
  public.report_file_fail(uuid, text), public.report_files_due_purge(int), public.report_files_purged(uuid[])
  to service_role;
