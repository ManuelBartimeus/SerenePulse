-- Online claims (ownership, active policy, incident date inside cover and not in the future,
-- required documents, transitions with permissions and audit) and policy renewal (dates moved on,
-- answers copied, files and signature not copied).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create or replace function pg_temp.h(p text) returns text language sql as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;

insert into sales.customers (id, phone_e164, full_name) values
  ('c0000000-0000-4000-8000-0000000000ca', '+233240000011', 'Esi Owusu'),
  ('c0000000-0000-4000-8000-0000000000cb', '+233240000012', 'Yaw Darko');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000061a1', 'uw-claims@example.test'),
  ('00000000-0000-0000-0000-0000000061a2', 'cx-claims@example.test');
update public.profiles set status = 'active', must_change_password = false, display_name = 'Claims staff'
 where user_id::text like '00000000-0000-0000-0000-0000000061a%';
insert into public.user_role_grants (user_id, role_id, scope_type, status, approved_at)
select u.id::uuid, r.id, 'organisation', 'active', now()
from (values ('00000000-0000-0000-0000-0000000061a1', 'underwriter'), ('00000000-0000-0000-0000-0000000061a2', 'cx_admin')) u(id, role)
join public.roles r on r.key = u.role;
create or replace function pg_temp.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (public.custom_access_token_hook(jsonb_build_object(
    'user_id', p_user::uuid, 'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated'))) -> 'claims')::text, true);
end $$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- An issued motor policy for a customer, through the real functions.
create or replace function pg_temp.issue(p_customer uuid) returns uuid language plpgsql as $$
declare
  v_p uuid;
  v_ref text;
  r jsonb;
begin
  v_p := (public.account_create_proposal(p_customer, 'MTR', 'motor', 1,
          '{"cover_type": "tpo", "cover_start": "2026-01-01", "cover_end": "2026-12-31", "id_photo": ["x"], "reg": "GN 1-18"}') ->> 'id')::uuid;
  perform public.account_add_file(p_customer, v_p, gen_random_uuid(), 'id_photo', 'id_selfie', 'image/jpeg', 10, 'me.jpg',
    encode(extensions.digest('me', 'sha256'), 'hex'), 'jpg', 2);
  perform public.account_submit_proposal(p_customer, v_p, 1,
    '{"cover_type": "tpo", "cover_start": "2026-01-01", "cover_end": "2026-12-31", "id_photo": ["x"], "reg": "GN 1-18"}',
    array['terms'], jsonb_build_object('signedName', 'E O', 'answersSha256', encode(extensions.digest('a', 'sha256'), 'hex')),
    '{}', '{"premium": 557, "total": 557}', '{}', 30000, null, null, 'GN 1-18 · Kia Rio', null, null);
  v_ref := public.account_payment_start(p_customer, v_p, 'momo', 'mtn', '024 *** 1111') ->> 'reference';
  r := public.account_payment_reserve(p_customer, v_ref, 'MTP');
  perform public.account_payment_complete(p_customer, v_ref, true, null,
    jsonb_build_object('certificateNo', r ->> 'certificateNo', 'policyNo', r ->> 'policyNo', 'coverTitle', 'MOTOR THIRD PARTY ONLY'));
  return (select id from sales.policies where proposal_id = v_p);
end $$;

