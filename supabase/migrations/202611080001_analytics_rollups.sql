-- MS-07 analytics engine, part 1: attribution corrections (table only), the effective-response view,
-- and the exact daily roll-ups (SPEC §2.3 "Analytics roll-ups", ADR-0004).
--
-- * analytics.responses_daily is maintained in the submitting transaction by an AFTER INSERT trigger on
--   survey.responses, rebuilt for any day touched by an approved attribution correction, and rebuilt
--   nightly for the trailing 35 days with a reconciliation check against raw rows.
-- * analytics.sessions_daily is rebuilt from survey.sessions / survey.events by pg_cron every minute for
--   the days that can still change, and nightly for the trailing 29 days (unsubmitted sessions are
--   deleted after 30 days, D-16, so older days are final and must not be rebuilt).
-- The pgmq outbox is not consumed here: ops.process_outbox() (MS-10) is its only consumer.

-- ---------------------------------------------------------------------------
-- Attribution corrections (FR-41, A-64). Table only: the propose/approve/reject RPCs are MS-13's.
-- ---------------------------------------------------------------------------
create table survey.attribution_corrections (
  id                       uuid primary key default gen_random_uuid(),
  response_id              uuid not null references survey.responses (id),
  original_branch_id       uuid references public.branches (id),
  corrected_branch_id      uuid references public.branches (id),
  corrected_branch_status  text not null default 'selected'
                             check (corrected_branch_status in ('selected', 'other', 'not_applicable', 'not_provided')),
  reason                   text not null check (length(btrim(reason)) between 1 and 500),
  proposed_by              uuid not null references public.profiles (user_id),
  proposed_at              timestamptz not null default now(),
  approved_by              uuid references public.profiles (user_id),
  approved_at              timestamptz,
  rejected_by              uuid references public.profiles (user_id),
  rejected_at              timestamptz,
  rejection_reason         text check (length(rejection_reason) <= 500),
  status                   text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  check ((corrected_branch_status = 'selected') = (corrected_branch_id is not null)),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  check (status <> 'rejected' or (rejected_by is not null and rejected_at is not null)),
  -- Four-eyes (FR-41): the approver is never the proposer.
  check (approved_by is null or approved_by <> proposed_by)
);
comment on table survey.attribution_corrections is
  'Branch-attribution corrections (FR-41). The response itself never changes (Rule 5); the latest approved row overlays it in analytics.v_responses_effective.';
create unique index attribution_corrections_one_open on survey.attribution_corrections (response_id)
  where status = 'proposed';
create index attribution_corrections_approved on survey.attribution_corrections (response_id, approved_at desc)
  where status = 'approved';
create trigger attribution_corrections_audit after insert or update on survey.attribution_corrections
  for each row execute function app.audit_row();
revoke all on survey.attribution_corrections from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Effective responses: every response with the latest approved correction applied. No free text and
-- no contact data. Not readable through the Data API: callers use analytics.filtered_responses().
-- ---------------------------------------------------------------------------
create or replace view analytics.v_responses_effective as
select
  r.id,
  r.reference,
  r.session_id,
  r.survey_version_id,
  v.version_no,
  v.scale_signature,
  r.source_id,
  s.code                                                    as source_code,
  r.qr_point_id,
  r.service_channel_id,
  r.insurance_product_id,
  r.improvement_factor_id,
  coalesce(c.corrected_branch_status, r.branch_status)     as branch_status,
  case when c.id is null then r.issuing_branch_id else c.corrected_branch_id end as issuing_branch_id,
  case
    when c.id is null then r.region_id_at_submission
    when c.corrected_branch_id is null then null
    else coalesce(
      (select h.region_id from public.branch_region_history h
        where h.branch_id = c.corrected_branch_id and h.valid_from <= r.submitted_at
          and (h.valid_to is null or h.valid_to > r.submitted_at)
        order by h.valid_from desc limit 1),
      (select b.region_id from public.branches b where b.id = c.corrected_branch_id))
  end                                                       as region_id,
  r.branch_status                                           as original_branch_status,
  r.issuing_branch_id                                       as original_issuing_branch_id,
  r.region_id_at_submission                                 as original_region_id,
  c.id is not null                                          as is_corrected,
  c.id                                                      as correction_id,
  r.csat_score,
  r.ces_score,
  r.nps_score,
  r.nps_class,
  case when r.csat_score <= 2 then 'negative' when r.csat_score = 3 then 'neutral' else 'positive' end as satisfaction,
  r.contact_consent,
  nullif(btrim(r.comment), '') is not null                  as has_comment,
  r.verification,
  r.verification = 'verified'                               as is_verified,
  r.opened_at,
  r.interactive_at,
  r.submitted_at,
  (r.submitted_at at time zone 'Africa/Accra')::date        as local_date,
  r.completion_duration_ms,
  r.duration_from_opened,
  r.navigated_back,
  r.changed_previous_answer,
  r.text_redacted_at,
  r.created_at
