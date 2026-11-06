-- Online sales lifecycle: ownership (customer A never reaches B's records), drafts, files, submit and
-- freezing, staff review/quote/request-info/decline/cancel with permissions and audit, transitions,
-- payment start/decline/approval (idempotent), numbering, policy immutability, verify_certificate
-- privacy, quote expiry, the NIA identity check (L.I. 2523).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create or replace function pg_temp.h(p text) returns text language sql as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;

-- ---------------------------------------------------------------------------
-- Fixtures: two customers, five staff members with claims exactly as the hook mints them.
-- ---------------------------------------------------------------------------
insert into sales.customers (id, phone_e164, full_name) values
  ('c0000000-0000-4000-8000-00000000000a', '+233240000001', 'Ama Kwarteng Mensah'),
  ('c0000000-0000-4000-8000-00000000000b', '+233240000002', 'Kofi Boateng');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000060a1', 'uw@example.test'),
  ('00000000-0000-0000-0000-0000000060a2', 'cx@example.test'),
  ('00000000-0000-0000-0000-0000000060a3', 'aud@example.test'),
  ('00000000-0000-0000-0000-0000000060a4', 'sa@example.test'),
  ('00000000-0000-0000-0000-0000000060a5', 'none@example.test');
update public.profiles set status = 'active', must_change_password = false, display_name = 'Staff ' || right(user_id::text, 2)
 where user_id::text like '00000000-0000-0000-0000-0000000060a%';
insert into public.user_role_grants (user_id, role_id, scope_type, status, approved_at)
select u.id::uuid, r.id, 'organisation', 'active', now()
from (values ('00000000-0000-0000-0000-0000000060a1', 'underwriter'), ('00000000-0000-0000-0000-0000000060a2', 'cx_admin'),
             ('00000000-0000-0000-0000-0000000060a3', 'auditor'), ('00000000-0000-0000-0000-0000000060a4', 'system_admin')) u(id, role)
join public.roles r on r.key = u.role;

create or replace function pg_temp.as_user(p_user text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (public.custom_access_token_hook(jsonb_build_object(
    'user_id', p_user::uuid, 'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated'))) -> 'claims')::text, true);
end $$;
grant execute on function pg_temp.as_user(text) to authenticated;

create temporary table v (k text primary key, j jsonb);
grant all on v to authenticated;
create or replace function pg_temp.g(p_k text) returns jsonb language sql as $$ select j from v where k = p_k $$;
create or replace function pg_temp.id(p_k text) returns uuid language sql as $$ select (j ->> 'id')::uuid from v where k = p_k $$;
grant execute on function pg_temp.g(text), pg_temp.id(text) to authenticated;

create or replace function pg_temp.sig() returns jsonb language sql as $$
  select jsonb_build_object('method', 'drawn', 'signedName', 'Ama Mensah', 'answersSha256', encode(extensions.digest('a', 'sha256'), 'hex'),
                            'imagePath', 'c0000000-0000-4000-8000-00000000000a/x/signature.png', 'ip', '203.0.113.9')
$$;
create or replace function pg_temp.submit(p_customer uuid, p_proposal uuid, p_files uuid[] default '{}', p_quote jsonb default null,
                                          p_start date default null)
returns jsonb language sql as $$
  select public.account_submit_proposal(p_customer, p_proposal, 1, '{"cover_type": "tpo", "reg": "GN 3181-18"}'::jsonb,
    array['terms', 'data_processing', 'electronic_signature'], pg_temp.sig(), p_files, p_quote, '{}', 50000, p_start, null,
    'GN 3181-18 · Nissan Rogue', '{"email": "ama@example.test"}'::jsonb, true)
$$;

-- ---------------------------------------------------------------------------
-- Drafts and numbering
-- ---------------------------------------------------------------------------
insert into v values ('p1', public.account_create_proposal('c0000000-0000-4000-8000-00000000000a', 'MTR', 'motor', 1, '{"cover_type": "tpo"}'));
select ok((pg_temp.g('p1') ->> 'proposalNo') ~ ('^PRP-' || to_char(now(), 'YY') || '-[0-9]{6}$'), 'proposal numbers are PRP-yy-000000');
select is(pg_temp.g('p1') ->> 'status', 'draft', 'a new proposal is a draft');
select is(jsonb_array_length(pg_temp.g('p1') -> 'history'), 1, 'creating it is recorded in the history');
select is(sales.pad(123456, 5), '123456', 'zero padding never truncates long numbers');

