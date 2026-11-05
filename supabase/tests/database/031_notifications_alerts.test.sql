-- MS-11 notifications, outbox, email queue, SLA timer, alerts (T-M12-100, T-M14-001), case metrics.
-- Uses C's analytics.v_responses_effective / analytics.filtered_responses when they exist; otherwise a
-- throwaway stand-in is created inside this (rolled-back) transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

do $$
begin
  if to_regclass('analytics.v_responses_effective') is null then
    execute $v$create view analytics.v_responses_effective as
      select r.id, r.issuing_branch_id, r.region_id_at_submission as region_id, r.service_channel_id, r.insurance_product_id,
             r.improvement_factor_id, r.csat_score, r.ces_score, r.nps_score, r.verification = 'verified' as is_verified,
             r.submitted_at, (r.submitted_at at time zone 'Africa/Accra')::date as local_date
      from survey.responses r$v$;
    execute $f$create function analytics.filtered_responses(p_filters jsonb)
      returns setof analytics.v_responses_effective language sql stable security definer set search_path = '' as $b$
        select v.* from analytics.v_responses_effective v
        where v.is_verified
          and v.local_date between coalesce((p_filters ->> 'from')::date, (now() at time zone 'Africa/Accra')::date - 29)
                               and coalesce((p_filters ->> 'to')::date, (now() at time zone 'Africa/Accra')::date)
          and (app.org_scope() or v.issuing_branch_id = any (app.branch_ids()))
      $b$ $f$;
  end if;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e001', 'exec@example.test'),
  ('00000000-0000-0000-0000-00000000c001', 'cx@example.test'),
  ('00000000-0000-0000-0000-00000000b001', 'bm@example.test'),
  ('00000000-0000-0000-0000-00000000f001', 'officer@example.test'),
  ('00000000-0000-0000-0000-00000000d001', 'head@example.test');
update public.profiles set status = 'active', must_change_password = false, display_name = 'User ' || right(user_id::text, 4)
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
             ('00000000-0000-0000-0000-00000000d001', 'resolution_officer')) g(u, k)
join public.roles r on r.key = g.k;

create or replace function pg_temp.as_user(p_user text)
returns void language sql as $$
  select set_config('request.jwt.claims', (public.custom_access_token_hook(jsonb_build_object('user_id', p_user::uuid,
    'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated'))) -> 'claims')::text, true)::text is not null
$$;
create temporary sequence t_ref;
create or replace function pg_temp.resp(p_csat int, p_at timestamptz default now())
returns uuid language plpgsql as $$
declare
  v_session uuid;
  v_id uuid;
begin
  insert into survey.sessions (session_secret_hash, device_id_hash, source_id, survey_version_id, status)
  values (extensions.gen_random_bytes(16), extensions.gen_random_bytes(16), (select id from public.survey_sources where code = 'direct'),
          (select id from public.survey_versions where status = 'published'), 'submitted')
  returning id into v_session;
  insert into survey.responses (reference, session_id, survey_version_id, source_id, service_channel_id, branch_status,
    issuing_branch_id, region_id_at_submission, insurance_product_id, csat_score, ces_score, nps_score,
    improvement_factor_id, opened_at, submitted_at)
  select 'FB-2026-8' || lpad(nextval('t_ref')::text, 5, '0'), v_session, s.survey_version_id, s.source_id,
         (select id from public.service_channels where code = 'WALK_IN'), 'selected', b.id, b.region_id,
         (select id from public.insurance_products where code = 'MOTOR'), p_csat, 3, 8,
         (select id from public.improvement_factors where code = 'NONE'), p_at, p_at
  from survey.sessions s, public.branches b where s.id = v_session and b.code = 'ACC-EAST'
  returning id into v_id;
  return v_id;
end;
$$;
create temporary table t (k text primary key, id uuid);
grant select, insert on t to authenticated;

-- Start from an empty view of the queue so counts below are exact.
select count(*) >= 0 from ops.process_outbox(1000);
delete from public.notifications where user_id::text like '00000000-0000-0000-0000-00000000%';

insert into t values ('r1', pg_temp.resp(2));
-- An Executive opens the case, so the CX Administrator (not the actor) is notified.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e001');
set local role authenticated;
insert into t select 'case', (public.case_create((select id from t where k = 'r1'), 'P2', 'Waited three hours.') ->> 'id')::uuid;
reset role;

-- ---------------------------------------------------------------------------
-- Outbox consumer: dispatch, idempotency, unknown types (T-M14-001)
-- ---------------------------------------------------------------------------
select ok((ops.process_outbox() ->> 'handled')::int >= 2, 'the outbox dispatches flag.created and case.created');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000c001'
            and type = 'case.created'), 1, 'CX Administrators get an in-app notice for a new case (D-17)');
