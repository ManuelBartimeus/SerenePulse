-- 043 attribution corrections (FR-41, MS-13: T-M10-001, T-M10-002) and the operations page (M17).
-- Generated layout: shared fixtures first, then the assertions.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Fixtures shared by the stream-E tests (040–043). Users get claims exactly as the hook mints them.
-- Depends on streams C (analytics) and D (cases, notifications) migrations; no stand-ins.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e001', 'exec1@example.test'),
  ('00000000-0000-0000-0000-00000000e002', 'exec2@example.test'),
  ('00000000-0000-0000-0000-00000000e003', 'cx@example.test'),
  ('00000000-0000-0000-0000-00000000e004', 'bm@example.test'),
  ('00000000-0000-0000-0000-00000000e005', 'bm2@example.test'),
  ('00000000-0000-0000-0000-00000000e006', 'aud@example.test'),
  ('00000000-0000-0000-0000-00000000e007', 'sa@example.test'),
  ('00000000-0000-0000-0000-00000000e008', 'cx2@example.test');
update public.profiles set status = 'active', must_change_password = false,
       display_name = split_part((select email from auth.users u where u.id = user_id), '@', 1)
 where user_id::text like '00000000-0000-0000-0000-00000000e0%';

create temporary table t (k text primary key, id uuid);
insert into t values
  ('exec1', '00000000-0000-0000-0000-00000000e001'), ('exec2', '00000000-0000-0000-0000-00000000e002'),
  ('cx', '00000000-0000-0000-0000-00000000e003'), ('bm', '00000000-0000-0000-0000-00000000e004'),
  ('bm2', '00000000-0000-0000-0000-00000000e005'), ('aud', '00000000-0000-0000-0000-00000000e006'),
  ('sa', '00000000-0000-0000-0000-00000000e007'), ('cx2', '00000000-0000-0000-0000-00000000e008');
insert into t select 'branch_a', id from public.branches where is_active order by code limit 1;
insert into t select 'branch_b', id from public.branches where is_active order by code offset 1 limit 1;
grant select on t to authenticated;

insert into public.user_role_grants (user_id, role_id, scope_type, scope_id, status, approved_at)
select u.id, r.id, case when r.key = 'branch_manager' then 'branch' else 'organisation' end,
       case u.k when 'bm' then (select id from t where k = 'branch_a') when 'bm2' then (select id from t where k = 'branch_b') end,
       'active', now()
from t u join public.roles r on r.key = case u.k when 'exec1' then 'executive' when 'exec2' then 'executive'
  when 'cx' then 'cx_admin' when 'cx2' then 'cx_admin' when 'bm' then 'branch_manager' when 'bm2' then 'branch_manager'
  when 'aud' then 'auditor' when 'sa' then 'system_admin' end;

create or replace function pg_temp.as_user(p_key text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (public.custom_access_token_hook(jsonb_build_object(
    'user_id', (select id from t where k = p_key),
    'claims', jsonb_build_object('sub', (select id from t where k = p_key), 'role', 'authenticated'))) -> 'claims')::text, true);
end $$;
grant execute on function pg_temp.as_user(text) to authenticated;

create or replace function pg_temp.uid(p_key text) returns uuid language sql as $$ select id from t where k = p_key $$;
grant execute on function pg_temp.uid(text) to authenticated;

-- A submitted response (and its session), optionally with consented contact details.
create sequence pg_temp.ref_seq start 9900001; -- references no real row uses
create or replace function pg_temp.mk_response(p_branch uuid, p_at timestamptz, p_comment text default null,
                                               p_phone text default null)
returns uuid language plpgsql as $$
declare
  v_session uuid;
  v_id uuid;
  v_version uuid := (select id from public.survey_versions where status = 'published' limit 1);
  v_source uuid := (select id from public.survey_sources where code = 'direct');
