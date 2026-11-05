-- D-45: invite and password-reset links are copied by an administrator instead of emailed.
-- The invite-user Edge Function calls this with the caller's JWT before generating a link, so the
-- permission check and the audit entry name the administrator who issued it.

create or replace function public.admin_issue_access_link(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_email text;
  v_kind text;
begin
  perform app.require_perm('users.manage', true);
  if p_user_id = (select auth.uid()) then
    raise exception 'Use "Change password" on your own profile instead.' using errcode = '22023';
  end if;
  select p.status, u.email into v_status, v_email
  from public.profiles p join auth.users u on u.id = p.user_id
  where p.user_id = p_user_id;
  if v_status is null then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
  if v_status not in ('invited', 'active') then
    raise exception 'Reactivate this account before issuing a link.' using errcode = '22023';
  end if;
  v_kind := case v_status when 'invited' then 'invite' else 'recovery' end;
  perform audit.append('auth.access_link_issued', 'user', p_user_id::text, null, jsonb_build_object('kind', v_kind));
  return jsonb_build_object('email', v_email, 'kind', v_kind);
end;
$$;

revoke all on function public.admin_issue_access_link(uuid) from public, anon;
grant execute on function public.admin_issue_access_link(uuid) to authenticated;
