-- Settings history trigger and the allow-listed Vault loader.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Settings: every change is recorded with old and new values.
update public.settings set value = '48' where key = 'device_cooldown_hours';
select is(
  (select new_value from public.settings_history where key = 'device_cooldown_hours' order by id desc limit 1),
  '48'::jsonb, 'settings changes are recorded in settings_history');
select is(
  (select old_value from public.settings_history where key = 'device_cooldown_hours' order by id desc limit 1),
  '24'::jsonb, 'history keeps the previous value');

select ok(
  not has_function_privilege('authenticated', 'public.vault_upsert_secret(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.vault_upsert_secret(text, text)', 'execute'),
  'only service_role can load Vault secrets');

select throws_ok(
  $$select public.vault_upsert_secret('some_other_name', repeat('x', 40))$$,
  '22023', null, 'names outside the allow-list are rejected');
select throws_ok(
  $$select public.vault_upsert_secret('pii_kek', 'short')$$,
  '22023', null, 'short secrets are rejected');

select lives_ok($$select public.vault_upsert_secret('pii_kek', repeat('a', 43))$$, 'first load creates the secret');
select lives_ok($$select public.vault_upsert_secret('pii_kek', repeat('b', 43))$$, 'second load updates it in place');

select * from finish();
rollback;