select is((select count(*)::int from public.email_log where to_user_id = '00000000-0000-0000-0000-00000000c001'
            and template = 'case_created' and status = 'queued'), 1, '…and a queued email');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000b001'
            and type = 'flag.created'), 1, 'the walk-in branch''s manager is told about the flag in-app');
select is((select count(*)::int from public.email_log where to_user_id = '00000000-0000-0000-0000-00000000b001'
            and notification_type = 'flag.created'), 0, 'flag notices are not emailed one by one (hourly digest)');
select is(ops.process_outbox() ->> 'handled', '0', 'a second run finds nothing to do');
select lives_ok($$select ops.dispatch_event(a.msg_id, a.message) from pgmq.a_events a where a.message ->> 'type' = 'case.created'
                  and a.message ->> 'case_id' = (select id from t where k = 'case')::text$$,
  'replaying an archived message is harmless');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000c001'
            and type = 'case.created'), 1, 'replay does not duplicate notifications (idempotent)');
select is((select count(*)::int from public.email_log where to_user_id = '00000000-0000-0000-0000-00000000c001'
            and template = 'case_created'), 1, 'replay does not duplicate emails (idempotent)');

select count(*) = 1 from pgmq.send('events', '{"type":"something.unknown"}'::jsonb);
select is(ops.process_outbox() ->> 'ignored', '1', 'unknown event types are archived as ignored');
select ok(exists (select 1 from pgmq.a_events where message ->> 'type' = 'something.unknown'), 'and moved to the archive');

select count(*) = 1 from pgmq.send('events', jsonb_build_object('type', 'security.lockout',
  'user_id', '00000000-0000-0000-0000-00000000f001', 'at', now()));
select count(*) >= 0 from ops.process_outbox();
select results_eq($$select template, priority, status from public.email_log where to_user_id = '00000000-0000-0000-0000-00000000f001'
                    and notification_type = 'security.lockout'$$,
  $$values ('security_lockout'::text, 'high'::text, 'queued'::text)$$, 'security.lockout queues a high-priority email');

-- ---------------------------------------------------------------------------
-- Preferences (security emails can't be turned off)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000f001');
set local role authenticated;
select throws_ok($$insert into public.notification_preferences (user_id, type, email_enabled)
  values ('00000000-0000-0000-0000-00000000f001', 'security.new_device', false)$$, '22023', null,
  'security emails cannot be turned off');
select lives_ok($$insert into public.notification_preferences (user_id, type, email_enabled)
  values ('00000000-0000-0000-0000-00000000f001', 'case.assigned', false)$$, 'a user can turn off assignment emails');
select throws_ok($$insert into public.notification_preferences (user_id, type, email_enabled)
  values ('00000000-0000-0000-0000-00000000c001', 'case.assigned', false)$$, '42501', null,
  'nobody can change someone else''s preferences');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
set local role authenticated;
select is(public.case_assign((select id from t where k = 'case'), 1, '00000000-0000-0000-0000-00000000f001') ->> 'status', 'assigned',
  'assign to the officer');
select ok(public.case_add_note((select id from t where k = 'case'), '@officer please call back today',
  array['00000000-0000-0000-0000-00000000f001'::uuid]) > 0, 'add a note with a mention');
reset role;
select count(*) >= 0 from ops.process_outbox();
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000f001'
            and type in ('case.assigned', 'case.mention')), 2, 'the officer is told about the assignment and the mention');
select is((select status from public.email_log where to_user_id = '00000000-0000-0000-0000-00000000f001'
            and template = 'case_assigned'), 'skipped', 'the assignment email respects the officer''s preference');

select pg_temp.as_user('00000000-0000-0000-0000-00000000f001');
set local role authenticated;
select is((select count(*)::int from public.notifications where user_id <> '00000000-0000-0000-0000-00000000f001'), 0,
  'users see only their own notifications');
select is(public.notifications_mark_read(), 2, 'mark all read');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'nothing unread');
select is(public.case_start((select id from t where k = 'case'), 2) ->> 'status', 'in_progress', 'officer starts work');
select is(public.case_escalate((select id from t where k = 'case'), 3, 'Needs the claims head') ->> 'escalation_level', '1',
  'escalation goes to level 1 (department head, D-20)');
reset role;
select count(*) >= 0 from ops.process_outbox();
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000d001'
            and type = 'case.escalated'), 1, 'the department head is notified of the escalation');

-- ---------------------------------------------------------------------------
-- SLA timer: warning at 75 %, breach → automatic escalation one level (A-112)
-- ---------------------------------------------------------------------------
select set_config('app.case_write', 'on', true);
update public.cases set sla_warning_due_at = now() - interval '2 hours', target_resolution_at = now() - interval '1 hour'
 where id = (select id from t where k = 'case');
