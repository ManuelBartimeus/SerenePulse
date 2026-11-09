-- MS-07 analytics engine: metric maths, valid denominators, no-data, low sample, benchmark for the
-- same period, scale-signature guard, roll-up = raw, corrections, targets, funnel, completion time
-- (T-M08-001…009, T-M08-010, T-M08-020, T-M08-030, T-M08-040, T-M08-050, T-M08-100).
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c0e1', 'exec.analytics@example.test'),
  ('00000000-0000-0000-0000-00000000c0b1', 'bm.analytics@example.test'),
  ('00000000-0000-0000-0000-00000000c0d1', 'sysadmin.analytics@example.test');
update public.profiles set status = 'active', must_change_password = false
 where user_id in ('00000000-0000-0000-0000-00000000c0e1', '00000000-0000-0000-0000-00000000c0b1',
                   '00000000-0000-0000-0000-00000000c0d1');
insert into public.user_role_grants (user_id, role_id, scope_type, scope_id, status, approved_at)
select '00000000-0000-0000-0000-00000000c0e1'::uuid, id, 'organisation', null::uuid, 'active', now()
  from public.roles where key = 'executive'
union all
select '00000000-0000-0000-0000-00000000c0b1'::uuid, id, 'branch', (select id from public.branches where code = 'ACC-EAST'),
       'active', now()
  from public.roles where key = 'branch_manager'
union all
select '00000000-0000-0000-0000-00000000c0d1'::uuid, id, 'organisation', null::uuid, 'active', now()
  from public.roles where key = 'system_admin';

create or replace function pg_temp.as_user(p_user uuid)
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', (public.custom_access_token_hook(jsonb_build_object('user_id', p_user,
    'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated'))) -> 'claims')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create or replace function pg_temp.as_admin()
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.as_admin() to authenticated;

-- One submitted response (session + response) on a given Accra day.
create or replace function pg_temp.resp(p_day date, p_channel text, p_branch text, p_product text, p_csat int, p_ces int,
  p_nps int, p_factor text default null, p_verification text default 'verified', p_ms int default 40000,
  p_status text default null, p_comment text default null, p_version uuid default null, p_src text default 'sms')
returns uuid language plpgsql as $$
declare
  v_session uuid;
  v_id uuid;
  v_branch public.branches;
  v_ts timestamptz := (p_day::timestamp + interval '10 hours') at time zone 'Africa/Accra';
  v_ver uuid := coalesce(p_version, (select id from public.survey_versions where status = 'published'));
begin
  select * into v_branch from public.branches where code = p_branch;
  insert into survey.sessions (session_secret_hash, device_id_hash, source_id, survey_version_id, opened_at,
                               interactive_at, last_activity_at, status, max_page_reached)
  values (extensions.gen_random_bytes(32), extensions.gen_random_bytes(32),
          (select id from public.survey_sources where code = p_src), v_ver, v_ts, v_ts, v_ts, 'submitted', 5)
  returning id into v_session;
  insert into survey.responses (reference, session_id, survey_version_id, source_id, service_channel_id, branch_status,
    issuing_branch_id, region_id_at_submission, insurance_product_id, csat_score, ces_score, nps_score,
    improvement_factor_id, comment, verification, opened_at, interactive_at, submitted_at, completion_duration_ms)
  values ('FB-2099-' || lpad((nextval('t_seq'))::text, 6, '0'), v_session, v_ver,
    (select id from public.survey_sources where code = p_src),
    (select id from public.service_channels where code = p_channel),
    coalesce(p_status, case when v_branch.id is not null then 'selected' else 'not_applicable' end),
    v_branch.id, v_branch.region_id, (select id from public.insurance_products where code = p_product),
    p_csat, p_ces, p_nps, (select id from public.improvement_factors where code = p_factor), p_comment, p_verification,
    v_ts, v_ts, v_ts + make_interval(secs => p_ms / 1000.0), p_ms)
  returning id into v_id;
  return v_id;
end;
$$;
create temporary sequence t_seq;

-- January 2099: ACC-EAST walk-in 4 responses, KASOA-equivalent second branch 2, mobile app 3 (no branch),
-- one unverified walk-in at ACC-EAST.
create temporary table t_b as select code from public.branches where code <> 'ACC-EAST' and not is_head_office order by sort_order limit 1;
select pg_temp.resp('2099-01-05', 'WALK_IN', 'ACC-EAST', p.code, 5, 5, 10, 'SPEED', p_comment => 'Very good service')
  from (select code from public.insurance_products order by sort_order limit 1) p;
