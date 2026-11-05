-- MS-10 flags and cases: flag defaults (Rule 13, T-M11-001/002), no NPS rule (Rule 11, T-M11-010),
-- transition matrix (T-M11-103), Rule 21 (T-DB-case-010), optimistic locking, officer scope,
-- contact reveal (D-15), SLA working-day maths (D-18).
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e001', 'exec@example.test'),
  ('00000000-0000-0000-0000-00000000c001', 'cx@example.test'),
  ('00000000-0000-0000-0000-00000000b001', 'bm@example.test'),
  ('00000000-0000-0000-0000-00000000f001', 'officer@example.test'),
  ('00000000-0000-0000-0000-00000000f002', 'officer2@example.test'),
  ('00000000-0000-0000-0000-00000000a001', 'auditor@example.test'),
  ('00000000-0000-0000-0000-00000000d001', 'head@example.test');
update public.profiles set status = 'active', must_change_password = false, display_name = split_part(
  (select email from auth.users u where u.id = user_id), '@', 1)
 where user_id::text like '00000000-0000-0000-0000-00000000%';
update public.profiles set department_id = (select id from public.departments where code = 'CLAIMS')
 where user_id in ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000d001');
update public.departments set head_user_id = '00000000-0000-0000-0000-00000000d001' where code = 'CLAIMS';

insert into public.user_role_grants (user_id, role_id, scope_type, scope_id, status, approved_at)
select u::uuid, r.id, r.scope, case when r.scope = 'branch' then (select id from public.branches where code = 'ACC-EAST') end,
       'active', now()
from (values ('00000000-0000-0000-0000-00000000e001', 'executive'), ('00000000-0000-0000-0000-00000000c001', 'cx_admin'),
             ('00000000-0000-0000-0000-00000000b001', 'branch_manager'),
             ('00000000-0000-0000-0000-00000000f001', 'resolution_officer'),
             ('00000000-0000-0000-0000-00000000f002', 'resolution_officer'),
             ('00000000-0000-0000-0000-00000000a001', 'auditor'),
             ('00000000-0000-0000-0000-00000000d001', 'resolution_officer')) g(u, k)
join public.roles r on r.key = g.k;

create or replace function pg_temp.claims_for(p_user uuid)
returns text language sql as $$
  select (public.custom_access_token_hook(jsonb_build_object('user_id', p_user,
    'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated'))) -> 'claims')::text
$$;
create or replace function pg_temp.as_user(p_user text)
returns void language sql as $$
  select set_config('request.jwt.claims', pg_temp.claims_for(p_user::uuid), true)::text is not null
$$;

create temporary sequence t_ref;
-- A walk-in response; the AFTER INSERT trigger raises flags synchronously.
create or replace function pg_temp.resp(p_csat int, p_factor text default 'NONE', p_comment text default null,
  p_branch text default 'ACC-EAST', p_nps int default 8, p_phone text default null, p_at timestamptz default now())
returns uuid language plpgsql as $$
declare
  v_session uuid;
  v_id uuid;
  v_enc record;
begin
  insert into survey.sessions (session_secret_hash, device_id_hash, source_id, survey_version_id, status)
  values (extensions.gen_random_bytes(16), extensions.gen_random_bytes(16), (select id from public.survey_sources where code = 'direct'),
          (select id from public.survey_versions where status = 'published'), 'submitted')
  returning id into v_session;
  insert into survey.responses (reference, session_id, survey_version_id, source_id, service_channel_id, branch_status,
    issuing_branch_id, region_id_at_submission, insurance_product_id, csat_score, ces_score, nps_score,
    improvement_factor_id, comment, contact_consent, opened_at, submitted_at)
  select 'FB-2026-9' || lpad(nextval('t_ref')::text, 5, '0'), v_session, s.survey_version_id, s.source_id,
         (select id from public.service_channels where code = 'WALK_IN'), 'selected', b.id, b.region_id,
         (select id from public.insurance_products where code = 'MOTOR'), p_csat, 3, p_nps,
         (select id from public.improvement_factors where code = p_factor), p_comment, p_phone is not null, p_at, p_at
  from survey.sessions s, public.branches b where s.id = v_session and b.code = p_branch
  returning id into v_id;
  if p_phone is not null then
    select * into v_enc from pii.encrypt_contact(p_phone, 'Ama');
    insert into pii.contact_requests (response_id, phone_e164_enc, phone_hmac, first_name_enc, dek_enc, consent_text_version)
    values (v_id, v_enc.phone_enc, app.hmac('phone:' || p_phone), v_enc.first_name_enc, v_enc.dek_enc, 'v1');
  end if;
  return v_id;
end;
$$;
create temporary table t (k text primary key, id uuid);
grant select, insert on t to authenticated;

