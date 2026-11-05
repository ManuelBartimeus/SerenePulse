-- Plain-language wording for text the database writes (user direction 2026-11-05: no jargon such
-- as SLA, CSAT, NPS, "n"). Same function bodies as 202611090002 except the user-visible strings;
-- data updates touch only rows still holding the original seeded wording.

create or replace function ops.sla_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases;
  v_rule public.alert_rules;
  v_warn int := 0;
  v_breach int := 0;
begin
  select * into v_rule from public.alert_rules where type = 'sla_case' and is_active order by created_at limit 1;
  for v_case in
    select * from public.cases
     where status in ('new', 'assigned', 'in_progress') and sla_warning_at is null and sla_warning_due_at <= now()
       and target_resolution_at > now()
     order by sla_warning_due_at for update skip locked
  loop
    perform app.case_write(true);
    update public.cases set sla_warning_at = now() where id = v_case.id returning * into v_case;
    perform app.case_write(false);
    perform app.case_activity(v_case.id, 'sla_warning', null, null,
      'The case has used ' || (select warning_pct from public.sla_policies where id = v_case.sla_policy_id)
      || '% of its resolution time.');
    perform app.case_event('case.sla_warning', v_case.id);
    if v_rule.id is not null then
      perform app.alert_fire(v_rule, 'case', v_case.id, 'case:' || v_case.id, v_case.reference, v_case.branch_id, null,
        null, 'warning', v_case.created_at, v_case.target_resolution_at, jsonb_build_object('stage', 'warning'));
    end if;
    v_warn := v_warn + 1;
  end loop;

  for v_case in
    select * from public.cases
     where status in ('new', 'assigned', 'in_progress') and sla_breached_at is null and target_resolution_at <= now()
     order by target_resolution_at for update skip locked
  loop
    perform app.case_write(true);
    update public.cases set sla_breached_at = now(), sla_warning_at = coalesce(sla_warning_at, now())
     where id = v_case.id returning * into v_case;
    perform app.case_write(false);
    perform app.case_activity(v_case.id, 'sla_breached', null, null, 'The resolution target has passed.');
    perform app.case_event('case.sla_breached', v_case.id);
    perform app.case_escalate_one(v_case, 'Escalated automatically: the response deadline passed.');
    if v_rule.id is not null then
      -- A breach is a different window from the warning, so it is not suppressed by the warning's cooldown.
      if not exists (select 1 from public.alert_events e where e.rule_id = v_rule.id and e.scope_key = 'case:' || v_case.id
                     and e.window_key = 'breach') then
        insert into public.alert_events (rule_id, scope_type, scope_id, scope_key, scope_label, branch_id, window_key,
          window_from, window_to, detail, notified_user_ids)
        values (v_rule.id, 'case', v_case.id, 'case:' || v_case.id, v_case.reference, v_case.branch_id, 'breach',
          v_case.created_at, v_case.target_resolution_at, '{"stage":"breach"}'::jsonb,
          app.alert_recipients(v_rule, v_case.branch_id))
        on conflict do nothing;
        perform pgmq.send('events', jsonb_build_object('type', 'alert.fired', 'alert_event_id',
          (select e.id from public.alert_events e where e.rule_id = v_rule.id and e.scope_key = 'case:' || v_case.id
             and e.window_key = 'breach'), 'at', now()));
      end if;
    end if;
    v_breach := v_breach + 1;
  end loop;
  return jsonb_build_object('warnings', v_warn, 'breaches', v_breach);
end;
$$;

