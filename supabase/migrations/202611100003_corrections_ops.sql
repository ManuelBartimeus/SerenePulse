-- MS-13 attribution corrections (FR-41, M10) and the M17 operations page (quotas, job runs, health).
-- Writes C's survey.attribution_corrections and calls C's analytics.rebuild_days on approval.

-- ---------------------------------------------------------------------------
-- Attribution corrections: proposed → approved | rejected; proposer ≠ approver; never silent.
-- ---------------------------------------------------------------------------

-- Effective attribution of a response right now: the latest approved correction, else the original.
create or replace function survey.effective_attribution(p_response_id uuid)
returns table (branch_id uuid, branch_status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select coalesce(c.corrected_branch_id, case when c.id is null then r.issuing_branch_id end),
         coalesce(c.corrected_branch_status, r.branch_status)
  from survey.responses r
  left join lateral (
    select ac.id, ac.corrected_branch_id, ac.corrected_branch_status
    from survey.attribution_corrections ac
    where ac.response_id = r.id and ac.status = 'approved'
    order by ac.approved_at desc limit 1) c on true
  where r.id = p_response_id;
end;
$$;

create or replace function survey.require_response_scope(p_response_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch uuid;
begin
  if not exists (select 1 from survey.responses where id = p_response_id) then
    raise exception 'That feedback record does not exist.' using errcode = 'P0002';
  end if;
  if app.org_scope() then
    return;
  end if;
  select e.branch_id into v_branch from survey.effective_attribution(p_response_id) e;
  if v_branch is null or not (v_branch = any (app.branch_ids())) then
    raise exception 'You don''t have permission to see this record.' using errcode = '42501';
  end if;
end;
$$;

create or replace function survey.correction_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p_c survey.attribution_corrections%rowtype;
begin
  select * into p_c from survey.attribution_corrections where id = p_id;
  return jsonb_build_object(
    'id', p_c.id, 'response_id', p_c.response_id, 'status', p_c.status, 'reason', p_c.reason,
    'original_branch_id', p_c.original_branch_id,
    'original_branch_name', (select b.name from public.branches b where b.id = p_c.original_branch_id),
    'corrected_branch_id', p_c.corrected_branch_id,
    'corrected_branch_status', p_c.corrected_branch_status,
    'corrected_branch_name', (select b.name from public.branches b where b.id = p_c.corrected_branch_id),
    'proposed_by', p_c.proposed_by, 'proposed_at', p_c.proposed_at,
    'proposed_by_name', (select p.display_name from public.profiles p where p.user_id = p_c.proposed_by),
    'approved_by_name', (select p.display_name from public.profiles p where p.user_id = p_c.approved_by),
    'approved_at', p_c.approved_at,
    'rejected_by_name', (select p.display_name from public.profiles p where p.user_id = p_c.rejected_by),
    'rejected_at', p_c.rejected_at, 'rejection_reason', p_c.rejection_reason);
end;
$$;

create or replace function public.response_propose_correction(p_response_id uuid, p_branch_code text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r survey.responses%rowtype;
  v_cur_branch uuid;
  v_cur_status text;
  v_branch uuid;
  v_status text;
  v_c survey.attribution_corrections%rowtype;
begin
  perform app.require_perm('responses.attribution.propose', true);
  perform survey.require_response_scope(p_response_id);
  select * into v_r from survey.responses where id = p_response_id;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Explain the correction in 10 to 500 characters.' using errcode = '22023';
  end if;
  -- Branch codes are upper case; the three non-branch answers use these lower-case keys.
  if p_branch_code in ('other', 'not_applicable', 'not_provided') then
    v_status := p_branch_code;
  else
    select b.id into v_branch from public.branches b where b.code = p_branch_code;
    if v_branch is null then
      raise exception 'Choose a branch from the list.' using errcode = '22023';
    end if;
    v_status := 'selected';
  end if;
  select e.branch_id, e.branch_status into v_cur_branch, v_cur_status from survey.effective_attribution(p_response_id) e;
  if v_cur_status = v_status and v_cur_branch is not distinct from v_branch then
    raise exception 'That is already the attribution on this record.' using errcode = '22023';
  end if;
  perform 1 from survey.responses where id = p_response_id for share;
  if exists (select 1 from survey.attribution_corrections ac where ac.response_id = p_response_id and ac.status = 'proposed') then
    raise exception 'This record already has a correction waiting for approval.' using errcode = '22023';
  end if;
  insert into survey.attribution_corrections (id, response_id, original_branch_id, corrected_branch_id,
                                              corrected_branch_status, reason, proposed_by, proposed_at, status)
  values (gen_random_uuid(), p_response_id, v_r.issuing_branch_id, v_branch, v_status, btrim(p_reason), auth.uid(),
          now(), 'proposed')
  returning * into v_c;
  perform audit.append('response.correction_proposed', 'response', p_response_id::text,
    jsonb_build_object('branch_id', v_cur_branch, 'branch_status', v_cur_status),
    jsonb_build_object('correction_id', v_c.id, 'branch_id', v_branch, 'branch_status', v_status,
                       'reason', v_c.reason));
  return survey.correction_json(v_c.id);
end;
$$;

create or replace function public.response_approve_correction(p_correction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c survey.attribution_corrections%rowtype;
  v_before_branch uuid;
  v_before_status text;
  v_day date;
begin
  perform app.require_perm('responses.attribution.approve', true);
  select * into v_c from survey.attribution_corrections where id = p_correction_id for update;
  if not found then
    raise exception 'That correction no longer exists.' using errcode = 'P0002';
  end if;
  if v_c.status <> 'proposed' then
    raise exception 'This correction was already %.', v_c.status using errcode = '22023';
  end if;
  if v_c.proposed_by = auth.uid() then
    raise exception 'You can''t approve a correction you proposed. Ask another approver.' using errcode = '42501';
  end if;
  select e.branch_id, e.branch_status into v_before_branch, v_before_status
  from survey.effective_attribution(v_c.response_id) e;
  update survey.attribution_corrections set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_correction_id returning * into v_c;
  -- Roll-ups for the submission day are rebuilt so dashboards reflect the corrected branch.
  select (r.submitted_at at time zone 'Africa/Accra')::date into v_day from survey.responses r where r.id = v_c.response_id;
  perform analytics.rebuild_days(v_day, v_day);
  perform audit.append('response.correction_approved', 'response', v_c.response_id::text,
    jsonb_build_object('branch_id', v_before_branch, 'branch_status', v_before_status),
    jsonb_build_object('correction_id', v_c.id, 'branch_id', v_c.corrected_branch_id,
                       'branch_status', v_c.corrected_branch_status, 'proposed_by', v_c.proposed_by));
  return survey.correction_json(v_c.id);
end;
$$;

create or replace function public.response_reject_correction(p_correction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c survey.attribution_corrections%rowtype;
begin
  perform app.require_perm('responses.attribution.approve', true);
  if length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'Say why you are rejecting it (5 to 500 characters).' using errcode = '22023';
  end if;
  select * into v_c from survey.attribution_corrections where id = p_correction_id for update;
  if not found then
    raise exception 'That correction no longer exists.' using errcode = 'P0002';
  end if;
  if v_c.status <> 'proposed' then
    raise exception 'This correction was already %.', v_c.status using errcode = '22023';
  end if;
  update survey.attribution_corrections
     set status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejection_reason = btrim(p_reason)
   where id = p_correction_id returning * into v_c;
  perform audit.append('response.correction_rejected', 'response', v_c.response_id::text, null,
    jsonb_build_object('correction_id', v_c.id, 'reason', v_c.rejection_reason));
  return survey.correction_json(v_c.id);
end;
$$;

-- Approvals queue (and history) for proposers and approvers.
create or replace function public.correction_list(p_status text default 'proposed', p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (app.has_perm('responses.attribution.propose') or app.has_perm('responses.attribution.approve')) then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(survey.correction_json(ac.id) || jsonb_build_object(
             'reference', r.reference, 'submitted_at', r.submitted_at,
             'can_decide', ac.status = 'proposed' and app.has_perm('responses.attribution.approve')
                           and ac.proposed_by <> auth.uid())
           order by ac.proposed_at desc)
    from (select * from survey.attribution_corrections x
           where p_status is null or x.status = p_status
           order by x.proposed_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) ac
    join survey.responses r on r.id = ac.response_id
    where app.org_scope()
       or (select e.branch_id from survey.effective_attribution(r.id) e) = any (app.branch_ids())), '[]'::jsonb);
end;
$$;

-- Record drawer panel: the submitted attribution (always shown), the effective one, and history.
create or replace function public.response_corrections(p_response_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r survey.responses%rowtype;
  v_branch uuid;
  v_status text;
begin
  perform app.require_perm('responses.view', true);
  perform survey.require_response_scope(p_response_id);
  select * into v_r from survey.responses where id = p_response_id;
  select e.branch_id, e.branch_status into v_branch, v_status from survey.effective_attribution(p_response_id) e;
  return jsonb_build_object(
    'submitted', jsonb_build_object('branch_id', v_r.issuing_branch_id, 'branch_status', v_r.branch_status,
                                    'branch_name', (select b.name from public.branches b where b.id = v_r.issuing_branch_id)),
    'effective', jsonb_build_object('branch_id', v_branch, 'branch_status', v_status,
                                    'branch_name', (select b.name from public.branches b where b.id = v_branch)),
    'corrections', coalesce((select jsonb_agg(survey.correction_json(ac.id) || jsonb_build_object(
                                     'can_decide', ac.status = 'proposed' and app.has_perm('responses.attribution.approve')
                                                   and ac.proposed_by <> auth.uid())
                                   order by ac.proposed_at desc)
                             from survey.attribution_corrections ac where ac.response_id = p_response_id), '[]'::jsonb),
    'can_propose', app.has_perm('responses.attribution.propose'),
    'can_approve', app.has_perm('responses.attribution.approve'));
end;
$$;

revoke all on function survey.effective_attribution(uuid), survey.require_response_scope(uuid),
  survey.correction_json(uuid) from public, anon, authenticated;
revoke all on function public.response_propose_correction(uuid, text, text), public.response_approve_correction(uuid),
  public.response_reject_correction(uuid, text), public.correction_list(text, int), public.response_corrections(uuid)
  from public, anon;
grant execute on function public.response_propose_correction(uuid, text, text), public.response_approve_correction(uuid),
  public.response_reject_correction(uuid, text), public.correction_list(text, int), public.response_corrections(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Operations page (M17): free-tier usage with thresholds, job runs, scheduled jobs, health.
-- ---------------------------------------------------------------------------
create or replace function public.ops_overview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today_start timestamptz := ((now() at time zone 'Africa/Accra')::date)::timestamp at time zone 'Africa/Accra';
begin
  if auth.uid() is null or not (app.has_perm('settings.manage') or app.has_perm('audit.view_all'))
     or not (app.user_has_perm_now(auth.uid(), 'settings.manage') or app.user_has_perm_now(auth.uid(), 'audit.view_all')) then
    raise exception 'You don''t have permission to do this.' using errcode = '42501', detail = 'settings.manage';
  end if;
  return jsonb_build_object(
    'checked_at', now(),
    'thresholds', jsonb_build_object(
      'db_bytes', 524288000, 'storage_bytes', 1073741824, 'warn_ratio', 0.8,
      'emails_per_day', (select (s.value #>> '{}')::int from public.settings s where s.key = 'email_daily_budget')),
    'current', jsonb_build_object(
      'db_bytes', pg_database_size(current_database()),
      'storage_bytes', coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0),
      'emails_today', (select count(*) from public.email_log e where e.sent_at >= v_today_start)),
    'snapshots', coalesce((select jsonb_agg(to_jsonb(q) order by q.taken_at desc)
                           from (select * from ops.quota_snapshots order by taken_at desc limit 30) q), '[]'::jsonb),
    'latest_jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.job)
                             from (select distinct on (job) id, job, started_at, finished_at, status, detail
                                   from ops.job_runs order by job, started_at desc) j), '[]'::jsonb),
    'recent_runs', coalesce((select jsonb_agg(to_jsonb(j) order by j.started_at desc)
                             from (select id, job, started_at, finished_at, status, detail from ops.job_runs
                                   order by started_at desc limit 50) j), '[]'::jsonb),
    'cron', coalesce((select jsonb_agg(jsonb_build_object(
                               'name', c.jobname, 'schedule', c.schedule, 'active', c.active,
                               'last_status', d.status, 'last_start', d.start_time, 'last_message', left(d.return_message, 200))
                             order by c.jobname)
                      from cron.job c
                      left join lateral (select rd.status, rd.start_time, rd.return_message from cron.job_run_details rd
                                         where rd.jobid = c.jobid order by rd.start_time desc limit 1) d on true), '[]'::jsonb));
end;
$$;

create or replace function public.ops_record_quota_snapshot()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('settings.manage', true);
  if exists (select 1 from ops.quota_snapshots where taken_at > now() - interval '1 minute') then
    raise exception 'A usage snapshot was taken less than a minute ago.' using errcode = '22023';
  end if;
  perform ops.record_quota_snapshot();
  perform audit.append('ops.quota_snapshot_recorded', 'quota_snapshot', null);
end;
$$;

revoke all on function public.ops_overview(), public.ops_record_quota_snapshot() from public, anon;
grant execute on function public.ops_overview(), public.ops_record_quota_snapshot() to authenticated;
