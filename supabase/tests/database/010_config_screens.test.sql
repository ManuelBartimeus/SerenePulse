-- MS-03/04/05 configuration screens: branch_directory_summary (T-M02-001…006), survey_version_list,
-- system catalogue rows stay active (T-M03-001…006), settings validation (M17).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa01', 'admin@example.test'),    -- system_admin
  ('00000000-0000-0000-0000-00000000aa02', 'bm-kasoa@example.test'), -- branch manager, Kasoa
  ('00000000-0000-0000-0000-00000000aa03', 'bm-ho@example.test'),    -- branch manager, Ho (suspended)
  ('00000000-0000-0000-0000-00000000aa04', 'exec@example.test'),     -- executive (org scope)
  ('00000000-0000-0000-0000-00000000aa05', 'cx@example.test'),       -- cx_admin
  ('00000000-0000-0000-0000-00000000aa06', 'nobody@example.test');   -- no grants
update public.profiles set status = 'active', must_change_password = false,
  display_name = case user_id
    when '00000000-0000-0000-0000-00000000aa02' then 'Ama Kasoa'
    when '00000000-0000-0000-0000-00000000aa03' then 'Kofi Ho' else 'Staff' end
 where user_id::text like '00000000-0000-0000-0000-00000000aa0%';
update public.profiles set status = 'suspended' where user_id = '00000000-0000-0000-0000-00000000aa03';

insert into public.user_role_grants (user_id, role_id, scope_type, scope_id, status, approved_at)
select u.id::uuid, r.id, case when u.branch is null then 'organisation' else 'branch' end,
       (select id from public.branches where code = u.branch), 'active', now()
from (values ('00000000-0000-0000-0000-00000000aa01', 'system_admin', null),
             ('00000000-0000-0000-0000-00000000aa02', 'branch_manager', 'KASOA'),
             ('00000000-0000-0000-0000-00000000aa03', 'branch_manager', 'HO'),
             ('00000000-0000-0000-0000-00000000aa04', 'executive', null),
             ('00000000-0000-0000-0000-00000000aa05', 'cx_admin', null)) as u(id, role, branch)
join public.roles r on r.key = u.role;

create or replace function pg_temp.claims_for(p_user uuid)
returns text language sql as $$
  select (public.custom_access_token_hook(jsonb_build_object('user_id', p_user,
    'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated'))) -> 'claims')::text
$$;

-- Responses for Kasoa: 3 inside the window (1 unverified), 1 on the first day of the window
-- (Accra midnight), 1 the day before the window, 1 for Ho.
create temporary table t_resp (n int, branch text, submitted timestamptz, verification text);
insert into t_resp values
  (1, 'KASOA', now() - interval '1 hour', 'verified'),
  (2, 'KASOA', now() - interval '3 days', 'verified'),
  (3, 'KASOA', now() - interval '10 days', 'unverified_no_js'),
  (4, 'KASOA', (((now() at time zone 'Africa/Accra')::date - 29)::timestamp at time zone 'Africa/Accra'), 'verified'),
  (5, 'KASOA', (((now() at time zone 'Africa/Accra')::date - 29)::timestamp at time zone 'Africa/Accra') - interval '1 second', 'verified'),
  (6, 'HO', now() - interval '2 days', 'verified');
insert into survey.sessions (id, session_secret_hash, device_id_hash, source_id, survey_version_id, opened_at, status)
select ('00000000-0000-0000-0000-0000000005' || lpad(t.n::text, 2, '0'))::uuid, convert_to('s' || t.n, 'UTF8'),
       convert_to('d' || t.n, 'UTF8'), (select id from public.survey_sources where code = 'sms'),
       (select id from public.survey_versions where status = 'published'), t.submitted - interval '1 minute', 'submitted'
from t_resp t;
insert into survey.responses (reference, session_id, survey_version_id, source_id, service_channel_id, branch_status,
  issuing_branch_id, region_id_at_submission, insurance_product_id, csat_score, ces_score, nps_score, verification,
  opened_at, submitted_at)
select 'FB-2026-9' || lpad(t.n::text, 5, '0'), ('00000000-0000-0000-0000-0000000005' || lpad(t.n::text, 2, '0'))::uuid,
       (select id from public.survey_versions where status = 'published'),
       (select id from public.survey_sources where code = 'sms'),
       (select id from public.service_channels where code = 'WALK_IN'), 'selected', b.id, b.region_id,
       (select id from public.insurance_products where code = 'MOTOR'), 4, 4, 9, t.verification,
       t.submitted - interval '1 minute', t.submitted
from t_resp t join public.branches b on b.code = t.branch;

create temporary table t_out (who text, body jsonb);
grant all on t_out to authenticated;

-- ---------------------------------------------------------------------------
-- branch_directory_summary
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-00000000aa06'), true);
set local role authenticated;
select throws_ok($$select public.branch_directory_summary()$$, '42501', null,
  'T-M02-001 branch_directory_summary refuses users without config.directory or analytics.view');
select throws_ok($$select public.survey_version_list()$$, '42501', null,
  'survey_version_list refuses users without survey permissions');
reset role;

select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-00000000aa01'), true);
set local role authenticated;
insert into t_out select 'admin', public.branch_directory_summary();
reset role;

select is(jsonb_array_length((select body -> 'branches' from t_out where who = 'admin')), 13,
  'T-M02-002 directory administrators see every branch');
