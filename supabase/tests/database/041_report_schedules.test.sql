-- 041 scheduled reports (MS-12, D-26, T-M13-110): next-run maths, scope of owners and recipients, dispatch,
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

-- generation hand-off and notifications.

-- Next run, 07:00 Africa/Accra (= UTC)
select is(reports.next_run_at('daily', '2026-11-05 06:59:59+00'), '2026-11-05 07:00+00'::timestamptz,
  'daily: 07:00 the same day when before 07:00');
select is(reports.next_run_at('daily', '2026-11-05 07:00+00'), '2026-11-06 07:00+00'::timestamptz,
  'daily: strictly after, so exactly 07:00 moves to the next day');
select is(reports.next_run_at('weekly', '2026-11-05 10:00+00'), '2026-11-09 07:00+00'::timestamptz,
  'weekly: next Monday 07:00');
select is(reports.next_run_at('weekly', '2026-11-09 06:00+00'), '2026-11-09 07:00+00'::timestamptz,
  'weekly: Monday before 07:00 runs that morning');
select is(reports.next_run_at('monthly', '2026-11-05 10:00+00'), '2026-12-01 07:00+00'::timestamptz,
  'monthly: the 1st of next month');
select is(reports.next_run_at('monthly', '2026-12-31 23:00+00'), '2027-01-01 07:00+00'::timestamptz,
  'monthly: across the year end');
select is(reports.next_run_at('quarterly', '2026-11-05 10:00+00'), '2027-01-04 07:00+00'::timestamptz,
  'quarterly: 1 Jan 2027 is a holiday (Friday), so the first working day is Monday 4 Jan');
select is(reports.next_run_at('quarterly', '2026-06-10 10:00+00'), '2026-07-02 07:00+00'::timestamptz,
  'quarterly: 1 Jul 2026 is Republic Day, so Thursday 2 Jul');
select is(reports.next_run_at('quarterly', '2027-01-04 07:00+00'), '2027-04-01 07:00+00'::timestamptz,
  'quarterly: after a run, the next quarter''s first working day');
select is(reports.next_run_at('quarterly', '2026-09-30 12:00+00'), '2026-10-01 07:00+00'::timestamptz,
  'quarterly: 1 Oct 2026 is a working Thursday');
select throws_ok($$select reports.next_run_at('hourly', now())$$, '22023', null, 'unknown frequencies are refused');

select results_eq($$select period_from, period_to from reports.period_for('daily', '2026-11-05')$$,
  $$values ('2026-11-04'::date, '2026-11-04'::date)$$, 'daily report covers yesterday');
select results_eq($$select period_from, period_to from reports.period_for('weekly', '2026-11-09')$$,
  $$values ('2026-11-02'::date, '2026-11-08'::date)$$, 'weekly report covers the previous Monday to Sunday');
select results_eq($$select period_from, period_to from reports.period_for('monthly', '2026-12-01')$$,
  $$values ('2026-11-01'::date, '2026-11-30'::date)$$, 'monthly report covers the previous month');
select results_eq($$select period_from, period_to from reports.period_for('quarterly', '2027-01-04')$$,
  $$values ('2026-10-01'::date, '2026-12-31'::date)$$, 'quarterly report covers the previous quarter');

create temporary table v (k text primary key, j jsonb);
grant all on v to authenticated;

-- Branch manager: own branches only; recipients must be able to see what the report covers
select pg_temp.as_user('bm');
set local role authenticated;
insert into v select 'bm', public.report_schedule_save(null, 'My branch weekly', 'weekly_branch', '{}'::jsonb,
  array['pdf', 'xlsx'], array[pg_temp.uid('bm'), pg_temp.uid('exec1')]);
select is((select j -> 'filters' -> 'branch_ids' from v where k = 'bm'), jsonb_build_array(pg_temp.uid('branch_a')),
  'a branch manager''s schedule is limited to their branches');