from survey.responses r
join public.survey_versions v on v.id = r.survey_version_id
join public.survey_sources s on s.id = r.source_id
left join (
  select distinct on (ac.response_id) ac.id, ac.response_id, ac.corrected_branch_id, ac.corrected_branch_status
  from survey.attribution_corrections ac
  where ac.status = 'approved'
  order by ac.response_id, ac.approved_at desc, ac.id
) c on c.response_id = r.id;
comment on view analytics.v_responses_effective is
  'Responses with the effective (corrected) branch, branch status and region, is_corrected and the Africa/Accra local_date. No free text or contact data.';
revoke all on analytics.v_responses_effective from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Roll-up: responses per local day at the SPEC grain, plus the survey version (which carries the
-- scale_signature, Rule 6) and verification (A-135), both needed to filter exactly.
-- ---------------------------------------------------------------------------
create table analytics.responses_daily (
  local_date             date not null,
  survey_version_id      uuid not null,
  source_id              uuid not null,
  qr_point_id            uuid,
  branch_status          text not null,
  issuing_branch_id      uuid,
  region_id              uuid,
  service_channel_id     uuid not null,
  insurance_product_id   uuid not null,
  improvement_factor_id  uuid,
  is_verified            boolean not null,
  n                      int not null default 0,
  csat_1 int not null default 0, csat_2 int not null default 0, csat_3 int not null default 0,
  csat_4 int not null default 0, csat_5 int not null default 0,
  ces_1 int not null default 0, ces_2 int not null default 0, ces_3 int not null default 0,
  ces_4 int not null default 0, ces_5 int not null default 0,
  nps_0 int not null default 0, nps_1 int not null default 0, nps_2 int not null default 0,
  nps_3 int not null default 0, nps_4 int not null default 0, nps_5 int not null default 0,
  nps_6 int not null default 0, nps_7 int not null default 0, nps_8 int not null default 0,
  nps_9 int not null default 0, nps_10 int not null default 0,
  completion_n           int not null default 0,
  completion_ms_sum      bigint not null default 0,
  completion_le60        int not null default 0,
  constraint responses_daily_grain unique nulls not distinct (local_date, survey_version_id, source_id, qr_point_id,
    branch_status, issuing_branch_id, region_id, service_channel_id, insurance_product_id, improvement_factor_id,
    is_verified)
);
comment on table analytics.responses_daily is
  'Exact additive daily counters (ADR-0004). Histograms are columns (csat_k, ces_k, nps_k). Branch/region are the effective (corrected) values.';
create index responses_daily_branch on analytics.responses_daily (issuing_branch_id, local_date);

-- Same grain per calendar month (local_date = first day of the month). Long periods read whole months
-- from here and only the partial months at the edges from responses_daily, so query cost follows the
-- number of distinct cells rather than the number of days.
create table analytics.responses_monthly (like analytics.responses_daily including defaults);
alter table analytics.responses_monthly add constraint responses_monthly_grain unique nulls not distinct (local_date,
  survey_version_id, source_id, qr_point_id, branch_status, issuing_branch_id, region_id, service_channel_id,
  insurance_product_id, improvement_factor_id, is_verified);
