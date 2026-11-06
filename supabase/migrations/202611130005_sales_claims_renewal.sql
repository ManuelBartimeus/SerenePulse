-- Online claims notification and policy renewal (packages/proposals/src/claims.ts).
--
-- A customer opens a draft claim on their own active policy, attaches the documents the claim type
-- needs (the Worker passes the required kinds from CLAIM_TYPES), and submits it (→ received).
-- Staff move it on with staff_update_claim. Renewal copies a policy's answers into a new draft
-- proposal with the cover dates moved on; files and the signature are never copied.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('claims.view', 'View claims and their documents'),
  ('claims.manage', 'Assess, approve, decline and settle claims');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from (values
  ('executive', array['claims.view', 'claims.manage']),
  ('underwriter', array['claims.view', 'claims.manage']),
  ('system_admin', array['claims.view']),
  ('cx_admin', array['claims.view']),
  ('auditor', array['claims.view'])
) as m(role_key, perms)
join public.roles r on r.key = m.role_key
cross join lateral unnest(m.perms) as p(key);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create sequence sales.claim_no_seq start 1;  -- CLM-26-000001

create or replace function sales.next_claim_no()
returns text
language sql
volatile
set search_path = ''
as $$ select 'CLM-' || sales.yy() || '-' || sales.pad(nextval('sales.claim_no_seq'), 6) $$;

