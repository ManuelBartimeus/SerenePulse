-- MS-10 flags and case management (M11, FR-21…FR-24, FR-46; D-15, D-17…D-21; Rules 11, 13, 21).
-- Business calendar and SLA (D-18), flag rules + response flags (raised synchronously when a
-- response is inserted), cases with an allowed-transition guard and optimistic locking, the
-- append-only case timeline, case RPCs, the audited contact reveal (D-15) and portal list/detail RPCs.
-- Notifications are not sent from here: every action enqueues an outbox event (pgmq 'events') that
-- ops.process_outbox() (202611090002) turns into in-app notifications and emails.

-- ---------------------------------------------------------------------------
-- Claim helper
-- ---------------------------------------------------------------------------
create or replace function app.has_role(p_key text)
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce((auth.jwt() -> 'app_roles') ? p_key, false) $$;
grant execute on function app.has_role(text) to authenticated, service_role;

-- Active users holding a role; for branch roles optionally only those granted the given branch.
create or replace function app.users_with_role(p_role text, p_branch uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct g.user_id
  from public.user_role_grants g
  join public.roles r on r.id = g.role_id
  join public.profiles p on p.user_id = g.user_id
  where g.status = 'active' and p.status = 'active' and r.key = p_role
    and (p_branch is null or r.scope = 'organisation' or g.scope_id = p_branch)
$$;
revoke all on function app.users_with_role(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Business calendar (D-18): Mon–Fri 08:00–17:00 Africa/Accra, public.holidays excluded.
-- One working day = 9 working hours. Work created out of hours starts at the next opening.
-- ---------------------------------------------------------------------------
create or replace function app.is_working_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select extract(isodow from p_day) < 6
     and not exists (select 1 from public.holidays h where h.holiday_date = p_day)
$$;

create or replace function app.add_working_days(p_start timestamptz, p_days numeric)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_left interval := make_interval(secs => (greatest(coalesce(p_days, 0), 0) * 32400)::double precision);
  v_t timestamp := p_start at time zone 'Africa/Accra';
  v_day date;
  v_open timestamp;
  v_close timestamp;
  v_guard int := 0;
begin
  if p_start is null then
    return null;
  end if;
  while v_guard < 4000 loop
    v_guard := v_guard + 1;
    v_day := v_t::date;
    if app.is_working_day(v_day) then
      v_open := v_day + time '08:00';
      v_close := v_day + time '17:00';
      if v_t < v_open then
        v_t := v_open;
      end if;
      if v_t < v_close then
        if v_t + v_left <= v_close then
          return (v_t + v_left) at time zone 'Africa/Accra';
        end if;
        v_left := v_left - (v_close - v_t);
      end if;
    end if;
    v_t := (v_day + 1)::timestamp;
  end loop;
  raise exception 'The working-day calculation did not finish; check the holiday calendar.' using errcode = 'P0001';
end;
$$;
comment on function app.add_working_days(timestamptz, numeric) is
  'Adds working days (9 working hours each, Mon–Fri 08:00–17:00 Africa/Accra, minus holidays) to a timestamp (D-18).';

create or replace function app.working_days_between(p_from timestamptz, p_to timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_from is null or p_to is null then null
    when p_to <= p_from then 0::numeric
    else round(coalesce((
      select sum(greatest(0::numeric, extract(epoch from
               least(p_to at time zone 'Africa/Accra', g.d + time '17:00')
               - greatest(p_from at time zone 'Africa/Accra', g.d + time '08:00'))))
      from (select s::date as d
            from generate_series((p_from at time zone 'Africa/Accra')::date::timestamp,
                                 (p_to at time zone 'Africa/Accra')::date::timestamp, interval '1 day') s) g
      where app.is_working_day(g.d)), 0) / 32400.0, 4)
  end
$$;
comment on function app.working_days_between(timestamptz, timestamptz) is
  'Working days (fractional, 9 h = 1 day) between two timestamps on the D-18 calendar.';

grant execute on function app.is_working_day(date), app.add_working_days(timestamptz, numeric),
  app.working_days_between(timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SLA policies (D-18)
-- ---------------------------------------------------------------------------
create table public.sla_policies (
  id                   uuid primary key default gen_random_uuid(),
  priority             text not null unique check (priority in ('P1', 'P2', 'P3', 'P4')),
  target_working_days  numeric not null check (target_working_days > 0 and target_working_days <= 60),
  warning_pct          int not null default 75 check (warning_pct between 10 and 99),
  clock                text not null default 'business' check (clock = 'business'),
  updated_at           timestamptz not null default now(),
  version              int not null default 1
);
comment on table public.sla_policies is 'Case resolution targets per priority in working days (D-18). Warning at warning_pct.';
create trigger sla_policies_touch before update on public.sla_policies for each row execute function app.touch_row();
create trigger sla_policies_audit after insert or update on public.sla_policies for each row execute function app.audit_row();
insert into public.sla_policies (priority, target_working_days) values ('P1', 1), ('P2', 3), ('P3', 5), ('P4', 10);

-- ---------------------------------------------------------------------------
-- Flag rules (D-19, A-111, A-126). There is deliberately no NPS rule (Rule 11).
-- The improvement-factor rule only has an on/off switch (is_active); the Flag / Auto-create case
-- toggles live on each improvement factor (flag_on_select / auto_create_case).
-- ---------------------------------------------------------------------------
create table public.flag_rules (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique check (key in ('low_csat', 'improvement_factor', 'comment_keyword')),
  name              text not null,
  description       text not null,
  params            jsonb not null default '{}'::jsonb,
  flag_enabled      boolean not null default true,
  auto_create_case  boolean not null default false,
  default_priority  text not null default 'P3' check (default_priority in ('P1', 'P2', 'P3', 'P4')),
  is_active         boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  version           int not null default 1
);
comment on table public.flag_rules is 'Flag rules with "Flag" (default ON) and "Auto-create case" (default OFF) toggles (D-19, Rule 13).';

create or replace function app.flag_rules_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  if new.key is distinct from old.key then
    raise exception 'Rule keys are permanent.' using errcode = '22023';
  end if;
  if new.key = 'low_csat' and (jsonb_typeof(new.params -> 'csat_lte') <> 'number'
       or (new.params ->> 'csat_lte')::numeric not in (1, 2, 3)) then
    raise exception 'The CSAT threshold must be 1, 2 or 3.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger flag_rules_validate before update on public.flag_rules for each row execute function app.flag_rules_validate();
create trigger flag_rules_touch before update on public.flag_rules for each row execute function app.touch_row();
create trigger flag_rules_audit after insert or update on public.flag_rules for each row execute function app.audit_row();

insert into public.flag_rules (key, name, description, params, flag_enabled, auto_create_case, default_priority, sort_order) values
  ('low_csat', 'Low satisfaction (CSAT 1–2)', 'Customer rated overall satisfaction 1 or 2.', '{"csat_lte": 2}', true, false, 'P2', 1),
  ('improvement_factor', 'Improvement factor selected',
   'Customer chose something to improve. Each factor has its own Flag and Auto-create case switches; "Nothing, I am satisfied" never flags.',
   '{}', true, false, 'P3', 2),
  ('comment_keyword', 'Concerning comment',
   'The comment contains a keyword from the list (case-insensitive, whole words).', '{}', true, false, 'P2', 3);

-- ---------------------------------------------------------------------------
-- Cases (REQ §8.2). Transitions only through case_* functions (guard trigger below).
-- ---------------------------------------------------------------------------
create table app.case_counters (
  year  int primary key,
  last  int not null
);
revoke all on app.case_counters from public, anon, authenticated;

create table app.case_transitions (
  from_status text not null,
  to_status   text not null,
  primary key (from_status, to_status)
);
comment on table app.case_transitions is 'Allowed case status transitions (M11 lifecycle, docs/architecture/flows.md §5).';
insert into app.case_transitions values
  ('new', 'assigned'), ('assigned', 'in_progress'), ('in_progress', 'resolved'), ('resolved', 'closed'),
  ('resolved', 'in_progress'),  -- reopen within 30 days (CX/Exec)
  ('closed', 'in_progress');    -- Executive reopen with reason
revoke all on app.case_transitions from public, anon, authenticated;

create table public.cases (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique check (reference ~ '^CASE-\d{4}-\d{5,}$'),
  response_id           uuid not null references survey.responses (id),
  has_contact_consent   boolean not null default false,
  branch_id             uuid references public.branches (id),
  service_channel_id    uuid not null references public.service_channels (id),
  insurance_product_id  uuid not null references public.insurance_products (id),
  category_id           uuid references public.case_categories (id),
  priority              text not null check (priority in ('P1', 'P2', 'P3', 'P4')),
  description           text not null check (length(description) between 1 and 4000),
  department_id         uuid references public.departments (id),
  assigned_officer_id   uuid references public.profiles (user_id),
  status                text not null default 'new' check (status in ('new', 'assigned', 'in_progress', 'resolved', 'closed')),
  queue                 text not null default 'cx_central' check (queue = 'cx_central'),
  source                text not null check (source in ('auto', 'flag', 'manual')),
  is_escalated          boolean not null default false,
  escalation_level      smallint not null default 0 check (escalation_level between 0 and 3),
  sla_policy_id         uuid not null references public.sla_policies (id),
  target_resolution_at  timestamptz not null,
  sla_warning_due_at    timestamptz not null,
  sla_warning_at        timestamptz,
  sla_breached_at       timestamptz,
  first_response_at     timestamptz,
  resolved_at           timestamptz,
  closed_at             timestamptz,
  resolution_notes      text check (length(resolution_notes) <= 4000),
  corrective_action     text check (length(corrective_action) <= 4000),
  follow_up_outcome     text check (follow_up_outcome in ('not_required', 'contacted_resolved', 'contacted_unresolved',
                                                          'unreachable', 'declined')),
  reopen_count          int not null default 0,
  created_by            uuid references public.profiles (user_id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  version               int not null default 1,
  check (is_escalated = (escalation_level > 0)),
  check (status not in ('resolved', 'closed') or resolved_at is not null),
  check (status <> 'closed' or closed_at is not null)
);
comment on table public.cases is 'Feedback cases (REQ §8.2). One non-closed case per response (A-75); CX central queue (D-17).';
create unique index cases_one_open_per_response on public.cases (response_id) where status <> 'closed';
create index cases_status_idx on public.cases (status, target_resolution_at);
create index cases_officer_idx on public.cases (assigned_officer_id) where status <> 'closed';
create index cases_branch_idx on public.cases (branch_id, created_at desc);
create index cases_created_idx on public.cases (created_at desc, id desc);

create table public.case_activities (
  id             bigint generated always as identity primary key,
  case_id        uuid not null references public.cases (id),
  actor_user_id  uuid references public.profiles (user_id),
  type           text not null check (type in ('created', 'assigned', 'reassigned', 'status_changed', 'priority_changed',
                   'note', 'investigation', 'escalated', 'de_escalated', 'corrective_action', 'resolved', 'closed',
                   'reopened', 'sla_warning', 'sla_breached', 'follow_up_recorded', 'contact_revealed')),
  from_value     text,
  to_value       text,
  body           text check (length(body) <= 4000),
  mentions       uuid[] not null default '{}'::uuid[],
  created_at     timestamptz not null default now()
);
comment on table public.case_activities is 'Append-only case timeline (REQ §8.4).';
create index case_activities_case_idx on public.case_activities (case_id, id);

create table public.response_flags (
  id                  uuid primary key default gen_random_uuid(),
  response_id         uuid not null references survey.responses (id),
  rule_id             uuid not null references public.flag_rules (id),
  factor_id           uuid references public.improvement_factors (id),
  reason              text not null,
  suggested_priority  text not null check (suggested_priority in ('P1', 'P2', 'P3', 'P4')),
  branch_id           uuid references public.branches (id),
  csat_score          smallint not null,
  status              text not null default 'open' check (status in ('open', 'dismissed', 'converted')),
  case_id             uuid references public.cases (id),
  reviewed_by         uuid references public.profiles (user_id),
  reviewed_at         timestamptz,
  dismissal_reason    text check (length(dismissal_reason) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             int not null default 1,
  unique (response_id, rule_id),
  check ((status = 'converted') = (case_id is not null)),
  check (status <> 'dismissed' or dismissal_reason is not null)
);
comment on table public.response_flags is 'Review-queue entries raised by flag rules (REQ §8.1). Branch and CSAT are snapshots for scoping and the default "CSAT ≤ 2" view.';
create index response_flags_queue_idx on public.response_flags (status, created_at desc, id desc);
create index response_flags_response_idx on public.response_flags (response_id);
create trigger response_flags_touch before update on public.response_flags for each row execute function app.touch_row();
create trigger response_flags_audit after update on public.response_flags for each row execute function app.audit_row();

-- Guard: every case change must come from a case_* function, and status moves must be allowed.
create or replace function app.cases_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Cases are never deleted.' using errcode = '42501';
  end if;
  if coalesce(current_setting('app.case_write', true), '') <> 'on' then
    raise exception 'Cases change only through case actions.' using errcode = '42501';
  end if;
  if new.reference is distinct from old.reference or new.response_id is distinct from old.response_id
     or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'A case''s reference, feedback record and creation details are permanent.' using errcode = '22023';
  end if;
  if new.status is distinct from old.status
     and not exists (select 1 from app.case_transitions t where t.from_status = old.status and t.to_status = new.status) then
    raise exception 'A case can''t move from % to %.', replace(old.status, '_', ' '), replace(new.status, '_', ' ')
      using errcode = '22023', detail = 'case_transition';
  end if;
  return new;
end;
$$;
create trigger cases_a_guard before update or delete on public.cases for each row execute function app.cases_guard();
create trigger cases_touch before update on public.cases for each row execute function app.touch_row();
create trigger cases_audit after insert or update on public.cases for each row execute function app.audit_row();

create or replace function app.case_activities_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The case timeline is append-only.' using errcode = '42501';
end;
$$;
create trigger case_activities_append_only before update or delete on public.case_activities
  for each row execute function app.case_activities_append_only();
create trigger case_activities_audit after insert on public.case_activities
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Visibility (ADR-0003): org scope sees all; branch managers their branches (D-21); officers the
-- cases assigned to them ("A" scope); department heads their department's cases (escalation, D-20).
-- ---------------------------------------------------------------------------
create or replace function app.case_visible(p_branch_id uuid, p_officer_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_perm('cases.view') and (
    app.org_scope()
    or p_officer_id = auth.uid()
    or (p_branch_id is not null and p_branch_id = any (app.branch_ids()))
    or (p_department_id is not null
        and exists (select 1 from public.departments d where d.id = p_department_id and d.head_user_id = auth.uid())))
$$;

create or replace function app.flag_visible(p_branch_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.has_perm('flags.view')
     and (app.org_scope() or (p_branch_id is not null and p_branch_id = any (app.branch_ids())))
$$;

-- A response is visible in the caller's branch scope, or to an officer through an assigned case.
create or replace function app.response_visible(p_response_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    app.org_scope()
    or exists (select 1 from survey.responses r
               where r.id = p_response_id and r.issuing_branch_id = any (app.branch_ids()))
    or exists (select 1 from public.cases c
               where c.response_id = p_response_id and app.case_visible(c.branch_id, c.assigned_officer_id, c.department_id)))
$$;
grant execute on function app.case_visible(uuid, uuid, uuid), app.flag_visible(uuid), app.response_visible(uuid)
  to authenticated, service_role;

alter table public.sla_policies enable row level security;
alter table public.flag_rules enable row level security;
alter table public.cases enable row level security;
alter table public.case_activities enable row level security;
alter table public.response_flags enable row level security;

create policy sla_policies_read on public.sla_policies for select to authenticated using (true);
create policy sla_policies_update on public.sla_policies for update to authenticated
  using ((select app.has_perm('settings.manage'))) with check ((select app.has_perm('settings.manage')));
create policy flag_rules_read on public.flag_rules for select to authenticated using (true);
create policy flag_rules_update on public.flag_rules for update to authenticated
  using ((select app.has_perm('flags.configure'))) with check ((select app.has_perm('flags.configure')));
create policy cases_read on public.cases for select to authenticated
  using (app.case_visible(branch_id, assigned_officer_id, department_id));
create policy case_activities_read on public.case_activities for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id
                 and app.case_visible(c.branch_id, c.assigned_officer_id, c.department_id)));
create policy response_flags_read on public.response_flags for select to authenticated using (app.flag_visible(branch_id));

revoke all on public.sla_policies, public.flag_rules, public.cases, public.case_activities, public.response_flags
  from public, anon, authenticated;
grant select on public.sla_policies, public.flag_rules, public.cases, public.case_activities, public.response_flags
  to authenticated;
grant update (target_working_days, warning_pct) on public.sla_policies to authenticated;
grant update (flag_enabled, auto_create_case, default_priority, params, is_active) on public.flag_rules to authenticated;

-- ---------------------------------------------------------------------------
-- Internal case helpers
-- ---------------------------------------------------------------------------
create or replace function app.escalation_label(p_level int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_level when 0 then 'Officer' when 1 then 'Department head' when 2 then 'CX Administrator'
                      else 'Executive' end
$$;

create or replace function app.case_write(p_on boolean)
returns void
language sql
set search_path = ''
as $$ select set_config('app.case_write', case when p_on then 'on' else 'off' end, true)::text is not null $$;

create or replace function app.case_activity(p_case_id uuid, p_type text, p_from text default null,
  p_to text default null, p_body text default null, p_mentions uuid[] default '{}'::uuid[])
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.case_activities (case_id, actor_user_id, type, from_value, to_value, body, mentions)
  values (p_case_id, auth.uid(), p_type, p_from, p_to, p_body, coalesce(p_mentions, '{}'::uuid[]))
  returning id
$$;

create or replace function app.case_event(p_type text, p_case_id uuid, p_extra jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select count(*) = 0 from pgmq.send('events', jsonb_build_object('type', p_type, 'case_id', p_case_id,
    'actor_id', auth.uid(), 'at', now()) || coalesce(p_extra, '{}'::jsonb))
$$;

-- Locks a visible case and checks the caller's expected version (optimistic locking, P0409).
create or replace function app.case_lock(p_case_id uuid, p_expected_version int)
returns public.cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
begin
  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null or not app.case_visible(v_case.branch_id, v_case.assigned_officer_id, v_case.department_id) then
    raise exception 'Case not found.' using errcode = 'P0002';
  end if;
  if p_expected_version is null or v_case.version <> p_expected_version then
    raise exception 'Someone else updated this case. Reload to see the latest version, then try again.'
      using errcode = 'P0409';
  end if;
  return v_case;
end;
$$;

create or replace function app.require_text(p_value text, p_min int, p_max int, p_what text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_value, ''))) < p_min then
    raise exception 'Enter % (at least % characters).', p_what, p_min using errcode = '22023';
  end if;
  if length(btrim(p_value)) > p_max then
    raise exception 'Keep % under % characters.', p_what, p_max using errcode = '22023';
  end if;
  return btrim(p_value);
end;
$$;

create or replace function app.require_priority(p_priority text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_priority is null or p_priority not in ('P1', 'P2', 'P3', 'P4') then
    raise exception 'Choose a priority from P1 to P4.' using errcode = '22023';
  end if;
  return p_priority;
end;
$$;

-- Creates a case for a response in the CX central queue (D-17), with the SLA from its priority.
create or replace function app.case_insert(p_response_id uuid, p_priority text, p_description text,
  p_category_id uuid, p_source text)
returns public.cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp survey.responses;
  v_policy public.sla_policies;
  v_open text;
  v_year int := extract(year from now() at time zone 'Africa/Accra')::int;
  v_n int;
  v_case public.cases;
begin
  select * into v_resp from survey.responses where id = p_response_id;
  if v_resp.id is null then
    raise exception 'That feedback record doesn''t exist.' using errcode = 'P0002';
  end if;
  select c.reference into v_open from public.cases c where c.response_id = p_response_id and c.status <> 'closed';
  if v_open is not null then
    raise exception 'This feedback already has an open case (%).', v_open using errcode = '22023', detail = v_open;
  end if;
  select * into v_policy from public.sla_policies where priority = app.require_priority(p_priority);
  insert into app.case_counters as c (year, last) values (v_year, 1)
  on conflict (year) do update set last = c.last + 1
  returning last into v_n;

  insert into public.cases (reference, response_id, has_contact_consent, branch_id, service_channel_id,
    insurance_product_id, category_id, priority, description, source, sla_policy_id, target_resolution_at,
    sla_warning_due_at, created_by)
  values ('CASE-' || v_year || '-' || lpad(v_n::text, 5, '0'), v_resp.id,
    exists (select 1 from pii.contact_requests cr where cr.response_id = v_resp.id and cr.erased_at is null),
    v_resp.issuing_branch_id, v_resp.service_channel_id, v_resp.insurance_product_id, p_category_id, v_policy.priority,
    p_description, p_source, v_policy.id,
    app.add_working_days(now(), v_policy.target_working_days),
    app.add_working_days(now(), v_policy.target_working_days * v_policy.warning_pct / 100.0),
    auth.uid())
  returning * into v_case;

  perform app.case_activity(v_case.id, 'created', null, 'new',
    case p_source when 'auto' then 'Created automatically by a flag rule.' when 'flag' then 'Created from a flag.'
                  else 'Created manually.' end);
  -- Open flags on the same response now belong to this case.
  update public.response_flags
     set status = 'converted', case_id = v_case.id, reviewed_by = auth.uid(), reviewed_at = now()
   where response_id = v_resp.id and status = 'open';
  perform app.case_event('case.created', v_case.id, jsonb_build_object('source', p_source));
  return v_case;
end;
$$;

revoke all on function app.escalation_label(int), app.case_write(boolean), app.case_activity(uuid, text, text, text, text, uuid[]),
  app.case_event(text, uuid, jsonb), app.case_lock(uuid, int), app.case_insert(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function app.escalation_label(int), app.require_text(text, int, int, text), app.require_priority(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Flag raising: AFTER INSERT on survey.responses, in the submission's transaction (FR-21, D-19).
-- ---------------------------------------------------------------------------
create or replace function app.comment_keyword_hits(p_comment text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(k order by k), '{}'::text[])
  from (select distinct lower(btrim(e #>> '{}')) as k
        from public.settings s, jsonb_array_elements(s.value) e
        where s.key = 'comment_keywords' and jsonb_typeof(s.value) = 'array' and btrim(e #>> '{}') <> '') kw
  where p_comment is not null
    and p_comment ~* ('\m' || regexp_replace(k, '([.\\+*?\[^\]$(){}=!<>|:\-#])', '\\\1', 'g') || '\M')
$$;

create or replace function app.flag_new_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.flag_rules;
  v_factor public.improvement_factors;
  v_hits text[];
  v_auto text;
  v_category uuid;
  v_reasons text[] := '{}'::text[];
  v_n int := 0;
begin
  -- Low CSAT
  select * into v_rule from public.flag_rules where key = 'low_csat' and is_active;
  if v_rule.id is not null and (v_rule.flag_enabled or v_rule.auto_create_case)
     and new.csat_score <= coalesce((v_rule.params ->> 'csat_lte')::int, 2) then
    insert into public.response_flags (response_id, rule_id, reason, suggested_priority, branch_id, csat_score)
    values (new.id, v_rule.id, 'Satisfaction rated ' || new.csat_score || ' out of 5', v_rule.default_priority,
            new.issuing_branch_id, new.csat_score);
    v_n := v_n + 1;
    v_reasons := array_append(v_reasons, 'CSAT ' || new.csat_score);
    if v_rule.auto_create_case then
      v_auto := least(v_auto, v_rule.default_priority);
    end if;
  end if;

  -- Improvement factor: each factor's own toggles decide (D-19). "Nothing" never flags.
  if new.improvement_factor_id is not null then
    select * into v_rule from public.flag_rules where key = 'improvement_factor' and is_active;
    select * into v_factor from public.improvement_factors where id = new.improvement_factor_id;
    if v_rule.id is not null and not v_factor.is_none and (v_factor.flag_on_select or v_factor.auto_create_case) then
      insert into public.response_flags (response_id, rule_id, factor_id, reason, suggested_priority, branch_id, csat_score)
      values (new.id, v_rule.id, v_factor.id, 'Improvement factor: ' || v_factor.label, v_factor.default_priority,
              new.issuing_branch_id, new.csat_score);
      v_n := v_n + 1;
      v_reasons := array_append(v_reasons, v_factor.label);
      if v_factor.auto_create_case then
        v_auto := least(v_auto, v_factor.default_priority);
        select c.id into v_category from public.case_categories c where c.code = v_factor.code and c.is_active;
      end if;
    end if;
  end if;

  -- Concerning comment (A-111): whole-word, case-insensitive keyword match.
  if nullif(btrim(coalesce(new.comment, '')), '') is not null then
    select * into v_rule from public.flag_rules where key = 'comment_keyword' and is_active;
    if v_rule.id is not null and (v_rule.flag_enabled or v_rule.auto_create_case) then
      v_hits := app.comment_keyword_hits(new.comment);
      if cardinality(v_hits) > 0 then
        insert into public.response_flags (response_id, rule_id, reason, suggested_priority, branch_id, csat_score)
        values (new.id, v_rule.id, 'Comment mentions: ' || array_to_string(v_hits, ', '), v_rule.default_priority,
                new.issuing_branch_id, new.csat_score);
        v_n := v_n + 1;
        v_reasons := array_append(v_reasons, 'comment keyword');
        if v_rule.auto_create_case then
          v_auto := least(v_auto, v_rule.default_priority);
        end if;
      end if;
    end if;
  end if;

  if v_n = 0 then
    return null;
  end if;
  perform pgmq.send('events', jsonb_build_object('type', 'flag.created', 'response_id', new.id,
    'branch_id', new.issuing_branch_id, 'flags', v_n, 'at', now()));
  if v_auto is not null then
    perform app.case_insert(new.id, v_auto, 'Raised automatically: ' || array_to_string(v_reasons, '; ') || '.',
                              v_category, 'auto');
  end if;
  return null;
end;
$$;
create trigger responses_flag after insert on survey.responses for each row execute function app.flag_new_response();
revoke all on function app.comment_keyword_hits(text), app.flag_new_response() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Flag RPCs
-- ---------------------------------------------------------------------------
create or replace function public.flag_dismiss(p_flag_ids uuid[], p_reason text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := app.require_text(p_reason, 3, 500, 'a reason for dismissing');
  v_n int;
begin
  perform app.require_perm('flags.review', true);
  if coalesce(cardinality(p_flag_ids), 0) = 0 then
    raise exception 'Select at least one flag.' using errcode = '22023';
  end if;
  if cardinality(p_flag_ids) > 500 then
    raise exception 'Dismiss up to 500 flags at a time.' using errcode = '22023';
  end if;
  update public.response_flags f
     set status = 'dismissed', dismissal_reason = v_reason, reviewed_by = auth.uid(), reviewed_at = now()
   where f.id = any (p_flag_ids) and f.status = 'open' and app.flag_visible(f.branch_id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.flag_convert_to_case(p_flag_id uuid, p_priority text default null,
  p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag public.response_flags;
  v_case public.cases;
begin
  perform app.require_perm('flags.review', true);
  perform app.require_perm('cases.create', true);
  select * into v_flag from public.response_flags where id = p_flag_id for update;
  if v_flag.id is null or not app.flag_visible(v_flag.branch_id) then
    raise exception 'Flag not found.' using errcode = 'P0002';
  end if;
  if v_flag.status <> 'open' then
    raise exception 'This flag has already been reviewed.' using errcode = '22023';
  end if;
  -- A response has at most one open case (A-75): link to it instead of creating another.
  select * into v_case from public.cases where response_id = v_flag.response_id and status <> 'closed';
  if v_case.id is not null then
    update public.response_flags
       set status = 'converted', case_id = v_case.id, reviewed_by = auth.uid(), reviewed_at = now()
     where response_id = v_flag.response_id and status = 'open';
    return jsonb_build_object('case_id', v_case.id, 'reference', v_case.reference, 'created', false);
  end if;
  v_case := app.case_insert(v_flag.response_id, coalesce(p_priority, v_flag.suggested_priority),
    coalesce(nullif(btrim(p_description), ''), v_flag.reason),
    (select c.id from public.case_categories c join public.improvement_factors f on f.code = c.code
      where f.id = v_flag.factor_id and c.is_active), 'flag');
  return jsonb_build_object('case_id', v_case.id, 'reference', v_case.reference, 'created', true);
end;
$$;

-- Comment keyword list (A-111), editable by flags.configure from the flag-rules screen.
create or replace function public.flag_rules_set_keywords(p_keywords jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform app.require_perm('flags.configure', true);
  if jsonb_typeof(p_keywords) <> 'array' then
    raise exception 'Send the keywords as a list.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(btrim(e #>> '{}')), '[]'::jsonb) into v
  from jsonb_array_elements(p_keywords) e where btrim(coalesce(e #>> '{}', '')) <> '';
  update public.settings set value = v where key = 'comment_keywords';
  return v;
end;
$$;

-- Review queue (S-B3). Default view is "CSAT ≤ 2" (A-126). Cursor = "created_at|id".
create or replace function public.flags_list(p_status text default 'open', p_view text default 'csat_lte_2',
  p_rule_key text default null, p_cursor text default null, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_ts timestamptz := nullif(split_part(coalesce(p_cursor, ''), '|', 1), '')::timestamptz;
  v_id uuid := nullif(split_part(coalesce(p_cursor, ''), '|', 2), '')::uuid;
  v_comments boolean := app.has_perm('responses.comment.view');
  v_items jsonb;
  v_counts jsonb;
begin
  perform app.require_perm('flags.view', false);
  with base as (
    select f.* from public.response_flags f
    join public.flag_rules r on r.id = f.rule_id
    where app.flag_visible(f.branch_id)
      and (p_status is null or p_status = 'all' or f.status = p_status)
      and (coalesce(p_view, 'all') <> 'csat_lte_2' or f.csat_score <= 2)
  )
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_counts
  from (select r.key as k, count(*) as n from base b join public.flag_rules r on r.id = b.rule_id group by r.key) x;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc, t.id desc), '[]'::jsonb) into v_items
  from (
    select f.id, f.response_id, f.status, f.reason, f.suggested_priority, f.created_at, f.reviewed_at,
           f.dismissal_reason, f.case_id, c.reference as case_reference, r.key as rule_key, r.name as rule_name,
           s.reference as response_reference, s.submitted_at, s.csat_score, s.nps_score, s.contact_consent,
           b.name as branch_name, ch.label as channel_label, p.label as product_label,
           case when v_comments and s.text_redacted_at is null then left(s.comment, 200) end as comment_excerpt
    from public.response_flags f
    join public.flag_rules r on r.id = f.rule_id
    join survey.responses s on s.id = f.response_id
    join public.service_channels ch on ch.id = s.service_channel_id
    join public.insurance_products p on p.id = s.insurance_product_id
    left join public.branches b on b.id = s.issuing_branch_id
    left join public.cases c on c.id = f.case_id
    where app.flag_visible(f.branch_id)
      and (p_status is null or p_status = 'all' or f.status = p_status)
      and (coalesce(p_view, 'all') <> 'csat_lte_2' or f.csat_score <= 2)
      and (p_rule_key is null or r.key = p_rule_key)
      and (v_ts is null or (f.created_at, f.id) < (v_ts, v_id))
    order by f.created_at desc, f.id desc
    limit v_limit
  ) t;

  return jsonb_build_object('items', v_items, 'counts', v_counts,
    'next_cursor', case when jsonb_array_length(v_items) = v_limit
                        then (v_items -> -1 ->> 'created_at') || '|' || (v_items -> -1 ->> 'id') end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Case RPCs (SPEC §2.4 M11). Each mutating call takes the expected version (P0409 on conflict).
-- ---------------------------------------------------------------------------
create or replace function public.case_create(p_response_id uuid, p_priority text, p_description text,
  p_category_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
begin
  perform app.require_perm('cases.create', true);
  if not app.response_visible(p_response_id) then
    raise exception 'That feedback record doesn''t exist.' using errcode = 'P0002';
  end if;
  v_case := app.case_insert(p_response_id, app.require_priority(p_priority),
    app.require_text(p_description, 3, 4000, 'a description'), p_category_id, 'manual');
  return to_jsonb(v_case);
end;
$$;

create or replace function public.case_assign(p_case_id uuid, p_expected_version int, p_officer_id uuid,
  p_department_id uuid default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_from text;
  v_to text;
  v_dept uuid;
begin
  perform app.require_perm('cases.assign', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.status in ('resolved', 'closed') then
    raise exception 'Resolved or closed cases can''t be reassigned. Reopen the case first.' using errcode = '22023';
  end if;
  if p_officer_id is null and p_department_id is null then
    raise exception 'Choose an officer or a department.' using errcode = '22023';
  end if;
  if p_officer_id is not null and not app.user_has_perm_now(p_officer_id, 'cases.work') then
    raise exception 'That person can''t work on cases. Choose someone with case access.' using errcode = '22023';
  end if;
  if p_department_id is not null and not exists (select 1 from public.departments d where d.id = p_department_id and d.is_active) then
    raise exception 'Choose an active department.' using errcode = '22023';
  end if;
  v_dept := coalesce(p_department_id, (select p.department_id from public.profiles p where p.user_id = p_officer_id),
                     v_case.department_id);
  if p_officer_id is not distinct from v_case.assigned_officer_id and v_dept is not distinct from v_case.department_id then
    raise exception 'The case is already assigned that way.' using errcode = '22023';
  end if;
  v_from := concat_ws(' · ', (select display_name from public.profiles where user_id = v_case.assigned_officer_id),
                      (select name from public.departments where id = v_case.department_id));
  v_to := concat_ws(' · ', (select display_name from public.profiles where user_id = p_officer_id),
                    (select name from public.departments where id = v_dept));

  perform app.case_write(true);
  update public.cases
     set assigned_officer_id = p_officer_id, department_id = v_dept,
         status = case when status = 'new' then 'assigned' else status end
   where id = v_case.id
   returning * into v_case;
  perform app.case_write(false);

  perform app.case_activity(v_case.id, case when nullif(v_from, '') is null then 'assigned' else 'reassigned' end,
    nullif(v_from, ''), v_to, nullif(btrim(coalesce(p_note, '')), ''));
  perform app.case_event('case.assigned', v_case.id,
    jsonb_build_object('officer_id', p_officer_id, 'department_id', v_dept));
  return to_jsonb(v_case);
end;
$$;

create or replace function public.case_start(p_case_id uuid, p_expected_version int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
begin
  perform app.require_perm('cases.work', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.status <> 'assigned' then
    raise exception 'Only an assigned case can be started.' using errcode = '22023';
  end if;
  perform app.case_write(true);
  update public.cases set status = 'in_progress', first_response_at = coalesce(first_response_at, now())
   where id = v_case.id returning * into v_case;
  perform app.case_write(false);
  perform app.case_activity(v_case.id, 'status_changed', 'assigned', 'in_progress');
  return to_jsonb(v_case);
end;
$$;

-- Notes with @mentions (mentioned users must be able to view cases; they get an in-app notice).
create or replace function public.case_add_note(p_case_id uuid, p_body text, p_mentions uuid[] default '{}'::uuid[])
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_body text := app.require_text(p_body, 1, 4000, 'a note');
  v_mentions uuid[];
  v_id bigint;
begin
  perform app.require_perm('cases.work', true);
  select * into v_case from public.cases where id = p_case_id;
  if v_case.id is null or not app.case_visible(v_case.branch_id, v_case.assigned_officer_id, v_case.department_id) then
    raise exception 'Case not found.' using errcode = 'P0002';
  end if;
  if v_case.status = 'closed' then
    raise exception 'This case is closed. Reopen it to add notes.' using errcode = '22023';
  end if;
  v_mentions := array(select distinct m from unnest(coalesce(p_mentions, '{}'::uuid[])) m
                      where m <> auth.uid() and app.user_has_perm_now(m, 'cases.view'));
  v_id := app.case_activity(v_case.id, 'note', null, null, v_body, v_mentions);
  if cardinality(v_mentions) > 0 then
    perform app.case_event('case.mention', v_case.id, jsonb_build_object('user_ids', to_jsonb(v_mentions), 'activity_id', v_id));
  end if;
  return v_id;
end;
$$;

create or replace function public.case_record_investigation(p_case_id uuid, p_expected_version int, p_findings text,
  p_corrective_action text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_findings text := app.require_text(p_findings, 3, 4000, 'the investigation findings');
  v_action text := nullif(btrim(coalesce(p_corrective_action, '')), '');
begin
  perform app.require_perm('cases.work', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.status <> 'in_progress' then
    raise exception 'Start work on the case before recording the investigation.' using errcode = '22023';
  end if;
  perform app.case_activity(v_case.id, 'investigation', null, null, v_findings);
  if v_action is not null then
    perform app.require_text(v_action, 3, 4000, 'the corrective action');
    perform app.case_write(true);
    update public.cases set corrective_action = v_action where id = v_case.id returning * into v_case;
    perform app.case_write(false);
    perform app.case_activity(v_case.id, 'corrective_action', null, null, v_action);
  end if;
  return to_jsonb(v_case);
end;
$$;

-- Escalation path (D-20): officer → department head → CX Administrator → Executive. Independent of status.
create or replace function app.case_escalate_one(p_case public.cases, p_reason text)
returns public.cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
begin
  if p_case.escalation_level >= 3 then
    return p_case;
  end if;
  perform app.case_write(true);
  update public.cases set escalation_level = escalation_level + 1, is_escalated = true
   where id = p_case.id returning * into v_case;
  perform app.case_write(false);
  perform app.case_activity(v_case.id, 'escalated', app.escalation_label(p_case.escalation_level),
    app.escalation_label(v_case.escalation_level), p_reason);
  perform app.case_event('case.escalated', v_case.id, jsonb_build_object('level', v_case.escalation_level));
  return v_case;
end;
$$;
revoke all on function app.case_escalate_one(public.cases, text) from public, anon, authenticated;

create or replace function public.case_escalate(p_case_id uuid, p_expected_version int, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_reason text := app.require_text(p_reason, 3, 1000, 'a reason for escalating');
begin
  perform app.require_perm('cases.work', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.status in ('resolved', 'closed') then
    raise exception 'Resolved or closed cases can''t be escalated.' using errcode = '22023';
  end if;
  if v_case.escalation_level >= 3 then
    raise exception 'This case is already escalated to the Executive level.' using errcode = '22023';
  end if;
  return to_jsonb(app.case_escalate_one(v_case, v_reason));
end;
$$;

create or replace function public.case_de_escalate(p_case_id uuid, p_expected_version int, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_old int;
  v_reason text := app.require_text(p_reason, 3, 1000, 'a reason');
begin
  perform app.require_perm('cases.work', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.escalation_level = 0 then
    raise exception 'This case isn''t escalated.' using errcode = '22023';
  end if;
  v_old := v_case.escalation_level;
  perform app.case_write(true);
  update public.cases set escalation_level = escalation_level - 1, is_escalated = escalation_level - 1 > 0
   where id = v_case.id returning * into v_case;
  perform app.case_write(false);
  perform app.case_activity(v_case.id, 'de_escalated', app.escalation_label(v_old),
    app.escalation_label(v_case.escalation_level), v_reason);
  return to_jsonb(v_case);
end;
$$;

-- Officers, branch managers (own branches, D-21), CX and Executives resolve.
create or replace function public.case_resolve(p_case_id uuid, p_expected_version int, p_resolution_notes text,
  p_corrective_action text default null, p_category_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_notes text := app.require_text(p_resolution_notes, 3, 4000, 'what was done to resolve the case');
  v_action text := nullif(btrim(coalesce(p_corrective_action, '')), '');
begin
  perform app.require_perm('cases.work', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.status <> 'in_progress' then
    raise exception 'Start work on the case before resolving it.' using errcode = '22023';
  end if;
  perform app.case_write(true);
  update public.cases
     set status = 'resolved', resolved_at = now(), resolution_notes = v_notes,
         corrective_action = coalesce(v_action, corrective_action), category_id = coalesce(p_category_id, category_id)
   where id = v_case.id returning * into v_case;
  perform app.case_write(false);
  if v_action is not null then
    perform app.case_activity(v_case.id, 'corrective_action', null, null, v_action);
  end if;
  perform app.case_activity(v_case.id, 'resolved', 'in_progress', 'resolved', v_notes);
  perform app.case_event('case.resolved', v_case.id);
  return to_jsonb(v_case);
end;
$$;

-- Rule 21: only CX Administrators and Executives hold cases.close.
create or replace function public.case_close(p_case_id uuid, p_expected_version int, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
begin
  perform app.require_perm('cases.close', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.status <> 'resolved' then
    raise exception 'Only a resolved case can be closed.' using errcode = '22023';
  end if;
  perform app.case_write(true);
  update public.cases set status = 'closed', closed_at = now() where id = v_case.id returning * into v_case;
  perform app.case_write(false);
  perform app.case_activity(v_case.id, 'closed', 'resolved', 'closed', nullif(btrim(coalesce(p_note, '')), ''));
  return to_jsonb(v_case);
end;
$$;

create or replace function public.case_reopen(p_case_id uuid, p_expected_version int, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_from text;
  v_reason text := app.require_text(p_reason, 5, 1000, 'a reason for reopening');
begin
  perform app.require_perm('cases.reopen', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  v_from := v_case.status;
  if v_case.status = 'resolved' then
    if v_case.resolved_at < now() - interval '30 days' then
      raise exception 'Resolved cases can be reopened within 30 days. Create a new case instead.' using errcode = '22023';
    end if;
  elsif v_case.status = 'closed' then
    if not app.has_role('executive') then
      raise exception 'Only an Executive can reopen a closed case.' using errcode = '42501';
    end if;
  else
    raise exception 'Only resolved or closed cases can be reopened.' using errcode = '22023';
  end if;
  begin
    perform app.case_write(true);
    update public.cases
       set status = 'in_progress', resolved_at = null, closed_at = null, reopen_count = reopen_count + 1
     where id = v_case.id returning * into v_case;
    perform app.case_write(false);
  exception when unique_violation then
    raise exception 'This feedback already has another open case, so this one can''t be reopened.' using errcode = '22023';
  end;
  perform app.case_activity(v_case.id, 'reopened', v_from, 'in_progress', v_reason);
  perform app.case_event('case.reopened', v_case.id);
  return to_jsonb(v_case);
end;
$$;

create or replace function public.case_record_follow_up(p_case_id uuid, p_expected_version int, p_outcome text,
  p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
begin
  perform app.require_perm('cases.work', true);
  if p_outcome is null or p_outcome not in ('not_required', 'contacted_resolved', 'contacted_unresolved', 'unreachable', 'declined') then
    raise exception 'Choose a follow-up outcome.' using errcode = '22023';
  end if;
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.status not in ('in_progress', 'resolved') then
    raise exception 'Follow-up can be recorded while the case is in progress or resolved.' using errcode = '22023';
  end if;
  perform app.case_write(true);
  update public.cases set follow_up_outcome = p_outcome where id = v_case.id returning * into v_case;
  perform app.case_write(false);
  perform app.case_activity(v_case.id, 'follow_up_recorded', null, p_outcome, nullif(btrim(coalesce(p_note, '')), ''));
  return to_jsonb(v_case);
end;
$$;

-- Priority change recomputes the SLA from the case's creation time (D-18).
create or replace function public.case_set_priority(p_case_id uuid, p_expected_version int, p_priority text,
  p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_old text;
  v_policy public.sla_policies;
  v_target timestamptz;
  v_warn timestamptz;
begin
  perform app.require_perm('cases.assign', true);
  v_case := app.case_lock(p_case_id, p_expected_version);
  if v_case.status in ('resolved', 'closed') then
    raise exception 'Reopen the case before changing its priority.' using errcode = '22023';
  end if;
  if v_case.priority = app.require_priority(p_priority) then
    raise exception 'The case already has that priority.' using errcode = '22023';
  end if;
  v_old := v_case.priority;
  select * into v_policy from public.sla_policies where priority = p_priority;
  v_target := app.add_working_days(v_case.created_at, v_policy.target_working_days);
  v_warn := app.add_working_days(v_case.created_at, v_policy.target_working_days * v_policy.warning_pct / 100.0);
  perform app.case_write(true);
  update public.cases
     set priority = p_priority, sla_policy_id = v_policy.id, target_resolution_at = v_target, sla_warning_due_at = v_warn,
         sla_warning_at = case when v_warn > now() then null else sla_warning_at end,
         sla_breached_at = case when v_target > now() then null else sla_breached_at end
   where id = v_case.id returning * into v_case;
  perform app.case_write(false);
  perform app.case_activity(v_case.id, 'priority_changed', v_old, p_priority, nullif(btrim(coalesce(p_reason, '')), ''));
  return to_jsonb(v_case);
end;
$$;

-- ---------------------------------------------------------------------------
-- Consented contact reveal (D-15, Rule 12): pii.view, reason required, audited; officers only on a
-- case assigned to them.
-- ---------------------------------------------------------------------------
create or replace function public.contact_reveal(p_response_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_case uuid;
  v_contact pii.contact_requests;
begin
  perform app.require_perm('pii.view', true);
  v_reason := app.require_text(p_reason, 5, 500, 'a reason for revealing the contact details');
  if not exists (select 1 from survey.responses where id = p_response_id) then
    raise exception 'That feedback record doesn''t exist.' using errcode = 'P0002';
  end if;
  if app.org_scope() then
    select c.id into v_case from public.cases c where c.response_id = p_response_id
     order by (c.status <> 'closed') desc, c.created_at desc limit 1;
  else
    select c.id into v_case from public.cases c
     where c.response_id = p_response_id and c.assigned_officer_id = auth.uid() and c.status <> 'closed'
     limit 1;
    if v_case is null then
      raise exception 'You can reveal contact details only on a case assigned to you.' using errcode = '42501';
    end if;
  end if;
  select * into v_contact from pii.contact_requests where response_id = p_response_id;
  if v_contact.id is null or v_contact.erased_at is not null then
    raise exception 'The customer didn''t share contact details, or they have been erased.' using errcode = 'P0002';
  end if;
  perform audit.append('pii.contact_revealed', 'response', p_response_id::text, null,
    jsonb_build_object('reason', v_reason, 'case_id', v_case));
  if v_case is not null then
    perform app.case_activity(v_case, 'contact_revealed', null, null, v_reason);
  end if;
  return jsonb_build_object('phone', pii.decrypt_field(v_contact.dek_enc, v_contact.phone_e164_enc),
                            'first_name', pii.decrypt_field(v_contact.dek_enc, v_contact.first_name_enc));
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal read RPCs
-- ---------------------------------------------------------------------------
create or replace function app.case_sla_state(p_case public.cases)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_case.status in ('resolved', 'closed') then
      case when p_case.resolved_at <= p_case.target_resolution_at then 'met' else 'missed' end
    when now() >= p_case.target_resolution_at then 'breached'
    when now() >= p_case.sla_warning_due_at then 'warning'
    else 'on_track' end
$$;
grant execute on function app.case_sla_state(public.cases) to authenticated, service_role;

-- Case list / board (S-B4, S-B6). Filters: statuses, priorities, branch_ids, department_ids,
-- officer_ids (text[] / uuid[]), overdue, mine, escalated, unassigned (booleans), q (reference).
create or replace function public.cases_list(p_filters jsonb default '{}'::jsonb, p_cursor text default null,
  p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 300);
  v_ts timestamptz := nullif(split_part(coalesce(p_cursor, ''), '|', 1), '')::timestamptz;
  v_id uuid := nullif(split_part(coalesce(p_cursor, ''), '|', 2), '')::uuid;
  v_items jsonb;
begin
  perform app.require_perm('cases.view', false);
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc, t.id desc), '[]'::jsonb) into v_items
  from (
    select c.id, c.reference, c.status, c.priority, c.is_escalated, c.escalation_level, c.branch_id,
           b.name as branch_name, c.department_id, d.name as department_name, c.assigned_officer_id,
           o.display_name as officer_name, c.created_at, c.target_resolution_at, c.resolved_at, c.version,
           c.status not in ('resolved', 'closed') and c.target_resolution_at < now() as overdue,
           app.case_sla_state(c) as sla_state, r.reference as response_reference, cat.label as category_label,
           left(c.description, 200) as description, c.source
    from public.cases c
    join survey.responses r on r.id = c.response_id
    left join public.branches b on b.id = c.branch_id
    left join public.departments d on d.id = c.department_id
    left join public.profiles o on o.user_id = c.assigned_officer_id
    left join public.case_categories cat on cat.id = c.category_id
    where app.case_visible(c.branch_id, c.assigned_officer_id, c.department_id)
      and (not f ? 'statuses' or c.status in (select jsonb_array_elements_text(f -> 'statuses')))
      and (not f ? 'priorities' or c.priority in (select jsonb_array_elements_text(f -> 'priorities')))
      and (not f ? 'branch_ids' or c.branch_id in (select jsonb_array_elements_text(f -> 'branch_ids')::uuid))
      and (not f ? 'department_ids' or c.department_id in (select jsonb_array_elements_text(f -> 'department_ids')::uuid))
      and (not f ? 'officer_ids' or c.assigned_officer_id in (select jsonb_array_elements_text(f -> 'officer_ids')::uuid))
      and (coalesce((f ->> 'overdue')::boolean, false) = false
           or (c.status not in ('resolved', 'closed') and c.target_resolution_at < now()))
      and (coalesce((f ->> 'mine')::boolean, false) = false or c.assigned_officer_id = auth.uid())
      and (coalesce((f ->> 'escalated')::boolean, false) = false or c.is_escalated)
      and (coalesce((f ->> 'unassigned')::boolean, false) = false or (c.assigned_officer_id is null and c.status = 'new'))
      and (nullif(btrim(coalesce(f ->> 'q', '')), '') is null
           or c.reference ilike '%' || btrim(f ->> 'q') || '%' or r.reference ilike '%' || btrim(f ->> 'q') || '%')
      and (v_ts is null or (c.created_at, c.id) < (v_ts, v_id))
    order by c.created_at desc, c.id desc
    limit v_limit
  ) t;
  return jsonb_build_object('items', v_items,
    'next_cursor', case when jsonb_array_length(v_items) = v_limit
                        then (v_items -> -1 ->> 'created_at') || '|' || (v_items -> -1 ->> 'id') end);
end;
$$;

-- Response summary shown on a case (officers see responses only through their cases).
create or replace function app.response_summary(p_response_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'reference', r.reference, 'submitted_at', r.submitted_at, 'csat_score', r.csat_score,
    'ces_score', r.ces_score, 'nps_score', r.nps_score, 'nps_class', r.nps_class, 'branch_status', r.branch_status,
    'branch_name', b.name, 'channel_label', ch.label, 'product_label', p.label, 'factor_label', f.label,
    'source_code', s.code, 'verification', r.verification, 'contact_consent', r.contact_consent,
    'comment', case when app.has_perm('responses.comment.view') and r.text_redacted_at is null then r.comment end,
    'other_texts', case when app.has_perm('responses.comment.view') and r.text_redacted_at is null then
      jsonb_strip_nulls(jsonb_build_object('channel', r.service_channel_other_text, 'branch', r.issuing_branch_other_text,
        'product', r.insurance_product_other_text, 'factor', r.improvement_other_text)) end,
    'comment_hidden', not app.has_perm('responses.comment.view'),
    'text_redacted', r.text_redacted_at is not null,
    'contact_masked', (select pii.mask_phone(pii.decrypt_field(cr.dek_enc, cr.phone_e164_enc))
                       from pii.contact_requests cr where cr.response_id = r.id and cr.erased_at is null))
  from survey.responses r
  join public.service_channels ch on ch.id = r.service_channel_id
  join public.insurance_products p on p.id = r.insurance_product_id
  join public.survey_sources s on s.id = r.source_id
  left join public.branches b on b.id = r.issuing_branch_id
  left join public.improvement_factors f on f.id = r.improvement_factor_id
  where r.id = p_response_id
$$;
revoke all on function app.response_summary(uuid) from public, anon, authenticated;

create or replace function public.case_detail(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_policy public.sla_policies;
  v_open boolean;
begin
  perform app.require_perm('cases.view', false);
  select * into v_case from public.cases where id = p_case_id;
  if v_case.id is null or not app.case_visible(v_case.branch_id, v_case.assigned_officer_id, v_case.department_id) then
    raise exception 'Case not found.' using errcode = 'P0002';
  end if;
  select * into v_policy from public.sla_policies where id = v_case.sla_policy_id;
  v_open := v_case.status not in ('resolved', 'closed');
  return jsonb_build_object(
    'case', to_jsonb(v_case) || jsonb_build_object(
      'branch_name', (select name from public.branches where id = v_case.branch_id),
      'department_name', (select name from public.departments where id = v_case.department_id),
      'officer_name', (select display_name from public.profiles where user_id = v_case.assigned_officer_id),
      'category_label', (select label from public.case_categories where id = v_case.category_id),
      'escalation_label', app.escalation_label(v_case.escalation_level)),
    'sla', jsonb_build_object(
      'state', app.case_sla_state(v_case), 'target_working_days', v_policy.target_working_days,
      'warning_pct', v_policy.warning_pct,
      'elapsed_working_days', app.working_days_between(v_case.created_at, coalesce(v_case.resolved_at, now())),
      'remaining_working_days', case when v_open then app.working_days_between(now(), v_case.target_resolution_at) end,
      'overdue_working_days', case when v_open and now() > v_case.target_resolution_at
                                   then app.working_days_between(v_case.target_resolution_at, now()) end),
    'response', app.response_summary(v_case.response_id),
    'flags', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'reason', f.reason, 'status', f.status,
                                                           'rule_name', r.name, 'created_at', f.created_at) order by f.created_at)
                       from public.response_flags f join public.flag_rules r on r.id = f.rule_id
                       where f.response_id = v_case.response_id), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'type', a.type, 'from_value', a.from_value,
                              'to_value', a.to_value, 'body', a.body, 'created_at', a.created_at,
                              'actor_name', coalesce(p.display_name, case when a.actor_user_id is null then 'System' end),
                              'mentions', (select coalesce(jsonb_agg(mp.display_name), '[]'::jsonb)
                                           from public.profiles mp where mp.user_id = any (a.mentions))) order by a.id)
                            from public.case_activities a left join public.profiles p on p.user_id = a.actor_user_id
                            where a.case_id = v_case.id), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'assign', app.has_perm('cases.assign') and v_open,
      'work', app.has_perm('cases.work'),
      'close', app.has_perm('cases.close') and v_case.status = 'resolved',
      'reopen', app.has_perm('cases.reopen') and (
        (v_case.status = 'resolved' and v_case.resolved_at >= now() - interval '30 days')
        or (v_case.status = 'closed' and app.has_role('executive'))),
      'reveal', app.has_perm('pii.view') and v_case.has_contact_consent
                and (app.org_scope() or (v_case.assigned_officer_id = auth.uid() and v_case.status <> 'closed'))));
end;
$$;

-- People and departments a case can be assigned to (users with cases.work) and mentioned (cases.view).
create or replace function public.case_people()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('cases.view', false);
  return jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name,
               'department_id', p.department_id,
               'can_work', exists (select 1 from public.user_role_grants g join public.role_permissions rp on rp.role_id = g.role_id
                                   where g.user_id = p.user_id and g.status = 'active' and rp.permission_key = 'cases.work'))
             order by lower(p.display_name))
      from public.profiles p
      where p.status = 'active'
        and exists (select 1 from public.user_role_grants g join public.role_permissions rp on rp.role_id = g.role_id
                    where g.user_id = p.user_id and g.status = 'active' and rp.permission_key = 'cases.view')), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
                             from public.departments d where d.is_active), '[]'::jsonb));
end;
$$;

-- Record drawer panel (RecordCasePanel): flags, linked cases and what the caller may do.
create or replace function public.response_case_panel(p_response_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_consent boolean;
  v_open boolean;
begin
  if not app.response_visible(p_response_id) then
    raise exception 'That feedback record doesn''t exist.' using errcode = 'P0002';
  end if;
  v_consent := exists (select 1 from pii.contact_requests cr where cr.response_id = p_response_id and cr.erased_at is null);
  v_open := exists (select 1 from public.cases c where c.response_id = p_response_id and c.status <> 'closed');
  return jsonb_build_object(
    'flags', case when app.has_perm('flags.view') then coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'reason', f.reason, 'status', f.status, 'rule_name', r.name,
             'suggested_priority', f.suggested_priority, 'dismissal_reason', f.dismissal_reason, 'case_id', f.case_id,
             'created_at', f.created_at) order by f.created_at)
      from public.response_flags f join public.flag_rules r on r.id = f.rule_id
      where f.response_id = p_response_id and app.flag_visible(f.branch_id)), '[]'::jsonb) else '[]'::jsonb end,
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'reference', c.reference, 'status', c.status,
                                                          'priority', c.priority) order by c.created_at desc)
                       from public.cases c
                       where c.response_id = p_response_id
                         and app.case_visible(c.branch_id, c.assigned_officer_id, c.department_id)), '[]'::jsonb),
    'has_contact_consent', v_consent,
    'can_review_flags', app.has_perm('flags.review'),
    'can_create_case', app.has_perm('cases.create') and not v_open,
    'can_reveal', v_consent and app.has_perm('pii.view') and (app.org_scope() or exists (
      select 1 from public.cases c where c.response_id = p_response_id and c.assigned_officer_id = auth.uid()
        and c.status <> 'closed')));
end;
$$;

revoke all on function public.flag_dismiss(uuid[], text), public.flag_convert_to_case(uuid, text, text),
  public.flag_rules_set_keywords(jsonb), public.flags_list(text, text, text, text, int),
  public.case_create(uuid, text, text, uuid), public.case_assign(uuid, int, uuid, uuid, text),
  public.case_start(uuid, int), public.case_add_note(uuid, text, uuid[]),
  public.case_record_investigation(uuid, int, text, text), public.case_escalate(uuid, int, text),
  public.case_de_escalate(uuid, int, text), public.case_resolve(uuid, int, text, text, uuid),
  public.case_close(uuid, int, text), public.case_reopen(uuid, int, text),
  public.case_record_follow_up(uuid, int, text, text), public.case_set_priority(uuid, int, text, text),
  public.contact_reveal(uuid, text), public.cases_list(jsonb, text, int), public.case_detail(uuid),
  public.case_people(), public.response_case_panel(uuid)
  from public, anon;
grant execute on function public.flag_dismiss(uuid[], text), public.flag_convert_to_case(uuid, text, text),
  public.flag_rules_set_keywords(jsonb), public.flags_list(text, text, text, text, int),
  public.case_create(uuid, text, text, uuid), public.case_assign(uuid, int, uuid, uuid, text),
  public.case_start(uuid, int), public.case_add_note(uuid, text, uuid[]),
  public.case_record_investigation(uuid, int, text, text), public.case_escalate(uuid, int, text),
  public.case_de_escalate(uuid, int, text), public.case_resolve(uuid, int, text, text, uuid),
  public.case_close(uuid, int, text), public.case_reopen(uuid, int, text),
  public.case_record_follow_up(uuid, int, text, text), public.case_set_priority(uuid, int, text, text),
  public.contact_reveal(uuid, text), public.cases_list(jsonb, text, int), public.case_detail(uuid),
  public.case_people(), public.response_case_panel(uuid)
  to authenticated;
