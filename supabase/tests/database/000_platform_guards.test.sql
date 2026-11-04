-- Platform guards that every later migration must keep passing (SPEC: RLS discipline).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is(
  (select array_agg(c.relname order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null,
  'every table in public has row-level security enabled');

select is(
  (select array_agg(n.nspname || '.' || p.proname order by 1)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('public', 'app', 'survey', 'analytics', 'pii', 'audit', 'ops')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg = 'search_path=""')),
  null,
  'every SECURITY DEFINER function pins search_path to empty');

select ok(
  not has_schema_privilege('anon', 'survey', 'usage')
  and not has_schema_privilege('anon', 'pii', 'usage')
  and not has_schema_privilege('authenticated', 'pii', 'usage')
  and not has_schema_privilege('authenticated', 'audit', 'usage')
  and not has_schema_privilege('authenticated', 'ops', 'usage'),
  'private schemas are not reachable by anon or authenticated');

select ok(
  has_function_privilege('service_role', 'public.healthz()', 'execute')
  and not has_function_privilege('anon', 'public.healthz()', 'execute')
  and not has_function_privilege('authenticated', 'public.healthz()', 'execute'),
  'healthz is callable by service_role only');

select ok(
  (select count(*) from cron.job where jobname in ('audit-partitions', 'quota-snapshot', 'sign-in-attempts-retention')) = 3,
  'platform cron jobs are scheduled');

select * from finish();
rollback;
