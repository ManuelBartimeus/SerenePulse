-- MS-05/06 survey access and response capture (M05, M06, M07, M16 storage).
-- The survey Worker is the only caller of the survey_* functions (service_role). Customers never
-- reach the database directly; portal users read responses through analytics views (MS-07/08).

-- ---------------------------------------------------------------------------
-- Sources and QR points (M05). A QR point has no branch on purpose (Rule 2, A-130).
-- ---------------------------------------------------------------------------
create table public.survey_sources (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code in ('sms', 'direct', 'qr')),
  label      text not null,
  is_active  boolean not null default true
);
comment on table public.survey_sources is 'Where a survey session came from (D-33). Never used as branch attribution.';
insert into public.survey_sources (code, label) values
  ('sms', 'SMS link'), ('direct', 'Direct visit'), ('qr', 'QR poster');

create or replace function app.new_qr_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- No 0/O, 1/I/L: codes are typed from posters as a fallback.
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := (select string_agg(substr(v_alphabet, 1 + (get_byte(b, i) % length(v_alphabet)), 1), '')
               from extensions.gen_random_bytes(4) b, generate_series(0, 3) i);
    exit when not exists (select 1 from public.qr_points where code = v_code);
  end loop;
  return v_code;
end;
$$;

create table public.qr_points (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default app.new_qr_code() check (code ~ '^[A-Z2-9]{4,8}$'),
  label           text not null check (length(label) between 1 and 80),
  placement_note  text check (length(placement_note) <= 300),
  is_active       boolean not null default true,
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  version         int not null default 1
);
comment on table public.qr_points is 'QR posters (D-07). Placement is operational free text only; never a branch (A-130).';
create trigger qr_points_touch before update on public.qr_points for each row execute function app.touch_row();
create trigger qr_points_actor before insert or update on public.qr_points for each row execute function app.stamp_actor();
create trigger qr_points_code before update of code on public.qr_points for each row execute function app.code_immutable();
create trigger qr_points_deactivation before update on public.qr_points
  for each row execute function app.branch_deactivation_stamp();
create trigger qr_points_audit after insert or update on public.qr_points for each row execute function app.audit_row();

alter table public.survey_sources enable row level security;
alter table public.qr_points enable row level security;
create policy survey_sources_read on public.survey_sources for select to authenticated using (true);
create policy qr_points_read on public.qr_points for select to authenticated using (true);
create policy qr_points_insert on public.qr_points for insert to authenticated
  with check ((select app.has_perm('config.qr_points')));
create policy qr_points_update on public.qr_points for update to authenticated
  using ((select app.has_perm('config.qr_points'))) with check ((select app.has_perm('config.qr_points')));
revoke all on public.survey_sources, public.qr_points from anon;
revoke insert, update, delete, truncate on public.survey_sources, public.qr_points from authenticated;
grant select on public.survey_sources, public.qr_points to authenticated;
grant insert (label, placement_note) on public.qr_points to authenticated;
grant update (label, placement_note, is_active) on public.qr_points to authenticated;

-- ---------------------------------------------------------------------------
-- Sessions, responses, cooldowns, telemetry (schema survey, no Data API exposure)
-- ---------------------------------------------------------------------------
create table survey.sessions (
  id                       uuid primary key default gen_random_uuid(),
  session_secret_hash      bytea not null unique,
  device_id_hash           bytea not null,
  source_id                uuid not null references public.survey_sources (id),
  qr_point_id              uuid references public.qr_points (id),
  qr_code_scanned          text check (length(qr_code_scanned) <= 16),
  survey_version_id        uuid not null references public.survey_versions (id),
  opened_at                timestamptz not null default now(),
  interactive_at           timestamptz,
  last_activity_at         timestamptz not null default now(),
  current_page             int not null default 1 check (current_page between 1 and 5),
  max_page_reached         int not null default 1 check (max_page_reached between 1 and 5),
  draft_answers            jsonb not null default '{}',
  answer_seq               int not null default 0,
  draft_write_count        int not null default 0,
  navigated_back           boolean not null default false,
  changed_previous_answer  boolean not null default false,
  abandoned_at_page        int,
  status                   text not null default 'active' check (status in ('active', 'submitted', 'expired')),
  submit_idempotency_key   uuid,
  turnstile_passed_at      timestamptz,
  user_agent_class         text not null default 'other' check (user_agent_class in ('mobile', 'tablet', 'desktop', 'other'))
);
comment on table survey.sessions is 'One anonymous survey session (D-33, A-12). The draft is updated in place, so a changed answer never duplicates (Rule 19).';
create index sessions_status_activity on survey.sessions (status, last_activity_at);
create index sessions_device on survey.sessions (device_id_hash);
create index sessions_opened on survey.sessions (opened_at);