create or replace function sales.claim_next_statuses(p_status text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'draft'          then array['received', 'withdrawn']
    when 'received'       then array['under_review', 'withdrawn']
    when 'under_review'   then array['info_requested', 'approved', 'declined', 'withdrawn']
    when 'info_requested' then array['under_review', 'withdrawn']
    when 'approved'       then array['settled']
    else array[]::text[]   -- settled, declined, withdrawn are final
  end
$$;

create table sales.claims (
  id                 uuid primary key default gen_random_uuid(),
  claim_no           text not null unique default sales.next_claim_no() check (claim_no ~ '^CLM-[0-9]{2}-[0-9]{6,}$'),
  policy_id          uuid not null references sales.policies (id),
  customer_id        uuid not null references sales.customers (id),
  claim_type         text not null check (claim_type ~ '^[a-z_]{1,40}$'),
  -- 'draft' = opened online, documents still being added; not yet notified.
  status             text not null default 'draft'
                       check (status in ('draft', 'received', 'under_review', 'info_requested', 'approved', 'settled',
                                         'declined', 'withdrawn')),
  incident_date      date not null,
  incident_location  text not null check (length(btrim(incident_location)) between 2 and 300),
  description        text not null check (length(btrim(description)) between 20 and 5000),
  estimated_amount   numeric(16, 2) check (estimated_amount >= 0),
  third_party        jsonb check (third_party is null or jsonb_typeof(third_party) = 'object'),
  staff_message      text check (length(staff_message) <= 2000),
  assigned_to        uuid references public.profiles (user_id),
  created_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  updated_at         timestamptz not null default now(),
  check (status in ('draft', 'withdrawn') or submitted_at is not null)
);
comment on table sales.claims is 'Claims notified online against issued policies.';
create index claims_customer_idx on sales.claims (customer_id, updated_at desc);
create index claims_policy_idx on sales.claims (policy_id);
create index claims_queue_idx on sales.claims (status, submitted_at);

create or replace function sales.claims_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A claim starts as a draft.' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.claim_no <> old.claim_no or new.policy_id <> old.policy_id
     or new.customer_id <> old.customer_id or new.created_at <> old.created_at then
    raise exception 'A claim''s number, policy and customer never change.' using errcode = '42501';
  end if;
  if old.status <> 'draft'
     and (new.claim_type <> old.claim_type or new.incident_date <> old.incident_date
          or new.incident_location <> old.incident_location or new.description <> old.description
          or new.estimated_amount is distinct from old.estimated_amount or new.third_party is distinct from old.third_party) then
    raise exception 'A notified claim''s details cannot be changed.' using errcode = '42501', detail = 'claim_frozen';
  end if;
  if new.status <> old.status and not (new.status = any (sales.claim_next_statuses(old.status))) then
    raise exception 'A claim cannot move from % to %.', old.status, new.status
      using errcode = '23514', detail = 'invalid_transition';
  end if;
  return new;
end;
$$;
create trigger claims_guard before insert or update on sales.claims for each row execute function sales.claims_guard();
create trigger claims_touch before update on sales.claims for each row execute function app.touch_row();
create trigger claims_no_delete before delete on sales.claims for each row execute function sales.reject_change();

create table sales.claim_events (
  id           bigint generated always as identity primary key,
  claim_id     uuid not null references sales.claims (id),
  at           timestamptz not null default now(),
  actor_type   text not null check (actor_type in ('customer', 'staff', 'system')),
  actor_id     uuid,
  actor_name   text check (length(actor_name) <= 120),
  status       text not null,
  note         text check (length(note) <= 5000)
);
comment on table sales.claim_events is 'Claim history shown to the customer and staff. Append-only.';
create index claim_events_claim_idx on sales.claim_events (claim_id, id);
create trigger claim_events_append_only before update or delete on sales.claim_events
  for each row execute function sales.reject_change();

create table sales.claim_files (
  id             uuid primary key,
  claim_id       uuid not null references sales.claims (id),
  customer_id    uuid not null references sales.customers (id),
  kind           text not null check (kind ~ '^[a-z0-9_]{1,60}$' and kind not in ('id_front', 'id_back', 'ghana_card')),
  storage_path   text not null unique,
  mime           text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  size           int not null check (size between 1 and 10485760),
  original_name  text not null check (length(original_name) between 1 and 200),
  sha256         text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at     timestamptz not null default now(),
  check (storage_path like customer_id::text || '/claims/' || claim_id::text || '/' || id::text || '.%')
);
comment on table sales.claim_files is 'Claim documents; objects in bucket customer-files under {customer}/claims/{claim}/.';
create index claim_files_claim_idx on sales.claim_files (claim_id, created_at);

alter table sales.claims enable row level security;
alter table sales.claim_events enable row level security;
alter table sales.claim_files enable row level security;
create policy claims_staff_read on sales.claims for select to authenticated using ((select app.has_perm('claims.view')));
create policy claim_events_staff_read on sales.claim_events for select to authenticated
  using ((select app.has_perm('claims.view')));
create policy claim_files_staff_read on sales.claim_files for select to authenticated
  using ((select app.has_perm('claims.view')));
revoke all on sales.claims, sales.claim_events, sales.claim_files from public, anon, authenticated;
revoke all on sequence sales.claim_no_seq from public, anon, authenticated;
grant select on sales.claims, sales.claim_events, sales.claim_files to authenticated;

create policy customer_files_claims_read on storage.objects for select to authenticated using (
  bucket_id = 'customer-files' and name like '%/claims/%' and (select app.has_perm('claims.view'))
);

-- ---------------------------------------------------------------------------
-- JSON (ClaimSummary / ClaimDetail; productName is added by the Worker)
-- ---------------------------------------------------------------------------
create or replace function sales.claim_summary_json(cl sales.claims)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select sales.strip_top(jsonb_build_object(
    'id', cl.id, 'claimNo', cl.claim_no, 'policyId', cl.policy_id,
    'policyNo', (select pol.policy_no from sales.policies pol where pol.id = cl.policy_id),
    'productCode', (select pol.product_code from sales.policies pol where pol.id = cl.policy_id),
    'claimType', cl.claim_type, 'status', cl.status, 'incidentDate', cl.incident_date,
    'reportedAt', coalesce(cl.submitted_at, cl.created_at), 'updatedAt', cl.updated_at,
    'staffMessage', cl.staff_message))
$$;

create or replace function sales.claim_detail_json(cl sales.claims)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select sales.claim_summary_json(cl) || sales.strip_top(jsonb_build_object(
    'incidentLocation', cl.incident_location, 'description', cl.description,
    'estimatedAmount', cl.estimated_amount, 'thirdParty', cl.third_party,
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.original_name,
                                                           'mime', f.mime, 'size', f.size, 'createdAt', f.created_at)
                                        order by f.created_at, f.id)
                       from sales.claim_files f where f.claim_id = cl.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(sales.strip_top(jsonb_build_object('at', e.at, 'status', e.status, 'note', e.note))
                                         order by e.id)
                        from sales.claim_events e where e.claim_id = cl.id), '[]'::jsonb)))