create or replace function ops.dispatch_event(p_msg_id bigint, p_msg jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p_msg ->> 'type';
  v_case public.cases;
  v_event public.alert_events;
  v_rule public.alert_rules;
  v_actor uuid := nullif(p_msg ->> 'actor_id', '')::uuid;
  v_key text := 'msg:' || p_msg_id;
  v_link text;
  v_users uuid[];
  u uuid;
  v_branch text;
begin
  if v_type = 'response.submitted' then
    return 'archived';
  end if;

  if v_type in ('security.lockout', 'security.new_device') then
    perform app.notify((p_msg ->> 'user_id')::uuid, v_type,
      case v_type when 'security.lockout' then 'Your Serene CX account was locked'
                  else 'New sign-in to your Serene CX account' end,
      case v_type
        when 'security.lockout' then 'After 5 failed sign-in attempts your account is locked for 15 minutes. If this wasn''t you, tell your system administrator.'
        else 'Your account signed in from a new device or browser at '
             || to_char(coalesce((p_msg ->> 'at')::timestamptz, now()) at time zone 'Africa/Accra', 'DD/MM/YYYY HH24:MI')
             || ' (Accra time). If this wasn''t you, change your password and tell your system administrator.' end,
      '/profile', false, true, v_key || ':' || (p_msg ->> 'user_id'), '{}'::jsonb, 'high');
    return 'handled';
  end if;

  if v_type = 'flag.created' then
    v_branch := (select b.name from public.branches b where b.id = nullif(p_msg ->> 'branch_id', '')::uuid);
    v_users := array(select app.users_with_role('cx_admin')
                     union select app.users_with_role('branch_manager', (p_msg ->> 'branch_id')::uuid)
                           where nullif(p_msg ->> 'branch_id', '') is not null);
    foreach u in array v_users loop
      perform app.notify(u, 'flag.created', 'New flagged feedback' || coalesce(' · ' || v_branch, ''),
        'A response was flagged by ' || (p_msg ->> 'flags') || ' rule(s) and is waiting for review.', '/flags',
        true, false, v_key || ':' || u,
        jsonb_build_object('entity_type', 'response', 'entity_id', p_msg ->> 'response_id'));
    end loop;
    return 'handled';
  end if;

  if v_type = 'alert.fired' then
    select * into v_event from public.alert_events where id = (p_msg ->> 'alert_event_id')::uuid;
    if v_event.id is null then
      return 'ignored';
    end if;
    select * into v_rule from public.alert_rules where id = v_event.rule_id;
    foreach u in array v_event.notified_user_ids loop
      perform app.notify(u, 'alert.fired', v_rule.name || ': ' || v_event.scope_label,
        coalesce('Observed ' || v_event.observed_value || coalesce(' against a threshold of ' || v_event.threshold_value, '')
                 || '.', 'The alert condition was met.') || ' Open the alert for details.',
        '/alerts?event=' || v_event.id, true, true, v_key || ':' || u,
        jsonb_build_object('entity_type', 'alert_event', 'entity_id', v_event.id, 'severity', v_rule.severity),
        case when v_rule.severity = 'critical' then 'high' else 'normal' end);
    end loop;
    return 'handled';
  end if;

  if v_type like 'case.%' then
    select * into v_case from public.cases where id = (p_msg ->> 'case_id')::uuid;
    if v_case.id is null then
      return 'ignored';
    end if;
    v_link := '/cases/' || v_case.id;
    case v_type
      when 'case.created' then
        v_users := array(select app.users_with_role('cx_admin'));
      when 'case.assigned' then
        v_users := coalesce(array_remove(array[coalesce(v_case.assigned_officer_id, app.case_department_head(v_case))], null),
                            '{}'::uuid[]);
      when 'case.reopened' then
        v_users := coalesce(array_remove(array[v_case.assigned_officer_id], null), '{}'::uuid[]);
      when 'case.escalated' then
        v_users := app.escalation_recipients(v_case, coalesce((p_msg ->> 'level')::int, v_case.escalation_level));
        if cardinality(v_users) = 0 then
          v_users := array(select app.users_with_role('cx_admin'));  -- no department head: the CX queue owns it
        end if;
      when 'case.mention' then
        v_users := array(select jsonb_array_elements_text(p_msg -> 'user_ids')::uuid);
      when 'case.resolved' then
        v_users := array(select app.users_with_role('cx_admin'));
      when 'case.sla_warning' then
        v_users := array_remove(array[v_case.assigned_officer_id, app.case_department_head(v_case)], null);
      when 'case.sla_breached' then
        v_users := array(select x from unnest(array[v_case.assigned_officer_id, app.case_department_head(v_case)]) x
                         where x is not null union select app.users_with_role('cx_admin'));
      else
        return 'ignored';
    end case;
    foreach u in array coalesce(v_users, '{}'::uuid[]) loop
      continue when u = v_actor;
      perform app.notify(u, v_type,
        case v_type
          when 'case.created' then 'New case ' || v_case.reference || ' (' || v_case.priority || ')'
          when 'case.assigned' then 'Case ' || v_case.reference || ' was assigned to you'
          when 'case.reopened' then 'Case ' || v_case.reference || ' was reopened'
          when 'case.escalated' then 'Case ' || v_case.reference || ' escalated to ' || app.escalation_label(v_case.escalation_level)
          when 'case.mention' then 'You were mentioned on case ' || v_case.reference
          when 'case.resolved' then 'Case ' || v_case.reference || ' is resolved and ready to close'
          when 'case.sla_warning' then 'Case ' || v_case.reference || ' is close to its response deadline'
          else 'Case ' || v_case.reference || ' is past its response deadline' end,
        case v_type
          when 'case.sla_warning' then 'Resolve by ' || to_char(v_case.target_resolution_at at time zone 'Africa/Accra', 'DD/MM/YYYY HH24:MI') || ' (Accra time).'
          when 'case.sla_breached' then 'The target was ' || to_char(v_case.target_resolution_at at time zone 'Africa/Accra', 'DD/MM/YYYY HH24:MI') || ' (Accra time). It has been escalated one level.'
          else 'Priority ' || v_case.priority || ', status ' || replace(v_case.status, '_', ' ') || '.' end,
        v_link, true, v_type not in ('case.mention', 'case.resolved'), v_key || ':' || u,
        jsonb_build_object('entity_type', 'case', 'entity_id', v_case.id, 'reference', v_case.reference),
        case when v_type in ('case.sla_breached', 'case.escalated') or v_case.priority = 'P1' then 'high' else 'normal' end);
    end loop;
    return 'handled';
  end if;
  return 'ignored';
end;
$$;

update public.notification_types set label = v.label, description = v.description
from (values
  ('case.created', 'New case', 'A case was opened, automatically from flagged feedback or by a colleague.'),
  ('case.sla_warning', 'Case deadline approaching', 'A case has used three-quarters of the time allowed to resolve it.'),
  ('case.sla_breached', 'Case past its deadline', 'A case was not resolved within the time allowed.'),
  ('alert.fired', 'Alert raised', 'One of the alerts you receive was triggered.')
) as v(key, label, description)
where public.notification_types.key = v.key;

update public.alert_rules r set name = v.name, description = v.description
from (values
  ('csat_decline', 'Sudden decline in branch CSAT', 'Sudden drop in branch satisfaction',
   'Tells you when a branch''s share of satisfied customers over the last two weeks falls well below its usual level.'),
  ('negative_volume', 'High volume of negative feedback', 'Many unhappy customers at one branch',
   'Tells you when one branch receives several poor ratings within a day.'),
  ('open_cases_increase', 'Unresolved cases increase', 'Open cases rising',
   'Tells you when the number of open cases grows sharply from one week to the next.'),
  ('repeated_factor', 'Repeated improvement factor', 'One issue keeps coming up',
   'Tells you when customers at a branch keep naming the same area to improve.'),
  ('sla_case', 'SLA approaching / exceeded', 'Case deadlines',
   'Tells you when a case is close to, or past, the time allowed to resolve it. The assigned officer and department head are always told.'),
  ('below_target', 'Below target', 'Below target',
   'Tells you when a measure falls short of the target you set for it.'),
  ('tech_spike', 'Technical issues spike', 'More technical complaints',
   'Tells you when complaints about technical issues on the app, website or WhatsApp double compared with the previous month.')
) as v(key, old_name, name, description)
where r.key = v.key and r.name = v.old_name;
