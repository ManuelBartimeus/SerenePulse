-- Certificates keep the signature image that was in force when they were issued.
--
-- Administrators upload the signature from the portal to a new versioned path each time
-- (customer-files: settings/signature-<unix-ms>.png) and point sales_certificate_signature_path at it,
-- so earlier files stay. Each policy records the path current at issue (policies.signature_path, part
-- of the immutable policy record). Customers fetch it through GET /api/account/policies/:id/signature;
-- staff read it from public.sales_policy_list and download it with their JWT (policy below).

alter table sales.policies add column signature_path text
  check (signature_path is null or signature_path ~ '^settings/[A-Za-z0-9._-]{1,120}\.(png|jpg|jpeg|webp)$');
comment on column sales.policies.signature_path is
  'Storage path (bucket customer-files) of the certificate signature image in force at issue; null = dotted line only.';

-- Staff with policies.view can read the signature images (customer files stay proposals.view / customers.view).
-- Writing under settings/ is products.manage (customer_files_settings_insert/update/delete, 202611130002).
create policy customer_files_settings_read on storage.objects for select to authenticated using (
  bucket_id = 'customer-files' and name like 'settings/%' and (select app.has_perm('policies.view'))
);

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
                              insured_subject, starts_on, expires_on, premium, sum_insured, certificate, issued_at,
                              signature_path)
  values (r.policy_no, r.certificate_no, p_customer_id, v.id, pay.id, v.product_code,
          left(p_certificate ->> 'coverTitle', 120), v.insured_subject, r.starts_on, r.expires_on,
          coalesce(v.premium, (v.quote ->> 'premium')::numeric, pay.amount), v.sum_insured, p_certificate, r.issued_at,
          -- The signature image in force at issue; later uploads use new versioned paths, so it stays valid.
          nullif(sales.setting_text('sales_certificate_signature_path', ''), ''));
  update sales.proposals set status = 'issued' where id = v.id;
  perform sales.log_event(v.id, 'system', null, 'issued', 'paid', 'issued', r.policy_no);
  return sales.payment_json(pay);
end;
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
    || sales.strip_top(jsonb_build_object('certificate', pol.certificate, 'payment', sales.payment_json(pay),
                                           'signaturePath', pol.signature_path));
end;
$$;

create or replace view public.sales_policy_list with (security_invoker = true) as
select pol.id, pol.policy_no, pol.certificate_no, pol.customer_id, c.customer_no,
       coalesce(c.full_name, c.company_name) as customer_name, pol.proposal_id, p.proposal_no, pol.payment_id,
       pay.reference as payment_reference, pol.product_code, pol.cover_title, pol.insured_subject, pol.starts_on,
       pol.expires_on, pol.premium, pol.sum_insured, pol.certificate, pol.status as stored_status,
       sales.policy_status(pol) as status, pol.issued_at, pol.cancelled_at, pol.cancelled_by, pol.cancel_reason,
       pol.signature_path
from sales.policies pol
left join sales.customers c on c.id = pol.customer_id
left join sales.proposals p on p.id = pol.proposal_id
left join sales.payments pay on pay.id = pol.payment_id;

revoke all on function public.account_payment_complete(uuid, text, boolean, text, jsonb), public.account_get_policy(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.account_payment_complete(uuid, text, boolean, text, jsonb), public.account_get_policy(uuid, uuid)
  to service_role;
revoke all on public.sales_policy_list from public, anon;
grant select on public.sales_policy_list to authenticated;
