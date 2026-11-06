-- Online sales: what the admin portal uses. Reads go through security_invoker views in public
-- (RLS on the sales tables applies to the signed-in staff member); every change goes through an
-- audited staff_* function that re-checks the permission live (app.require_perm(…, true)).

-- ---------------------------------------------------------------------------
-- Read views (supabase-js: .from('sales_proposal_queue') …)
-- ---------------------------------------------------------------------------
create view public.sales_customer_list with (security_invoker = true) as
select c.id, c.customer_no, c.phone_e164, c.title, c.full_name, c.company_name, c.email, c.date_of_birth, c.gender,
       c.postal_address, c.residential_address, c.digital_address, c.occupation, c.employer, c.id_type, c.id_number,
       c.nationality, c.tin, c.company_reg_no, c.marketing_consent, c.marketing_consent_at, c.data_consent_at,
       c.status, c.identity_status, c.identity_checked_at, c.identity_checked_by, c.identity_reference, c.identity_note,
       c.created_at, c.updated_at, c.last_sign_in_at,
       coalesce(pr.proposal_count, 0) as proposal_count,
       coalesce(po.policy_count, 0) as policy_count,
       coalesce(po.total_premium, 0)::numeric(16, 2) as total_premium
from sales.customers c
left join lateral (select count(*)::int as proposal_count from sales.proposals p where p.customer_id = c.id) pr on true
left join lateral (select count(*)::int as policy_count,
                          sum(pol.premium) filter (where pol.status = 'active') as total_premium
                   from sales.policies pol where pol.customer_id = c.id) po on true;
comment on view public.sales_customer_list is 'Customers with proposal and policy counts and total premium of active policies (customers.view).';

create view public.sales_proposal_queue with (security_invoker = true) as
select p.id, p.proposal_no, p.customer_id, c.customer_no, coalesce(c.full_name, c.company_name) as customer_name,
       c.phone_e164 as customer_phone, p.product_code, p.form_id, p.form_version, p.status, p.answers, p.current_step,
       p.quote, p.premium, (p.quote ->> 'total')::numeric(14, 2) as total, (p.quote ->> 'validUntil')::date as quote_valid_until,
       p.sum_insured, p.cover_start, p.cover_end, p.insured_subject, p.confirmations, p.signature, p.refer_reasons,
       p.submitted_at, p.reviewed_by, p.reviewed_at, p.staff_message, p.created_at, p.updated_at,
       (select pol.id from sales.policies pol where pol.proposal_id = p.id) as policy_id,
       (select count(*)::int from sales.proposal_files f where f.proposal_id = p.id) as file_count
from sales.proposals p
left join sales.customers c on c.id = p.customer_id;
comment on view public.sales_proposal_queue is 'Proposals with the customer''s name (proposals.view). The queue is status in (submitted, under_review).';

create view public.sales_proposal_events with (security_invoker = true) as
select e.id, e.proposal_id, e.at, e.actor_type, e.actor_id, e.actor_name, e.event, e.from_status, e.to_status, e.note
from sales.proposal_events e;

create view public.sales_proposal_files with (security_invoker = true) as
select f.id, f.proposal_id, f.customer_id, f.field_id, f.kind, f.storage_path, f.mime, f.size, f.original_name, f.sha256,
       f.created_at
from sales.proposal_files f;
comment on view public.sales_proposal_files is 'Attachments; download from bucket customer-files at storage_path (proposals.view or customers.view).';

create view public.sales_policy_list with (security_invoker = true) as
select pol.id, pol.policy_no, pol.certificate_no, pol.customer_id, c.customer_no,
       coalesce(c.full_name, c.company_name) as customer_name, pol.proposal_id, p.proposal_no, pol.payment_id,
       pay.reference as payment_reference, pol.product_code, pol.cover_title, pol.insured_subject, pol.starts_on,
       pol.expires_on, pol.premium, pol.sum_insured, pol.certificate, pol.status as stored_status,
       sales.policy_status(pol) as status, pol.issued_at, pol.cancelled_at, pol.cancelled_by, pol.cancel_reason
from sales.policies pol
left join sales.customers c on c.id = pol.customer_id
left join sales.proposals p on p.id = pol.proposal_id
left join sales.payments pay on pay.id = pol.payment_id;
comment on view public.sales_policy_list is 'Policies and certificates; status is active / expired / cancelled (policies.view).';

create view public.sales_payment_list with (security_invoker = true) as
select pay.id, pay.reference, pay.proposal_id, p.proposal_no, pay.customer_id, c.customer_no,
       coalesce(c.full_name, c.company_name) as customer_name, pay.amount, pay.method, pay.network, pay.masked_account,
       pay.provider, pay.status, pay.failure_reason, pay.created_at, pay.completed_at,
       (select pol.policy_no from sales.policies pol where pol.payment_id = pay.id) as policy_no