create table survey.reference_counters (
  year  int primary key,
  last  int not null
);

create table survey.responses (
  id                            uuid primary key default gen_random_uuid(),
  reference                     text not null unique check (reference ~ '^FB-\d{4}-\d{6,}$'),
  session_id                    uuid not null unique references survey.sessions (id),
  survey_version_id             uuid not null references public.survey_versions (id),
  source_id                     uuid not null references public.survey_sources (id),
  qr_point_id                   uuid references public.qr_points (id),
  service_channel_id            uuid not null references public.service_channels (id),
  service_channel_other_text    varchar(80),
  branch_status                 text not null check (branch_status in ('selected', 'other', 'not_applicable', 'not_provided')),
  issuing_branch_id             uuid references public.branches (id),
  issuing_branch_other_text     varchar(80),
  region_id_at_submission       uuid references public.regions (id),
  insurance_product_id          uuid not null references public.insurance_products (id),
  insurance_product_other_text  varchar(80),
  csat_score                    smallint not null check (csat_score between 1 and 5),
  ces_score                     smallint not null check (ces_score between 1 and 5),
  nps_score                     smallint not null check (nps_score between 0 and 10),
  nps_class                     text generated always as (
                                  case when nps_score >= 9 then 'promoter' when nps_score >= 7 then 'passive'
                                       else 'detractor' end) stored,
  improvement_factor_id         uuid references public.improvement_factors (id),
  improvement_other_text        varchar(200),
  comment                       text check (char_length(comment) <= 1000),
  contact_consent               boolean not null default false,
  verification                  text not null default 'verified'
                                  check (verification in ('verified', 'unverified_turnstile_outage', 'unverified_no_js')),
  opened_at                     timestamptz not null,
  interactive_at                timestamptz,
  submitted_at                  timestamptz not null default now(),
  completion_duration_ms        int check (completion_duration_ms >= 0),
  duration_from_opened          boolean not null default false,
  navigated_back                boolean not null default false,
  changed_previous_answer       boolean not null default false,
  text_redacted_at              timestamptz,
  created_at                    timestamptz not null default now(),
  check ((branch_status = 'selected') = (issuing_branch_id is not null)),
  check (branch_status = 'other' or issuing_branch_other_text is null)
);
comment on table survey.responses is 'Submitted feedback (M07). Immutable (Rule 5): only retention redaction may change text.';
create index responses_submitted on survey.responses (submitted_at);
create index responses_branch on survey.responses (issuing_branch_id, submitted_at);
create index responses_channel on survey.responses (service_channel_id, submitted_at);
create index responses_product on survey.responses (insurance_product_id, submitted_at);
create index responses_low_csat on survey.responses (csat_score) where csat_score <= 2;

create or replace function survey.responses_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.retention_redact', true) = 'on' and tg_op = 'UPDATE' then
    return new;
  end if;
  raise exception 'Submitted feedback cannot be changed or deleted (Rule 5).' using errcode = '42501';
end;
$$;
create trigger responses_immutable before update or delete on survey.responses
  for each row execute function survey.responses_immutable();

create table survey.response_device_cooldowns (
  device_id_hash     bytea primary key,
  last_submitted_at  timestamptz not null,
  response_id        uuid not null references survey.responses (id)
);
comment on table survey.response_device_cooldowns is 'Per-device cooldown after a submission (A-123). Held as an HMAC; no fingerprinting.';

create table survey.events (
  id          bigint generated always as identity,
  session_id  uuid,
  type        text not null check (type in ('opened', 'interactive', 'page_view', 'answer_set', 'answer_changed',
                'back', 'validation_blocked', 'submit_attempt', 'submit_success', 'submit_error',
                'cooldown_blocked', 'turnstile_failed', 'unknown_qr', 'resumed')),
  page        int check (page between 1 and 5),
  client_ts   timestamptz,
  server_ts   timestamptz not null default now(),
  detail      jsonb check (pg_column_size(detail) <= 2048),
  primary key (id, server_ts)
) partition by range (server_ts);
comment on table survey.events is 'Survey telemetry (REQ §12), monthly partitions, 13-month retention. Best effort.';
create table survey.events_default partition of survey.events default;
create index events_session on survey.events (session_id, server_ts);
create index events_type on survey.events (type, server_ts);