select throws_ok(format($$select public.report_schedule_save(null, 'x', 'weekly_branch', '{"branch_ids":[%s]}'::jsonb,
  array['pdf'], array[%L::uuid])$$, to_jsonb(pg_temp.uid('branch_b'))::text, pg_temp.uid('bm')),
  '42501', null, 'a branch manager cannot schedule another branch');
select throws_ok(format($$select public.report_schedule_save(null, 'x', 'weekly_branch', '{}'::jsonb, array['pdf'], array[%L::uuid])$$,
  pg_temp.uid('bm2')), '22023', null, 'a recipient who can''t see the branch is refused');
select throws_ok(format($$select public.report_schedule_save(null, 'x', 'weekly_branch', '{}'::jsonb, array['pdf'], array[%L::uuid])$$,
  pg_temp.uid('sa')), '22023', null, 'a recipient without dashboard access is refused (portal users with access only)');
select throws_ok(format($$select public.report_schedule_save(null, 'x', 'weekly_branch', '{}'::jsonb, array['docx'], array[%L::uuid])$$,
  pg_temp.uid('bm')), '22023', null, 'formats are PDF and/or Excel');
select throws_ok(format($$select public.report_schedule_save(%L, 'Renamed', 'weekly_branch', '{}'::jsonb, array['pdf'], array[%L::uuid], true, 99)$$,
  (select j ->> 'id' from v where k = 'bm'), pg_temp.uid('bm')), 'P0409', null, 'a stale version is refused');
reset role;
select is((select (j ->> 'next_run_at')::timestamptz from v where k = 'bm'), reports.next_run_at('weekly', now()),
  'next_run_at is set from the frequency');

select pg_temp.as_user('cx');
set local role authenticated;
select throws_ok(format($$select public.report_schedule_save(null, 'Org daily', 'daily_operational', '{}'::jsonb, array['pdf'], array[%L::uuid])$$,
  pg_temp.uid('bm')), '22023', null, 'an organisation-wide report cannot go to a branch-scoped user');
insert into v select 'cx', public.report_schedule_save(null, 'Org daily', 'daily_operational', '{}'::jsonb, array['pdf'],
  array[pg_temp.uid('exec1'), pg_temp.uid('aud')]);
select is(jsonb_array_length(public.report_schedule_list()), 2, 'organisation-scope schedulers see every schedule');
select ok(jsonb_array_length(public.report_recipient_options()) >= 5, 'recipient options list active users with dashboards');
select ok(not exists (select 1 from jsonb_array_elements(public.report_recipient_options()) o
                      where o ->> 'user_id' = pg_temp.uid('sa')::text), 'users without analytics.view are not offered');
reset role;

-- Dispatch: due schedules → one pending file per format; next run advances
update public.report_schedules set next_run_at = now() - interval '1 minute' where id = (select (j ->> 'id')::uuid from v where k = 'bm');
select is(reports.dispatch_due(), 1, 'one due schedule is dispatched');
select is((select count(*)::int from public.report_files where schedule_id = (select (j ->> 'id')::uuid from v where k = 'bm')
           and status = 'pending'), 2, 'a pending file per format is created');
select ok((select next_run_at > now() from public.report_schedules where id = (select (j ->> 'id')::uuid from v where k = 'bm')),
  'next_run_at moves to the next Monday');
select ok(exists (select 1 from ops.job_runs where job in ('reports.invoke', 'reports.dispatch')),
  'the dispatch is recorded in ops.job_runs');

-- Generation hand-off (service_role path); figures come from C's RPCs under the owner's scope
do $$ begin perform pg_temp.mk_response(pg_temp.uid('branch_a'), now() - interval '8 days'); end $$;
select set_config('request.jwt.claims', '', true);
insert into v select 'claim', public.report_run_claim((select run_id from public.report_files
  where schedule_id = (select (j ->> 'id')::uuid from v where k = 'bm') limit 1));
select is((select jsonb_array_length(j -> 'files') from v where k = 'claim'), 2, 'the claim lists both files');
select ok((select j -> 'data' ? 'summary' and j -> 'data' -> 'breakdowns' ? 'branch' from v where k = 'claim'),
  'report data includes the summary and the branch breakdown');
