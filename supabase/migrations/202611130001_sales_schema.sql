-- Online sales (docs/sales/architecture.md): schema `sales`, the Underwriter role and the sales
-- permissions, tables, numbering, lifecycle guards and RLS for staff reads.
--
-- Customers never touch these tables. The site Worker calls the SECURITY DEFINER functions in
-- 202611130003 (service_role only) with the customer id it resolved from the session cookie;
-- staff read through the security_invoker views in 202611130004 (RLS below) and act through the
-- audited staff_* functions. Nothing grants INSERT/UPDATE/DELETE on these tables to anon or
-- authenticated.

create schema if not exists sales;
comment on schema sales is
  'Online sales: customers, proposals, files, payments, policies. Not exposed through the Data API; '
  'customers reach it only through the Worker''s account_* functions, staff through public.sales_* views and staff_* RPCs.';
revoke all on schema sales from public, anon;
-- Usage only, so the public.sales_* security_invoker views resolve; every table has RLS.
grant usage on schema sales to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Role and permissions (architecture.md › Access)
-- ---------------------------------------------------------------------------
insert into public.roles (key, name, description, scope) values
  ('underwriter', 'Underwriter', 'Reviews and prices proposals, issues and manages policies.', 'organisation');

insert into public.permissions (key, description) values
  ('customers.view', 'View customer records and KYC documents'),
  ('proposals.view', 'View proposals, attachments and documents'),
  ('proposals.review', 'Price proposals, request information, decline or cancel them'),
  ('policies.view', 'View policies, certificates and payments'),
  ('policies.manage', 'Cancel a policy'),
  ('products.manage', 'Manage rates, sales settings and the certificate signature image');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from (values
  ('executive', array['customers.view', 'proposals.view', 'proposals.review', 'policies.view', 'policies.manage',
                      'products.manage']),
  ('system_admin', array['customers.view', 'proposals.view', 'policies.view', 'products.manage']),
  ('underwriter', array['customers.view', 'proposals.view', 'proposals.review', 'policies.view', 'policies.manage']),
  ('cx_admin', array['customers.view', 'proposals.view', 'policies.view']),
  ('auditor', array['customers.view', 'proposals.view', 'policies.view'])
) as m(role_key, perms)
join public.roles r on r.key = m.role_key
cross join lateral unnest(m.perms) as p(key);

-- ---------------------------------------------------------------------------
-- Numbering helpers (architecture.md › Number formats)
-- ---------------------------------------------------------------------------
create sequence sales.customer_no_seq start 10001;   -- USR10001 …: never collides with the legacy portal
create sequence sales.proposal_no_seq start 1;       -- PRP-26-000001
create sequence sales.policy_no_seq start 10001;     -- SE26MTP10001-E
create sequence sales.certificate_no_seq start 1;    -- C01-26-00001

-- Zero-padded to at least p_width digits; never truncates (lpad would).
create or replace function sales.pad(p_n bigint, p_width int)
returns text
language sql
immutable
set search_path = ''
as $$ select case when length(p_n::text) >= p_width then p_n::text else lpad(p_n::text, p_width, '0') end $$;

-- Two-digit year in Africa/Accra (= UTC).
create or replace function sales.yy(p_at timestamptz default now())
returns text
language sql
stable
set search_path = ''
as $$ select to_char(p_at at time zone 'Africa/Accra', 'YY') $$;

create or replace function sales.next_proposal_no()
returns text
language sql
volatile
set search_path = ''
as $$ select 'PRP-' || sales.yy() || '-' || sales.pad(nextval('sales.proposal_no_seq'), 6) $$;

-- Upper-case letters and digits only: compares registration marks and numbers however they are typed.
create or replace function sales.norm_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9]', '', 'g') $$;

