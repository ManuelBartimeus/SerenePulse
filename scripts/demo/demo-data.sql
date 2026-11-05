-- Sample data for a realistic, in-use portal (D-46, user direction 2026-11-05: sample data on
-- production until go-live). Run only through `node scripts/seed-demo.mjs`, which creates the
-- sample staff accounts first (emails @demo.sereneinsurance.test).
--
-- 1. Clears ALL feedback activity: sessions, responses, contact requests, flags, cases, alerts,
--    notifications, emails, roll-ups, counters, the outbox. Configuration, users and the audit
--    log are kept. (TRUNCATE does not fire the row-level immutability triggers.)
-- 2. Activates the sample staff with their roles.
-- 3. Generates ~4 months of survey sessions and responses with realistic patterns, then reviews
--    flags, opens and works cases, raises a few alerts and notifications.
-- Everything is deterministic (setseed) so reruns produce the same picture.
\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- 1. Clear previous feedback activity
-- ---------------------------------------------------------------------------
truncate survey.events, survey.response_device_cooldowns, pii.contact_requests, public.case_activities,
  public.response_flags, public.cases, survey.attribution_corrections, public.alert_events,
  public.notifications, public.email_log, survey.responses, survey.sessions, survey.reference_counters,
  app.case_counters, analytics.responses_daily, analytics.responses_monthly, analytics.sessions_daily;
select pgmq.purge_queue('events');

-- ---------------------------------------------------------------------------
-- 2. Sample staff (created in Auth by seed-demo.mjs) → active profiles and roles
-- ---------------------------------------------------------------------------
create temporary table demo_staff (email text primary key, name text, role text, branch text, dept text) on commit drop;
insert into demo_staff values
  ('ama.owusu@demo.sereneinsurance.test', 'Ama Owusu', 'cx_admin', null, 'CX'),
  ('kwame.asante@demo.sereneinsurance.test', 'Kwame Asante', 'cx_admin', null, 'CX'),
  ('esi.quaye@demo.sereneinsurance.test', 'Esi Quaye', 'executive', null, null),
  ('efua.mensah@demo.sereneinsurance.test', 'Efua Mensah', 'resolution_officer', null, 'CX'),
  ('yaw.boateng@demo.sereneinsurance.test', 'Yaw Boateng', 'resolution_officer', null, 'OPERATIONS'),
  ('abena.darko@demo.sereneinsurance.test', 'Abena Darko', 'resolution_officer', null, 'CLAIMS'),
  ('kofi.appiah@demo.sereneinsurance.test', 'Kofi Appiah', 'resolution_officer', null, 'IT_DIGITAL'),
  ('adwoa.badu@demo.sereneinsurance.test', 'Adwoa Badu', 'branch_manager', 'ACC-MAIN', null),
  ('kwabena.osei@demo.sereneinsurance.test', 'Kwabena Osei', 'branch_manager', 'KSI-MAIN', null),
  ('akosua.frimpong@demo.sereneinsurance.test', 'Akosua Frimpong', 'branch_manager', 'KASOA', null),
  ('selorm.agbeko@demo.sereneinsurance.test', 'Selorm Agbeko', 'branch_manager', 'HO', null),
  ('mohammed.issah@demo.sereneinsurance.test', 'Mohammed Issah', 'branch_manager', 'TAMALE', null);

update public.profiles p
   set display_name = s.name, status = 'active', must_change_password = false,
       department_id = (select d.id from public.departments d where d.code = s.dept),
       last_login_at = now() - (random() * interval '5 days')
  from demo_staff s join auth.users u on lower(u.email) = s.email
 where p.user_id = u.id;

insert into public.user_role_grants (user_id, role_id, scope_type, scope_id, status, approved_at)
select u.id, r.id, case when s.branch is null then 'organisation' else 'branch' end,
       (select b.id from public.branches b where b.code = s.branch), 'active', now()
  from demo_staff s
  join auth.users u on lower(u.email) = s.email
  join public.roles r on r.key = s.role
 where not exists (select 1 from public.user_role_grants g where g.user_id = u.id and g.role_id = r.id and g.status = 'active');

