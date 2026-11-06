-- Online sales: the functions the site Worker calls with the service key (service_role only).
--
-- Every customer-facing function takes the customer id the Worker resolved from the session cookie
-- (account_session_resolve) and only ever touches rows of that customer, so one customer can never
-- read or change another's records: a foreign id behaves exactly like a missing one ('not-found').
--
-- Business outcomes the Worker must tell apart are raised as P0001 with a short machine message
-- ('not-found', 'not-editable', …), which PostgREST passes through (src/supabase.ts). Outcomes that
-- must persist a write (a wrong code counts an attempt) are returned as { ok: false, error } instead
-- of raised, because raising would roll the write back.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function sales.strip_top(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  -- Drops top-level null members only (jsonb_strip_nulls would also strip nulls inside answers).
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p) e where e.value <> 'null'::jsonb
$$;

create or replace function sales.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::int end
                     from public.settings where key = p_key), p_default)
$$;

create or replace function sales.setting_text(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select case when jsonb_typeof(value) = 'string' then value #>> '{}' end
                     from public.settings where key = p_key), p_default)
$$;

create or replace function sales.profile_json(c sales.customers)
returns jsonb
language sql
stable
set search_path = ''
as $$
  -- CustomerProfile (packages/proposals/src/api.ts). Identity-check fields are staff-only.
  select sales.strip_top(jsonb_build_object(
    'customerNo', c.customer_no, 'phone', c.phone_e164, 'title', c.title, 'fullName', c.full_name,
    'dateOfBirth', c.date_of_birth, 'gender', c.gender, 'email', c.email, 'postalAddress', c.postal_address,
    'residentialAddress', c.residential_address, 'digitalAddress', c.digital_address,
    'occupation', c.occupation, 'employer', c.employer, 'idType', c.id_type, 'idNumber', c.id_number,
    'nationality', c.nationality, 'tin', c.tin, 'companyName', c.company_name,
    'companyRegNo', c.company_reg_no, 'marketingConsent', c.marketing_consent, 'createdAt', c.created_at))
$$;

-- Applies the CustomerProfile keys present in p (unknown keys are ignored; '' clears a value).
create or replace function sales.apply_profile(p_customer_id uuid, p jsonb)
returns sales.customers
language plpgsql
set search_path = ''
as $$
declare
  v sales.customers;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    select * into v from sales.customers where id = p_customer_id;
    return v;
  end if;
  update sales.customers c set
    title = case when p ? 'title' then nullif(btrim(p ->> 'title'), '') else c.title end,
    full_name = case when p ? 'fullName' then nullif(btrim(p ->> 'fullName'), '') else c.full_name end,
    date_of_birth = case when p ? 'dateOfBirth' then nullif(btrim(p ->> 'dateOfBirth'), '')::date else c.date_of_birth end,
    gender = case when p ? 'gender' then nullif(btrim(p ->> 'gender'), '') else c.gender end,
    email = case when p ? 'email' then nullif(lower(btrim(p ->> 'email')), '') else c.email end,
    postal_address = case when p ? 'postalAddress' then nullif(btrim(p ->> 'postalAddress'), '') else c.postal_address end,
    residential_address = case when p ? 'residentialAddress' then nullif(btrim(p ->> 'residentialAddress'), '')
                               else c.residential_address end,
    digital_address = case when p ? 'digitalAddress' then nullif(upper(btrim(p ->> 'digitalAddress')), '')
                           else c.digital_address end,
    occupation = case when p ? 'occupation' then nullif(btrim(p ->> 'occupation'), '') else c.occupation end,
    employer = case when p ? 'employer' then nullif(btrim(p ->> 'employer'), '') else c.employer end,
    id_type = case when p ? 'idType' then nullif(btrim(p ->> 'idType'), '') else c.id_type end,
    id_number = case when p ? 'idNumber' then nullif(upper(btrim(p ->> 'idNumber')), '') else c.id_number end,
    nationality = case when p ? 'nationality' then nullif(btrim(p ->> 'nationality'), '') else c.nationality end,
    tin = case when p ? 'tin' then nullif(upper(btrim(p ->> 'tin')), '') else c.tin end,
    company_name = case when p ? 'companyName' then nullif(btrim(p ->> 'companyName'), '') else c.company_name end,
    company_reg_no = case when p ? 'companyRegNo' then nullif(btrim(p ->> 'companyRegNo'), '') else c.company_reg_no end,
    marketing_consent = case when jsonb_typeof(p -> 'marketingConsent') = 'boolean'
                             then (p ->> 'marketingConsent')::boolean else c.marketing_consent end,
    marketing_consent_at = case when jsonb_typeof(p -> 'marketingConsent') = 'boolean'
                                     and (p ->> 'marketingConsent')::boolean is distinct from c.marketing_consent
                                then now() else c.marketing_consent_at end
  where c.id = p_customer_id
  returning * into v;
  return v;
