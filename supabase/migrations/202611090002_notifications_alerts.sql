-- MS-11 notifications, email delivery, SLA timers, alerts and case metrics (M11 SLA, M12, M14;
-- D-18, D-30, A-109, A-112, A-129). ops.process_outbox() is the only consumer of pgmq 'events'.
-- Emails are queued in public.email_log and sent by the Edge Function send-email (pg_cron + pg_net,
-- Vault jobs_shared_secret). Email payloads never contain customer contact data or free text.

-- ---------------------------------------------------------------------------
-- Notification catalogue, notifications, preferences
-- ---------------------------------------------------------------------------
create table public.notification_types (
  key              text primary key,
  label            text not null,
  description      text not null,
  email_supported  boolean not null,
  email_default    boolean not null,
  email_locked     boolean not null default false,  -- security emails cannot be turned off (M14)
  sort_order       int not null default 0,
  check (not email_locked or (email_supported and email_default))
);
comment on table public.notification_types is 'Notification events (SPEC NOTIFICATIONS) and whether each can be emailed.';
insert into public.notification_types (key, label, description, email_supported, email_default, email_locked, sort_order) values
  ('case.created', 'New case in the CX queue', 'A case was created automatically, from a flag or manually.', true, true, false, 1),
  ('case.assigned', 'Case assigned to you', 'You or your department were given a case.', true, true, false, 2),
  ('case.reopened', 'Case reopened', 'A case assigned to you was reopened.', true, true, false, 3),
  ('case.sla_warning', 'SLA warning', 'A case reached 75% of its resolution time.', true, true, false, 4),
  ('case.sla_breached', 'SLA breached', 'A case passed its resolution target.', true, true, false, 5),
  ('case.escalated', 'Case escalated to you', 'A case was escalated to your level.', true, true, false, 6),
  ('case.mention', 'Mentioned in a case note', 'Someone mentioned you in a case note.', false, false, false, 7),
  ('case.resolved', 'Case ready to close', 'A case was resolved and can be closed.', false, false, false, 8),
  ('flag.created', 'New flagged feedback', 'Feedback was flagged for review. Emails come as an hourly summary.', true, true, false, 9),
  ('alert.fired', 'Alert fired', 'An alert rule you receive fired.', true, true, false, 10),
  ('report.ready', 'Report ready', 'A scheduled or requested report is ready.', true, true, false, 11),
  ('export.ready', 'Export ready', 'A data export you requested is ready.', true, true, false, 12),
  ('security.lockout', 'Account locked', 'Your account was locked after repeated failed sign-ins.', true, true, true, 20),
  ('security.new_device', 'Sign-in from a new device', 'Your account signed in from a device we haven''t seen.', true, true, true, 21);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (user_id),
  type         text not null,
  title        text not null check (length(title) <= 200),
  body         text check (length(body) <= 2000),
  link         text check (link is null or link ~ '^/'),
  entity_type  text,
  entity_id    text,
  dedupe_key   text unique,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
comment on table public.notifications is 'In-app notification centre (M14, FR-43). Each user sees only their own rows.';
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id        uuid not null references public.profiles (user_id),
  type           text not null references public.notification_types (key),
  email_enabled  boolean not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, type)
);
comment on table public.notification_preferences is 'Per-user email choice per notification type. Missing row = the type''s default.';

create or replace function app.notification_prefs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.notification_types;
begin
  select * into v_type from public.notification_types where key = new.type;
  if v_type.email_locked and not new.email_enabled then
    raise exception 'Security emails can''t be turned off.' using errcode = '22023';
  end if;
  if not v_type.email_supported and new.email_enabled then
    raise exception 'This notification is shown in the portal only.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger notification_preferences_guard before insert or update on public.notification_preferences
  for each row execute function app.notification_prefs_guard();
create trigger notification_preferences_audit after insert or update on public.notification_preferences
  for each row execute function app.audit_row('user_id');

-- ---------------------------------------------------------------------------
-- Email log (daily budget counter, A-129). 'queued' rows are sent by send-email.
-- Compatible with direct inserts of (to_user_id, template, status 'queued', payload) by other modules.
-- ---------------------------------------------------------------------------
create table public.email_log (
  id                   uuid primary key default gen_random_uuid(),
  to_user_id           uuid not null references public.profiles (user_id),
  template             text not null check (template ~ '^[a-z][a-z0-9_]*$'),
  notification_type    text references public.notification_types (key),
  payload              jsonb not null default '{}'::jsonb,
  priority             text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  status               text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts             int not null default 0,
  next_attempt_at      timestamptz not null default now(),
  claimed_at           timestamptz,
  sent_at              timestamptz,
  last_error           text check (length(last_error) <= 1000),
  provider_message_id  text,
  dedupe_key           text unique,
  created_at           timestamptz not null default now()
);
comment on table public.email_log is 'Every staff email and its delivery state (A-129). Payloads hold no contact data or customer text.';
create index email_log_queue_idx on public.email_log (status, next_attempt_at) where status in ('queued', 'sending');
create index email_log_sent_idx on public.email_log (sent_at) where status = 'sent';

create or replace function app.email_log_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.notification_types;
  v_pref boolean;
begin
  if new.notification_type is null then
    select t.key into new.notification_type from public.notification_types t
     where replace(t.key, '.', '_') = new.template;
  end if;
  select * into v_type from public.notification_types where key = new.notification_type;
  if new.template like 'security_%' then
    new.priority := 'high';
  end if;
  if new.status <> 'queued' then
    return new;
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = new.to_user_id and p.status = 'active') then
    new.status := 'skipped';
    new.last_error := 'The recipient''s account is not active.';
  elsif v_type.key is not null and not v_type.email_locked then
    select pr.email_enabled into v_pref from public.notification_preferences pr
     where pr.user_id = new.to_user_id and pr.type = v_type.key;
    if not coalesce(v_pref, v_type.email_default) or not v_type.email_supported then
      new.status := 'skipped';
      new.last_error := 'Email for this notification is turned off in the recipient''s preferences.';
    end if;
  end if;
  return new;
end;
$$;
create trigger email_log_prepare before insert on public.email_log for each row execute function app.email_log_prepare();

alter table public.notification_types enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.email_log enable row level security;
create policy notification_types_read on public.notification_types for select to authenticated using (true);
create policy notifications_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_read on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_preferences_insert on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_preferences_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_preferences_delete on public.notification_preferences for delete to authenticated
  using (user_id = (select auth.uid()));
create policy email_log_read on public.email_log for select to authenticated
  using ((select app.has_perm('settings.manage')) or (select app.has_perm('audit.view_all')));
revoke all on public.notification_types, public.notifications, public.notification_preferences, public.email_log
  from public, anon, authenticated;
grant select on public.notification_types, public.notifications, public.notification_preferences, public.email_log
  to authenticated;
grant insert, delete on public.notification_preferences to authenticated;
-- PostgREST upserts set every column they send; RLS keeps user_id pinned to the caller.
grant update (user_id, type, email_enabled) on public.notification_preferences to authenticated;

