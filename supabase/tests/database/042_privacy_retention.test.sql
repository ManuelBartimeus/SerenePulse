-- 042 retention per class (D-16, T-M16-110) and data-subject requests (FR-45, T-M16-010).
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
insert into v select 'old', to_jsonb(pg_temp.mk_response(pg_temp.uid('branch_a'), now() - interval '25 months', 'Old comment', '+233241110001'));
insert into v select 'mid', to_jsonb(pg_temp.mk_response(pg_temp.uid('branch_a'), now() - interval '13 months', 'Mid comment', '+233241110002'));
insert into v select 'new', to_jsonb(pg_temp.mk_response(pg_temp.uid('branch_b'), now() - interval '2 days', 'New comment', '+233241110003'));
insert into v select 'new2', to_jsonb(pg_temp.mk_response(pg_temp.uid('branch_b'), now() - interval '1 day', null, '+233241110003'));
create or replace function pg_temp.rid(p_k text) returns uuid language sql as $$ select (j #>> '{}')::uuid from v where k = p_k $$;
grant execute on function pg_temp.rid(text) to authenticated;

-- Rule 5: nothing but the retention path may change a response
select throws_ok(format($$update survey.responses set comment = 'edited' where id = %L$$, pg_temp.rid('new')), '42501', null,
  'T-DB-survey-010 responses cannot be edited outside retention');
select throws_ok(format($$delete from survey.responses where id = %L$$, pg_temp.rid('new')), '42501', null,
  'responses cannot be deleted');

-- Expired files for the file class
insert into public.report_files (report_key, requested_by, format, status, storage_path, expires_at)
values ('responses_export', pg_temp.uid('cx'), 'csv', 'ready', 'exports/x/old.csv', now() - interval '1 hour'),
       ('responses_export', pg_temp.uid('cx'), 'csv', 'ready', 'exports/x/new.csv', now() + interval '6 days'),
       ('responses_export', pg_temp.uid('cx'), 'csv', 'pending', null, now() + interval '6 days');
update public.report_files set created_at = now() - interval '2 hours' where status = 'pending';

insert into v select 'run', ops.retention_run();
select is((select (j ->> 'texts_redacted')::int from v where k = 'run'), 1, 'T-M16-110 texts older than 24 months are redacted');
select is((select comment from survey.responses where id = pg_temp.rid('old')), '[removed]', 'the comment becomes [removed]');
select is((select improvement_other_text from survey.responses where id = pg_temp.rid('old')), '[removed]',
  '"other" texts become [removed]');
select ok((select text_redacted_at is not null from survey.responses where id = pg_temp.rid('old')), 'text_redacted_at is set');
select is((select csat_score from survey.responses where id = pg_temp.rid('old')), 4::smallint, 'ratings are kept');
select is((select comment from survey.responses where id = pg_temp.rid('mid')), 'Mid comment', 'newer texts are kept');
select is((select (j ->> 'contacts_erased')::int from v where k = 'run'), 2,
  'T-M16-110 contact details older than 12 months are erased');
select ok((select erased_at is not null and phone_e164_enc is null and phone_hmac is null and first_name_enc is null and dek_enc is null
           from pii.contact_requests where response_id = pg_temp.rid('mid')), 'erasure clears every ciphertext and the lookup hash');
select ok((select erased_at is null from pii.contact_requests where response_id = pg_temp.rid('new')), 'recent contacts are kept');
select is((select (j ->> 'files_expired')::int from v where k = 'run'), 1, 'T-M16-110 expired files are marked for deletion');
select is((select (j ->> 'stale_exports_failed')::int from v where k = 'run'), 1, 'stuck exports are closed');
select ok((select j ? 'survey' from v where k = 'run'), 'survey.retention_purge runs as part of the nightly job');
select ok(exists (select 1 from audit.log where action = 'retention.run' and actor_type = 'system'
                  and after ->> 'texts_redacted' = '1'), 'retention.run is audited with counts');
select ok(exists (select 1 from ops.job_runs where job = 'retention' and status = 'succeeded'
                  and detail ->> 'contacts_erased' = '2'), 'ops.job_runs records the run');
select is(current_setting('app.retention_redact', true), 'off', 'the redaction switch is off again after the run');
select throws_ok(format($$update survey.responses set comment = 'x' where id = %L$$, pg_temp.rid('mid')), '42501', null,
  'and responses are immutable again');
select is((select (ops.retention_run() ->> 'texts_redacted')::int), 0, 'a second run redacts nothing (idempotent)');
select is((public.report_files_due_purge() -> 0 ->> 'storage_path'), 'exports/x/old.csv', 'the purge list has the expired file');
select is(public.report_files_purged(array[(public.report_files_due_purge() -> 0 ->> 'id')::uuid]), 1,
  'purged rows are deleted');
select ok(exists (select 1 from cron.job where jobname = 'retention-nightly' and schedule = '0 3 * * *'),
  'retention runs at 03:00 Africa/Accra');

-- Data-subject requests (FR-45)
select pg_temp.as_user('cx');
set local role authenticated;
select throws_ok($$select public.privacy_find_contact('0241110003')$$, '42501', null,
  'pii.view alone is not enough for data-subject requests');
reset role;
select pg_temp.as_user('sa');
set local role authenticated;
select throws_ok($$select public.privacy_find_contact('0241110003')$$, '42501', null,
  'settings.manage without pii.view is refused');
reset role;
select pg_temp.as_user('exec1');
set local role authenticated;
select throws_ok($$select public.privacy_find_contact('12345')$$, '22023', null, 'numbers are validated with the Ghana rules');
insert into v select 'find', public.privacy_find_contact('+233 24 111 0003');
select is((select jsonb_array_length(j -> 'contacts') from v where k = 'find'), 2,
  'T-M16-010 find by phone (any format) lists every linked response');
select is((select j ->> 'phone_masked' from v where k = 'find'), '024 ••• 0003', 'the number is shown masked');
select is(jsonb_array_length(public.privacy_find_contact('0241110002') -> 'contacts'), 0, 'erased contacts are not found');
insert into v select 'export', public.privacy_export_subject('0241110003', 'DSR-2026-014 subject access');
select is((select jsonb_array_length(j -> 'records') from v where k = 'export'), 2, 'the subject export has both records');
select is((select j -> 'records' -> 0 ->> 'phone' from v where k = 'export'), '+233241110003', 'and the decrypted number');
select throws_ok($$select public.privacy_export_subject('0241110003', 'short')$$, '22023', null, 'the export needs a reason');
select throws_ok(format($$select public.privacy_erase_contact(%L, 'x')$$, (select j -> 'contacts' -> 0 ->> 'contact_id' from v where k = 'find')),
  '22023', null, 'erasure needs a reason');
select lives_ok(format($$select public.privacy_erase_contact(%L, 'DSR-2026-015 erasure request')$$,
  (select j -> 'contacts' -> 0 ->> 'contact_id' from v where k = 'find')), 'T-M16-010 the contact is erased');
select throws_ok(format($$select public.privacy_erase_contact(%L, 'DSR-2026-015 erasure request')$$,
  (select j -> 'contacts' -> 0 ->> 'contact_id' from v where k = 'find')), '22023', null, 'erasing twice is refused');
select is(jsonb_array_length(public.privacy_find_contact('0241110003') -> 'contacts'), 1, 'only the other contact remains');
reset role;
select ok(exists (select 1 from survey.responses where id = pg_temp.rid('new') and comment = 'New comment'),
  'the response is kept after erasure');
select is((select count(*)::int from audit.log where action in ('privacy.contact_searched', 'privacy.subject_exported',
  'privacy.contact_erased')), 5, 'searches, exports and erasures are audited');
select ok(not exists (select 1 from audit.log where action like 'privacy.%' and (after::text like '%0241110003%'
                      or after::text like '%+233241110003%')), 'the audit trail never holds the clear number');

select * from finish();
rollback;