-- ---------------------------------------------------------------------------
-- Customers and sign-in
-- ---------------------------------------------------------------------------
create table sales.customers (
  id                    uuid primary key default gen_random_uuid(),
  customer_no           text not null unique default ('USR' || nextval('sales.customer_no_seq')::text)
                          check (customer_no ~ '^USR[0-9]{5,}$'),
  phone_e164            text not null unique check (phone_e164 ~ '^\+233[0-9]{9}$'),
  title                 text check (length(title) <= 20),
  full_name             text check (length(full_name) <= 120),
  date_of_birth         date,
  gender                text check (length(gender) <= 20),
  email                 text check (length(email) <= 254),
  postal_address        text check (length(postal_address) <= 300),
  residential_address   text check (length(residential_address) <= 300),
  digital_address       text check (length(digital_address) <= 20),
  occupation            text check (length(occupation) <= 120),
  employer              text check (length(employer) <= 120),
  id_type               text check (length(id_type) <= 40),
  id_number             text check (length(id_number) <= 40),
  nationality           text check (length(nationality) <= 60),
  tin                   text check (length(tin) <= 20),
  company_name          text check (length(company_name) <= 160),
  company_reg_no        text check (length(company_reg_no) <= 40),
  -- Data Protection Act 2012 (Act 843): separate, timestamped consents.
  marketing_consent     boolean not null default false,
  marketing_consent_at  timestamptz,
  data_consent_at       timestamptz,
  status                text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  -- L.I. 2523 (in force 2 Nov 2026): no Ghana Card images are requested or kept. Identity is
  -- checked biometrically with NIA from the live face photo (file kind id_selfie) and the card number.
  identity_status       text not null default 'unverified'
                          check (identity_status in ('unverified', 'pending', 'verified', 'mismatch')),
  identity_checked_by   uuid references public.profiles (user_id),
  identity_checked_at   timestamptz,
  identity_note         text check (length(identity_note) <= 1000),
  identity_reference    text check (length(identity_reference) <= 80),  -- NIA transaction reference
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  last_sign_in_at       timestamptz
);
comment on table sales.customers is 'Online customers, identified by their OTP-verified phone number (architecture.md › Data model).';
create trigger customers_touch before update on sales.customers for each row execute function app.touch_row();