-- Department heads, so escalations have somewhere to go.
update public.departments d set head_user_id = u.id
  from demo_staff s join auth.users u on lower(u.email) = s.email
 where d.code = s.dept and s.role = 'resolution_officer' and d.head_user_id is null;

-- ---------------------------------------------------------------------------
-- 3. Survey activity
-- ---------------------------------------------------------------------------
select setseed(0.20261105);

create temporary table w_channel (code text, w numeric, q numeric) on commit drop;
insert into w_channel values ('WALK_IN', 46, 0.02), ('MOBILE_APP', 15, -0.06), ('WEBSITE', 9, -0.02),
  ('PHONE', 10, -0.05), ('WHATSAPP', 8, 0.0), ('AGENT_BROKER', 10, 0.04), ('OTHER', 2, -0.03);
create temporary table w_branch (code text, w numeric, q numeric) on commit drop;
insert into w_branch values ('ACC-MAIN', 14, 0.09), ('KSI-MAIN', 12, 0.03), ('TEMA-C25', 9, 0.02),
  ('ACC-EAST', 9, 0.0), ('KASOA', 8, -0.16), ('TAKORADI', 8, 0.01), ('ACC-WEST', 7, -0.02),
  ('LAPAZ', 6, -0.09), ('TEMA-C11', 6, 0.04), ('KSI-NORTH', 6, -0.04), ('TAMALE', 5, 0.06),
  ('HO', 5, 0.08), ('TECHIMAN', 5, -0.01);
create temporary table w_product (code text, w numeric) on commit drop;
insert into w_product values ('MOTOR', 46), ('FIRE', 14), ('TRAVEL', 9), ('GEN-ACC', 10), ('MARINE', 5),
  ('ENGINEERING', 5), ('WORKMEN', 5), ('BONDS', 5), ('OTHER', 1);

