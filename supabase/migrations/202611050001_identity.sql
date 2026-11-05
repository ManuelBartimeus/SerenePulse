-- MS-02 identity and access control (M01): departments, profiles, roles, permissions, grants,
-- JWT claims hook, lockout bookkeeping, admin RPCs, separation of duties, audit triggers.
-- Permission matrix: SPEC M01 (D-21, D-24, D-34). Enforcement model: ADR-0003.

-- ---------------------------------------------------------------------------
-- Departments (case routing, A-132). Directory CRUD UI arrives in MS-03.
-- ---------------------------------------------------------------------------
create table public.departments (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name          text not null,
  head_user_id  uuid,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       int not null default 1
);
comment on table public.departments is 'Departments for case assignment (REQ §8.2). Deactivate, never delete.';
create trigger departments_touch before update on public.departments for each row execute function app.touch_row();

insert into public.departments (code, name) values
  ('CX', 'Customer Experience'), ('UNDERWRITING', 'Underwriting'), ('CLAIMS', 'Claims'),
  ('OPERATIONS', 'Operations'), ('FINANCE', 'Finance'), ('IT_DIGITAL', 'IT / Digital'),
  ('AGENCY', 'Agency & Broker Relations'), ('COMPLIANCE', 'Compliance');

-- ---------------------------------------------------------------------------
-- Roles and permissions
-- ---------------------------------------------------------------------------
create table public.roles (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  description text not null,
  is_system  boolean not null default true,
  -- Branch-scoped roles must be granted per branch; organisation roles see all branches.
  scope      text not null check (scope in ('organisation', 'branch'))
);
comment on table public.roles is 'The six system roles (REQ §9). Not deletable.';

create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  description text not null,
  -- Roles carrying a sensitive permission need a second person to approve the grant (A-68).
  requires_second_approval boolean not null default false
);
comment on table public.permissions is 'Permission catalogue, resource.action keys (SPEC M01).';

create table public.role_permissions (
  role_id        uuid not null references public.roles (id),
  permission_key text not null references public.permissions (key),
  primary key (role_id, permission_key)
);

insert into public.roles (key, name, description, scope) values
  ('executive', 'Executive Administrator', 'Strategic oversight, targets and approvals; sees the whole organisation including consented contact details.', 'organisation'),
  ('branch_manager', 'Branch Manager', 'Improves assigned branches; sees named branch rankings as aggregates only.', 'branch'),
  ('cx_admin', 'Customer Experience Administrator', 'Daily review, central case queue triage and reporting.', 'organisation'),
  ('resolution_officer', 'Feedback Resolution Officer', 'Investigates and resolves assigned cases.', 'organisation'),
  ('system_admin', 'System Administrator', 'Users, configuration, QR points and technical administration.', 'organisation'),
  ('auditor', 'Read-only Auditor', 'Read-only assurance with full audit-log access; contact details masked.', 'organisation');

insert into public.permissions (key, description, requires_second_approval) values
  ('analytics.view', 'View dashboards and analytics', false),
  ('analytics.benchmark.view', 'View company-wide benchmark values', false),
  ('analytics.branch_ranking.view', 'View named branch rankings (aggregates only)', false),
  ('responses.view', 'View feedback records', false),
  ('responses.comment.view', 'View free-text comments', false),
  ('responses.attribution.propose', 'Propose a branch-attribution correction', false),
  ('responses.attribution.approve', 'Approve a branch-attribution correction', false),
  ('pii.view', 'Reveal consented contact details (reason required, audited)', true),
  ('pii.export', 'Include contact details in exports (reason required, audited)', true),
  ('flags.view', 'View flagged responses', false),
  ('flags.review', 'Dismiss or convert flags', false),
  ('flags.configure', 'Configure flag and auto-case toggles', false),
  ('cases.view', 'View cases', false),
  ('cases.create', 'Create cases', false),
  ('cases.assign', 'Assign cases', false),
  ('cases.work', 'Add notes, investigate and resolve cases', false),
  ('cases.close', 'Close cases', false),
  ('cases.reopen', 'Reopen cases', false),
  ('exports.create', 'Create data exports', false),
  ('reports.schedule', 'Schedule reports', false),
  ('targets.manage', 'Manage targets', false),
  ('alerts.manage', 'Manage alert rules', false),
  ('config.directory', 'Manage branches, regions, departments and holidays', false),
  ('config.catalogues', 'Manage channels, products and improvement factors', false),
  ('config.qr_points', 'Manage QR points and posters', false),
  ('survey.edit', 'Edit survey drafts and request publication', false),
  ('survey.publish.approve', 'Approve survey publication', false),
  ('users.manage', 'Invite users and manage role grants', false),
  ('audit.view', 'View configuration audit events', false),
  ('audit.view_all', 'View every audit event', false),
  ('settings.manage', 'Manage system settings', false);