begin
  insert into survey.sessions (session_secret_hash, device_id_hash, source_id, survey_version_id, opened_at, status)
  values (extensions.gen_random_bytes(16), extensions.gen_random_bytes(16), v_source, v_version, p_at - interval '1 minute',
          'submitted') returning id into v_session;
  insert into survey.responses (reference, session_id, survey_version_id, source_id, service_channel_id, branch_status,
    issuing_branch_id, region_id_at_submission, insurance_product_id, csat_score, ces_score, nps_score,
    improvement_other_text, comment, contact_consent, opened_at, interactive_at, submitted_at, completion_duration_ms)
  values ('FB-' || to_char(p_at, 'YYYY') || '-' || nextval('pg_temp.ref_seq')::text, v_session, v_version,
    v_source, (select id from public.service_channels order by sort_order limit 1),
    case when p_branch is null then 'not_provided' else 'selected' end, p_branch,
    (select region_id from public.branches where id = p_branch),
    (select id from public.insurance_products order by sort_order limit 1), 4, 2, 9,
    case when p_comment is not null then 'other text' end, p_comment, p_phone is not null,
    p_at - interval '1 minute', p_at - interval '50 seconds', p_at, 40000)
  returning id into v_id;
  if p_phone is not null then
    insert into pii.contact_requests (response_id, phone_e164_enc, phone_hmac, first_name_enc, dek_enc, consent_text_version)
    select v_id, e.phone_enc, app.hmac('phone:' || p_phone), e.first_name_enc, e.dek_enc, 'v1'
    from pii.encrypt_contact(p_phone, 'Ama') e;
  end if;
  return v_id;
end $$;