-- ---------------------------------------------------------------------------
-- Flag defaults and rules (Rule 11, Rule 13)
-- ---------------------------------------------------------------------------
select results_eq($$select key, flag_enabled, auto_create_case from public.flag_rules order by sort_order$$,
  $$values ('low_csat', true, false), ('improvement_factor', true, false), ('comment_keyword', true, false)$$,
  'T-M11-001 every flag rule flags by default and none creates a case (Rule 13)');
select is((select count(*)::int from public.improvement_factors where not is_none and (not flag_on_select or auto_create_case)), 0,
  'T-M11-001 every improvement factor except "Nothing" flags and none auto-creates a case');
select is((select params ->> 'csat_lte' from public.flag_rules where key = 'low_csat'), '2', 'the CSAT rule flags 1–2');
select is((select count(*)::int from public.flag_rules where key ilike '%nps%' or params::text ilike '%nps%'), 0,
  'T-M11-010 there is no NPS flag rule (Rule 11)');

insert into t values ('detractor', pg_temp.resp(4, 'NONE', null, 'ACC-EAST', 0));
select is((select count(*)::int from public.response_flags where response_id = (select id from t where k = 'detractor')), 0,
  'T-M11-010 an NPS 0 detractor with CSAT 4 and "Nothing" raises no flag');

insert into t values ('low', pg_temp.resp(2));
select results_eq($$select r.key, f.suggested_priority, f.status from public.response_flags f join public.flag_rules r on r.id = f.rule_id
                    where f.response_id = (select id from t where k = 'low')$$,
  $$values ('low_csat'::text, 'P2'::text, 'open'::text)$$, 'T-M11-100 CSAT 2 raises one open low-CSAT flag suggesting P2');
select is((select count(*)::int from public.cases where response_id = (select id from t where k = 'low')), 0,
  'T-M11-100 the flag does not create a case by default (Rule 13)');

insert into t values ('factor', pg_temp.resp(4, 'SPEED'));
select is((select reason from public.response_flags where response_id = (select id from t where k = 'factor')),
  'Improvement factor: Speed of service', 'choosing an improvement factor raises a factor flag');

insert into t values ('kw', pg_temp.resp(4, 'NONE', 'They still owe me a REFUND and I will see a lawyer.'));
select is((select reason from public.response_flags where response_id = (select id from t where k = 'kw')),
  'Comment mentions: lawyer, refund', 'T-M11-121 keywords match case-insensitively');
insert into t values ('kw_word', pg_temp.resp(4, 'NONE', 'The clinic and technical staff were great.'));
select is((select count(*)::int from public.response_flags where response_id = (select id from t where k = 'kw_word')), 0,
  'keywords match whole words only ("NIC" does not match "clinic" or "technical")');

select throws_ok($$insert into public.response_flags (response_id, rule_id, reason, suggested_priority, csat_score)
  select (select id from t where k = 'low'), id, 'dup', 'P2', 2 from public.flag_rules where key = 'low_csat'$$,
  '23505', null, 'a rule flags a response at most once (unique response_id, rule_id)');

update public.flag_rules set params = '{"csat_lte": 1}' where key = 'low_csat';
insert into t values ('csat2_after', pg_temp.resp(2));
select is((select count(*)::int from public.response_flags where response_id = (select id from t where k = 'csat2_after')), 0,
  'T-M11-120 raising the threshold to CSAT ≤ 1 stops CSAT 2 flagging');
select throws_ok($$update public.flag_rules set params = '{"csat_lte": 5}' where key = 'low_csat'$$, '22023', null,
  'the CSAT threshold is validated');
update public.flag_rules set params = '{"csat_lte": 2}', auto_create_case = true where key = 'low_csat';
insert into t values ('auto', pg_temp.resp(1, 'STAFF'));
select results_eq($$select status, queue, source, priority from public.cases where response_id = (select id from t where k = 'auto')$$,
  $$values ('new'::text, 'cx_central'::text, 'auto'::text, 'P2'::text)$$,
  'T-M11-002 with Auto-create case on, a case opens in the CX central queue (D-17)');
select is((select array_agg(distinct status) from public.response_flags where response_id = (select id from t where k = 'auto')),
  array['converted'], 'the response''s flags are converted to the auto case');
select ok((select reference from public.cases where response_id = (select id from t where k = 'auto')) ~ '^CASE-\d{4}-\d{5}$',
  'case references look like CASE-YYYY-NNNNN');
update public.flag_rules set auto_create_case = false where key = 'low_csat';

-- ---------------------------------------------------------------------------
-- SLA working-day maths (D-18): Mon–Fri 08:00–17:00 Africa/Accra, holidays excluded
-- ---------------------------------------------------------------------------
select is(app.add_working_days('2026-11-06 10:00+00', 1), '2026-11-09 10:00+00'::timestamptz,
  'Friday 10:00 + 1 working day = Monday 10:00 (weekend skipped)');
