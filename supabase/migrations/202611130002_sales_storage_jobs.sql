-- Online sales: private storage bucket for customer files and the scheduled clean-up jobs.

-- ---------------------------------------------------------------------------
-- Bucket customer-files (architecture.md › Data model):
--   {customer_id}/{proposal_id}/{file_id}.{ext}     attachments
--   {customer_id}/{proposal_id}/signature.png       signatures
--   settings/…                                      certificate signature image (administrators)
-- The Worker uploads and downloads with the service key after its own ownership checks; staff read
-- with their JWT through the policy below. Customers never get a storage token.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-files', 'customer-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create policy customer_files_staff_read on storage.objects for select to authenticated using (
  bucket_id = 'customer-files'
  and ((select app.has_perm('proposals.view')) or (select app.has_perm('customers.view')))
);
-- The certificate signature image: administrators with products.manage, under settings/ only.
create policy customer_files_settings_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'customer-files' and name like 'settings/%' and (select app.has_perm('products.manage'))
);
create policy customer_files_settings_update on storage.objects for update to authenticated
  using (bucket_id = 'customer-files' and name like 'settings/%' and (select app.has_perm('products.manage')))
  with check (bucket_id = 'customer-files' and name like 'settings/%' and (select app.has_perm('products.manage')));
create policy customer_files_settings_delete on storage.objects for delete to authenticated using (
  bucket_id = 'customer-files' and name like 'settings/%' and (select app.has_perm('products.manage'))
);

-- ---------------------------------------------------------------------------
-- Clean-up: expired sign-in codes (kept 24 h for rate limiting) and dead sessions.
-- ---------------------------------------------------------------------------
create or replace function sales.purge_expired_auth()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otp int;
  v_sessions int;
begin
  delete from sales.otp_challenges where created_at < now() - interval '24 hours';
  get diagnostics v_otp = row_count;
  delete from sales.customer_sessions
   where expires_at <= now() or last_seen_at <= now() - interval '7 days';
  get diagnostics v_sessions = row_count;
  return jsonb_build_object('otp_challenges', v_otp, 'sessions', v_sessions);
end;
$$;
comment on function sales.purge_expired_auth() is 'Deletes OTP challenges older than 24 h and expired or idle customer sessions (pg_cron, hourly).';

-- Quotes past their validUntil date lapse (architecture.md › Proposal lifecycle).
create or replace function sales.expire_quotes()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int := 0;
  r record;
begin
  for r in
    select p.id from sales.proposals p
     where p.status = 'quoted' and (p.quote ->> 'validUntil')::date < current_date
     for update skip locked
  loop
    update sales.proposals set status = 'expired' where id = r.id;
    update sales.payments set status = 'failed', failure_reason = 'The quote expired.', completed_at = now()
     where proposal_id = r.id and status = 'pending';
    insert into sales.proposal_events (proposal_id, actor_type, event, from_status, to_status, note)
    values (r.id, 'system', 'expired', 'quoted', 'expired', 'The quote passed its expiry date.');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
comment on function sales.expire_quotes() is 'Moves quoted proposals past quote.validUntil to expired (pg_cron, daily).';

revoke all on function sales.purge_expired_auth(), sales.expire_quotes() from public, anon, authenticated;

select cron.schedule('sales-purge-auth', '20 * * * *', 'select sales.purge_expired_auth()');
select cron.schedule('sales-expire-quotes', '5 0 * * *', 'select sales.expire_quotes()');