-- In-app notice and/or queued email for one user. Dedupe keys make outbox processing idempotent.
create or replace function app.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text,
  p_in_app boolean, p_email boolean, p_dedupe text, p_payload jsonb default '{}'::jsonb, p_priority text default 'normal')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from public.profiles where user_id = p_user and status = 'active') then
    return;
  end if;
  if p_in_app then
    insert into public.notifications (user_id, type, title, body, link, entity_type, entity_id, dedupe_key)
    values (p_user, p_type, left(p_title, 200), left(p_body, 2000), p_link, p_payload ->> 'entity_type',
            p_payload ->> 'entity_id', p_dedupe || ':app')
    on conflict (dedupe_key) do nothing;
  end if;
  if p_email and exists (select 1 from public.notification_types t where t.key = p_type and t.email_supported) then
    insert into public.email_log (to_user_id, template, notification_type, payload, priority, dedupe_key)
    values (p_user, replace(p_type, '.', '_'), p_type,
            jsonb_build_object('subject', left(p_title, 200), 'summary', left(p_body, 2000), 'link', p_link)
              || (coalesce(p_payload, '{}'::jsonb) - 'entity_type' - 'entity_id'),
            p_priority, p_dedupe || ':email')
    on conflict (dedupe_key) do nothing;
  end if;
end;
$$;
revoke all on function app.notify(uuid, text, text, text, text, boolean, boolean, text, jsonb, text) from public, anon, authenticated;

create or replace function public.notifications_mark_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recipients for case events (D-20 escalation path)
-- ---------------------------------------------------------------------------
create or replace function app.case_department_head(p_case public.cases)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select d.head_user_id from public.departments d where d.id = p_case.department_id),
    (select d.head_user_id from public.profiles p join public.departments d on d.id = p.department_id
      where p.user_id = p_case.assigned_officer_id))
$$;

create or replace function app.escalation_recipients(p_case public.cases, p_level int)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case p_level
    when 1 then coalesce(array_remove(array[app.case_department_head(p_case)], null), '{}'::uuid[])
    when 2 then array(select app.users_with_role('cx_admin'))
    when 3 then array(select app.users_with_role('executive'))
    else '{}'::uuid[] end
$$;
revoke all on function app.case_department_head(public.cases), app.escalation_recipients(public.cases, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Alerts (M12)
-- ---------------------------------------------------------------------------
create table public.alert_rules (
  id                        uuid primary key default gen_random_uuid(),
  key                       text unique,
  name                      text not null check (length(name) between 1 and 120),
  type                      text not null check (type in ('csat_decline', 'negative_volume', 'open_cases_increase',
                              'repeated_factor', 'sla_case', 'below_target', 'tech_spike')),
  description               text not null default '',
  params                    jsonb not null default '{}'::jsonb,
  severity                  text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  recipient_roles           text[] not null default '{}'::text[],
  recipient_department_ids  uuid[] not null default '{}'::uuid[],
  recipient_user_ids        uuid[] not null default '{}'::uuid[],
  notify_branch_managers    boolean not null default true,
  cooldown_minutes          int not null default 1440 check (cooldown_minutes between 15 and 43200),
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid,
  updated_by                uuid,
  version                   int not null default 1
);
comment on table public.alert_rules is 'Alert rules with editable parameters and recipients (REQ §13.2, A-27). Email + in-app (D-30).';

create or replace function app.alert_rules_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
  v_required text[] := case new.type
    when 'csat_decline' then array['recent_days', 'baseline_days', 'drop_points', 'min_n']
    when 'negative_volume' then array['hours', 'min_count']
    when 'open_cases_increase' then array['increase_pct', 'min_open']
    when 'repeated_factor' then array['days', 'share_pct', 'min_n']
    when 'tech_spike' then array['days', 'ratio', 'min_n']
    else '{}'::text[] end;
begin
  if tg_op = 'UPDATE' and (new.type is distinct from old.type or new.key is distinct from old.key) then
    raise exception 'An alert rule''s type can''t be changed. Create a new rule instead.' using errcode = '22023';
  end if;
  if jsonb_typeof(new.params) <> 'object' then
    raise exception 'Alert parameters must be an object.' using errcode = '22023';
  end if;
  foreach v_key in array v_required loop
    if jsonb_typeof(new.params -> v_key) <> 'number' or (new.params ->> v_key)::numeric <= 0 then
      raise exception 'Enter a positive number for "%".', replace(v_key, '_', ' ') using errcode = '22023';
    end if;
  end loop;
  if not (new.recipient_roles <@ array['executive', 'branch_manager', 'cx_admin', 'resolution_officer',
                                       'system_admin', 'auditor']) then
    raise exception 'One of the recipient roles is not a known role.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger alert_rules_a_validate before insert or update on public.alert_rules
  for each row execute function app.alert_rules_validate();
create trigger alert_rules_touch before update on public.alert_rules for each row execute function app.touch_row();
create trigger alert_rules_actor before insert or update on public.alert_rules for each row execute function app.stamp_actor();
create trigger alert_rules_audit after insert or update on public.alert_rules for each row execute function app.audit_row();

insert into public.alert_rules (key, name, type, description, params, severity, recipient_roles, recipient_department_ids,
                                notify_branch_managers) values
  ('csat_decline', 'Sudden decline in branch CSAT', 'csat_decline',
   'CSAT % over the recent window is at least the given points below the branch''s preceding baseline; both windows need the minimum n.',
   '{"recent_days": 14, "baseline_days": 90, "drop_points": 10, "min_n": 30}', 'warning', '{cx_admin,executive}', '{}', true),
  ('negative_volume', 'High volume of negative feedback', 'negative_volume',
   'At least the given number of CSAT 1–2 responses for one branch within the window.',
   '{"hours": 24, "min_count": 5}', 'warning', '{cx_admin}', '{}', true),
  ('open_cases_increase', 'Unresolved cases increase', 'open_cases_increase',
   'Open cases grew by the given percentage week on week and are at least the minimum.',
   '{"increase_pct": 50, "min_open": 10}', 'warning', '{cx_admin,executive}', '{}', false),
  ('repeated_factor', 'Repeated improvement factor', 'repeated_factor',
   'One improvement factor makes up at least the given share of a branch''s responses over the window (minimum n).',
   '{"days": 30, "share_pct": 40, "min_n": 30}', 'info', '{cx_admin}', '{}', true),
  ('sla_case', 'SLA approaching / exceeded', 'sla_case',
   'Per case at 75% and 100% of the resolution target. Officers and department heads are told by the case itself; add extra recipients here.',
   '{}', 'warning', '{}', '{}', true),
  ('below_target', 'Below target', 'below_target',
   'A metric is worse than its target over the target''s effective period (needs the minimum sample).',
   '{}', 'warning', '{cx_admin,executive}', '{}', true),
  ('tech_spike', 'Technical issues spike', 'tech_spike',
   '"Technical issues" share for digital channels is at least the given ratio of the prior window (minimum n in both).',
   '{"days": 30, "ratio": 2, "min_n": 30, "factor_code": "TECH", "channel_codes": ["MOBILE_APP", "WEBSITE", "WHATSAPP"]}',
   'warning', '{cx_admin}', '{}', false);
update public.alert_rules set recipient_department_ids = array(select id from public.departments where code = 'IT_DIGITAL')
 where key = 'tech_spike';

create table public.alert_events (
  id                 uuid primary key default gen_random_uuid(),
  rule_id            uuid not null references public.alert_rules (id),
  scope_type         text not null check (scope_type in ('organisation', 'branch', 'case', 'target')),
  scope_id           uuid,
  scope_key          text not null,
  scope_label        text not null,
  branch_id          uuid references public.branches (id),
  observed_value     numeric,
  threshold_value    numeric,
  window_key         text not null,
  window_from        timestamptz,
  window_to          timestamptz,
  detail             jsonb not null default '{}'::jsonb,
  fired_at           timestamptz not null default now(),
  status             text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by    uuid references public.profiles (user_id),
  acknowledged_at    timestamptz,
  resolved_by        uuid references public.profiles (user_id),
  resolved_at        timestamptz,
  resolution_note    text check (length(resolution_note) <= 1000),
  notified_user_ids  uuid[] not null default '{}'::uuid[],
  updated_at         timestamptz not null default now(),
  version            int not null default 1,
  unique (rule_id, scope_key, window_key)
);
comment on table public.alert_events is 'Fired alerts, deduplicated by rule + scope + window, with a per-rule cooldown (M12).';
create index alert_events_rule_scope_idx on public.alert_events (rule_id, scope_key, fired_at desc);
create index alert_events_status_idx on public.alert_events (status, fired_at desc);
create trigger alert_events_touch before update on public.alert_events for each row execute function app.touch_row();
create trigger alert_events_audit after update on public.alert_events for each row execute function app.audit_row();

alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;
create policy alert_rules_read on public.alert_rules for select to authenticated using (true);
create policy alert_rules_insert on public.alert_rules for insert to authenticated
  with check ((select app.has_perm('alerts.manage')));
create policy alert_rules_update on public.alert_rules for update to authenticated
  using ((select app.has_perm('alerts.manage'))) with check ((select app.has_perm('alerts.manage')));
create policy alert_events_read on public.alert_events for select to authenticated
  using ((select app.has_perm('alerts.manage')) or (select auth.uid()) = any (notified_user_ids));
revoke all on public.alert_rules, public.alert_events from public, anon, authenticated;
grant select on public.alert_rules, public.alert_events to authenticated;
grant insert (name, type, description, params, severity, recipient_roles, recipient_department_ids, recipient_user_ids,
              notify_branch_managers, cooldown_minutes, is_active) on public.alert_rules to authenticated;
grant update (name, description, params, severity, recipient_roles, recipient_department_ids, recipient_user_ids,
              notify_branch_managers, cooldown_minutes, is_active) on public.alert_rules to authenticated;

create or replace function app.alert_recipients(p_rule public.alert_rules, p_branch uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct u) filter (where u is not null), '{}'::uuid[]) from (
    select ur as u from unnest(p_rule.recipient_roles) r cross join lateral app.users_with_role(r, p_branch) ur
    union all
    select p.user_id from public.profiles p
     where p.department_id = any (p_rule.recipient_department_ids) and p.status = 'active'
    union all
    select d.head_user_id from public.departments d where d.id = any (p_rule.recipient_department_ids)
    union all
    select p.user_id from public.profiles p where p.user_id = any (p_rule.recipient_user_ids) and p.status = 'active'
    union all
    select ur from app.users_with_role('branch_manager', p_branch) ur
     where p_rule.notify_branch_managers and p_branch is not null
  ) x
