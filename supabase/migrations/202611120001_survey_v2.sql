-- Survey v2 (Nii's review, 2026-11-05): Page 5 has no visible heading (the "Additional feedback" /
-- "We're sorry we fell short…" headings are gone); "What main thing should we improve upon?" is now
-- required (customers can still choose "Nothing"); recommendation and policy questions reworded.
-- Rating scales are unchanged, so trends continue. v1 is retired, never edited (FR-27): earlier
-- responses keep pointing at v1. Published by migration like v1 (D-36).
-- The definition between the markers is packages/survey-engine/src/v2.json (checked by a test).
do $$
declare
  v_def jsonb :=
-- V2-BEGIN
$v2${"schema":1,"intro":"Thanks for choosing Serene Insurance. 5 quick questions, under a minute.","pages":[{"id":"transaction","title":"About your policy","questions":[{"id":"channel","type":"single_choice","label":"How did you obtain your insurance policy?","options_source":"service_channels","required":true},{"id":"channel_other","type":"text_short","label":"Please tell us how (optional)","visible_when":{"var":"channel.is_other"},"max_length":80},{"id":"branch","type":"single_choice","label":"Which branch issued your policy?","help":"The branch that issued your policy, which may differ from one you visited.","options_source":"branches","visible_when":{"in":[{"var":"channel.branch_requirement"},["required","optional"]]},"required":{"eq":[{"var":"channel.branch_requirement"},"required"]}},{"id":"branch_other","type":"text_short","label":"Branch name (optional)","visible_when":{"var":"branch.is_other"},"max_length":80},{"id":"product","type":"single_choice","label":"What type of insurance policy did you buy?","options_source":"insurance_products","required":true},{"id":"product_other","type":"text_short","label":"Please tell us which (optional)","visible_when":{"var":"product.is_other"},"max_length":80}]},{"id":"csat","title":"Overall satisfaction","questions":[{"id":"csat","type":"rating_5","label":"How satisfied are you with the insurance service you received?","anchors":["Very dissatisfied","Dissatisfied","Neutral","Satisfied","Very satisfied"],"required":true}]},{"id":"ces","title":"Ease of service","questions":[{"id":"ces","type":"rating_5","label":"How easy was it to obtain your insurance policy?","anchors":["Very difficult","Difficult","Neither easy nor difficult","Easy","Very easy"],"required":true}]},{"id":"nps","title":"Recommendation","questions":[{"id":"nps","type":"rating_0_10","label":"Would you recommend Serene to others?","anchors":["Not at all likely","Extremely likely"],"required":true}]},{"id":"feedback","title":"","questions":[{"id":"factor","type":"single_choice","label":"What main thing should we improve upon?","options_source":"improvement_factors","required":true},{"id":"factor_other","type":"text_short","label":"Please tell us what (optional)","visible_when":{"var":"factor.is_other"},"max_length":200},{"id":"comment","type":"text_long","label":"Anything else you'd like to tell us? (optional)","max_length":1000},{"id":"contact_consent","type":"toggle","label":"You may contact me about my feedback","help":"We'll only use your number to follow up on this feedback."},{"id":"phone","type":"phone","label":"Your mobile number","visible_when":{"var":"contact_consent"},"required":{"var":"contact_consent"}},{"id":"first_name","type":"text_short","label":"Your first name (optional)","visible_when":{"var":"contact_consent"},"max_length":40}]}]}$v2$
-- V2-END
  ::jsonb;
  v_snap jsonb;
begin
  if exists (select 1 from public.survey_versions where status = 'published' and definition = v_def) then
    return;
  end if;
  if exists (select 1 from public.survey_versions where status in ('draft', 'pending_approval')) then
    raise exception 'A survey draft is open; withdraw it before applying this migration.';
  end if;
  if jsonb_array_length(survey.guardrail_problems(v_def)) > 0 then
    raise exception 'Survey v2 breaks the guardrails: %', survey.guardrail_problems(v_def);
  end if;
  v_snap := survey.build_snapshot();
  update public.survey_versions set status = 'retired', retired_at = now() where status = 'published';
  insert into public.survey_versions (version_no, status, definition, catalogue_snapshot, scale_signature, checksum,
                                      change_note, published_at)
  values ((select coalesce(max(version_no), 0) + 1 from public.survey_versions), 'published', v_def, v_snap,
          survey.scale_signature(v_def),
          encode(extensions.digest(convert_to(v_def::text || v_snap::text, 'UTF8'), 'sha256'), 'hex'),
          'Page 5 heading removed; improvement question required; recommendation and policy questions reworded.',
          now());
end;
$$;