comment on table analytics.responses_monthly is
  'responses_daily summed per calendar month (local_date = month start). Maintained with responses_daily.';

-- One row of counters for a single response; shared by the trigger and the rebuild so both agree.
create or replace function analytics.responses_daily_add(p analytics.v_responses_effective)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into analytics.responses_daily as d (local_date, survey_version_id, source_id, qr_point_id, branch_status,
    issuing_branch_id, region_id, service_channel_id, insurance_product_id, improvement_factor_id, is_verified, n,
    csat_1, csat_2, csat_3, csat_4, csat_5, ces_1, ces_2, ces_3, ces_4, ces_5,
    nps_0, nps_1, nps_2, nps_3, nps_4, nps_5, nps_6, nps_7, nps_8, nps_9, nps_10,
    completion_n, completion_ms_sum, completion_le60)
  values (p.local_date, p.survey_version_id, p.source_id, p.qr_point_id, p.branch_status, p.issuing_branch_id,
    p.region_id, p.service_channel_id, p.insurance_product_id, p.improvement_factor_id, p.is_verified, 1,
    (p.csat_score = 1)::int, (p.csat_score = 2)::int, (p.csat_score = 3)::int, (p.csat_score = 4)::int, (p.csat_score = 5)::int,
    (p.ces_score = 1)::int, (p.ces_score = 2)::int, (p.ces_score = 3)::int, (p.ces_score = 4)::int, (p.ces_score = 5)::int,
    (p.nps_score = 0)::int, (p.nps_score = 1)::int, (p.nps_score = 2)::int, (p.nps_score = 3)::int, (p.nps_score = 4)::int,
    (p.nps_score = 5)::int, (p.nps_score = 6)::int, (p.nps_score = 7)::int, (p.nps_score = 8)::int, (p.nps_score = 9)::int,
    (p.nps_score = 10)::int,
    (p.completion_duration_ms is not null and not p.duration_from_opened)::int,
    case when p.completion_duration_ms is not null and not p.duration_from_opened then p.completion_duration_ms else 0 end,
    (p.completion_duration_ms is not null and not p.duration_from_opened and p.completion_duration_ms <= 60000)::int)
  on conflict on constraint responses_daily_grain do update set
    n = d.n + 1,
    csat_1 = d.csat_1 + excluded.csat_1, csat_2 = d.csat_2 + excluded.csat_2, csat_3 = d.csat_3 + excluded.csat_3,
    csat_4 = d.csat_4 + excluded.csat_4, csat_5 = d.csat_5 + excluded.csat_5,
    ces_1 = d.ces_1 + excluded.ces_1, ces_2 = d.ces_2 + excluded.ces_2, ces_3 = d.ces_3 + excluded.ces_3,
    ces_4 = d.ces_4 + excluded.ces_4, ces_5 = d.ces_5 + excluded.ces_5,
    nps_0 = d.nps_0 + excluded.nps_0, nps_1 = d.nps_1 + excluded.nps_1, nps_2 = d.nps_2 + excluded.nps_2,
    nps_3 = d.nps_3 + excluded.nps_3, nps_4 = d.nps_4 + excluded.nps_4, nps_5 = d.nps_5 + excluded.nps_5,
    nps_6 = d.nps_6 + excluded.nps_6, nps_7 = d.nps_7 + excluded.nps_7, nps_8 = d.nps_8 + excluded.nps_8,
    nps_9 = d.nps_9 + excluded.nps_9, nps_10 = d.nps_10 + excluded.nps_10,
    completion_n = d.completion_n + excluded.completion_n,
    completion_ms_sum = d.completion_ms_sum + excluded.completion_ms_sum,
    completion_le60 = d.completion_le60 + excluded.completion_le60;
  insert into analytics.responses_monthly as d (local_date, survey_version_id, source_id, qr_point_id, branch_status,
    issuing_branch_id, region_id, service_channel_id, insurance_product_id, improvement_factor_id, is_verified, n,
    csat_1, csat_2, csat_3, csat_4, csat_5, ces_1, ces_2, ces_3, ces_4, ces_5,
    nps_0, nps_1, nps_2, nps_3, nps_4, nps_5, nps_6, nps_7, nps_8, nps_9, nps_10,
    completion_n, completion_ms_sum, completion_le60)
  values (date_trunc('month', p.local_date::timestamp)::date, p.survey_version_id, p.source_id, p.qr_point_id, p.branch_status, p.issuing_branch_id,
    p.region_id, p.service_channel_id, p.insurance_product_id, p.improvement_factor_id, p.is_verified, 1,
    (p.csat_score = 1)::int, (p.csat_score = 2)::int, (p.csat_score = 3)::int, (p.csat_score = 4)::int, (p.csat_score = 5)::int,
    (p.ces_score = 1)::int, (p.ces_score = 2)::int, (p.ces_score = 3)::int, (p.ces_score = 4)::int, (p.ces_score = 5)::int,
    (p.nps_score = 0)::int, (p.nps_score = 1)::int, (p.nps_score = 2)::int, (p.nps_score = 3)::int, (p.nps_score = 4)::int,
    (p.nps_score = 5)::int, (p.nps_score = 6)::int, (p.nps_score = 7)::int, (p.nps_score = 8)::int, (p.nps_score = 9)::int,
    (p.nps_score = 10)::int,
    (p.completion_duration_ms is not null and not p.duration_from_opened)::int,
    case when p.completion_duration_ms is not null and not p.duration_from_opened then p.completion_duration_ms else 0 end,
    (p.completion_duration_ms is not null and not p.duration_from_opened and p.completion_duration_ms <= 60000)::int)
  on conflict on constraint responses_monthly_grain do update set
    n = d.n + 1,
    csat_1 = d.csat_1 + excluded.csat_1, csat_2 = d.csat_2 + excluded.csat_2, csat_3 = d.csat_3 + excluded.csat_3,
    csat_4 = d.csat_4 + excluded.csat_4, csat_5 = d.csat_5 + excluded.csat_5,
    ces_1 = d.ces_1 + excluded.ces_1, ces_2 = d.ces_2 + excluded.ces_2, ces_3 = d.ces_3 + excluded.ces_3,
    ces_4 = d.ces_4 + excluded.ces_4, ces_5 = d.ces_5 + excluded.ces_5,
    nps_0 = d.nps_0 + excluded.nps_0, nps_1 = d.nps_1 + excluded.nps_1, nps_2 = d.nps_2 + excluded.nps_2,
    nps_3 = d.nps_3 + excluded.nps_3, nps_4 = d.nps_4 + excluded.nps_4, nps_5 = d.nps_5 + excluded.nps_5,
    nps_6 = d.nps_6 + excluded.nps_6, nps_7 = d.nps_7 + excluded.nps_7, nps_8 = d.nps_8 + excluded.nps_8,
    nps_9 = d.nps_9 + excluded.nps_9, nps_10 = d.nps_10 + excluded.nps_10,
    completion_n = d.completion_n + excluded.completion_n,
    completion_ms_sum = d.completion_ms_sum + excluded.completion_ms_sum,
    completion_le60 = d.completion_le60 + excluded.completion_le60
