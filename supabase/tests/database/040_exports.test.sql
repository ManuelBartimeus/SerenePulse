-- 040 exports (FR-25, MS-09): scope, PII minimisation, storage policy, audit (T-M13-100, T-M13-101).
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

-- Today-relative dates so C's default period and filters apply.
do $$ begin perform pg_temp.mk_response(pg_temp.uid('branch_a'), now() - interval '2 days', 'Great service', '+233241234567'); end $$;
do $$ begin perform pg_temp.mk_response(pg_temp.uid('branch_a'), now() - interval '2 days', '=HYPERLINK("x")'); end $$;
do $$ begin perform pg_temp.mk_response(pg_temp.uid('branch_a'), now() - interval '3 days'); end $$;
do $$ begin perform pg_temp.mk_response(pg_temp.uid('branch_b'), now() - interval '2 days', 'Slow'); end $$;
do $$ begin perform pg_temp.mk_response(pg_temp.uid('branch_b'), now() - interval '4 days'); end $$;

create temporary table v (k text primary key, j jsonb);
grant all on v to authenticated;
-- Every verified response in the window (the local database may hold rows of its own).
insert into v select 'expected_all', to_jsonb((select count(*)::int from survey.responses where verification = 'verified'
  and submitted_at >= ((now() at time zone 'Africa/Accra')::date - 10)::timestamp at time zone 'Africa/Accra'));
-- Filters: last 10 days, Africa/Accra.
create or replace function pg_temp.f() returns jsonb language sql as $$
  select jsonb_build_object('from', ((now() at time zone 'Africa/Accra')::date - 10)::text,
                            'to', ((now() at time zone 'Africa/Accra')::date)::text) $$;
grant execute on function pg_temp.f() to authenticated;

-- Storage bucket and policies
select ok((select not public from storage.buckets where id = 'reports'), 'bucket "reports" exists and is private');
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'reports_bucket_no_client_access' and permissive = 'RESTRICTIVE'),
          'a restrictive storage policy keeps portal users out of the reports bucket');

select pg_temp.as_user('cx');
set local role authenticated;
select throws_ok($$insert into storage.objects (bucket_id, name) values ('reports', 'exports/x/y.csv')$$, '42501', null,
  'a signed-in user cannot write to the reports bucket directly');
select is((select count(*)::int from storage.objects where bucket_id = 'reports'), 0,
  'a signed-in user cannot list the reports bucket');
reset role;

-- Branch manager: scope follows the branch grant (T-M13-100)
select pg_temp.as_user('bm');
set local role authenticated;
insert into v select 'bm', public.export_begin('responses_export', pg_temp.f(), 'csv', false, null);
select is((select (j ->> 'total')::int from v where k = 'bm'), 3,
  'T-M13-100 a branch manager''s export has only their branch''s responses');
select throws_ok($$select public.export_begin('responses_export', pg_temp.f(), 'csv', true, 'Customer callback list')$$,
  '42501', null, 'T-M13-101 contact columns need pii.export');
select ok(not exists (select 1 from jsonb_array_elements((select j -> 'columns' from v where k = 'bm')) c
                      where c ->> 'key' in ('contact_phone', 'contact_first_name')),
  'T-M13-101 contact columns are excluded without pii.export');
select ok(exists (select 1 from jsonb_array_elements((select j -> 'columns' from v where k = 'bm')) c
                  where c ->> 'key' = 'comment'),
  'branch managers (responses.comment.view) get the comment column');
insert into v select 'bm_page', public.export_page((select (j ->> 'file_id')::uuid from v where k = 'bm'), 0, 2);
select is(jsonb_array_length((select j -> 'rows' from v where k = 'bm_page')), 2, 'pages are limited to p_limit rows');
select is((select (j ->> 'next')::int from v where k = 'bm_page'), 2, 'a full page returns the cursor for the next one');
insert into v select 'bm_page2', public.export_page((select (j ->> 'file_id')::uuid from v where k = 'bm'), 2, 2);
select ok((select j -> 'next' = 'null'::jsonb from v where k = 'bm_page2'), 'the last page has no cursor');
select is(jsonb_array_length((select j -> 'rows' -> 0 from v where k = 'bm_page')),
          jsonb_array_length((select j -> 'columns' from v where k = 'bm')), 'each row has one value per column');
select throws_ok(format($$select public.export_finish(%L, 'exports/someone-else/x.csv', 3, 10)$$,
                        (select j ->> 'file_id' from v where k = 'bm')),
  'P0002', null, 'an export cannot be finished with a storage path outside the caller''s folder');
select lives_ok(format($$select public.export_finish(%1$L, 'exports/' || auth.uid() || '/' || %1$L || '.csv', 3, 10)$$,
                       (select j ->> 'file_id' from v where k = 'bm')), 'the requester finishes the export');
reset role;
select is((select count(*)::int from reports.export_rows where file_id = (select (j ->> 'file_id')::uuid from v where k = 'bm')),
  0, 'captured row ids are deleted when the export is finished');