from sales.payments pay
left join sales.proposals p on p.id = pay.proposal_id
left join sales.customers c on c.id = pay.customer_id;
comment on view public.sales_payment_list is 'Payments (policies.view). Only masked account numbers exist.';

revoke all on public.sales_customer_list, public.sales_proposal_queue, public.sales_proposal_events,
  public.sales_proposal_files, public.sales_policy_list, public.sales_payment_list from public, anon;
grant select on public.sales_customer_list, public.sales_proposal_queue, public.sales_proposal_events,
  public.sales_proposal_files, public.sales_policy_list, public.sales_payment_list to authenticated;

-- ---------------------------------------------------------------------------
-- Staff actions
-- ---------------------------------------------------------------------------
create or replace function sales.staff_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(nullif((select display_name from public.profiles where user_id = auth.uid()), ''), 'Staff') $$;

create or replace function sales.staff_proposal(p_proposal_id uuid)
returns sales.proposals
language plpgsql
set search_path = ''
as $$
declare
  v sales.proposals;
begin
  select * into v from sales.proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'That proposal doesn''t exist.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

create or replace function sales.staff_text(p_text text, p_what text, p_min int default 5, p_max int default 2000)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_text, ''))) not between p_min and p_max then
    raise exception 'Enter % (% to % characters).', p_what, p_min, p_max using errcode = '22023';
  end if;
  return btrim(p_text);
end;
$$;

-- Opens a submitted proposal for review (submitted → under_review).
create or replace function public.staff_review_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals;
begin
  perform app.require_perm('proposals.review', true);
  v := sales.staff_proposal(p_proposal_id);
  if v.status <> 'submitted' then
    raise exception 'This proposal is not waiting for review (it is %).', replace(v.status, '_', ' ') using errcode = 'P0001';
  end if;
  update sales.proposals set status = 'under_review', reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id returning * into v;
  perform sales.log_event(v.id, 'staff', auth.uid(), 'under_review', 'submitted', 'under_review', null, sales.staff_name());
  perform audit.append('sales.proposal.review', 'proposal', v.id::text,
    jsonb_build_object('status', 'submitted'), jsonb_build_object('status', v.status));
  return sales.proposal_summary_json(v);
end;
$$;

-- Prices a proposal (underwriter products, referred instant products, or a re-quote) → quoted.
create or replace function public.staff_quote_proposal(p_proposal_id uuid, p_premium numeric, p_lines jsonb,
                                                       p_taxes jsonb, p_note text default null,
                                                       p_valid_days int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals;
  v_from text;
  v_days int;
  v_quote jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform app.require_perm('proposals.review', true);
  v := sales.staff_proposal(p_proposal_id);
  v_from := v.status;
  if v.status not in ('submitted', 'under_review', 'quoted', 'expired') then
    raise exception 'A % proposal can''t be priced.', replace(v.status, '_', ' ') using errcode = 'P0001';
  end if;
  if p_premium is null or p_premium <= 0 or p_premium > 1000000000 then
    raise exception 'Enter a premium above zero.' using errcode = '22023';
  end if;
  p_lines := coalesce(p_lines, '[]'::jsonb);
  p_taxes := coalesce(p_taxes, '[]'::jsonb);
  if jsonb_typeof(p_lines) <> 'array' or jsonb_typeof(p_taxes) <> 'array'
     or jsonb_array_length(p_lines) > 30 or jsonb_array_length(p_taxes) > 10
     or exists (select 1 from jsonb_array_elements(p_lines || p_taxes) l
                where jsonb_typeof(l) <> 'object' or jsonb_typeof(l -> 'amount') <> 'number'
                   or length(btrim(coalesce(l ->> 'label', ''))) not between 1 and 120) then
    raise exception 'Each line needs a label (up to 120 characters) and an amount.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note to the customer under 1,000 characters.' using errcode = '22023';
  end if;
  v_days := coalesce(p_valid_days, sales.setting_int('sales_quote_validity_days', 30));
  if v_days not between 1 and 90 then
    raise exception 'A quote can be valid for 1 to 90 days.' using errcode = '22023';
  end if;
  v_quote := sales.strip_top(jsonb_build_object(
    'currency', 'GHS', 'premium', round(p_premium, 2),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('label', btrim(l ->> 'label'), 'amount', round((l ->> 'amount')::numeric, 2))
                                        order by n), '[]'::jsonb)
              from jsonb_array_elements(p_lines) with ordinality t(l, n)),
    'taxes', (select coalesce(jsonb_agg(jsonb_build_object('label', btrim(l ->> 'label'), 'amount', round((l ->> 'amount')::numeric, 2))
                                        order by n), '[]'::jsonb)
              from jsonb_array_elements(p_taxes) with ordinality t(l, n)),
    'total', round(p_premium, 2) + coalesce((select sum(round((l ->> 'amount')::numeric, 2)) from jsonb_array_elements(p_taxes) l), 0),
    'indicative', false, 'notes', '[]'::jsonb, 'underwriterNote', v_note,
    'validUntil', to_char(current_date + v_days, 'YYYY-MM-DD'), 'source', 'underwriter'));
  update sales.proposals set status = 'quoted', quote = v_quote, premium = round(p_premium, 2),
         reviewed_by = auth.uid(), reviewed_at = now(), staff_message = null
   where id = v.id returning * into v;
  perform sales.log_event(v.id, 'staff', auth.uid(), 'quoted', v_from, 'quoted', v_note, sales.staff_name());
  perform audit.append('sales.proposal.quote', 'proposal', v.id::text, jsonb_build_object('status', v_from),
    jsonb_build_object('status', 'quoted', 'premium', v_quote -> 'premium', 'total', v_quote -> 'total',
                       'valid_until', v_quote -> 'validUntil'));
  return sales.proposal_summary_json(v);