-- SPEC M01 permission matrix. "S" (branch scope) and "A" (assigned cases) are enforced by RLS,
-- not by withholding the permission.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from (values
  ('executive', array['analytics.view','analytics.benchmark.view','analytics.branch_ranking.view','responses.view',
    'responses.comment.view','pii.view','responses.attribution.propose','responses.attribution.approve','flags.view',
    'flags.review','cases.create','cases.assign','cases.work','cases.close','cases.reopen','cases.view','exports.create',
    'pii.export','targets.manage','alerts.manage','flags.configure','reports.schedule','config.catalogues',
    'config.qr_points','survey.publish.approve','audit.view','audit.view_all']),
  ('branch_manager', array['analytics.view','analytics.benchmark.view','analytics.branch_ranking.view','responses.view',
    'responses.comment.view','flags.view','flags.review','cases.create','cases.assign','cases.work','cases.view',
    'exports.create','reports.schedule']),
  ('cx_admin', array['analytics.view','analytics.benchmark.view','analytics.branch_ranking.view','responses.view',
    'responses.comment.view','pii.view','responses.attribution.propose','flags.view','flags.review','cases.create',
    'cases.assign','cases.work','cases.close','cases.reopen','cases.view','exports.create','pii.export',
    'alerts.manage','flags.configure','reports.schedule','config.catalogues','config.qr_points','survey.edit']),
  ('resolution_officer', array['responses.view','responses.comment.view','pii.view','cases.work','cases.view']),
  ('system_admin', array['config.directory','config.catalogues','config.qr_points','survey.edit','users.manage',
    'audit.view','settings.manage']),
  ('auditor', array['analytics.view','analytics.benchmark.view','analytics.branch_ranking.view','responses.view',
    'responses.comment.view','flags.view','cases.view','exports.create','audit.view','audit.view_all'])
) as m(role_key, perms)
join public.roles r on r.key = m.role_key
cross join lateral unnest(m.perms) as p(key);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users) and grants
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id                  uuid primary key references auth.users (id) on delete restrict,
  display_name             text not null default '' check (length(display_name) <= 120),
  status                   text not null default 'invited'
                             check (status in ('invited', 'active', 'suspended', 'deactivated')),
  department_id            uuid references public.departments (id),
  must_change_password     boolean not null default true,
  failed_login_count       int not null default 0,
  locked_until             timestamptz,
  last_login_at            timestamptz,
  last_password_change_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  version                  int not null default 1
);
comment on table public.profiles is 'Staff profile and account state (M01). Never hard-deleted.';
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_row();

alter table public.departments
  add constraint departments_head_fk foreign key (head_user_id) references public.profiles (user_id);