select is((select body -> 'period' ->> 'tz' from t_out where who = 'admin'), 'Africa/Accra',
  'the period is stated in Africa/Accra');
select is((select (body -> 'period' ->> 'to')::date - (body -> 'period' ->> 'from')::date from t_out where who = 'admin'),
  29, 'the window is 30 calendar days including today');

create or replace function pg_temp.branch_row(p_who text, p_code text)
returns jsonb language sql as $$
  select e from t_out o, jsonb_array_elements(o.body -> 'branches') e
  where o.who = p_who and (e ->> 'branch_id')::uuid = (select id from public.branches where code = p_code)
$$;
select is((pg_temp.branch_row('admin', 'KASOA') ->> 'responses_30d')::int, 4,
  'T-M02-003 responses in the last 30 days include the first Accra day of the window and exclude the day before');
select is((pg_temp.branch_row('admin', 'KASOA') ->> 'unverified_30d')::int, 1,
  'unverified responses are counted separately');
select is((pg_temp.branch_row('admin', 'HO') ->> 'responses_30d')::int, 1, 'counts are per issuing branch');
select is((pg_temp.branch_row('admin', 'TAMALE') ->> 'responses_30d')::int, 0, 'branches without responses show 0');
select is((pg_temp.branch_row('admin', 'KASOA') ->> 'manager_count')::int, 1,
  'T-M02-004 active branch-scoped manager grants are listed');
select is(pg_temp.branch_row('admin', 'KASOA') -> 'managers' -> 0 ->> 'display_name', 'Ama Kasoa',
  'managers carry their display name');
select is((pg_temp.branch_row('admin', 'HO') ->> 'manager_count')::int, 0,
  'suspended managers are not counted as active');

update public.user_role_grants set status = 'revoked', revoked_at = now()
 where user_id = '00000000-0000-0000-0000-00000000aa02';
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-00000000aa01'), true);
set local role authenticated;
select is((select (e ->> 'manager_count')::int from jsonb_array_elements(public.branch_directory_summary() -> 'branches') e
           where (e ->> 'branch_id')::uuid = (select id from public.branches where code = 'KASOA')), 0,
  'revoked grants are not counted');
reset role;
update public.user_role_grants set status = 'active', revoked_at = null
 where user_id = '00000000-0000-0000-0000-00000000aa02';

select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-00000000aa02'), true);
set local role authenticated;
insert into t_out select 'bm', public.branch_directory_summary();
reset role;
select is((select jsonb_array_length(body -> 'branches') from t_out where who = 'bm'), 1,
  'T-M02-005 branch-scoped analysts see only their own branches');
select is((pg_temp.branch_row('bm', 'KASOA') ->> 'responses_30d')::int, 4, 'their branch counts match');

select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-00000000aa04'), true);
set local role authenticated;
select is(jsonb_array_length(public.branch_directory_summary() -> 'branches'), 13,
  'T-M02-006 organisation-scope analysts see every branch');
reset role;

-- Live re-check: a stale token is not enough once the grant is revoked.
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-00000000aa02'), true);
update public.user_role_grants set status = 'revoked', revoked_at = now()
 where user_id = '00000000-0000-0000-0000-00000000aa02';
set local role authenticated;
select throws_ok($$select public.branch_directory_summary()$$, '42501', null,
  'a revoked user with a still-valid token is refused');
reset role;

-- ---------------------------------------------------------------------------
-- survey_version_list
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-00000000aa05'), true);
set local role authenticated;
select is((public.survey_version_list() -> -1 ->> 'version_no')::int, 1, 'survey_version_list lists v1 (newest first)');
select is(public.survey_version_list() -> -1 ->> 'status', 'published', 'with its status');

-- ---------------------------------------------------------------------------
-- System catalogue rows (cx_admin has config.catalogues)
-- ---------------------------------------------------------------------------
select throws_ok($$update public.service_channels set is_active = false where code = 'OTHER'$$, '22023', null,
  'T-M03-001 the "Other" channel cannot be deactivated');
select throws_ok($$update public.improvement_factors set is_active = false where code = 'NONE'$$, '22023', null,
  'T-M03-002 "Nothing, I am satisfied" cannot be deactivated');
select lives_ok($$update public.insurance_products set is_active = false where code = 'BONDS'$$,
  'T-M03-003 ordinary catalogue rows can be deactivated');
reset role;

-- ---------------------------------------------------------------------------
-- Settings validation (admin has settings.manage)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', pg_temp.claims_for('00000000-0000-0000-0000-00000000aa01'), true);
set local role authenticated;
select throws_ok($$update public.settings set value = '169' where key = 'device_cooldown_hours'$$, '22023', null,
  'T-M17-010 cooldown hours outside 0–168 are rejected (0 = off)');
select throws_ok($$update public.settings set value = '"thirty"' where key = 'minimum_sample'$$, '22023', null,
  'non-numeric minimum sample is rejected with a validation error');
select throws_ok($$update public.settings set value = '["fraud","Fraud"]' where key = 'comment_keywords'$$, '22023', null,
  'duplicate keywords (case-insensitive) are rejected');
select lives_ok($$update public.settings set value = '48' where key = 'device_cooldown_hours';
                 update public.settings set value = '"cx@serene.example"' where key = 'support_email'$$,
  'valid values are saved');
reset role;

select * from finish();
rollback;