select throws_ok(format($$select public.account_get_proposal('c0000000-0000-4000-8000-00000000000b', %L)$$, pg_temp.id('p1')),
  'P0001', 'not-found', 'customer B cannot read A''s proposal');
select throws_ok(format($$select public.account_save_proposal('c0000000-0000-4000-8000-00000000000b', %L, '{}', 1)$$, pg_temp.id('p1')),
  'P0001', 'not-found', 'customer B cannot save A''s proposal');
select throws_ok(format($$select public.account_cancel_proposal('c0000000-0000-4000-8000-00000000000b', %L)$$, pg_temp.id('p1')),
  'P0001', 'not-found', 'customer B cannot cancel A''s proposal');
select throws_ok(format($$select pg_temp.submit('c0000000-0000-4000-8000-00000000000b', %L)$$, pg_temp.id('p1')),
  'P0001', 'not-found', 'customer B cannot submit A''s proposal');
select is(public.account_list_proposals('c0000000-0000-4000-8000-00000000000b'), '[]'::jsonb, 'B''s list does not include A''s proposal');

select is((public.account_save_proposal('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p1'),
            '{"cover_type": "tpo", "note": null}', 2) ->> 'currentStep'), '2', 'saving a draft keeps the resume step');
select is((public.account_get_proposal('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p1')) -> 'answers'),
  '{"cover_type": "tpo", "note": null}'::jsonb, 'answers are stored as given, nulls included');

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------
insert into v values ('f1', public.account_add_file('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p1'),
  'f0000000-0000-4000-8000-000000000001', 'id_photo', 'id_selfie', 'image/jpeg', 1234, 'me.jpg', pg_temp.h('img'), 'jpg', 2));
select is(pg_temp.g('f1') ->> 'storagePath',
  'c0000000-0000-4000-8000-00000000000a/' || pg_temp.id('p1') || '/f0000000-0000-4000-8000-000000000001.jpg',
  'files are stored under customer/proposal/file');
select throws_ok(format($$select public.account_add_file('c0000000-0000-4000-8000-00000000000a', %L,
  'f0000000-0000-4000-8000-000000000002', 'id_card', 'ghana_card', 'image/jpeg', 10, 'card.jpg', %L, 'jpg', 2)$$,
  pg_temp.id('p1'), pg_temp.h('c')), 'P0001', 'kind-refused', 'Ghana Card images are never accepted (L.I. 2523)');
select throws_ok(format($$select public.account_add_file('c0000000-0000-4000-8000-00000000000b', %L,
  'f0000000-0000-4000-8000-000000000003', 'photo', 'vehicle_front', 'image/jpeg', 10, 'car.jpg', %L, 'jpg', 2)$$,
  pg_temp.id('p1'), pg_temp.h('c')), 'P0001', 'not-found', 'customer B cannot attach files to A''s proposal');
select throws_ok($$select public.account_get_file('c0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000001')$$,
  'P0001', 'not-found', 'customer B cannot download A''s file');
select is(public.account_get_file('c0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000001') ->> 'mime',
  'image/jpeg', 'the owner can');
select public.account_add_file('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p1'),
  'f0000000-0000-4000-8000-000000000004', 'id_photo', 'id_selfie', 'image/png', 99, 'b.png', pg_temp.h('b'), 'png', 2);
select throws_ok(format($$select public.account_add_file('c0000000-0000-4000-8000-00000000000a', %L,
  'f0000000-0000-4000-8000-000000000005', 'id_photo', 'id_selfie', 'image/png', 99, 'c.png', %L, 'png', 2)$$,
  pg_temp.id('p1'), pg_temp.h('c')), 'P0001', 'too-many-files', 'a field takes at most its maxFiles');
select is(public.account_delete_file('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p1'), 'f0000000-0000-4000-8000-000000000004') ->> 'storagePath',
  'c0000000-0000-4000-8000-00000000000a/' || pg_temp.id('p1') || '/f0000000-0000-4000-8000-000000000004.png',
  'deleting a draft file returns its storage path for the Worker to remove');