$$;

create or replace function sales.own_claim(p_customer_id uuid, p_claim_id uuid)
returns sales.claims
language plpgsql
set search_path = ''
as $$
declare
  v sales.claims;
begin
  select * into v from sales.claims where id = p_claim_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer RPCs (service_role)
-- ---------------------------------------------------------------------------
-- The Worker has checked that the claim type fits the product line (claimTypesFor).
create or replace function public.account_create_claim(p_customer_id uuid, p_policy_id uuid, p_claim_type text,
                                                       p_incident_date date, p_incident_location text,
                                                       p_description text, p_estimated_amount numeric default null,
                                                       p_third_party jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pol sales.policies;
  cl sales.claims;
begin
  select * into pol from sales.policies where id = p_policy_id and customer_id = p_customer_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  if sales.policy_status(pol) <> 'active' then
    raise exception 'policy-not-active' using errcode = 'P0001';
  end if;
  if p_incident_date is null or p_incident_date > current_date then
    raise exception 'incident-in-future' using errcode = 'P0001';
  end if;
  if p_incident_date < pol.starts_on or p_incident_date > pol.expires_on then
    raise exception 'incident-outside-cover' using errcode = 'P0001';
  end if;
  if coalesce(p_claim_type, '') !~ '^[a-z_]{1,40}$'
     or length(btrim(coalesce(p_incident_location, ''))) not between 2 and 300
     or length(btrim(coalesce(p_description, ''))) not between 20 and 5000
     or (p_estimated_amount is not null and (p_estimated_amount < 0 or p_estimated_amount > 100000000000))
     or (p_third_party is not null and (jsonb_typeof(p_third_party) <> 'object' or pg_column_size(p_third_party) > 2048)) then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('sales.claims:' || p_customer_id::text));
  if (select count(*) from sales.claims where customer_id = p_customer_id and status = 'draft') >= 10 then
    raise exception 'too-many-drafts' using errcode = 'P0001';
  end if;
  insert into sales.claims (policy_id, customer_id, claim_type, incident_date, incident_location, description,
                            estimated_amount, third_party)
  values (pol.id, p_customer_id, p_claim_type, p_incident_date, btrim(p_incident_location), btrim(p_description),
          p_estimated_amount, case when p_third_party = '{}'::jsonb then null else p_third_party end)
  returning * into cl;
  insert into sales.claim_events (claim_id, actor_type, actor_id, status, note)
  values (cl.id, 'customer', p_customer_id, 'draft', null);
  return sales.claim_detail_json(cl);
end;
$$;

create or replace function public.account_list_claims(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(sales.claim_summary_json(cl) order by cl.updated_at desc, cl.id), '[]'::jsonb)
  from sales.claims cl where cl.customer_id = p_customer_id
$$;