create or replace function survey.ensure_event_partitions(p_months_ahead int default 2)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', now())::date;
  v_from date;
  v_name text;
begin
  for i in 0..p_months_ahead loop
    v_from := (v_start + make_interval(months => i))::date;
    v_name := 'events_' || to_char(v_from, 'YYYY_MM');
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'survey' and c.relname = v_name) then
      execute format('create table survey.%I partition of survey.events for values from (%L) to (%L)',
                     v_name, v_from, (v_from + interval '1 month')::date);
    end if;
  end loop;
end;
$$;
select survey.ensure_event_partitions(2);
select cron.schedule('survey-event-partitions', '0 1 1 * *', 'select survey.ensure_event_partitions(2)');

-- ---------------------------------------------------------------------------
-- Consented contact details (schema pii, D-15). Envelope encryption (A-19): each row has its own
-- data key, itself encrypted with the key-encryption key held in Vault (pii_kek).
-- ---------------------------------------------------------------------------
create table pii.contact_requests (
  id                    uuid primary key default gen_random_uuid(),
  response_id           uuid not null unique references survey.responses (id),
  phone_e164_enc        bytea,
  phone_hmac            bytea,
  first_name_enc        bytea,
  dek_enc               bytea,
  consent_text_version  text not null,
  created_at            timestamptz not null default now(),
  erased_at             timestamptz,
  check ((erased_at is null) = (phone_e164_enc is not null))
);
comment on table pii.contact_requests is 'Exists only when the customer switched "contact me" on (Rule 12). Read only through audited functions.';
create index contact_requests_phone_hmac on pii.contact_requests (phone_hmac) where erased_at is null;

create or replace function pii.kek()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- Hosted projects always have pii_kek (loaded by scripts/sync-secrets.mjs); the fallback exists
  -- only for the local stack, matching app.hmac.
  select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'pii_kek'),
                  'local-development-only-kek')
$$;

create or replace function pii.encrypt_contact(p_phone text, p_first_name text)
returns table (phone_enc bytea, first_name_enc bytea, dek_enc bytea)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dek text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  return query select extensions.pgp_sym_encrypt(p_phone, v_dek),
                      case when p_first_name is not null then extensions.pgp_sym_encrypt(p_first_name, v_dek) end,
                      extensions.pgp_sym_encrypt(v_dek, pii.kek());
end;
$$;

create or replace function pii.decrypt_field(p_dek_enc bytea, p_value bytea)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_value is null then null
              else extensions.pgp_sym_decrypt(p_value, extensions.pgp_sym_decrypt(p_dek_enc, pii.kek())) end
$$;