select is((select j #>> '{period,tz}' from v where k = 'claim'), 'Africa/Accra', 'report states its time zone');
select is(current_setting('request.jwt.claims', true), '', 'the owner''s claims are dropped again after building');
select throws_ok(format($$select public.report_file_complete(%L, 'elsewhere/x.pdf', 10)$$,
  (select j -> 'files' -> 0 ->> 'id' from v where k = 'claim')), '22023', null, 'report files must be stored at their own path');
select lives_ok(format($$select public.report_file_complete(%1$L, 'scheduled/' || %2$L || '/' || %1$L || '.pdf', 1000)$$,
  (select f ->> 'id' from v, jsonb_array_elements(j -> 'files') f where k = 'claim' and f ->> 'format' = 'pdf'),
  (select j ->> 'id' from v where k = 'bm')), 'the PDF completes');
select is((select count(*)::int from public.notifications where link like '/reports/files?run=%'), 0,
  'recipients are not notified while a file of the run is still pending');
select lives_ok(format($$select public.report_file_complete(%1$L, 'scheduled/' || %2$L || '/' || %1$L || '.xlsx', 1000)$$,
  (select f ->> 'id' from v, jsonb_array_elements(j -> 'files') f where k = 'claim' and f ->> 'format' = 'xlsx'),
  (select j ->> 'id' from v where k = 'bm')), 'the XLSX completes');
select is((select array_agg(user_id order by user_id) from public.notifications where link like '/reports/files?run=%'),
  array[pg_temp.uid('exec1'), pg_temp.uid('bm')]::uuid[] , 'each recipient gets an in-app notification when the run is ready');
select is((select count(*)::int from public.email_log where template = 'report_ready'), 2, 'and an email row with a link');
select ok((select bool_and(expires_at > now() + interval '29 days') from public.report_files
           where schedule_id = (select (j ->> 'id')::uuid from v where k = 'bm')), 'report files expire after 30 days');

-- Recipients can download; others cannot
select pg_temp.as_user('exec1');
set local role authenticated;
select ok((public.report_file_authorize_download((select (f ->> 'id')::uuid from v, jsonb_array_elements(j -> 'files') f
            where k = 'claim' and f ->> 'format' = 'pdf'))) ->> 'storage_path' like 'scheduled/%', 'a recipient can download');
select is((select count(*)::int from public.report_files where schedule_id = (select (j ->> 'id')::uuid from v where k = 'bm')), 2,
  'recipients see the schedule''s files');
reset role;
select pg_temp.as_user('bm2');
set local role authenticated;
select is((select count(*)::int from public.report_files), 0, 'non-recipients see no report files');
select throws_ok(format($$select public.report_file_authorize_download(%L)$$,
  (select j -> 'files' -> 0 ->> 'id' from v where k = 'claim')), '42501', null, 'non-recipients cannot download');
reset role;

-- On demand
select pg_temp.as_user('bm');
set local role authenticated;
insert into v select 'now', public.report_schedule_run_now((select (j ->> 'id')::uuid from v where k = 'bm'));
select throws_ok(format($$select public.report_schedule_run_now(%L)$$, (select j ->> 'id' from v where k = 'bm')),
  '22023', null, 'a second run while one is in progress is refused');
reset role;
select is((select count(*)::int from public.report_files where run_id = (select (j ->> 'run_id')::uuid from v where k = 'now')), 2,
  '"Run now" creates files for every format');
select pg_temp.as_user('bm2');
set local role authenticated;
select throws_ok(format($$select public.report_schedule_run_now(%L)$$, (select j ->> 'id' from v where k = 'bm')),
  '42501', null, 'only the owner (or an organisation-scope scheduler) can run a schedule');
reset role;
select ok(exists (select 1 from cron.job where jobname = 'reports-dispatch'), 'the dispatcher is scheduled');

select * from finish();
rollback;