create temporary table v (k text primary key, j jsonb);
grant all on v to authenticated;
insert into v select 'r', to_jsonb(pg_temp.mk_response(pg_temp.uid('branch_a'), now() - interval '3 days', 'ok'));
create or replace function pg_temp.rid() returns uuid language sql as $$ select (j #>> '{}')::uuid from v where k = 'r' $$;
grant execute on function pg_temp.rid() to authenticated;
create or replace function pg_temp.code(p text) returns text language sql as $$ select code from public.branches where id = pg_temp.uid(p) $$;
grant execute on function pg_temp.code(text) to authenticated;

-- Proposals
select pg_temp.as_user('bm');
set local role authenticated;
select throws_ok(format($$select public.response_propose_correction(%L, %L, 'Customer told us at the counter')$$,
  pg_temp.rid(), pg_temp.code('branch_b')), '42501', null, 'branch managers cannot propose corrections');
reset role;
select pg_temp.as_user('cx');
set local role authenticated;
select throws_ok(format($$select public.response_propose_correction(%L, %L, 'short')$$, pg_temp.rid(), pg_temp.code('branch_b')),
  '22023', null, 'a reason of at least 10 characters is required');
select throws_ok(format($$select public.response_propose_correction(%L, 'NO-SUCH', 'Customer told us at the counter')$$, pg_temp.rid()),
  '22023', null, 'unknown branch codes are refused');
select throws_ok(format($$select public.response_propose_correction(%L, %L, 'Customer told us at the counter')$$,
  pg_temp.rid(), pg_temp.code('branch_a')), '22023', null, 'a correction must change the attribution');
insert into v select 'c', public.response_propose_correction(pg_temp.rid(), pg_temp.code('branch_b'), 'Policy was issued at the other branch');
select is((select j ->> 'status' from v where k = 'c'), 'proposed', 'the correction starts as proposed');
select throws_ok(format($$select public.response_propose_correction(%L, 'not_provided', 'Second proposal for the same record')$$, pg_temp.rid()),
  '22023', null, 'only one open proposal per record');
select is((public.response_corrections(pg_temp.rid()) #>> '{effective,branch_id}')::uuid, pg_temp.uid('branch_a'),
  'a proposal does not change the effective branch');
-- CX admins cannot approve at all
select throws_ok(format($$select public.response_approve_correction(%L)$$, (select j ->> 'id' from v where k = 'c')),
  '42501', null, 'approving needs responses.attribution.approve (Executive)');
reset role;

-- Executive proposes, cannot approve their own (T-M10-002)
insert into v select 'r2', to_jsonb(pg_temp.mk_response(pg_temp.uid('branch_a'), now() - interval '2 days'));
select pg_temp.as_user('exec1');
set local role authenticated;
insert into v select 'c2', public.response_propose_correction((select (j #>> '{}')::uuid from v where k = 'r2'),
  'not_applicable', 'Bought online, branch does not apply');
select throws_ok(format($$select public.response_approve_correction(%L)$$, (select j ->> 'id' from v where k = 'c2')),
  '42501', null, 'T-M10-002 the proposer cannot approve their own correction');
reset role;

-- Another Executive approves; the original stays visible (T-M10-001)
select pg_temp.as_user('exec2');
set local role authenticated;
insert into v select 'a', public.response_approve_correction((select (j ->> 'id')::uuid from v where k = 'c'));
select is((select j ->> 'status' from v where k = 'a'), 'approved', 'a second approver approves');
select throws_ok(format($$select public.response_approve_correction(%L)$$, (select j ->> 'id' from v where k = 'c')),
  '22023', null, 'an approved correction cannot be approved again');
insert into v select 'panel', public.response_corrections(pg_temp.rid());
select is((select (j #>> '{submitted,branch_id}')::uuid from v where k = 'panel'), pg_temp.uid('branch_a'),
  'T-M10-001 the submitted branch is always shown');
select is((select (j #>> '{effective,branch_id}')::uuid from v where k = 'panel'), pg_temp.uid('branch_b'),
  'the effective branch is the corrected one');
select is((select jsonb_array_length(j -> 'corrections') from v where k = 'panel'), 1, 'the history lists the correction');
select throws_ok(format($$select public.response_reject_correction(%L, 'no')$$, (select j ->> 'id' from v where k = 'c2')),
  '22023', null, 'rejecting needs a reason');
select is((public.response_reject_correction((select (j ->> 'id')::uuid from v where k = 'c2'), 'No evidence given')) ->> 'status',
  'rejected', 'an approver can reject');
select is(jsonb_array_length(public.correction_list('proposed', 100)), 0, 'the approvals queue is empty again');
select is(jsonb_array_length(public.correction_list(null, 100)), 2, 'history lists both decisions');
reset role;
select is((select issuing_branch_id from survey.responses where id = pg_temp.rid()), pg_temp.uid('branch_a'),
  'Rule 5: the response row itself is unchanged');
select is((select e.issuing_branch_id from analytics.v_responses_effective e where e.id = pg_temp.rid()), pg_temp.uid('branch_b'),
  'C''s effective view applies the approved correction');
select ok(exists (select 1 from analytics.responses_daily d where d.issuing_branch_id = pg_temp.uid('branch_b')
                  and d.local_date = ((now() - interval '3 days') at time zone 'Africa/Accra')::date),
  'the day''s roll-up is rebuilt with the corrected branch');
select is((select count(*)::int from audit.log where action in ('response.correction_proposed', 'response.correction_approved',
  'response.correction_rejected')), 4, 'proposals, approvals and rejections are audited');

-- Scope: the branch manager of the new branch sees the record; of the old branch, no longer
select pg_temp.as_user('bm');
set local role authenticated;
select throws_ok(format($$select public.response_corrections(%L)$$, pg_temp.rid()), '42501', null,
  'after re-attribution the old branch''s manager no longer sees the record');
reset role;
select pg_temp.as_user('bm2');
set local role authenticated;
select lives_ok(format($$select public.response_corrections(%L)$$, pg_temp.rid()), 'the new branch''s manager does');
reset role;

-- Operations page (M17)
select pg_temp.as_user('sa');
set local role authenticated;
insert into v select 'ops', public.ops_overview();
select is((select (j #>> '{thresholds,db_bytes}')::bigint from v where k = 'ops'), 524288000::bigint, 'DB threshold is 500 MB');
select is((select (j #>> '{thresholds,storage_bytes}')::bigint from v where k = 'ops'), 1073741824::bigint, 'storage threshold is 1 GB');
select is((select (j #>> '{thresholds,emails_per_day}')::int from v where k = 'ops'), 90, 'email budget comes from settings');
select ok((select (j #>> '{current,db_bytes}')::bigint > 0 from v where k = 'ops'), 'current database size is reported');
select ok((select jsonb_array_length(j -> 'cron') >= 5 from v where k = 'ops'), 'scheduled jobs are listed');
select lives_ok($$select public.ops_record_quota_snapshot()$$, 'a system administrator can record a usage snapshot');
select throws_ok($$select public.ops_record_quota_snapshot()$$, '22023', null, 'but not twice within a minute');
reset role;
select pg_temp.as_user('bm');
set local role authenticated;
select throws_ok($$select public.ops_overview()$$, '42501', null, 'the operations page needs settings.manage or audit.view_all');
reset role;

select * from finish();
rollback;