create table sales.otp_challenges (
  id           uuid primary key,
  phone_e164   text not null check (phone_e164 ~ '^\+233[0-9]{9}$'),
  -- HMAC-SHA256(SURVEY_HMAC_KEY, 'account-otp:' || id || ':' || code), hex. The code itself is never stored.
  code_hmac    text not null check (code_hmac ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz not null,
  attempts     int not null default 0 check (attempts between 0 and 5),
  consumed_at  timestamptz,
  ip_hash      text check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now()
);
comment on table sales.otp_challenges is 'One-time sign-in codes (HMAC only); 5 minutes, 5 attempts; purged after 24 h.';
create index otp_challenges_phone_idx on sales.otp_challenges (phone_e164, created_at desc);
create index otp_challenges_ip_idx on sales.otp_challenges (ip_hash, created_at desc) where ip_hash is not null;
create index otp_challenges_created_idx on sales.otp_challenges (created_at);

create table sales.customer_sessions (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references sales.customers (id) on delete cascade,
  -- SHA-256 of the 32-byte cookie token, hex. The token itself is never stored.
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  user_agent    text check (length(user_agent) <= 300),
  check (expires_at <= created_at + interval '30 days')
);
comment on table sales.customer_sessions is 'Customer sessions: 30 days absolute, 7 days idle; sign-out deletes the row.';
create index customer_sessions_customer_idx on sales.customer_sessions (customer_id);
create index customer_sessions_expiry_idx on sales.customer_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Proposals
-- ---------------------------------------------------------------------------
create or replace function sales.next_statuses(p_status text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  -- architecture.md › Proposal lifecycle. Staying in the same status (a re-quote) is always allowed.
  select case p_status
    when 'draft'          then array['submitted', 'cancelled']
    when 'submitted'      then array['under_review', 'quoted', 'info_requested', 'declined', 'cancelled']
    when 'under_review'   then array['quoted', 'info_requested', 'declined', 'cancelled']
    when 'info_requested' then array['submitted', 'declined', 'cancelled']
    when 'quoted'         then array['paid', 'expired', 'declined', 'cancelled']
    when 'expired'        then array['quoted', 'declined', 'cancelled']
    when 'paid'           then array['issued']
    else array[]::text[]   -- issued, declined, cancelled are final
  end
$$;

create table sales.proposals (
  id               uuid primary key default gen_random_uuid(),
  proposal_no      text not null unique default sales.next_proposal_no() check (proposal_no ~ '^PRP-[0-9]{2}-[0-9]{6,}$'),
  customer_id      uuid not null references sales.customers (id),
  product_code     text not null check (product_code ~ '^[A-Z]{3}$'),
  form_id          text not null check (form_id ~ '^[a-z0-9-]{1,60}$'),
  form_version     int not null check (form_version >= 1),
  status           text not null default 'draft'
                     check (status in ('draft', 'submitted', 'under_review', 'info_requested', 'quoted', 'declined',
                                       'paid', 'issued', 'cancelled', 'expired')),
  answers          jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  current_step     int not null default 0 check (current_step between 0 and 50),
  quote            jsonb check (quote is null or jsonb_typeof(quote) = 'object'),
  premium          numeric(14, 2) check (premium >= 0),
  sum_insured      numeric(16, 2) check (sum_insured >= 0),
  cover_start      date,
  cover_end        date,
  insured_subject  text check (length(insured_subject) <= 200),
  confirmations    text[] not null default '{}',
  -- method, signedName, signedAt, clientSignedAt, ip, userAgent, answersSha256, imagePath
  signature        jsonb check (signature is null or jsonb_typeof(signature) = 'object'),
  -- Why online rating referred the proposal to an underwriter (empty when it was priced or never rated).
  refer_reasons    text[] not null default '{}',
  submitted_at     timestamptz,
  reviewed_by      uuid references public.profiles (user_id),
  reviewed_at      timestamptz,
  staff_message    text check (length(staff_message) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (cover_end is null or cover_start is null or cover_end >= cover_start),
  check (status in ('draft', 'cancelled') or (submitted_at is not null and signature is not null)),
  check (status not in ('quoted', 'paid', 'issued') or quote is not null)
);
comment on table sales.proposals is 'Proposal forms filled online. Answers are frozen once submitted, except while info_requested.';
create index proposals_customer_idx on sales.proposals (customer_id, updated_at desc);
create index proposals_queue_idx on sales.proposals (status, submitted_at);

create or replace function sales.proposals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A proposal starts as a draft.' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.proposal_no <> old.proposal_no or new.customer_id <> old.customer_id
     or new.product_code <> old.product_code or new.created_at <> old.created_at then
    raise exception 'A proposal''s number, customer and product never change.' using errcode = '42501';
  end if;
  if old.status not in ('draft', 'info_requested')
     and (new.answers is distinct from old.answers
          or new.confirmations is distinct from old.confirmations
          or new.signature is distinct from old.signature
          or new.form_id is distinct from old.form_id
          or new.form_version is distinct from old.form_version) then
    raise exception 'The answers of a submitted proposal cannot be changed.'
      using errcode = '42501', detail = 'proposal_frozen';
  end if;
  if new.status <> old.status and not (new.status = any (sales.next_statuses(old.status))) then
    raise exception 'A proposal cannot move from % to %.', old.status, new.status
      using errcode = '23514', detail = 'invalid_transition';
  end if;
  return new;
end;
$$;
create trigger proposals_guard before insert or update on sales.proposals
  for each row execute function sales.proposals_guard();
create trigger proposals_touch before update on sales.proposals for each row execute function app.touch_row();

-- Append-only history shown to the customer and to staff.
create table sales.proposal_events (
  id           bigint generated always as identity primary key,
  proposal_id  uuid not null references sales.proposals (id),
  at           timestamptz not null default now(),
  actor_type   text not null check (actor_type in ('customer', 'staff', 'system')),
  actor_id     uuid,
  -- Staff display name at the time (customers see "Serene Insurance" instead).
  actor_name   text check (length(actor_name) <= 120),
  event        text not null check (event ~ '^[a-z_]{1,40}$'),
  from_status  text,
  to_status    text,
  note         text check (length(note) <= 2000)
);
comment on table sales.proposal_events is 'Proposal history: status changes, who and when, with the note. Append-only.';
create index proposal_events_proposal_idx on sales.proposal_events (proposal_id, id);

create or replace function sales.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only.', tg_table_name using errcode = '42501';
end;
$$;
create trigger proposal_events_append_only before update or delete on sales.proposal_events
  for each row execute function sales.reject_change();

create table sales.proposal_files (
  id             uuid primary key,
  proposal_id    uuid not null references sales.proposals (id),
  customer_id    uuid not null references sales.customers (id),
  field_id       text not null check (field_id ~ '^[a-z0-9_]{1,80}$'),
  -- L.I. 2523: Ghana Card images are never accepted.
  kind           text not null check (kind ~ '^[a-z0-9_]{1,60}$' and kind not in ('id_front', 'id_back', 'ghana_card')),
  storage_path   text not null unique,
  mime           text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  size           int not null check (size between 1 and 10485760),
  original_name  text not null check (length(original_name) between 1 and 200),
  sha256         text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at     timestamptz not null default now(),
  check (storage_path like customer_id::text || '/' || proposal_id::text || '/' || id::text || '.%')
);
comment on table sales.proposal_files is 'Photos and documents attached to proposals; objects in bucket customer-files.';
create index proposal_files_proposal_idx on sales.proposal_files (proposal_id, created_at);
create index proposal_files_customer_idx on sales.proposal_files (customer_id);

-- ---------------------------------------------------------------------------
-- Payments and policies
-- ---------------------------------------------------------------------------
create table sales.payments (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique check (reference ~ '^PAY-[A-Z0-9]{10}$'),
  proposal_id     uuid not null references sales.proposals (id),
  customer_id     uuid not null references sales.customers (id),
  amount          numeric(14, 2) not null check (amount > 0),
  method          text not null check (method in ('momo', 'card')),
  network         text check (network in ('mtn', 'telecel', 'airteltigo')),
  -- Masked only ("024 *** 4567", "•••• 4242"); full numbers are never stored.
  masked_account  text not null check (length(masked_account) between 4 and 40),
  provider        text not null default 'simulated' check (provider in ('simulated')),
  -- Gateway state that is not card data (the simulated gateway's test outcome).
  provider_data   jsonb not null default '{}' check (jsonb_typeof(provider_data) = 'object'),
  status          text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  failure_reason  text check (length(failure_reason) <= 200),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  check ((method = 'momo') = (network is not null)),
  check ((status = 'pending') = (completed_at is null))
);
comment on table sales.payments is 'Premium payments. At most one succeeds per proposal.';
create unique index payments_one_success_uq on sales.payments (proposal_id) where status = 'succeeded';
create index payments_customer_idx on sales.payments (customer_id, created_at desc);
create index payments_proposal_idx on sales.payments (proposal_id);

create or replace function sales.payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.reference <> old.reference or new.proposal_id <> old.proposal_id
     or new.customer_id <> old.customer_id or new.amount <> old.amount or new.method <> old.method
     or new.masked_account <> old.masked_account or new.created_at <> old.created_at then
    raise exception 'A payment''s reference, amount and account never change.' using errcode = '42501';
  end if;
  if old.status <> 'pending' and to_jsonb(new) <> to_jsonb(old) then
    raise exception 'A completed payment cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger payments_guard before update on sales.payments for each row execute function sales.payments_guard();

-- Numbers handed out when a payment is approved, before the Worker builds the certificate; the
-- same numbers are reused if issuing is retried, so a retry never skips numbers.
create table sales.issue_reservations (
  payment_id      uuid primary key references sales.payments (id),
  policy_no       text not null unique,
  certificate_no  text not null unique,
  starts_on       date not null,
  expires_on      date not null,
  issued_at       timestamptz not null,
  created_at      timestamptz not null default now()
);
comment on table sales.issue_reservations is 'Policy and certificate numbers reserved for an approved payment.';

create table sales.policies (
  id               uuid primary key default gen_random_uuid(),
  policy_no        text not null unique check (policy_no ~ '^SE[0-9]{2}[A-Z]{3}[0-9]{5,}-E$'),
  certificate_no   text not null unique check (certificate_no ~ '^C[0-9]{2}-[0-9]{2}-[0-9]{5,}$'),
  customer_id      uuid not null references sales.customers (id),
  proposal_id      uuid not null unique references sales.proposals (id),
  payment_id       uuid not null unique references sales.payments (id),
  product_code     text not null check (product_code ~ '^[A-Z]{3}$'),
  cover_title      text not null check (length(cover_title) between 1 and 120),
  insured_subject  text check (length(insured_subject) <= 200),
  starts_on        date not null,
  expires_on       date not null,
  premium          numeric(14, 2) not null check (premium >= 0),
  sum_insured      numeric(16, 2),
  -- CertificateData snapshot (packages/proposals), immutable: re-rendering gives the same certificate.
  certificate      jsonb not null check (jsonb_typeof(certificate) = 'object'),
  status           text not null default 'active' check (status in ('active', 'cancelled')),
  issued_at        timestamptz not null,
  cancelled_at     timestamptz,
  cancelled_by     uuid references public.profiles (user_id),
  cancel_reason    text check (length(cancel_reason) <= 500),
  updated_at       timestamptz not null default now(),
  check (expires_on >= starts_on),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
comment on table sales.policies is 'Issued policies with their certificate snapshot. "expired" is derived from expires_on.';
create index policies_customer_idx on sales.policies (customer_id, issued_at desc);

create or replace function sales.policies_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at'])
     <> (to_jsonb(old) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at']) then
    raise exception 'An issued policy and its certificate never change.' using errcode = '42501';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'A cancelled policy cannot be reinstated.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger policies_guard before update on sales.policies for each row execute function sales.policies_guard();
create trigger policies_touch before update on sales.policies for each row execute function app.touch_row();
create trigger policies_no_delete before delete on sales.policies for each row execute function sales.reject_change();
create trigger payments_no_delete before delete on sales.payments for each row execute function sales.reject_change();

-- ---------------------------------------------------------------------------
-- RLS: staff read with the sales permissions; nobody writes except through the functions.
-- ---------------------------------------------------------------------------
alter table sales.customers enable row level security;
alter table sales.otp_challenges enable row level security;
alter table sales.customer_sessions enable row level security;
alter table sales.proposals enable row level security;
alter table sales.proposal_events enable row level security;
alter table sales.proposal_files enable row level security;
alter table sales.payments enable row level security;
alter table sales.issue_reservations enable row level security;
alter table sales.policies enable row level security;

create policy customers_staff_read on sales.customers for select to authenticated
  using ((select app.has_perm('customers.view')));
create policy proposals_staff_read on sales.proposals for select to authenticated
  using ((select app.has_perm('proposals.view')));
create policy proposal_events_staff_read on sales.proposal_events for select to authenticated
  using ((select app.has_perm('proposals.view')));
create policy proposal_files_staff_read on sales.proposal_files for select to authenticated
  using ((select app.has_perm('proposals.view')) or (select app.has_perm('customers.view')));
create policy payments_staff_read on sales.payments for select to authenticated
  using ((select app.has_perm('policies.view')));
create policy policies_staff_read on sales.policies for select to authenticated
  using ((select app.has_perm('policies.view')));
-- otp_challenges, customer_sessions, issue_reservations: no policy at all (functions only).

revoke all on all tables in schema sales from public, anon, authenticated;
revoke all on all sequences in schema sales from public, anon, authenticated;
grant select on sales.customers, sales.proposals, sales.proposal_events, sales.proposal_files, sales.payments,
  sales.policies to authenticated;
revoke all on all functions in schema sales from public, anon, authenticated;
-- Used inside RLS-checked views and column defaults evaluated as the caller.
grant execute on function sales.pad(bigint, int), sales.yy(timestamptz), sales.norm_key(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings (public.settings; architecture.md › Settings keys)
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description) values
  ('sales_rates', '{"version": 1}', 'Indicative rate tables for instant products (RateTables JSON). Edited in Products & rates.'),
  ('sales_tppd_limit', '8000', 'Third-party property damage limit printed on motor certificates, GH₵.'),
  ('sales_sms_mode', '"simulated"', 'How sign-in codes are sent: "simulated" (shown on screen, test mode) or "arkesel".'),
  ('sales_sms_sender_id', '"Serene"', 'SMS sender ID registered with the SMS provider (up to 11 letters or digits).'),
  ('sales_payment_mode', '"simulated"', 'Payment gateway: "simulated" until a gateway account exists.'),
  ('sales_certificate_series', '"01"', 'Two-digit certificate series for the online channel (C01-26-00001).'),
  ('sales_certificate_signatory_title', '"CHIEF EXECUTIVE OFFICER"', 'Title printed under the certificate signature line.'),
  ('sales_certificate_signature_path', '""',
     'Storage path (bucket customer-files, under settings/) of the signature image an administrator uploaded. Empty: dotted line only.'),
  ('sales_quote_validity_days', '30', 'Days a quote stays valid before it expires.')
on conflict (key) do nothing;

create or replace function app.sales_settings_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v jsonb := new.value;
  v_text text := case when jsonb_typeof(new.value) = 'string' then new.value #>> '{}' end;
begin
  case new.key
    when 'sales_rates' then
      if jsonb_typeof(v) <> 'object' or jsonb_typeof(v -> 'version') <> 'number' then
        raise exception 'The rate tables must be a JSON object with a version number.' using errcode = '22023';
      end if;
    when 'sales_tppd_limit' then
      if not app.setting_int_between(v, 1000, 1000000) then
        raise exception 'Enter a whole number of cedis from 1,000 to 1,000,000.' using errcode = '22023';
      end if;
    when 'sales_sms_mode' then
      if v_text is null or v_text not in ('simulated', 'arkesel') then
        raise exception 'Choose "simulated" or "arkesel".' using errcode = '22023';
      end if;
    when 'sales_sms_sender_id' then
      if v_text is null or v_text !~ '^[A-Za-z0-9][A-Za-z0-9 ]{0,10}$' then
        raise exception 'Use up to 11 letters, digits or spaces.' using errcode = '22023';
      end if;
    when 'sales_payment_mode' then
      if v_text is null or v_text not in ('simulated') then
        raise exception 'Only the simulated payment gateway is available.' using errcode = '22023';
      end if;
    when 'sales_certificate_series' then
      if v_text is null or v_text !~ '^[0-9]{2}$' then
        raise exception 'Enter two digits, for example 01.' using errcode = '22023';
      end if;
    when 'sales_certificate_signatory_title' then
      if v_text is null or length(btrim(v_text)) not between 1 and 80 then
        raise exception 'Enter a title of 1 to 80 characters.' using errcode = '22023';
      end if;
    when 'sales_certificate_signature_path' then
      if v_text is null or (v_text <> '' and v_text !~ '^settings/[A-Za-z0-9._-]{1,120}\.(png|jpg|jpeg|webp)$') then
        raise exception 'The signature image must be a PNG, JPEG or WebP file under settings/.' using errcode = '22023';
      end if;
    when 'sales_quote_validity_days' then
      if not app.setting_int_between(v, 1, 90) then
        raise exception 'Enter a whole number of days from 1 to 90.' using errcode = '22023';
      end if;
    else
      null;
  end case;
  return new;
end;
$$;
-- Fires after settings_a_validate and before settings_history (name order), so a rejected value leaves no history.
create trigger settings_b_sales_validate before insert or update on public.settings
  for each row execute function app.sales_settings_validate();
