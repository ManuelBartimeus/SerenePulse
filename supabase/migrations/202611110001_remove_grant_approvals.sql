-- Revision Q (user direction 2026-11-05): the second-approval step for role grants is removed from
-- the product. Every role grant now takes effect immediately; grants still waiting for a second
-- approver are activated. Survey publishing and branch corrections keep their own approval steps.
--
-- admin_decide_grant stays (callable, unused by the portal) so older clients fail softly with
-- "That grant is not waiting for approval." rather than a missing-function error.

-- 1. No permission needs a second approver any more.
update public.permissions set requires_second_approval = false where requires_second_approval;

comment on column public.permissions.requires_second_approval is
  'Retired 2026-11 (revision Q): always false. Role grants take effect immediately.';

-- 2. Activate grants that were waiting for approval, audited with counts.
do $$
declare
  v_activated int;
begin
  with done as (
    update public.user_role_grants
       set status = 'active', approved_at = now()
     where status = 'pending_approval'
    returning id
  )
  select count(*)::int into v_activated from done;

  perform audit.append('grants.approval_removed', 'user_role_grants', null, null,
    jsonb_build_object('activated_grants', v_activated,
                       'permissions_cleared', true), 'system');
end;
$$;

-- 3. admin_set_grants grants immediately. The response keeps the pending_approval key (always 0)
--    so the invite-user function and older portal builds keep working.
create or replace function public.admin_set_grants(p_user_id uuid, p_grants jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_role public.roles%rowtype;
  v_scope uuid;
  v_wanted text[] := array[]::text[];
begin
  perform app.require_perm('users.manage', true);
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'That user doesn''t exist.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_grants) <> 'array' then
    raise exception 'Grants must be a list.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_grants) loop
    select * into v_role from public.roles where key = v_item ->> 'role';
    if not found then
      raise exception 'Unknown role %.', v_item ->> 'role' using errcode = '22023';
    end if;
    v_scope := nullif(v_item ->> 'scope_id', '')::uuid;
    if v_role.scope = 'branch' and v_scope is null then
      raise exception 'A % grant needs a branch.', v_role.name using errcode = '22023';
    end if;
    if v_role.scope = 'organisation' and v_scope is not null then
      raise exception 'A % grant applies to the whole organisation and takes no branch.', v_role.name
        using errcode = '22023';
    end if;
    v_wanted := array_append(v_wanted, v_role.id::text || ':' || coalesce(v_scope::text, ''));

    if not exists (select 1 from public.user_role_grants g
                   where g.user_id = p_user_id and g.role_id = v_role.id
                     and g.scope_id is not distinct from v_scope and g.status in ('active', 'pending_approval')) then
      insert into public.user_role_grants (user_id, role_id, scope_type, scope_id, status, granted_by, approved_at)
      values (p_user_id, v_role.id, v_role.scope, v_scope, 'active', v_actor, now());
    end if;
  end loop;

  update public.user_role_grants g
     set status = 'revoked', revoked_by = v_actor, revoked_at = now()
   where g.user_id = p_user_id and g.status in ('active', 'pending_approval')
     and not (g.role_id::text || ':' || coalesce(g.scope_id::text, '') = any (v_wanted));

  return jsonb_build_object('pending_approval', 0);
end;
$$;

comment on function public.admin_set_grants(uuid, jsonb) is
  'Replace a user''s grants with the given set. Grants take effect immediately (revision Q).';