create table public.user_role_grants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (user_id),
  role_id      uuid not null references public.roles (id),
  scope_type   text not null check (scope_type in ('organisation', 'branch')),
  -- FK to public.branches is added in MS-03 when the directory exists.
  scope_id     uuid,
  status       text not null default 'active' check (status in ('pending_approval', 'active', 'revoked', 'rejected')),
  granted_by   uuid references public.profiles (user_id),
  granted_at   timestamptz not null default now(),
  approved_by  uuid references public.profiles (user_id),
  approved_at  timestamptz,
  revoked_by   uuid references public.profiles (user_id),
  revoked_at   timestamptz,
  check ((scope_type = 'organisation') = (scope_id is null)),
  check (approved_by is null or approved_by <> granted_by)
);
comment on table public.user_role_grants is 'Role grants with optional branch scope (REQ §9.2). Revoked, never deleted.';
create unique index user_role_grants_live_uq
  on public.user_role_grants (user_id, role_id, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('active', 'pending_approval');
create index user_role_grants_user_idx on public.user_role_grants (user_id) where status = 'active';

-- New auth users get a profile automatically (invite and seed both create auth users first).
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Claim helpers used by RLS policies and RPCs (ADR-0003).
-- Wrap calls as (select app.has_perm('x')) in policies so they run once per statement.
-- ---------------------------------------------------------------------------
create or replace function app.has_perm(p_key text)
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce((auth.jwt() -> 'app_permissions') ? p_key, false) $$;

create or replace function app.branch_ids()
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(auth.jwt() -> 'app_branch_ids')::uuid), '{}'::uuid[])
$$;

create or replace function app.org_scope()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce((auth.jwt() ->> 'app_org_scope')::boolean, false) $$;

-- Live re-check against the grants table, so a revocation bites before the 15-minute JWT expires.
create or replace function app.user_has_perm_now(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_role_grants g
    join public.role_permissions rp on rp.role_id = g.role_id
    join public.profiles p on p.user_id = g.user_id
    where g.user_id = p_user and g.status = 'active' and rp.permission_key = p_key and p.status = 'active')
$$;

create or replace function app.require_perm(p_key text, p_recheck boolean default false)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not app.has_perm(p_key)
     or (p_recheck and not app.user_has_perm_now(auth.uid(), p_key)) then
    raise exception 'You don''t have permission to do this.' using errcode = '42501', detail = p_key;
  end if;
end;
$$;

grant execute on function app.has_perm(text), app.branch_ids(), app.org_scope(), app.require_perm(text, boolean)
  to authenticated, service_role;
revoke all on function app.user_has_perm_now(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Custom access-token hook (A-119, A-149). Enabled in Auth config:
--   [auth.hook.custom_access_token] uri = "pg-functions://postgres/public/custom_access_token_hook"
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := event -> 'claims';
  v_profile public.profiles%rowtype;
  v_session_started timestamptz;
  v_perms jsonb;
  v_roles jsonb;
  v_branches jsonb;
  v_org boolean;
begin
  select * into v_profile from public.profiles where user_id = v_user;
  if not found or v_profile.status in ('suspended', 'deactivated') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'This account can''t sign in. Please contact your system administrator.'));
  end if;

  -- A locked account can't get a new password session by any route, including direct calls to
  -- the Auth API that bypass auth-sign-in. Refreshes of existing sessions are left alone, so an
  -- attacker can't use a lockout to sign the real user out (A-152).
  if event ->> 'authentication_method' = 'password'
     and v_profile.locked_until is not null and v_profile.locked_until > now() then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 429, 'message', 'Too many attempts. Please wait a few minutes and try again.'));
  end if;

  -- Absolute session lifetime of 12 hours: refreshes after that are refused (UG-02).
  select s.created_at into v_session_started
  from auth.sessions s where s.id = nullif(v_claims ->> 'session_id', '')::uuid;
  if v_session_started is not null and v_session_started < now() - interval '12 hours' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 401, 'message', 'Your session has expired. Please sign in again.'));
  end if;

  select coalesce(jsonb_agg(distinct rp.permission_key), '[]'::jsonb),
         coalesce(jsonb_agg(distinct r.key), '[]'::jsonb),
         coalesce(jsonb_agg(distinct g.scope_id) filter (where g.scope_type = 'branch'), '[]'::jsonb),
         coalesce(bool_or(r.key in ('executive', 'cx_admin', 'auditor')), false)
    into v_perms, v_roles, v_branches, v_org
  from public.user_role_grants g
  join public.roles r on r.id = g.role_id
  left join public.role_permissions rp on rp.role_id = g.role_id
  where g.user_id = v_user and g.status = 'active';

  -- Invited users who have not set a password yet, and users who must change it, get no
  -- permissions: the portal can only show the "Set a new password" screen (F16).
  if v_profile.status = 'invited' or v_profile.must_change_password then
    v_perms := '[]'::jsonb;
  end if;

  v_claims := v_claims
    || jsonb_build_object(
      'app_permissions', v_perms,
      'app_roles', v_roles,
      'app_branch_ids', v_branches,
      'app_org_scope', v_org and not (v_profile.status = 'invited' or v_profile.must_change_password),
      'app_must_change_password', v_profile.must_change_password or v_profile.status = 'invited');
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;
comment on function public.custom_access_token_hook(jsonb) is 'Adds roles, permissions and branch scope to the JWT; refuses suspended users and sessions older than 12 h.';
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Sign-in bookkeeping for the auth-sign-in Edge Function (A-139). service_role only.
-- ---------------------------------------------------------------------------
create table ops.known_devices (
  user_id     uuid not null references public.profiles (user_id),
  device_hmac bytea not null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (user_id, device_hmac)
);
comment on table ops.known_devices is 'Devices a user has signed in from; a new one triggers a security email.';

