-- MS-03 directory, catalogues and settings (M02, M03, M17 settings).
-- Seeds are COMPANY CONTEXT exactly (SPEC PROJECT CONFIGURATION, D-12, D-14, D-19).
-- Configuration rows are deactivated, never deleted; codes are immutable and never reused.

-- ---------------------------------------------------------------------------
-- Shared guards
-- ---------------------------------------------------------------------------
create or replace function app.code_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'Codes are permanent identifiers and cannot be changed.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function app.stamp_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Regions and branches (M02)
-- ---------------------------------------------------------------------------
create table public.regions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z][A-Z0-9_-]*$'),
  name        text not null check (length(name) between 1 and 80),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  version     int not null default 1
);
comment on table public.regions is 'Ghana administrative regions (D-14, A-93).';

create table public.branches (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z][A-Z0-9_-]*$'),
  name            text not null check (length(name) between 1 and 80),
  region_id       uuid not null references public.regions (id),
  is_head_office  boolean not null default false,
  is_active       boolean not null default true,
  deactivated_at  timestamptz,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  version         int not null default 1,
  check (is_active or deactivated_at is not null)
);
comment on table public.branches is 'Issuing branches (REQ §14.1). Deactivated branches leave the survey but stay in history.';

create table public.branch_region_history (
  id          bigint generated always as identity primary key,
  branch_id   uuid not null references public.branches (id),
  region_id   uuid not null references public.regions (id),
  valid_from  timestamptz not null,
  valid_to    timestamptz,
  changed_by  uuid
);
comment on table public.branch_region_history is 'Effective-dated region membership (A-97). Responses keep region_id_at_submission.';
create index branch_region_history_branch on public.branch_region_history (branch_id, valid_from);

-- Deactivation bookkeeping must run before the CHECK, history after the row exists.
create or replace function app.branch_deactivation_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active is distinct from old.is_active then
    new.deactivated_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;

create or replace function app.branch_region_history_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.branch_region_history (branch_id, region_id, valid_from, changed_by)
    values (new.id, new.region_id, '2000-01-01', auth.uid());
  elsif new.region_id is distinct from old.region_id then
    update public.branch_region_history set valid_to = now()
     where branch_id = new.id and valid_to is null;
    insert into public.branch_region_history (branch_id, region_id, valid_from, changed_by)
    values (new.id, new.region_id, now(), auth.uid());
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalogues (M03)
-- ---------------------------------------------------------------------------
create table public.service_channels (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[A-Z][A-Z0-9_-]*$'),
  label              text not null check (length(label) between 1 and 80),
  branch_requirement text not null check (branch_requirement in ('required', 'optional', 'hidden')),
  allows_other_text  boolean not null default false,
  is_other           boolean not null default false,
  is_active          boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid,
  version            int not null default 1
);
comment on table public.service_channels is 'How the customer obtained the policy (REQ §2.4). branch_requirement drives the branch question (D-12).';
create unique index service_channels_one_other on public.service_channels ((true)) where is_other;

create table public.insurance_products (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[A-Z][A-Z0-9_-]*$'),
  official_name  text not null check (length(official_name) between 1 and 120),
  label          text not null check (length(label) between 1 and 80),
  is_other       boolean not null default false,
  is_active      boolean not null default true,
  show_in_survey boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  version        int not null default 1
);
comment on table public.insurance_products is 'Insurance products (COMPANY CONTEXT). label is customer-facing; official_name is internal.';
create unique index insurance_products_one_other on public.insurance_products ((true)) where is_other;

create table public.improvement_factors (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Z][A-Z0-9_-]*$'),
  label            text not null check (length(label) between 1 and 80),
  is_other         boolean not null default false,
  is_none          boolean not null default false,
  flag_on_select   boolean not null default true,
  auto_create_case boolean not null default false,
  default_priority text not null default 'P3' check (default_priority in ('P1', 'P2', 'P3', 'P4')),
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  version          int not null default 1,
  -- "Nothing, I am satisfied" never flags or opens a case (D-19).
  check (not is_none or (not flag_on_select and not auto_create_case)),
  check (not (is_none and is_other))
);
comment on table public.improvement_factors is 'Page 5 improvement factors (REQ §2.8) with Flag / Auto-create case toggles (D-19).';
create unique index improvement_factors_one_other on public.improvement_factors ((true)) where is_other;
create unique index improvement_factors_one_none on public.improvement_factors ((true)) where is_none;