select pg_temp.resp('2099-01-06', 'WALK_IN', 'ACC-EAST', p.code, 4, 4, 9, 'STAFF')
  from (select code from public.insurance_products order by sort_order limit 1) p;
select pg_temp.resp('2099-01-07', 'WALK_IN', 'ACC-EAST', p.code, 2, 2, 5, 'SPEED', p_ms => 70000)
  from (select code from public.insurance_products order by sort_order limit 1) p;
select pg_temp.resp('2099-01-08', 'WALK_IN', 'ACC-EAST', p.code, 1, 3, 0, 'NONE')
  from (select code from public.insurance_products order by sort_order limit 1) p;
select pg_temp.resp('2099-01-09', 'WALK_IN', 'ACC-EAST', p.code, 1, 1, 0, null, 'unverified_no_js')
  from (select code from public.insurance_products order by sort_order limit 1) p;
select pg_temp.resp('2099-01-10', 'WALK_IN', (select code from t_b), p.code, 3, 4, 8, 'STAFF', p_comment => 'Other branch comment')
  from (select code from public.insurance_products order by sort_order limit 1) p;
select pg_temp.resp('2099-01-11', 'WALK_IN', (select code from t_b), p.code, 5, 5, 7)
  from (select code from public.insurance_products order by sort_order limit 1) p;
select pg_temp.resp('2099-01-12', 'MOBILE_APP', null, p.code, 4, 5, 10, p_src => 'qr')
  from (select code from public.insurance_products order by sort_order offset 1 limit 1) p;
select pg_temp.resp('2099-01-13', 'MOBILE_APP', null, p.code, 3, 2, 6, p_src => 'direct')
  from (select code from public.insurance_products order by sort_order offset 1 limit 1) p;
select pg_temp.resp('2099-01-14', 'MOBILE_APP', null, p.code, 5, 4, 9, 'SPEED')
  from (select code from public.insurance_products order by sort_order offset 1 limit 1) p;

create temporary table t_ids as
select (select id from public.branches where code = 'ACC-EAST') as east,
       (select id from public.branches b join t_b using (code)) as other,
       (select id from survey.responses where comment = 'Other branch comment') as other_resp;
grant select on t_ids, t_b to authenticated;

select ok(exists (select 1 from public.improvement_factors where code = 'NONE' and is_none),
  'fixture: the "none" factor exists');

-- ---------------------------------------------------------------------------
-- Roll-up maintained in the same transaction; equals raw rows
-- ---------------------------------------------------------------------------
select is((select sum(n)::int from analytics.responses_daily where local_date between '2099-01-01' and '2099-01-31'),
  10, 'every submission is in responses_daily in the same transaction');

create or replace function pg_temp.spec(p jsonb)
returns jsonb language sql as $$
  select analytics.parse_filters(p) || '{"scope_all": true}'::jsonb
$$;
select is((select sum(n)::int from analytics.responses_monthly where local_date = '2099-01-01'), 10,
  'responses_monthly is maintained with responses_daily');
-- The raw path is forced by a satisfaction filter that selects every band (a no-op on the rows).
create temporary table t_combos (f jsonb);
insert into t_combos values
  ('{"from":"2099-01-01","to":"2099-01-31"}'),
  ('{"from":"2099-01-01","to":"2099-01-31","include_unverified":true}'),
  ('{"from":"2099-01-05","to":"2099-01-09"}'),
  ('{"from":"2099-01-01","to":"2099-01-31","source_codes":["qr","direct"]}'),
  ('{"from":"2099-01-01","to":"2099-01-31","branch_statuses":["not_applicable"]}');
insert into t_combos select jsonb_build_object('from', '2099-01-01', 'to', '2099-01-31', 'branch_ids', jsonb_build_array(east)) from t_ids;
insert into t_combos select jsonb_build_object('from', '2099-01-01', 'to', '2099-01-31', 'region_ids',
  jsonb_build_array((select region_id from public.branches where id = east))) from t_ids;
insert into t_combos select jsonb_build_object('from', '2099-01-01', 'to', '2099-01-31', 'channel_ids',
  jsonb_build_array((select id from public.service_channels where code = 'WALK_IN')),
  'factor_ids', jsonb_build_array((select id from public.improvement_factors where code = 'SPEED')));
