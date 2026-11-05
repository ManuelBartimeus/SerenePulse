-- Removes the sample data (D-46) before go-live: every survey session, response, contact request,
-- flag, case, alert, notification, email and roll-up, plus the outbox; deactivates the sample staff
-- (@demo.sereneinsurance.test) and revokes their roles. Configuration, real users and the audit log
-- are kept. Run through `node scripts/seed-demo.mjs <env> --clear`.
\set ON_ERROR_STOP on
begin;
truncate survey.events, survey.response_device_cooldowns, pii.contact_requests, public.case_activities,
  public.response_flags, public.cases, survey.attribution_corrections, public.alert_events,
  public.notifications, public.email_log, survey.responses, survey.sessions, survey.reference_counters,
  app.case_counters, analytics.responses_daily, analytics.responses_monthly, analytics.sessions_daily;
select pgmq.purge_queue('events');

update public.departments set head_user_id = null
 where head_user_id in (select id from auth.users where email like '%@demo.sereneinsurance.test');
update public.user_role_grants set status = 'revoked', revoked_at = now()
 where status = 'active' and user_id in (select id from auth.users where email like '%@demo.sereneinsurance.test');
update public.profiles set status = 'deactivated'
 where user_id in (select id from auth.users where email like '%@demo.sereneinsurance.test');

select audit.append('demo.cleared', 'system', null, null, null, 'system');
commit;
select 'sample data cleared';