create or replace function pg_temp.pick(p_table text) returns text language plpgsql volatile as $$
declare v_code text;
begin
  execute format('with t as (select code, sum(w) over (order by code) as c, sum(w) over () as total from %I)
                  select code from t where c >= (select random() * max(total) from t) order by c limit 1', p_table)
    into v_code;
  return v_code;
end $$;

create or replace function pg_temp.comment_for(p_csat int, p_factor text, p_channel text) returns text
language sql volatile as $$
  select (case
    when p_csat >= 4 then (array[
      'The staff at the counter were very helpful and explained everything clearly.',
      'Quick and easy. I was done in less than twenty minutes.',
      'Renewing on the app was smooth, I did it from my office.',
      'Very professional service. The officer took time to explain the cover.',
      'I got my sticker the same day. Thank you.',
      'Good experience overall, the waiting area was comfortable.',
      'My agent handled everything and kept me informed.',
      'Clear explanation of what the policy covers and what it does not.'])[1 + floor(random() * 8)::int]
    when p_csat = 3 then (array[
      'Service was okay but the queue was long.',
      'It took a while but I eventually got what I needed.',
      'The process is fine, but there were too many forms to fill.',
      'I had to call twice before someone could help me.',
      'Decent service. The app could be faster.'])[1 + floor(random() * 5)::int]
    when p_factor = 'SPEED' then (array[
      'I waited over an hour before anyone attended to me.',
      'Only one officer was serving and the line was not moving.',
      'Too slow. I came back two times for the same policy.'])[1 + floor(random() * 3)::int]
    when p_factor = 'TECH' then (array[
      'The app kept logging me out when I tried to pay.',
      'Payment went through on MoMo but the policy did not show on the website.',
      'The website was down when I tried to renew.'])[1 + floor(random() * 3)::int]
    when p_factor = 'PRICE' then (array[
      'I was charged more than the quote I was given.',
      'The premium went up a lot this year and nobody explained why.',
      'Still waiting for my refund after cancelling the policy.'])[1 + floor(random() * 3)::int]
    when p_factor = 'COMMS' then (array[
      'Nobody called me back about my claim even after two weeks.',
      'I received different answers from different staff.',
      'My claim has not been paid for months and nobody tells me anything.'])[1 + floor(random() * 3)::int]
    when p_factor = 'STAFF' then (array[
      'The officer was rude and on the phone most of the time.',
      'Staff did not seem to know the product well.'])[1 + floor(random() * 2)::int]
    else (array[
      'Too many documents were requested for a simple renewal.',
      'The process was confusing and nobody guided me.',
      'I expected better service from an insurance company.'])[1 + floor(random() * 3)::int]
  end)
$$;

create temporary table gen on commit drop as
with base as (
  select i,
         -- ~4 months, fewer on Sundays, slightly more recently (growing awareness of the survey)
         (date_trunc('day', now()) - (floor(power(random(), 1.15) * 120)::int || ' days')::interval
           + make_interval(hours => 8 + floor(random() * 9)::int, mins => floor(random() * 60)::int,
                           secs => floor(random() * 60)::int)) as submitted_at,
         pg_temp.pick('w_channel') as channel,
         pg_temp.pick('w_product') as product,
         random() as r_branch, random() as r_noise, random() as r_factor, random() as r_comment,
         random() as r_consent, random() as r_source, random() as r_ces, random() as r_nps,
         random() as r_back, random() as r_dur
  from generate_series(1, 5600) i
)
select b.*,
       case when b.channel = 'WALK_IN' or (b.channel = 'OTHER' and b.r_branch < 0.5) then pg_temp.pick('w_branch') end as branch
from base b
-- Branches are closed on Sundays; online channels keep their usual volume.
where extract(dow from b.submitted_at) <> 0 or b.channel in ('MOBILE_APP', 'WEBSITE', 'WHATSAPP', 'PHONE');

alter table gen add column q numeric, add column csat int, add column ces int, add column nps int,
  add column factor text, add column comment text, add column consent boolean, add column duration_ms int;

update gen g set q = 0.77
  + coalesce((select q from w_channel c where c.code = g.channel), 0)
  + coalesce((select q from w_branch b where b.code = g.branch), 0)
  -- gradual improvement over the period
  + 0.06 * (1 - extract(epoch from now() - g.submitted_at) / (120 * 86400.0))
  + (g.r_noise - 0.5) * 0.80;
update gen set csat = case when q > 0.86 then 5 when q > 0.66 then 4 when q > 0.5 then 3 when q > 0.36 then 2 else 1 end;
update gen set ces = greatest(1, least(5, csat + case when r_ces < 0.18 then -1 when r_ces > 0.85 then 1 else 0 end));
update gen set nps = case csat
    when 5 then 8 + floor(r_nps * 3)::int
    when 4 then 7 + floor(r_nps * 3)::int
    when 3 then 5 + floor(r_nps * 4)::int
    when 2 then 2 + floor(r_nps * 5)::int
    else floor(r_nps * 5)::int end;
update gen set factor = case
    when r_factor < 0.12 then null
    when csat >= 4 and r_factor < 0.70 then 'NONE'
    when channel in ('MOBILE_APP', 'WEBSITE', 'WHATSAPP') and r_factor < 0.78 then 'TECH'
    else (array['SPEED','SPEED','SPEED','COMMS','COMMS','EASE','EASE','STAFF','PRICE','PRICE','OTHER'])[1 + floor(random() * 11)::int] end;
update gen set comment = case when r_comment < (case when csat <= 2 then 0.62 else 0.28 end)
                              then pg_temp.comment_for(csat, factor, channel) end,
               consent = r_consent < (case when csat <= 2 then 0.32 else 0.06 end),
               duration_ms = (17000 + power(r_dur, 1.8) * 70000)::int;

-- Sessions for every response, plus abandoned ones for the completion page.
create temporary table gen_sess on commit drop as
select g.i, gen_random_uuid() as id, g.submitted_at - make_interval(secs => g.duration_ms / 1000.0 + 3) as opened_at,
       g.submitted_at - make_interval(secs => g.duration_ms / 1000.0) as interactive_at
from gen g;

insert into survey.sessions (id, session_secret_hash, device_id_hash, source_id, survey_version_id, opened_at,
                             interactive_at, last_activity_at, current_page, max_page_reached, status,
                             submit_idempotency_key, navigated_back, changed_previous_answer, user_agent_class)
select s.id, extensions.digest('demo-session-' || s.id, 'sha256'), extensions.digest('demo-device-' || g.i, 'sha256'),
       (select id from public.survey_sources where code = case when g.r_source < 0.62 then 'sms' else 'direct' end),
       (select id from public.survey_versions where status = 'published'),
       s.opened_at, s.interactive_at, g.submitted_at, 5, 5, 'submitted', gen_random_uuid(),
       g.r_back < 0.12, g.r_back < 0.07,
       case when g.r_dur < 0.78 then 'mobile' when g.r_dur < 0.88 then 'tablet' else 'desktop' end
from gen g join gen_sess s on s.i = g.i;

insert into survey.sessions (session_secret_hash, device_id_hash, source_id, survey_version_id, opened_at,
                             interactive_at, last_activity_at, current_page, max_page_reached, status,
                             abandoned_at_page, user_agent_class)
select extensions.digest('demo-abandoned-' || a, 'sha256'), extensions.digest('demo-abandoned-device-' || a, 'sha256'),
       (select id from public.survey_sources where code = t.src),
       (select id from public.survey_versions where status = 'published'),
       t.opened, case when t.page > 1 or random() < 0.7 then t.opened + interval '3 seconds' end,
       t.opened + interval '40 seconds', t.page, t.page, 'expired', t.page, 'mobile'
from generate_series(1, 1400) a
cross join lateral (select date_trunc('day', now()) - (floor(random() * 120)::int || ' days')::interval
                             + make_interval(hours => 8 + floor(random() * 10)::int) as opened,
                           (array[1,1,1,1,2,2,2,3,3,4,5])[1 + floor(random() * 11)::int] as page,
                           case when random() < 0.6 then 'sms' else 'direct' end as src) t;

-- Responses, numbered in submission order (the flagging and roll-up triggers run on insert).
insert into survey.responses (reference, session_id, survey_version_id, source_id, service_channel_id, branch_status,
  issuing_branch_id, region_id_at_submission, insurance_product_id, csat_score, ces_score, nps_score,
  improvement_factor_id, comment, contact_consent, verification, opened_at, interactive_at, submitted_at,
  completion_duration_ms, navigated_back, changed_previous_answer)
select 'FB-' || extract(year from g.submitted_at)::int || '-'
         || lpad(row_number() over (partition by extract(year from g.submitted_at) order by g.submitted_at)::text, 6, '0'),
       s.id, ss.survey_version_id, ss.source_id, ch.id,
       case when b.id is not null then 'selected' when g.channel = 'OTHER' then 'not_provided' else 'not_applicable' end,
       b.id, b.region_id, p.id, g.csat, g.ces, g.nps, f.id, g.comment, g.consent, 'verified',
       s.opened_at, s.interactive_at, g.submitted_at, g.duration_ms, ss.navigated_back, ss.changed_previous_answer
from gen g
join gen_sess s on s.i = g.i
join survey.sessions ss on ss.id = s.id
join public.service_channels ch on ch.code = g.channel
join public.insurance_products p on p.code = g.product
left join public.branches b on b.code = g.branch
left join public.improvement_factors f on f.code = g.factor
order by g.submitted_at;

insert into survey.reference_counters (year, last)
select extract(year from submitted_at)::int, count(*) from survey.responses group by 1;

-- Consented contact details: numbers from a reserved-looking test range (024 000 xxxx).
insert into pii.contact_requests (response_id, phone_e164_enc, phone_hmac, first_name_enc, dek_enc, consent_text_version, created_at)
select c.id, e.phone_enc, app.hmac('phone:' || c.phone), e.first_name_enc, e.dek_enc, 'v1', c.submitted_at
from (select r.id, r.submitted_at, '+23324000' || lpad((row_number() over (order by r.submitted_at))::text, 4, '0') as phone
      from survey.responses r where r.contact_consent) c
cross join lateral pii.encrypt_contact(c.phone,
  (array['Ama','Kofi','Akua','Yaw','Esi','Kwesi','Abena','Kojo','Adjoa','Fiifi'])[1 + floor(random() * 10)::int]) e;

-- ---------------------------------------------------------------------------
-- 4. Review flags and work cases
-- ---------------------------------------------------------------------------
create temporary table officers on commit drop as
select u.id, row_number() over (order by s.email) as n, s.dept
from demo_staff s join auth.users u on lower(u.email) = s.email where s.role = 'resolution_officer';
create temporary table cx on commit drop as
select u.id from demo_staff s join auth.users u on lower(u.email) = s.email where s.role = 'cx_admin';

-- Older low-satisfaction feedback becomes cases; much of the rest is reviewed and dismissed.
create temporary table to_case on commit drop as
select distinct on (r.id) r.id as response_id, r.submitted_at, r.csat_score, r.issuing_branch_id, r.service_channel_id,
       r.insurance_product_id, r.contact_consent, f.code as factor, r.comment, fl.id as flag_id
from survey.responses r
join public.response_flags fl on fl.response_id = r.id
left join public.improvement_factors f on f.id = r.improvement_factor_id
where r.csat_score <= 2 and random() < 0.55 and r.submitted_at < now() - interval '6 hours'
order by r.id, fl.created_at;

select app.case_write(true);
create temporary table new_cases on commit drop as
select gen_random_uuid() as id, t.*, row_number() over (order by t.submitted_at) as seq,
       case when t.csat_score = 1 then 'P2' else 'P3' end as priority,
       t.submitted_at + make_interval(hours => 1 + floor(random() * 5)::int) as created_at,
       extract(epoch from now() - t.submitted_at) / 86400.0 as age_days,
       random() as r1, random() as r2,
       -- the officer in the department the case is routed to (FINANCE has none: CX handles it)
       (select o.id from officers o where o.dept = case t.factor when 'TECH' then 'IT_DIGITAL' when 'SPEED' then 'OPERATIONS'
          when 'STAFF' then 'OPERATIONS' when 'COMMS' then 'CLAIMS' else 'CX' end limit 1) as officer
from to_case t;

insert into public.cases (id, reference, response_id, has_contact_consent, branch_id, service_channel_id,
  insurance_product_id, category_id, priority, description, department_id, assigned_officer_id, status, source,
  is_escalated, escalation_level, sla_policy_id, target_resolution_at, sla_warning_due_at, sla_warning_at,
  sla_breached_at, first_response_at, resolved_at, closed_at, resolution_notes, corrective_action,
  follow_up_outcome, created_by, created_at)
select c.id, 'CASE-' || extract(year from c.created_at)::int || '-' || lpad(c.seq::text, 5, '0'), c.response_id,
       c.contact_consent, c.issuing_branch_id, c.service_channel_id, c.insurance_product_id,
       (select id from public.case_categories where code = coalesce(nullif(c.factor, 'NONE'), 'SERVICE_COMPLAINT')),
       c.priority,
       coalesce('Customer wrote: "' || c.comment || '"', 'Low satisfaction rating with no comment. Follow up to understand what went wrong.'),
       (select id from public.departments where code = case c.factor when 'TECH' then 'IT_DIGITAL' when 'PRICE' then 'FINANCE'
          when 'SPEED' then 'OPERATIONS' when 'STAFF' then 'OPERATIONS' else 'CX' end),
       case when st.status <> 'new' then c.officer end,
       st.status, 'flag', st.breached, case when st.breached then 1 else 0 end,
       sp.id, tgt.target, tgt.warn,
       case when st.breached or c.r2 < 0.3 then tgt.warn end,
       case when st.breached then tgt.target end,
       case when st.status <> 'new' then c.created_at + interval '3 hours' end,
       st.resolved_at, st.closed_at,
       case when st.resolved_at is not null then (array[
         'Called the customer, apologised and completed the outstanding request.',
         'Issue traced to a payment reconciliation delay; policy activated and customer informed.',
         'Branch reminded of queue management; customer served on a priority line.',
         'Refund processed and confirmation sent to the customer.',
         'Explained the premium change and offered a payment plan.'])[1 + floor(c.r1 * 5)::int] end,
       case when st.resolved_at is not null and c.r2 < 0.6 then (array[
         'Added a second officer at peak hours.', 'Fixed the app session timeout on payment.',
         'Refresher training on customer handling for front-desk staff.', 'Daily check of unmatched MoMo payments.'])[1 + floor(c.r2 * 4)::int] end,
       case when st.status = 'closed' then (array['contacted_resolved','contacted_resolved','not_required','unreachable'])[1 + floor(c.r1 * 4)::int] end,
       (select x.id from cx x order by md5(x.id::text || c.id::text) limit 1), c.created_at
from new_cases c
join public.sla_policies sp on sp.priority = c.priority
cross join lateral (select app.add_working_days(c.created_at, sp.target_working_days) as target,
                           app.add_working_days(c.created_at, sp.target_working_days * sp.warning_pct / 100.0) as warn) tgt
cross join lateral (
  select s.status, s.resolved_at, case when s.status = 'closed' then s.resolved_at + interval '1 day' end as closed_at,
         (coalesce(s.resolved_at, now()) > tgt.target) as breached
  from (select case
      when c.age_days > 14 then case when c.r1 < 0.72 then 'closed' else 'resolved' end
      when c.age_days > 5 then case when c.r1 < 0.4 then 'resolved' when c.r1 < 0.8 then 'in_progress' else 'assigned' end
      else case when c.r1 < 0.3 then 'new' when c.r1 < 0.7 then 'assigned' else 'in_progress' end end as status) s0
  cross join lateral (select s0.status,
      case when s0.status in ('resolved', 'closed')
           then least(now() - interval '1 hour', app.add_working_days(c.created_at, (0.5 + c.r2 * (sp.target_working_days + 1.5))::numeric))
      end as resolved_at) s
) st;

insert into app.case_counters (year, last) select extract(year from created_at)::int, count(*) from public.cases group by 1;

-- Timelines.
insert into public.case_activities (case_id, actor_user_id, type, from_value, to_value, body, created_at)
select c.id, c.created_by, 'created', null, 'new', 'Case opened from flagged feedback.', c.created_at from public.cases c
union all
select c.id, c.created_by, 'assigned', null, (select display_name from public.profiles where user_id = c.assigned_officer_id),
       null, c.first_response_at from public.cases c where c.assigned_officer_id is not null
union all
select c.id, c.assigned_officer_id, 'status_changed', 'assigned', 'in_progress', null, c.first_response_at + interval '2 hours'
  from public.cases c where c.status in ('in_progress', 'resolved', 'closed')
union all
select c.id, c.assigned_officer_id, 'note', null, null, (array[
    'Called the customer; they confirmed the details in their feedback.',
    'Checked with the branch team, waiting for the payment report.',
    'Customer asked to be called after 4pm.'])[1 + floor(random() * 3)::int],
  c.first_response_at + interval '5 hours' from public.cases c where c.status in ('in_progress', 'resolved', 'closed')
union all
select c.id, null, 'sla_breached', null, null, 'The response deadline passed; escalated one level automatically.',
       c.sla_breached_at from public.cases c where c.sla_breached_at is not null
union all
select c.id, c.assigned_officer_id, 'resolved', 'in_progress', 'resolved', c.resolution_notes, c.resolved_at
  from public.cases c where c.resolved_at is not null
union all
select c.id, (select x.id from cx x order by md5(x.id::text || c.id::text) limit 1), 'closed', 'resolved', 'closed', null, c.closed_at
  from public.cases c where c.closed_at is not null;

-- Flags: converted where a case exists; most older ones reviewed.
update public.response_flags f set status = 'converted', case_id = c.id, reviewed_at = c.created_at, reviewed_by = c.created_by
  from public.cases c where c.response_id = f.response_id;
update public.response_flags f
   set status = 'dismissed', reviewed_at = f.created_at + interval '1 day', reviewed_by = (select x.id from cx x order by md5(x.id::text || f.id::text) limit 1),
       dismissal_reason = (array['Reviewed: no follow-up needed.', 'Positive overall; noted for the branch team.',
                                 'Already being handled through another case.'])[1 + floor(random() * 3)::int]
 where f.status = 'open' and f.created_at < now() - interval '3 days' and random() < 0.8;
select app.case_write(false);

-- ---------------------------------------------------------------------------
-- 5. Alerts and notifications
-- ---------------------------------------------------------------------------
insert into public.alert_events (rule_id, scope_type, scope_id, scope_key, scope_label, branch_id, observed_value,
  threshold_value, window_key, window_from, window_to, fired_at, status, acknowledged_by, acknowledged_at)
select ar.id, 'branch', b.id, 'branch:' || b.id, b.name, b.id, v.observed, v.threshold, v.wkey,
       now() - v.ago - interval '14 days', now() - v.ago, now() - v.ago, v.status,
       case when v.status <> 'open' then (select id from cx limit 1) end,
       case when v.status <> 'open' then now() - v.ago + interval '3 hours' end
from (values
  ('csat_decline', 'KASOA', 61.0, 72.0, 'demo-1', interval '2 days', 'open'),
  ('negative_volume', 'LAPAZ', 6, 5, 'demo-2', interval '9 days', 'acknowledged'),
  ('repeated_factor', 'ACC-WEST', 44.0, 40.0, 'demo-3', interval '20 days', 'resolved')
) as v(rule_key, branch, observed, threshold, wkey, ago, status)
join public.alert_rules ar on ar.key = v.rule_key
join public.branches b on b.code = v.branch;

insert into public.notifications (user_id, type, title, body, link, created_at, read_at)
select p.user_id, n.type, n.title, n.body, n.link, now() - n.ago, case when n.read then now() - n.ago + interval '1 hour' end
from public.profiles p
cross join (values
  ('alert.fired', 'Sudden drop in branch satisfaction · Kasoa', 'Satisfied customers at Kasoa fell to 61% over the last two weeks.', '/alerts', interval '2 days', false),
  ('case.sla_warning', 'A case is close to its response deadline', 'Open the case to see what is outstanding.', '/cases', interval '1 day', false),
  ('flag.created', 'New flagged feedback', 'Several responses are waiting for review.', '/flags', interval '5 hours', false),
  ('report.ready', 'Weekly branch report is ready', 'Download it from Reports.', '/reports/files', interval '4 days', true)
) as n(type, title, body, link, ago, read)
where p.status = 'active';

-- Session funnel roll-up for the recent window (older days come from responses_daily).
select analytics.refresh_sessions_days((now() - interval '29 days')::date, now()::date);

-- Keep the staff "last sign-in" plausible and record the run.
insert into ops.job_runs (job, started_at, finished_at, status, detail)
values ('demo.seed', now(), now(), 'succeeded',
        jsonb_build_object('responses', (select count(*) from survey.responses), 'cases', (select count(*) from public.cases)));
select audit.append('demo.seeded', 'system', null, null,
  jsonb_build_object('responses', (select count(*) from survey.responses), 'cases', (select count(*) from public.cases)), 'system');

commit;

select 'responses' as what, count(*) from survey.responses
union all select 'sessions', count(*) from survey.sessions
union all select 'flags', count(*) from public.response_flags
union all select 'cases', count(*) from public.cases
union all select 'contact requests', count(*) from pii.contact_requests;