create or replace function app.hmac(p_value text)
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  select extensions.hmac(convert_to(lower(trim(p_value)), 'UTF8'),
    convert_to(coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'pii_hmac_key'),
                        'local-development-only-hmac-key'), 'UTF8'),
    'sha256')
$$;
revoke all on function app.hmac(text) from public, anon, authenticated;

create or replace function public.auth_sign_in_precheck(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select p.* into v_profile
  from auth.users u join public.profiles p on p.user_id = u.id
  where lower(u.email) = lower(trim(p_email));
  if not found then
    return jsonb_build_object('allowed', true);  -- unknown email: let Auth fail it (enumeration-safe)
  end if;
  if v_profile.status in ('suspended', 'deactivated') then
    return jsonb_build_object('allowed', false, 'reason', 'suspended');
  end if;
  if v_profile.locked_until is not null and v_profile.locked_until > now() then
    return jsonb_build_object('allowed', false, 'reason', 'locked', 'retry_after_seconds',
      ceil(extract(epoch from v_profile.locked_until - now()))::int);
  end if;
  return jsonb_build_object('allowed', true);
end;
$$;

create or replace function public.auth_sign_in_record(p_email text, p_success boolean, p_ip text default null,
                                                      p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count int;
  v_locked timestamptz;
  v_new_device boolean := false;
  v_outcome text;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));

  if v_user is not null and p_success then
    update public.profiles
       set failed_login_count = 0, locked_until = null, last_login_at = now()
     where user_id = v_user;
    if p_device is not null then
      insert into ops.known_devices (user_id, device_hmac) values (v_user, app.hmac(p_device))
      on conflict (user_id, device_hmac) do update set last_seen = now()
      returning (xmax = 0) into v_new_device;
      -- The very first device is not "new" (it is how the account was set up).
      if v_new_device and (select count(*) from ops.known_devices where user_id = v_user) = 1 then
        v_new_device := false;
      end if;
    end if;
    v_outcome := 'success';
  elsif v_user is not null then
    update public.profiles
       set failed_login_count = failed_login_count + 1,
           locked_until = case when failed_login_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end
     where user_id = v_user
     returning failed_login_count, locked_until into v_count, v_locked;
    if v_count >= 5 then
      update public.profiles set failed_login_count = 0 where user_id = v_user;
    end if;
    v_outcome := case when v_locked > now() then 'locked' else 'bad_credentials' end;
  else
    v_outcome := 'bad_credentials';
  end if;

  insert into ops.auth_sign_in_attempts (email_hmac, ip_hmac, outcome)
  values (app.hmac(p_email), case when p_ip is null then null else app.hmac(p_ip) end, v_outcome);

  if v_user is not null then
    perform audit.append('auth.sign_in.' || v_outcome, 'user', v_user::text, null,
      jsonb_build_object('new_device', v_new_device), 'system');
    -- Security emails are delivered by the notifications pipeline (MS-11); queue them now.
    if v_outcome = 'locked' or v_new_device then
      perform pgmq.send('events', jsonb_build_object(
        'type', case when v_outcome = 'locked' then 'security.lockout' else 'security.new_device' end,
        'user_id', v_user, 'at', now()));
    end if;
  end if;

  return jsonb_build_object('outcome', v_outcome, 'new_device', v_new_device,
                            'locked_until', v_locked);
