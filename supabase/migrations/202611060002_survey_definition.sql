-- MS-04 survey definition and versioning (M04). The rule evaluator, validator and guardrails mirror
-- packages/survey-engine/src/index.ts rule for rule; tests check that both agree.

-- ---------------------------------------------------------------------------
-- Rule language (JSON-logic subset)
-- ---------------------------------------------------------------------------
create or replace function survey.truthy(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null and p_value <> 'null'::jsonb and p_value <> '""'::jsonb and p_value <> 'false'::jsonb
$$;

create or replace function survey.present(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null and p_value <> 'null'::jsonb and p_value <> '""'::jsonb
$$;

create or replace function survey.eval_rule(p_def jsonb, p_snap jsonb, p_answers jsonb, p_rule jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_op text;
  v_raw jsonb;
  v_args jsonb;
  v_path text;
  v_id text;
  v_attr text;
  v_val jsonb;
  v_src text;
  a jsonb;
  b jsonb;
  x jsonb;
begin
  if p_rule is null or jsonb_typeof(p_rule) = 'null' then
    return 'null'::jsonb;
  end if;
  if jsonb_typeof(p_rule) = 'array' then
    return coalesce((select jsonb_agg(survey.eval_rule(p_def, p_snap, p_answers, e) order by o)
                     from jsonb_array_elements(p_rule) with ordinality as t(e, o)), '[]'::jsonb);
  end if;
  if jsonb_typeof(p_rule) <> 'object' then
    return p_rule;
  end if;
  select key, value into v_op, v_raw from jsonb_each(p_rule) limit 1;
  v_args := case when jsonb_typeof(v_raw) = 'array' then v_raw else jsonb_build_array(v_raw) end;
  case v_op
    when 'var' then
      v_path := v_raw #>> '{}';
      v_id := split_part(v_path, '.', 1);
      v_attr := nullif(split_part(v_path, '.', 2), '');
      v_val := coalesce(p_answers -> v_id, 'null'::jsonb);
      if v_attr is null then
        return v_val;
      end if;
      select q ->> 'options_source' into v_src
      from jsonb_array_elements(p_def -> 'pages') p, jsonb_array_elements(p -> 'questions') q
      where q ->> 'id' = v_id limit 1;
      if v_src is null or jsonb_typeof(v_val) <> 'string' then
        return 'null'::jsonb;
      end if;
      return coalesce((select o -> v_attr from jsonb_array_elements(p_snap -> v_src) o
                       where o ->> 'code' = v_val #>> '{}' limit 1), 'null'::jsonb);
    when 'eq' then
      return to_jsonb(survey.eval_rule(p_def, p_snap, p_answers, v_args -> 0)
                      = survey.eval_rule(p_def, p_snap, p_answers, coalesce(v_args -> 1, 'null'::jsonb)));
    when 'ne' then
      return to_jsonb(survey.eval_rule(p_def, p_snap, p_answers, v_args -> 0)
                      <> survey.eval_rule(p_def, p_snap, p_answers, coalesce(v_args -> 1, 'null'::jsonb)));
    when 'in' then
      a := survey.eval_rule(p_def, p_snap, p_answers, v_args -> 0);
      b := survey.eval_rule(p_def, p_snap, p_answers, coalesce(v_args -> 1, 'null'::jsonb));
      return to_jsonb(jsonb_typeof(b) = 'array' and exists (select 1 from jsonb_array_elements(b) e where e = a));
    when 'and' then
      for x in select e from jsonb_array_elements(v_args) e loop
        if not survey.truthy(survey.eval_rule(p_def, p_snap, p_answers, x)) then return 'false'::jsonb; end if;
      end loop;
      return 'true'::jsonb;
    when 'or' then
      for x in select e from jsonb_array_elements(v_args) e loop
        if survey.truthy(survey.eval_rule(p_def, p_snap, p_answers, x)) then return 'true'::jsonb; end if;
      end loop;
      return 'false'::jsonb;
    when 'not' then
      return to_jsonb(not survey.truthy(survey.eval_rule(p_def, p_snap, p_answers, v_args -> 0)));
    when 'lte', 'gte' then
      a := survey.eval_rule(p_def, p_snap, p_answers, v_args -> 0);
      b := survey.eval_rule(p_def, p_snap, p_answers, coalesce(v_args -> 1, 'null'::jsonb));
      if jsonb_typeof(a) <> 'number' or jsonb_typeof(b) <> 'number' then return 'false'::jsonb; end if;
      return to_jsonb(case when v_op = 'lte' then a::numeric <= b::numeric else a::numeric >= b::numeric end);
    else
      raise exception 'Unknown rule operator: %', v_op using errcode = '22023';
  end case;
end;
$$;

-- Ghana mobile number → E.164, or null (A-145). Mirrors normalizePhone().
create or replace function survey.normalize_phone(p_raw text, p_prefixes jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_raw, ''), '[\s\-().]', '', 'g');
  v_local text;
begin
  if v_digits ~ '^\+233\d{9}$' then v_local := '0' || substr(v_digits, 5);
  elsif v_digits ~ '^233\d{9}$' then v_local := '0' || substr(v_digits, 4);
  elsif v_digits ~ '^0\d{9}$' then v_local := v_digits;
  else return null;
  end if;
  if not (p_prefixes ? substr(v_local, 1, 3)) then
    return null;
  end if;
  return '+233' || substr(v_local, 2);
end;
$$;

-- Validates and normalises a complete answer set (submit-time). Mirrors validate().
create or replace function survey.validate_answers(p_def jsonb, p_snap jsonb, p_input jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  q jsonb;
  v_id text;
  v_type text;
  v jsonb;
  v_working jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_req jsonb;
  v_max int;
  v_phone text;
  v_lo int;
  v_hi int;
begin
  for q in
    select qq from jsonb_array_elements(p_def -> 'pages') with ordinality as p(page, po),
                   jsonb_array_elements(p.page -> 'questions') with ordinality as t(qq, qo)
    order by po, qo
  loop
    v_id := q ->> 'id';
    v_type := q ->> 'type';
    v := p_input -> v_id;
    if jsonb_typeof(v) = 'string' and v_type in ('text_short', 'text_long', 'phone') then
      v := to_jsonb(regexp_replace(v #>> '{}', '^\s+|\s+$', '', 'g'));
    end if;
    if q ? 'visible_when' and not survey.truthy(survey.eval_rule(p_def, p_snap, v_working, q -> 'visible_when')) then
      continue;
    end if;
    if not survey.present(v) then
      v_req := q -> 'required';
      if v_req = 'true'::jsonb
         or (jsonb_typeof(v_req) = 'object' and survey.truthy(survey.eval_rule(p_def, p_snap, v_working, v_req))) then
        v_errors := v_errors || jsonb_build_object('field', v_id, 'code', 'required');
      end if;
      continue;
    end if;
    if v_type = 'single_choice' then
      if jsonb_typeof(v) <> 'string' or not exists (
           select 1 from jsonb_array_elements(p_snap -> (q ->> 'options_source')) o where o ->> 'code' = v #>> '{}') then
        v_errors := v_errors || jsonb_build_object('field', v_id, 'code', 'invalid_option');
        continue;
      end if;
    elsif v_type in ('rating_5', 'rating_0_10') then
      v_lo := case when v_type = 'rating_5' then 1 else 0 end;
      v_hi := case when v_type = 'rating_5' then 5 else 10 end;
      if jsonb_typeof(v) <> 'number' or v::numeric <> trunc(v::numeric) or v::numeric < v_lo or v::numeric > v_hi then
        v_errors := v_errors || jsonb_build_object('field', v_id, 'code', 'out_of_range');
        continue;
      end if;
    elsif v_type in ('text_short', 'text_long') then
      v_max := coalesce((q ->> 'max_length')::int, case when v_type = 'text_long' then 1000 else 80 end);
      if jsonb_typeof(v) <> 'string' then
        v_errors := v_errors || jsonb_build_object('field', v_id, 'code', 'invalid_type');
        continue;
      end if;
      if char_length(v #>> '{}') > v_max then
        v_errors := v_errors || jsonb_build_object('field', v_id, 'code', 'too_long');
        continue;
      end if;
    elsif v_type = 'toggle' then
      if jsonb_typeof(v) <> 'boolean' then
        v_errors := v_errors || jsonb_build_object('field', v_id, 'code', 'invalid_type');
        continue;
      end if;
    elsif v_type = 'phone' then
      v_phone := case when jsonb_typeof(v) = 'string' then survey.normalize_phone(v #>> '{}', p_snap -> 'phone_prefixes') end;
      if v_phone is null then
        v_errors := v_errors || jsonb_build_object('field', v_id, 'code', 'invalid_phone');
        continue;
      end if;
      v := to_jsonb(v_phone);
    end if;
    v_working := v_working || jsonb_build_object(v_id, v);
  end loop;
  return jsonb_build_object('answers', v_working, 'errors', v_errors);
end;
$$;

-- Removes answers hidden by earlier answers. Mirrors clean(); used for drafts.
create or replace function survey.clean_answers(p_def jsonb, p_snap jsonb, p_input jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  q jsonb;
  v_out jsonb := '{}'::jsonb;
begin
  for q in
    select qq from jsonb_array_elements(p_def -> 'pages') with ordinality as p(page, po),
                   jsonb_array_elements(p.page -> 'questions') with ordinality as t(qq, qo)
    order by po, qo
  loop
    if p_input ? (q ->> 'id')
       and (not q ? 'visible_when' or survey.truthy(survey.eval_rule(p_def, p_snap, v_out, q -> 'visible_when'))) then
      v_out := v_out || jsonb_build_object(q ->> 'id', p_input -> (q ->> 'id'));
    end if;
  end loop;
  return v_out;
end;
$$;

-- Guardrails (SPEC M04). Mirrors guardrails() in packages/survey-engine.
create or replace function survey.guardrail_problems(p_def jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_slots constant jsonb := '{
    "channel": ["single_choice", "service_channels"], "channel_other": ["text_short", null],
    "branch": ["single_choice", "branches"], "branch_other": ["text_short", null],
    "product": ["single_choice", "insurance_products"], "product_other": ["text_short", null],
    "csat": ["rating_5", null], "ces": ["rating_5", null], "nps": ["rating_0_10", null],
    "factor": ["single_choice", "improvement_factors"], "factor_other": ["text_short", null],
    "comment": ["text_long", null], "contact_consent": ["toggle", null], "phone": ["phone", null],
    "first_name": ["text_short", null]}'::jsonb;
  v_out jsonb := '[]'::jsonb;
  v_pages int := coalesce(jsonb_array_length(p_def -> 'pages'), 0);
  q record;
  v_earlier text[] := '{}'::text[];
  v_seen text[] := '{}'::text[];
  v_ref text;
  v_cap int;
  v_page jsonb;
begin
  if v_pages < 1 or v_pages > 5 then
    v_out := v_out || jsonb_build_object('path', 'pages', 'message', 'A survey has 1 to 5 pages.');
  end if;
  for q in
    select qq as j, qq ->> 'id' as id, qq ->> 'type' as type
    from jsonb_array_elements(p_def -> 'pages') with ordinality as p(page, po),
         jsonb_array_elements(p.page -> 'questions') with ordinality as t(qq, qo)
    order by po, qo
  loop
    if not v_slots ? q.id then
      v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message',
        format('"%s" is not an answer the system can store. New questions need approval (Rule 15).', q.id));
    else
      if v_slots -> q.id ->> 0 <> q.type then
        v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message',
          format('"%s" must be a %s question.', q.id, v_slots -> q.id ->> 0));
      end if;
      if v_slots -> q.id ->> 1 is not null and q.j ->> 'options_source' is distinct from v_slots -> q.id ->> 1 then
        v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message',
          format('"%s" must use the %s list.', q.id, v_slots -> q.id ->> 1));
      end if;
    end if;
    if q.id = any(v_seen) then
      v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message', format('"%s" appears twice.', q.id));
    end if;
    v_seen := v_seen || q.id;
    if btrim(coalesce(q.j ->> 'label', '')) = '' then
      v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message', 'Every question needs wording.');
    end if;
    if (coalesce(q.j ->> 'label', '') || ' ' || coalesce(q.j ->> 'help', ''))
       ~* 'policy\s*(number|no\.?)|ghana\s*card|national\s*id|id\s*number|e-?mail|date of birth|address|surname|last name' then
      v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message',
        'The survey may not ask for identity details (Rule 12).');
    end if;
    for v_ref in
      select distinct split_part(m[1], '.', 1)
      from regexp_matches(coalesce(q.j -> 'visible_when', 'null')::text || ' ' ||
                          case when jsonb_typeof(q.j -> 'required') = 'object' then (q.j -> 'required')::text else '' end,
                          '"var": "([^"]*)"', 'g') as m
    loop
      if not v_ref = any(v_earlier) then
        v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message',
          format('Rules may only refer to earlier questions ("%s").', v_ref));
      end if;
    end loop;
    if q.type in ('text_short', 'text_long') and q.j ? 'required' and q.j -> 'required' <> 'false'::jsonb then
      v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message', 'Free-text answers are always optional (Rule 20).');
    end if;
    if q.type = 'phone' and (q.j -> 'required' = 'true'::jsonb
        or coalesce(q.j -> 'visible_when', 'null')::text !~ '"var": "contact_consent') then
      v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message',
        'The phone number may be asked only when the customer switches on "contact me".');
    end if;
    if q.j ? 'max_length' then
      v_cap := case when q.id like '%\_other' then case when q.id = 'factor_other' then 200 else 80 end
                    when q.type = 'text_long' then 1000 else 80 end;
      if (q.j ->> 'max_length')::int < 1 or (q.j ->> 'max_length')::int > v_cap then
        v_out := v_out || jsonb_build_object('path', 'questions.' || q.id, 'message',
          format('Maximum length is 1 to %s characters.', v_cap));
      end if;
    end if;
    v_earlier := v_earlier || q.id;
  end loop;
  for v_ref in select unnest(array['channel', 'product', 'csat', 'ces', 'nps']) loop
    if not exists (select 1 from jsonb_array_elements(p_def -> 'pages') p, jsonb_array_elements(p -> 'questions') qq
                   where qq ->> 'id' = v_ref) then
      v_out := v_out || jsonb_build_object('path', 'questions.' || v_ref, 'message', format('The survey must ask "%s".', v_ref));
    elsif not exists (select 1 from jsonb_array_elements(p_def -> 'pages') p, jsonb_array_elements(p -> 'questions') qq
                      where qq ->> 'id' = v_ref and qq -> 'required' = 'true'::jsonb) then
      v_out := v_out || jsonb_build_object('path', 'questions.' || v_ref, 'message', format('"%s" must be required.', v_ref));
    end if;
  end loop;
  if v_pages >= 1 and (select count(*) from jsonb_array_elements(p_def -> 'pages' -> 0 -> 'questions') qq
                       where not qq ? 'visible_when' or qq ->> 'type' = 'single_choice') > 3 then
    v_out := v_out || jsonb_build_object('path', 'pages.0', 'message', 'Page 1 has at most 3 questions (plus clarifications).');
  end if;
  for i in 1..3 loop
    v_page := p_def -> 'pages' -> i;
    if v_page is not null and (jsonb_array_length(v_page -> 'questions') <> 1
        or v_page -> 'questions' -> 0 ->> 'type' not like 'rating%') then
      v_out := v_out || jsonb_build_object('path', 'pages.' || i, 'message', format('Page %s has exactly one rating question.', i + 1));
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function survey.scale_signature(p_def jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(q ->> 'id', case q ->> 'type' when 'rating_5' then '1-5' else '0-10' end), '{}')
  from jsonb_array_elements(p_def -> 'pages') p, jsonb_array_elements(p -> 'questions') q
  where q ->> 'type' in ('rating_5', 'rating_0_10')
$$;

-- The catalogue lists shown to customers, frozen into a version at publish (A-73).
create or replace function survey.build_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'service_channels', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label,
        'branch_requirement', branch_requirement, 'is_other', is_other) order by sort_order, label), '[]')
      from public.service_channels where is_active),
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', name, 'is_other', false)
        order by name), '[]') from public.branches where is_active)
      || jsonb_build_array(jsonb_build_object('code', 'OTHER', 'label', 'Other branch', 'is_other', true)),
    'insurance_products', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label,
        'is_other', is_other) order by sort_order, label), '[]')
      from public.insurance_products where is_active and show_in_survey),
    'improvement_factors', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label,
        'is_other', is_other, 'is_none', is_none) order by sort_order, label), '[]')
      from public.improvement_factors where is_active),
    'phone_prefixes', (select value from public.settings where key = 'ghana_mobile_prefixes'))
