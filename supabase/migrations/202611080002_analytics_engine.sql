-- MS-07 analytics engine, part 2: targets, the filter object, branch scope, metric maths and the
-- analytics / records RPCs (M08, M09, M10). Formulas mirror packages/metrics (cross-tested).
--
-- Rules implemented here: valid responses only (verified unless include_unverified, A-135); "No data"
-- is null, never 0; every value carries n; low_sample below the minimum_sample setting; benchmarks
-- use the same period and non-branch filters; versions with different scale_signature are never
-- combined in one figure (Rule 6); branch-scoped users see their branches only, plus aggregate
-- ranking rows for other branches (Rule 10, D-24, D-34). No "response rate" exists anywhere (D-33).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Targets (REQ §13.1). The UI is MS-11's; reads for analytics.view, writes for targets.manage.
-- No delete: a target ends by setting effective_to.
-- ---------------------------------------------------------------------------
create table public.targets (
  id              uuid primary key default gen_random_uuid(),
  metric          text not null check (metric in ('csat_pct', 'csat_avg', 'nps', 'ces_avg', 'completion_rate',
                    'negative_rate', 'resolution_time_days', 'sla_compliance_pct')),
  scope_type      text not null check (scope_type in ('organisation', 'region', 'branch', 'channel', 'product')),
  scope_id        uuid,
  target_value    numeric not null,
  direction       text not null check (direction in ('higher_is_better', 'lower_is_better')),
  effective_from  date not null,
  effective_to    date,
  note            text check (length(note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  version         int not null default 1,
  check ((scope_type = 'organisation') = (scope_id is null)),
  check (effective_to is null or effective_to >= effective_from)
);
comment on table public.targets is 'Effective-dated KPI targets (REQ §13.1). The latest effective row for a scope applies.';
create index targets_lookup on public.targets (metric, scope_type, scope_id, effective_from desc);
create trigger targets_touch before update on public.targets for each row execute function app.touch_row();
create trigger targets_actor before insert or update on public.targets for each row execute function app.stamp_actor();
create trigger targets_audit after insert or update on public.targets for each row execute function app.audit_row();
alter table public.targets enable row level security;
create policy targets_read on public.targets for select to authenticated
  using ((select app.has_perm('analytics.view')) or (select app.has_perm('targets.manage')));
create policy targets_insert on public.targets for insert to authenticated
  with check ((select app.has_perm('targets.manage')));
create policy targets_update on public.targets for update to authenticated
  using ((select app.has_perm('targets.manage'))) with check ((select app.has_perm('targets.manage')));
revoke all on public.targets from public, anon, authenticated;
grant select on public.targets to authenticated;
grant insert (metric, scope_type, scope_id, target_value, direction, effective_from, effective_to, note)
  on public.targets to authenticated;
grant update (target_value, direction, effective_from, effective_to, note) on public.targets to authenticated;

create or replace function analytics.target_row(p_metric text, p_scope_type text, p_scope_id uuid, p_on date)
returns public.targets
language sql
stable
security definer
set search_path = ''
as $$
  select t.* from public.targets t
  where t.metric = p_metric and t.scope_type = p_scope_type and t.scope_id is not distinct from p_scope_id
    and t.effective_from <= p_on and (t.effective_to is null or t.effective_to >= p_on)
  order by t.effective_from desc, t.created_at desc
  limit 1
$$;

create or replace function analytics.target_for(p_metric text, p_scope_type text, p_scope_id uuid, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_perm('analytics.view') or app.has_perm('targets.manage')
          or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'You don''t have permission to view targets.' using errcode = '42501';
  end if;
  return (analytics.target_row(p_metric, p_scope_type, p_scope_id, coalesce(p_on, (now() at time zone 'Africa/Accra')::date))).target_value;
end;
$$;
comment on function analytics.target_for(text, text, uuid, date) is 'Latest effective target value for a metric and scope on a date, or null ("No target").';

-- {"value","direction","status":"met|not_met"|null} or null when there is no target.
create or replace function analytics.target_json(p_metric text, p_scope_type text, p_scope_id uuid, p_on date,
  p_value numeric)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when t.id is null then null else jsonb_build_object(
    'value', t.target_value, 'direction', t.direction,
    'status', case when p_value is null then null
                   when (t.direction = 'higher_is_better' and p_value >= t.target_value)
                     or (t.direction = 'lower_is_better' and p_value <= t.target_value) then 'met'
                   else 'not_met' end) end
  from analytics.target_row(p_metric, p_scope_type, p_scope_id, p_on) t
  where p_scope_type is not null
$$;

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function analytics.j_uuids(p jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$ select case when jsonb_typeof(p) = 'array' then array(select jsonb_array_elements_text(p)::uuid) end $$;

create or replace function analytics.j_texts(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$ select case when jsonb_typeof(p) = 'array' then array(select jsonb_array_elements_text(p)) end $$;

create or replace function analytics.min_sample()
returns int
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select (value #>> '{}')::int from public.settings where key = 'minimum_sample'), 30) $$;

-- Low sample is a separate state from "No data": n = 0 is No data, 0 < n < threshold is low sample.
create or replace function analytics.low_sample(p_n numeric, p_min int)
returns boolean
language sql
immutable
set search_path = ''
as $$ select coalesce(p_n, 0) > 0 and p_n < p_min $$;

create or replace function analytics.is_service()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(auth.jwt() ->> 'role', '') = 'service_role' $$;

-- Permission check for analytics RPCs. service_role (scheduled reports, MS-12) has organisation scope.
create or replace function analytics.require(p_perm text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if analytics.is_service() then
    return;
  end if;
  perform app.require_perm(p_perm, true);
end;
$$;

create or replace function analytics.can(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select analytics.is_service() or app.has_perm(p_perm) $$;

create or replace function analytics.enum_filter(p_filters jsonb, p_key text, p_allowed text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_vals text[];
begin
  if not (p_filters ? p_key) or jsonb_typeof(p_filters -> p_key) = 'null' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p_filters -> p_key) <> 'array' then
    raise exception 'One of the selected filter values isn''t valid. Reset the filters and try again.'
      using errcode = '22023', detail = p_key;
  end if;
  v_vals := analytics.j_texts(p_filters -> p_key);
  if cardinality(v_vals) = 0 then
    return '{}'::jsonb;
  end if;
  if not (v_vals <@ p_allowed) then
    raise exception 'One of the selected filter values isn''t valid. Reset the filters and try again.'
      using errcode = '22023', detail = p_key;
  end if;
  return jsonb_build_object(p_key, to_jsonb(v_vals));
end;
$$;

-- ---------------------------------------------------------------------------
-- The filter object (CONTRACTS "Filter object") → a normalised spec. Keys without a value are left
-- out. The caller's branch scope is always taken from the JWT, never from the request.
-- ---------------------------------------------------------------------------
create or replace function analytics.parse_filters(p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_from date;
  v_to date;
  v_out jsonb;
  v_key text;
begin
  if jsonb_typeof(f) <> 'object' then
    raise exception 'The filters aren''t valid. Reset the filters and try again.' using errcode = '22023';
  end if;
  begin
    v_to := coalesce(nullif(f ->> 'to', '')::date, v_today);
    v_from := coalesce(nullif(f ->> 'from', '')::date, v_to - 29);
  exception when others then
    raise exception 'Dates must be real dates in the format YYYY-MM-DD.' using errcode = '22023';
  end;
  if v_from > v_to then
    raise exception 'The start date must be on or before the end date.' using errcode = '22023';
  end if;
  if v_to - v_from > 3660 then
    raise exception 'Choose a period of ten years or less.' using errcode = '22023';
  end if;
  v_out := jsonb_build_object(
    'from', v_from, 'to', v_to,
    'include_unverified', coalesce(f ->> 'include_unverified', 'false') = 'true',
    'scope_all', app.org_scope() or analytics.is_service(),
    'scope_ids', to_jsonb(app.branch_ids()));
  foreach v_key in array array['branch_ids', 'region_ids', 'channel_ids', 'product_ids', 'factor_ids',
                               'qr_point_ids', 'survey_version_ids'] loop
    continue when not (f ? v_key) or jsonb_typeof(f -> v_key) = 'null';
    if jsonb_typeof(f -> v_key) <> 'array' then
      raise exception 'One of the selected filter values isn''t valid. Reset the filters and try again.'
        using errcode = '22023', detail = v_key;
    end if;
    continue when jsonb_array_length(f -> v_key) = 0;
    begin
      v_out := v_out || jsonb_build_object(v_key, to_jsonb(analytics.j_uuids(f -> v_key)));
    exception when invalid_text_representation then
      raise exception 'One of the selected filter values isn''t valid. Reset the filters and try again.'
        using errcode = '22023', detail = v_key;
    end;
  end loop;
  v_out := v_out
    || analytics.enum_filter(f, 'branch_statuses', array['other', 'not_applicable', 'not_provided'])
    || analytics.enum_filter(f, 'satisfaction', array['negative', 'neutral', 'positive'])
    || analytics.enum_filter(f, 'nps_classes', array['promoter', 'passive', 'detractor'])
    || analytics.enum_filter(f, 'source_codes', array['sms', 'direct', 'qr'])
    || analytics.enum_filter(f, 'case_statuses', array['none', 'new', 'assigned', 'in_progress', 'resolved', 'closed']);
  if v_out ? 'source_codes' then
    v_out := v_out || jsonb_build_object('source_ids',
      (select coalesce(jsonb_agg(s.id), '[]'::jsonb) from public.survey_sources s
        where s.code = any (analytics.j_texts(v_out -> 'source_codes'))));
  end if;
  if coalesce(f ->> 'has_comment', 'false') = 'true' then
    v_out := v_out || '{"has_comment": true}'::jsonb;
  end if;
  return v_out;
end;
$$;

create or replace function analytics.previous_spec(p_spec jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_spec || jsonb_build_object(
    'from', (p_spec ->> 'from')::date - ((p_spec ->> 'to')::date - (p_spec ->> 'from')::date + 1),
    'to', (p_spec ->> 'from')::date - 1)
$$;

-- Company-wide benchmark: same period and non-branch filters, whole organisation (FR-17, Rule 9).
create or replace function analytics.company_spec(p_spec jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select (p_spec - 'branch_ids' - 'branch_statuses' - 'region_ids') || '{"scope_all": true}'::jsonb $$;

-- ---------------------------------------------------------------------------
-- Row sources. Plain SQL without SET options so the planner inlines them and pushes keyset
-- pagination and date ranges down to the indexes. Internal only (not granted).
-- ---------------------------------------------------------------------------
create or replace function analytics.filtered_spec(p_spec jsonb)
returns setof analytics.v_responses_effective
language sql
stable
as $$
  select r.*
  from analytics.v_responses_effective r
  where r.submitted_at >= ((p_spec ->> 'from')::date::timestamp at time zone 'Africa/Accra')
    and r.submitted_at < (((p_spec ->> 'to')::date + 1)::timestamp at time zone 'Africa/Accra')
    and (coalesce((p_spec ->> 'include_unverified')::boolean, false) or r.is_verified)
    and (coalesce((p_spec ->> 'scope_all')::boolean, false)
         or r.issuing_branch_id = any ((select analytics.j_uuids(p_spec -> 'scope_ids'))::uuid[]))
    and ((not (p_spec ? 'branch_ids') and not (p_spec ? 'branch_statuses'))
         or r.issuing_branch_id = any ((select analytics.j_uuids(p_spec -> 'branch_ids'))::uuid[])
         or r.branch_status = any ((select analytics.j_texts(p_spec -> 'branch_statuses'))::text[]))
    and (not (p_spec ? 'region_ids') or r.region_id = any ((select analytics.j_uuids(p_spec -> 'region_ids'))::uuid[]))
    and (not (p_spec ? 'channel_ids')
         or r.service_channel_id = any ((select analytics.j_uuids(p_spec -> 'channel_ids'))::uuid[]))
    and (not (p_spec ? 'product_ids')
         or r.insurance_product_id = any ((select analytics.j_uuids(p_spec -> 'product_ids'))::uuid[]))
    and (not (p_spec ? 'factor_ids')
         or r.improvement_factor_id = any ((select analytics.j_uuids(p_spec -> 'factor_ids'))::uuid[]))
    and (not (p_spec ? 'source_ids') or r.source_id = any ((select analytics.j_uuids(p_spec -> 'source_ids'))::uuid[]))
    and (not (p_spec ? 'qr_point_ids')
         or r.qr_point_id = any ((select analytics.j_uuids(p_spec -> 'qr_point_ids'))::uuid[]))
    and (not (p_spec ? 'survey_version_ids')
         or r.survey_version_id = any ((select analytics.j_uuids(p_spec -> 'survey_version_ids'))::uuid[]))
    and (not (p_spec ? 'satisfaction') or r.satisfaction = any ((select analytics.j_texts(p_spec -> 'satisfaction'))::text[]))
    and (not (p_spec ? 'nps_classes') or r.nps_class = any ((select analytics.j_texts(p_spec -> 'nps_classes'))::text[]))
    and (not (p_spec ? 'has_comment') or r.has_comment)
$$;

-- Roll-up rows matching every filter that exists at the roll-up grain. Verification is left to the
-- caller, which counts unverified rows separately.
create or replace function analytics.rollup_spec(p_spec jsonb, p_monthly boolean)
returns setof analytics.responses_daily
language sql
stable
as $$
  with b as (
    select (p_spec ->> 'from')::date as d_from, (p_spec ->> 'to')::date as d_to,
           -- Whole months inside the period: [m_from, m_to).
           case when p_monthly then (date_trunc('month', ((p_spec ->> 'from')::date - 1)::timestamp) + interval '1 month')::date end as m_from,
           case when p_monthly then date_trunc('month', ((p_spec ->> 'to')::date + 1)::timestamp)::date end as m_to
  )
  select d.*
  from (
    select x.* from analytics.responses_daily x, b
    where x.local_date between b.d_from and b.d_to
      and not (b.m_from is not null and b.m_from < b.m_to and x.local_date >= b.m_from and x.local_date < b.m_to)
    union all
    select y.* from analytics.responses_monthly y, b
    where b.m_from is not null and b.m_from < b.m_to and y.local_date >= b.m_from and y.local_date < b.m_to
  ) d
  where (coalesce((p_spec ->> 'scope_all')::boolean, false)
         or d.issuing_branch_id = any ((select analytics.j_uuids(p_spec -> 'scope_ids'))::uuid[]))
    and ((not (p_spec ? 'branch_ids') and not (p_spec ? 'branch_statuses'))
         or d.issuing_branch_id = any ((select analytics.j_uuids(p_spec -> 'branch_ids'))::uuid[])
         or d.branch_status = any ((select analytics.j_texts(p_spec -> 'branch_statuses'))::text[]))
    and (not (p_spec ? 'region_ids') or d.region_id = any ((select analytics.j_uuids(p_spec -> 'region_ids'))::uuid[]))
    and (not (p_spec ? 'channel_ids')
         or d.service_channel_id = any ((select analytics.j_uuids(p_spec -> 'channel_ids'))::uuid[]))
    and (not (p_spec ? 'product_ids')
         or d.insurance_product_id = any ((select analytics.j_uuids(p_spec -> 'product_ids'))::uuid[]))
    and (not (p_spec ? 'factor_ids')
         or d.improvement_factor_id = any ((select analytics.j_uuids(p_spec -> 'factor_ids'))::uuid[]))
    and (not (p_spec ? 'source_ids') or d.source_id = any ((select analytics.j_uuids(p_spec -> 'source_ids'))::uuid[]))
    and (not (p_spec ? 'qr_point_ids')
         or d.qr_point_id = any ((select analytics.j_uuids(p_spec -> 'qr_point_ids'))::uuid[]))
    and (not (p_spec ? 'survey_version_ids')
         or d.survey_version_id = any ((select analytics.j_uuids(p_spec -> 'survey_version_ids'))::uuid[]))
$$;

-- Raw responses projected to the roll-up row shape, for filters below the roll-up grain
-- (satisfaction band, NPS class, has_comment). Exact either way.
create or replace function analytics.raw_cells(p_spec jsonb)
returns setof analytics.responses_daily
language sql
stable
as $$
  select r.local_date, r.survey_version_id, r.source_id, r.qr_point_id, r.branch_status, r.issuing_branch_id,
    r.region_id, r.service_channel_id, r.insurance_product_id, r.improvement_factor_id, r.is_verified, 1,
    (r.csat_score = 1)::int, (r.csat_score = 2)::int, (r.csat_score = 3)::int, (r.csat_score = 4)::int,
    (r.csat_score = 5)::int,
    (r.ces_score = 1)::int, (r.ces_score = 2)::int, (r.ces_score = 3)::int, (r.ces_score = 4)::int,
    (r.ces_score = 5)::int,
    (r.nps_score = 0)::int, (r.nps_score = 1)::int, (r.nps_score = 2)::int, (r.nps_score = 3)::int,
    (r.nps_score = 4)::int, (r.nps_score = 5)::int, (r.nps_score = 6)::int, (r.nps_score = 7)::int,
    (r.nps_score = 8)::int, (r.nps_score = 9)::int, (r.nps_score = 10)::int,
    (r.completion_duration_ms is not null and not r.duration_from_opened)::int,
    case when r.completion_duration_ms is not null and not r.duration_from_opened
         then r.completion_duration_ms::bigint else 0::bigint end,
    (r.completion_duration_ms is not null and not r.duration_from_opened and r.completion_duration_ms <= 60000)::int
  from analytics.filtered_spec(p_spec) r
$$;

-- Public, scoped access to effective rows (exports, MS-12). SECURITY DEFINER; applies the filters
-- and the caller's branch scope; valid = verified unless include_unverified.
create or replace function analytics.filtered_responses(p_filters jsonb)
returns setof analytics.v_responses_effective
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
begin
  if not (analytics.can('analytics.view') or analytics.can('responses.view')) then
    raise exception 'You don''t have permission to view feedback.' using errcode = '42501';
  end if;
  if not analytics.is_service()
     and not (app.user_has_perm_now(auth.uid(), 'analytics.view') or app.user_has_perm_now(auth.uid(), 'responses.view')) then
    raise exception 'You don''t have permission to view feedback.' using errcode = '42501';
  end if;
  -- Parsed once: passed inline, the inlined filtered_spec re-evaluated it per row (96 s for 100k rows).
  v_spec := analytics.parse_filters(p_filters);
  return query select * from analytics.filtered_spec(v_spec);
end;
$$;

-- ---------------------------------------------------------------------------
-- Counters. One row per (group key, scale signature): c = {"n", "csat":[1..5], "ces":[1..5],
-- "nps":[0..10], "factors":{factor_id: n}, "unverified"}; n counts valid responses only.
-- Groups: total | branch | region | channel | product | factor | source | qr_point | version |
-- day | week (ISO, Monday) | month | quarter | year.
-- ---------------------------------------------------------------------------
create or replace function analytics.counters(p_spec jsonb, p_group text)
returns table (gkey text, sig text, c jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw boolean := p_spec ? 'satisfaction' or p_spec ? 'nps_classes' or p_spec ? 'has_comment';
  v_unver boolean := coalesce((p_spec ->> 'include_unverified')::boolean, false);
  v_all jsonb := p_spec || '{"include_unverified": true}'::jsonb;
begin
  if p_group not in ('total', 'branch', 'region', 'channel', 'product', 'factor', 'source', 'qr_point', 'version',
                     'day', 'week', 'month', 'quarter', 'year') then
    raise exception 'That breakdown isn''t available.' using errcode = '22023';
  end if;
  return query
  with cells as (
    select d.* from analytics.rollup_spec(v_all, p_group not in ('day', 'week')) d where not v_raw
    union all
    select x.* from analytics.raw_cells(v_all) x where v_raw
  ), agg as (
    -- Plain sums first (cheap per row); verification and the version's scale signature are applied
    -- to the far smaller grouped set.
    select
      case p_group
        when 'total' then ''
        when 'branch' then x.issuing_branch_id::text
        when 'region' then x.region_id::text
        when 'channel' then x.service_channel_id::text
        when 'product' then x.insurance_product_id::text
        when 'factor' then x.improvement_factor_id::text
        when 'source' then x.source_id::text
        when 'qr_point' then x.qr_point_id::text
        when 'version' then x.survey_version_id::text
        when 'day' then x.local_date::text
        else date_trunc(p_group, x.local_date::timestamp)::date::text
      end as k,
      x.survey_version_id as ver_id,
      x.improvement_factor_id as f,
      x.is_verified as ver,
      sum(x.n) as n,
      sum(x.csat_1) as c1,
      sum(x.csat_2) as c2,
      sum(x.csat_3) as c3,
      sum(x.csat_4) as c4,
      sum(x.csat_5) as c5,
      sum(x.ces_1) as e1,
      sum(x.ces_2) as e2,
      sum(x.ces_3) as e3,
      sum(x.ces_4) as e4,
      sum(x.ces_5) as e5,
      sum(x.nps_0) as p0,
      sum(x.nps_1) as p1,
      sum(x.nps_2) as p2,
      sum(x.nps_3) as p3,
      sum(x.nps_4) as p4,
      sum(x.nps_5) as p5,
      sum(x.nps_6) as p6,
      sum(x.nps_7) as p7,
      sum(x.nps_8) as p8,
      sum(x.nps_9) as p9,
      sum(x.nps_10) as p10
    from cells x
    group by 1, 2, 3, 4
  ), base as (
    select a.k, v.scale_signature::text as s, a.f,
      coalesce(sum(a.n) filter (where v_unver or a.ver), 0) as n,
      coalesce(sum(a.c1) filter (where v_unver or a.ver), 0) as c1,
      coalesce(sum(a.c2) filter (where v_unver or a.ver), 0) as c2,
      coalesce(sum(a.c3) filter (where v_unver or a.ver), 0) as c3,
      coalesce(sum(a.c4) filter (where v_unver or a.ver), 0) as c4,
      coalesce(sum(a.c5) filter (where v_unver or a.ver), 0) as c5,
      coalesce(sum(a.e1) filter (where v_unver or a.ver), 0) as e1,
      coalesce(sum(a.e2) filter (where v_unver or a.ver), 0) as e2,
      coalesce(sum(a.e3) filter (where v_unver or a.ver), 0) as e3,
      coalesce(sum(a.e4) filter (where v_unver or a.ver), 0) as e4,
      coalesce(sum(a.e5) filter (where v_unver or a.ver), 0) as e5,
      coalesce(sum(a.p0) filter (where v_unver or a.ver), 0) as p0,
      coalesce(sum(a.p1) filter (where v_unver or a.ver), 0) as p1,
      coalesce(sum(a.p2) filter (where v_unver or a.ver), 0) as p2,
      coalesce(sum(a.p3) filter (where v_unver or a.ver), 0) as p3,
      coalesce(sum(a.p4) filter (where v_unver or a.ver), 0) as p4,
      coalesce(sum(a.p5) filter (where v_unver or a.ver), 0) as p5,
      coalesce(sum(a.p6) filter (where v_unver or a.ver), 0) as p6,
      coalesce(sum(a.p7) filter (where v_unver or a.ver), 0) as p7,
      coalesce(sum(a.p8) filter (where v_unver or a.ver), 0) as p8,
      coalesce(sum(a.p9) filter (where v_unver or a.ver), 0) as p9,
      coalesce(sum(a.p10) filter (where v_unver or a.ver), 0) as p10,
      coalesce(sum(a.n) filter (where not a.ver), 0) as unv
    from agg a
    join public.survey_versions v on v.id = a.ver_id
    group by 1, 2, 3
  )
  select b.k, b.s, jsonb_build_object(
    'n', sum(b.n),
    'csat', jsonb_build_array(sum(b.c1), sum(b.c2), sum(b.c3), sum(b.c4), sum(b.c5)),
    'ces', jsonb_build_array(sum(b.e1), sum(b.e2), sum(b.e3), sum(b.e4), sum(b.e5)),
    'nps', jsonb_build_array(sum(b.p0), sum(b.p1), sum(b.p2), sum(b.p3), sum(b.p4), sum(b.p5), sum(b.p6),
                             sum(b.p7), sum(b.p8), sum(b.p9), sum(b.p10)),
    'factors', coalesce(jsonb_object_agg(b.f, b.n) filter (where b.f is not null and b.n > 0), '{}'::jsonb),
    'unverified', sum(b.unv))
  from base b
  group by b.k, b.s;
end;
$$;

create or replace function analytics.empty_counts()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"n":0,"csat":[0,0,0,0,0],"ces":[0,0,0,0,0],"nps":[0,0,0,0,0,0,0,0,0,0,0],"factors":{},"unverified":0}'::jsonb
$$;


-- Counters for one group set, merged across rows of the same scale signature. Several signatures
-- with valid responses → error (strict) or {"mixed_scales": true, "n": 0} (not strict).
create or replace function analytics.merge_group(p_rows jsonb, p_strict boolean)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_valid jsonb;
  v_unverified numeric;
begin
  select coalesce(sum((e -> 'c' ->> 'unverified')::numeric), 0) into v_unverified
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_valid
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
  where (e -> 'c' ->> 'n')::numeric > 0;
  if jsonb_array_length(v_valid) > 1 then
    if p_strict then
      raise exception 'This selection includes survey versions with different rating scales, which can''t be combined in one figure. Choose a single survey version or a shorter period.'
        using errcode = '22023', hint = 'mixed_scales';
    end if;
    return analytics.empty_counts() || jsonb_build_object('mixed_scales', true, 'unverified', v_unverified);
  end if;
  if jsonb_array_length(v_valid) = 0 then
    return analytics.empty_counts() || jsonb_build_object('unverified', v_unverified, 'sig', null);
  end if;
  return (v_valid -> 0 -> 'c') || jsonb_build_object('unverified', v_unverified, 'sig', v_valid -> 0 -> 's');
end;
$$;

create or replace function analytics.totals(p_spec jsonb, p_strict boolean default true)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select analytics.merge_group(
    (select jsonb_agg(jsonb_build_object('s', t.sig, 'c', t.c)) from analytics.counters(p_spec, 'total') t), p_strict)
$$;

-- Metric values from counters (SPEC M08 table, REQ §11). Null = "No data".
create or replace function analytics.metric_values(p_c jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'n', n,
    'csat_pct', case when n > 0 then round((c4 + c5) * 100 / n, 6) end,
    'csat_avg', case when n > 0 then round((c1 + 2 * c2 + 3 * c3 + 4 * c4 + 5 * c5) / n, 6) end,
    'ces_avg', case when n > 0 then round((e1 + 2 * e2 + 3 * e3 + 4 * e4 + 5 * e5) / n, 6) end,
    'nps', case when n > 0 then round((p9 + p10 - (p0 + p1 + p2 + p3 + p4 + p5 + p6)) * 100 / n, 6) end,
    'negative_rate', case when n > 0 then round((c1 + c2) * 100 / n, 6) end)
  from (select coalesce((p_c ->> 'n')::numeric, 0) as n,
               (p_c -> 'csat' ->> 0)::numeric as c1, (p_c -> 'csat' ->> 1)::numeric as c2,
               (p_c -> 'csat' ->> 2)::numeric as c3, (p_c -> 'csat' ->> 3)::numeric as c4,
               (p_c -> 'csat' ->> 4)::numeric as c5,
               (p_c -> 'ces' ->> 0)::numeric as e1, (p_c -> 'ces' ->> 1)::numeric as e2,
               (p_c -> 'ces' ->> 2)::numeric as e3, (p_c -> 'ces' ->> 3)::numeric as e4,
               (p_c -> 'ces' ->> 4)::numeric as e5,
               (p_c -> 'nps' ->> 0)::numeric as p0, (p_c -> 'nps' ->> 1)::numeric as p1,
               (p_c -> 'nps' ->> 2)::numeric as p2, (p_c -> 'nps' ->> 3)::numeric as p3,
               (p_c -> 'nps' ->> 4)::numeric as p4, (p_c -> 'nps' ->> 5)::numeric as p5,
               (p_c -> 'nps' ->> 6)::numeric as p6, (p_c -> 'nps' ->> 9)::numeric as p9,
               (p_c -> 'nps' ->> 10)::numeric as p10) t
$$;

create or replace function analytics.rate(p_num numeric, p_den numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select case when coalesce(p_den, 0) > 0 then round(p_num * 100 / p_den, 6) end $$;

-- Main improvement factor (A-108): mode excluding "Nothing, I am satisfied" and blanks; ties shown
-- together. share = top count ÷ responses that named a factor other than "none"; n = that denominator.
create or replace function analytics.main_factor(p_factors jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select i.code, i.label, i.sort_order, e.value::numeric as cnt
    from jsonb_each_text(coalesce(p_factors, '{}'::jsonb)) e
    join public.improvement_factors i on i.id = e.key::uuid and not i.is_none
  ), t as (select coalesce(sum(cnt), 0) as total, coalesce(max(cnt), 0) as top from f)
  select jsonb_build_object(
    'codes', coalesce((select jsonb_agg(f.code order by f.sort_order, f.label) from f where f.cnt = t.top and t.top > 0),
                      '[]'::jsonb),
    'labels', coalesce((select jsonb_agg(f.label order by f.sort_order, f.label) from f where f.cnt = t.top and t.top > 0),
                       '[]'::jsonb),
    'share', analytics.rate(t.top, t.total),
    'count', t.top,
    'n', t.total)
  from t
$$;

-- {"value","n","low_sample","benchmark","delta","target"} (CONTRACTS "M").
create or replace function analytics.m(p_value numeric, p_n numeric, p_min int, p_benchmark numeric,
  p_previous numeric, p_target jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('value', p_value, 'n', coalesce(p_n, 0), 'low_sample', analytics.low_sample(p_n, p_min),
    'benchmark', p_benchmark, 'delta', round(p_value - p_previous, 6), 'target', p_target)
$$;

-- Target scope implied by the filters: one branch / region / channel / product alone, or the whole
-- organisation when none of these is filtered; null (no target shown) for mixed selections.
create or replace function analytics.target_scope(p_spec jsonb, out scope_type text, out scope_id uuid)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_dims int := (p_spec ? 'branch_ids')::int + (p_spec ? 'branch_statuses')::int + (p_spec ? 'region_ids')::int
                + (p_spec ? 'channel_ids')::int + (p_spec ? 'product_ids')::int;
begin
  if v_dims = 0 then
    scope_type := 'organisation';
  elsif v_dims = 1 and jsonb_array_length(coalesce(p_spec -> 'branch_ids', p_spec -> 'region_ids',
          p_spec -> 'channel_ids', p_spec -> 'product_ids', '[]'::jsonb)) = 1 then
    scope_type := case when p_spec ? 'branch_ids' then 'branch' when p_spec ? 'region_ids' then 'region'
                       when p_spec ? 'channel_ids' then 'channel' else 'product' end;
    scope_id := (coalesce(p_spec -> 'branch_ids', p_spec -> 'region_ids', p_spec -> 'channel_ids',
                          p_spec -> 'product_ids') ->> 0)::uuid;
  end if;
end;
$$;

-- Funnel counters from sessions_daily (date, source and QR-point filters only: the other filters
-- are answers, unknown until submission). f = {"visits","started","reached":[5],"submitted",
-- "abandoned_by_page":[5],"cooldown_blocked","turnstile_failed"}.
create or replace function analytics.session_counts(p_spec jsonb, p_group text)
returns table (gkey text, f jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select k, jsonb_build_object(
    'visits', sum(opened), 'started', sum(interactive),
    'reached', jsonb_build_array(sum(reached_1), sum(reached_2), sum(reached_3), sum(reached_4), sum(reached_5)),
    'submitted', sum(submitted),
    'abandoned_by_page', jsonb_build_array(sum(abandoned_1), sum(abandoned_2), sum(abandoned_3), sum(abandoned_4),
                                           sum(abandoned_5)),
    'cooldown_blocked', sum(cooldown_blocked), 'turnstile_failed', sum(turnstile_failed))
  from (
    select case p_group
             when 'total' then ''
             when 'source' then s.source_id::text
             when 'qr_point' then s.qr_point_id::text
             when 'day' then s.local_date::text
             else date_trunc(p_group, s.local_date::timestamp)::date::text
           end as k, s.*
    from analytics.sessions_daily s
    where s.local_date between (p_spec ->> 'from')::date and (p_spec ->> 'to')::date
      and (not (p_spec ? 'source_ids') or s.source_id = any (analytics.j_uuids(p_spec -> 'source_ids')))
      and (not (p_spec ? 'qr_point_ids') or s.qr_point_id = any (analytics.j_uuids(p_spec -> 'qr_point_ids')))
  ) x
  group by k
$$;

create or replace function analytics.empty_sessions()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"visits":0,"started":0,"reached":[0,0,0,0,0],"submitted":0,"abandoned_by_page":[0,0,0,0,0],"cooldown_blocked":0,"turnstile_failed":0}'::jsonb
$$;

create or replace function analytics.session_totals(p_spec jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select f from analytics.session_counts(p_spec, 'total')), analytics.empty_sessions()) $$;

create or replace function analytics.period_json(p_spec jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('from', p_spec ->> 'from', 'to', p_spec ->> 'to', 'tz', 'Africa/Accra',
    'days', (p_spec ->> 'to')::date - (p_spec ->> 'from')::date + 1)
$$;

-- Display information for a breakdown key.
create or replace function analytics.dim_info(p_dim text, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_dim
    when 'branch' then (select jsonb_build_object('code', b.code, 'label', b.name, 'sort', b.sort_order,
                          'is_active', b.is_active, 'region_id', b.region_id, 'region_label', r.name)
                        from public.branches b join public.regions r on r.id = b.region_id where b.id = p_key::uuid)
    when 'region' then (select jsonb_build_object('code', code, 'label', name, 'sort', sort_order, 'is_active', is_active)
                        from public.regions where id = p_key::uuid)
    when 'channel' then (select jsonb_build_object('code', code, 'label', label, 'sort', sort_order,
                           'is_active', is_active, 'branch_requirement', branch_requirement)
                         from public.service_channels where id = p_key::uuid)
    when 'product' then (select jsonb_build_object('code', code, 'label', label, 'sort', sort_order, 'is_active', is_active)
                         from public.insurance_products where id = p_key::uuid)
    when 'factor' then (select jsonb_build_object('code', code, 'label', label, 'sort', sort_order, 'is_active', is_active,
                          'is_none', is_none)
                        from public.improvement_factors where id = p_key::uuid)
    when 'source' then (select jsonb_build_object('code', code, 'label', label, 'sort', 0, 'is_active', is_active)
                        from public.survey_sources where id = p_key::uuid)
    when 'qr_point' then (select jsonb_build_object('code', code, 'label', label, 'sort', 0, 'is_active', is_active)
                          from public.qr_points where id = p_key::uuid)
    when 'version' then (select jsonb_build_object('code', version_no::text, 'label', 'Version ' || version_no,
                           'sort', version_no, 'is_active', status = 'published', 'published_at', published_at)
                         from public.survey_versions where id = p_key::uuid)
  end
$$;

-- Breakdown rows for a dimension (analytics_breakdown, compare, ranking). Rows without a key (e.g.
-- responses with no effective branch when grouping by branch) are left out (D-12).
create or replace function analytics.breakdown_rows(p_spec jsonb, p_dim text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_min int := analytics.min_sample();
  v_rows jsonb;
  v_target_scope text := case p_dim when 'branch' then 'branch' when 'region' then 'region'
                                    when 'channel' then 'channel' when 'product' then 'product' end;
begin
  if p_dim not in ('branch', 'region', 'channel', 'product', 'factor', 'source', 'qr_point', 'version') then
    raise exception 'That breakdown isn''t available.' using errcode = '22023';
  end if;
  with raw as (
    select t.gkey, t.sig, t.c from analytics.counters(p_spec, p_dim) t where t.gkey is not null
  ), guard as (
    select count(distinct sig) filter (where (c ->> 'n')::int > 0) as sigs from raw
  ), merged as (
    select r.gkey, analytics.merge_group(jsonb_agg(jsonb_build_object('s', r.sig, 'c', r.c)), true) as c
    from raw r group by r.gkey
  ), m as (
    select g.gkey, g.c, analytics.metric_values(g.c) as mv, analytics.main_factor(g.c -> 'factors') as mf,
           analytics.dim_info(p_dim, g.gkey) as info
    from merged g
  ), ranked as (
    select m.*, case when (m.mv ->> 'n')::int >= v_min
                     then rank() over (partition by (m.mv ->> 'n')::int >= v_min
                                       order by (m.mv ->> 'csat_pct')::numeric desc nulls last) end as rnk
    from m
  )
  select case when p_dim <> 'version' and (select sigs from guard) > 1 then null else
    coalesce(jsonb_agg(jsonb_build_object(
      'key', r.gkey, 'code', r.info ->> 'code', 'label', coalesce(r.info ->> 'label', 'Unknown'),
      'info', r.info - 'code' - 'label',
      'n', (r.mv ->> 'n')::int,
      'csat_pct', r.mv -> 'csat_pct', 'csat_avg', r.mv -> 'csat_avg', 'nps', r.mv -> 'nps',
      'ces_avg', r.mv -> 'ces_avg', 'negative_rate', r.mv -> 'negative_rate',
      'low_sample', analytics.low_sample((r.mv ->> 'n')::int, v_min),
      'main_factor_label', case when jsonb_array_length(r.mf -> 'labels') > 0
                                then (select string_agg(l, ' / ') from jsonb_array_elements_text(r.mf -> 'labels') l) end,
      'main_factor', r.mf,
      'factor_counts', (select coalesce(jsonb_object_agg(i.code, e.value::int), '{}'::jsonb)
                        from jsonb_each_text(r.c -> 'factors') e join public.improvement_factors i on i.id = e.key::uuid),
      'unverified', (r.c ->> 'unverified')::int,
      'rank', r.rnk,
      'target', case when v_target_scope is not null then
                  analytics.target_json('csat_pct', v_target_scope, r.gkey::uuid, (p_spec ->> 'to')::date,
                                        (r.mv ->> 'csat_pct')::numeric) end)
      order by (r.info ->> 'sort')::int nulls last, r.info ->> 'label'), '[]'::jsonb) end
  into v_rows
  from ranked r;
  if v_rows is null then
    raise exception 'This selection includes survey versions with different rating scales, which can''t be combined in one figure. Choose a single survey version or a shorter period.'
        using errcode = '22023', hint = 'mixed_scales';
  end if;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs (authenticated, analytics.view)
-- ---------------------------------------------------------------------------

-- S-A1 KPI row. See the report for the exact shape.
create or replace function public.analytics_summary(p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
  v_prev jsonb;
  v_min int := analytics.min_sample();
  v_bench boolean := analytics.can('analytics.benchmark.view');
  v_cur jsonb;
  v_cm jsonb;
  v_pc jsonb;
  v_pm jsonb;
  v_bm jsonb := '{}'::jsonb;
  v_cs jsonb;
  v_ps jsonb;
  v_ts record;
  v_on date;
  v_key text;
  v_metrics jsonb := '{}'::jsonb;
  v_prev_metrics jsonb := '{}'::jsonb;
  v_cr numeric;
  v_pcr numeric;
begin
  perform analytics.require('analytics.view');
  v_spec := analytics.parse_filters(p_filters);
  v_prev := analytics.previous_spec(v_spec);
  v_on := (v_spec ->> 'to')::date;
  v_cur := analytics.totals(v_spec, true);
  v_cm := analytics.metric_values(v_cur);
  v_pc := analytics.totals(v_prev, false);
  v_pm := analytics.metric_values(v_pc);
  if v_bench then
    v_bm := analytics.metric_values(analytics.totals(analytics.company_spec(v_spec), false));
  end if;
  select * into v_ts from analytics.target_scope(v_spec);
  foreach v_key in array array['csat_pct', 'csat_avg', 'nps', 'ces_avg', 'negative_rate'] loop
    v_metrics := v_metrics || jsonb_build_object(v_key, analytics.m(
      (v_cm ->> v_key)::numeric, (v_cm ->> 'n')::numeric, v_min,
      case when v_bench then (v_bm ->> v_key)::numeric end, (v_pm ->> v_key)::numeric,
      analytics.target_json(v_key, v_ts.scope_type, v_ts.scope_id, v_on, (v_cm ->> v_key)::numeric)));
    v_prev_metrics := v_prev_metrics || jsonb_build_object(v_key, jsonb_build_object(
      'value', v_pm -> v_key, 'n', (v_pm ->> 'n')::int, 'low_sample', analytics.low_sample((v_pm ->> 'n')::int, v_min)));
  end loop;
  -- Completion rate = submitted ÷ started (became interactive) surveys; sessions have no branch yet,
  -- so it covers every survey opened in the period for the selected sources / QR points.
  v_cs := analytics.session_totals(v_spec);
  v_ps := analytics.session_totals(v_prev);
  v_cr := analytics.rate((v_cs ->> 'submitted')::numeric, (v_cs ->> 'started')::numeric);
  v_pcr := analytics.rate((v_ps ->> 'submitted')::numeric, (v_ps ->> 'started')::numeric);
  v_metrics := v_metrics || jsonb_build_object('completion_rate', analytics.m(
      v_cr, (v_cs ->> 'started')::numeric, v_min, case when v_bench then v_cr end, v_pcr,
      analytics.target_json('completion_rate', 'organisation', null, v_on, v_cr))
    || jsonb_build_object('denominator', 'started surveys', 'submitted', (v_cs ->> 'submitted')::int));
  v_prev_metrics := v_prev_metrics || jsonb_build_object('completion_rate', jsonb_build_object(
    'value', v_pcr, 'n', (v_ps ->> 'started')::int, 'low_sample', analytics.low_sample((v_ps ->> 'started')::int, v_min)));
  return jsonb_build_object(
    'period', analytics.period_json(v_spec),
    'n', (v_cm ->> 'n')::int,
    'minimum_sample', v_min,
    'metrics', v_metrics,
    'main_factor', analytics.main_factor(v_cur -> 'factors'),
    'unverified_excluded', case when (v_spec ->> 'include_unverified')::boolean then 0 else (v_cur ->> 'unverified')::int end,
    'include_unverified', (v_spec ->> 'include_unverified')::boolean,
    'scale_signature', v_cur -> 'sig',
    'target_scope', case when v_ts.scope_type is not null
                         then jsonb_build_object('type', v_ts.scope_type, 'id', v_ts.scope_id) end,
    'previous', jsonb_build_object(
      'period', analytics.period_json(v_prev),
      'n', (v_pm ->> 'n')::int,
      'mixed_scales', coalesce((v_pc ->> 'mixed_scales')::boolean, false),
      'metrics', v_prev_metrics,
      'main_factor', analytics.main_factor(v_pc -> 'factors')));
end;
$$;

create or replace function public.analytics_breakdown(p_dimension text, p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform analytics.require('analytics.view');
  return analytics.breakdown_rows(analytics.parse_filters(p_filters), p_dimension);
end;
$$;

-- Time series with every bucket in the period (empty buckets → value null, n 0) and survey-version
-- annotations. A bucket that would mix scale signatures has value null and mixed_scales true.
create or replace function public.analytics_trend(p_metric text, p_granularity text, p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
  v_min int := analytics.min_sample();
  v_from date;
  v_to date;
  v_step interval;
  v_points jsonb;
  v_bench boolean;
begin
  perform analytics.require('analytics.view');
  if p_metric not in ('csat_pct', 'csat_avg', 'nps', 'ces_avg', 'negative_rate', 'responses', 'completion_rate') then
    raise exception 'That metric isn''t available as a trend.' using errcode = '22023';
  end if;
  if p_granularity not in ('day', 'week', 'month', 'quarter', 'year') then
    raise exception 'Choose day, week, month, quarter or year.' using errcode = '22023';
  end if;
  v_spec := analytics.parse_filters(p_filters);
  v_from := (v_spec ->> 'from')::date;
  v_to := (v_spec ->> 'to')::date;
  v_step := case p_granularity when 'day' then interval '1 day' when 'week' then interval '1 week'
                 when 'month' then interval '1 month' when 'quarter' then interval '3 months' else interval '1 year' end;
  if (select count(*) from generate_series(date_trunc(p_granularity, v_from::timestamp), v_to::timestamp, v_step)) > 750 then
    raise exception 'That''s too many points to chart. Choose a coarser granularity or a shorter period.'
      using errcode = '22023';
  end if;
  v_bench := analytics.can('analytics.benchmark.view')
             and (v_spec ? 'branch_ids' or v_spec ? 'branch_statuses' or v_spec ? 'region_ids');

  if p_metric = 'completion_rate' then
    with b as (
      select g::date as bucket from generate_series(date_trunc(p_granularity, v_from::timestamp), v_to::timestamp, v_step) g
    ), s as (select * from analytics.session_counts(v_spec, p_granularity))
    select jsonb_agg(jsonb_build_object(
      'bucket', b.bucket, 'from', greatest(b.bucket, v_from), 'to', least((b.bucket + v_step)::date - 1, v_to),
      'value', analytics.rate((s.f ->> 'submitted')::numeric, (s.f ->> 'started')::numeric),
      'n', coalesce((s.f ->> 'started')::int, 0),
      'low_sample', analytics.low_sample((s.f ->> 'started')::int, v_min),
      'mixed_scales', false, 'benchmark', null) order by b.bucket)
    into v_points
    from b left join s on s.gkey = b.bucket::text;
  else
    with b as (
      select g::date as bucket from generate_series(date_trunc(p_granularity, v_from::timestamp), v_to::timestamp, v_step) g
    ), cur as (
      select t.gkey, analytics.merge_group(jsonb_agg(jsonb_build_object('s', t.sig, 'c', t.c)), false) as c
      from analytics.counters(v_spec, p_granularity) t group by t.gkey
    ), bench as (
      select t.gkey, analytics.merge_group(jsonb_agg(jsonb_build_object('s', t.sig, 'c', t.c)), false) as c
      from analytics.counters(analytics.company_spec(v_spec), p_granularity) t where v_bench group by t.gkey
    )
    select jsonb_agg(jsonb_build_object(
      'bucket', b.bucket, 'from', greatest(b.bucket, v_from), 'to', least((b.bucket + v_step)::date - 1, v_to),
      'value', case when p_metric = 'responses' then coalesce((cur.c ->> 'n')::numeric, 0)
                    else (analytics.metric_values(cur.c) ->> p_metric)::numeric end,
      'n', coalesce((cur.c ->> 'n')::int, 0),
      'low_sample', analytics.low_sample((cur.c ->> 'n')::int, v_min),
      'mixed_scales', coalesce((cur.c ->> 'mixed_scales')::boolean, false),
      'benchmark', case when bench.c is null then null
                        when p_metric = 'responses' then (bench.c ->> 'n')::numeric
                        else (analytics.metric_values(bench.c) ->> p_metric)::numeric end) order by b.bucket)
    into v_points
    from b left join cur on cur.gkey = b.bucket::text left join bench on bench.gkey = b.bucket::text;
  end if;

  return jsonb_build_object(
    'metric', p_metric, 'granularity', p_granularity, 'period', analytics.period_json(v_spec),
    'minimum_sample', v_min, 'points', coalesce(v_points, '[]'::jsonb),
    'annotations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', (v.published_at at time zone 'Africa/Accra')::date, 'version_id', v.id, 'version_no', v.version_no,
        'scale_changed', v.prev_sig is not null and v.prev_sig <> v.scale_signature) order by v.version_no), '[]'::jsonb)
      from (select sv.*, lag(sv.scale_signature) over (order by sv.version_no) as prev_sig
            from public.survey_versions sv where sv.published_at is not null) v
      where (v.published_at at time zone 'Africa/Accra')::date between v_from and v_to));
end;
$$;

-- S-A2 compare mode: 1–6 branches side by side, each with Δ vs company (benchmark permission).
-- Branches outside the caller's scope need analytics.branch_ranking.view (aggregates only, D-24).
create or replace function public.analytics_compare(p_branch_ids uuid[], p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
  v_ids uuid[] := array(select distinct u from unnest(coalesce(p_branch_ids, '{}'::uuid[])) u);
  v_rows jsonb;
  v_company jsonb;
  v_own uuid[];
begin
  perform analytics.require('analytics.view');
  if cardinality(v_ids) not between 1 and 6 then
    raise exception 'Choose between one and six branches to compare.' using errcode = '22023';
  end if;
  v_spec := analytics.parse_filters(p_filters);
  if not (v_spec ->> 'scope_all')::boolean then
    v_own := analytics.j_uuids(v_spec -> 'scope_ids');
  end if;
  if v_own is not null and not (v_ids <@ v_own) and not analytics.can('analytics.branch_ranking.view') then
    raise exception 'You can only compare your own branches.' using errcode = '42501';
  end if;
  v_spec := (v_spec - 'branch_statuses' - 'region_ids')
            || jsonb_build_object('branch_ids', to_jsonb(v_ids), 'scope_all', true);
  v_rows := analytics.breakdown_rows(v_spec, 'branch');
  if analytics.can('analytics.benchmark.view') then
    v_company := analytics.metric_values(analytics.totals(analytics.company_spec(v_spec), true));
  end if;
  -- Outside the caller's scope only aggregates are returned (no factor detail).
  select coalesce(jsonb_agg(
           (case when v_own is null or b.id = any (v_own)
                 then coalesce(r.row, '{}'::jsonb)
                 else coalesce(r.row, '{}'::jsonb) - 'main_factor' - 'main_factor_label' - 'factor_counts' - 'target' end)
           || jsonb_build_object('key', b.id, 'code', b.code, 'label', b.name, 'region_label', rg.name,
                'n', coalesce((r.row ->> 'n')::int, 0), 'low_sample', coalesce((r.row ->> 'low_sample')::boolean, false),
                'is_own', v_own is null or b.id = any (v_own),
                'delta_vs_company', case when v_company is null then null else jsonb_build_object(
                  'csat_pct', round((r.row ->> 'csat_pct')::numeric - (v_company ->> 'csat_pct')::numeric, 6),
                  'csat_avg', round((r.row ->> 'csat_avg')::numeric - (v_company ->> 'csat_avg')::numeric, 6),
                  'nps', round((r.row ->> 'nps')::numeric - (v_company ->> 'nps')::numeric, 6),
                  'ces_avg', round((r.row ->> 'ces_avg')::numeric - (v_company ->> 'ces_avg')::numeric, 6),
                  'negative_rate', round((r.row ->> 'negative_rate')::numeric - (v_company ->> 'negative_rate')::numeric, 6)) end)
           order by array_position(v_ids, b.id)), '[]'::jsonb)
    into v_rows
  from public.branches b
  join public.regions rg on rg.id = b.region_id
  left join lateral (select e as row from jsonb_array_elements(v_rows) e where e ->> 'key' = b.id::text) r on true
  where b.id = any (v_ids);
  return jsonb_build_object('period', analytics.period_json(v_spec), 'minimum_sample', analytics.min_sample(),
    'rows', v_rows, 'company', v_company);
end;
$$;

-- Named ranking of every branch, aggregates only (D-24, D-34). Low-sample branches are listed with
-- rank null (excluded from the ranking, Rule 8). p_metric: csat_pct | csat_avg | nps | ces_avg |
-- negative_rate (lower is better).
create or replace function analytics.branch_ranking_rows(p_spec jsonb, p_metric text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_min int := analytics.min_sample();
  v_spec jsonb := (p_spec - 'branch_ids' - 'branch_statuses') || '{"scope_all": true}'::jsonb;
  v_own uuid[] := case when (p_spec ->> 'scope_all')::boolean then null else analytics.j_uuids(p_spec -> 'scope_ids') end;
  v_out jsonb;
begin
  if not analytics.can('analytics.branch_ranking.view') then
    raise exception 'You don''t have permission to view the branch ranking.' using errcode = '42501';
  end if;
  if p_metric not in ('csat_pct', 'csat_avg', 'nps', 'ces_avg', 'negative_rate') then
    raise exception 'That metric can''t be ranked.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', x.e ->> 'key', 'code', x.e ->> 'code', 'label', x.e ->> 'label',
      'region_label', x.e -> 'info' ->> 'region_label', 'n', (x.e ->> 'n')::int,
      'csat_pct', x.e -> 'csat_pct', 'csat_avg', x.e -> 'csat_avg', 'nps', x.e -> 'nps', 'ces_avg', x.e -> 'ces_avg',
      'negative_rate', x.e -> 'negative_rate', 'low_sample', (x.e ->> 'low_sample')::boolean,
      'rank', x.rnk, 'is_own', v_own is null or (x.e ->> 'key')::uuid = any (v_own))
      order by x.rnk nulls last, (x.e ->> 'n')::int desc), '[]'::jsonb)
    into v_out
  from (
    select e, case when (e ->> 'n')::int >= v_min and e ->> p_metric is not null then
             rank() over (partition by (e ->> 'n')::int >= v_min and e ->> p_metric is not null
                          order by case when p_metric = 'negative_rate' then -(e ->> p_metric)::numeric
                                        else (e ->> p_metric)::numeric end desc) end as rnk
    from jsonb_array_elements(analytics.breakdown_rows(v_spec, 'branch')) e
  ) x;
  return v_out;
end;
$$;

create or replace function public.analytics_branch_ranking(p_filters jsonb, p_metric text default 'csat_pct')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
begin
  perform analytics.require('analytics.view');
  perform analytics.require('analytics.branch_ranking.view');
  v_spec := analytics.parse_filters(p_filters);
  return jsonb_build_object('period', analytics.period_json(v_spec), 'metric', coalesce(p_metric, 'csat_pct'),
    'minimum_sample', analytics.min_sample(),
    'rows', analytics.branch_ranking_rows(v_spec, coalesce(p_metric, 'csat_pct')));
end;
$$;

-- Last 30 days, verified responses, CSAT % ranking; empty for users without the ranking permission.
create or replace view analytics.v_branch_ranking as
select (e ->> 'key')::uuid as branch_id, e ->> 'code' as branch_code, e ->> 'label' as branch_name,
       e ->> 'region_label' as region_name, (e ->> 'n')::int as n, (e ->> 'csat_pct')::numeric as csat_pct,
       (e ->> 'csat_avg')::numeric as csat_avg, (e ->> 'nps')::numeric as nps, (e ->> 'ces_avg')::numeric as ces_avg,
       (e ->> 'negative_rate')::numeric as negative_rate, (e ->> 'low_sample')::boolean as low_sample,
       (e ->> 'rank')::int as rank, (e ->> 'is_own')::boolean as is_own
from jsonb_array_elements(
  case when (select app.has_perm('analytics.branch_ranking.view'))
       then analytics.branch_ranking_rows(analytics.parse_filters('{}'::jsonb), 'csat_pct')
       else '[]'::jsonb end) e;
comment on view analytics.v_branch_ranking is
  'Named branch ranking (aggregates only, D-24/D-34) for the last 30 days. No record ids or comments.';

-- Distribution of one answer: csat | ces | nps | nps_class | satisfaction | factor.
create or replace function public.analytics_distribution(p_metric text, p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
  v_c jsonb;
  v_n numeric;
  v_buckets jsonb;
  v_anchors jsonb;
begin
  perform analytics.require('analytics.view');
  if p_metric not in ('csat', 'ces', 'nps', 'nps_class', 'satisfaction', 'factor') then
    raise exception 'That distribution isn''t available.' using errcode = '22023';
  end if;
  v_spec := analytics.parse_filters(p_filters);
  v_c := analytics.totals(v_spec, true);
  v_n := (v_c ->> 'n')::numeric;
  if p_metric in ('csat', 'ces') then
    select q -> 'anchors' into v_anchors
    from public.survey_versions sv, jsonb_array_elements(sv.definition -> 'pages') p, jsonb_array_elements(p -> 'questions') q
    where q ->> 'id' = p_metric
      and sv.id = coalesce((select (v_spec -> 'survey_version_ids' ->> 0)::uuid),
                           (select id from public.survey_versions where status = 'published'))
    limit 1;
    select jsonb_agg(jsonb_build_object('key', i::text, 'label', i || coalesce(' – ' || (v_anchors ->> (i - 1)), ''),
             'count', (v_c -> p_metric ->> (i - 1))::int,
             'share', analytics.rate((v_c -> p_metric ->> (i - 1))::numeric, v_n)) order by i)
      into v_buckets from generate_series(1, 5) i;
  elsif p_metric = 'nps' then
    select jsonb_agg(jsonb_build_object('key', i::text, 'label', i::text, 'count', (v_c -> 'nps' ->> i)::int,
             'share', analytics.rate((v_c -> 'nps' ->> i)::numeric, v_n),
             'class', case when i >= 9 then 'promoter' when i >= 7 then 'passive' else 'detractor' end) order by i)
      into v_buckets from generate_series(0, 10) i;
  elsif p_metric = 'nps_class' then
    select jsonb_agg(jsonb_build_object('key', k, 'label', l, 'count', cnt, 'share', analytics.rate(cnt, v_n)) order by o)
      into v_buckets
    from (select 'detractor' as k, 'Detractors (0–6)' as l, 1 as o,
                 (select sum((v_c -> 'nps' ->> i)::int) from generate_series(0, 6) i) as cnt
          union all select 'passive', 'Passives (7–8)', 2, (v_c -> 'nps' ->> 7)::int + (v_c -> 'nps' ->> 8)::int
          union all select 'promoter', 'Promoters (9–10)', 3, (v_c -> 'nps' ->> 9)::int + (v_c -> 'nps' ->> 10)::int) t;
  elsif p_metric = 'satisfaction' then
    select jsonb_agg(jsonb_build_object('key', k, 'label', l, 'count', cnt, 'share', analytics.rate(cnt, v_n)) order by o)
      into v_buckets
    from (select 'negative' as k, 'Negative (1–2)' as l, 1 as o,
                 (v_c -> 'csat' ->> 0)::int + (v_c -> 'csat' ->> 1)::int as cnt
          union all select 'neutral', 'Neutral (3)', 2, (v_c -> 'csat' ->> 2)::int
          union all select 'positive', 'Positive (4–5)', 3, (v_c -> 'csat' ->> 3)::int + (v_c -> 'csat' ->> 4)::int) t;
  else
    select jsonb_agg(b order by o, lbl) into v_buckets
    from (
      select jsonb_build_object('key', i.code, 'id', i.id, 'label', i.label, 'is_none', i.is_none,
               'count', coalesce((v_c -> 'factors' ->> i.id::text)::int, 0),
               'share', analytics.rate(coalesce((v_c -> 'factors' ->> i.id::text)::numeric, 0), v_n)) as b,
             i.sort_order as o, i.label as lbl
      from public.improvement_factors i
      where i.is_active or v_c -> 'factors' ? i.id::text
      union all
      select jsonb_build_object('key', 'not_answered', 'id', null, 'label', 'Not answered', 'is_none', false,
               'count', v_n - coalesce((select sum(value::numeric) from jsonb_each_text(v_c -> 'factors')), 0),
               'share', analytics.rate(v_n - coalesce((select sum(value::numeric) from jsonb_each_text(v_c -> 'factors')), 0), v_n)),
             2147483647, 'zz'
    ) t;
  end if;
  return jsonb_build_object('metric', p_metric, 'period', analytics.period_json(v_spec), 'n', v_n::int,
    'minimum_sample', analytics.min_sample(), 'low_sample', analytics.low_sample(v_n, analytics.min_sample()),
    'buckets', coalesce(v_buckets, '[]'::jsonb),
    'unverified_excluded', case when (v_spec ->> 'include_unverified')::boolean then 0 else (v_c ->> 'unverified')::int end);
end;
$$;

-- S-A7 sources and funnel ("where the survey was opened", never branch performance).
create or replace function public.analytics_funnel(p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
  v_min int := analytics.min_sample();
  v_by_source jsonb;
  v_by_qr jsonb;
  v_total jsonb;
  v_unv_total int;
begin
  perform analytics.require('analytics.view');
  v_spec := analytics.parse_filters(p_filters) || '{"include_unverified": false}'::jsonb;
  select coalesce(sum((c ->> 'unverified')::int), 0) into v_unv_total from analytics.counters(v_spec, 'total');
  v_total := analytics.session_totals(v_spec);
  with u as (select gkey, sum((c ->> 'unverified')::int) as unv from analytics.counters(v_spec, 'source') group by gkey)
  select coalesce(jsonb_agg(s.f || jsonb_build_object(
      'key', s.gkey, 'code', src.code, 'label', coalesce(src.label, 'Blocked before a survey started'),
      'completion_rate', analytics.rate((s.f ->> 'submitted')::numeric, (s.f ->> 'started')::numeric),
      'low_sample', analytics.low_sample((s.f ->> 'started')::int, v_min),
      'unverified', coalesce(u.unv, 0)) order by src.code nulls last), '[]'::jsonb)
    into v_by_source
  from analytics.session_counts(v_spec, 'source') s
  left join public.survey_sources src on src.id::text = s.gkey
  left join u on u.gkey = s.gkey;
  with u as (select gkey, sum((c ->> 'unverified')::int) as unv from analytics.counters(v_spec, 'qr_point') group by gkey)
  select coalesce(jsonb_agg(s.f || jsonb_build_object(
      'key', s.gkey, 'code', q.code, 'label', q.label, 'is_active', q.is_active,
      'completion_rate', analytics.rate((s.f ->> 'submitted')::numeric, (s.f ->> 'started')::numeric),
      'low_sample', analytics.low_sample((s.f ->> 'started')::int, v_min),
      'unverified', coalesce(u.unv, 0)) order by q.label), '[]'::jsonb)
    into v_by_qr
  from analytics.session_counts(v_spec, 'qr_point') s
  join public.qr_points q on q.id::text = s.gkey
  left join u on u.gkey = s.gkey;
  return jsonb_build_object(
    'period', analytics.period_json(v_spec), 'minimum_sample', v_min,
    'note', 'Completion rate = submitted ÷ started surveys (surveys that became interactive). There are no invitations, so no response rate is calculated.',
    'totals', v_total || jsonb_build_object(
      'completion_rate', analytics.rate((v_total ->> 'submitted')::numeric, (v_total ->> 'started')::numeric),
      'low_sample', analytics.low_sample((v_total ->> 'started')::int, v_min), 'unverified', v_unv_total),
    'by_source', v_by_source, 'by_qr_point', v_by_qr);
end;
$$;

-- S-A9 completion and usability, from raw rows (exact percentiles, nearest-rank).
create or replace function public.analytics_completion_time(p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
  v_min int := analytics.min_sample();
  v_s record;
  v_hist jsonb;
begin
  perform analytics.require('analytics.view');
  v_spec := analytics.parse_filters(p_filters);
  select count(*) as n_all,
         count(*) filter (where r.completion_duration_ms is not null and not r.duration_from_opened) as n,
         percentile_disc(0.5) within group (order by r.completion_duration_ms)
           filter (where r.completion_duration_ms is not null and not r.duration_from_opened) as med,
         percentile_disc(0.9) within group (order by r.completion_duration_ms)
           filter (where r.completion_duration_ms is not null and not r.duration_from_opened) as p90,
         avg(r.completion_duration_ms) filter (where r.completion_duration_ms is not null and not r.duration_from_opened) as mean,
         count(*) filter (where r.completion_duration_ms <= 60000 and not r.duration_from_opened) as le60,
         count(*) filter (where r.navigated_back) as back,
         count(*) filter (where r.changed_previous_answer) as changed,
         count(*) filter (where r.completion_duration_ms is null or r.duration_from_opened) as excluded,
         jsonb_build_array(
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms <= 10000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 10000 and r.completion_duration_ms <= 20000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 20000 and r.completion_duration_ms <= 30000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 30000 and r.completion_duration_ms <= 40000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 40000 and r.completion_duration_ms <= 50000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 50000 and r.completion_duration_ms <= 60000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 60000 and r.completion_duration_ms <= 90000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 90000 and r.completion_duration_ms <= 120000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 120000 and r.completion_duration_ms <= 180000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 180000 and r.completion_duration_ms <= 300000),
           count(*) filter (where not r.duration_from_opened and r.completion_duration_ms > 300000)) as h
    into v_s
  from analytics.filtered_spec(v_spec) r;
  select jsonb_agg(jsonb_build_object('from_s', e.lo, 'to_s', e.hi, 'count', (v_s.h ->> (e.i - 1))::int) order by e.i)
    into v_hist
  from (values (1, 0, 10), (2, 10, 20), (3, 20, 30), (4, 30, 40), (5, 40, 50), (6, 50, 60), (7, 60, 90),
               (8, 90, 120), (9, 120, 180), (10, 180, 300), (11, 300, null)) e(i, lo, hi);
  return jsonb_build_object(
    'period', analytics.period_json(v_spec), 'minimum_sample', v_min,
    'n', v_s.n, 'n_all', v_s.n_all, 'excluded_no_interactive', v_s.excluded,
    'low_sample', analytics.low_sample(v_s.n, v_min),
    'median_s', round(v_s.med / 1000.0, 1), 'p90_s', round(v_s.p90 / 1000.0, 1), 'mean_s', round(v_s.mean / 1000.0, 1),
    'pct_le_60', analytics.rate(v_s.le60, v_s.n),
    'back_navigation_rate', analytics.rate(v_s.back, v_s.n_all),
    'answer_change_rate', analytics.rate(v_s.changed, v_s.n_all),
    'targets', jsonb_build_object('pct_le_60', 90, 'median_s', 40),
    'histogram', v_hist);
end;
$$;

-- ---------------------------------------------------------------------------
-- Records explorer (M10)
-- ---------------------------------------------------------------------------
create index responses_submitted_id on survey.responses (submitted_at desc, id desc);
create index responses_comment_trgm on survey.responses using gin (comment extensions.gin_trgm_ops)
  where comment is not null;

create or replace function analytics.branch_status_label(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status when 'other' then 'Other branch' when 'not_applicable' then 'Not applicable'
                       when 'not_provided' then 'Not provided' end
$$;

-- Keyset-paginated list, newest first. p_cursor is the opaque next_cursor of the previous page.
create or replace function public.records_list(p_filters jsonb, p_search text default null, p_cursor text default null,
  p_limit int default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec jsonb;
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_comment boolean := analytics.can('responses.comment.view');
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern text;
  v_cur_ts timestamptz;
  v_cur_id uuid;
  -- public.cases arrives with MS-10; until then the case column is null and case_statuses is ignored.
  v_cases text := to_regclass('public.cases')::text;
  v_has_cases boolean := v_cases is not null;
  v_case_sql text := 'null::jsonb';
  v_case_filter text := 'true';
  v_rows jsonb;
  v_count int;
begin
  perform analytics.require('responses.view');
  v_spec := analytics.parse_filters(p_filters);
  if p_cursor is not null and p_cursor <> '' then
    begin
      v_cur_ts := split_part(convert_from(decode(p_cursor, 'base64'), 'UTF8'), '|', 1)::timestamptz;
      v_cur_id := split_part(convert_from(decode(p_cursor, 'base64'), 'UTF8'), '|', 2)::uuid;
    exception when others then
      raise exception 'That page link is out of date. Go back to the first page.' using errcode = '22023';
    end;
  end if;
  if v_search is not null then
    if length(v_search) > 100 then
      raise exception 'Search for 100 characters or fewer.' using errcode = '22023';
    end if;
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  if v_has_cases then
    v_case_sql := format('(select jsonb_build_object(''id'', c.id, ''reference'', c.reference, ''status'', c.status)
                    from %s c where c.response_id = r.id order by c.created_at desc limit 1)', v_cases);
    if v_spec ? 'case_statuses' then
      v_case_filter := format('((''none'' = any ($7) and not exists (select 1 from %1$s c where c.response_id = r.id))
                         or exists (select 1 from %1$s c where c.response_id = r.id and c.status = any ($7)))', v_cases);
    end if;
  end if;

  execute format($q$
    with page as (
      select r.*, %s as case_info
      from analytics.filtered_spec($1) r
      where ($3::timestamptz is null or (r.submitted_at, r.id) < ($3, $4))
        and ($2::text is null or r.reference ilike $2
             or ($5 and exists (select 1 from survey.responses raw where raw.id = r.id and raw.comment ilike $2)))
        and %s
      order by r.submitted_at desc, r.id desc
      limit $6 + 1
    )
    select count(*)::int, coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'reference', p.reference, 'submitted_at', p.submitted_at,
      'source', jsonb_build_object('code', p.source_code, 'label', src.label),
      'qr_point', case when q.id is not null then jsonb_build_object('id', q.id, 'code', q.code, 'label', q.label) end,
      'channel', jsonb_build_object('id', ch.id, 'code', ch.code, 'label', ch.label),
      'branch_status', p.branch_status,
      'branch', case when b.id is not null then jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name) end,
      'branch_label', coalesce(b.name, analytics.branch_status_label(p.branch_status)),
      'is_corrected', p.is_corrected,
      'product', jsonb_build_object('id', pr.id, 'code', pr.code, 'label', pr.label),
      'csat', p.csat_score, 'ces', p.ces_score, 'nps', p.nps_score, 'nps_class', p.nps_class,
      'factor', case when f.id is not null then jsonb_build_object('id', f.id, 'code', f.code, 'label', f.label) end,
      'has_comment', p.has_comment, 'contact_consent', p.contact_consent, 'verification', p.verification,
      'survey_version_no', p.version_no, 'case', p.case_info) order by p.submitted_at desc, p.id desc), '[]'::jsonb)
    from (select * from page order by submitted_at desc, id desc limit $6) p
    join public.survey_sources src on src.id = p.source_id
    left join public.qr_points q on q.id = p.qr_point_id
    join public.service_channels ch on ch.id = p.service_channel_id
    left join public.branches b on b.id = p.issuing_branch_id
    join public.insurance_products pr on pr.id = p.insurance_product_id
    left join public.improvement_factors f on f.id = p.improvement_factor_id
  $q$, v_case_sql, v_case_filter)
  into v_count, v_rows
  using v_spec, v_pattern, v_cur_ts, v_cur_id, v_comment, v_limit, analytics.j_texts(v_spec -> 'case_statuses');

  -- One extra row was read to know whether another page exists.
  execute format($q$
    select count(*)::int from (
      select 1 from analytics.filtered_spec($1) r
      where ($3::timestamptz is null or (r.submitted_at, r.id) < ($3, $4))
        and ($2::text is null or r.reference ilike $2
             or ($5 and exists (select 1 from survey.responses raw where raw.id = r.id and raw.comment ilike $2)))
        and %s
      limit $6 + 1) t
  $q$, v_case_filter)
  into v_count
  using v_spec, v_pattern, v_cur_ts, v_cur_id, v_comment, v_limit, analytics.j_texts(v_spec -> 'case_statuses');

  return jsonb_build_object(
    'rows', v_rows,
    'limit', v_limit,
    'period', analytics.period_json(v_spec),
    'comment_search', v_comment,
    'case_status_available', v_has_cases,
    'next_cursor', case when v_count > v_limit then
      translate(encode(convert_to(((v_rows -> -1 ->> 'submitted_at')::timestamptz)::text || '|' || (v_rows -> -1 ->> 'id'),
                                  'UTF8'), 'base64'), E'\n', '') end);
end;
$$;

-- Record drawer: answers with the wording of the response's own survey version (REQ §14.4), other
-- texts and the comment (responses.comment.view), timestamps, source/QR point, attribution with any
-- correction, and the contact indicator (masked number only, never the clear number).
create or replace function public.record_detail(p_response_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v analytics.v_responses_effective;
  v_raw survey.responses;
  v_ver public.survey_versions;
  v_text boolean := analytics.can('responses.comment.view');
  v_answers jsonb := '[]'::jsonb;
  v_q jsonb;
  v_page int;
  v_val jsonb;
  v_disp text;
  v_code text;
  v_contact record;
  v_scope_all boolean := app.org_scope() or analytics.is_service();
begin
  perform analytics.require('responses.view');
  select * into v from analytics.v_responses_effective where id = p_response_id;
  if v.id is null or not (v_scope_all or v.issuing_branch_id = any (app.branch_ids())) then
    raise exception 'We can''t find that feedback record, or you don''t have access to it.' using errcode = 'P0002';
  end if;
  select * into v_raw from survey.responses where id = p_response_id;
  select * into v_ver from public.survey_versions where id = v_raw.survey_version_id;

  for v_page, v_q in
    select p.ord::int, q from jsonb_array_elements(v_ver.definition -> 'pages') with ordinality p(pg, ord),
                             jsonb_array_elements(p.pg -> 'questions') q
  loop
    v_val := null;
    v_disp := null;
    case v_q ->> 'id'
      when 'channel' then
        select code into v_code from public.service_channels where id = v_raw.service_channel_id;
        v_val := to_jsonb(v_code);
        v_disp := coalesce((select o ->> 'label' from jsonb_array_elements(v_ver.catalogue_snapshot -> 'service_channels') o
                            where o ->> 'code' = v_code), (select label from public.service_channels where id = v_raw.service_channel_id));
      when 'branch' then
        if v_raw.branch_status = 'selected' then
          select code, name into v_code, v_disp from public.branches where id = v_raw.issuing_branch_id;
          v_val := to_jsonb(v_code);
        elsif v_raw.branch_status = 'other' then
          v_val := '"OTHER"'::jsonb;
          v_disp := 'Other branch';
        else
          v_disp := analytics.branch_status_label(v_raw.branch_status);
        end if;
      when 'product' then
        select code into v_code from public.insurance_products where id = v_raw.insurance_product_id;
        v_val := to_jsonb(v_code);
        v_disp := coalesce((select o ->> 'label' from jsonb_array_elements(v_ver.catalogue_snapshot -> 'insurance_products') o
                            where o ->> 'code' = v_code), (select label from public.insurance_products where id = v_raw.insurance_product_id));
      when 'factor' then
        if v_raw.improvement_factor_id is not null then
          select code into v_code from public.improvement_factors where id = v_raw.improvement_factor_id;
          v_val := to_jsonb(v_code);
          v_disp := coalesce((select o ->> 'label' from jsonb_array_elements(v_ver.catalogue_snapshot -> 'improvement_factors') o
                              where o ->> 'code' = v_code), (select label from public.improvement_factors where id = v_raw.improvement_factor_id));
        else
          v_disp := 'Not answered';
        end if;
      when 'csat' then
        v_val := to_jsonb(v_raw.csat_score);
        v_disp := v_raw.csat_score || coalesce(' – ' || (v_q -> 'anchors' ->> (v_raw.csat_score - 1)), '');
      when 'ces' then
        v_val := to_jsonb(v_raw.ces_score);
        v_disp := v_raw.ces_score || coalesce(' – ' || (v_q -> 'anchors' ->> (v_raw.ces_score - 1)), '');
      when 'nps' then
        v_val := to_jsonb(v_raw.nps_score);
        v_disp := v_raw.nps_score || ' – ' || initcap(v_raw.nps_class);
      when 'channel_other' then
        continue when v_raw.service_channel_other_text is null;
        v_val := case when v_text then to_jsonb(v_raw.service_channel_other_text) end;
        v_disp := case when v_text then v_raw.service_channel_other_text else 'Hidden (needs permission to view comments)' end;
      when 'branch_other' then
        continue when v_raw.issuing_branch_other_text is null;
        v_val := case when v_text then to_jsonb(v_raw.issuing_branch_other_text) end;
        v_disp := case when v_text then v_raw.issuing_branch_other_text else 'Hidden (needs permission to view comments)' end;
      when 'product_other' then
        continue when v_raw.insurance_product_other_text is null;
        v_val := case when v_text then to_jsonb(v_raw.insurance_product_other_text) end;
        v_disp := case when v_text then v_raw.insurance_product_other_text else 'Hidden (needs permission to view comments)' end;
      when 'factor_other' then
        continue when v_raw.improvement_other_text is null;
        v_val := case when v_text then to_jsonb(v_raw.improvement_other_text) end;
        v_disp := case when v_text then v_raw.improvement_other_text else 'Hidden (needs permission to view comments)' end;
      when 'contact_consent' then
        v_val := to_jsonb(v_raw.contact_consent);
        v_disp := case when v_raw.contact_consent then 'Yes' else 'No' end;
      else
        -- comment is returned separately; phone and first name are contact data and never listed.
        continue;
    end case;
    v_answers := v_answers || jsonb_build_array(jsonb_build_object(
      'question_id', v_q ->> 'id', 'page', v_page, 'label', v_q ->> 'label', 'type', v_q ->> 'type',
      'value', v_val, 'display', v_disp));
  end loop;

  if v_raw.contact_consent then
    select c.phone_e164_enc, c.dek_enc, c.erased_at into v_contact from pii.contact_requests c where c.response_id = v_raw.id;
  end if;

  return jsonb_build_object(
    'id', v.id, 'reference', v.reference,
    'submitted_at', v.submitted_at, 'opened_at', v.opened_at, 'interactive_at', v.interactive_at,
    'local_date', v.local_date,
    'completion_duration_ms', v.completion_duration_ms, 'duration_from_opened', v.duration_from_opened,
    'navigated_back', v.navigated_back, 'changed_previous_answer', v.changed_previous_answer,
    'verification', v.verification,
    'version', jsonb_build_object('id', v_ver.id, 'no', v_ver.version_no),
    'source', (select jsonb_build_object('code', code, 'label', label) from public.survey_sources where id = v.source_id),
    'qr_point', (select jsonb_build_object('id', id, 'code', code, 'label', label) from public.qr_points where id = v.qr_point_id),
    'attribution', jsonb_build_object(
      'branch_status', v.branch_status,
      'branch', (select jsonb_build_object('id', id, 'code', code, 'name', name) from public.branches where id = v.issuing_branch_id),
      'region', (select jsonb_build_object('id', id, 'name', name) from public.regions where id = v.region_id),
      'label', coalesce((select name from public.branches where id = v.issuing_branch_id), analytics.branch_status_label(v.branch_status)),
      'is_corrected', v.is_corrected,
      'original', jsonb_build_object(
        'branch_status', v.original_branch_status,
        'branch', (select jsonb_build_object('id', id, 'code', code, 'name', name) from public.branches where id = v.original_issuing_branch_id),
        'region', (select jsonb_build_object('id', id, 'name', name) from public.regions where id = v.original_region_id),
        'label', coalesce((select name from public.branches where id = v.original_issuing_branch_id),
                          analytics.branch_status_label(v.original_branch_status)))),
    'answers', v_answers,
    'comment_visible', v_text,
    'comment', case when v_text then v_raw.comment end,
    'has_comment', v.has_comment,
    'text_redacted_at', v.text_redacted_at,
    'has_contact_consent', v_raw.contact_consent,
    'contact', case when v_raw.contact_consent then jsonb_build_object(
      'masked', case when v_contact.phone_e164_enc is not null
                     then pii.mask_phone(pii.decrypt_field(v_contact.dek_enc, v_contact.phone_e164_enc)) end,
      'erased', v_contact.erased_at is not null) end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all functions in schema analytics from public, anon, authenticated;
grant execute on function analytics.filtered_responses(jsonb), analytics.target_for(text, text, uuid, date)
  to authenticated, service_role;
-- Called by analytics.v_branch_ranking with the reader's privileges; the ranking function checks
-- analytics.branch_ranking.view itself and returns aggregates only.
grant execute on function analytics.parse_filters(jsonb), analytics.branch_ranking_rows(jsonb, text) to authenticated;
revoke all on analytics.v_branch_ranking from public, anon, authenticated;
grant select on analytics.v_branch_ranking to authenticated;

revoke all on function public.analytics_summary(jsonb), public.analytics_breakdown(text, jsonb),
  public.analytics_trend(text, text, jsonb), public.analytics_compare(uuid[], jsonb),
  public.analytics_branch_ranking(jsonb, text), public.analytics_distribution(text, jsonb),
  public.analytics_funnel(jsonb), public.analytics_completion_time(jsonb),
  public.records_list(jsonb, text, text, int), public.record_detail(uuid) from public, anon;
grant execute on function public.analytics_summary(jsonb), public.analytics_breakdown(text, jsonb),
  public.analytics_trend(text, text, jsonb), public.analytics_compare(uuid[], jsonb),
  public.analytics_branch_ranking(jsonb, text), public.analytics_distribution(text, jsonb),
  public.analytics_funnel(jsonb), public.analytics_completion_time(jsonb),
  public.records_list(jsonb, text, text, int), public.record_detail(uuid) to authenticated, service_role;