-- B's own draft and file, to try to reference it from A's submission.
insert into v values ('pb', public.account_create_proposal('c0000000-0000-4000-8000-00000000000b', 'MTR', 'motor', 1, '{}'));
select public.account_add_file('c0000000-0000-4000-8000-00000000000b', pg_temp.id('pb'),
  'f0000000-0000-4000-8000-0000000000b1', 'photo', 'vehicle_front', 'image/jpeg', 10, 'car.jpg', pg_temp.h('car'), 'jpg', 5);
select throws_ok(format($$select pg_temp.submit('c0000000-0000-4000-8000-00000000000a', %L, array['f0000000-0000-4000-8000-0000000000b1']::uuid[])$$,
  pg_temp.id('p1')), 'P0001', 'files-invalid', 'a submission cannot reference another customer''s file');

-- ---------------------------------------------------------------------------
-- Submit (underwriter route) and freezing
-- ---------------------------------------------------------------------------
insert into v values ('s1', pg_temp.submit('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p1'),
  array['f0000000-0000-4000-8000-000000000001']::uuid[], null, current_date + 5));
select is(pg_temp.g('s1') ->> 'status', 'submitted', 'without a price the proposal waits for an underwriter');
select ok((pg_temp.g('s1') #>> '{signature,signedAt}') is not null, 'the server stamps the signature time');
select is((select identity_status from sales.customers where id = 'c0000000-0000-4000-8000-00000000000a'), 'pending',
  'a face photo puts the customer''s identity check in the queue');
select is((select email from sales.customers where id = 'c0000000-0000-4000-8000-00000000000a'), 'ama@example.test',
  'answers marked saveToProfile update the profile');
select ok((select marketing_consent and marketing_consent_at is not null and data_consent_at is not null
             from sales.customers where id = 'c0000000-0000-4000-8000-00000000000a'), 'consents are recorded with timestamps');
select throws_ok(format($$select public.account_save_proposal('c0000000-0000-4000-8000-00000000000a', %L, '{}', 0)$$, pg_temp.id('p1')),
  'P0001', 'not-editable', 'a submitted proposal cannot be saved');
select throws_ok(format($$update sales.proposals set answers = '{"cover_type": "comprehensive"}' where id = %L$$, pg_temp.id('p1')),
  '42501', null, 'answers are frozen after submit, even for direct writes');
select throws_ok(format($$update sales.proposals set status = 'issued' where id = %L$$, pg_temp.id('p1')),
  '23514', null, 'the lifecycle refuses impossible transitions');
select throws_ok(format($$select public.account_add_file('c0000000-0000-4000-8000-00000000000a', %L,
  'f0000000-0000-4000-8000-000000000006', 'x', 'vehicle_front', 'image/jpeg', 10, 'a.jpg', %L, 'jpg', 2)$$, pg_temp.id('p1'), pg_temp.h('a')),
  'P0001', 'not-editable', 'files cannot be added after submit');

-- ---------------------------------------------------------------------------
-- Staff: permissions, review, quote, audit
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000060a2');  -- cx_admin: view only
set local role authenticated;
select is((select status from public.sales_proposal_queue where id = pg_temp.id('p1')), 'submitted', 'CX admins see the queue');
select is((select proposal_count from public.sales_customer_list where id = 'c0000000-0000-4000-8000-00000000000a'), 1,
  'the customer list counts proposals');
select throws_ok(format($$select public.staff_review_proposal(%L)$$, pg_temp.id('p1')), '42501', null,
  'CX admins cannot review (proposals.review)');
select throws_ok(format($$select public.staff_set_identity_status('c0000000-0000-4000-8000-00000000000a', 'verified', 'NIA-1', null)$$),
  '42501', null, 'recording the identity check needs proposals.review as well');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000060a5');  -- no grants
set local role authenticated;
select is((select count(*)::int from public.sales_proposal_queue), 0, 'staff without sales permissions see no proposals');
select is((select count(*)::int from public.sales_customer_list), 0, 'or customers');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000060a1');  -- underwriter
set local role authenticated;
select is(public.staff_review_proposal(pg_temp.id('p1')) ->> 'status', 'under_review', 'an underwriter opens the proposal');
select throws_ok(format($$select public.staff_review_proposal(%L)$$, pg_temp.id('p1')), 'P0001', null,
  'it can only be opened once');
select throws_ok(format($$select public.staff_quote_proposal(%L, 0, '[]', '[]')$$, pg_temp.id('p1')), '22023', null,
  'a premium must be above zero');
insert into v values ('q1', public.staff_quote_proposal(pg_temp.id('p1'), 1000, '[{"label": "Basic premium", "amount": 1000}]',
  '[{"label": "VAT 15%", "amount": 150}, {"label": "NHIL 2.5%", "amount": 25}, {"label": "GETFund 2.5%", "amount": 25}]',
  'Includes ECOWAS Brown Card.'));
select is(pg_temp.g('q1') ->> 'status', 'quoted', 'pricing moves it to quoted');
select is((pg_temp.g('q1') #>> '{quote,total}')::numeric, 1200.00, 'the total adds the taxes');
select is(pg_temp.g('q1') #>> '{quote,validUntil}', to_char(current_date + 30, 'YYYY-MM-DD'), 'quotes are valid for sales_quote_validity_days');
select is(pg_temp.g('q1') #>> '{quote,source}', 'underwriter', 'the quote says an underwriter priced it');
select is(public.staff_set_identity_status('c0000000-0000-4000-8000-00000000000a', 'verified', 'NIA-TX-0001', 'Face matched') ->> 'identityStatus',
  'verified', 'an underwriter records the NIA check');
select throws_ok($$select public.staff_set_identity_status('c0000000-0000-4000-8000-00000000000a', 'verified', '', null)$$,
  '22023', null, 'a verified identity needs the NIA reference');
reset role;
select ok(exists (select 1 from audit.log where action = 'sales.proposal.quote' and entity_id = pg_temp.id('p1')::text),
  'pricing is audited');
select ok(exists (select 1 from audit.log where action = 'sales.customer.identity'), 'the identity check is audited');
select is((select actor_name from sales.proposal_events where proposal_id = pg_temp.id('p1') and event = 'quoted'), 'Staff a1',
  'staff history keeps the staff member''s name');
select ok(not exists (select 1 from jsonb_array_elements(public.account_get_proposal('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p1')) -> 'history') e
                      where e::text like '%Staff a1%'),
  'customers never see staff names in the history');

-- ---------------------------------------------------------------------------
-- Payments and issuing
-- ---------------------------------------------------------------------------
select throws_ok(format($$select public.account_payment_start('c0000000-0000-4000-8000-00000000000b', %L, 'momo', 'mtn', '024 *** 4567')$$, pg_temp.id('p1')),
  'P0001', 'not-found', 'customer B cannot pay for A''s proposal');
insert into v values ('pay1', public.account_payment_start('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p1'), 'momo', 'mtn', '024 *** 4567'));
select ok((pg_temp.g('pay1') ->> 'reference') ~ '^PAY-[A-Z0-9]{10}$', 'payment references are PAY- + 10 characters');
select is((pg_temp.g('pay1') ->> 'amount')::numeric, 1200.00, 'the amount is the quote total');
select is(pg_temp.g('pay1') ->> 'status', 'pending', 'a payment starts pending');
select throws_ok(format($$select public.account_get_payment('c0000000-0000-4000-8000-00000000000b', %L)$$, pg_temp.g('pay1') ->> 'reference'),
  'P0001', 'not-found', 'customer B cannot read A''s payment');
select throws_ok(format($$select public.account_payment_complete('c0000000-0000-4000-8000-00000000000a', %L, true, null, '{}')$$,
  pg_temp.g('pay1') ->> 'reference'), 'P0001', 'not-reserved', 'approval needs reserved numbers first');

insert into v values ('r1', public.account_payment_reserve('c0000000-0000-4000-8000-00000000000a', pg_temp.g('pay1') ->> 'reference', 'MTP'));
select ok((pg_temp.g('r1') ->> 'policyNo') ~ ('^SE' || to_char(now(), 'YY') || 'MTP[0-9]{5,}-E$'), 'policy numbers are SE{yy}{code}{seq5}-E');
select ok((pg_temp.g('r1') ->> 'certificateNo') ~ ('^C01-' || to_char(now(), 'YY') || '-[0-9]{5,}$'), 'certificate numbers are C{series}-{yy}-{seq5}');
select is((pg_temp.g('r1') ->> 'startsOn')::date, current_date + 5, 'cover starts on the chosen date');
select is((pg_temp.g('r1') ->> 'expiresOn')::date, (current_date + 5 + interval '1 year' - interval '1 day')::date,
  'and runs for a year');
select is(public.account_payment_reserve('c0000000-0000-4000-8000-00000000000a', pg_temp.g('pay1') ->> 'reference', 'MTP') ->> 'policyNo',
  pg_temp.g('r1') ->> 'policyNo', 'a retried approval reuses the same numbers');
select throws_ok(format($$select public.account_payment_complete('c0000000-0000-4000-8000-00000000000a', %L, true, null,
  '{"certificateNo": "C01-26-99999", "policyNo": "x", "coverTitle": "X"}')$$, pg_temp.g('pay1') ->> 'reference'),
  '22023', null, 'a certificate with other numbers is refused');

create or replace function pg_temp.cert(p_k text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'motor', 'certificateNo', pg_temp.g(p_k) ->> 'certificateNo', 'policyNo', pg_temp.g(p_k) ->> 'policyNo',
    'coverTitle', 'MOTOR THIRD PARTY ONLY', 'policyHolder', 'Ama Kwarteng Mensah', 'customerNo', pg_temp.g(p_k) ->> 'customerNo',
    'numberedItems', jsonb_build_array(jsonb_build_object('label', '1. INDEX MARK AND REGISTRATION OF VEHICLE', 'value', 'GN 3181-18')))
$$;
insert into v values ('done1', public.account_payment_complete('c0000000-0000-4000-8000-00000000000a', pg_temp.g('pay1') ->> 'reference', true, null, pg_temp.cert('r1')));
select is(pg_temp.g('done1') ->> 'status', 'succeeded', 'approval marks the payment succeeded');
select ok((pg_temp.g('done1') ->> 'policyId') is not null, 'and returns the new policy');
select is((select status from sales.proposals where id = pg_temp.id('p1')), 'issued', 'the proposal is issued');
select is((select array_agg(event order by id) from sales.proposal_events where proposal_id = pg_temp.id('p1') and event in ('paid', 'issued')),
  array['paid', 'issued'], 'paid and issued are both in the history');
select is(public.account_payment_complete('c0000000-0000-4000-8000-00000000000a', pg_temp.g('pay1') ->> 'reference', true, null, pg_temp.cert('r1')) ->> 'policyId',
  pg_temp.g('done1') ->> 'policyId', 'completing again returns the same policy (idempotent)');
select is((select count(*)::int from sales.policies where proposal_id = pg_temp.id('p1')), 1, 'only one policy exists');
select is(public.account_payment_reserve('c0000000-0000-4000-8000-00000000000a', pg_temp.g('pay1') ->> 'reference', 'MTP') ->> 'alreadyIssued',
  'true', 'reserving after issue says it is already issued');
select throws_ok(format($$select public.account_payment_start('c0000000-0000-4000-8000-00000000000a', %L, 'card', null, '•••• 4242')$$, pg_temp.id('p1')),
  'P0001', 'not-payable', 'an issued proposal cannot be paid again');
select throws_ok(format($$update sales.policies set certificate = '{}' where id = %L$$, pg_temp.g('done1') ->> 'policyId'),
  '42501', null, 'the certificate snapshot is immutable');
select throws_ok(format($$select public.account_get_policy('c0000000-0000-4000-8000-00000000000b', %L)$$, pg_temp.g('done1') ->> 'policyId'),
  'P0001', 'not-found', 'customer B cannot read A''s policy');
select is(public.account_list_policies('c0000000-0000-4000-8000-00000000000b'), '[]'::jsonb, 'B has no policies');
select is(public.account_get_policy('c0000000-0000-4000-8000-00000000000a', (pg_temp.g('done1') ->> 'policyId')::uuid) #>> '{payment,reference}',
  pg_temp.g('pay1') ->> 'reference', 'the owner sees the policy with its payment');

-- ---------------------------------------------------------------------------
-- Public certificate check
-- ---------------------------------------------------------------------------
insert into v values ('ver', public.verify_certificate(pg_temp.g('r1') ->> 'certificateNo', 'gn 3181 18'));
select is(pg_temp.g('ver') ->> 'found', 'true', 'certificate number + registration (however typed) finds the policy');
select is(pg_temp.g('ver') ->> 'status', 'not_yet_active', 'a policy that starts later is not yet active');
select is(pg_temp.g('ver') ->> 'holderInitials', 'A. K. M.', 'only the holder''s initials are shown');
select ok(not (pg_temp.g('ver')::text ~* '(Kwarteng|Mensah|\+233|customer|phone|USR)'), 'no name, phone or customer number is returned');
select is(public.verify_certificate(pg_temp.g('r1') ->> 'certificateNo', pg_temp.g('r1') ->> 'policyNo') ->> 'found', 'true',
  'the policy number works instead of the registration');
select is(public.verify_certificate(pg_temp.g('r1') ->> 'certificateNo', 'GN 9999-18'), '{"found": false}'::jsonb,
  'a wrong registration finds nothing');
select is(public.verify_certificate(pg_temp.g('r1') ->> 'certificateNo', ''), '{"found": false}'::jsonb,
  'the certificate number alone is not enough');
select is(public.verify_certificate('', 'GN 3181-18'), '{"found": false}'::jsonb, 'the registration alone is not enough');
select ok(not has_function_privilege('anon', 'public.verify_certificate(text, text)', 'execute'), 'verify_certificate is called by the Worker only');

-- Staff cancel the policy
select pg_temp.as_user('00000000-0000-0000-0000-0000000060a2');
set local role authenticated;
select throws_ok(format($$select public.staff_cancel_policy(%L, 'Customer request by phone')$$, pg_temp.g('done1') ->> 'policyId'),
  '42501', null, 'CX admins cannot cancel policies (policies.manage)');
select is((select count(*)::int from public.sales_policy_list), 1, 'but can see them');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000060a1');
set local role authenticated;
select is(public.staff_cancel_policy((pg_temp.g('done1') ->> 'policyId')::uuid, 'Customer request by phone') ->> 'status', 'cancelled',
  'an underwriter cancels a policy');
reset role;
select is(public.verify_certificate(pg_temp.g('r1') ->> 'certificateNo', 'GN 3181-18') ->> 'status', 'cancelled',
  'the public check shows the cancellation');

-- ---------------------------------------------------------------------------
-- Instant route, decline of payment, expiry
-- ---------------------------------------------------------------------------
insert into v values ('p2', public.account_create_proposal('c0000000-0000-4000-8000-00000000000a', 'MTR', 'motor', 1, '{}'));
insert into v values ('s2', pg_temp.submit('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p2'), '{}',
  '{"currency": "GHS", "premium": 557, "lines": [], "taxes": [], "total": 557, "indicative": false, "notes": [], "validUntil": "2000-01-01", "source": "rating"}'));
select is(pg_temp.g('s2') ->> 'status', 'quoted', 'an instant product priced online goes straight to quoted');
select is(pg_temp.g('s2') #>> '{quote,validUntil}', to_char(current_date + 30, 'YYYY-MM-DD'), 'the server sets validUntil, not the client');
insert into v values ('pay2', public.account_payment_start('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p2'), 'momo', 'mtn', '024 *** 0000'));
insert into v values ('pay3', public.account_payment_start('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p2'), 'momo', 'mtn', '024 *** 0000'));
select is((select status from sales.payments where reference = pg_temp.g('pay2') ->> 'reference'), 'failed',
  'a new attempt replaces the pending one');
select is(public.account_payment_complete('c0000000-0000-4000-8000-00000000000a', pg_temp.g('pay3') ->> 'reference', false, 'Declined (test number).') ->> 'status',
  'failed', 'a declined payment fails');
select is(public.account_payment_complete('c0000000-0000-4000-8000-00000000000a', pg_temp.g('pay3') ->> 'reference', false) ->> 'failureReason',
  'Declined (test number).', 'repeating the decline changes nothing');
select throws_ok(format($$select public.account_payment_complete('c0000000-0000-4000-8000-00000000000a', %L, true, null, '{}')$$,
  pg_temp.g('pay3') ->> 'reference'), 'P0001', 'payment-closed', 'a failed payment cannot be approved later');
select is((select status from sales.proposals where id = pg_temp.id('p2')), 'quoted', 'after a decline the customer can pay again');

update sales.proposals set quote = quote || '{"validUntil": "2000-01-01"}' where id = pg_temp.id('p2');
select throws_ok(format($$select public.account_payment_start('c0000000-0000-4000-8000-00000000000a', %L, 'momo', 'mtn', '024 *** 4567')$$, pg_temp.id('p2')),
  'P0001', 'quote-expired', 'an expired quote cannot be paid');
select ok(sales.expire_quotes() >= 1, 'the expiry job finds lapsed quotes');
select is((select status from sales.proposals where id = pg_temp.id('p2')), 'expired', 'and marks them expired');

-- ---------------------------------------------------------------------------
-- Request information, resubmit, decline, cancel
-- ---------------------------------------------------------------------------
insert into v values ('p3', public.account_create_proposal('c0000000-0000-4000-8000-00000000000a', 'FIR', 'fire', 1, '{}'));
select pg_temp.submit('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p3'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000060a1');
set local role authenticated;
select throws_ok(format($$select public.staff_request_info(%L, 'hi')$$, pg_temp.id('p3')), '22023', null, 'a request needs a real message');
select is(public.staff_request_info(pg_temp.id('p3'), 'Please attach the valuation report.') ->> 'status', 'info_requested',
  'an underwriter asks for more information');
reset role;
select is(public.account_get_proposal('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p3')) ->> 'staffMessage',
  'Please attach the valuation report.', 'the customer sees the message');
select is(public.account_save_proposal('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p3'), '{"extra": "yes"}', 3) ->> 'status',
  'info_requested', 'answers are editable again while information is requested');
select is(pg_temp.submit('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p3')) ->> 'status', 'submitted', 'and the customer resubmits');
select ok(exists (select 1 from sales.proposal_events where proposal_id = pg_temp.id('p3') and event = 'resubmitted'), 'the resubmission is recorded');
select pg_temp.as_user('00000000-0000-0000-0000-0000000060a1');
set local role authenticated;
select is(public.staff_decline(pg_temp.id('p3'), 'We cannot cover thatched roofs.') ->> 'status', 'declined', 'an underwriter declines');
select throws_ok(format($$select public.staff_cancel_proposal(%L, 'Duplicate proposal')$$, pg_temp.id('p3')), 'P0001', null,
  'a declined proposal cannot be cancelled');