select is(app.add_working_days('2026-11-06 18:00+00', 1), '2026-11-09 17:00+00'::timestamptz,
  'created after hours on Friday: the clock starts Monday 08:00');
select is(app.add_working_days('2026-11-07 12:00+00', 1), '2026-11-09 17:00+00'::timestamptz,
  'created on Saturday: due at the end of Monday');
select is(app.add_working_days('2026-11-09 06:00+00', 0.5), '2026-11-09 12:30+00'::timestamptz,
  'created before opening: the clock starts at 08:00');
select is(app.add_working_days('2026-12-23 09:00+00', 3), '2026-12-29 09:00+00'::timestamptz,
  'P2 (3 days) across Christmas and the weekend skips the 25th, 26th and 27th');
select is(app.add_working_days('2026-12-24 10:00+00', 1), '2026-12-28 10:00+00'::timestamptz,
  'P1 on Christmas Eve is due the next working day, Monday 28th');
select is(app.working_days_between('2026-11-06 13:00+00', '2026-11-09 12:30+00'), 0.9444::numeric,
  'Friday 13:00 → Monday 12:30 is 8.5 working hours = 0.9444 working days');
select is(app.working_days_between('2026-12-24 17:00+00', '2026-12-28 08:00+00'), 0::numeric,
  'no working time over a holiday weekend');
select results_eq($$select priority, target_working_days from public.sla_policies order by priority$$,
  $$values ('P1'::text, 1::numeric), ('P2', 3), ('P3', 5), ('P4', 10)$$, 'SLA policies follow D-18');

-- ---------------------------------------------------------------------------
-- Case lifecycle and permissions
-- ---------------------------------------------------------------------------
select results_eq($$select from_status, to_status from app.case_transitions order by 1, 2$$,
  $$values ('assigned'::text, 'in_progress'::text), ('closed', 'in_progress'), ('in_progress', 'resolved'),
           ('new', 'assigned'), ('resolved', 'closed'), ('resolved', 'in_progress')$$,
  'T-M11-103 the allowed-transition table is exactly the M11 lifecycle');

insert into t values ('consent', pg_temp.resp(3, 'NONE', null, 'ACC-EAST', 8, '+233241234567'));
insert into t values ('other_branch', pg_temp.resp(1, 'NONE', null, 'KASOA'));

create temporary table t_txt (k text primary key, v text);
insert into t_txt select 'consent_ref', reference from survey.responses where id = (select id from t where k = 'consent');
grant select on t_txt to authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
set local role authenticated;
insert into t select 'case', (public.case_create((select id from t where k = 'consent'), 'P3', 'Customer unhappy with the wait.') ->> 'id')::uuid;
select throws_ok($$select public.case_create((select id from t where k = 'consent'), 'P3', 'Again')$$, '22023', null,
  'A-75 one non-closed case per response');
select throws_ok($$select public.case_start((select id from t where k = 'case'), 1)$$, '22023', null,
  'T-M11-103 new → in progress is not allowed (assign first)');
select throws_ok($$select public.case_assign((select id from t where k = 'case'), 99, '00000000-0000-0000-0000-00000000f001')$$,
  'P0409', null, 'a stale version is refused with P0409 (optimistic locking)');
select is(public.case_assign((select id from t where k = 'case'), 1, '00000000-0000-0000-0000-00000000f001') ->> 'status',
  'assigned', 'T-M11-102 assigning moves new → assigned');
select is((select department_id from public.cases where id = (select id from t where k = 'case')),
  (select id from public.departments where code = 'CLAIMS'), 'the case takes the officer''s department');
reset role;

-- Officer scope ("A"): only assigned cases
select pg_temp.as_user('00000000-0000-0000-0000-00000000f002');
set local role authenticated;
select is((select count(*)::int from public.cases), 0, 'an officer sees no cases that are not assigned to them');
select throws_ok($$select public.case_detail((select id from t where k = 'case'))$$, 'P0002', null,
  'an officer cannot open someone else''s case');
select throws_ok($$select public.contact_reveal((select id from t where k = 'consent'), 'Follow up the complaint')$$,
  '42501', null, 'D-15 an officer cannot reveal contact details without an assigned case');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000f001');
set local role authenticated;
select is((select count(*)::int from public.cases), 1, 'the assigned officer sees their case');
select is((public.case_detail((select id from t where k = 'case')) -> 'response' ->> 'reference'),
  (select v from t_txt where k = 'consent_ref'),
  'the officer sees the linked response through the case');
select is(public.case_start((select id from t where k = 'case'), 2) ->> 'status', 'in_progress', 'assigned → in progress');
select throws_ok($$select public.contact_reveal((select id from t where k = 'consent'), 'no')$$, '22023', null,
  'a reason is required to reveal contact details');