create table public.case_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z][A-Z0-9_-]*$'),
  label       text not null check (length(label) between 1 and 80),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  version     int not null default 1
);
comment on table public.case_categories is 'Case categories (A-71).';

-- Working calendar (D-18): Mon–Fri 08:00–17:00 Africa/Accra; holidays maintained by System Admin.
create table public.holidays (
  id                 uuid primary key default gen_random_uuid(),
  holiday_date       date not null unique,
  name               text not null check (length(name) between 1 and 80),
  needs_confirmation boolean not null default false,
  created_at         timestamptz not null default now(),
  created_by         uuid
);
comment on table public.holidays is 'Ghana public holidays excluded from SLA clocks (D-18, A-134, A-151). needs_confirmation marks dates fixed by later announcement (e.g. Eid).';

-- ---------------------------------------------------------------------------
-- Triggers: timestamps/version, actor stamps, code immutability, audit
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['regions', 'branches', 'service_channels', 'insurance_products',
                           'improvement_factors', 'case_categories'] loop
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function app.touch_row()', t);
    execute format('create trigger %1$s_actor before insert or update on public.%1$I for each row execute function app.stamp_actor()', t);
    execute format('create trigger %1$s_code before update of code on public.%1$I for each row execute function app.code_immutable()', t);
    execute format('create trigger %1$s_audit after insert or update on public.%1$I for each row execute function app.audit_row()', t);
  end loop;
end;
$$;
create trigger departments_code before update of code on public.departments
  for each row execute function app.code_immutable();
create trigger branches_deactivation before update on public.branches
  for each row execute function app.branch_deactivation_stamp();
create trigger branches_region_history after insert or update on public.branches
  for each row execute function app.branch_region_history_after();
create trigger holidays_audit after insert or update or delete on public.holidays
  for each row execute function app.audit_row();

-- System-controlled flags (is_other / is_none) cannot be changed through the Data API.
create or replace function app.catalogue_system_flags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) -> 'is_other') is distinct from (to_jsonb(old) -> 'is_other')
     or (to_jsonb(new) -> 'is_none') is distinct from (to_jsonb(old) -> 'is_none') then
    raise exception '"Other" and "Nothing" options are system-controlled.' using errcode = '22023';
  end if;
  if (to_jsonb(old) ->> 'is_none')::boolean and (new.flag_on_select or new.auto_create_case) then
    raise exception '"Nothing, I am satisfied" never raises a flag or a case.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create or replace function app.catalogue_other_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_other is distinct from old.is_other then
    raise exception '"Other" options are system-controlled.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger improvement_factors_system before update on public.improvement_factors
  for each row execute function app.catalogue_system_flags();
create trigger service_channels_system before update on public.service_channels
  for each row execute function app.catalogue_other_flag();
create trigger insurance_products_system before update on public.insurance_products
  for each row execute function app.catalogue_other_flag();

-- ---------------------------------------------------------------------------
-- RLS: every signed-in user reads; writes need config.directory / config.catalogues.
-- Inserts may not create system "Other"/"Nothing" rows; deletes are never granted.
-- ---------------------------------------------------------------------------
alter table public.regions enable row level security;
alter table public.branches enable row level security;
alter table public.branch_region_history enable row level security;
alter table public.service_channels enable row level security;
alter table public.insurance_products enable row level security;
alter table public.improvement_factors enable row level security;
alter table public.case_categories enable row level security;
alter table public.holidays enable row level security;

create policy regions_read on public.regions for select to authenticated using (true);
create policy regions_insert on public.regions for insert to authenticated
  with check ((select app.has_perm('config.directory')));
create policy regions_update on public.regions for update to authenticated
  using ((select app.has_perm('config.directory'))) with check ((select app.has_perm('config.directory')));

create policy branches_read on public.branches for select to authenticated using (true);
create policy branches_insert on public.branches for insert to authenticated
  with check ((select app.has_perm('config.directory')));
create policy branches_update on public.branches for update to authenticated
  using ((select app.has_perm('config.directory'))) with check ((select app.has_perm('config.directory')));

create policy branch_region_history_read on public.branch_region_history for select to authenticated using (true);