$$;

-- Same transaction as the submission, so dashboards are never behind the raw rows. A shared advisory
-- lock lets submissions run concurrently while a rebuild (exclusive lock) is in progress.
create or replace function analytics.responses_daily_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row analytics.v_responses_effective;
begin
  perform pg_advisory_xact_lock_shared(hashtext('analytics.responses_daily'));
  select * into v_row from analytics.v_responses_effective where id = new.id;
  perform analytics.responses_daily_add(v_row);
  return null;
end;
$$;
create trigger responses_rollup after insert on survey.responses
  for each row execute function analytics.responses_daily_on_insert();

-- Rebuild whole days from raw rows (corrections, nightly reconciliation). Callable by MS-13's
-- correction RPCs (they run as the owner) and by service_role.
create or replace function analytics.rebuild_days(p_from date, p_to date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'rebuild_days needs a valid date range.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('analytics.responses_daily'));
  delete from analytics.responses_daily where local_date between p_from and p_to;
  insert into analytics.responses_daily (local_date, survey_version_id, source_id, qr_point_id, branch_status,
    issuing_branch_id, region_id, service_channel_id, insurance_product_id, improvement_factor_id, is_verified, n,
    csat_1, csat_2, csat_3, csat_4, csat_5, ces_1, ces_2, ces_3, ces_4, ces_5,
    nps_0, nps_1, nps_2, nps_3, nps_4, nps_5, nps_6, nps_7, nps_8, nps_9, nps_10,
    completion_n, completion_ms_sum, completion_le60)
  select r.local_date, r.survey_version_id, r.source_id, r.qr_point_id, r.branch_status, r.issuing_branch_id,
    r.region_id, r.service_channel_id, r.insurance_product_id, r.improvement_factor_id, r.is_verified, count(*),
    count(*) filter (where r.csat_score = 1), count(*) filter (where r.csat_score = 2),
    count(*) filter (where r.csat_score = 3), count(*) filter (where r.csat_score = 4),
    count(*) filter (where r.csat_score = 5),
    count(*) filter (where r.ces_score = 1), count(*) filter (where r.ces_score = 2),
    count(*) filter (where r.ces_score = 3), count(*) filter (where r.ces_score = 4),
    count(*) filter (where r.ces_score = 5),
    count(*) filter (where r.nps_score = 0), count(*) filter (where r.nps_score = 1),
    count(*) filter (where r.nps_score = 2), count(*) filter (where r.nps_score = 3),
    count(*) filter (where r.nps_score = 4), count(*) filter (where r.nps_score = 5),
    count(*) filter (where r.nps_score = 6), count(*) filter (where r.nps_score = 7),
    count(*) filter (where r.nps_score = 8), count(*) filter (where r.nps_score = 9),
    count(*) filter (where r.nps_score = 10),
    count(*) filter (where r.completion_duration_ms is not null and not r.duration_from_opened),
    coalesce(sum(r.completion_duration_ms) filter (where not r.duration_from_opened), 0),
    count(*) filter (where not r.duration_from_opened and r.completion_duration_ms <= 60000)
  from analytics.v_responses_effective r
  where r.submitted_at >= (p_from::timestamp at time zone 'Africa/Accra')
    and r.submitted_at < ((p_to + 1)::timestamp at time zone 'Africa/Accra')
  group by r.local_date, r.survey_version_id, r.source_id, r.qr_point_id, r.branch_status, r.issuing_branch_id,
    r.region_id, r.service_channel_id, r.insurance_product_id, r.improvement_factor_id, r.is_verified;
  get diagnostics v_rows = row_count;
  -- Months touched are re-summed from the (now exact) daily rows.
  delete from analytics.responses_monthly
   where local_date between date_trunc('month', p_from::timestamp)::date and date_trunc('month', p_to::timestamp)::date;
  insert into analytics.responses_monthly
  select date_trunc('month', d.local_date::timestamp)::date, d.survey_version_id, d.source_id, d.qr_point_id,
    d.branch_status, d.issuing_branch_id, d.region_id, d.service_channel_id, d.insurance_product_id,
    d.improvement_factor_id, d.is_verified, sum(d.n),
    sum(d.csat_1), sum(d.csat_2), sum(d.csat_3), sum(d.csat_4), sum(d.csat_5),
    sum(d.ces_1), sum(d.ces_2), sum(d.ces_3), sum(d.ces_4), sum(d.ces_5),
    sum(d.nps_0), sum(d.nps_1), sum(d.nps_2), sum(d.nps_3), sum(d.nps_4), sum(d.nps_5), sum(d.nps_6), sum(d.nps_7),
    sum(d.nps_8), sum(d.nps_9), sum(d.nps_10), sum(d.completion_n), sum(d.completion_ms_sum), sum(d.completion_le60)
  from analytics.responses_daily d
  where d.local_date >= date_trunc('month', p_from::timestamp)::date
    and d.local_date < (date_trunc('month', p_to::timestamp) + interval '1 month')::date
  group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11;
  return v_rows;
end;
$$;
comment on function analytics.rebuild_days(date, date) is
  'Recomputes analytics.responses_daily for local dates p_from..p_to from raw rows (effective attribution). Call after approving an attribution correction.';

-- An approved correction re-attributes its response's day at once (the correction RPCs need not call
-- rebuild_days themselves, but may).
create or replace function analytics.correction_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select (submitted_at at time zone 'Africa/Accra')::date into v_day from survey.responses where id = new.response_id;
    perform analytics.rebuild_days(v_day, v_day);
  end if;
  return null;
