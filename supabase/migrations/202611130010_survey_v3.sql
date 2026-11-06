-- Survey v3 (user review, 2026-11-06): "What main thing should we improve upon?" no longer offers
-- "Ease of the process" (EASE) or "Pricing and charges" (PRICE).
--
-- The options come from the improvement-factor catalogue, frozen into each version's snapshot at
-- publish (A-73). So:
--   1. EASE and PRICE are deactivated, never deleted. Their rows, ids and labels stay, so earlier
--      responses, flags, roll-ups, exports and the analytics filters still resolve them (shown as
--      inactive in the portal). An administrator could reactivate them later in Lists & options.
--   2. v2 is retired and v3 published with a fresh catalogue snapshot that no longer lists them.
--      Published versions are never edited (FR-27): v2 keeps its own snapshot, and v2 responses keep
--      pointing at v2. The questions and rating scales are unchanged, so trends continue.
-- The definition between the markers is packages/survey-engine/src/v3.json (checked by a test).
-- Same draft rule as v2: an untouched open draft is taken over; a draft with real edits stops here.
update public.improvement_factors set is_active = false where code in ('EASE', 'PRICE') and is_active;

do $$
declare
  v_def jsonb :=
-- V3-BEGIN
$v3${"schema":1,"intro":"Thanks for choosing Serene Insurance. 5 quick questions, under a minute.","pages":[{"id":"transaction","title":"About your policy","questions":[{"id":"channel","type":"single_choice","label":"How did you obtain your insurance policy?","options_source":"service_channels","required":true},{"id":"channel_other","type":"text_short","label":"Please tell us how (optional)","visible_when":{"var":"channel.is_other"},"max_length":80},{"id":"branch","type":"single_choice","label":"Which branch issued your policy?","help":"The branch that issued your policy, which may differ from one you visited.","options_source":"branches","visible_when":{"in":[{"var":"channel.branch_requirement"},["required","optional"]]},"required":{"eq":[{"var":"channel.branch_requirement"},"required"]}},{"id":"branch_other","type":"text_short","label":"Branch name (optional)","visible_when":{"var":"branch.is_other"},"max_length":80},{"id":"product","type":"single_choice","label":"What type of insurance policy did you buy?","options_source":"insurance_products","required":true},{"id":"product_other","type":"text_short","label":"Please tell us which (optional)","visible_when":{"var":"product.is_other"},"max_length":80}]},{"id":"csat","title":"Overall satisfaction","questions":[{"id":"csat","type":"rating_5","label":"How satisfied are you with the insurance service you received?","anchors":["Very dissatisfied","Dissatisfied","Neutral","Satisfied","Very satisfied"],"required":true}]},{"id":"ces","title":"Ease of service","questions":[{"id":"ces","type":"rating_5","label":"How easy was it to obtain your insurance policy?","anchors":["Very difficult","Difficult","Neither easy nor difficult","Easy","Very easy"],"required":true}]},{"id":"nps","title":"Recommendation","questions":[{"id":"nps","type":"rating_0_10","label":"Would you recommend Serene to others?","anchors":["Not at all likely","Extremely likely"],"required":true}]},{"id":"feedback","title":"","questions":[{"id":"factor","type":"single_choice","label":"What main thing should we improve upon?","options_source":"improvement_factors","required":true},{"id":"factor_other","type":"text_short","label":"Please tell us what (optional)","visible_when":{"var":"factor.is_other"},"max_length":200},{"id":"comment","type":"text_long","label":"Anything else you'd like to tell us? (optional)","max_length":1000},{"id":"contact_consent","type":"toggle","label":"You may contact me about my feedback","help":"We'll only use your number to follow up on this feedback."},{"id":"phone","type":"phone","label":"Your mobile number","visible_when":{"var":"contact_consent"},"required":{"var":"contact_consent"}},{"id":"first_name","type":"text_short","label":"Your first name (optional)","visible_when":{"var":"contact_consent"},"max_length":40}]}]}$v3$
-- V3-END
  ::jsonb;
  v_snap jsonb;
  v_note text := 'Improvement options "Ease of the process" and "Pricing and charges" removed.';
  v_draft uuid;
begin
  if exists (select 1 from public.survey_versions
              where status = 'published' and definition = v_def
                and not exists (select 1 from jsonb_array_elements(catalogue_snapshot -> 'improvement_factors') o
                                 where o ->> 'code' in ('EASE', 'PRICE'))) then
    return;
  end if;
  if jsonb_array_length(survey.guardrail_problems(v_def)) > 0 then
    raise exception 'Survey v3 breaks the guardrails: %', survey.guardrail_problems(v_def);
  end if;
  select id into v_draft from public.survey_versions
   where status = 'draft' and definition = (select definition from public.survey_versions where status = 'published');
  if v_draft is null and exists (select 1 from public.survey_versions where status in ('draft', 'pending_approval')) then
    raise exception 'A survey draft with changes is open; publish or withdraw it before applying this migration.';
  end if;
  v_snap := survey.build_snapshot();
  if exists (select 1 from jsonb_array_elements(v_snap -> 'improvement_factors') o where o ->> 'code' in ('EASE', 'PRICE')) then
    raise exception 'Survey v3 snapshot still lists a removed improvement option.';
  end if;
  update public.survey_versions set status = 'retired', retired_at = now() where status = 'published';
  if v_draft is not null then
    update public.survey_versions
       set status = 'published', definition = v_def, catalogue_snapshot = v_snap,
           scale_signature = survey.scale_signature(v_def),
           checksum = encode(extensions.digest(convert_to(v_def::text || v_snap::text, 'UTF8'), 'sha256'), 'hex'),
           change_note = v_note, prepared_by = null, requested_at = null, published_at = now()
     where id = v_draft;
  else
    insert into public.survey_versions (version_no, status, definition, catalogue_snapshot, scale_signature, checksum,
                                        change_note, published_at)
    values ((select coalesce(max(version_no), 0) + 1 from public.survey_versions), 'published', v_def, v_snap,
            survey.scale_signature(v_def),
            encode(extensions.digest(convert_to(v_def::text || v_snap::text, 'UTF8'), 'sha256'), 'hex'),
            v_note, now());
  end if;
end;
$$;