create policy departments_insert on public.departments for insert to authenticated
  with check ((select app.has_perm('config.directory')));
create policy departments_update on public.departments for update to authenticated
  using ((select app.has_perm('config.directory'))) with check ((select app.has_perm('config.directory')));

create policy holidays_read on public.holidays for select to authenticated using (true);
create policy holidays_insert on public.holidays for insert to authenticated
  with check ((select app.has_perm('config.directory')));
create policy holidays_update on public.holidays for update to authenticated
  using ((select app.has_perm('config.directory'))) with check ((select app.has_perm('config.directory')));
create policy holidays_delete on public.holidays for delete to authenticated
  using ((select app.has_perm('config.directory')));

create policy service_channels_read on public.service_channels for select to authenticated using (true);
create policy service_channels_insert on public.service_channels for insert to authenticated
  with check ((select app.has_perm('config.catalogues')) and not is_other);
create policy service_channels_update on public.service_channels for update to authenticated
  using ((select app.has_perm('config.catalogues'))) with check ((select app.has_perm('config.catalogues')));

create policy insurance_products_read on public.insurance_products for select to authenticated using (true);
create policy insurance_products_insert on public.insurance_products for insert to authenticated
  with check ((select app.has_perm('config.catalogues')) and not is_other);
create policy insurance_products_update on public.insurance_products for update to authenticated
  using ((select app.has_perm('config.catalogues'))) with check ((select app.has_perm('config.catalogues')));

create policy improvement_factors_read on public.improvement_factors for select to authenticated using (true);
create policy improvement_factors_insert on public.improvement_factors for insert to authenticated
  with check ((select app.has_perm('config.catalogues')) and not is_other and not is_none);
-- Flag toggles are edited by flags.configure (D-19); labels by config.catalogues.
create policy improvement_factors_update on public.improvement_factors for update to authenticated
  using ((select app.has_perm('config.catalogues')) or (select app.has_perm('flags.configure')))
  with check ((select app.has_perm('config.catalogues')) or (select app.has_perm('flags.configure')));

create policy case_categories_read on public.case_categories for select to authenticated using (true);
create policy case_categories_insert on public.case_categories for insert to authenticated
  with check ((select app.has_perm('config.catalogues')));
create policy case_categories_update on public.case_categories for update to authenticated
  using ((select app.has_perm('config.catalogues'))) with check ((select app.has_perm('config.catalogues')));

revoke all on public.regions, public.branches, public.branch_region_history, public.service_channels,
  public.insurance_products, public.improvement_factors, public.case_categories, public.holidays from anon;
revoke delete, truncate on public.regions, public.branches, public.branch_region_history, public.service_channels,
  public.insurance_products, public.improvement_factors, public.case_categories, public.departments from authenticated;
grant select on public.regions, public.branches, public.branch_region_history, public.service_channels,
  public.insurance_products, public.improvement_factors, public.case_categories, public.holidays to authenticated;
grant insert, update on public.regions, public.branches, public.service_channels, public.insurance_products,
  public.improvement_factors, public.case_categories, public.departments to authenticated;
grant insert, update, delete on public.holidays to authenticated;
revoke insert, update, delete on public.branch_region_history from authenticated;

-- Column guards: only these columns are writable through the Data API.
revoke update on public.improvement_factors from authenticated;
grant update (label, flag_on_select, auto_create_case, default_priority, is_active, sort_order)
  on public.improvement_factors to authenticated;
