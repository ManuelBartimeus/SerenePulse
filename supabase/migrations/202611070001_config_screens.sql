-- MS-03/04/05 portal configuration screens (M02, M03, M04, M05, M17): read models and guards the
-- directory, catalogue, survey-version and settings screens need on top of the MS-03…MS-06 schema.

-- ---------------------------------------------------------------------------
-- Branch directory summary (S-B16): active branch managers and responses in the last 30 days.
-- ---------------------------------------------------------------------------
-- Counts use the issuing branch the customer chose (Rule 2). Attribution corrections (C) are applied
-- in analytics views, not here: this is an operational directory figure, labelled as such in the UI.
create or replace function public.branch_directory_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_from date := v_today - 29;
  v_all boolean;
begin
  if auth.uid() is null or not (app.has_perm('config.directory') or app.has_perm('analytics.view')) then
    raise exception 'You don''t have permission to do this.' using errcode = '42501', detail = 'config.directory';
  end if;
  if not (app.user_has_perm_now(auth.uid(), 'config.directory')
          or app.user_has_perm_now(auth.uid(), 'analytics.view')) then
    raise exception 'You don''t have permission to do this.' using errcode = '42501', detail = 'config.directory';
  end if;
  -- Directory administrators and organisation-scope analysts see every branch; branch-scoped
  -- analysts (branch managers) see only their own branches.
  v_all := app.has_perm('config.directory') or app.org_scope();
  return jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_today, 'tz', 'Africa/Accra'),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'branch_id', b.id,
               'managers', coalesce(m.managers, '[]'::jsonb),
               'manager_count', coalesce(m.n, 0),
               'responses_30d', coalesce(r.n, 0),
               'unverified_30d', coalesce(r.unverified, 0))
             order by b.sort_order, b.name)
      from public.branches b
      left join lateral (
        select count(*)::int as n,
               jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name)
                         order by p.display_name) as managers
        from public.user_role_grants g
        join public.roles ro on ro.id = g.role_id and ro.key = 'branch_manager'
        join public.profiles p on p.user_id = g.user_id and p.status = 'active'
        where g.scope_type = 'branch' and g.scope_id = b.id and g.status = 'active'
      ) m on true
      left join lateral (
        select count(*)::int as n, (count(*) filter (where s.verification <> 'verified'))::int as unverified
        from survey.responses s
        where s.issuing_branch_id = b.id
          and s.submitted_at >= (v_from::timestamp at time zone 'Africa/Accra')
          and s.submitted_at < ((v_today + 1)::timestamp at time zone 'Africa/Accra')
      ) r on true
      where v_all or b.id = any (app.branch_ids())
    ), '[]'::jsonb));
end;
$$;
comment on function public.branch_directory_summary() is
  'S-B16: per branch, active branch managers and responses submitted in the last 30 Africa/Accra days.';
revoke all on function public.branch_directory_summary() from public, anon;
grant execute on function public.branch_directory_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Survey version list with preparer/approver names (S-B19). Profiles are not readable by every
-- survey editor through RLS, so names are resolved here.
-- ---------------------------------------------------------------------------
create or replace function public.survey_version_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_perm('survey.edit') or app.has_perm('survey.publish.approve')) then
    raise exception 'You don''t have permission to do this.' using errcode = '42501', detail = 'survey.edit';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'version_no', v.version_no, 'status', v.status, 'change_note', v.change_note,
             'rejection_reason', v.rejection_reason, 'prepared_by', v.prepared_by,
             'preparer_name', nullif(pp.display_name, ''), 'approved_by', v.approved_by,
             'approver_name', nullif(pa.display_name, ''), 'requested_at', v.requested_at,
             'published_at', v.published_at, 'retired_at', v.retired_at, 'created_at', v.created_at,
             'updated_at', v.updated_at, 'version', v.version)
           order by v.version_no desc)
    from public.survey_versions v
    left join public.profiles pp on pp.user_id = v.prepared_by
    left join public.profiles pa on pa.user_id = v.approved_by), '[]'::jsonb);
end;
$$;
revoke all on function public.survey_version_list() from public, anon;
grant execute on function public.survey_version_list() to authenticated;