create temporary table v (k text primary key, j jsonb);
grant all on v to authenticated;
create or replace function pg_temp.g(p_k text) returns jsonb language sql as $$ select j from v where k = p_k $$;
create or replace function pg_temp.id(p_k text) returns uuid language sql as $$ select (j ->> 'id')::uuid from v where k = p_k $$;
grant execute on function pg_temp.g(text), pg_temp.id(text) to authenticated;
insert into v values ('pol', to_jsonb(pg_temp.issue('c0000000-0000-4000-8000-0000000000ca')));
create or replace function pg_temp.pol() returns uuid language sql as $$ select (j #>> '{}')::uuid from v where k = 'pol' $$;
grant execute on function pg_temp.pol() to authenticated;
select ok(pg_temp.pol() is not null, 'fixture: an issued policy');

create or replace function pg_temp.claim(p_customer uuid, p_policy uuid, p_date date)
returns jsonb language sql as $$
  select public.account_create_claim(p_customer, p_policy, 'motor_own_damage', p_date, 'Spintex Road, Accra',
    'Another car hit my rear bumper at the traffic lights.', 2500, '{"name": "K. Asare", "vehicleReg": "GR 2224-AD"}')
$$;

-- ---------------------------------------------------------------------------
-- Creating a claim
-- ---------------------------------------------------------------------------
select throws_ok(format($$select pg_temp.claim('c0000000-0000-4000-8000-0000000000cb', %L, current_date)$$, pg_temp.pol()),
  'P0001', 'not-found', 'customer B cannot claim on A''s policy');
select throws_ok(format($$select pg_temp.claim('c0000000-0000-4000-8000-0000000000ca', %L, current_date + 1)$$, pg_temp.pol()),
  'P0001', 'incident-in-future', 'the incident date cannot be in the future');
select throws_ok(format($$select pg_temp.claim('c0000000-0000-4000-8000-0000000000ca', %L, current_date - 1)$$, pg_temp.pol()),
  'P0001', 'incident-outside-cover', 'the incident must be inside the cover period');
select throws_ok(format($$select public.account_create_claim('c0000000-0000-4000-8000-0000000000ca', %L, 'motor_own_damage', current_date,
  'Accra', 'too short', null, null)$$, pg_temp.pol()), '22023', null, 'the description must be 20 characters or more');
insert into v values ('c1', pg_temp.claim('c0000000-0000-4000-8000-0000000000ca', pg_temp.pol(), current_date));
select ok((pg_temp.g('c1') ->> 'claimNo') ~ ('^CLM-' || to_char(now(), 'YY') || '-[0-9]{6}$'), 'claim numbers are CLM-yy-000000');
select is(pg_temp.g('c1') ->> 'status', 'draft', 'a new claim is a draft until it is sent');
select is(pg_temp.g('c1') ->> 'policyNo', (select policy_no from sales.policies where id = pg_temp.pol()), 'the claim names its policy');
select throws_ok(format($$select public.account_get_claim('c0000000-0000-4000-8000-0000000000cb', %L)$$, pg_temp.id('c1')),
  'P0001', 'not-found', 'customer B cannot read A''s claim');
select is(public.account_list_claims('c0000000-0000-4000-8000-0000000000cb'), '[]'::jsonb, 'B has no claims');

-- ---------------------------------------------------------------------------
-- Documents and submit
-- ---------------------------------------------------------------------------
select throws_ok(format($$select public.account_add_claim_file('c0000000-0000-4000-8000-0000000000cb', %L, gen_random_uuid(),
  'claim_photos', 'image/jpeg', 10, 'a.jpg', %L, 'jpg')$$, pg_temp.id('c1'), pg_temp.h('a')),
  'P0001', 'not-found', 'customer B cannot add documents to A''s claim');
select throws_ok(format($$select public.account_add_claim_file('c0000000-0000-4000-8000-0000000000ca', %L, gen_random_uuid(),
  'id_front', 'image/jpeg', 10, 'a.jpg', %L, 'jpg')$$, pg_temp.id('c1'), pg_temp.h('a')),
  'P0001', 'kind-refused', 'Ghana Card images are refused on claims too');
select public.account_add_claim_file('c0000000-0000-4000-8000-0000000000ca', pg_temp.id('c1'), 'f0000000-0000-4000-8000-0000000000c1',
  'claim_photos', 'image/jpeg', 100, 'damage.jpg', pg_temp.h('d'), 'jpg');
select throws_ok(format($$select public.account_submit_claim('c0000000-0000-4000-8000-0000000000ca', %L,
  array['claim_photos', 'repair_estimate', 'drivers_licence'])$$, pg_temp.id('c1')),
  'P0001', 'documents-missing', 'every required document must be attached before sending');
select public.account_add_claim_file('c0000000-0000-4000-8000-0000000000ca', pg_temp.id('c1'), gen_random_uuid(),
  'repair_estimate', 'application/pdf', 100, 'estimate.pdf', pg_temp.h('e'), 'pdf');
select public.account_add_claim_file('c0000000-0000-4000-8000-0000000000ca', pg_temp.id('c1'), gen_random_uuid(),
  'drivers_licence', 'image/png', 100, 'licence.png', pg_temp.h('l'), 'png');
select is(public.account_submit_claim('c0000000-0000-4000-8000-0000000000ca', pg_temp.id('c1'),
  array['claim_photos', 'repair_estimate', 'drivers_licence']) ->> 'status', 'received', 'with all documents the claim is received');
select is(public.account_get_file('c0000000-0000-4000-8000-0000000000ca', 'f0000000-0000-4000-8000-0000000000c1') ->> 'claimId',
  pg_temp.id('c1')::text, 'the owner can download a claim document');
select throws_ok($$select public.account_get_file('c0000000-0000-4000-8000-0000000000cb', 'f0000000-0000-4000-8000-0000000000c1')$$,
  'P0001', 'not-found', 'customer B cannot');
select throws_ok(format($$update sales.claims set description = 'Changed my story completely after sending.' where id = %L$$, pg_temp.id('c1')),
  '42501', null, 'a sent claim''s details are frozen');
select throws_ok(format($$select public.account_respond_claim('c0000000-0000-4000-8000-0000000000ca', %L, 'hello')$$, pg_temp.id('c1')),
  'P0001', 'not-editable', 'customers respond only when asked');

-- ---------------------------------------------------------------------------
-- Staff transitions
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000061a2');
set local role authenticated;
select is((select status from public.sales_claim_list where id = pg_temp.id('c1')), 'received', 'CX admins see claims');
select throws_ok(format($$select public.staff_update_claim(%L, 'under_review')$$, pg_temp.id('c1')), '42501', null,
  'CX admins cannot move claims (claims.manage)');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000061a1');
set local role authenticated;
select throws_ok(format($$select public.staff_update_claim(%L, 'approved')$$, pg_temp.id('c1')), 'P0001', null,
  'a received claim must be assessed before approval');
select is(public.staff_update_claim(pg_temp.id('c1'), 'under_review') ->> 'status', 'under_review', 'received → under review');
select throws_ok(format($$select public.staff_update_claim(%L, 'info_requested', '')$$, pg_temp.id('c1')), '22023', null,
  'asking for more needs a message');
select is(public.staff_update_claim(pg_temp.id('c1'), 'info_requested', 'Please add the police report.') ->> 'status', 'info_requested',
  'under review → information requested');
reset role;
select public.account_add_claim_file('c0000000-0000-4000-8000-0000000000ca', pg_temp.id('c1'), gen_random_uuid(),
  'police_report', 'application/pdf', 100, 'police.pdf', pg_temp.h('p'), 'pdf');
select is(public.account_respond_claim('c0000000-0000-4000-8000-0000000000ca', pg_temp.id('c1'), 'Police report attached.') ->> 'status',
  'under_review', 'the customer''s response sends it back for assessment');
select pg_temp.as_user('00000000-0000-0000-0000-0000000061a1');
set local role authenticated;
select is(public.staff_update_claim(pg_temp.id('c1'), 'approved', 'Liability accepted.') ->> 'status', 'approved', 'under review → approved');
select is(public.staff_update_claim(pg_temp.id('c1'), 'settled', 'Paid GHS 2,300.00 by MoMo.') ->> 'status', 'settled', 'approved → settled');
select throws_ok(format($$select public.staff_update_claim(%L, 'under_review')$$, pg_temp.id('c1')), 'P0001', null,
  'a settled claim is final');
reset role;
select is((select array_agg(e ->> 'status' order by ord) from jsonb_array_elements(
             public.account_get_claim('c0000000-0000-4000-8000-0000000000ca', pg_temp.id('c1')) -> 'events') with ordinality t(e, ord)),
  array['draft', 'received', 'under_review', 'info_requested', 'under_review', 'approved', 'settled'],
  'the customer sees the whole history');
select is((select assigned_to from sales.claims where id = pg_temp.id('c1')), '00000000-0000-0000-0000-0000000061a1'::uuid,
  'the first staff member to act is assigned');
select ok((select count(*) from audit.log where action = 'sales.claim.update' and entity_id = pg_temp.id('c1')::text) = 4,
  'every staff transition is audited');

-- Cancelled or expired policies take no new claims.
alter table sales.policies disable trigger policies_guard;
update sales.policies set starts_on = current_date - 400, expires_on = current_date - 35 where id = pg_temp.pol();
alter table sales.policies enable trigger policies_guard;
select throws_ok(format($$select pg_temp.claim('c0000000-0000-4000-8000-0000000000ca', %L, current_date - 40)$$, pg_temp.pol()),
  'P0001', 'policy-not-active', 'an expired policy takes no new claims');

-- ---------------------------------------------------------------------------
-- Renewal
-- ---------------------------------------------------------------------------
select throws_ok(format($$select public.account_renew_policy('c0000000-0000-4000-8000-0000000000cb', %L, 1)$$, pg_temp.pol()),
  'P0001', 'not-found', 'customer B cannot renew A''s policy');
insert into v values ('ren1', public.account_renew_policy('c0000000-0000-4000-8000-0000000000ca', pg_temp.pol(), 2,
  array['cover_start'], array['cover_end'], array['id_photo']));
select is(pg_temp.g('ren1') ->> 'status', 'draft', 'renewal creates a new draft');
select is(pg_temp.g('ren1') ->> 'productCode', 'MTR', 'for the same product');
select is((pg_temp.g('ren1') -> 'answers') ->> 'cover_start', to_char(current_date, 'YYYY-MM-DD'),
  'an expired policy renews from today');
select is((pg_temp.g('ren1') -> 'answers') ->> 'cover_end', to_char(current_date + interval '1 year' - interval '1 day', 'YYYY-MM-DD'),
  'for one year');
select is((pg_temp.g('ren1') -> 'answers') ->> 'reg', 'GN 1-18', 'the previous answers are copied');
select ok(not ((pg_temp.g('ren1') -> 'answers') ? 'id_photo'), 'file answers are not copied');
select is(jsonb_array_length(pg_temp.g('ren1') -> 'files'), 0, 'files are not copied');
select ok(not (pg_temp.g('ren1') ? 'signature'), 'the signature is not copied');
select is((pg_temp.g('ren1') ->> 'formVersion')::int, 2, 'the renewal uses the current form version');

insert into v values ('pol2', to_jsonb(pg_temp.issue('c0000000-0000-4000-8000-0000000000cb')));
insert into v values ('ren2', public.account_renew_policy('c0000000-0000-4000-8000-0000000000cb', (pg_temp.g('pol2') #>> '{}')::uuid, 1,
  array['cover_start'], array['cover_end'], '{}'));
select is((pg_temp.g('ren2') -> 'answers') ->> 'cover_start',
  to_char((select expires_on + 1 from sales.policies where id = (pg_temp.g('pol2') #>> '{}')::uuid), 'YYYY-MM-DD'),
  'a live policy renews from the day after it expires');

-- ---------------------------------------------------------------------------
-- Certificate signature image in force at issue (202611130006)
-- ---------------------------------------------------------------------------
select is((select signature_path from sales.policies where id = pg_temp.pol()), null::text,
  'a policy issued before any signature upload has none (dotted line only)');
update public.settings set value = '"settings/signature-1731000000000.png"' where key = 'sales_certificate_signature_path';
insert into v values ('pol3', to_jsonb(pg_temp.issue('c0000000-0000-4000-8000-0000000000cb')));
create or replace function pg_temp.pol3() returns uuid language sql as $$ select (j #>> '{}')::uuid from v where k = 'pol3' $$;
select is((select signature_path from sales.policies where id = pg_temp.pol3()), 'settings/signature-1731000000000.png',
  'issuing records the signature image in force');
update public.settings set value = '"settings/signature-1732000000000.png"' where key = 'sales_certificate_signature_path';
select is((select signature_path from sales.policies where id = pg_temp.pol3()), 'settings/signature-1731000000000.png',
  'a later upload does not change issued certificates');
select is(public.account_get_policy('c0000000-0000-4000-8000-0000000000cb', pg_temp.pol3()) ->> 'signaturePath',
  'settings/signature-1731000000000.png', 'the owner''s policy detail names it for the Worker');
select throws_ok(format($$update sales.policies set signature_path = 'settings/other.png' where id = %L$$, pg_temp.pol3()),
  '42501', null, 'the recorded signature path is immutable');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sales_policy_list'
                  and column_name = 'signature_path'), 'staff see the path in sales_policy_list');
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'customer_files_settings_read')
          and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'customer_files_settings_insert'),
  'policies.view reads and products.manage writes under settings/');

select * from finish();
rollback;