select is(
  (select count(*)::int from t_combos c
    where analytics.totals(pg_temp.spec(c.f)) - 'sig'
       <> analytics.totals(pg_temp.spec(c.f || '{"satisfaction":["negative","neutral","positive"]}')) - 'sig'),
  0, 'T-M08-103: roll-up counters equal brute-force raw counters for every filter combination');

-- ---------------------------------------------------------------------------
-- Metric maths (as an executive: organisation scope)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0e1');
create temporary table t_s as
select public.analytics_summary(jsonb_build_object('from', '2099-01-01', 'to', '2099-01-31', 'branch_ids',
  jsonb_build_array(east))) as s from t_ids;
select is((select (s ->> 'n')::int from t_s), 4, 'T-M08-001: n counts valid responses only');
select is((select (s -> 'metrics' -> 'csat_pct' ->> 'value')::numeric from t_s), 50.0, 'T-M08-001: CSAT % = 4–5 ÷ valid');
select is((select (s -> 'metrics' -> 'csat_avg' ->> 'value')::numeric from t_s), 3.0, 'T-M08-002: average CSAT');
select is((select (s -> 'metrics' -> 'ces_avg' ->> 'value')::numeric from t_s), 3.5, 'T-M08-003: average CES');
select is((select (s -> 'metrics' -> 'nps' ->> 'value')::numeric from t_s), 0.0, 'T-M08-004: NPS = %promoters − %detractors');
select is((select (s -> 'metrics' -> 'negative_rate' ->> 'value')::numeric from t_s), 50.0, 'T-M08-005: negative rate');
select is((select s -> 'main_factor' -> 'codes' from t_s), '["SPEED"]'::jsonb,
  'T-M08-006: main factor is the mode, excluding "Nothing, I am satisfied"');
select is((select (s -> 'main_factor' ->> 'n')::int from t_s), 3, 'T-M08-006: main factor n excludes none and blanks');
select is((select (s ->> 'unverified_excluded')::int from t_s), 1, 'A-135: unverified submissions are excluded and counted');
select is((select (s -> 'metrics' -> 'csat_pct' ->> 'low_sample')::boolean from t_s), true,
  'T-M08-010: n below minimum_sample is flagged low_sample');
select is((select s -> 'metrics' -> 'csat_pct' -> 'target' from t_s), 'null'::jsonb, 'no target configured → null ("No target")');

select is((public.analytics_summary('{"from":"2099-01-01","to":"2099-01-31","include_unverified":true}') ->> 'n')::int, 10,
  'include_unverified adds unverified submissions');

-- All promoters → +100, all detractors → −100 (T-M08-004)
select is((public.analytics_summary(jsonb_build_object('from', '2099-01-05', 'to', '2099-01-06', 'branch_ids',
  jsonb_build_array((select east from t_ids)))) -> 'metrics' -> 'nps' ->> 'value')::numeric, 100.0, 'all promoters → NPS +100');
select is((public.analytics_summary(jsonb_build_object('from', '2099-01-07', 'to', '2099-01-08', 'branch_ids',
  jsonb_build_array((select east from t_ids)))) -> 'metrics' -> 'nps' ->> 'value')::numeric, -100.0, 'all detractors → NPS −100');

-- No data is null, never 0 (Rule 7)
create temporary table t_none as select public.analytics_summary('{"from":"2099-03-01","to":"2099-03-31"}') as s;
select is((select s -> 'metrics' -> 'csat_pct' -> 'value' from t_none), 'null'::jsonb, 'T-M08-007: zero responses → value null ("No data")');
select is((select (s -> 'metrics' -> 'csat_pct' ->> 'n')::int from t_none), 0, 'no data carries n = 0');
select is((select (s -> 'metrics' -> 'csat_pct' ->> 'low_sample')::boolean from t_none), false, 'no data is not low sample');
select is((select s -> 'main_factor' -> 'share' from t_none), 'null'::jsonb, 'no data → main factor share null');

-- Previous equivalent period and delta
select is((public.analytics_summary('{"from":"2099-02-01","to":"2099-02-28"}') -> 'previous' -> 'period' ->> 'from'), '2099-01-04',
  'previous period has the same length, immediately before');
select is((public.analytics_summary('{"from":"2099-02-01","to":"2099-02-28"}') -> 'metrics' -> 'csat_pct' -> 'delta'), 'null'::jsonb,
  'delta is null when the current period has no data');