create or replace function public.account_get_claim(p_customer_id uuid, p_claim_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cl sales.claims;
begin
  select * into cl from sales.claims where id = p_claim_id and customer_id = p_customer_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return sales.claim_detail_json(cl);
end;
$$;

-- Documents can be added while the claim is a draft or while staff have asked for more.
create or replace function public.account_add_claim_file(
  p_customer_id uuid, p_claim_id uuid, p_file_id uuid, p_kind text, p_mime text, p_size int, p_original_name text,
  p_sha256 text, p_extension text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cl sales.claims := sales.own_claim(p_customer_id, p_claim_id);
  f sales.claim_files;
begin
  if cl.status not in ('draft', 'info_requested') then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  if p_file_id is null or coalesce(p_extension, '') !~ '^(jpg|png|webp|heic|pdf)$' then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  if p_kind in ('id_front', 'id_back', 'ghana_card') then
    raise exception 'kind-refused' using errcode = 'P0001';
  end if;
  if (select count(*) from sales.claim_files where claim_id = cl.id) >= 40 then
    raise exception 'too-many-files' using errcode = 'P0001';
  end if;
  insert into sales.claim_files (id, claim_id, customer_id, kind, storage_path, mime, size, original_name, sha256)
  values (p_file_id, cl.id, p_customer_id, p_kind,
          p_customer_id::text || '/claims/' || cl.id::text || '/' || p_file_id::text || '.' || p_extension,
          p_mime, p_size, left(p_original_name, 200), p_sha256)
  returning * into f;
  return jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.original_name, 'mime', f.mime, 'size', f.size,
                            'createdAt', f.created_at, 'storagePath', f.storage_path);
end;
$$;

-- Removes a claim file row whose upload failed (the Worker's compensation step).
create or replace function public.account_delete_claim_file(p_customer_id uuid, p_claim_id uuid, p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cl sales.claims := sales.own_claim(p_customer_id, p_claim_id);
  v_path text;
begin
  if cl.status not in ('draft', 'info_requested') then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  delete from sales.claim_files where id = p_file_id and claim_id = cl.id and customer_id = p_customer_id
  returning storage_path into v_path;
  if v_path is null then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  return jsonb_build_object('storagePath', v_path);
end;
$$;

-- Draft → received. p_required_kinds: the claim type's required document kinds (CLAIM_TYPES).
create or replace function public.account_submit_claim(p_customer_id uuid, p_claim_id uuid, p_required_kinds text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cl sales.claims := sales.own_claim(p_customer_id, p_claim_id);
  v_missing text[];
begin
  if cl.status <> 'draft' then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_missing
    from unnest(coalesce(p_required_kinds, '{}'::text[])) k
   where not exists (select 1 from sales.claim_files f where f.claim_id = cl.id and f.kind = k);
  if cardinality(v_missing) > 0 then
    raise exception 'documents-missing' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;
  update sales.claims set status = 'received', submitted_at = now() where id = cl.id returning * into cl;
  insert into sales.claim_events (claim_id, actor_type, actor_id, status, note)
  values (cl.id, 'customer', p_customer_id, 'received', 'Claim notified online.');
  return sales.claim_detail_json(cl);
end;
$$;

-- The customer's answer to "we need more from you" (info_requested → under_review).
create or replace function public.account_respond_claim(p_customer_id uuid, p_claim_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cl sales.claims := sales.own_claim(p_customer_id, p_claim_id);
begin
  if cl.status <> 'info_requested' then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_message, ''))) not between 1 and 5000 then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  update sales.claims set status = 'under_review' where id = cl.id returning * into cl;
  insert into sales.claim_events (claim_id, actor_type, actor_id, status, note)
  values (cl.id, 'customer', p_customer_id, 'under_review', btrim(p_message));
  return sales.claim_detail_json(cl);
end;
$$;

-- Renewal: a new draft for the same product with the previous answers. The Worker names the
-- answer keys holding the cover dates (form roles coverStart / coverEnd) and the keys to drop
-- (file fields), because the database does not know the form definitions.
create or replace function public.account_renew_policy(p_customer_id uuid, p_policy_id uuid, p_form_version int,
                                                       p_start_keys text[] default '{}', p_end_keys text[] default '{}',
                                                       p_drop_keys text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pol sales.policies;
  v_old sales.proposals;
  v sales.proposals;
  v_start date;
  v_end date;
  v_answers jsonb;
  k text;
begin
  select * into pol from sales.policies where id = p_policy_id and customer_id = p_customer_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0001';
  end if;
  if pol.status = 'cancelled' then
    raise exception 'policy-cancelled' using errcode = 'P0001';
  end if;
  if p_form_version is null or p_form_version < 1 then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  select * into v_old from sales.proposals where id = pol.proposal_id;
  v_start := case when pol.expires_on >= current_date then pol.expires_on + 1 else current_date end;
  v_end := (v_start + interval '1 year' - interval '1 day')::date;

  v_answers := v_old.answers - coalesce(p_drop_keys, '{}'::text[]);
  foreach k in array coalesce(p_start_keys, '{}'::text[]) loop
    v_answers := v_answers || jsonb_build_object(k, to_char(v_start, 'YYYY-MM-DD'));
  end loop;
  foreach k in array coalesce(p_end_keys, '{}'::text[]) loop
    v_answers := v_answers || jsonb_build_object(k, to_char(v_end, 'YYYY-MM-DD'));
  end loop;

  perform pg_advisory_xact_lock(hashtext('sales.drafts:' || p_customer_id::text));
  if (select count(*) from sales.proposals where customer_id = p_customer_id and status = 'draft') >= 20 then
    raise exception 'too-many-drafts' using errcode = 'P0001';
  end if;
  insert into sales.proposals (customer_id, product_code, form_id, form_version, answers, cover_start, cover_end,
                               sum_insured, insured_subject)
  values (p_customer_id, v_old.product_code, v_old.form_id, p_form_version, v_answers, v_start, v_end,
          v_old.sum_insured, v_old.insured_subject)
  returning * into v;
  perform sales.log_event(v.id, 'customer', p_customer_id, 'created', null, 'draft', 'Renewal of ' || pol.policy_no || '.');
  return sales.proposal_detail_json(v);
end;
$$;

-- GET /api/account/files/:fid serves both proposal and claim files (owner only).
create or replace function public.account_get_file(p_customer_id uuid, p_file_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f sales.proposal_files;
  cf sales.claim_files;
begin
  select * into f from sales.proposal_files where id = p_file_id and customer_id = p_customer_id;
  if found then
    return jsonb_build_object('id', f.id, 'proposalId', f.proposal_id, 'fieldId', f.field_id, 'kind', f.kind,
                              'name', f.original_name, 'mime', f.mime, 'size', f.size, 'sha256', f.sha256,
                              'storagePath', f.storage_path, 'createdAt', f.created_at);
  end if;
  select * into cf from sales.claim_files where id = p_file_id and customer_id = p_customer_id;
  if found then
    return jsonb_build_object('id', cf.id, 'claimId', cf.claim_id, 'kind', cf.kind, 'name', cf.original_name,
                              'mime', cf.mime, 'size', cf.size, 'sha256', cf.sha256, 'storagePath', cf.storage_path,
                              'createdAt', cf.created_at);
  end if;
  raise exception 'not-found' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create view public.sales_claim_list with (security_invoker = true) as
select cl.id, cl.claim_no, cl.policy_id, pol.policy_no, pol.product_code, cl.customer_id, c.customer_no,
       coalesce(c.full_name, c.company_name) as customer_name, c.phone_e164 as customer_phone, cl.claim_type, cl.status,
       cl.incident_date, cl.incident_location, cl.description, cl.estimated_amount, cl.third_party, cl.staff_message,
       cl.assigned_to, cl.created_at, cl.submitted_at, cl.updated_at,
       (select count(*)::int from sales.claim_files f where f.claim_id = cl.id) as file_count
from sales.claims cl
left join sales.policies pol on pol.id = cl.policy_id
left join sales.customers c on c.id = cl.customer_id;
comment on view public.sales_claim_list is 'Claims with policy and customer (claims.view). Drafts are not yet notified.';

create view public.sales_claim_events with (security_invoker = true) as
select e.id, e.claim_id, e.at, e.actor_type, e.actor_id, e.actor_name, e.status, e.note from sales.claim_events e;

create view public.sales_claim_files with (security_invoker = true) as
select f.id, f.claim_id, f.customer_id, f.kind, f.storage_path, f.mime, f.size, f.original_name, f.sha256, f.created_at
from sales.claim_files f;

revoke all on public.sales_claim_list, public.sales_claim_events, public.sales_claim_files from public, anon;
grant select on public.sales_claim_list, public.sales_claim_events, public.sales_claim_files to authenticated;

create or replace function public.staff_update_claim(p_claim_id uuid, p_status text, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cl sales.claims;
  v_from text;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  perform app.require_perm('claims.manage', true);
  select * into cl from sales.claims where id = p_claim_id for update;
  if not found then
    raise exception 'That claim doesn''t exist.' using errcode = 'P0002';
  end if;
  v_from := cl.status;
  if cl.status = 'draft' then
    raise exception 'This claim has not been sent by the customer yet.' using errcode = 'P0001';
  end if;
  if p_status is null or not (p_status = any (sales.claim_next_statuses(cl.status))) or p_status = 'received' then
    raise exception 'A % claim can''t be moved to %.', replace(cl.status, '_', ' '), replace(coalesce(p_status, '?'), '_', ' ')
      using errcode = 'P0001';
  end if;
  if p_status in ('info_requested', 'declined') and length(coalesce(v_msg, '')) < 5 then
    raise exception 'Enter a message for the customer (at least 5 characters).' using errcode = '22023';
  end if;
  if length(coalesce(v_msg, '')) > 2000 then
    raise exception 'Keep the message under 2,000 characters.' using errcode = '22023';
  end if;
  update sales.claims
     set status = p_status,
         staff_message = case when v_msg is not null then v_msg else staff_message end,
         assigned_to = coalesce(assigned_to, auth.uid())
   where id = cl.id returning * into cl;
  insert into sales.claim_events (claim_id, actor_type, actor_id, actor_name, status, note)
  values (cl.id, 'staff', auth.uid(), left(sales.staff_name(), 120), p_status, v_msg);
  perform audit.append('sales.claim.update', 'claim', cl.id::text, jsonb_build_object('status', v_from),
    jsonb_build_object('status', p_status));
  return sales.claim_summary_json(cl);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function
  public.account_create_claim(uuid, uuid, text, date, text, text, numeric, jsonb), public.account_list_claims(uuid),
  public.account_get_claim(uuid, uuid),
  public.account_add_claim_file(uuid, uuid, uuid, text, text, int, text, text, text),
  public.account_delete_claim_file(uuid, uuid, uuid), public.account_submit_claim(uuid, uuid, text[]),
  public.account_respond_claim(uuid, uuid, text), public.account_renew_policy(uuid, uuid, int, text[], text[], text[]),
  public.account_get_file(uuid, uuid), public.staff_update_claim(uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.account_create_claim(uuid, uuid, text, date, text, text, numeric, jsonb), public.account_list_claims(uuid),
  public.account_get_claim(uuid, uuid),
  public.account_add_claim_file(uuid, uuid, uuid, text, text, int, text, text, text),
  public.account_delete_claim_file(uuid, uuid, uuid), public.account_submit_claim(uuid, uuid, text[]),
  public.account_respond_claim(uuid, uuid, text), public.account_renew_policy(uuid, uuid, int, text[], text[], text[]),
  public.account_get_file(uuid, uuid)
  to service_role;
grant execute on function public.staff_update_claim(uuid, text, text) to authenticated;

revoke all on all functions in schema sales from public, anon, authenticated;
grant execute on function sales.pad(bigint, int), sales.yy(timestamptz), sales.norm_key(text),
  sales.policy_status(sales.policies) to authenticated;