end;
$$;

-- Used by invite-user so that inviting an existing address never re-sends or rewrites grants.
create or replace function public.auth_account_status(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.status from auth.users u join public.profiles p on p.user_id = u.id
  where lower(u.email) = lower(trim(p_email))
$$;
revoke all on function public.auth_account_status(text) from public, anon, authenticated;
grant execute on function public.auth_account_status(text) to service_role;

revoke all on function public.auth_sign_in_precheck(text) from public, anon, authenticated;
revoke all on function public.auth_sign_in_record(text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.auth_sign_in_precheck(text), public.auth_sign_in_record(text, boolean, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create or replace function app.active_system_admin_count(p_excluding_grant uuid default null,
                                                         p_excluding_user uuid default null)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct g.user_id)::int
  from public.user_role_grants g
  join public.roles r on r.id = g.role_id and r.key = 'system_admin'
  join public.profiles p on p.user_id = g.user_id and p.status = 'active'
  where g.status = 'active'
    and (p_excluding_grant is null or g.id <> p_excluding_grant)
    and (p_excluding_user is null or g.user_id <> p_excluding_user)
$$;

create or replace function app.guard_last_system_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'user_role_grants' then
    if old.status = 'active' and new.status <> 'active'
       and exists (select 1 from public.roles r where r.id = old.role_id and r.key = 'system_admin')
       and app.active_system_admin_count(p_excluding_grant => old.id) = 0 then
      raise exception 'The last System Administrator can''t be removed. Grant the role to someone else first.'
        using errcode = 'P0001', detail = 'last_system_admin';
    end if;
  elsif tg_table_name = 'profiles' then
    if old.status = 'active' and new.status in ('suspended', 'deactivated')
       and app.active_system_admin_count(p_excluding_user => old.user_id) = 0
       and exists (select 1 from public.user_role_grants g join public.roles r on r.id = g.role_id
                   where g.user_id = old.user_id and g.status = 'active' and r.key = 'system_admin') then
      raise exception 'The last System Administrator can''t be suspended or deactivated.'
        using errcode = 'P0001', detail = 'last_system_admin';
    end if;
  end if;
  return new;
end;
$$;
create trigger grants_last_sysadmin before update on public.user_role_grants
  for each row execute function app.guard_last_system_admin();
create trigger profiles_last_sysadmin before update on public.profiles
  for each row execute function app.guard_last_system_admin();

-- Grants are never deleted (history); profiles neither.
create or replace function app.reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are never deleted; deactivate or revoke instead.', tg_table_name using errcode = '42501';
end;
$$;
create trigger grants_no_delete before delete on public.user_role_grants for each row execute function app.reject_delete();
create trigger profiles_no_delete before delete on public.profiles for each row execute function app.reject_delete();

-- ---------------------------------------------------------------------------
-- Generic audit trigger (M15). Redacts lockout counters noise; never sees secrets.
-- ---------------------------------------------------------------------------
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id text := coalesce(v_new, v_old) ->> coalesce(tg_argv[0], 'id');
begin
  -- Sign-in bookkeeping on profiles is audited by auth_sign_in_record itself.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and (v_old - array['failed_login_count','locked_until','last_login_at','updated_at','version'])
       = (v_new - array['failed_login_count','locked_until','last_login_at','updated_at','version']) then
    return null;
  end if;
  perform audit.append(
    tg_table_schema || '.' || tg_table_name || '.' || lower(tg_op), tg_table_name, v_id, v_old, v_new);
  return null;
end;
$$;

create trigger profiles_audit after insert or update on public.profiles
  for each row execute function app.audit_row('user_id');
create trigger grants_audit after insert or update on public.user_role_grants
  for each row execute function app.audit_row();
create trigger departments_audit after insert or update on public.departments
  for each row execute function app.audit_row();
create trigger settings_audit after insert or update on public.settings
  for each row execute function app.audit_row('key');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_role_grants enable row level security;

create policy departments_read on public.departments for select to authenticated using (true);
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated using (
  user_id = (select auth.uid())
  or (select app.has_perm('users.manage'))
  or (select app.has_perm('cases.assign'))  -- choosing an officer needs names
);
create policy grants_read on public.user_role_grants for select to authenticated using (
  user_id = (select auth.uid()) or (select app.has_perm('users.manage')) or (select app.has_perm('survey.publish.approve'))
);

-- Settings: replace the MS-01 deny-all history policy and add writes.
drop policy settings_history_read on public.settings_history;
create policy settings_history_read on public.settings_history for select to authenticated
  using ((select app.has_perm('settings.manage')) or (select app.has_perm('audit.view_all')));
create policy settings_update on public.settings for update to authenticated
  using ((select app.has_perm('settings.manage'))) with check ((select app.has_perm('settings.manage')));

-- All identity writes go through the RPCs below.
revoke insert, update, delete on public.departments, public.roles, public.permissions, public.role_permissions,
  public.profiles, public.user_role_grants from anon, authenticated;
revoke insert, delete on public.settings from anon, authenticated;
revoke all on public.departments, public.roles, public.permissions, public.role_permissions,
  public.profiles, public.user_role_grants, public.settings, public.settings_history from anon;
revoke all on ops.known_devices from public, anon, authenticated;
-- Explicit reads, so access never depends on the platform's default privileges (RLS still applies).
grant select on public.departments, public.roles, public.permissions, public.role_permissions,
  public.profiles, public.user_role_grants, public.settings, public.settings_history to authenticated;
grant update on public.settings to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs (portal, user JWT)
-- ---------------------------------------------------------------------------

-- Called after the user sets a new password (first sign-in, invite acceptance, forced change).
create or replace function public.me_complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  update public.profiles
     set must_change_password = false,
         last_password_change_at = now(),
         status = case when status = 'invited' then 'active' else status end
   where user_id = auth.uid() and status in ('invited', 'active');
  perform audit.append('auth.password_changed', 'user', auth.uid()::text);
end;
$$;

create or replace function public.me_update_profile(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  update public.profiles set display_name = left(trim(p_display_name), 120) where user_id = auth.uid();
end;
$$;

-- Replace a user's grants with the given set. Grants carrying a second-approval permission
-- start as pending unless the grantor is an Executive and not the grantee (A-68, D-36).
create or replace function public.admin_set_grants(p_user_id uuid, p_grants jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_role public.roles%rowtype;
  v_scope uuid;
  v_wanted text[] := array[]::text[];
  v_key text;
  v_sensitive boolean;
  v_pending int := 0;
begin
  perform app.require_perm('users.manage', true);
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'That user doesn''t exist.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_grants) <> 'array' then
    raise exception 'Grants must be a list.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_grants) loop
    select * into v_role from public.roles where key = v_item ->> 'role';
    if not found then
      raise exception 'Unknown role %.', v_item ->> 'role' using errcode = '22023';
    end if;
    v_scope := nullif(v_item ->> 'scope_id', '')::uuid;
    if v_role.scope = 'branch' and v_scope is null then
      raise exception 'A % grant needs a branch.', v_role.name using errcode = '22023';
    end if;
    if v_role.scope = 'organisation' and v_scope is not null then
      raise exception 'A % grant applies to the whole organisation and takes no branch.', v_role.name
        using errcode = '22023';
    end if;
    v_key := v_role.id::text || ':' || coalesce(v_scope::text, '');
    v_wanted := array_append(v_wanted, v_key);

    if not exists (select 1 from public.user_role_grants g
                   where g.user_id = p_user_id and g.role_id = v_role.id
                     and g.scope_id is not distinct from v_scope and g.status in ('active', 'pending_approval')) then
      select exists (select 1 from public.role_permissions rp join public.permissions p on p.key = rp.permission_key
                     where rp.role_id = v_role.id and p.requires_second_approval) into v_sensitive;
      insert into public.user_role_grants (user_id, role_id, scope_type, scope_id, status, granted_by,
                                           approved_by, approved_at)
      values (p_user_id, v_role.id, v_role.scope, v_scope,
              case when v_sensitive then 'pending_approval' else 'active' end, v_actor,
              null, case when v_sensitive then null else now() end);
      if v_sensitive then v_pending := v_pending + 1; end if;
    end if;
  end loop;

  update public.user_role_grants g
     set status = 'revoked', revoked_by = v_actor, revoked_at = now()
   where g.user_id = p_user_id and g.status in ('active', 'pending_approval')
     and not (g.role_id::text || ':' || coalesce(g.scope_id::text, '') = any (v_wanted));

  return jsonb_build_object('pending_approval', v_pending);
end;
$$;

create or replace function public.admin_decide_grant(p_grant_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.user_role_grants%rowtype;
begin
  perform app.require_perm('survey.publish.approve', true);  -- Executives approve sensitive grants
  select * into v_grant from public.user_role_grants where id = p_grant_id for update;
  if not found or v_grant.status <> 'pending_approval' then
    raise exception 'That grant is not waiting for approval.' using errcode = 'P0002';
  end if;
  if v_grant.granted_by = auth.uid() or v_grant.user_id = auth.uid() then
    raise exception 'A second person must approve this grant: you requested it or would receive it.'
      using errcode = '42501', detail = 'second_approver_required';
  end if;
  update public.user_role_grants
     set status = case when p_approve then 'active' else 'rejected' end,
         approved_by = auth.uid(), approved_at = now()
   where id = p_grant_id;
end;
$$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('users.manage', true);
  if p_status not in ('active', 'suspended', 'deactivated') then
    raise exception 'Unknown status %.', p_status using errcode = '22023';
  end if;
  if p_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'You can''t suspend or deactivate your own account.' using errcode = '42501';
  end if;
  update public.profiles set status = p_status, failed_login_count = 0, locked_until = null
   where user_id = p_user_id and status <> 'invited';
  if not found then
    raise exception 'That user doesn''t exist or hasn''t accepted the invitation yet.' using errcode = 'P0002';
  end if;
  if p_status <> 'active' then
    -- Revoke every session immediately; the token hook refuses new tokens.
    delete from auth.sessions where user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.admin_unlock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('users.manage', true);
  update public.profiles set failed_login_count = 0, locked_until = null where user_id = p_user_id;
  perform audit.append('auth.unlocked', 'user', p_user_id::text);
end;
$$;

-- Audit log viewer (M15). Users with only audit.view (System Admins) see configuration and
-- account events, not data-access events such as contact reveals.
create or replace function public.audit_log_list(
  p_before_id bigint default null, p_limit int default 50, p_action_prefix text default null,
  p_entity_type text default null, p_actor uuid default null)
returns table (id bigint, occurred_at timestamptz, actor_type text, actor_id uuid, actor_name text,
               action text, entity_type text, entity_id text, before jsonb, after jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('audit.view', true);
  return query
  select l.id, l.occurred_at, l.actor_type, l.actor_id, p.display_name, l.action, l.entity_type, l.entity_id,
         l.before, l.after
  from audit.log l
  left join public.profiles p on p.user_id = l.actor_id
  where (p_before_id is null or l.id < p_before_id)
    and (p_action_prefix is null or l.action like p_action_prefix || '%')
    and (p_entity_type is null or l.entity_type = p_entity_type)
    and (p_actor is null or l.actor_id = p_actor)
    and (app.has_perm('audit.view_all')
         or l.action like 'public.%' or l.action like 'auth.%' or l.action like 'vault.%')
  order by l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.audit_verify()
returns table (ok boolean, checked bigint, first_bad_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('audit.view', true);
  return query select * from audit.verify_chain();
end;
$$;

-- Live permission check for Edge Functions acting on behalf of the caller.
create or replace function public.me_has_perm(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select auth.uid() is not null and app.has_perm(p_key) and app.user_has_perm_now(auth.uid(), p_key) $$;

-- Users list for the admin screen (profiles + email + grants), users.manage only.
create or replace function public.admin_list_users()
returns table (user_id uuid, email text, display_name text, status text, department_id uuid,
               last_login_at timestamptz, locked boolean, grants jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('users.manage', true);
  return query
  select p.user_id, u.email::text, p.display_name, p.status, p.department_id, p.last_login_at,
         coalesce(p.locked_until > now(), false),
         coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'role', r.key, 'role_name', r.name,
                                                       'scope_id', g.scope_id, 'status', g.status,
                                                       'granted_by', g.granted_by) order by r.key)
                   from public.user_role_grants g join public.roles r on r.id = g.role_id
                   where g.user_id = p.user_id and g.status in ('active', 'pending_approval')), '[]'::jsonb)
  from public.profiles p join auth.users u on u.id = p.user_id
  order by p.status, lower(p.display_name), u.email;
end;
$$;

-- Bootstrap: the first System Administrator + Executive (D-23). service_role only; refuses once
-- any System Administrator exists.
create or replace function public.seed_bootstrap_admin(p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.active_system_admin_count() > 0 then
    raise exception 'A System Administrator already exists; use the portal to invite users.'
      using errcode = '42501';
  end if;
  update public.profiles
     set display_name = left(trim(p_display_name), 120), status = 'active', must_change_password = true
   where user_id = p_user_id;
  if not found then
    raise exception 'No profile for that user.' using errcode = 'P0002';
  end if;
  insert into public.user_role_grants (user_id, role_id, scope_type, status, granted_at, approved_at)
  select p_user_id, r.id, 'organisation', 'active', now(), now()
  from public.roles r where r.key in ('system_admin', 'executive');
  perform audit.append('auth.bootstrap_admin', 'user', p_user_id::text, null, null, 'system');
end;
$$;

revoke all on function public.me_complete_password_change(), public.me_update_profile(text),
  public.admin_set_grants(uuid, jsonb), public.admin_decide_grant(uuid, boolean),
  public.admin_set_user_status(uuid, text), public.admin_unlock_user(uuid),
  public.audit_log_list(bigint, int, text, text, uuid), public.audit_verify(), public.admin_list_users(),
  public.me_has_perm(text),
  public.seed_bootstrap_admin(uuid, text)
  from public, anon;
grant execute on function public.me_complete_password_change(), public.me_update_profile(text),
  public.admin_set_grants(uuid, jsonb), public.admin_decide_grant(uuid, boolean),
  public.admin_set_user_status(uuid, text), public.admin_unlock_user(uuid),
  public.audit_log_list(bigint, int, text, text, uuid), public.audit_verify(), public.admin_list_users(),
  public.me_has_perm(text)
  to authenticated;
revoke all on function public.seed_bootstrap_admin(uuid, text) from authenticated;
grant execute on function public.seed_bootstrap_admin(uuid, text) to service_role;