-- Benchmark = company value for the same period and non-branch filters (Rule 9)
select is((select (s -> 'metrics' -> 'csat_pct' ->> 'benchmark')::numeric from t_s),
  (public.analytics_summary('{"from":"2099-01-01","to":"2099-01-31"}') -> 'metrics' -> 'csat_pct' ->> 'value')::numeric,
  'T-M08-020: benchmark equals the company-wide value for the identical period');

-- Breakdowns: branch rows only from responses with an effective branch (D-12)
select is(jsonb_array_length(public.analytics_breakdown('branch', '{"from":"2099-01-01","to":"2099-01-31"}')), 2,
  'branch breakdown has only branches; mobile-app responses (no branch) are not attributed');
select is((select sum((e ->> 'n')::int)::int from jsonb_array_elements(public.analytics_breakdown('channel',
  '{"from":"2099-01-01","to":"2099-01-31"}')) e), 9, 'T-M08-101: channel breakdown covers every valid response');
select is((select (e ->> 'rank') from jsonb_array_elements(public.analytics_breakdown('branch',
  '{"from":"2099-01-01","to":"2099-01-31"}')) e limit 1), null, 'low-sample groups get no rank (Rule 8)');

-- Targets (REQ §13.1)
select pg_temp.as_admin();
insert into public.targets (metric, scope_type, scope_id, target_value, direction, effective_from)
select 'csat_pct', 'branch', east, 40, 'higher_is_better', '2099-01-01' from t_ids;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0e1');
select is(analytics.target_for('csat_pct', 'branch', (select east from t_ids), '2099-01-31'), 40::numeric,
  'target_for returns the latest effective target');
select is(public.analytics_summary(jsonb_build_object('from', '2099-01-01', 'to', '2099-01-31', 'branch_ids',
  jsonb_build_array((select east from t_ids)))) -> 'metrics' -> 'csat_pct' -> 'target' ->> 'status', 'met',
  'target status is met when the value reaches the target');

-- Validation messages are user-facing 22023
select throws_ok($$select public.analytics_summary('{"from":"2099-02-01","to":"2099-01-01"}')$$, '22023',
  'The start date must be on or before the end date.', 'from after to is refused with a clear message');
select throws_ok($$select public.analytics_summary('{"satisfaction":["angry"]}')$$, '22023', null,
  'unknown filter values are refused');

-- Trend with empty buckets as null and annotations
select is((select count(*)::int from jsonb_array_elements(public.analytics_trend('csat_pct', 'day',
  '{"from":"2099-01-01","to":"2099-01-31"}') -> 'points') p where p -> 'value' = 'null'::jsonb), 22,
  'trend returns every bucket; buckets without responses are null, not 0');

-- Completion time (nearest-rank median of 40 s, 40 s, 70 s, 40 s, ...)
select is((public.analytics_completion_time('{"from":"2099-01-01","to":"2099-01-31"}') ->> 'median_s')::numeric, 40.0,
  'completion-time median from interactive (Rule 18)');
select is((public.analytics_completion_time('{"from":"2099-01-01","to":"2099-01-31"}') ->> 'pct_le_60')::numeric,
  round(800::numeric / 9, 6), '% ≤ 60 s over valid responses');

-- ---------------------------------------------------------------------------
-- Branch scope (Rule 10, D-24, D-34)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0b1');
select is((public.analytics_summary('{"from":"2099-01-01","to":"2099-01-31"}') ->> 'n')::int, 4,
  'a branch manager''s figures cover their own branch only');
select is((select count(*)::int from jsonb_array_elements(public.records_list('{"from":"2099-01-01","to":"2099-01-31"}') -> 'rows')),
  4, 'branch manager sees only their own branch''s records');
select throws_ok(format('select public.record_detail(%L)',
  (select other_resp from t_ids)), 'P0002', null,
  'branch manager cannot open another branch''s record or comment');
-- Regression (2026-11-09): opening a response WITHOUT contact consent failed with
-- 'record "v_contact" is not assigned yet' (55000). Fixed in 202611130012_record_detail_contact_fix.
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0e1');
select lives_ok(format('select public.record_detail(%L)', (select other_resp from t_ids)),
  'a response without contact consent opens');
select is(public.record_detail((select other_resp from t_ids)) ->> 'contact', null,
  'no contact block when the customer did not consent');
select ok(jsonb_array_length(public.record_detail((select other_resp from t_ids)) -> 'answers') > 0,
  'the response''s answers are returned');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0b1');