end;
$$;

-- Sends the proposal back to the customer with a question; the answers become editable again.
create or replace function public.staff_request_info(p_proposal_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals;
  v_from text;
  v_msg text;
begin
  perform app.require_perm('proposals.review', true);
  v_msg := sales.staff_text(p_message, 'a message for the customer');
  v := sales.staff_proposal(p_proposal_id);
  v_from := v.status;
  if v.status not in ('submitted', 'under_review') then
    raise exception 'You can only ask for more information on a proposal that is waiting for review.' using errcode = 'P0001';
  end if;
  update sales.proposals set status = 'info_requested', staff_message = v_msg, reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id returning * into v;
  perform sales.log_event(v.id, 'staff', auth.uid(), 'info_requested', v_from, 'info_requested', v_msg, sales.staff_name());
  perform audit.append('sales.proposal.request_info', 'proposal', v.id::text, jsonb_build_object('status', v_from),
    jsonb_build_object('status', v.status));
  return sales.proposal_summary_json(v);
end;
$$;

create or replace function public.staff_decline(p_proposal_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals;
  v_from text;
  v_msg text;
begin
  perform app.require_perm('proposals.review', true);
  v_msg := sales.staff_text(p_message, 'the reason, as the customer will read it');
  v := sales.staff_proposal(p_proposal_id);
  v_from := v.status;
  if v.status not in ('submitted', 'under_review', 'info_requested', 'quoted', 'expired') then
    raise exception 'A % proposal can''t be declined.', replace(v.status, '_', ' ') using errcode = 'P0001';
  end if;
  update sales.payments set status = 'failed', failure_reason = 'The proposal was declined.', completed_at = now()
   where proposal_id = v.id and status = 'pending';
  update sales.proposals set status = 'declined', staff_message = v_msg, reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id returning * into v;
  perform sales.log_event(v.id, 'staff', auth.uid(), 'declined', v_from, 'declined', v_msg, sales.staff_name());
  perform audit.append('sales.proposal.decline', 'proposal', v.id::text, jsonb_build_object('status', v_from),
    jsonb_build_object('status', v.status));
  return sales.proposal_summary_json(v);
end;
$$;

create or replace function public.staff_cancel_proposal(p_proposal_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v sales.proposals;
  v_from text;
  v_reason text;
begin
  perform app.require_perm('proposals.review', true);
  v_reason := sales.staff_text(p_reason, 'the reason');
  v := sales.staff_proposal(p_proposal_id);
  v_from := v.status;
  if v.status not in ('draft', 'submitted', 'under_review', 'info_requested', 'quoted', 'expired') then
    raise exception 'A % proposal can''t be cancelled.', replace(v.status, '_', ' ') using errcode = 'P0001';
  end if;
  update sales.payments set status = 'failed', failure_reason = 'The proposal was cancelled.', completed_at = now()
   where proposal_id = v.id and status = 'pending';
  update sales.proposals set status = 'cancelled', staff_message = v_reason where id = v.id returning * into v;
  perform sales.log_event(v.id, 'staff', auth.uid(), 'cancelled', v_from, 'cancelled', v_reason, sales.staff_name());
  perform audit.append('sales.proposal.cancel', 'proposal', v.id::text, jsonb_build_object('status', v_from),
    jsonb_build_object('status', v.status, 'reason', v_reason));
  return sales.proposal_summary_json(v);
end;
$$;

create or replace function public.staff_cancel_policy(p_policy_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pol sales.policies;
  v_reason text;
begin
  perform app.require_perm('policies.manage', true);
  v_reason := sales.staff_text(p_reason, 'the reason');
  select * into pol from sales.policies where id = p_policy_id for update;
  if not found then
    raise exception 'That policy doesn''t exist.' using errcode = 'P0002';
  end if;
  if pol.status = 'cancelled' then
    raise exception 'This policy is already cancelled.' using errcode = 'P0001';
  end if;
  update sales.policies set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_reason
   where id = pol.id returning * into pol;
  perform sales.log_event(pol.proposal_id, 'staff', auth.uid(), 'policy_cancelled', 'issued', 'issued', v_reason, sales.staff_name());
  perform audit.append('sales.policy.cancel', 'policy', pol.id::text, jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'cancelled', 'policy_no', pol.policy_no, 'reason', v_reason));
  return sales.policy_summary_json(pol);
end;
$$;

-- Records the outcome of the NIA biometric check (L.I. 2523): the face photo against the Ghana Card number.
create or replace function public.staff_set_identity_status(p_customer_id uuid, p_status text,
                                                            p_reference text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c sales.customers;
  v_old text;
begin
  perform app.require_perm('customers.view', true);
  perform app.require_perm('proposals.review', true);
  if p_status not in ('unverified', 'pending', 'verified', 'mismatch') then
    raise exception 'Unknown identity status %.', p_status using errcode = '22023';
  end if;
  if p_status = 'verified' and length(btrim(coalesce(p_reference, ''))) = 0 then
    raise exception 'Enter the NIA transaction reference for a verified identity.' using errcode = '22023';
  end if;
  if length(coalesce(p_reference, '')) > 80 or length(coalesce(p_note, '')) > 1000 then
    raise exception 'Keep the reference under 80 and the note under 1,000 characters.' using errcode = '22023';
  end if;
  select * into c from sales.customers where id = p_customer_id for update;
  if not found then
    raise exception 'That customer doesn''t exist.' using errcode = 'P0002';
  end if;
  v_old := c.identity_status;
  update sales.customers
     set identity_status = p_status, identity_reference = nullif(btrim(coalesce(p_reference, '')), ''),
         identity_note = nullif(btrim(coalesce(p_note, '')), ''), identity_checked_by = auth.uid(), identity_checked_at = now()
   where id = c.id returning * into c;
  perform audit.append('sales.customer.identity', 'customer', c.id::text, jsonb_build_object('identity_status', v_old),
    jsonb_build_object('identity_status', p_status, 'reference', c.identity_reference));
  return jsonb_build_object('customerId', c.id, 'identityStatus', c.identity_status,
                            'identityReference', c.identity_reference, 'identityCheckedAt', c.identity_checked_at);
end;
$$;

-- Sales settings (Products & rates). Values are validated by app.sales_settings_validate; every
-- change lands in settings_history and the audit log (settings triggers).
create or replace function public.staff_update_sales_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  perform app.require_perm('products.manage', true);
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Settings must be an object of key → value.' using errcode = '22023';
  end if;
  for e in select * from jsonb_each(p_settings) loop
    if e.key not in ('sales_rates', 'sales_tppd_limit', 'sales_sms_mode', 'sales_sms_sender_id', 'sales_payment_mode',
                     'sales_certificate_series', 'sales_certificate_signatory_title', 'sales_certificate_signature_path',
                     'sales_quote_validity_days') then
      raise exception '% is not a sales setting.', e.key using errcode = '22023';
    end if;
    if e.key = 'sales_rates' and jsonb_typeof(e.value) = 'object' then
      update public.settings set value = e.value || jsonb_build_object('updatedAt', now()) where key = e.key;
    else
      update public.settings set value = e.value where key = e.key;
    end if;
  end loop;
  return (select jsonb_object_agg(s.key, s.value) from public.settings s where s.key like 'sales\_%');
end;
$$;

revoke all on function public.staff_review_proposal(uuid), public.staff_quote_proposal(uuid, numeric, jsonb, jsonb, text, int),
  public.staff_request_info(uuid, text), public.staff_decline(uuid, text), public.staff_cancel_proposal(uuid, text),
  public.staff_cancel_policy(uuid, text), public.staff_set_identity_status(uuid, text, text, text),
  public.staff_update_sales_settings(jsonb)
  from public, anon;
grant execute on function public.staff_review_proposal(uuid), public.staff_quote_proposal(uuid, numeric, jsonb, jsonb, text, int),
  public.staff_request_info(uuid, text), public.staff_decline(uuid, text), public.staff_cancel_proposal(uuid, text),
  public.staff_cancel_policy(uuid, text), public.staff_set_identity_status(uuid, text, text, text),
  public.staff_update_sales_settings(jsonb)
  to authenticated;

revoke all on all functions in schema sales from public, anon, authenticated;
grant execute on function sales.pad(bigint, int), sales.yy(timestamptz), sales.norm_key(text),
  sales.policy_status(sales.policies) to authenticated;