$$;

-- Fires an alert unless the same rule + scope fired within the cooldown or this window already fired.
create or replace function app.alert_fire(p_rule public.alert_rules, p_scope_type text, p_scope_id uuid, p_scope_key text,
  p_scope_label text, p_branch uuid, p_observed numeric, p_threshold numeric, p_window_key text,
  p_from timestamptz, p_to timestamptz, p_detail jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.alert_events e
             where e.rule_id = p_rule.id and e.scope_key = p_scope_key
               and e.fired_at > now() - make_interval(mins => p_rule.cooldown_minutes)) then
    return null;
  end if;
  insert into public.alert_events (rule_id, scope_type, scope_id, scope_key, scope_label, branch_id, observed_value,
    threshold_value, window_key, window_from, window_to, detail, notified_user_ids)
  values (p_rule.id, p_scope_type, p_scope_id, p_scope_key, p_scope_label, p_branch, round(p_observed, 2),
    round(p_threshold, 2), p_window_key, p_from, p_to, coalesce(p_detail, '{}'::jsonb), app.alert_recipients(p_rule, p_branch))
  on conflict (rule_id, scope_key, window_key) do nothing
  returning id into v_id;
  if v_id is not null then
    perform pgmq.send('events', jsonb_build_object('type', 'alert.fired', 'alert_event_id', v_id, 'at', now()));
  end if;
  return v_id;
end;
$$;
revoke all on function app.alert_recipients(public.alert_rules, uuid),
  app.alert_fire(public.alert_rules, text, uuid, text, text, uuid, numeric, numeric, text, timestamptz, timestamptz, jsonb)
  from public, anon, authenticated;