select ok(exists (select 1 from audit.log where action = 'export.created'
                  and entity_id = (select j ->> 'file_id' from v where k = 'bm')
                  and after ->> 'contains_pii' = 'false'), 'export.created is audited with its filters and PII flag');

-- Download: requester only, re-checked, audited
select pg_temp.as_user('bm2');
set local role authenticated;
select throws_ok(format($$select public.report_file_authorize_download(%L)$$, (select j ->> 'file_id' from v where k = 'bm')),
  '42501', null, 'another user cannot download someone else''s export');
reset role;
select pg_temp.as_user('bm');
set local role authenticated;
select is((public.report_file_authorize_download((select (j ->> 'file_id')::uuid from v where k = 'bm'))) ->> 'storage_path',
          'exports/' || pg_temp.uid('bm') || '/' || (select j ->> 'file_id' from v where k = 'bm') || '.csv',
          'the requester gets the storage path for a signed URL');
select is((select count(*)::int from public.report_files where requested_by = pg_temp.uid('bm')), 1,
  'report_files RLS shows a user their own exports');
reset role;
select ok(exists (select 1 from audit.log where action = 'export.downloaded'
                  and entity_id = (select j ->> 'file_id' from v where k = 'bm')), 'export.downloaded is audited');

-- CX admin with pii.export: reason required, contact columns present and decrypted
select pg_temp.as_user('cx');
set local role authenticated;
select throws_ok($$select public.export_begin('responses_export', pg_temp.f(), 'xlsx', true, 'short')$$,
  '22023', null, 'including contact details needs a reason of at least 10 characters');
insert into v select 'cx', public.export_begin('responses_export', pg_temp.f(), 'xlsx', true, 'Callback campaign for detractors');
select is((select (j ->> 'total')::int from v where k = 'cx'),
  (select (j #>> '{}')::int from v where k = 'expected_all'),
  'organisation scope exports every branch');
insert into v select 'cx_page', public.export_page((select (j ->> 'file_id')::uuid from v where k = 'cx'), 0, 100);
select ok(exists (select 1 from jsonb_array_elements((select j -> 'rows' from v where k = 'cx_page')) r
                  where r ->> (jsonb_array_length(r) - 1) = '+233241234567'),
  'with pii.export and a reason the contact phone is included');
select throws_ok($$select public.export_begin('responses_export', '{"from":"2001-01-01","to":"2001-01-02"}'::jsonb, 'csv', false, null)$$,
  '22023', null, 'an export with no matching rows is refused with a clear message');
select throws_ok($$select public.export_begin('responses_export', pg_temp.f(), 'pdf', false, null)$$,
  '22023', null, 'exports are CSV or Excel only');
reset role;
select is((select pii_reason from public.report_files where id = (select (j ->> 'file_id')::uuid from v where k = 'cx')),
  'Callback campaign for detractors', 'the PII reason is stored with the file');

-- Audit-log export follows audit_log_list scope (M15)
select audit.append('pii.contact_revealed', 'response', 'x', null, null, 'system');
select audit.append('public.settings.update', 'settings', 'x', null, null, 'system');
select pg_temp.as_user('sa');
set local role authenticated;
insert into v select 'sa', public.export_begin('audit_export', pg_temp.f(), 'csv', false, null);
insert into v select 'sa_page', public.export_page((select (j ->> 'file_id')::uuid from v where k = 'sa'), 0, 10000);
select ok(not exists (select 1 from jsonb_array_elements((select j -> 'rows' from v where k = 'sa_page')) r
                      where r ->> 5 = 'pii.contact_revealed'),
  'audit.view without audit.view_all does not export data-access events');
reset role;
select pg_temp.as_user('aud');
set local role authenticated;
insert into v select 'aud', public.export_begin('audit_export', pg_temp.f(), 'csv', false, null);
insert into v select 'aud_page', public.export_page((select (j ->> 'file_id')::uuid from v where k = 'aud'), 0, 10000);
select ok(exists (select 1 from jsonb_array_elements((select j -> 'rows' from v where k = 'aud_page')) r
                  where r ->> 5 = 'pii.contact_revealed'), 'auditors (audit.view_all) export every event');
select throws_ok($$select public.export_begin('audit_export', '{}'::jsonb, 'csv', false, null)$$, '22023', null,
  'the audit export needs a period');
reset role;
select pg_temp.as_user('bm');
set local role authenticated;
select throws_ok($$select public.export_begin('audit_export', pg_temp.f(), 'csv', false, null)$$, '42501', null,
  'the audit export needs audit.view');
reset role;

-- Privileges
select ok(not has_function_privilege('authenticated', 'public.report_run_claim(uuid)', 'execute')
          and has_function_privilege('service_role', 'public.report_run_claim(uuid)', 'execute'),
  'report generation RPCs are service_role only');
select ok(not has_function_privilege('anon', 'public.export_begin(text, jsonb, text, boolean, text)', 'execute'),
  'anon cannot start an export');

select * from finish();
rollback;
