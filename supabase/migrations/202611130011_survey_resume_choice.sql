-- Resume prompt (user review, 2026-11-06). A returning customer with an unfinished form now chooses
-- "Pick up where you left off" or "Start a new feedback form" instead of being taken silently back.
--   * The session payload gains opened_at, so the choice screen can say when the form was started.
--   * survey_abandon_session: "Start a new feedback form" closes the old session server-side, so it is
--     never resumed again. It is recorded like any abandoned session (status expired, abandoned at its
--     current page, for the completion funnel) and its draft answers are discarded.

create or replace function survey.session_payload(p_session survey.sessions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'active', 'session_id', p_session.id, 'page', p_session.current_page,
    'answers', p_session.draft_answers, 'seq', p_session.answer_seq,
    'interactive', p_session.interactive_at is not null,
    'opened_at', p_session.opened_at,
    'version', jsonb_build_object('id', v.id, 'no', v.version_no, 'definition', v.definition,
                                  'snapshot', survey.current_snapshot_for_display(v.catalogue_snapshot)))
  from public.survey_versions v where v.id = p_session.survey_version_id
$$;

-- p_session is the raw session cookie value. Only an active session changes; anything else (unknown,
-- already expired, submitted) is reported and left alone, so a submitted response is never touched.
create or replace function public.survey_abandon_session(p_session text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row survey.sessions;
begin
  if length(coalesce(p_session, '')) < 16 then
    raise exception 'bad-request' using errcode = '22023';
  end if;
  select * into v_row from survey.sessions
   where session_secret_hash = extensions.digest(p_session, 'sha256') for update;
  if v_row.id is null then
    return jsonb_build_object('status', 'none');
  end if;
  if v_row.status <> 'active' then
    return jsonb_build_object('status', v_row.status);
  end if;
  update survey.sessions
     set status = 'expired', abandoned_at_page = current_page, draft_answers = '{}'::jsonb
   where id = v_row.id;
  return jsonb_build_object('status', 'abandoned');
end;
$$;

revoke all on function public.survey_abandon_session(text) from public, anon, authenticated;
grant execute on function public.survey_abandon_session(text) to service_role;