end;
$$;
create trigger attribution_corrections_rollup after insert or update of status on survey.attribution_corrections
  for each row execute function analytics.correction_rebuild();

-- ---------------------------------------------------------------------------
-- Roll-up: survey sessions per local day (by opened_at) × source × QR point. Cooldown blocks and
-- Turnstile failures are counted on the day of the event; blocks before any session exists have no
-- source (source_id null).
-- ---------------------------------------------------------------------------
create table analytics.sessions_daily (
  local_date        date not null,
  source_id         uuid,
  qr_point_id       uuid,
  opened            int not null default 0,
  interactive       int not null default 0,
  reached_1 int not null default 0, reached_2 int not null default 0, reached_3 int not null default 0,
  reached_4 int not null default 0, reached_5 int not null default 0,
  submitted         int not null default 0,
  abandoned_1 int not null default 0, abandoned_2 int not null default 0, abandoned_3 int not null default 0,
  abandoned_4 int not null default 0, abandoned_5 int not null default 0,
  cooldown_blocked  int not null default 0,
  turnstile_failed  int not null default 0,
  refreshed_at      timestamptz not null default now(),
  constraint sessions_daily_grain unique nulls not distinct (local_date, source_id, qr_point_id)
);
comment on table analytics.sessions_daily is
  'Funnel counters per local day of opening (D-33): visits, started (became interactive), reached page n, submitted, abandoned by page, cooldown blocks, Turnstile failures.';

