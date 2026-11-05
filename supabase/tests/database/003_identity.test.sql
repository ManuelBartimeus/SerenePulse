-- MS-02 identity and access control: permission matrix (SPEC M01), JWT hook, lockout,
-- separation of duties, last System Administrator guard, RLS, live grant re-check, audit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- ---------------------------------------------------------------------------
-- Fixtures: users created the way invites create them (auth.users insert → profile trigger).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'nii@example.test'),       -- sysadmin + executive
  ('00000000-0000-0000-0000-0000000000a2', 'exec2@example.test'),     -- second executive
  ('00000000-0000-0000-0000-0000000000b1', 'bm@example.test'),        -- branch manager
  ('00000000-0000-0000-0000-0000000000c1', 'cx@example.test'),        -- will request cx_admin
  ('00000000-0000-0000-0000-0000000000d1', 'nobody@example.test');    -- no grants

create temporary table t_ids (k text primary key, id uuid);
insert into t_ids values
  ('nii', '00000000-0000-0000-0000-0000000000a1'), ('exec2', '00000000-0000-0000-0000-0000000000a2'),
  ('bm', '00000000-0000-0000-0000-0000000000b1'), ('cx', '00000000-0000-0000-0000-0000000000c1'),
  ('nobody', '00000000-0000-0000-0000-0000000000d1'), ('branch', '00000000-0000-0000-0000-00000000b0b0');
grant select on t_ids to authenticated;

select is((select status from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1'), 'invited',
  'a new auth user gets an invited profile automatically');

select lives_ok($$select public.seed_bootstrap_admin('00000000-0000-0000-0000-0000000000a1', 'Nii')$$,
  'bootstrap creates the first System Administrator + Executive');
select throws_ok($$select public.seed_bootstrap_admin('00000000-0000-0000-0000-0000000000a2', 'Other')$$,
  '42501', null, 'bootstrap refuses once a System Administrator exists');

update public.profiles set status = 'active', must_change_password = false
 where user_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2',
                   '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1',
                   '00000000-0000-0000-0000-0000000000d1');
insert into public.user_role_grants (user_id, role_id, scope_type, scope_id, status, approved_at)
select '00000000-0000-0000-0000-0000000000a2'::uuid, id, 'organisation', null::uuid, 'active', now()
from public.roles where key = 'executive'
union all
select '00000000-0000-0000-0000-0000000000b1'::uuid, id, 'branch', '00000000-0000-0000-0000-00000000b0b0'::uuid,
       'active', now()
from public.roles where key = 'branch_manager';

-- Claims exactly as the hook would mint them.
create or replace function pg_temp.claims_for(p_user uuid)
returns text language sql as $$
  select (public.custom_access_token_hook(jsonb_build_object('user_id', p_user,
    'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated'))) -> 'claims')::text
$$;

-- ---------------------------------------------------------------------------
-- Permission matrix (SPEC M01)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select r.key, count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
    group by r.key order by r.key$$,
  $$values ('auditor', 10), ('branch_manager', 13), ('cx_admin', 23), ('executive', 27),
           ('resolution_officer', 5), ('system_admin', 7)$$,
  'each role has the number of permissions in the SPEC matrix');

create or replace function pg_temp.role_has(p_role text, p_perm text)
returns boolean language sql as $$
  select exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
                 where r.key = p_role and rp.permission_key = p_perm)
$$;
select ok(not pg_temp.role_has('branch_manager', 'cases.close'), 'branch managers cannot close cases (D-21)');
select ok(pg_temp.role_has('branch_manager', 'cases.work'), 'branch managers can resolve cases (D-21)');
select ok(not pg_temp.role_has('branch_manager', 'pii.view'), 'branch managers never see contact details');
select ok(pg_temp.role_has('branch_manager', 'analytics.branch_ranking.view'), 'branch managers see named rankings (D-24)');
select ok(not pg_temp.role_has('auditor', 'pii.view'), 'auditors see contact details masked only');
select ok(not pg_temp.role_has('system_admin', 'analytics.view') and not pg_temp.role_has('system_admin', 'pii.view'),
  'system administrators get no analytics or contact details by default (A-68)');
select ok(not pg_temp.role_has('resolution_officer', 'analytics.view'), 'officers see case data only');
select ok(pg_temp.role_has('executive', 'pii.view'), 'executives see consented contact details (D-24)');
select ok(pg_temp.role_has('executive', 'targets.manage') and not pg_temp.role_has('cx_admin', 'targets.manage'),
  'only executives manage targets');

-- ---------------------------------------------------------------------------
-- Access-token hook
-- ---------------------------------------------------------------------------
select ok(pg_temp.claims_for('00000000-0000-0000-0000-0000000000a1')::jsonb -> 'app_permissions' ? 'users.manage',
  'claims carry the union of a user''s role permissions');
select is((pg_temp.claims_for('00000000-0000-0000-0000-0000000000a1')::jsonb ->> 'app_org_scope')::boolean, true,
  'executives get organisation scope');
select is(pg_temp.claims_for('00000000-0000-0000-0000-0000000000b1')::jsonb -> 'app_branch_ids',
  '["00000000-0000-0000-0000-00000000b0b0"]'::jsonb, 'branch managers get their branch ids');
select is((pg_temp.claims_for('00000000-0000-0000-0000-0000000000b1')::jsonb ->> 'app_org_scope')::boolean, false,
  'branch managers do not get organisation scope');