end;
$$;

create or replace function sales.policy_status(pol sales.policies)
returns text
language sql
stable
set search_path = ''
as $$
  select case when pol.status = 'cancelled' then 'cancelled'
              when pol.expires_on < current_date then 'expired'
              else 'active' end
$$;

create or replace function sales.proposal_summary_json(p sales.proposals)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select sales.strip_top(jsonb_build_object(
    'id', p.id, 'proposalNo', p.proposal_no, 'productCode', p.product_code, 'status', p.status,
    'currentStep', p.current_step, 'quote', p.quote, 'insuredSubject', p.insured_subject,
    'updatedAt', p.updated_at, 'submittedAt', p.submitted_at,
    'policyId', (select pol.id from sales.policies pol where pol.proposal_id = p.id)))
$$;

create or replace function sales.proposal_detail_json(p sales.proposals)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select sales.proposal_summary_json(p) || sales.strip_top(jsonb_build_object(
    'formId', p.form_id, 'formVersion', p.form_version, 'answers', p.answers,
    'confirmations', to_jsonb(p.confirmations), 'signature', p.signature, 'staffMessage', p.staff_message,
    'files', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', f.id, 'fieldId', f.field_id, 'kind', f.kind, 'name', f.original_name, 'mime', f.mime,
                         'size', f.size, 'createdAt', f.created_at, 'storagePath', f.storage_path) order by f.created_at, f.id)
                       from sales.proposal_files f where f.proposal_id = p.id), '[]'::jsonb),
    -- Customers see staff as "Serene Insurance": no staff names leave the database here.
    'history', coalesce((select jsonb_agg(sales.strip_top(jsonb_build_object(
                           'at', e.at, 'event', e.event, 'fromStatus', e.from_status, 'toStatus', e.to_status,
                           'note', e.note, 'by', case e.actor_type when 'staff' then 'serene' else e.actor_type end))
                           order by e.id)
                         from sales.proposal_events e where e.proposal_id = p.id), '[]'::jsonb)))
$$;

create or replace function sales.payment_json(pay sales.payments)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select sales.strip_top(jsonb_build_object(
    'reference', pay.reference, 'amount', pay.amount, 'method', pay.method, 'network', pay.network,
    'maskedAccount', pay.masked_account, 'status', pay.status, 'failureReason', pay.failure_reason,
    'createdAt', pay.created_at, 'completedAt', pay.completed_at, 'proposalId', pay.proposal_id,
    'providerData', pay.provider_data,
    'policyId', (select pol.id from sales.policies pol where pol.payment_id = pay.id)))
$$;

create or replace function sales.policy_summary_json(pol sales.policies)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select sales.strip_top(jsonb_build_object(
    'id', pol.id, 'policyNo', pol.policy_no, 'certificateNo', pol.certificate_no, 'productCode', pol.product_code,
    'coverTitle', pol.cover_title, 'insuredSubject', pol.insured_subject, 'startsOn', pol.starts_on,
    'expiresOn', pol.expires_on, 'status', sales.policy_status(pol), 'premium', pol.premium,
    'issuedAt', pol.issued_at, 'proposalId', pol.proposal_id))
$$;

create or replace function sales.new_payment_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- No 0/O or 1/I/L: references are read out over the phone.
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_ref text;
begin
  loop
    v_ref := 'PAY-' || (select string_agg(substr(v_alphabet, 1 + (get_byte(b, i) % length(v_alphabet)), 1), '')
                        from extensions.gen_random_bytes(10) b, generate_series(0, 9) i);
    exit when not exists (select 1 from sales.payments where reference = v_ref);
  end loop;
  return v_ref;
end;
$$;