create index sessions_last_activity on survey.sessions (last_activity_at);

create or replace function analytics.refresh_sessions_days(p_from date, p_to date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Unsubmitted sessions older than 30 days are purged (D-16): those days are final.
  v_from date := greatest(p_from, (now() at time zone 'Africa/Accra')::date - 29);
  v_rows int;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'refresh_sessions_days needs a valid date range.' using errcode = '22023';
  end if;
  if v_from > p_to then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtext('analytics.sessions_daily'));
  delete from analytics.sessions_daily where local_date between v_from and p_to;
  insert into analytics.sessions_daily (local_date, source_id, qr_point_id, opened, interactive,
    reached_1, reached_2, reached_3, reached_4, reached_5, submitted,
    abandoned_1, abandoned_2, abandoned_3, abandoned_4, abandoned_5, cooldown_blocked, turnstile_failed)
  select x.d, x.src, x.qr, sum(x.opened), sum(x.interactive), sum(x.r1), sum(x.r2), sum(x.r3), sum(x.r4), sum(x.r5),
         sum(x.sub), sum(x.a1), sum(x.a2), sum(x.a3), sum(x.a4), sum(x.a5), sum(x.cb), sum(x.tf)
  from (
    select (s.opened_at at time zone 'Africa/Accra')::date as d, s.source_id as src, s.qr_point_id as qr,
           1 as opened, (s.interactive_at is not null)::int as interactive,
           (s.max_page_reached >= 1)::int as r1, (s.max_page_reached >= 2)::int as r2,
           (s.max_page_reached >= 3)::int as r3, (s.max_page_reached >= 4)::int as r4,
           (s.max_page_reached >= 5)::int as r5, (s.status = 'submitted')::int as sub,
           (s.status = 'expired' and s.abandoned_at_page = 1)::int as a1,
           (s.status = 'expired' and s.abandoned_at_page = 2)::int as a2,
           (s.status = 'expired' and s.abandoned_at_page = 3)::int as a3,
           (s.status = 'expired' and s.abandoned_at_page = 4)::int as a4,
           (s.status = 'expired' and s.abandoned_at_page = 5)::int as a5,
           0 as cb, 0 as tf
    from survey.sessions s
    where s.opened_at >= (v_from::timestamp at time zone 'Africa/Accra')
      and s.opened_at < ((p_to + 1)::timestamp at time zone 'Africa/Accra')
    union all
    select (e.server_ts at time zone 'Africa/Accra')::date, s.source_id, s.qr_point_id,
           0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
           (e.type = 'cooldown_blocked')::int, (e.type = 'turnstile_failed')::int
    from survey.events e
    left join survey.sessions s on s.id = e.session_id
    where e.type in ('cooldown_blocked', 'turnstile_failed')
      and e.server_ts >= (v_from::timestamp at time zone 'Africa/Accra')
      and e.server_ts < ((p_to + 1)::timestamp at time zone 'Africa/Accra')
  ) x
  group by x.d, x.src, x.qr;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Every minute: today, yesterday, and the opening days of any session that can still change state