select is(public.staff_cancel_proposal(pg_temp.id('pb'), 'Duplicate proposal') ->> 'status', 'cancelled', 'staff cancel a draft');
reset role;
select throws_ok(format($$select public.account_cancel_proposal('c0000000-0000-4000-8000-00000000000a', %L)$$, pg_temp.id('p3')),
  'P0001', 'not-cancellable', 'customers cannot cancel a declined proposal');
insert into v values ('p4', public.account_create_proposal('c0000000-0000-4000-8000-00000000000a', 'MTR', 'motor', 1, '{}'));
select is(public.account_cancel_proposal('c0000000-0000-4000-8000-00000000000a', pg_temp.id('p4')) ->> 'status', 'cancelled',
  'customers can withdraw their own draft');

-- Settings: products.manage only, validated.
select pg_temp.as_user('00000000-0000-0000-0000-0000000060a1');
set local role authenticated;
select throws_ok($$select public.staff_update_sales_settings('{"sales_tppd_limit": 9000}')$$, '42501', null,
  'underwriters do not manage sales settings');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000060a4');
set local role authenticated;
select is((public.staff_update_sales_settings('{"sales_tppd_limit": 9000}') ->> 'sales_tppd_limit'), '9000',
  'a system administrator updates a sales setting');
select throws_ok($$select public.staff_update_sales_settings('{"sales_sms_mode": "carrier-pigeon"}')$$, '22023', null,
  'values are validated');
select throws_ok($$select public.staff_update_sales_settings('{"device_cooldown_hours": 1}')$$, '22023', null,
  'only sales settings can be changed here');
reset role;

select * from finish();
rollback;