create or replace function pii.mask_phone(p_e164 text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- +233241234567 → 024 ••• 4567
  select '0' || substr(p_e164, 5, 2) || ' ••• ' || right(p_e164, 4)
$$;

revoke all on all tables in schema survey from public, anon, authenticated;
revoke all on all tables in schema pii from public, anon, authenticated;
revoke all on all functions in schema pii from public, anon, authenticated;
revoke all on function survey.ensure_event_partitions(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Worker API (service_role only)
-- ---------------------------------------------------------------------------
create or replace function survey.current_snapshot_for_display(p_snapshot jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- Options deactivated since the version was published disappear for new sessions (M02).
  select p_snapshot
    || jsonb_build_object(
      'service_channels', (select coalesce(jsonb_agg(o order by ord), '[]') from jsonb_array_elements(p_snapshot -> 'service_channels') with ordinality t(o, ord)
                           where exists (select 1 from public.service_channels c where c.code = o ->> 'code' and c.is_active)),
      'branches', (select coalesce(jsonb_agg(o order by ord), '[]') from jsonb_array_elements(p_snapshot -> 'branches') with ordinality t(o, ord)
                   where o ->> 'code' = 'OTHER' or exists (select 1 from public.branches b where b.code = o ->> 'code' and b.is_active)),
      'insurance_products', (select coalesce(jsonb_agg(o order by ord), '[]') from jsonb_array_elements(p_snapshot -> 'insurance_products') with ordinality t(o, ord)
                             where exists (select 1 from public.insurance_products p where p.code = o ->> 'code' and p.is_active and p.show_in_survey)),
      'improvement_factors', (select coalesce(jsonb_agg(o order by ord), '[]') from jsonb_array_elements(p_snapshot -> 'improvement_factors') with ordinality t(o, ord)
                              where exists (select 1 from public.improvement_factors f where f.code = o ->> 'code' and f.is_active)))
$$;

create or replace function survey.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from public.settings where key = p_key), p_default)
$$;

create or replace function survey.session_payload(p_session survey.sessions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'active', 'session_id', p_session.id, 'page', p_session.current_page,
    'answers', p_session.draft_answers, 'seq', p_session.answer_seq,
    'interactive', p_session.interactive_at is not null,
    'version', jsonb_build_object('id', v.id, 'no', v.version_no, 'definition', v.definition,
                                  'snapshot', survey.current_snapshot_for_display(v.catalogue_snapshot)))
  from public.survey_versions v where v.id = p_session.survey_version_id
$$;

-- Session start or resume (FR-01′, FR-33, FR-34). p_session / p_device are the raw cookie values.
create or replace function public.survey_start_session(p_session text, p_device text, p_src text default null,
  p_qr_code text default null, p_ua_class text default 'other')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret bytea := extensions.digest(p_session, 'sha256');
  v_device bytea := app.hmac('device:' || p_device);
  v_row survey.sessions;
  v_resp record;
  v_source uuid;
  v_qr uuid;
  v_version uuid;
  v_expiry interval := make_interval(hours => survey.setting_int('session_expiry_hours', 24));
begin
  if length(coalesce(p_session, '')) < 16 or length(coalesce(p_device, '')) < 16 then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  select * into v_row from survey.sessions where session_secret_hash = v_secret for update;
  if v_row.id is not null and v_row.status = 'submitted' then
    select r.reference, c.phone_e164_enc, c.dek_enc into v_resp
    from survey.responses r left join pii.contact_requests c on c.response_id = r.id
    where r.session_id = v_row.id;
    return jsonb_build_object('status', 'submitted', 'reference', v_resp.reference,
      'contact_masked', case when v_resp.phone_e164_enc is not null
                             then pii.mask_phone(pii.decrypt_field(v_resp.dek_enc, v_resp.phone_e164_enc)) end);
  end if;
  if v_row.id is not null and v_row.status = 'active' and v_row.last_activity_at > now() - v_expiry then
    update survey.sessions set last_activity_at = now() where id = v_row.id returning * into v_row;
    insert into survey.events (session_id, type, page) values (v_row.id, 'resumed', v_row.current_page);
    return survey.session_payload(v_row);
  end if;
  if v_row.id is not null and v_row.status = 'active' then
    update survey.sessions set status = 'expired', abandoned_at_page = current_page where id = v_row.id;
  end if;

  -- Inside the device cooldown: the "already shared" page, no new session (A-123).
  if exists (select 1 from survey.response_device_cooldowns
             where device_id_hash = v_device
               and last_submitted_at > now() - make_interval(hours => survey.setting_int('device_cooldown_hours', 24))) then
    insert into survey.events (session_id, type, detail) values (null, 'cooldown_blocked', jsonb_build_object('at', 'start'));
    return jsonb_build_object('status', 'cooldown');
  end if;

  select id into v_version from public.survey_versions where status = 'published';
  if v_version is null then
    raise exception 'unavailable' using errcode = 'P0001';
  end if;
  if p_qr_code is not null then
    select id into v_source from public.survey_sources where code = 'qr';
    select id into v_qr from public.qr_points where code = upper(left(p_qr_code, 8));
  else
    select id into v_source from public.survey_sources
     where code = case when lower(coalesce(p_src, '')) = 'sms' then 'sms' else 'direct' end;
  end if;

  if v_row.id is not null then
    -- Same cookie after expiry: rotate the stored secret out of the way so the new session can use it.
    update survey.sessions set session_secret_hash = extensions.digest(v_row.id::text || p_session, 'sha256')
     where id = v_row.id;
  end if;
  insert into survey.sessions (session_secret_hash, device_id_hash, source_id, qr_point_id, qr_code_scanned,
                               survey_version_id, user_agent_class)
  values (v_secret, v_device, v_source, v_qr, case when p_qr_code is not null then upper(left(p_qr_code, 16)) end,
          v_version, case when p_ua_class in ('mobile', 'tablet', 'desktop') then p_ua_class else 'other' end)
  returning * into v_row;
  insert into survey.events (session_id, type, page) values (v_row.id, 'opened', 1);
  if p_qr_code is not null and v_qr is null then
    insert into survey.events (session_id, type, detail)
    values (v_row.id, 'unknown_qr', jsonb_build_object('code', upper(left(p_qr_code, 16))));
  end if;
  return survey.session_payload(v_row) || jsonb_build_object('new', true);
end;
$$;

create or replace function survey.active_session(p_session text)
returns survey.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row survey.sessions;
begin
  select * into v_row from survey.sessions where session_secret_hash = extensions.digest(p_session, 'sha256') for update;
  if v_row.id is null or v_row.status = 'expired'
     or (v_row.status = 'active'
         and v_row.last_activity_at < now() - make_interval(hours => survey.setting_int('session_expiry_hours', 24))) then
    raise exception 'session-expired' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

-- Draft autosave (A-61): last write wins by seq; hidden answers are cleared (REQ §2.4).
create or replace function public.survey_save_draft(p_session text, p_seq int, p_page int, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row survey.sessions := survey.active_session(p_session);
  v_ver public.survey_versions;
  v_merged jsonb;
  v_clean jsonb;
  v_changed boolean;
begin
  if v_row.status = 'submitted' then
    raise exception 'already-shared' using errcode = 'P0001';
  end if;
  if p_seq <= v_row.answer_seq then
    return jsonb_build_object('answers', v_row.draft_answers, 'seq', v_row.answer_seq, 'stale', true);
  end if;
  if v_row.draft_write_count >= 60 then
    raise exception 'rate-limited' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 4096 then
    raise exception 'validation-failed' using errcode = 'P0001';
  end if;
  select * into v_ver from public.survey_versions where id = v_row.survey_version_id;
  v_changed := exists (select 1 from jsonb_each(p_answers) a
                       where v_row.draft_answers ? a.key and v_row.draft_answers -> a.key <> a.value);
  v_merged := jsonb_strip_nulls(v_row.draft_answers || p_answers);
  v_clean := survey.clean_answers(v_ver.definition, v_ver.catalogue_snapshot, v_merged);
  update survey.sessions
     set draft_answers = v_clean, answer_seq = p_seq, draft_write_count = draft_write_count + 1,
         current_page = least(greatest(coalesce(p_page, current_page), 1), 5),
         max_page_reached = greatest(max_page_reached, least(greatest(coalesce(p_page, 1), 1), 5)),
         changed_previous_answer = changed_previous_answer or v_changed,
         interactive_at = coalesce(interactive_at, now()), last_activity_at = now()
   where id = v_row.id;
  return jsonb_build_object('answers', v_clean, 'seq', p_seq);
end;
$$;

-- Telemetry batch (≤ 50 events, best effort). Server time is authoritative (M06 edge cases).
create or replace function public.survey_log_events(p_session text, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from survey.sessions where session_secret_hash = extensions.digest(p_session, 'sha256');
  if jsonb_typeof(p_events) <> 'array' then return; end if;
  insert into survey.events (session_id, type, page, client_ts, detail)
  select v_id, e ->> 'type', nullif(e ->> 'page', '')::int,
         case when (e ->> 'clientTs') ~ '^\d{4}-\d{2}-\d{2}T' then (e ->> 'clientTs')::timestamptz end,
         case when jsonb_typeof(e -> 'detail') = 'object' and pg_column_size(e -> 'detail') <= 1024 then e -> 'detail' end
  from (select e from jsonb_array_elements(p_events) e limit 50) t
  where e ->> 'type' in ('interactive', 'page_view', 'answer_set', 'answer_changed', 'back', 'validation_blocked',
                         'submit_attempt', 'submit_error', 'turnstile_failed')
    and coalesce(nullif(e ->> 'page', '')::int, 1) between 1 and 5;
  if v_id is not null then
    update survey.sessions
       set interactive_at = coalesce(interactive_at, case when p_events @> '[{"type":"interactive"}]' then now() end),
           navigated_back = navigated_back or p_events @> '[{"type":"back"}]',
           last_activity_at = now()
     where id = v_id and status = 'active';
  end if;
exception when others then
  -- Telemetry never breaks the survey.
  return;
end;
$$;

-- Submission (M07): one transaction re-validates, enforces one response per session and the device
-- cooldown, writes the response, contact request, cooldown, session status and outbox event.
create or replace function public.survey_submit(p_session text, p_idempotency_key uuid, p_answers jsonb,
  p_verification text default 'verified')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row survey.sessions := survey.active_session(p_session);
  v_ver public.survey_versions;
  v_check jsonb;
  a jsonb;
  v_ref text;
  v_year int := extract(year from now() at time zone 'Africa/Accra')::int;
  v_n int;
  v_resp_id uuid;
  v_channel public.service_channels;
  v_product public.insurance_products;
  v_factor public.improvement_factors;
  v_branch public.branches;
  v_branch_q jsonb;
  v_branch_status text;
  v_enc record;
  v_masked text;
  v_existing record;
begin
  if v_row.status = 'submitted' then
    select r.reference, c.phone_e164_enc, c.dek_enc into v_existing
    from survey.responses r left join pii.contact_requests c on c.response_id = r.id where r.session_id = v_row.id;
    if v_row.submit_idempotency_key = p_idempotency_key then
      return jsonb_build_object('reference', v_existing.reference,
        'contact_masked', case when v_existing.phone_e164_enc is not null
                               then pii.mask_phone(pii.decrypt_field(v_existing.dek_enc, v_existing.phone_e164_enc)) end,
        'replayed', true);
    end if;
    raise exception 'already-shared' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null then
    raise exception 'validation-failed' using errcode = 'P0001', detail = '[{"field":"idempotency_key","code":"required"}]';
  end if;
  if p_verification not in ('verified', 'unverified_turnstile_outage', 'unverified_no_js') then
    raise exception 'validation-failed' using errcode = 'P0001';
  end if;
  if exists (select 1 from survey.response_device_cooldowns
             where device_id_hash = v_row.device_id_hash
               and last_submitted_at > now() - make_interval(hours => survey.setting_int('device_cooldown_hours', 24))) then
    insert into survey.events (session_id, type, detail) values (v_row.id, 'cooldown_blocked', '{"at":"submit"}');
    raise exception 'already-shared' using errcode = 'P0001';
  end if;

  select * into v_ver from public.survey_versions where id = v_row.survey_version_id;
  v_check := survey.validate_answers(v_ver.definition, v_ver.catalogue_snapshot, coalesce(p_answers, '{}'));
  if jsonb_array_length(v_check -> 'errors') > 0 then
    insert into survey.events (session_id, type, detail) values (v_row.id, 'submit_error', jsonb_build_object('errors', v_check -> 'errors'));
    raise exception 'validation-failed' using errcode = 'P0001', detail = (v_check -> 'errors')::text;
  end if;
  a := v_check -> 'answers';

  select * into v_channel from public.service_channels where code = a ->> 'channel';
  select * into v_product from public.insurance_products where code = a ->> 'product';
  select * into v_factor from public.improvement_factors where code = a ->> 'factor';
  select q into v_branch_q from jsonb_array_elements(v_ver.definition -> 'pages') p, jsonb_array_elements(p -> 'questions') q
   where q ->> 'id' = 'branch';
  if a ? 'branch' and a ->> 'branch' = 'OTHER' then
    v_branch_status := 'other';
  elsif a ? 'branch' then
    v_branch_status := 'selected';
    select * into v_branch from public.branches where code = a ->> 'branch';
  elsif v_branch_q is null or (v_branch_q ? 'visible_when'
        and not survey.truthy(survey.eval_rule(v_ver.definition, v_ver.catalogue_snapshot, a, v_branch_q -> 'visible_when'))) then
    v_branch_status := 'not_applicable';
  else
    v_branch_status := 'not_provided';
  end if;

  insert into survey.reference_counters as c (year, last) values (v_year, 1)
  on conflict (year) do update set last = c.last + 1
  returning last into v_n;
  v_ref := 'FB-' || v_year || '-' || lpad(v_n::text, 6, '0');

  insert into survey.responses (
    reference, session_id, survey_version_id, source_id, qr_point_id, service_channel_id, service_channel_other_text,
    branch_status, issuing_branch_id, issuing_branch_other_text, region_id_at_submission, insurance_product_id,
    insurance_product_other_text, csat_score, ces_score, nps_score, improvement_factor_id, improvement_other_text,
    comment, contact_consent, verification, opened_at, interactive_at, completion_duration_ms, duration_from_opened,
    navigated_back, changed_previous_answer)
  values (
    v_ref, v_row.id, v_ver.id, v_row.source_id, v_row.qr_point_id, v_channel.id, a ->> 'channel_other',
    v_branch_status, v_branch.id, case when v_branch_status = 'other' then a ->> 'branch_other' end, v_branch.region_id,
    v_product.id, a ->> 'product_other', (a ->> 'csat')::smallint, (a ->> 'ces')::smallint, (a ->> 'nps')::smallint,
    v_factor.id, a ->> 'factor_other', a ->> 'comment', coalesce((a ->> 'contact_consent')::boolean, false),
    p_verification, v_row.opened_at, v_row.interactive_at,
    (extract(epoch from (now() - coalesce(v_row.interactive_at, v_row.opened_at))) * 1000)::int,
    v_row.interactive_at is null, v_row.navigated_back, v_row.changed_previous_answer)
  returning id into v_resp_id;

  if coalesce((a ->> 'contact_consent')::boolean, false) and a ? 'phone' then
    select * into v_enc from pii.encrypt_contact(a ->> 'phone', a ->> 'first_name');
    insert into pii.contact_requests (response_id, phone_e164_enc, phone_hmac, first_name_enc, dek_enc, consent_text_version)
    values (v_resp_id, v_enc.phone_enc, app.hmac('phone:' || (a ->> 'phone')), v_enc.first_name_enc, v_enc.dek_enc, 'v1');
    v_masked := pii.mask_phone(a ->> 'phone');
  end if;

  insert into survey.response_device_cooldowns (device_id_hash, last_submitted_at, response_id)
  values (v_row.device_id_hash, now(), v_resp_id)
  on conflict (device_id_hash) do update set last_submitted_at = excluded.last_submitted_at, response_id = excluded.response_id;

  update survey.sessions
     set status = 'submitted', submit_idempotency_key = p_idempotency_key, draft_answers = '{}', last_activity_at = now(),
         current_page = 5, max_page_reached = 5,
         turnstile_passed_at = case when p_verification = 'verified' then now() end
   where id = v_row.id;
  insert into survey.events (session_id, type, page) values (v_row.id, 'submit_success', 5);
  perform pgmq.send('events', jsonb_build_object('type', 'response.submitted', 'response_id', v_resp_id));
  return jsonb_build_object('reference', v_ref, 'contact_masked', v_masked);
end;
$$;

revoke all on function public.survey_start_session(text, text, text, text, text), public.survey_save_draft(text, int, int, jsonb),
  public.survey_log_events(text, jsonb), public.survey_submit(text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.survey_start_session(text, text, text, text, text), public.survey_save_draft(text, int, int, jsonb),
  public.survey_log_events(text, jsonb), public.survey_submit(text, uuid, jsonb, text) to service_role;
grant usage on schema survey, pii to service_role;

-- ---------------------------------------------------------------------------
-- Session expiry sweep and retention (D-16)
-- ---------------------------------------------------------------------------
create or replace function survey.expire_sessions()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update survey.sessions set status = 'expired', abandoned_at_page = current_page
   where status = 'active'
     and last_activity_at < now() - make_interval(hours => survey.setting_int('session_expiry_hours', 24));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function survey.retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sessions int;
  v_cooldowns int;
  v_events int;
begin
  delete from survey.sessions s where s.status <> 'submitted' and s.last_activity_at < now() - interval '30 days';
  get diagnostics v_sessions = row_count;
  delete from survey.response_device_cooldowns where last_submitted_at < now() - interval '30 days';
  get diagnostics v_cooldowns = row_count;
  delete from survey.events where server_ts < now() - interval '13 months';
  get diagnostics v_events = row_count;
  return jsonb_build_object('sessions', v_sessions, 'cooldowns', v_cooldowns, 'events', v_events);
end;
$$;
revoke all on function survey.expire_sessions(), survey.retention_purge() from public, anon, authenticated;
select cron.schedule('survey-expire-sessions', '*/15 * * * *', 'select survey.expire_sessions()');