-- A quote as stored: the server sets validUntil from sales_quote_validity_days.
create or replace function sales.checked_quote(p_quote jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_quote is null or jsonb_typeof(p_quote) <> 'object'
     or jsonb_typeof(p_quote -> 'total') <> 'number' or jsonb_typeof(p_quote -> 'premium') <> 'number'
     or (p_quote ->> 'total')::numeric <= 0 or (p_quote ->> 'premium')::numeric < 0
     or pg_column_size(p_quote) > 16384 then
    raise exception 'bad-request' using errcode = '22023', detail = 'quote';
  end if;
  return p_quote || jsonb_build_object('validUntil',
    to_char(current_date + sales.setting_int('sales_quote_validity_days', 30), 'YYYY-MM-DD'));
end;
$$;

-- The caller's proposal, locked; 'not-found' for anyone else's.
create or replace function sales.own_proposal(p_customer_id uuid, p_proposal_id uuid)
returns sales.proposals
language plpgsql
set search_path = ''
as $$
declare
  v sales.proposals;
begin
  select * into v from sales.proposals where id = p_proposal_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function sales.log_event(p_proposal_id uuid, p_actor_type text, p_actor_id uuid, p_event text,
                                           p_from text, p_to text, p_note text default null, p_actor_name text default null)
returns void
language sql
set search_path = ''
as $$
  insert into sales.proposal_events (proposal_id, actor_type, actor_id, actor_name, event, from_status, to_status, note)
  values (p_proposal_id, p_actor_type, p_actor_id, left(p_actor_name, 120), p_event, p_from, p_to, left(p_note, 2000))
$$;

-- ---------------------------------------------------------------------------
-- Sign-in (architecture.md › Customer authentication)
-- ---------------------------------------------------------------------------
create or replace function public.account_otp_start(p_challenge_id uuid, p_phone text, p_code_hmac text,
                                                    p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
  v_oldest timestamptz;
  v_count int;
  v_ip_count int;
begin
  if p_challenge_id is null or coalesce(p_phone, '') !~ '^\+233[0-9]{9}$'
     or coalesce(p_code_hmac, '') !~ '^[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  -- Serialise starts per phone so two parallel requests cannot both slip under the limits.
  perform pg_advisory_xact_lock(hashtext('sales.otp:' || p_phone));

  select max(created_at), min(created_at), count(*)::int into v_last, v_oldest, v_count
    from sales.otp_challenges where phone_e164 = p_phone and created_at > now() - interval '1 hour';
  if v_last is not null and v_last > now() - interval '30 seconds' then
    return jsonb_build_object('ok', false, 'error', 'too-soon',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from v_last + interval '30 seconds' - now())))::int);
  end if;
  if v_count >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too-many',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from v_oldest + interval '1 hour' - now())))::int);
  end if;
  if p_ip_hash is not null then
    select count(*)::int into v_ip_count
      from sales.otp_challenges where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if v_ip_count >= 60 then
      return jsonb_build_object('ok', false, 'error', 'too-many', 'retryAfterSeconds', 600);
    end if;
  end if;

  -- Only the newest code works.
  update sales.otp_challenges set expires_at = now()
   where phone_e164 = p_phone and consumed_at is null and expires_at > now();
  insert into sales.otp_challenges (id, phone_e164, code_hmac, expires_at, ip_hash)
  values (p_challenge_id, p_phone, p_code_hmac, now() + interval '5 minutes', p_ip_hash);
  return jsonb_build_object('ok', true, 'challengeId', p_challenge_id, 'expiresInSeconds', 300, 'resendInSeconds', 30);
end;
$$;

create or replace function public.account_otp_verify(p_challenge_id uuid, p_code_hmac text, p_token_hash text,
                                                     p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch sales.otp_challenges;
  v_c sales.customers;
  v_new boolean := false;
begin
  if p_challenge_id is null or coalesce(p_code_hmac, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  select * into v_ch from sales.otp_challenges where id = p_challenge_id for update;
  if not found or v_ch.consumed_at is not null or v_ch.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_ch.attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'locked', 'attemptsLeft', 0);
  end if;
  if v_ch.code_hmac <> p_code_hmac then
    update sales.otp_challenges set attempts = attempts + 1 where id = v_ch.id;
    return jsonb_build_object('ok', false, 'error', case when v_ch.attempts + 1 >= 5 then 'locked' else 'invalid' end,
                              'attemptsLeft', 5 - (v_ch.attempts + 1));
  end if;
  update sales.otp_challenges set consumed_at = now() where id = v_ch.id;

  -- Look up first so returning customers don't burn customer numbers on the conflict path.
  select * into v_c from sales.customers where phone_e164 = v_ch.phone_e164;
  if not found then
    insert into sales.customers (phone_e164) values (v_ch.phone_e164)
    on conflict (phone_e164) do nothing
    returning * into v_c;
    v_new := found;
    if not v_new then
      select * into v_c from sales.customers where phone_e164 = v_ch.phone_e164;
    end if;
  end if;
  if v_c.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'suspended');
  end if;
  update sales.customers set last_sign_in_at = now() where id = v_c.id returning * into v_c;
  insert into sales.customer_sessions (customer_id, token_hash, expires_at, user_agent)
  values (v_c.id, p_token_hash, now() + interval '30 days', left(p_user_agent, 300));
  return jsonb_build_object('ok', true, 'isNew', v_new, 'customerId', v_c.id, 'profile', sales.profile_json(v_c),
                            'expiresAt', now() + interval '30 days');
end;
$$;

