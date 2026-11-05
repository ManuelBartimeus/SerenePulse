-- D-45: administrators issue invite and password-reset links instead of email.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'nii@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'new@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'active@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'suspended@example.test');
select public.seed_bootstrap_admin('00000000-0000-0000-0000-0000000000a1', 'Nii');
update public.profiles set status = 'active', must_change_password = false
 where user_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2');
update public.profiles set status = 'suspended' where user_id = '00000000-0000-0000-0000-0000000000e3';

create or replace function pg_temp.claims_for(p_user uuid)
returns text language sql as $$
  select (public.custom_access_token_hook(jsonb_build_object('user_id', p_user,
    'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated'))) -> 'claims')::text
$$;

-- Without users.manage.
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-0000000000e2'), true);
set local role authenticated;
select throws_ok($$select public.admin_issue_access_link('00000000-0000-0000-0000-0000000000e1')$$,
  '42501', null, 'users without users.manage cannot issue links');
reset role;

-- As the System Administrator.
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-0000000000a1'), true);
set local role authenticated;
select is(public.admin_issue_access_link('00000000-0000-0000-0000-0000000000e1'),
  '{"email": "new@example.test", "kind": "invite"}'::jsonb, 'a user who has not accepted gets an invite link');
select is(public.admin_issue_access_link('00000000-0000-0000-0000-0000000000e2') ->> 'kind', 'recovery',
  'an active user gets a password-reset link');
select throws_ok($$select public.admin_issue_access_link('00000000-0000-0000-0000-0000000000e3')$$,
  '22023', null, 'no link for a suspended account');
select throws_ok($$select public.admin_issue_access_link('00000000-0000-0000-0000-0000000000a1')$$,
  '22023', null, 'administrators cannot issue a link for their own account');
select throws_ok($$select public.admin_issue_access_link('00000000-0000-0000-0000-0000000000ff')$$,
  'P0002', null, 'unknown users are refused');
reset role;

select is((select count(*)::int from audit.log where action = 'auth.access_link_issued'), 2,
  'every issued link is audited');

select * from finish();
rollback;