update public.profiles set must_change_password = true where user_id = '00000000-0000-0000-0000-0000000000a2';
select is(pg_temp.claims_for('00000000-0000-0000-0000-0000000000a2')::jsonb -> 'app_permissions', '[]'::jsonb,
  'a user who must change their password gets no permissions');
update public.profiles set must_change_password = false where user_id = '00000000-0000-0000-0000-0000000000a2';

update public.profiles set status = 'suspended' where user_id = '00000000-0000-0000-0000-0000000000d1';
select is((public.custom_access_token_hook(jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000d1',
  'claims', jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000d1'))) -> 'error' ->> 'http_code'), '403',
  'suspended users are refused a token');
update public.profiles set status = 'active' where user_id = '00000000-0000-0000-0000-0000000000d1';

insert into auth.sessions (id, user_id, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1',
        now() - interval '13 hours', now());
select is((public.custom_access_token_hook(jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000a1',
  'claims', jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000a1',
                               'session_id', '00000000-0000-0000-0000-00000000e001'))) -> 'error' ->> 'http_code'),
  '401', 'sessions older than 12 hours cannot be refreshed (UG-02)');

-- ---------------------------------------------------------------------------
-- Lockout (A-139)
-- ---------------------------------------------------------------------------
select public.auth_sign_in_record('bm@example.test', false) from generate_series(1, 4);
select is((public.auth_sign_in_precheck('bm@example.test') ->> 'allowed')::boolean, true,
  'four failures do not lock the account');
select is(public.auth_sign_in_record('bm@example.test', false) ->> 'outcome', 'locked', 'the fifth failure locks it');
select is(public.auth_sign_in_precheck('bm@example.test') ->> 'reason', 'locked', 'a locked account is refused');
select is((public.auth_sign_in_precheck('unknown@example.test') ->> 'allowed')::boolean, true,
  'unknown emails are not distinguishable at precheck (enumeration-safe)');
select ok((select count(*) from pgmq.q_events where message ->> 'type' = 'security.lockout') = 1,
  'a lockout queues a security email');
update public.profiles set locked_until = null where user_id = '00000000-0000-0000-0000-0000000000b1';
select is(public.auth_sign_in_record('bm@example.test', true, null, 'device-1') ->> 'new_device', 'false',
  'the first device is not reported as new');
select is(public.auth_sign_in_record('bm@example.test', true, null, 'device-2') ->> 'new_device', 'true',
  'a second device is reported as new');

-- ---------------------------------------------------------------------------
-- As a signed-in user (RLS + RPC checks)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-0000000000d1'), true);
set local role authenticated;
select is((select count(*)::int from public.profiles), 1, 'a user without users.manage sees only their own profile');
select throws_ok($$select * from public.admin_list_users()$$, '42501', null, 'admin RPCs refuse users without users.manage');
select throws_ok($$update public.profiles set status = 'active'$$, '42501', null, 'profiles cannot be written directly');
reset role;

-- Nii (System Admin + Executive) grants roles.
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-0000000000a1'), true);
set local role authenticated;
select is((select count(*)::int from public.admin_list_users()), 5, 'System Administrators list all users');
select is(public.admin_set_grants('00000000-0000-0000-0000-0000000000d1',
  '[{"role":"auditor"}]'::jsonb) ->> 'pending_approval', '0', 'a non-sensitive role is granted immediately');
select is(public.admin_set_grants('00000000-0000-0000-0000-0000000000c1',
  '[{"role":"cx_admin"}]'::jsonb) ->> 'pending_approval', '0',
  'a role with pii.view is also granted immediately (second approval removed, revision Q)');
select throws_ok(
  $$select public.admin_set_grants('00000000-0000-0000-0000-0000000000a1', '[{"role":"executive"}]'::jsonb)$$,
  'P0001', null, 'removing the last System Administrator grant is refused');
reset role;

select is((select g.status from public.user_role_grants g join public.roles r on r.id = g.role_id
           where g.user_id = '00000000-0000-0000-0000-0000000000c1' and r.key = 'cx_admin'), 'active',
  'the sensitive grant is active straight away');
select is((select count(*)::int from public.permissions where requires_second_approval), 0,
  'no permission requires a second approver any more');
select is((select count(*)::int from public.user_role_grants where status = 'pending_approval'), 0,
  'no grant is left waiting for approval');

-- A revoked grant stops working before the JWT expires (A-133).
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-0000000000a1'), true);
update public.user_role_grants g set status = 'revoked', revoked_at = now()
  from public.roles r
 where r.id = g.role_id and g.user_id = '00000000-0000-0000-0000-0000000000a1' and r.key = 'executive';
set local role authenticated;
select lives_ok($$select * from public.admin_list_users()$$, 'still-held permissions keep working');
-- survey.publish.approve came only from the revoked Executive grant.
select throws_ok($$select public.admin_decide_grant('00000000-0000-0000-0000-000000000000', true)$$, '42501', null,
  'a permission from a revoked grant is refused even though the JWT still lists it');
reset role;

select ok((select count(*) from audit.log where action = 'public.user_role_grants.insert') >= 3,
  'grant changes are written to the audit log');
select is((select ok from audit.verify_chain()), true, 'the audit chain still verifies');

select * from finish();
rollback;