-- Session cookie → customer. Touches last_seen_at at most every 5 minutes (idle timeout 7 days).
create or replace function public.account_session_resolve(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s sales.customer_sessions;
  v_c sales.customers;
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_s from sales.customer_sessions where token_hash = p_token_hash;
  if not found then
    return null;
  end if;
  select * into v_c from sales.customers where id = v_s.customer_id;
  if v_s.expires_at <= now() or v_s.last_seen_at <= now() - interval '7 days' or v_c.status <> 'active' then
    delete from sales.customer_sessions where id = v_s.id;
    return null;
  end if;
  if v_s.last_seen_at < now() - interval '5 minutes' then
    update sales.customer_sessions set last_seen_at = now() where id = v_s.id;
  end if;
  return jsonb_build_object('customerId', v_c.id, 'customerNo', v_c.customer_no, 'phone', v_c.phone_e164);
end;
$$;

create or replace function public.account_sign_out(p_token_hash text)
returns void
language sql
security definer
set search_path = ''
as $$ delete from sales.customer_sessions where token_hash = p_token_hash $$;

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------
create or replace function public.account_get_profile(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v sales.customers;
begin
  select * into v from sales.customers where id = p_customer_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return sales.profile_json(v);
end;
$$;

create or replace function public.account_update_profile(p_customer_id uuid, p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.customers;
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  v := sales.apply_profile(p_customer_id, p_profile);
  if v.id is null then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return sales.profile_json(v);
end;
$$;

-- ---------------------------------------------------------------------------
-- Proposals
-- ---------------------------------------------------------------------------
create or replace function public.account_list_proposals(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(sales.proposal_summary_json(p) order by p.updated_at desc, p.id), '[]'::jsonb)
  from sales.proposals p where p.customer_id = p_customer_id
$$;

create or replace function public.account_create_proposal(p_customer_id uuid, p_product_code text, p_form_id text,
                                                          p_form_version int, p_answers jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals;
begin
  if p_answers is null then
    p_answers := '{}';
  end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 524288 then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  if not exists (select 1 from sales.customers where id = p_customer_id and status = 'active') then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('sales.drafts:' || p_customer_id::text));
  if (select count(*) from sales.proposals where customer_id = p_customer_id and status = 'draft') >= 20 then
    raise exception 'too-many-drafts' using errcode = 'P0001';
  end if;
  insert into sales.proposals (customer_id, product_code, form_id, form_version, answers)
  values (p_customer_id, p_product_code, p_form_id, p_form_version, p_answers)
  returning * into v;
  perform sales.log_event(v.id, 'customer', p_customer_id, 'created', null, 'draft');
  return sales.proposal_detail_json(v);
end;
$$;

create or replace function public.account_get_proposal(p_customer_id uuid, p_proposal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v sales.proposals;
begin
  select * into v from sales.proposals where id = p_proposal_id and customer_id = p_customer_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return sales.proposal_detail_json(v);
end;
$$;

create or replace function public.account_save_proposal(p_customer_id uuid, p_proposal_id uuid, p_answers jsonb,
                                                        p_current_step int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals := sales.own_proposal(p_customer_id, p_proposal_id);
begin
  if v.status not in ('draft', 'info_requested') then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 524288
     or p_current_step is null or p_current_step not between 0 and 50 then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  update sales.proposals set answers = p_answers, current_step = p_current_step
   where id = v.id returning * into v;
  return sales.proposal_summary_json(v);
end;
$$;

-- POST …/proposals/:id/quote: the indicative price of the current answers, kept on the draft.
create or replace function public.account_quote_store(p_customer_id uuid, p_proposal_id uuid, p_quote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals := sales.own_proposal(p_customer_id, p_proposal_id);
  v_quote jsonb := sales.checked_quote(p_quote);
begin
  if v.status not in ('draft', 'info_requested') then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  update sales.proposals set quote = v_quote, premium = (v_quote ->> 'premium')::numeric where id = v.id;
  return v_quote;
end;
$$;

-- The Worker has already cleaned and validated the answers, checked the confirmations, stored the
-- signature image and priced the proposal (architecture.md › Submit). p_quote is set only for an
-- instant product that rating could price; otherwise the proposal waits for an underwriter.
create or replace function public.account_submit_proposal(
  p_customer_id uuid, p_proposal_id uuid, p_form_version int, p_answers jsonb, p_confirmations text[],
  p_signature jsonb, p_file_ids uuid[], p_quote jsonb default null, p_refer text[] default '{}',
  p_sum_insured numeric default null, p_cover_start date default null, p_cover_end date default null,
  p_insured_subject text default null, p_profile jsonb default null, p_marketing_consent boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals := sales.own_proposal(p_customer_id, p_proposal_id);
  v_from text := v.status;
  v_quote jsonb;
begin
  if v.status not in ('draft', 'info_requested') then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 524288
     or p_signature is null or jsonb_typeof(p_signature) <> 'object'
     or coalesce(p_signature ->> 'signedName', '') = '' or coalesce(p_signature ->> 'answersSha256', '') !~ '^[0-9a-f]{64}$'
     or p_form_version is null or p_form_version < 1
     or coalesce(cardinality(p_confirmations), 0) = 0 then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  -- Every referenced file must be one of this proposal's own uploads.
  if exists (select 1 from unnest(coalesce(p_file_ids, '{}'::uuid[])) f(id)
             where not exists (select 1 from sales.proposal_files pf
                               where pf.id = f.id and pf.proposal_id = v.id and pf.customer_id = p_customer_id)) then
    raise exception 'files-invalid' using errcode = 'P0001';
  end if;
  if p_quote is not null then
    v_quote := sales.checked_quote(p_quote);
  end if;

  update sales.proposals set
    status = 'submitted', answers = p_answers, form_version = p_form_version,
    confirmations = p_confirmations,
    signature = p_signature || jsonb_build_object('signedAt', now()),
    sum_insured = p_sum_insured, cover_start = p_cover_start, cover_end = p_cover_end,
    insured_subject = left(nullif(btrim(p_insured_subject), ''), 200),
    refer_reasons = coalesce(p_refer, '{}'), submitted_at = now(), staff_message = null,
    quote = null, premium = null
  where id = v.id returning * into v;
  perform sales.log_event(v.id, 'customer', p_customer_id, case when v_from = 'info_requested' then 'resubmitted' else 'submitted' end,
                          v_from, 'submitted');

  if v_quote is not null then
    update sales.proposals set status = 'quoted', quote = v_quote, premium = (v_quote ->> 'premium')::numeric
     where id = v.id returning * into v;
    perform sales.log_event(v.id, 'system', null, 'quoted', 'submitted', 'quoted', 'Priced online.');
  end if;

  perform sales.apply_profile(p_customer_id, p_profile);
  update sales.customers c set
    data_consent_at = now(),
    marketing_consent = coalesce(p_marketing_consent, c.marketing_consent),
    marketing_consent_at = case when p_marketing_consent is not null and p_marketing_consent is distinct from c.marketing_consent
                                then now() else c.marketing_consent_at end,
    -- L.I. 2523: a live face photo goes to staff for the NIA biometric check.
    identity_status = case when c.identity_status in ('unverified', 'mismatch')
                                and exists (select 1 from sales.proposal_files pf
                                            where pf.id = any (coalesce(p_file_ids, '{}'::uuid[])) and pf.kind = 'id_selfie')
                           then 'pending' else c.identity_status end
  where c.id = p_customer_id;
  return sales.proposal_detail_json(v);
end;
$$;

create or replace function public.account_cancel_proposal(p_customer_id uuid, p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals := sales.own_proposal(p_customer_id, p_proposal_id);
  v_from text := v.status;
begin
  if v.status not in ('draft', 'submitted', 'under_review', 'info_requested', 'quoted', 'expired') then
    raise exception 'not-cancellable' using errcode = 'P0001';
  end if;
  update sales.payments set status = 'failed', failure_reason = 'The proposal was cancelled.', completed_at = now()
   where proposal_id = v.id and status = 'pending';
  update sales.proposals set status = 'cancelled' where id = v.id returning * into v;
  perform sales.log_event(v.id, 'customer', p_customer_id, 'cancelled', v_from, 'cancelled', 'Cancelled by the customer.');
  return sales.proposal_summary_json(v);
end;
$$;

-- ---------------------------------------------------------------------------
-- Files (the Worker sniffs the bytes, uploads them after this succeeds, and deletes this row if the
-- upload fails).
-- ---------------------------------------------------------------------------
create or replace function public.account_add_file(
  p_customer_id uuid, p_proposal_id uuid, p_file_id uuid, p_field_id text, p_kind text, p_mime text, p_size int,
  p_original_name text, p_sha256 text, p_extension text, p_max_files int default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals := sales.own_proposal(p_customer_id, p_proposal_id);
  f sales.proposal_files;
begin
  if v.status not in ('draft', 'info_requested') then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  if p_file_id is null or coalesce(p_extension, '') !~ '^(jpg|png|webp|heic|pdf)$' then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  if p_kind in ('id_front', 'id_back', 'ghana_card') then
    raise exception 'kind-refused' using errcode = 'P0001';
  end if;
  if (select count(*) from sales.proposal_files where proposal_id = v.id and field_id = p_field_id)
       >= greatest(coalesce(p_max_files, 10), 1)
     or (select count(*) from sales.proposal_files where proposal_id = v.id) >= 60 then
    raise exception 'too-many-files' using errcode = 'P0001';
  end if;
  insert into sales.proposal_files (id, proposal_id, customer_id, field_id, kind, storage_path, mime, size,
                                    original_name, sha256)
  values (p_file_id, v.id, p_customer_id, p_field_id, p_kind,
          p_customer_id::text || '/' || v.id::text || '/' || p_file_id::text || '.' || p_extension,
          p_mime, p_size, left(p_original_name, 200), p_sha256)
  returning * into f;
  return jsonb_build_object('id', f.id, 'fieldId', f.field_id, 'kind', f.kind, 'name', f.original_name,
                            'mime', f.mime, 'size', f.size, 'createdAt', f.created_at, 'storagePath', f.storage_path);
end;
$$;

create or replace function public.account_delete_file(p_customer_id uuid, p_proposal_id uuid, p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals := sales.own_proposal(p_customer_id, p_proposal_id);
  v_path text;
begin
  if v.status not in ('draft', 'info_requested') then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  delete from sales.proposal_files
   where id = p_file_id and proposal_id = v.id and customer_id = p_customer_id
  returning storage_path into v_path;
  if v_path is null then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return jsonb_build_object('storagePath', v_path);
end;
$$;

create or replace function public.account_get_file(p_customer_id uuid, p_file_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f sales.proposal_files;
begin
  select * into f from sales.proposal_files where id = p_file_id and customer_id = p_customer_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return jsonb_build_object('id', f.id, 'proposalId', f.proposal_id, 'fieldId', f.field_id, 'kind', f.kind,
                            'name', f.original_name, 'mime', f.mime, 'size', f.size, 'sha256', f.sha256,
                            'storagePath', f.storage_path, 'createdAt', f.created_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments and issuing
-- ---------------------------------------------------------------------------
create or replace function public.account_payment_start(p_customer_id uuid, p_proposal_id uuid, p_method text,
                                                        p_network text, p_masked_account text,
                                                        p_provider_data jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals := sales.own_proposal(p_customer_id, p_proposal_id);
  pay sales.payments;
begin
  if v.status <> 'quoted' then
    raise exception 'not-payable' using errcode = 'P0001';
  end if;
  if (v.quote ->> 'validUntil')::date < current_date then
    raise exception 'quote-expired' using errcode = 'P0001';
  end if;
  if p_method not in ('momo', 'card') or (p_method = 'momo') <> (p_network is not null)
     or coalesce(p_masked_account, '') = '' then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  -- A new attempt replaces any attempt still waiting for the customer.
  update sales.payments set status = 'failed', failure_reason = 'Replaced by a new payment attempt.', completed_at = now()
   where proposal_id = v.id and status = 'pending';
  insert into sales.payments (reference, proposal_id, customer_id, amount, method, network, masked_account, provider_data)
  values (sales.new_payment_reference(), v.id, p_customer_id, (v.quote ->> 'total')::numeric, p_method, p_network,
          p_masked_account, coalesce(p_provider_data, '{}'))
  returning * into pay;
  perform sales.log_event(v.id, 'customer', p_customer_id, 'payment_started', 'quoted', 'quoted', pay.reference);
  return sales.payment_json(pay);
end;
$$;

create or replace function public.account_get_payment(p_customer_id uuid, p_reference text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pay sales.payments;
begin
  select * into pay from sales.payments where reference = upper(p_reference) and customer_id = p_customer_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return sales.payment_json(pay);
end;
$$;

-- Approval, step 1: reserve the policy and certificate numbers (idempotent per payment) and hand
-- the Worker what buildCertificate() needs.
create or replace function public.account_payment_reserve(p_customer_id uuid, p_reference text, p_policy_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay sales.payments;
  v sales.proposals;
  c sales.customers;
  r sales.issue_reservations;
  v_start date;
  v_end date;
  v_now timestamptz := now();
begin
  select * into pay from sales.payments where reference = upper(p_reference) and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  if pay.status = 'succeeded' then
    return jsonb_build_object('alreadyIssued', true, 'payment', sales.payment_json(pay));
  end if;
  if pay.status <> 'pending' then
    raise exception 'payment-closed' using errcode = 'P0001';
  end if;
  select * into v from sales.proposals where id = pay.proposal_id for update;
  if v.status <> 'quoted' then
    raise exception 'not-payable' using errcode = 'P0001';
  end if;
  select * into c from sales.customers where id = p_customer_id;

  select * into r from sales.issue_reservations where payment_id = pay.id;
  if not found then
    if coalesce(p_policy_code, '') !~ '^[A-Z]{3}$' then
      raise exception 'bad-request' using errcode = '22023';
    end if;
    -- Cover starts on the chosen date, or today if that has passed; the length of cover is kept.
    v_start := greatest(coalesce(v.cover_start, current_date), current_date);
    v_end := case when v.cover_end is not null then v.cover_end + (v_start - coalesce(v.cover_start, v_start))
                  else (v_start + interval '1 year' - interval '1 day')::date end;
    insert into sales.issue_reservations (payment_id, policy_no, certificate_no, starts_on, expires_on, issued_at)
    values (pay.id,
            'SE' || sales.yy(v_now) || p_policy_code || sales.pad(nextval('sales.policy_no_seq'), 5) || '-E',
            'C' || sales.setting_text('sales_certificate_series', '01') || '-' || sales.yy(v_now) || '-'
                || sales.pad(nextval('sales.certificate_no_seq'), 5),
            v_start, v_end, v_now)
    returning * into r;
  end if;
  return jsonb_build_object(
    'alreadyIssued', false, 'policyNo', r.policy_no, 'certificateNo', r.certificate_no,
    'startsOn', r.starts_on, 'expiresOn', r.expires_on, 'issuedAt', r.issued_at,
    'productCode', v.product_code, 'answers', v.answers, 'insuredSubject', v.insured_subject,
    'customerNo', c.customer_no, 'fullName', c.full_name, 'companyName', c.company_name);
end;
$$;

-- Approval, step 2 (or a decline): idempotent per payment reference. On approval it marks the
-- payment succeeded, issues the policy with the reserved numbers, stores the certificate snapshot
-- built by the Worker, and moves the proposal quoted → paid → issued, all in one transaction.
create or replace function public.account_payment_complete(p_customer_id uuid, p_reference text, p_approved boolean,
                                                           p_failure_reason text default null,
                                                           p_certificate jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay sales.payments;
  v sales.proposals;
  r sales.issue_reservations;
begin
  select * into pay from sales.payments where reference = upper(p_reference) and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  if pay.status = 'succeeded' or (pay.status = 'failed' and not coalesce(p_approved, false)) then
    return sales.payment_json(pay);  -- replay
  end if;
  if pay.status = 'failed' then
    raise exception 'payment-closed' using errcode = 'P0001';
  end if;

  if not coalesce(p_approved, false) then
    update sales.payments
       set status = 'failed', completed_at = now(),
           failure_reason = left(coalesce(nullif(btrim(p_failure_reason), ''), 'The payment was not approved.'), 200)
     where id = pay.id returning * into pay;
    perform sales.log_event(pay.proposal_id, 'system', null, 'payment_failed', 'quoted', 'quoted',
                            pay.reference || ': ' || pay.failure_reason);
    return sales.payment_json(pay);
  end if;

  select * into r from sales.issue_reservations where payment_id = pay.id;
  if not found then
    raise exception 'not-reserved' using errcode = 'P0001';
  end if;
  if p_certificate is null or jsonb_typeof(p_certificate) <> 'object'
     or p_certificate ->> 'certificateNo' is distinct from r.certificate_no
     or p_certificate ->> 'policyNo' is distinct from r.policy_no
     or coalesce(p_certificate ->> 'coverTitle', '') = '' or pg_column_size(p_certificate) > 65536 then
    raise exception 'bad-request' using errcode = '22023', detail = 'certificate';
  end if;
  select * into v from sales.proposals where id = pay.proposal_id for update;
  if v.status <> 'quoted' then
    raise exception 'not-payable' using errcode = 'P0001';
  end if;

  update sales.payments set status = 'succeeded', completed_at = now() where id = pay.id returning * into pay;
  update sales.proposals set status = 'paid' where id = v.id;
  perform sales.log_event(v.id, 'system', null, 'paid', 'quoted', 'paid', pay.reference);
  insert into sales.policies (policy_no, certificate_no, customer_id, proposal_id, payment_id, product_code, cover_title,
                              insured_subject, starts_on, expires_on, premium, sum_insured, certificate, issued_at)
  values (r.policy_no, r.certificate_no, p_customer_id, v.id, pay.id, v.product_code,
          left(p_certificate ->> 'coverTitle', 120), v.insured_subject, r.starts_on, r.expires_on,
          coalesce(v.premium, (v.quote ->> 'premium')::numeric, pay.amount), v.sum_insured, p_certificate, r.issued_at);
  update sales.proposals set status = 'issued' where id = v.id;
  perform sales.log_event(v.id, 'system', null, 'issued', 'paid', 'issued', r.policy_no);
  return sales.payment_json(pay);
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create or replace function public.account_list_policies(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(sales.policy_summary_json(pol) order by pol.issued_at desc, pol.id), '[]'::jsonb)
  from sales.policies pol where pol.customer_id = p_customer_id
$$;

create or replace function public.account_get_policy(p_customer_id uuid, p_policy_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pol sales.policies;
  pay sales.payments;
begin
  select * into pol from sales.policies where id = p_policy_id and customer_id = p_customer_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  select * into pay from sales.payments where id = pol.payment_id;
  return sales.policy_summary_json(pol)
    || jsonb_build_object('certificate', pol.certificate, 'payment', sales.payment_json(pay));
end;
$$;

-- ---------------------------------------------------------------------------
-- Public certificate check (GET /api/verify). Needs the certificate number AND the vehicle
-- registration or policy number; returns the holder's initials only, never a name or contact.
-- ---------------------------------------------------------------------------
create or replace function public.verify_certificate(p_certificate_no text, p_reference text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cert text := upper(regexp_replace(coalesce(p_certificate_no, ''), '\s+', '', 'g'));
  v_key text := sales.norm_key(p_reference);
  pol sales.policies;
  v_initials text;
begin
  if v_cert !~ '^C[0-9]{2}-[0-9]{2}-[0-9]{5,}$' or length(v_key) < 4 then
    return jsonb_build_object('found', false);
  end if;
  select * into pol from sales.policies where certificate_no = v_cert;
  if not found
     or not (sales.norm_key(pol.policy_no) = v_key
             or sales.norm_key(split_part(coalesce(pol.insured_subject, ''), '·', 1)) = v_key
             or exists (select 1 from jsonb_array_elements(
                          case when jsonb_typeof(pol.certificate -> 'numberedItems') = 'array'
                               then pol.certificate -> 'numberedItems' else '[]'::jsonb end) i
                        where i ->> 'label' ilike '%REGISTRATION%' and sales.norm_key(i ->> 'value') = v_key)) then
    return jsonb_build_object('found', false);
  end if;
  select string_agg(upper(left(w, 1)) || '.', ' ' order by n) into v_initials
    from regexp_split_to_table(btrim(coalesce(pol.certificate ->> 'policyHolder', '')), '\s+') with ordinality t(w, n)
   where w ~ '^[[:alpha:]]' and n <= 4;
  return sales.strip_top(jsonb_build_object(
    'found', true,
    'status', case when pol.status = 'cancelled' then 'cancelled'
                   when pol.starts_on > current_date then 'not_yet_active'
                   when pol.expires_on < current_date then 'expired' else 'active' end,
    'certificateNo', pol.certificate_no, 'policyNo', pol.policy_no, 'productCode', pol.product_code,
    'coverTitle', pol.cover_title, 'insuredSubject', pol.insured_subject, 'holderInitials', v_initials,
    'startsOn', pol.starts_on, 'expiresOn', pol.expires_on));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the Worker (service_role) only.
-- ---------------------------------------------------------------------------
revoke all on function
  public.account_otp_start(uuid, text, text, text), public.account_otp_verify(uuid, text, text, text),
  public.account_session_resolve(text), public.account_sign_out(text),
  public.account_get_profile(uuid), public.account_update_profile(uuid, jsonb),
  public.account_list_proposals(uuid), public.account_create_proposal(uuid, text, text, int, jsonb),
  public.account_get_proposal(uuid, uuid), public.account_save_proposal(uuid, uuid, jsonb, int),
  public.account_quote_store(uuid, uuid, jsonb),
  public.account_submit_proposal(uuid, uuid, int, jsonb, text[], jsonb, uuid[], jsonb, text[], numeric, date, date, text, jsonb, boolean),
  public.account_cancel_proposal(uuid, uuid),
  public.account_add_file(uuid, uuid, uuid, text, text, text, int, text, text, text, int),
  public.account_delete_file(uuid, uuid, uuid), public.account_get_file(uuid, uuid),
  public.account_payment_start(uuid, uuid, text, text, text, jsonb), public.account_get_payment(uuid, text),
  public.account_payment_reserve(uuid, text, text), public.account_payment_complete(uuid, text, boolean, text, jsonb),
  public.account_list_policies(uuid), public.account_get_policy(uuid, uuid),
  public.verify_certificate(text, text)
  from public, anon, authenticated;
grant execute on function
  public.account_otp_start(uuid, text, text, text), public.account_otp_verify(uuid, text, text, text),
  public.account_session_resolve(text), public.account_sign_out(text),
  public.account_get_profile(uuid), public.account_update_profile(uuid, jsonb),
  public.account_list_proposals(uuid), public.account_create_proposal(uuid, text, text, int, jsonb),
  public.account_get_proposal(uuid, uuid), public.account_save_proposal(uuid, uuid, jsonb, int),
  public.account_quote_store(uuid, uuid, jsonb),
  public.account_submit_proposal(uuid, uuid, int, jsonb, text[], jsonb, uuid[], jsonb, text[], numeric, date, date, text, jsonb, boolean),
  public.account_cancel_proposal(uuid, uuid),
  public.account_add_file(uuid, uuid, uuid, text, text, text, int, text, text, text, int),
  public.account_delete_file(uuid, uuid, uuid), public.account_get_file(uuid, uuid),
  public.account_payment_start(uuid, uuid, text, text, text, jsonb), public.account_get_payment(uuid, text),
  public.account_payment_reserve(uuid, text, text), public.account_payment_complete(uuid, text, boolean, text, jsonb),
  public.account_list_policies(uuid), public.account_get_policy(uuid, uuid),
  public.verify_certificate(text, text)
  to service_role;

-- Internal helpers stay internal (new functions default to EXECUTE for PUBLIC).
revoke all on all functions in schema sales from public, anon, authenticated;
grant execute on function sales.pad(bigint, int), sales.yy(timestamptz), sales.norm_key(text),
  sales.policy_status(sales.policies) to authenticated;