$$;

revoke all on function survey.build_snapshot() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Versions
-- ---------------------------------------------------------------------------
create table public.survey_versions (
  id                 uuid primary key default gen_random_uuid(),
  version_no         int not null unique,
  status             text not null default 'draft'
                       check (status in ('draft', 'pending_approval', 'published', 'retired')),
  definition         jsonb not null,
  catalogue_snapshot jsonb,
  scale_signature    jsonb not null,
  checksum           text,
  change_note        text check (length(change_note) <= 500),
  prepared_by        uuid references public.profiles (user_id),
  requested_at       timestamptz,
  approved_by        uuid references public.profiles (user_id),
  published_at       timestamptz,
  retired_at         timestamptz,
  rejection_reason   text check (length(rejection_reason) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            int not null default 1,
  check (status not in ('published', 'retired') or (catalogue_snapshot is not null and published_at is not null)),
  check (approved_by is null or prepared_by is null or approved_by <> prepared_by)
);
comment on table public.survey_versions is 'Immutable published survey versions (REQ §14.4, FR-27). Four-eyes publish (A-96).';
create unique index survey_versions_one_published on public.survey_versions ((true)) where status = 'published';
create unique index survey_versions_one_open_draft on public.survey_versions ((true))
  where status in ('draft', 'pending_approval');

create or replace function app.survey_version_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('published', 'retired') then
    if old.status = 'published' and new.status = 'retired'
       and (to_jsonb(new) - array['status', 'retired_at', 'updated_at', 'version'])
         = (to_jsonb(old) - array['status', 'retired_at', 'updated_at', 'version']) then
      return new;
    end if;
    raise exception 'Published survey versions cannot be changed. Create a new draft instead.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger survey_versions_guard before update on public.survey_versions
  for each row execute function app.survey_version_guard();
create trigger survey_versions_touch before update on public.survey_versions
  for each row execute function app.touch_row();
create trigger survey_versions_audit after insert or update on public.survey_versions
  for each row execute function app.audit_row();
create or replace function app.reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are never deleted.', tg_table_name using errcode = '42501';
end;
$$;
create trigger survey_versions_no_delete before delete on public.survey_versions
  for each row execute function app.reject_delete();

alter table public.survey_versions enable row level security;
create policy survey_versions_read on public.survey_versions for select to authenticated
  using (status in ('published', 'retired') or (select app.has_perm('survey.edit'))
         or (select app.has_perm('survey.publish.approve')));
revoke all on public.survey_versions from anon;
revoke insert, update, delete, truncate on public.survey_versions from authenticated;
grant select on public.survey_versions to authenticated;

-- Draft from the published version (or a given base).
create or replace function public.survey_version_create_draft()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_def jsonb;
begin
  perform app.require_perm('survey.edit', true);
  if exists (select 1 from public.survey_versions where status in ('draft', 'pending_approval')) then
    raise exception 'A draft already exists. Open it instead of starting another.' using errcode = '23505';
  end if;
  select definition into v_def from public.survey_versions where status = 'published';
  insert into public.survey_versions (version_no, definition, scale_signature, prepared_by)
  values ((select coalesce(max(version_no), 0) + 1 from public.survey_versions), v_def,
          survey.scale_signature(v_def), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.survey_version_update(p_id uuid, p_definition jsonb, p_change_note text,
  p_expected_version int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.survey_versions;
begin
  perform app.require_perm('survey.edit', true);
  select * into v_row from public.survey_versions where id = p_id for update;
  if v_row.id is null then raise exception 'Survey version not found.' using errcode = 'P0002'; end if;
  if v_row.status <> 'draft' then
    raise exception 'Only drafts can be edited. Withdraw the publication request first.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    raise exception 'Someone else changed this draft. Reload to see their changes.' using errcode = 'P0409';
  end if;
  if pg_column_size(p_definition) > 65536 then
    raise exception 'The survey definition is too large.' using errcode = '22023';
  end if;
  update public.survey_versions
     set definition = p_definition, scale_signature = survey.scale_signature(p_definition),
         change_note = nullif(btrim(p_change_note), ''), prepared_by = auth.uid(), rejection_reason = null
   where id = p_id;
end;
$$;

create or replace function public.survey_version_validate(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_def jsonb;
begin
  if not (app.has_perm('survey.edit') or app.has_perm('survey.publish.approve')) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  select definition into v_def from public.survey_versions where id = p_id;
  if v_def is null then raise exception 'Survey version not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'problems', survey.guardrail_problems(v_def),
    'scale_changed', survey.scale_signature(v_def)
                     is distinct from (select scale_signature from public.survey_versions where status = 'published'));
end;
$$;

create or replace function public.survey_version_request_publish(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.survey_versions;
begin
  perform app.require_perm('survey.edit', true);
  select * into v_row from public.survey_versions where id = p_id for update;
  if v_row.status is distinct from 'draft' then
    raise exception 'Only a draft can be sent for approval.' using errcode = '22023';
  end if;
  if jsonb_array_length(survey.guardrail_problems(v_row.definition)) > 0 then
    raise exception 'Fix the problems listed before requesting publication.' using errcode = '22023';
  end if;
  update public.survey_versions set status = 'pending_approval', requested_at = now(), prepared_by = auth.uid()
   where id = p_id;
end;
$$;

create or replace function public.survey_version_withdraw(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('survey.edit', true);
  update public.survey_versions set status = 'draft', requested_at = null
   where id = p_id and status = 'pending_approval';
  if not found then raise exception 'Nothing to withdraw.' using errcode = '22023'; end if;
end;
$$;

create or replace function public.survey_version_reject(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_perm('survey.publish.approve', true);
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Give a reason so the preparer knows what to change.' using errcode = '22023';
  end if;
  update public.survey_versions set status = 'draft', requested_at = null, rejection_reason = btrim(p_reason)
   where id = p_id and status = 'pending_approval';
  if not found then raise exception 'This version is not waiting for approval.' using errcode = '22023'; end if;
end;
$$;

-- Four-eyes publish (A-96): approver ≠ preparer; scale changes need explicit confirmation (Rule 6).
create or replace function public.survey_version_approve_publish(p_id uuid, p_confirm_scale_change boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.survey_versions;
  v_current public.survey_versions;
  v_snap jsonb;
begin
  perform app.require_perm('survey.publish.approve', true);
  select * into v_row from public.survey_versions where id = p_id for update;
  if v_row.status is distinct from 'pending_approval' then
    raise exception 'This version is not waiting for approval.' using errcode = '22023';
  end if;
  if v_row.prepared_by = auth.uid() then
    raise exception 'Someone other than the person who prepared this version must approve it.' using errcode = '42501';
  end if;
  if jsonb_array_length(survey.guardrail_problems(v_row.definition)) > 0 then
    raise exception 'This version breaks the survey guardrails and cannot be published.' using errcode = '22023';
  end if;
  select * into v_current from public.survey_versions where status = 'published' for update;
  if v_current.id is not null and v_current.scale_signature is distinct from v_row.scale_signature
     and not p_confirm_scale_change then
    raise exception 'The rating scales changed. Trends will break at this date; confirm to publish.' using errcode = '22023';
  end if;
  v_snap := survey.build_snapshot();
  if v_current.id is not null then
    update public.survey_versions set status = 'retired', retired_at = now() where id = v_current.id;
  end if;
  update public.survey_versions
     set status = 'published', approved_by = auth.uid(), published_at = now(), catalogue_snapshot = v_snap,
         checksum = encode(extensions.digest(convert_to(v_row.definition::text || v_snap::text, 'UTF8'), 'sha256'), 'hex')
   where id = p_id;
end;
$$;

revoke all on function public.survey_version_create_draft(), public.survey_version_update(uuid, jsonb, text, int),
  public.survey_version_validate(uuid), public.survey_version_request_publish(uuid),
  public.survey_version_withdraw(uuid), public.survey_version_reject(uuid, text),
  public.survey_version_approve_publish(uuid, boolean) from public, anon;
grant execute on function public.survey_version_create_draft(), public.survey_version_update(uuid, jsonb, text, int),
  public.survey_version_validate(uuid), public.survey_version_request_publish(uuid),
  public.survey_version_withdraw(uuid), public.survey_version_reject(uuid, text),
  public.survey_version_approve_publish(uuid, boolean) to authenticated;

-- Live catalogue preview for the editor (FR-44): what a new session would show if published now.
create or replace function public.survey_preview_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_perm('survey.edit') or app.has_perm('survey.publish.approve')) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  return survey.build_snapshot();
end;
$$;
revoke all on function public.survey_preview_snapshot() from public, anon;
grant execute on function public.survey_preview_snapshot() to authenticated;

-- ---------------------------------------------------------------------------
-- v1 = REQ §2.4–§2.8 with D-12, D-13, D-15 (published by migration, D-36).
-- The definition between the markers is packages/survey-engine/src/v1.json (checked by a test).
-- ---------------------------------------------------------------------------
insert into public.survey_versions (version_no, status, definition, catalogue_snapshot, scale_signature, checksum,
                                    change_note, published_at)
select 1, 'published', d.def, s.snap, survey.scale_signature(d.def),
       encode(extensions.digest(convert_to(d.def::text || s.snap::text, 'UTF8'), 'sha256'), 'hex'),
       'Initial survey (REQ §2.4–§2.8).', now()
from (select
-- V1-BEGIN
$v1${"schema":1,"intro":"Thanks for choosing Serene Insurance. 5 quick questions, under a minute.","pages":[{"id":"transaction","title":"About your policy","questions":[{"id":"channel","type":"single_choice","label":"How did you obtain your insurance policy?","options_source":"service_channels","required":true},{"id":"channel_other","type":"text_short","label":"Please tell us how (optional)","visible_when":{"var":"channel.is_other"},"max_length":80},{"id":"branch","type":"single_choice","label":"Which branch issued your policy?","help":"The branch that issued your policy, which may differ from one you visited.","options_source":"branches","visible_when":{"in":[{"var":"channel.branch_requirement"},["required","optional"]]},"required":{"eq":[{"var":"channel.branch_requirement"},"required"]}},{"id":"branch_other","type":"text_short","label":"Branch name (optional)","visible_when":{"var":"branch.is_other"},"max_length":80},{"id":"product","type":"single_choice","label":"What type of insurance policy did you get?","options_source":"insurance_products","required":true},{"id":"product_other","type":"text_short","label":"Please tell us which (optional)","visible_when":{"var":"product.is_other"},"max_length":80}]},{"id":"csat","title":"Overall satisfaction","questions":[{"id":"csat","type":"rating_5","label":"How satisfied are you with the insurance service you received?","anchors":["Very dissatisfied","Dissatisfied","Neutral","Satisfied","Very satisfied"],"required":true}]},{"id":"ces","title":"Ease of service","questions":[{"id":"ces","type":"rating_5","label":"How easy was it to obtain your insurance policy?","anchors":["Very difficult","Difficult","Neither easy nor difficult","Easy","Very easy"],"required":true}]},{"id":"nps","title":"Recommendation","questions":[{"id":"nps","type":"rating_0_10","label":"How likely are you to recommend Serene Insurance to someone you know?","anchors":["Not at all likely","Extremely likely"],"required":true}]},{"id":"feedback","title":"Additional feedback","title_when_low_csat":"We're sorry we fell short. What should we improve?","questions":[{"id":"factor","type":"single_choice","label":"What is the main thing we could improve? (optional)","options_source":"improvement_factors"},{"id":"factor_other","type":"text_short","label":"Please tell us what (optional)","visible_when":{"var":"factor.is_other"},"max_length":200},{"id":"comment","type":"text_long","label":"Anything else you'd like to tell us? (optional)","max_length":1000},{"id":"contact_consent","type":"toggle","label":"You may contact me about my feedback","help":"We'll only use your number to follow up on this feedback."},{"id":"phone","type":"phone","label":"Your mobile number","visible_when":{"var":"contact_consent"},"required":{"var":"contact_consent"}},{"id":"first_name","type":"text_short","label":"Your first name (optional)","visible_when":{"var":"contact_consent"},"max_length":40}]}]}$v1$
-- V1-END
::jsonb as def) d, (select survey.build_snapshot() as snap) s;