select is((select count(*)::int from jsonb_array_elements(public.analytics_branch_ranking('{"from":"2099-01-01","to":"2099-01-31"}') -> 'rows')),
  2, 'branch manager sees the named ranking of all branches (aggregates)');
select ok((select bool_and(not (e ? 'main_factor') and not (e ? 'factor_counts'))
  from jsonb_array_elements(public.analytics_branch_ranking('{"from":"2099-01-01","to":"2099-01-31"}') -> 'rows') e),
  'ranking rows carry aggregates only, no factor or record detail');
select is((select count(*)::int from analytics.v_branch_ranking), 0, 'v_branch_ranking defaults to the last 30 days');
select is((public.analytics_summary(jsonb_build_object('from', '2099-01-01', 'to', '2099-01-31', 'branch_ids',
  jsonb_build_array((select other from t_ids)))) ->> 'n')::int, 0, 'filtering on another branch does not widen the scope');
select pg_temp.as_admin();

-- Permission
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0d1');
select throws_ok($$select public.analytics_summary('{}')$$, '42501', null, 'analytics need analytics.view');
select throws_ok($$select * from analytics.responses_daily$$, '42501', null, 'roll-ups are not readable through the Data API');
select pg_temp.as_admin();

-- ---------------------------------------------------------------------------
-- Attribution correction re-attributes the roll-up (FR-41)
-- ---------------------------------------------------------------------------
insert into survey.attribution_corrections (response_id, original_branch_id, corrected_branch_id, reason, proposed_by,
  approved_by, approved_at, status)
select r.id, r.issuing_branch_id, (select other from t_ids), 'Customer named the wrong branch',
       '00000000-0000-0000-0000-00000000c0e1', '00000000-0000-0000-0000-00000000c0b1', now(), 'approved'
from survey.responses r where r.comment = 'Very good service';
select is((select sum(n)::int from analytics.responses_daily d, t_ids
           where d.local_date between '2099-01-01' and '2099-01-31' and d.issuing_branch_id = t_ids.other), 3,
  'an approved correction moves the response in the roll-up at once');
select ok((select is_corrected from analytics.v_responses_effective where reference = (select reference from survey.responses where comment = 'Very good service')),
  'v_responses_effective marks the corrected response');

-- ---------------------------------------------------------------------------
-- Scale-signature guard (Rule 6, T-M08-040)
-- ---------------------------------------------------------------------------
insert into public.survey_versions (version_no, status, definition, catalogue_snapshot, scale_signature, published_at, retired_at)
select 99, 'retired', definition, catalogue_snapshot, scale_signature || '{"ces":"1-7"}'::jsonb, now(), now()
from public.survey_versions where status = 'published';
select pg_temp.resp('2099-01-20', 'WALK_IN', 'ACC-EAST', p.code, 5, 5, 10,
  p_version => (select id from public.survey_versions where version_no = 99))
  from (select code from public.insurance_products order by sort_order limit 1) p;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0e1');
select throws_ok($$select public.analytics_summary('{"from":"2099-01-01","to":"2099-01-31"}')$$, '22023', null,
  'T-M08-040: a period spanning different scale signatures is refused, never mixed');
select is(jsonb_array_length(public.analytics_breakdown('version', '{"from":"2099-01-01","to":"2099-01-31"}')), 2,
  'the version breakdown shows each scale separately');
select pg_temp.as_admin();

-- ---------------------------------------------------------------------------
-- Funnel from sessions (T-M08-030)
-- ---------------------------------------------------------------------------
insert into survey.sessions (session_secret_hash, device_id_hash, source_id, survey_version_id, opened_at, last_activity_at,
  status, abandoned_at_page)
select extensions.gen_random_bytes(32), extensions.gen_random_bytes(32), (select id from public.survey_sources where code = 'sms'),
       (select id from public.survey_versions where status = 'published'), now(), now(), 'expired', 1;
select ok(analytics.refresh_sessions_recent() >= 1, 'the minute job rebuilds today''s funnel counters');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0e1');
select is((select (e ->> 'abandoned_by_page')::jsonb ->> 0 from jsonb_array_elements(
  public.analytics_funnel(jsonb_build_object('from', (now() at time zone 'Africa/Accra')::date,
                                             'to', (now() at time zone 'Africa/Accra')::date)) -> 'by_source') e
  where e ->> 'code' = 'sms'), '1', 'abandonment is counted by page per source');
select pg_temp.as_admin();

select * from finish();
rollback;
