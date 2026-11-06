-- Online sales access control: the Underwriter role, the permission matrix (architecture.md › Access),
-- RLS on every sales table, staff views, the customer-files bucket, settings defaults and validation.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create or replace function pg_temp.role_has(p_role text, p_perm text)
returns boolean language sql as $$
  select exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
                 where r.key = p_role and rp.permission_key = p_perm)
$$;

select is((select scope from public.roles where key = 'underwriter'), 'organisation', 'the Underwriter role exists, organisation-wide');
select is((select array_agg(rp.permission_key order by rp.permission_key) from public.role_permissions rp
             join public.roles r on r.id = rp.role_id where r.key = 'underwriter'),
  array['claims.manage', 'claims.view', 'customers.view', 'policies.manage', 'policies.view', 'proposals.review', 'proposals.view'],
  'underwriters review, price, manage policies and claims');

-- The matrix, permission by permission.
select is((select array_agg(r.key order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id
            where rp.permission_key = p.key), p.roles, p.key || ' is granted exactly as the spec says')
from (values
  ('customers.view', array['auditor', 'cx_admin', 'executive', 'system_admin', 'underwriter']),
  ('proposals.view', array['auditor', 'cx_admin', 'executive', 'system_admin', 'underwriter']),
  ('proposals.review', array['executive', 'underwriter']),
  ('policies.view', array['auditor', 'cx_admin', 'executive', 'system_admin', 'underwriter']),
  ('policies.manage', array['executive', 'underwriter']),
  ('products.manage', array['executive', 'system_admin']),
  ('claims.view', array['auditor', 'cx_admin', 'executive', 'system_admin', 'underwriter']),
  ('claims.manage', array['executive', 'underwriter'])
) as p(key, roles);
select ok(not pg_temp.role_has('branch_manager', 'customers.view') and not pg_temp.role_has('resolution_officer', 'proposals.view'),
  'branch managers and resolution officers get no sales access');

select is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'sales' and c.relkind = 'r' and not c.relrowsecurity), null::text[],
  'every sales table has row-level security');
select ok(not has_schema_privilege('anon', 'sales', 'usage'), 'anon cannot reach schema sales');
select is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'sales' and c.relkind = 'r'
              and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
                   or has_table_privilege('authenticated', c.oid, 'delete'))), null::text[],
  'staff have no direct writes on any sales table');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'account\_%' and has_function_privilege('authenticated', p.oid, 'execute')),
  null::text[], 'no account_* function is callable by signed-in staff');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'account\_%' or p.proname like 'staff\_%' or p.proname = 'verify_certificate')
              and has_function_privilege('anon', p.oid, 'execute')),
  null::text[], 'no sales function is callable anonymously');
select is((select array_agg(n.nspname || '.' || p.proname order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where p.prosecdef and n.nspname = 'sales'
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg = 'search_path=""')),
  null, 'every SECURITY DEFINER function in sales pins search_path');
select is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'sales\_%'
              and not coalesce('security_invoker=true' = any (c.reloptions), false)), null::text[],
  'every public.sales_* view runs with the caller''s rights (RLS applies)');

-- Bucket
select ok((select not public and file_size_limit = 10485760 from storage.buckets where id = 'customer-files'),
  'bucket customer-files is private with a 10 MB limit');
select is((select allowed_mime_types from storage.buckets where id = 'customer-files'),
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'], 'images and PDF only');
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'customer_files_staff_read'),
  'staff read customer files through a storage policy');

-- Settings
select is((select value from public.settings where key = 'sales_sms_mode'), '"simulated"'::jsonb, 'SMS starts simulated');
select is((select value from public.settings where key = 'sales_tppd_limit'), '8000'::jsonb, 'TPPD limit defaults to 8,000');
select is((select value from public.settings where key = 'sales_certificate_series'), '"01"'::jsonb, 'certificate series 01');
select is((select value from public.settings where key = 'sales_quote_validity_days'), '30'::jsonb, 'quotes valid 30 days');
select is((select value from public.settings where key = 'sales_certificate_signature_path'), '""'::jsonb,
  'no signature image until an administrator uploads one');
select throws_ok($$update public.settings set value = '"1"' where key = 'sales_certificate_series'$$, '22023', null,
  'the certificate series must be two digits');
select throws_ok($$update public.settings set value = '"https://evil.example/sig.png"' where key = 'sales_certificate_signature_path'$$,
  '22023', null, 'the signature path must be under settings/ in the bucket');
select throws_ok($$update public.settings set value = '[]' where key = 'sales_rates'$$, '22023', null,
  'rate tables must be an object with a version');

select * from finish();
rollback;