-- (activity within the expiry window + 2 h, which also covers the 15-minute expiry sweep).
create or replace function analytics.refresh_sessions_recent()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_window interval := make_interval(hours => survey.setting_int('session_expiry_hours', 24) + 2);
  v_day date;
  v_total int := 0;
begin
  for v_day in
    select d from (
      select (s.opened_at at time zone 'Africa/Accra')::date as d
      from survey.sessions s where s.last_activity_at > now() - v_window
      union select v_today union select v_today - 1) days
    order by d
  loop
    v_total := v_total + analytics.refresh_sessions_days(v_day, v_day);
  end loop;
  return v_total;
end;
$$;

-- Nightly: reconcile the trailing 35 days of responses_daily against raw rows (recorded in
-- ops.job_runs), then rebuild them; rebuild the trailing 29 days of sessions_daily.
create or replace function analytics.nightly_rebuild()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_run bigint;
  v_mismatch jsonb;
  v_detail jsonb;
begin
  insert into ops.job_runs (job) values ('analytics.nightly_rebuild') returning id into v_run;
  select coalesce(jsonb_agg(jsonb_build_object('date', d, 'rollup', ro, 'raw', ra) order by d), '[]'::jsonb)
    into v_mismatch
  from (
    select coalesce(a.d, b.d) as d, coalesce(a.n, 0) as ro, coalesce(b.n, 0) as ra
    from (select local_date as d, sum(n) as n from analytics.responses_daily
          where local_date between v_today - 34 and v_today group by local_date) a
    full join (select (submitted_at at time zone 'Africa/Accra')::date as d, count(*) as n from survey.responses
               where submitted_at >= ((v_today - 34)::timestamp at time zone 'Africa/Accra')
               group by 1) b on a.d = b.d
  ) t
  where ro <> ra;
  v_detail := jsonb_build_object(
    'mismatched_days', v_mismatch,
    'response_rows', analytics.rebuild_days(v_today - 34, v_today),
    'session_rows', analytics.refresh_sessions_days(v_today - 28, v_today));
  update ops.job_runs set finished_at = now(), status = 'succeeded', detail = v_detail where id = v_run;
  return v_detail;
end;
$$;

revoke all on analytics.responses_daily, analytics.responses_monthly, analytics.sessions_daily from public, anon, authenticated;
revoke all on function analytics.responses_daily_add(analytics.v_responses_effective),
  analytics.responses_daily_on_insert(), analytics.rebuild_days(date, date), analytics.correction_rebuild(),
  analytics.refresh_sessions_days(date, date), analytics.refresh_sessions_recent(), analytics.nightly_rebuild()
  from public, anon, authenticated;
grant execute on function analytics.rebuild_days(date, date), analytics.refresh_sessions_days(date, date)
  to service_role;

select cron.schedule('analytics-sessions-minute', '* * * * *', 'select analytics.refresh_sessions_recent()');
select cron.schedule('analytics-nightly-rebuild', '40 2 * * *', 'select analytics.nightly_rebuild()');