-- Metric value for a scope and local-date window (targets, M12 "Below target"). Response metrics use
-- valid (verified) responses and the effective branch (analytics.v_responses_effective).
create or replace function app.metric_value(p_metric text, p_scope_type text, p_scope_id uuid, p_from date, p_to date)
returns table (value numeric, n int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_metric in ('csat_pct', 'csat_avg', 'nps', 'ces_avg', 'negative_rate') then
    return query
    select case p_metric
             when 'csat_pct' then 100.0 * count(*) filter (where v.csat_score >= 4) / nullif(count(*), 0)
             when 'csat_avg' then avg(v.csat_score)::numeric
             when 'nps' then 100.0 * (count(*) filter (where v.nps_score >= 9) - count(*) filter (where v.nps_score <= 6))
                             / nullif(count(*), 0)
             when 'ces_avg' then avg(v.ces_score)::numeric
             else 100.0 * count(*) filter (where v.csat_score <= 2) / nullif(count(*), 0) end,
           count(*)::int
    from analytics.v_responses_effective v
    where v.is_verified and v.local_date between p_from and p_to
      and case p_scope_type
            when 'organisation' then true
            when 'region' then v.region_id = p_scope_id
            when 'branch' then v.issuing_branch_id = p_scope_id
            when 'channel' then v.service_channel_id = p_scope_id
            when 'product' then v.insurance_product_id = p_scope_id
            else false end;
  elsif p_metric = 'completion_rate' then
    -- Sessions carry no branch, channel or product until submitted: organisation scope only.
    return query
    select case when p_scope_type = 'organisation'
                then 100.0 * count(*) filter (where s.status = 'submitted') / nullif(count(*), 0) end,
           case when p_scope_type = 'organisation' then count(*)::int else 0 end
    from survey.sessions s
    where s.interactive_at is not null and (s.interactive_at at time zone 'Africa/Accra')::date between p_from and p_to;
  elsif p_metric in ('resolution_time_days', 'sla_compliance_pct') then
    return query
    select case p_metric
             when 'resolution_time_days' then avg(app.working_days_between(c.created_at, c.resolved_at))
             else 100.0 * count(*) filter (where c.resolved_at <= c.target_resolution_at) / nullif(count(*), 0) end,
           count(*)::int
    from public.cases c
    left join public.branches b on b.id = c.branch_id
    where c.resolved_at is not null and (c.resolved_at at time zone 'Africa/Accra')::date between p_from and p_to
      and case p_scope_type
            when 'organisation' then true
            when 'region' then b.region_id = p_scope_id
            when 'branch' then c.branch_id = p_scope_id
            when 'channel' then c.service_channel_id = p_scope_id
            when 'product' then c.insurance_product_id = p_scope_id
            else false end;
  else
    raise exception 'Unknown metric %.', p_metric using errcode = '22023';
  end if;
end;
$$;
revoke all on function app.metric_value(text, text, uuid, date, date) from public, anon, authenticated;

-- The evaluator (pg_cron every 15 minutes). Returns the number of alerts fired per rule type.
create or replace function ops.evaluate_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.alert_rules;
  r record;
  v_fired int;
  v_out jsonb := '{}'::jsonb;
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_win text := to_char(now() at time zone 'Africa/Accra', 'YYYY-MM-DD');
  v_min int := coalesce((select (s.value #>> '{}')::int from public.settings s where s.key = 'minimum_sample'), 30);
  v_need int;
  p jsonb;
begin
  for v_rule in select * from public.alert_rules where is_active and type <> 'sla_case' order by type, id loop
    v_fired := 0;
    p := v_rule.params;
    if v_rule.type = 'csat_decline' then
      for r in
        with w as (
          select v.issuing_branch_id as branch_id,
                 count(*) filter (where v.submitted_at >= now() - make_interval(days => (p ->> 'recent_days')::int)) as n_recent,
                 count(*) filter (where v.submitted_at >= now() - make_interval(days => (p ->> 'recent_days')::int)
                                    and v.csat_score >= 4) as ok_recent,
                 count(*) filter (where v.submitted_at < now() - make_interval(days => (p ->> 'recent_days')::int)) as n_base,
                 count(*) filter (where v.submitted_at < now() - make_interval(days => (p ->> 'recent_days')::int)
                                    and v.csat_score >= 4) as ok_base
          from analytics.v_responses_effective v
          where v.is_verified and v.issuing_branch_id is not null
            and v.submitted_at >= now() - make_interval(days => (p ->> 'recent_days')::int + (p ->> 'baseline_days')::int)
          group by v.issuing_branch_id)
        select w.branch_id, b.name, 100.0 * w.ok_recent / w.n_recent as recent_pct, 100.0 * w.ok_base / w.n_base as base_pct,
               w.n_recent, w.n_base
        from w join public.branches b on b.id = w.branch_id
        where w.n_recent >= (p ->> 'min_n')::int and w.n_base >= (p ->> 'min_n')::int
          and 100.0 * w.ok_recent / w.n_recent <= 100.0 * w.ok_base / w.n_base - (p ->> 'drop_points')::numeric
      loop
        if app.alert_fire(v_rule, 'branch', r.branch_id, 'branch:' || r.branch_id, r.name, r.branch_id, r.recent_pct,
             r.base_pct - (p ->> 'drop_points')::numeric, v_win,
             now() - make_interval(days => (p ->> 'recent_days')::int), now(),
             jsonb_build_object('n_recent', r.n_recent, 'n_baseline', r.n_base, 'baseline_pct', round(r.base_pct, 1)))
           is not null then
          v_fired := v_fired + 1;
        end if;
      end loop;
    elsif v_rule.type = 'negative_volume' then
      for r in
        select v.issuing_branch_id as branch_id, b.name, count(*) as n
        from analytics.v_responses_effective v join public.branches b on b.id = v.issuing_branch_id
        where v.is_verified and v.csat_score <= 2 and v.submitted_at >= now() - make_interval(hours => (p ->> 'hours')::int)
        group by v.issuing_branch_id, b.name
        having count(*) >= (p ->> 'min_count')::int
      loop
        if app.alert_fire(v_rule, 'branch', r.branch_id, 'branch:' || r.branch_id, r.name, r.branch_id, r.n,
             (p ->> 'min_count')::numeric, v_win, now() - make_interval(hours => (p ->> 'hours')::int), now()) is not null then
          v_fired := v_fired + 1;
        end if;
      end loop;
    elsif v_rule.type = 'open_cases_increase' then
      for r in
        select (select count(*) from public.cases c where c.status in ('new', 'assigned', 'in_progress')) as open_now,
               (select count(*) from public.cases c
                 where c.created_at <= now() - interval '7 days'
                   and (c.resolved_at is null or c.resolved_at > now() - interval '7 days')
                   and (c.closed_at is null or c.closed_at > now() - interval '7 days')) as open_prev
      loop
        if r.open_now >= (p ->> 'min_open')::int
           and r.open_now >= r.open_prev * (1 + (p ->> 'increase_pct')::numeric / 100) then
          if app.alert_fire(v_rule, 'organisation', null, 'organisation', 'Whole organisation', null, r.open_now,
               greatest(ceil(r.open_prev * (1 + (p ->> 'increase_pct')::numeric / 100)), (p ->> 'min_open')::numeric),
               v_win, now() - interval '7 days', now(), jsonb_build_object('open_week_ago', r.open_prev)) is not null then
            v_fired := v_fired + 1;
          end if;
        end if;
      end loop;
    elsif v_rule.type = 'repeated_factor' then
      for r in
        with t as (
          select v.issuing_branch_id as branch_id, count(*) as n
          from analytics.v_responses_effective v
          where v.is_verified and v.issuing_branch_id is not null
            and v.submitted_at >= now() - make_interval(days => (p ->> 'days')::int)
          group by 1),
        fct as (
          select v.issuing_branch_id as branch_id, v.improvement_factor_id as factor_id, count(*) as k
          from analytics.v_responses_effective v
          join public.improvement_factors f on f.id = v.improvement_factor_id and not f.is_none
          where v.is_verified and v.issuing_branch_id is not null
            and v.submitted_at >= now() - make_interval(days => (p ->> 'days')::int)
          group by 1, 2)
        select fct.branch_id, fct.factor_id, b.name as branch_name, f.label, 100.0 * fct.k / t.n as share, t.n
        from fct join t on t.branch_id = fct.branch_id
        join public.branches b on b.id = fct.branch_id join public.improvement_factors f on f.id = fct.factor_id
        where t.n >= (p ->> 'min_n')::int and 100.0 * fct.k / t.n >= (p ->> 'share_pct')::numeric
      loop
        if app.alert_fire(v_rule, 'branch', r.branch_id, 'branch:' || r.branch_id || ':factor:' || r.factor_id,
             r.branch_name || ' — ' || r.label, r.branch_id, r.share, (p ->> 'share_pct')::numeric, v_win,
             now() - make_interval(days => (p ->> 'days')::int), now(),
             jsonb_build_object('factor_id', r.factor_id, 'n', r.n)) is not null then
          v_fired := v_fired + 1;
        end if;
      end loop;
    elsif v_rule.type = 'tech_spike' then
      for r in
        with v as (
          select x.submitted_at >= now() - make_interval(days => (p ->> 'days')::int) as recent,
                 f.code = coalesce(p ->> 'factor_code', 'TECH') as is_tech
          from analytics.v_responses_effective x
          join public.service_channels ch on ch.id = x.service_channel_id
          left join public.improvement_factors f on f.id = x.improvement_factor_id
          where x.is_verified and x.submitted_at >= now() - make_interval(days => 2 * (p ->> 'days')::int)
            and ch.code in (select jsonb_array_elements_text(coalesce(p -> 'channel_codes',
                                                              '["MOBILE_APP","WEBSITE","WHATSAPP"]'::jsonb))))
        select count(*) filter (where recent) as n_recent, count(*) filter (where not recent) as n_prior,
               count(*) filter (where recent and is_tech) as k_recent, count(*) filter (where not recent and is_tech) as k_prior
        from v
      loop
        if r.n_recent >= (p ->> 'min_n')::int and r.n_prior >= (p ->> 'min_n')::int and r.k_prior > 0
           and 1.0 * r.k_recent / r.n_recent >= (p ->> 'ratio')::numeric * r.k_prior / r.n_prior then
          if app.alert_fire(v_rule, 'organisation', null, 'organisation', 'Digital channels', null,
               100.0 * r.k_recent / r.n_recent, (p ->> 'ratio')::numeric * 100.0 * r.k_prior / r.n_prior, v_win,
               now() - make_interval(days => (p ->> 'days')::int), now(),
               jsonb_build_object('n_recent', r.n_recent, 'n_prior', r.n_prior,
                                  'prior_share_pct', round(100.0 * r.k_prior / r.n_prior, 1))) is not null then
            v_fired := v_fired + 1;
          end if;
        end if;
      end loop;
    elsif v_rule.type = 'below_target' and to_regclass('public.targets') is not null then
      for r in
        select distinct on (t.metric, t.scope_type, t.scope_id) t.id, t.metric, t.scope_type, t.scope_id, t.target_value,
               t.direction, t.effective_from, m.value, m.n,
               coalesce(case t.scope_type
                 when 'region' then (select name from public.regions where id = t.scope_id)
                 when 'branch' then (select name from public.branches where id = t.scope_id)
                 when 'channel' then (select label from public.service_channels where id = t.scope_id)
                 when 'product' then (select label from public.insurance_products where id = t.scope_id) end,
                 'Whole organisation') as scope_name
        from public.targets t
        cross join lateral app.metric_value(t.metric, t.scope_type, t.scope_id, t.effective_from, v_today) m
        where t.effective_from <= v_today and (t.effective_to is null or t.effective_to >= v_today)
        order by t.metric, t.scope_type, t.scope_id, t.effective_from desc
      loop
        v_need := v_min;
        if r.metric in ('resolution_time_days', 'sla_compliance_pct') then
          v_need := 5;
        end if;
        if r.value is not null and r.n >= v_need
           and ((r.direction = 'higher_is_better' and r.value < r.target_value)
                or (r.direction = 'lower_is_better' and r.value > r.target_value)) then
          if app.alert_fire(v_rule, 'target', r.id, 'target:' || r.id, r.scope_name || ' · ' || r.metric,
               case when r.scope_type = 'branch' then r.scope_id end, r.value, r.target_value, v_win,
               r.effective_from::timestamptz, now(), jsonb_build_object('metric', r.metric, 'n', r.n, 'direction', r.direction))
             is not null then
            v_fired := v_fired + 1;
          end if;
        end if;
      end loop;
    end if;
    v_out := v_out || jsonb_build_object(v_rule.type, coalesce((v_out ->> v_rule.type)::int, 0) + v_fired);
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- SLA timers (pg_cron every 5 minutes): warning at the policy %, breach → escalate one level (A-112).
-- ---------------------------------------------------------------------------
create or replace function ops.sla_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_rule public.alert_rules;
  v_warn int := 0;
  v_breach int := 0;
begin
  select * into v_rule from public.alert_rules where type = 'sla_case' and is_active order by created_at limit 1;
  for v_case in
    select * from public.cases
     where status in ('new', 'assigned', 'in_progress') and sla_warning_at is null and sla_warning_due_at <= now()
       and target_resolution_at > now()
     order by sla_warning_due_at for update skip locked
  loop
    perform app.case_write(true);
    update public.cases set sla_warning_at = now() where id = v_case.id returning * into v_case;
    perform app.case_write(false);
    perform app.case_activity(v_case.id, 'sla_warning', null, null,
      'The case has used ' || (select warning_pct from public.sla_policies where id = v_case.sla_policy_id)
      || '% of its resolution time.');
    perform app.case_event('case.sla_warning', v_case.id);
    if v_rule.id is not null then
      perform app.alert_fire(v_rule, 'case', v_case.id, 'case:' || v_case.id, v_case.reference, v_case.branch_id, null,
        null, 'warning', v_case.created_at, v_case.target_resolution_at, jsonb_build_object('stage', 'warning'));
    end if;
    v_warn := v_warn + 1;
  end loop;

  for v_case in
    select * from public.cases
     where status in ('new', 'assigned', 'in_progress') and sla_breached_at is null and target_resolution_at <= now()
     order by target_resolution_at for update skip locked
  loop
    perform app.case_write(true);
    update public.cases set sla_breached_at = now(), sla_warning_at = coalesce(sla_warning_at, now())
     where id = v_case.id returning * into v_case;
    perform app.case_write(false);
    perform app.case_activity(v_case.id, 'sla_breached', null, null, 'The resolution target has passed.');
    perform app.case_event('case.sla_breached', v_case.id);
    perform app.case_escalate_one(v_case, 'Automatic escalation: the SLA was breached.');
    if v_rule.id is not null then
      -- A breach is a different window from the warning, so it is not suppressed by the warning's cooldown.
      if not exists (select 1 from public.alert_events e where e.rule_id = v_rule.id and e.scope_key = 'case:' || v_case.id
                     and e.window_key = 'breach') then
        insert into public.alert_events (rule_id, scope_type, scope_id, scope_key, scope_label, branch_id, window_key,
          window_from, window_to, detail, notified_user_ids)
        values (v_rule.id, 'case', v_case.id, 'case:' || v_case.id, v_case.reference, v_case.branch_id, 'breach',
          v_case.created_at, v_case.target_resolution_at, '{"stage":"breach"}'::jsonb,
          app.alert_recipients(v_rule, v_case.branch_id))
        on conflict do nothing;
        perform pgmq.send('events', jsonb_build_object('type', 'alert.fired', 'alert_event_id',
          (select e.id from public.alert_events e where e.rule_id = v_rule.id and e.scope_key = 'case:' || v_case.id
             and e.window_key = 'breach'), 'at', now()));
      end if;
    end if;
    v_breach := v_breach + 1;
  end loop;
  return jsonb_build_object('warnings', v_warn, 'breaches', v_breach);
end;
$$;

-- ---------------------------------------------------------------------------
-- Outbox consumer: the only reader of pgmq 'events'. Each message is dispatched in its own
-- subtransaction; failures are recorded and retried (visibility timeout) up to 5 reads.
-- ---------------------------------------------------------------------------
create table ops.outbox_failures (
  id         bigint generated always as identity primary key,
  msg_id     bigint not null,
  type       text,
  read_ct    int not null,
  error      text not null,
  gave_up    boolean not null,
  at         timestamptz not null default now()
);
comment on table ops.outbox_failures is 'Outbox messages whose dispatch failed; gave_up = archived after 5 attempts.';
revoke all on ops.outbox_failures from public, anon, authenticated;

create or replace function ops.dispatch_event(p_msg_id bigint, p_msg jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p_msg ->> 'type';
  v_case public.cases;
  v_event public.alert_events;
  v_rule public.alert_rules;
  v_actor uuid := nullif(p_msg ->> 'actor_id', '')::uuid;
  v_key text := 'msg:' || p_msg_id;
  v_link text;
  v_users uuid[];
  u uuid;
  v_branch text;
begin
  if v_type = 'response.submitted' then
    return 'archived';
  end if;

  if v_type in ('security.lockout', 'security.new_device') then
    perform app.notify((p_msg ->> 'user_id')::uuid, v_type,
      case v_type when 'security.lockout' then 'Your Serene CX account was locked'
                  else 'New sign-in to your Serene CX account' end,
      case v_type
        when 'security.lockout' then 'After 5 failed sign-in attempts your account is locked for 15 minutes. If this wasn''t you, tell your system administrator.'
        else 'Your account signed in from a new device or browser at '
             || to_char(coalesce((p_msg ->> 'at')::timestamptz, now()) at time zone 'Africa/Accra', 'DD/MM/YYYY HH24:MI')
             || ' (Accra time). If this wasn''t you, change your password and tell your system administrator.' end,
      '/profile', false, true, v_key || ':' || (p_msg ->> 'user_id'), '{}'::jsonb, 'high');
    return 'handled';
  end if;

  if v_type = 'flag.created' then
    v_branch := (select b.name from public.branches b where b.id = nullif(p_msg ->> 'branch_id', '')::uuid);
    v_users := array(select app.users_with_role('cx_admin')
                     union select app.users_with_role('branch_manager', (p_msg ->> 'branch_id')::uuid)
                           where nullif(p_msg ->> 'branch_id', '') is not null);
    foreach u in array v_users loop
      perform app.notify(u, 'flag.created', 'New flagged feedback' || coalesce(' · ' || v_branch, ''),
        'A response was flagged by ' || (p_msg ->> 'flags') || ' rule(s) and is waiting for review.', '/flags',
        true, false, v_key || ':' || u,
        jsonb_build_object('entity_type', 'response', 'entity_id', p_msg ->> 'response_id'));
    end loop;
    return 'handled';
  end if;

  if v_type = 'alert.fired' then
    select * into v_event from public.alert_events where id = (p_msg ->> 'alert_event_id')::uuid;
    if v_event.id is null then
      return 'ignored';
    end if;
    select * into v_rule from public.alert_rules where id = v_event.rule_id;
    foreach u in array v_event.notified_user_ids loop
      perform app.notify(u, 'alert.fired', v_rule.name || ': ' || v_event.scope_label,
        coalesce('Observed ' || v_event.observed_value || coalesce(' against a threshold of ' || v_event.threshold_value, '')
                 || '.', 'The alert condition was met.') || ' Open the alert for details.',
        '/alerts?event=' || v_event.id, true, true, v_key || ':' || u,
        jsonb_build_object('entity_type', 'alert_event', 'entity_id', v_event.id, 'severity', v_rule.severity),
        case when v_rule.severity = 'critical' then 'high' else 'normal' end);
    end loop;
    return 'handled';
  end if;

  if v_type like 'case.%' then
    select * into v_case from public.cases where id = (p_msg ->> 'case_id')::uuid;
    if v_case.id is null then
      return 'ignored';
    end if;
    v_link := '/cases/' || v_case.id;
    case v_type
      when 'case.created' then
        v_users := array(select app.users_with_role('cx_admin'));
      when 'case.assigned' then
        v_users := coalesce(array_remove(array[coalesce(v_case.assigned_officer_id, app.case_department_head(v_case))], null),
                            '{}'::uuid[]);
      when 'case.reopened' then
        v_users := coalesce(array_remove(array[v_case.assigned_officer_id], null), '{}'::uuid[]);
      when 'case.escalated' then
        v_users := app.escalation_recipients(v_case, coalesce((p_msg ->> 'level')::int, v_case.escalation_level));
        if cardinality(v_users) = 0 then
          v_users := array(select app.users_with_role('cx_admin'));  -- no department head: the CX queue owns it
        end if;
      when 'case.mention' then
        v_users := array(select jsonb_array_elements_text(p_msg -> 'user_ids')::uuid);
      when 'case.resolved' then
        v_users := array(select app.users_with_role('cx_admin'));
      when 'case.sla_warning' then
        v_users := array_remove(array[v_case.assigned_officer_id, app.case_department_head(v_case)], null);
      when 'case.sla_breached' then
        v_users := array(select x from unnest(array[v_case.assigned_officer_id, app.case_department_head(v_case)]) x
                         where x is not null union select app.users_with_role('cx_admin'));
      else
        return 'ignored';
    end case;
    foreach u in array coalesce(v_users, '{}'::uuid[]) loop
      continue when u = v_actor;
      perform app.notify(u, v_type,
        case v_type
          when 'case.created' then 'New case ' || v_case.reference || ' (' || v_case.priority || ')'
          when 'case.assigned' then 'Case ' || v_case.reference || ' was assigned to you'
          when 'case.reopened' then 'Case ' || v_case.reference || ' was reopened'
          when 'case.escalated' then 'Case ' || v_case.reference || ' escalated to ' || app.escalation_label(v_case.escalation_level)
          when 'case.mention' then 'You were mentioned on case ' || v_case.reference
          when 'case.resolved' then 'Case ' || v_case.reference || ' is resolved and ready to close'
          when 'case.sla_warning' then 'Case ' || v_case.reference || ' is close to its SLA'
          else 'Case ' || v_case.reference || ' has breached its SLA' end,
        case v_type
          when 'case.sla_warning' then 'Resolve by ' || to_char(v_case.target_resolution_at at time zone 'Africa/Accra', 'DD/MM/YYYY HH24:MI') || ' (Accra time).'
          when 'case.sla_breached' then 'The target was ' || to_char(v_case.target_resolution_at at time zone 'Africa/Accra', 'DD/MM/YYYY HH24:MI') || ' (Accra time). It has been escalated one level.'
          else 'Priority ' || v_case.priority || ', status ' || replace(v_case.status, '_', ' ') || '.' end,
        v_link, true, v_type not in ('case.mention', 'case.resolved'), v_key || ':' || u,
        jsonb_build_object('entity_type', 'case', 'entity_id', v_case.id, 'reference', v_case.reference),
        case when v_type in ('case.sla_breached', 'case.escalated') or v_case.priority = 'P1' then 'high' else 'normal' end);
    end loop;
    return 'handled';
  end if;
  return 'ignored';
end;
$$;

create or replace function ops.process_outbox(p_batch int default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_result text;
  v_err text;
  v_counts jsonb := '{"handled":0,"archived":0,"ignored":0,"failed":0}'::jsonb;
begin
  for m in select * from pgmq.read('events', 120, least(greatest(coalesce(p_batch, 200), 1), 1000)) loop
    begin
      v_result := ops.dispatch_event(m.msg_id, m.message);
      perform pgmq.archive('events', m.msg_id);
    exception when others then
      get stacked diagnostics v_err = message_text;
      v_result := 'failed';
      insert into ops.outbox_failures (msg_id, type, read_ct, error, gave_up)
      values (m.msg_id, m.message ->> 'type', m.read_ct, left(v_err, 1000), m.read_ct >= 5);
      if m.read_ct >= 5 then
        perform pgmq.archive('events', m.msg_id);
      end if;
    end;
    v_counts := jsonb_set(v_counts, array[v_result], to_jsonb((v_counts ->> v_result)::int + 1));
  end loop;
  return v_counts;
end;
$$;

-- Hourly email digest of flag notifications (protects the email budget; low priority, deferred first).
create or replace function ops.send_flag_digests()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to timestamptz := date_trunc('hour', now());
  v_from timestamptz := date_trunc('hour', now()) - interval '1 hour';
  v_n int;
begin
  insert into public.email_log (to_user_id, template, notification_type, payload, priority, dedupe_key)
  select n.user_id, 'flag_digest', 'flag.created',
         jsonb_build_object('subject', count(*) || ' new flagged response' || case when count(*) = 1 then '' else 's' end
                                       || ' to review',
                            'summary', count(*) || ' response' || case when count(*) = 1 then ' was' else 's were' end
                                       || ' flagged between ' || to_char(v_from at time zone 'Africa/Accra', 'HH24:MI')
                                       || ' and ' || to_char(v_to at time zone 'Africa/Accra', 'HH24:MI') || ' (Accra time).',
                            'link', '/flags', 'count', count(*)),
         'low', 'flag.digest:' || n.user_id || ':' || to_char(v_from, 'YYYYMMDDHH24')
  from public.notifications n
  where n.type = 'flag.created' and n.created_at >= v_from and n.created_at < v_to and n.read_at is null
  group by n.user_id
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Email delivery support for the send-email Edge Function (service_role only).
-- ---------------------------------------------------------------------------
create or replace function ops.email_budget()
returns table (budget int, used int, remaining int)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (select coalesce((select (s.value #>> '{}')::int from public.settings s where s.key = 'email_daily_budget'), 90) as budget),
       u as (select count(*)::int as used from public.email_log e
             where e.status in ('sent', 'sending')
               and (coalesce(e.sent_at, e.claimed_at) at time zone 'Africa/Accra')::date = (now() at time zone 'Africa/Accra')::date)
  select b.budget, u.used, greatest(b.budget - u.used, 0) from b, u
$$;

create or replace function public.email_claim(p_limit int default 20, p_budget_cap int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget int;
  v_used int;
  v_left int;
  v_out jsonb;
begin
  select least(b.budget, coalesce(p_budget_cap, b.budget)), b.used into v_budget, v_used from ops.email_budget() b;
  v_left := greatest(v_budget - v_used, 0);
  -- Rows left in 'sending' by a crashed run go back to the queue after 10 minutes.
  update public.email_log set status = 'queued'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';
  if v_left = 0 then
    return '[]'::jsonb;
  end if;
  with picked as (
    select e.id from public.email_log e
     where e.status = 'queued' and e.next_attempt_at <= now()
       and (e.priority <> 'low' or v_left > ceil(v_budget * 0.2))
     order by case e.priority when 'high' then 0 when 'normal' then 1 else 2 end, e.created_at
     limit least(greatest(coalesce(p_limit, 20), 1), 100, v_left)
     for update skip locked),
  claimed as (
    update public.email_log e set status = 'sending', claimed_at = now(), attempts = e.attempts + 1
      from picked where e.id = picked.id
    returning e.*)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'to_email', u.email, 'to_name', p.display_name,
           'template', c.template, 'payload', c.payload, 'attempts', c.attempts) order by c.created_at), '[]'::jsonb)
    into v_out
  from claimed c join auth.users u on u.id = c.to_user_id join public.profiles p on p.user_id = c.to_user_id;
  return v_out;
end;
$$;

create or replace function public.email_report(p_id uuid, p_ok boolean, p_provider_message_id text default null,
  p_error text default null, p_retryable boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.email_log;
begin
  select * into v_row from public.email_log where id = p_id for update;
  if v_row.id is null or v_row.status <> 'sending' then
    return 'ignored';
  end if;
  if p_ok then
    update public.email_log set status = 'sent', sent_at = now(), provider_message_id = left(p_provider_message_id, 200),
           last_error = null where id = p_id;
    return 'sent';
  elsif p_retryable and v_row.attempts < 5 then
    update public.email_log
       set status = 'queued', last_error = left(coalesce(p_error, 'Unknown error'), 1000),
           next_attempt_at = now() + make_interval(mins => power(2, v_row.attempts)::int)
     where id = p_id;
    return 'retry';
  else
    update public.email_log set status = 'failed', last_error = left(coalesce(p_error, 'Unknown error'), 1000) where id = p_id;
    return 'failed';
  end if;
end;
$$;

-- pg_cron → pg_net → send-email, only when something is due. Missing configuration is recorded
-- in ops.job_runs (at most hourly) instead of failing silently.
create or replace function ops.invoke_send_email()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jobs_shared_secret');
  v_url text := (select s.value #>> '{}' from public.settings s where s.key = 'functions_base_url');
begin
  if not exists (select 1 from public.email_log where status = 'queued' and next_attempt_at <= now()) then
    return null;
  end if;
  if v_secret is null or nullif(v_url, '') is null then
    if not exists (select 1 from ops.job_runs where job = 'email.invoke' and started_at > now() - interval '1 hour') then
      insert into ops.job_runs (job, finished_at, status, detail)
      values ('email.invoke', now(), 'failed', jsonb_build_object('reason',
        case when v_secret is null then 'jobs_shared_secret is not in Vault' else 'functions_base_url is not set' end));
    end if;
    return null;
  end if;
  return net.http_post(
    url := v_url || '/send-email',
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-jobs-secret', v_secret),
    timeout_milliseconds := 5000);
end;
$$;

insert into public.settings (key, value, description) values
  ('functions_base_url', '"http://supabase_kong_serene-pulse:8000/functions/v1"',
   'Base URL that scheduled jobs use to call Edge Functions (generate-report, send-email). Hosted: https://<project-ref>.supabase.co/functions/v1.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Alert inbox RPCs
-- ---------------------------------------------------------------------------
create or replace function public.alert_acknowledge(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.alert_events;
begin
  perform app.require_perm('alerts.manage', true);
  update public.alert_events set status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now()
   where id = p_event_id and status = 'open' returning * into v_row;
  if v_row.id is null then
    raise exception 'That alert isn''t open any more.' using errcode = 'P0002';
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.alert_resolve(p_event_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.alert_events;
begin
  perform app.require_perm('alerts.manage', true);
  update public.alert_events
     set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
         resolution_note = nullif(btrim(coalesce(p_note, '')), ''),
         acknowledged_by = coalesce(acknowledged_by, auth.uid()), acknowledged_at = coalesce(acknowledged_at, now())
   where id = p_event_id and status in ('open', 'acknowledged') returning * into v_row;
  if v_row.id is null then
    raise exception 'That alert is already resolved.' using errcode = 'P0002';
  end if;
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Case metrics (M08/REQ §8.5, S-A8) over C's filter semantics, and the overview's "Needs attention".
-- ---------------------------------------------------------------------------
create or replace function public.case_metrics(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_to date := coalesce(nullif(f ->> 'to', '')::date, (now() at time zone 'Africa/Accra')::date);
  v_from date := coalesce(nullif(f ->> 'from', '')::date, v_to - 29);
  v_out jsonb;
begin
  if auth.uid() is not null and not (app.has_perm('cases.view') or app.has_perm('analytics.view')) then
    raise exception 'You don''t have permission to view case metrics.' using errcode = '42501';
  end if;
  with r as (select x.id from analytics.filtered_responses(f) x),
  c as (
    select c.*, app.working_days_between(c.created_at, c.resolved_at) as res_days,
           exists (select 1 from public.case_activities a where a.case_id = c.id and a.type = 'escalated') as ever_escalated
    from public.cases c where c.response_id in (select id from r)),
  agg as (
    select count(*)::int as created,
           count(*) filter (where resolved_at is not null)::int as resolved_n,
           count(*) filter (where status in ('resolved', 'closed'))::int as resolved_or_closed,
           count(*) filter (where resolved_at is not null and resolved_at <= target_resolution_at)::int as within_sla,
           count(*) filter (where ever_escalated)::int as escalated,
           count(*) filter (where status in ('new', 'assigned', 'in_progress'))::int as open_n,
           count(*) filter (where status in ('new', 'assigned', 'in_progress') and target_resolution_at < now())::int as overdue,
           avg(res_days) as mean_days,
           percentile_cont(0.5) within group (order by res_days) filter (where res_days is not null) as median_days
    from c),
  hmacs as (
    select cr.phone_hmac from pii.contact_requests cr where cr.response_id in (select id from r) and cr.erased_at is null),
  rep as (
    select count(*)::int as n_repeat, (select count(distinct phone_hmac) from hmacs)::int as n_customers
    from (
      select cr.phone_hmac
      from pii.contact_requests cr join survey.responses s on s.id = cr.response_id
      where cr.phone_hmac in (select phone_hmac from hmacs) and cr.erased_at is null
        and s.submitted_at >= (v_to - 90)::timestamp at time zone 'Africa/Accra'
        and s.submitted_at < (v_to + 1)::timestamp at time zone 'Africa/Accra'
        and (exists (select 1 from public.response_flags fl where fl.response_id = s.id)
             or exists (select 1 from public.cases cs where cs.response_id = s.id))
      group by cr.phone_hmac having count(*) >= 2) x)
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to, 'tz', 'Africa/Accra'),
    'created', a.created,
    'resolution_time_days', jsonb_build_object('mean', round(a.mean_days, 2), 'median', round(a.median_days::numeric, 2),
                                               'n', a.resolved_n),
    'sla_compliance_pct', jsonb_build_object('value', round(100.0 * a.within_sla / nullif(a.resolved_n, 0), 1), 'n', a.resolved_n),
    'resolution_rate', jsonb_build_object('value', round(100.0 * a.resolved_or_closed / nullif(a.created, 0), 1), 'n', a.created),
    'escalation_rate', jsonb_build_object('value', round(100.0 * a.escalated / nullif(a.created, 0), 1), 'n', a.created),
    'open', a.open_n,
    'overdue', a.overdue,
    'repeat_complaints', jsonb_build_object('value', rp.n_repeat, 'n', rp.n_customers,
                                            'note', 'Among customers who left a number; within 90 days of the period end.'),
    'by_status', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
                  from (select status, count(*)::int as n from c group by status) s),
    'by_priority', (select coalesce(jsonb_agg(jsonb_build_object('priority', p.priority, 'created', p.created,
                      'resolved', p.resolved, 'sla_compliance_pct', p.sla) order by p.priority), '[]'::jsonb)
                    from (select priority, count(*)::int as created, count(*) filter (where resolved_at is not null)::int as resolved,
                                 round(100.0 * count(*) filter (where resolved_at <= target_resolution_at)
                                       / nullif(count(*) filter (where resolved_at is not null), 0), 1) as sla
                          from c group by priority) p),
    'resolution_histogram', (select jsonb_agg(jsonb_build_object('label', b.label, 'n',
                               (select count(*) from c where c.res_days >= b.lo and c.res_days < b.hi)) order by b.lo)
                             from (values ('Under 1 day', 0::numeric, 1::numeric), ('1–2 days', 1, 2), ('2–3 days', 2, 3),
                                          ('3–5 days', 3, 5), ('5–10 days', 5, 10), ('10 days or more', 10, 1e9)) b(label, lo, hi)))
  into v_out
  from agg a, rep rp;
  return v_out;
end;
$$;

create or replace function public.needs_attention()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'open_flags', case when app.has_perm('flags.view') then
      (select count(*)::int from public.response_flags f where f.status = 'open' and app.flag_visible(f.branch_id)) else 0 end,
    'overdue_cases', case when app.has_perm('cases.view') then
      (select count(*)::int from public.cases c
        where c.status in ('new', 'assigned', 'in_progress') and c.target_resolution_at < now()
          and app.case_visible(c.branch_id, c.assigned_officer_id, c.department_id)) else 0 end,
    'fired_alerts', (select count(*)::int from public.alert_events e
                      where e.status = 'open' and (app.has_perm('alerts.manage') or auth.uid() = any (e.notified_user_ids))));
end;
$$;

revoke all on function ops.evaluate_alerts(), ops.sla_tick(), ops.dispatch_event(bigint, jsonb), ops.process_outbox(int),
  ops.send_flag_digests(), ops.email_budget(), ops.invoke_send_email() from public, anon, authenticated;
revoke all on function public.email_claim(int, int), public.email_report(uuid, boolean, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.email_claim(int, int), public.email_report(uuid, boolean, text, text, boolean) to service_role;
revoke all on function public.notifications_mark_read(uuid[]), public.alert_acknowledge(uuid), public.alert_resolve(uuid, text),
  public.case_metrics(jsonb), public.needs_attention() from public, anon;
grant execute on function public.notifications_mark_read(uuid[]), public.alert_acknowledge(uuid), public.alert_resolve(uuid, text),
  public.case_metrics(jsonb), public.needs_attention() to authenticated;
grant execute on function public.case_metrics(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Schedules (UTC = Africa/Accra)
-- ---------------------------------------------------------------------------
select cron.schedule('outbox-process', '* * * * *', 'select ops.process_outbox()');
select cron.schedule('email-send', '* * * * *', 'select ops.invoke_send_email()');
select cron.schedule('sla-tick', '*/5 * * * *', 'select ops.sla_tick()');
select cron.schedule('alerts-evaluate', '*/15 * * * *', 'select ops.evaluate_alerts()');
select cron.schedule('flag-digest', '5 * * * *', 'select ops.send_flag_digests()');
select cron.schedule('notifications-retention', '45 3 * * *',
  $$delete from public.notifications where read_at is not null and created_at < now() - interval '180 days'$$);