select set_config('app.case_write', 'off', true);
select is(ops.sla_tick(), '{"warnings": 0, "breaches": 1}'::jsonb, 'a past-due case is breached on the next tick');
select results_eq($$select escalation_level, sla_breached_at is not null from public.cases where id = (select id from t where k = 'case')$$,
  $$values (2::smallint, true)$$, 'the breach escalates one level (to CX Administrator)');
select is((select count(*)::int from public.case_activities where case_id = (select id from t where k = 'case')
            and type in ('sla_breached', 'escalated')), 3, 'the timeline records the breach and both escalations');
select is(ops.sla_tick(), '{"warnings": 0, "breaches": 0}'::jsonb, 'a breach is recorded once');
select is((select count(*)::int from public.alert_events e join public.alert_rules r on r.id = e.rule_id
            where r.type = 'sla_case' and e.scope_id = (select id from t where k = 'case')), 1,
  'the SLA alert rule records the breach');

-- ---------------------------------------------------------------------------
-- Alerts: threshold, dedupe by rule + scope + window, 24 h cooldown (T-M12-100)
-- ---------------------------------------------------------------------------
select count(*) = 5 from (select pg_temp.resp(1, now() - make_interval(hours => g)) from generate_series(1, 5) g) x;
select count(*) >= 0 from ops.evaluate_alerts();
create temporary view t_neg as
  select e.* from public.alert_events e join public.alert_rules r on r.id = e.rule_id
  where r.type = 'negative_volume' and e.branch_id = (select id from public.branches where code = 'ACC-EAST');
grant select on t_neg to authenticated;
select is((select count(*)::int from t_neg), 1, 'T-M12-100 five CSAT 1–2 responses in 24 h fire one branch alert');
select ok('00000000-0000-0000-0000-00000000b001'::uuid = any ((select notified_user_ids from t_neg)::uuid[]),
  'the branch manager is a recipient');
select count(*) >= 0 from ops.evaluate_alerts();
select is((select count(*)::int from t_neg), 1, 'a second evaluation does not fire again (cooldown)');
update public.alert_events set fired_at = now() - interval '25 hours' where id = (select id from t_neg);
select count(*) >= 0 from ops.evaluate_alerts();
select is((select count(*)::int from t_neg), 1, 'after the cooldown the same window is still deduplicated');
update public.alert_events set window_key = '2000-01-01' where id = (select id from t_neg);
select count(*) >= 0 from ops.evaluate_alerts();
select is((select count(*)::int from t_neg), 2, 'a new window after the cooldown fires again');

select pg_temp.as_user('00000000-0000-0000-0000-00000000f001');
set local role authenticated;
select throws_ok($$select public.alert_acknowledge((select id from t_neg order by fired_at desc limit 1))$$, '42501', null,
  'acknowledging needs alerts.manage');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
set local role authenticated;
select is(public.alert_acknowledge((select id from t_neg order by fired_at desc limit 1)) ->> 'status', 'acknowledged',
  'CX acknowledges an alert');
select ok((public.needs_attention() ->> 'fired_alerts')::int >= 1 and public.needs_attention() ? 'open_flags'
          and public.needs_attention() ? 'overdue_cases', 'needs_attention returns the three counts');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000e001');
set local role authenticated;
select ok((public.case_metrics('{}'::jsonb) ->> 'created')::int >= 1, 'case_metrics counts cases on filtered responses');
reset role;

-- ---------------------------------------------------------------------------
-- Email queue: budget, retries with backoff, failure with a reason (A-129)
-- ---------------------------------------------------------------------------
update public.email_log set status = 'skipped' where status = 'queued' and to_user_id::text not like '00000000-0000-0000-0000-00000000%';
update public.settings set value = '2' where key = 'email_daily_budget';
select is(jsonb_array_length(public.email_claim(50)), 2, 'claims stop at the daily budget');
select is(jsonb_array_length(public.email_claim(50)), 0, 'nothing more today once the budget is used');
select is(public.email_report((select id from public.email_log where status = 'sending' order by created_at limit 1), false, null,
  'SMTP login refused (535)', true), 'retry', 'a failed send is retried');
select ok((select next_attempt_at > now() from public.email_log where last_error = 'SMTP login refused (535)'),
  'with a backoff delay');
update public.email_log set attempts = 5, status = 'sending' where last_error = 'SMTP login refused (535)';
select is(public.email_report((select id from public.email_log where last_error = 'SMTP login refused (535)'), false, null,
  'SMTP login refused (535)', true), 'failed', 'after five attempts the email ends failed with its reason');

select * from finish();
rollback;