revoke update on public.service_channels from authenticated;
grant update (label, branch_requirement, allows_other_text, is_active, sort_order) on public.service_channels to authenticated;
revoke update on public.insurance_products from authenticated;
grant update (official_name, label, is_active, show_in_survey, sort_order) on public.insurance_products to authenticated;
revoke update on public.branches from authenticated;
grant update (name, region_id, is_head_office, is_active, sort_order) on public.branches to authenticated;
revoke update on public.regions from authenticated;
grant update (name, is_active, sort_order) on public.regions to authenticated;
revoke update on public.case_categories from authenticated;
grant update (label, is_active, sort_order) on public.case_categories to authenticated;
revoke update on public.departments from authenticated;
grant update (name, head_user_id, is_active) on public.departments to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Reorder any catalogue by passing ids in the new order (S-B17).
create or replace function public.catalogue_reorder(p_catalogue text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perm text := case when p_catalogue in ('regions', 'branches') then 'config.directory' else 'config.catalogues' end;
begin
  if p_catalogue not in ('regions', 'branches', 'service_channels', 'insurance_products', 'improvement_factors',
                         'case_categories') then
    raise exception 'Unknown catalogue %', p_catalogue using errcode = '22023';
  end if;
  perform app.require_perm(v_perm, true);
  execute format(
    'update public.%I t set sort_order = o.ord from unnest($1) with ordinality as o(id, ord) where t.id = o.id',
    p_catalogue) using p_ids;
  perform audit.append('catalogue.reordered', p_catalogue, null, null, to_jsonb(p_ids));
end;
$$;

-- Impact summary before deactivating a branch (M02 UI): active managers and the last 30 days of responses.
-- Responses arrive in MS-06; until then the count is computed against an empty set.
create or replace function public.branch_deactivate(p_branch_id uuid, p_expected_version int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
begin
  perform app.require_perm('config.directory', true);
  select version into v_version from public.branches where id = p_branch_id for update;
  if v_version is null then
    raise exception 'Branch not found.' using errcode = 'P0002';
  end if;
  if v_version <> p_expected_version then
    raise exception 'Someone else changed this branch. Reload and try again.' using errcode = 'P0409';
  end if;
  update public.branches set is_active = false where id = p_branch_id;
end;
$$;

revoke all on function public.catalogue_reorder(text, uuid[]), public.branch_deactivate(uuid, int) from public, anon;
grant execute on function public.catalogue_reorder(text, uuid[]), public.branch_deactivate(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Seeds: COMPANY CONTEXT (authoritative)
-- ---------------------------------------------------------------------------
insert into public.regions (code, name, sort_order) values
  ('GREATER_ACCRA', 'Greater Accra', 1), ('ASHANTI', 'Ashanti', 2), ('CENTRAL', 'Central', 3),
  ('WESTERN', 'Western', 4), ('VOLTA', 'Volta', 5), ('NORTHERN', 'Northern', 6), ('BONO_EAST', 'Bono East', 7);

insert into public.branches (code, name, region_id, is_head_office, sort_order)
select b.code, b.name, r.id, b.code = 'ACC-MAIN', b.ord
from (values
  ('ACC-EAST', 'Accra East', 'GREATER_ACCRA', 1),
  ('ACC-MAIN', 'Accra Main', 'GREATER_ACCRA', 2),
  ('ACC-WEST', 'Accra West', 'GREATER_ACCRA', 3),
  ('HO', 'Ho', 'VOLTA', 4),
  ('KASOA', 'Kasoa', 'CENTRAL', 5),
  ('KSI-MAIN', 'Kumasi Main', 'ASHANTI', 6),
  ('KSI-NORTH', 'Kumasi North (Suame)', 'ASHANTI', 7),
  ('LAPAZ', 'Lapaz', 'GREATER_ACCRA', 8),
  ('TAKORADI', 'Takoradi', 'WESTERN', 9),
  ('TAMALE', 'Tamale', 'NORTHERN', 10),
  ('TECHIMAN', 'Techiman', 'BONO_EAST', 11),
  ('TEMA-C11', 'Tema Community 11', 'GREATER_ACCRA', 12),
  ('TEMA-C25', 'Tema Community 25', 'GREATER_ACCRA', 13)
) as b(code, name, region_code, ord)
join public.regions r on r.code = b.region_code;

insert into public.service_channels (code, label, branch_requirement, allows_other_text, is_other, sort_order) values
  ('MOBILE_APP', 'Mobile application', 'hidden', false, false, 1),
  ('WEBSITE', 'Company website', 'hidden', false, false, 2),
  ('WALK_IN', 'Walk-in at a branch office', 'required', false, false, 3),
  ('PHONE', 'Telephone / call centre', 'hidden', false, false, 4),
  ('WHATSAPP', 'WhatsApp', 'hidden', false, false, 5),
  ('AGENT_BROKER', 'Insurance agent / broker', 'hidden', false, false, 6),
  ('OTHER', 'Other', 'optional', true, true, 7);

insert into public.insurance_products (code, official_name, label, is_other, sort_order) values
  ('MOTOR', 'Motor Insurance', 'Motor insurance', false, 1),
  ('FIRE', 'Fire and Allied Perils', 'Fire & property insurance', false, 2),
  ('MARINE', 'Marine Insurance Policy', 'Marine insurance', false, 3),
  ('TRAVEL', 'Foreign Travel Insurance Policy', 'Travel insurance', false, 4),
  ('GEN-ACC', 'General Accident', 'General accident insurance', false, 5),
  ('ENGINEERING', 'Engineering Policies', 'Engineering insurance', false, 6),
  ('WORKMEN', 'Employers'' Workmen''s Compensation', 'Workmen''s compensation', false, 7),
  ('BONDS', 'Bonds', 'Bonds (e.g. bid or performance bond)', false, 8),
  ('OTHER', 'Other', 'Other', true, 9);

insert into public.improvement_factors (code, label, is_other, is_none, flag_on_select, auto_create_case, sort_order) values
  ('SPEED', 'Speed of service', false, false, true, false, 1),
  ('STAFF', 'Staff professionalism', false, false, true, false, 2),
  ('COMMS', 'Communication and information', false, false, true, false, 3),
  ('EASE', 'Ease of the process', false, false, true, false, 4),
  ('TECH', 'Technical issues', false, false, true, false, 5),
  ('PRICE', 'Pricing and charges', false, false, true, false, 6),
  ('OTHER', 'Other', true, false, true, false, 7),
  ('NONE', 'Nothing, I am satisfied', false, true, false, false, 8);

insert into public.case_categories (code, label, sort_order) values
  ('SPEED', 'Speed of service', 1), ('STAFF', 'Staff professionalism', 2),
  ('COMMS', 'Communication and information', 3), ('EASE', 'Ease of the process', 4),
  ('TECH', 'Technical issues', 5), ('PRICE', 'Pricing and charges', 6),
  ('SERVICE_COMPLAINT', 'Service complaint', 7), ('DATA_PRIVACY', 'Data/privacy concern', 8),
  ('OTHER', 'Other', 9);

-- Ghana public holidays 2026–2027 (Public Holidays and Commemorative Days Act as amended in 2025).
-- Moveable Islamic holidays are estimates until announced and carry needs_confirmation (A-151).
insert into public.holidays (holiday_date, name, needs_confirmation) values
  ('2026-01-01', 'New Year''s Day', false), ('2026-01-07', 'Constitution Day', false),
  ('2026-03-06', 'Independence Day', false), ('2026-03-20', 'Eid al-Fitr (estimated)', true),
  ('2026-04-03', 'Good Friday', false), ('2026-04-06', 'Easter Monday', false),
  ('2026-05-01', 'May Day', false), ('2026-05-27', 'Eid al-Adha (estimated)', true),
  ('2026-07-01', 'Republic Day', false), ('2026-08-04', 'Founders'' Day', false),
  ('2026-09-21', 'Kwame Nkrumah Memorial Day', false), ('2026-12-04', 'Farmers'' Day', false),
  ('2026-12-25', 'Christmas Day', false), ('2026-12-26', 'Boxing Day', false),
  ('2027-01-01', 'New Year''s Day', false), ('2027-01-07', 'Constitution Day', false),
  ('2027-03-06', 'Independence Day', false), ('2027-03-10', 'Eid al-Fitr (estimated)', true),
  ('2027-03-26', 'Good Friday', false), ('2027-03-29', 'Easter Monday', false),
  ('2027-05-01', 'May Day', false), ('2027-05-17', 'Eid al-Adha (estimated)', true),
  ('2027-07-01', 'Republic Day', false), ('2027-08-04', 'Founders'' Day', false),
  ('2027-09-21', 'Kwame Nkrumah Memorial Day', false), ('2027-12-03', 'Farmers'' Day', false),
  ('2027-12-25', 'Christmas Day', false), ('2027-12-26', 'Boxing Day', false);

-- Settings added for later milestones (M17).
insert into public.settings (key, value, description) values
  ('support_phone', '""', 'Customer support phone shown in the privacy notice (M16).'),
  ('support_email', '""', 'Customer support email shown in the privacy notice (M16).'),
  ('data_protection_contact', '""', 'Data-protection contact shown in the privacy notice (M16).'),
  ('dpc_registration_number', '""', 'Data Protection Commission registration number (M16).'),
  ('include_unverified_default', 'false', 'Whether dashboards include unverified responses by default (A-135).')
on conflict (key) do nothing;