-- ---------------------------------------------------------------------------
-- System "Other" / "Nothing" rows stay active (M03): the survey always offers them.
-- ---------------------------------------------------------------------------
create or replace function app.catalogue_system_active()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_active
     and (coalesce((to_jsonb(old) ->> 'is_other')::boolean, false)
          or coalesce((to_jsonb(old) ->> 'is_none')::boolean, false)) then
    raise exception '"Other" and "Nothing" options are part of the survey and cannot be deactivated.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger service_channels_system_active before update of is_active on public.service_channels
  for each row execute function app.catalogue_system_active();
create trigger insurance_products_system_active before update of is_active on public.insurance_products
  for each row execute function app.catalogue_system_active();
create trigger improvement_factors_system_active before update of is_active on public.improvement_factors
  for each row execute function app.catalogue_system_active();

-- ---------------------------------------------------------------------------
-- Settings validation (M17). The portal validates the same rules; this is the backstop.
-- Unknown keys are left to the stream that owns them.
-- ---------------------------------------------------------------------------
create or replace function app.setting_int_between(p_value jsonb, p_lo int, p_hi int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'number'
              then (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
                   and (p_value #>> '{}')::numeric between p_lo and p_hi
              else false end
$$;

create or replace function app.settings_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v jsonb := new.value;
  v_text text;
begin
  case new.key
    when 'device_cooldown_hours', 'session_expiry_hours' then
      if not app.setting_int_between(v, 1, 168) then
        raise exception 'Enter a whole number of hours from 1 to 168.' using errcode = '22023';
      end if;
    when 'minimum_sample' then
      if not app.setting_int_between(v, 5, 1000) then
        raise exception 'Enter a whole number from 5 to 1,000.' using errcode = '22023';
      end if;
    when 'email_daily_budget' then
      if not app.setting_int_between(v, 0, 500) then
        raise exception 'Enter a whole number of emails from 0 to 500.' using errcode = '22023';
      end if;
    when 'include_unverified_default' then
      if jsonb_typeof(v) <> 'boolean' then
        raise exception 'Choose on or off.' using errcode = '22023';
      end if;
    when 'company_display_name', 'company_legal_name' then
      v_text := btrim(coalesce(v #>> '{}', ''));
      if jsonb_typeof(v) <> 'string' or v_text = '' or length(v_text) > 120 then
        raise exception 'Enter a name of 1 to 120 characters.' using errcode = '22023';
      end if;
    when 'support_phone' then
      v_text := btrim(coalesce(v #>> '{}', ''));
      if jsonb_typeof(v) <> 'string' or (v_text <> '' and v_text !~ '^\+?[0-9][0-9 ()-]{5,18}[0-9]$') then
        raise exception 'Enter a phone number using digits, spaces, brackets or dashes, e.g. +233 30 200 0000.'
          using errcode = '22023';
      end if;
    when 'support_email' then
      v_text := btrim(coalesce(v #>> '{}', ''));
      if jsonb_typeof(v) <> 'string' or (v_text <> '' and v_text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
         or length(v_text) > 254 then
        raise exception 'Enter an email address like name@example.com.' using errcode = '22023';
      end if;
    when 'data_protection_contact' then
      if jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 200 then
        raise exception 'Keep the data-protection contact under 200 characters.' using errcode = '22023';
      end if;
    when 'dpc_registration_number' then
      v_text := btrim(coalesce(v #>> '{}', ''));
      if jsonb_typeof(v) <> 'string' or (v_text <> '' and v_text !~ '^[A-Za-z0-9][A-Za-z0-9 /.-]{0,49}$') then
        raise exception 'Use letters, numbers, spaces, slashes, dots or dashes (up to 50 characters).'
          using errcode = '22023';
      end if;
    when 'comment_keywords' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 100 then
        raise exception 'Keep the keyword list to 100 entries or fewer.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(v) e
                 where jsonb_typeof(e) <> 'string' or length(btrim(e #>> '{}')) not between 2 and 40) then
        raise exception 'Each keyword must be 2 to 40 characters.' using errcode = '22023';
      end if;
      if (select count(distinct lower(btrim(e #>> '{}'))) from jsonb_array_elements(v) e) <> jsonb_array_length(v) then
        raise exception 'Each keyword may appear only once.' using errcode = '22023';
      end if;
    else
      null;
  end case;
  return new;
end;
$$;
-- Runs before settings_history (triggers fire in name order), so rejected values leave no history.
create trigger settings_a_validate before insert or update on public.settings
  for each row execute function app.settings_validate();