select is(public.contact_reveal((select id from t where k = 'consent'), 'Calling back about the delay') ->> 'phone',
  '+233241234567', 'D-15 the assigned officer can reveal the consented number with a reason');
select throws_ok($$select public.case_close((select id from t where k = 'case'), 3)$$, '42501', null,
  'officers cannot close cases');
select is(public.case_resolve((select id from t where k = 'case'), 3, 'Apologised and fixed the queue.') ->> 'status',
  'resolved', 'in progress → resolved');
reset role;
select is((select count(*)::int from audit.log where action = 'pii.contact_revealed'
            and entity_id = (select id from t where k = 'consent')::text and after ->> 'reason' = 'Calling back about the delay'), 1,
  'the reveal is audited with its reason');
select is((select count(*)::int from public.case_activities where case_id = (select id from t where k = 'case')
            and type = 'contact_revealed'), 1, 'the reveal is logged on the case timeline');

select pg_temp.as_user('00000000-0000-0000-0000-00000000a001');
set local role authenticated;
select throws_ok($$select public.contact_reveal((select id from t where k = 'consent'), 'Audit sampling check')$$,
  '42501', null, 'users without pii.view cannot reveal contact details');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000b001');
set local role authenticated;
select is((select count(*)::int from public.cases where branch_id <> (select id from public.branches where code = 'ACC-EAST')), 0,
  'a branch manager sees only their branches'' cases');
select throws_ok($$select public.case_close((select id from t where k = 'case'), 4)$$, '42501', null,
  'T-DB-case-010 a branch manager cannot close a case (Rule 21)');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
set local role authenticated;
select is(public.case_close((select id from t where k = 'case'), 4) ->> 'status', 'closed', 'CX closes a resolved case');
select throws_ok($$select public.case_reopen((select id from t where k = 'case'), 5, 'Customer called again')$$, '42501', null,
  'only an Executive can reopen a closed case');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000e001');
set local role authenticated;
select throws_ok($$select public.case_reopen((select id from t where k = 'case'), 5, 'no')$$, '22023', null,
  'reopening needs a reason');
select is(public.case_reopen((select id from t where k = 'case'), 5, 'Customer called again') ->> 'status', 'in_progress',
  'an Executive reopens a closed case with a reason (closed → in progress)');
reset role;

-- Direct writes and forbidden moves are blocked by the guard.
select throws_ok($$update public.cases set priority = 'P1' where id = (select id from t where k = 'case')$$, '42501', null,
  'cases cannot be changed outside the case functions');
select set_config('app.case_write', 'on', true);
select throws_ok($$update public.cases set status = 'new' where id = (select id from t where k = 'case')$$, '22023', null,
  'T-M11-103 in progress → new is forbidden');
select throws_ok($$update public.cases set status = 'closed', closed_at = now(), resolved_at = now() where id = (select id from t where k = 'case')$$,
  '22023', null, 'T-M11-103 in progress → closed is forbidden (must be resolved first)');
select throws_ok($$update public.cases set status = 'resolved', resolved_at = now()
  where id = (select id from public.cases where response_id = (select id from t where k = 'auto'))$$, '22023', null,
  'T-M11-103 new → resolved is forbidden');
select set_config('app.case_write', 'off', true);
select throws_ok($$delete from public.cases where id = (select id from t where k = 'case')$$, '42501', null, 'cases are never deleted');
select throws_ok($$update public.case_activities set body = 'x' where case_id = (select id from t where k = 'case')$$, '42501', null,
  'the case timeline is append-only');

-- Flag review
insert into t select 'other_flag', id from public.response_flags
 where response_id = (select id from t where k = 'other_branch') limit 1;
select pg_temp.as_user('00000000-0000-0000-0000-00000000b001');
set local role authenticated;
select is(public.flag_dismiss(array[(select id from t where k = 'other_flag')], 'Not ours'), 0, 'a branch manager cannot dismiss another branch''s flags');
select throws_ok($$select public.flag_dismiss(array[(select id from public.response_flags where response_id = (select id from t where k = 'low'))], '')$$,
  '22023', null, 'dismissing needs a reason');
select is(public.flag_dismiss(array(select id from public.response_flags where response_id in
  (select id from t where k in ('low', 'factor'))), 'Handled at the counter'), 2, 'bulk dismiss with a reason');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
set local role authenticated;
select is(public.flag_convert_to_case((select id from public.response_flags where response_id = (select id from t where k = 'kw'))) ->> 'created',
  'true', 'converting a flag creates a case');
select is((select source from public.cases where response_id = (select id from t where k = 'kw')), 'flag', 'the case records its source');
reset role;

select * from finish();
rollback;
