-- Survey v3 (EASE / PRICE improvement options retired, history kept) and the resume choice
-- (session payload opened_at, survey_abandon_session).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------------------------------------------------------------------------
-- Survey v3
-- ---------------------------------------------------------------------------
select is((select change_note from public.survey_versions where status = 'published'),
  'Improvement options "Ease of the process" and "Pricing and charges" removed.', 'survey v3 is the published version');
select ok(not exists (select 1 from public.survey_versions v, jsonb_array_elements(v.catalogue_snapshot -> 'improvement_factors') o
                       where v.status = 'published' and o ->> 'code' in ('EASE', 'PRICE')),
  'the v3 snapshot no longer offers "Ease of the process" or "Pricing and charges"');
select is((select array_agg(o ->> 'code' order by ord) from public.survey_versions v,
                  jsonb_array_elements(v.catalogue_snapshot -> 'improvement_factors') with ordinality t(o, ord)
            where v.status = 'published'),
  array['SPEED', 'STAFF', 'COMMS', 'TECH', 'OTHER', 'NONE'], 'the other improvement options stay, in order');
select is((select array_agg(code || ':' || label || ':' || is_active::text order by code) from public.improvement_factors
            where code in ('EASE', 'PRICE')),
  array['EASE:Ease of the process:false', 'PRICE:Pricing and charges:false'],
  'the retired options are deactivated, not deleted, and keep their labels for old responses');
select ok(exists (select 1 from public.survey_versions v, jsonb_array_elements(v.catalogue_snapshot -> 'improvement_factors') o
                   where v.status = 'retired' and o ->> 'code' = 'EASE'),
  'retired versions keep their own snapshot (FR-27)');
select is((select definition from public.survey_versions where status = 'published'),
  (select v.definition from public.survey_versions v
    where v.version_no = (select version_no - 1 from public.survey_versions where status = 'published')),
  'v3 keeps the v2 questions');
select is((select count(*)::int from public.survey_versions where status = 'published'), 1, 'exactly one published version');

-- ---------------------------------------------------------------------------
-- Submitting against v3
-- ---------------------------------------------------------------------------
create temp table s on commit drop as
select public.survey_start_session('pgtap-session-one-0001', 'pgtap-device-one-00001', 'sms') as p;

select ok((select (p ->> 'opened_at')::timestamptz between now() - interval '1 minute' and now() from s),
  'the session payload carries opened_at for the resume screen');
select is((select p -> 'version' ->> 'id' from s), (select id::text from public.survey_versions where status = 'published'),
  'new sessions use v3');
select throws_ok($$select public.survey_submit('pgtap-session-one-0001', '44444444-4444-4444-8444-444444444444',
    '{"channel":"MOBILE_APP","product":"MOTOR","csat":4,"ces":4,"nps":8,"factor":"EASE"}', 'verified')$$,
  'P0001', 'validation-failed', 'a retired improvement option is refused on v3');
select ok((select public.survey_submit('pgtap-session-one-0001', '44444444-4444-4444-8444-444444444444',
    '{"channel":"MOBILE_APP","product":"MOTOR","csat":4,"ces":4,"nps":8,"factor":"SPEED"}', 'verified') ->> 'reference')
    ~ '^FB-\d{4}-\d{6,}$',
  'an active option submits');

-- ---------------------------------------------------------------------------
-- survey_abandon_session ("Start a new feedback form")
-- ---------------------------------------------------------------------------
create temp table two on commit drop as
select public.survey_start_session('pgtap-session-two-0002', 'pgtap-device-two-00002', null) as p;
create temp table two_draft on commit drop as
select public.survey_save_draft('pgtap-session-two-0002', 1, 3, '{"channel":"MOBILE_APP","product":"MOTOR","csat":2}') as d;
create temp table old on commit drop as
select id from survey.sessions where session_secret_hash = extensions.digest('pgtap-session-two-0002', 'sha256');

select is(public.survey_abandon_session('pgtap-session-two-0002') ->> 'status', 'abandoned', 'an unfinished session is abandoned');
select is((select status || ':' || abandoned_at_page || ':' || draft_answers::text from survey.sessions
            where id = (select id from old)),
  'expired:3:{}', 'it is closed server-side at its current page and its draft answers are discarded');
select is(public.survey_abandon_session('pgtap-session-two-0002') ->> 'status', 'expired', 'abandoning twice changes nothing');
select ok((select (p ->> 'new')::boolean and p -> 'answers' = '{}'::jsonb and (p ->> 'session_id')::uuid <> (select id from old)
             from (select public.survey_start_session('pgtap-session-two-0002', 'pgtap-device-two-00002', null) p) x),
  'the abandoned draft is never resumed: the same cookie starts a new, blank session');
select is(public.survey_abandon_session('pgtap-session-one-0001') ->> 'status', 'submitted',
  'a submitted session is never touched');
select is((select status from survey.sessions where session_secret_hash = extensions.digest('pgtap-session-one-0001', 'sha256')),
  'submitted', 'the submitted session keeps its status');
select is(public.survey_abandon_session('pgtap-session-unknown-9') ->> 'status', 'none', 'an unknown session is reported, not created');
select throws_ok($$select public.survey_abandon_session('short')$$, '22023', null, 'a malformed session secret is refused');
select ok(has_function_privilege('service_role', 'public.survey_abandon_session(text)', 'execute')
          and not has_function_privilege('anon', 'public.survey_abandon_session(text)', 'execute')
          and not has_function_privilege('authenticated', 'public.survey_abandon_session(text)', 'execute'),
  'only the Worker (service_role) can abandon sessions');

select * from finish();
rollback;
