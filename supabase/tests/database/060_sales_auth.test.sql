-- Online sales sign-in: OTP rate limits, attempts and expiry, customer creation and numbering,
-- sessions (idle/absolute expiry, low-frequency last_seen writes, sign-out), purge job, privileges.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create or replace function pg_temp.h(p text) returns text language sql as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;
create or replace function pg_temp.start(p_id text, p_phone text, p_code text, p_ip text default 'ip-1')
returns jsonb language sql as $$ select public.account_otp_start(p_id::uuid, p_phone, pg_temp.h(p_code), pg_temp.h(p_ip)) $$;
create or replace function pg_temp.verify(p_id text, p_code text, p_token text)
returns jsonb language sql as $$ select public.account_otp_verify(p_id::uuid, pg_temp.h(p_code), pg_temp.h(p_token), 'pgtap') $$;

-- ---------------------------------------------------------------------------
-- Privileges: only the Worker (service_role) can call the sign-in functions.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.account_otp_start(uuid, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.account_otp_start(uuid, text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.account_otp_start(uuid, text, text, text)', 'execute'),
  'account_otp_start is service_role only');
select ok(not has_function_privilege('anon', 'public.account_session_resolve(text)', 'execute')
          and not has_function_privilege('authenticated', 'public.account_session_resolve(text)', 'execute'),
  'account_session_resolve is not callable by anon or authenticated');
select ok(not has_table_privilege('authenticated', 'sales.otp_challenges', 'select')
          and not has_table_privilege('authenticated', 'sales.customer_sessions', 'select')
          and not has_table_privilege('anon', 'sales.customers', 'select'),
  'nobody but the functions reads OTP challenges or sessions');
select ok(not has_table_privilege('authenticated', 'sales.customers', 'insert')
          and not has_table_privilege('authenticated', 'sales.proposals', 'update')
          and not has_table_privilege('authenticated', 'sales.policies', 'delete'),
  'staff have no direct writes on sales tables');

-- ---------------------------------------------------------------------------
-- Starting a challenge
-- ---------------------------------------------------------------------------
select throws_ok($$select pg_temp.start('a0000000-0000-4000-8000-000000000001', '0241234567', '111111')$$, '22023',
  null, 'phones must be E.164 Ghana numbers');
select is((pg_temp.start('a0000000-0000-4000-8000-000000000001', '+233241234567', '111111') ->> 'ok'), 'true',
  'a code can be requested');
select is((select code_hmac from sales.otp_challenges where id = 'a0000000-0000-4000-8000-000000000001'),
  pg_temp.h('111111'), 'only the HMAC is stored');
select is((select expires_at - created_at from sales.otp_challenges where id = 'a0000000-0000-4000-8000-000000000001'),
  interval '5 minutes', 'a code is valid for 5 minutes');
select is((pg_temp.start('a0000000-0000-4000-8000-000000000002', '+233241234567', '222222') ->> 'error'), 'too-soon',
  'one code per phone per 30 seconds');
select ok((pg_temp.start('a0000000-0000-4000-8000-000000000002', '+233241234567', '222222') ->> 'retryAfterSeconds')::int
            between 1 and 30, 'too-soon says when to retry');
update sales.otp_challenges set created_at = now() - interval '31 seconds' where phone_e164 = '+233241234567';
select is((pg_temp.start('a0000000-0000-4000-8000-000000000003', '+233241234567', '333333') ->> 'ok'), 'true',
  'after 30 seconds another code can be sent');
select ok((select expires_at <= now() from sales.otp_challenges where id = 'a0000000-0000-4000-8000-000000000001'),
  'a new code retires the earlier one');
-- Five codes in the hour is the limit.
insert into sales.otp_challenges (id, phone_e164, code_hmac, expires_at, created_at)
select gen_random_uuid(), '+233241234567', pg_temp.h('x'), now(), now() - make_interval(mins => 10 + g)
from generate_series(1, 3) g;
update sales.otp_challenges set created_at = now() - interval '40 seconds' where id = 'a0000000-0000-4000-8000-000000000003';
select is((pg_temp.start('a0000000-0000-4000-8000-000000000004', '+233241234567', '444444') ->> 'error'), 'too-many',
  'at most 5 codes per phone per hour');
select is((pg_temp.start('a0000000-0000-4000-8000-000000000005', '+233200000001', '555555') ->> 'ok'), 'true',
  'the hourly limit is per phone');

-- ---------------------------------------------------------------------------
-- Verifying
-- ---------------------------------------------------------------------------
select is((pg_temp.verify('a0000000-0000-4000-8000-000000000005', '000000', 'tok-1') ->> 'error'), 'invalid',
  'a wrong code is refused');
select is((select attempts from sales.otp_challenges where id = 'a0000000-0000-4000-8000-000000000005'), 1,
  'a wrong code counts an attempt (returned, not raised, so it is not rolled back)');
select is((pg_temp.verify('a0000000-0000-4000-8000-000000000005', '000001', 'tok-1') ->> 'attemptsLeft'), '3',
  'attempts left are reported');
select pg_temp.verify('a0000000-0000-4000-8000-000000000005', '000002', 'tok-1');
select pg_temp.verify('a0000000-0000-4000-8000-000000000005', '000003', 'tok-1');
select is((pg_temp.verify('a0000000-0000-4000-8000-000000000005', '000004', 'tok-1') ->> 'error'), 'locked',
  'the fifth wrong code locks the challenge');
select is((pg_temp.verify('a0000000-0000-4000-8000-000000000005', '555555', 'tok-1') ->> 'error'), 'locked',
  'after 5 attempts even the right code is refused');
select is((select count(*)::int from sales.customers where phone_e164 = '+233200000001'), 0, 'no customer was created');

-- Expiry
select pg_temp.start('a0000000-0000-4000-8000-000000000006', '+233200000002', '666666');
update sales.otp_challenges set expires_at = now() - interval '1 second' where id = 'a0000000-0000-4000-8000-000000000006';
select is((pg_temp.verify('a0000000-0000-4000-8000-000000000006', '666666', 'tok-2') ->> 'error'), 'expired',
  'an expired code is refused');
select is((pg_temp.verify('a0000000-0000-4000-8000-00000000ffff', '666666', 'tok-2') ->> 'error'), 'expired',
  'an unknown challenge looks the same as an expired one');

-- Success: new customer
select pg_temp.start('a0000000-0000-4000-8000-000000000007', '+233200000003', '777777');
create temporary table v (k text primary key, j jsonb);
insert into v values ('ok', pg_temp.verify('a0000000-0000-4000-8000-000000000007', '777777', 'tok-3'));
select is((select j ->> 'ok' from v where k = 'ok'), 'true', 'the right code signs in');
select is((select j ->> 'isNew' from v where k = 'ok'), 'true', 'a first sign-in creates the customer');
select ok((select j #>> '{profile,customerNo}' from v where k = 'ok') ~ '^USR[0-9]{5}$'
          and substr((select j #>> '{profile,customerNo}' from v where k = 'ok'), 4)::int >= 10001,
  'customer numbers are USR + 5 digits from 10001');
select is((select j #>> '{profile,phone}' from v where k = 'ok'), '+233200000003', 'the profile carries the phone');
select ok(not ((select j -> 'profile' from v where k = 'ok') ? 'identityStatus'),
  'identity-check fields are not part of the customer profile');
select is((select token_hash from sales.customer_sessions s join sales.customers c on c.id = s.customer_id
            where c.phone_e164 = '+233200000003'), pg_temp.h('tok-3'), 'only the token hash is stored');
select is((select expires_at - created_at from sales.customer_sessions where token_hash = pg_temp.h('tok-3')),
  interval '30 days', 'sessions last 30 days at most');
select is((pg_temp.verify('a0000000-0000-4000-8000-000000000007', '777777', 'tok-4') ->> 'error'), 'expired',
  'a code works once');

-- Returning customer: same record, no new number.
update sales.otp_challenges set created_at = now() - interval '1 minute' where phone_e164 = '+233200000003';
select pg_temp.start('a0000000-0000-4000-8000-000000000008', '+233200000003', '888888');
insert into v values ('again', pg_temp.verify('a0000000-0000-4000-8000-000000000008', '888888', 'tok-5'));
select is((select j ->> 'isNew' from v where k = 'again'), 'false', 'a returning customer is not new');
select is((select j #>> '{profile,customerNo}' from v where k = 'again'), (select j #>> '{profile,customerNo}' from v where k = 'ok'),
  'and keeps the customer number');

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
select is((public.account_session_resolve(pg_temp.h('tok-3')) ->> 'phone'), '+233200000003', 'a session resolves to its customer');
select is(public.account_session_resolve(pg_temp.h('nope')), null::jsonb, 'an unknown token resolves to nothing');
select is(public.account_session_resolve('not-hex'), null::jsonb, 'a malformed token resolves to nothing');

update sales.customer_sessions set last_seen_at = now() - interval '1 minute' where token_hash = pg_temp.h('tok-3');
select public.account_session_resolve(pg_temp.h('tok-3'));
select is((select last_seen_at from sales.customer_sessions where token_hash = pg_temp.h('tok-3')), now() - interval '1 minute',
  'a recent session is not rewritten on every request');
update sales.customer_sessions set last_seen_at = now() - interval '10 minutes' where token_hash = pg_temp.h('tok-3');
select public.account_session_resolve(pg_temp.h('tok-3'));
select is((select last_seen_at from sales.customer_sessions where token_hash = pg_temp.h('tok-3')), now(),
  'last_seen_at is refreshed after 5 minutes');

update sales.customer_sessions set last_seen_at = now() - interval '7 days 1 minute' where token_hash = pg_temp.h('tok-3');
select is(public.account_session_resolve(pg_temp.h('tok-3')), null::jsonb, 'a session idle for 7 days has ended');
select is((select count(*)::int from sales.customer_sessions where token_hash = pg_temp.h('tok-3')), 0, 'and is deleted');

update sales.customer_sessions set created_at = now() - interval '31 days', expires_at = now() - interval '1 day'
 where token_hash = pg_temp.h('tok-5');
select is(public.account_session_resolve(pg_temp.h('tok-5')), null::jsonb, 'sessions end after 30 days however active');

select pg_temp.start('a0000000-0000-4000-8000-000000000009', '+233200000004', '999999');
select pg_temp.verify('a0000000-0000-4000-8000-000000000009', '999999', 'tok-6');
select public.account_sign_out(pg_temp.h('tok-6'));
select is(public.account_session_resolve(pg_temp.h('tok-6')), null::jsonb, 'sign-out revokes the session');

-- Suspended customers cannot sign in or use a session.
select pg_temp.start('a0000000-0000-4000-8000-00000000000a', '+233200000005', '101010');
select pg_temp.verify('a0000000-0000-4000-8000-00000000000a', '101010', 'tok-7');
update sales.customers set status = 'suspended' where phone_e164 = '+233200000005';
select is(public.account_session_resolve(pg_temp.h('tok-7')), null::jsonb, 'a suspended customer''s session stops working');
update sales.otp_challenges set created_at = now() - interval '1 minute' where phone_e164 = '+233200000005';
select pg_temp.start('a0000000-0000-4000-8000-00000000000b', '+233200000005', '121212');
select is((pg_temp.verify('a0000000-0000-4000-8000-00000000000b', '121212', 'tok-8') ->> 'error'), 'suspended',
  'a suspended customer cannot sign in');

-- ---------------------------------------------------------------------------
-- Purge job
-- ---------------------------------------------------------------------------
update sales.otp_challenges set created_at = now() - interval '25 hours' where id = 'a0000000-0000-4000-8000-000000000001';
select sales.purge_expired_auth();
select is((select count(*)::int from sales.otp_challenges where id = 'a0000000-0000-4000-8000-000000000001'), 0,
  'challenges older than 24 hours are purged');
select ok(exists (select 1 from sales.otp_challenges where id = 'a0000000-0000-4000-8000-000000000003'),
  'recent challenges are kept for rate limiting');
select ok(exists (select 1 from cron.job where jobname = 'sales-purge-auth')
          and exists (select 1 from cron.job where jobname = 'sales-expire-quotes'),
  'the purge and quote-expiry jobs are scheduled');

select * from finish();
rollback;
