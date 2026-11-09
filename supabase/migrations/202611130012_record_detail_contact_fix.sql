-- Fix (2026-11-09, user report): opening a feedback response in the staff portal failed with
--   record "v_contact" is not assigned yet (SQLSTATE 55000)
-- for every response WITHOUT contact consent. public.record_detail declared v_contact as an untyped
-- `record`, assigned only when the customer consented, but the returned expression reads
-- v_contact's fields on every call, and PL/pgSQL cannot resolve fields of an unassigned record.
-- v_contact now has the table's row type, so its fields always exist and are simply null when
-- there is no contact request. Nothing else in the function changes (same body as
-- 202611080002_analytics_engine.sql); CREATE OR REPLACE keeps its owner and grants.
create or replace function public.record_detail(p_response_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v analytics.v_responses_effective;
  v_raw survey.responses;
  v_ver public.survey_versions;
  v_text boolean := analytics.can('responses.comment.view');
  v_answers jsonb := '[]'::jsonb;
  v_q jsonb;
  v_page int;
  v_val jsonb;
  v_disp text;
  v_code text;
  v_contact pii.contact_requests;
  v_scope_all boolean := app.org_scope() or analytics.is_service();
begin
  perform analytics.require('responses.view');
  select * into v from analytics.v_responses_effective where id = p_response_id;
  if v.id is null or not (v_scope_all or v.issuing_branch_id = any (app.branch_ids())) then
    raise exception 'We can''t find that feedback record, or you don''t have access to it.' using errcode = 'P0002';
  end if;
  select * into v_raw from survey.responses where id = p_response_id;
  select * into v_ver from public.survey_versions where id = v_raw.survey_version_id;

  for v_page, v_q in
    select p.ord::int, q from jsonb_array_elements(v_ver.definition -> 'pages') with ordinality p(pg, ord),
                             jsonb_array_elements(p.pg -> 'questions') q
  loop
    v_val := null;
    v_disp := null;
    case v_q ->> 'id'
      when 'channel' then
        select code into v_code from public.service_channels where id = v_raw.service_channel_id;
        v_val := to_jsonb(v_code);
        v_disp := coalesce((select o ->> 'label' from jsonb_array_elements(v_ver.catalogue_snapshot -> 'service_channels') o
                            where o ->> 'code' = v_code), (select label from public.service_channels where id = v_raw.service_channel_id));
      when 'branch' then
        if v_raw.branch_status = 'selected' then
          select code, name into v_code, v_disp from public.branches where id = v_raw.issuing_branch_id;
          v_val := to_jsonb(v_code);
        elsif v_raw.branch_status = 'other' then
          v_val := '"OTHER"'::jsonb;
          v_disp := 'Other branch';
        else
          v_disp := analytics.branch_status_label(v_raw.branch_status);
        end if;
      when 'product' then
        select code into v_code from public.insurance_products where id = v_raw.insurance_product_id;
        v_val := to_jsonb(v_code);
        v_disp := coalesce((select o ->> 'label' from jsonb_array_elements(v_ver.catalogue_snapshot -> 'insurance_products') o
                            where o ->> 'code' = v_code), (select label from public.insurance_products where id = v_raw.insurance_product_id));
      when 'factor' then
        if v_raw.improvement_factor_id is not null then
          select code into v_code from public.improvement_factors where id = v_raw.improvement_factor_id;
          v_val := to_jsonb(v_code);
          v_disp := coalesce((select o ->> 'label' from jsonb_array_elements(v_ver.catalogue_snapshot -> 'improvement_factors') o
                              where o ->> 'code' = v_code), (select label from public.improvement_factors where id = v_raw.improvement_factor_id));
        else
          v_disp := 'Not answered';
        end if;
      when 'csat' then
        v_val := to_jsonb(v_raw.csat_score);
        v_disp := v_raw.csat_score || coalesce(' – ' || (v_q -> 'anchors' ->> (v_raw.csat_score - 1)), '');
      when 'ces' then
        v_val := to_jsonb(v_raw.ces_score);
        v_disp := v_raw.ces_score || coalesce(' – ' || (v_q -> 'anchors' ->> (v_raw.ces_score - 1)), '');
      when 'nps' then
        v_val := to_jsonb(v_raw.nps_score);
        v_disp := v_raw.nps_score || ' – ' || initcap(v_raw.nps_class);
      when 'channel_other' then
        continue when v_raw.service_channel_other_text is null;
        v_val := case when v_text then to_jsonb(v_raw.service_channel_other_text) end;
        v_disp := case when v_text then v_raw.service_channel_other_text else 'Hidden (needs permission to view comments)' end;
      when 'branch_other' then
        continue when v_raw.issuing_branch_other_text is null;
        v_val := case when v_text then to_jsonb(v_raw.issuing_branch_other_text) end;
        v_disp := case when v_text then v_raw.issuing_branch_other_text else 'Hidden (needs permission to view comments)' end;
      when 'product_other' then
        continue when v_raw.insurance_product_other_text is null;
        v_val := case when v_text then to_jsonb(v_raw.insurance_product_other_text) end;
        v_disp := case when v_text then v_raw.insurance_product_other_text else 'Hidden (needs permission to view comments)' end;
      when 'factor_other' then
        continue when v_raw.improvement_other_text is null;
        v_val := case when v_text then to_jsonb(v_raw.improvement_other_text) end;
        v_disp := case when v_text then v_raw.improvement_other_text else 'Hidden (needs permission to view comments)' end;
      when 'contact_consent' then
        v_val := to_jsonb(v_raw.contact_consent);
        v_disp := case when v_raw.contact_consent then 'Yes' else 'No' end;
      else
        -- comment is returned separately; phone and first name are contact data and never listed.
        continue;
    end case;
    v_answers := v_answers || jsonb_build_array(jsonb_build_object(
      'question_id', v_q ->> 'id', 'page', v_page, 'label', v_q ->> 'label', 'type', v_q ->> 'type',
      'value', v_val, 'display', v_disp));
  end loop;

  if v_raw.contact_consent then
    select * into v_contact from pii.contact_requests c where c.response_id = v_raw.id;
  end if;

  return jsonb_build_object(
    'id', v.id, 'reference', v.reference,
    'submitted_at', v.submitted_at, 'opened_at', v.opened_at, 'interactive_at', v.interactive_at,
    'local_date', v.local_date,
    'completion_duration_ms', v.completion_duration_ms, 'duration_from_opened', v.duration_from_opened,
    'navigated_back', v.navigated_back, 'changed_previous_answer', v.changed_previous_answer,
    'verification', v.verification,
    'version', jsonb_build_object('id', v_ver.id, 'no', v_ver.version_no),
    'source', (select jsonb_build_object('code', code, 'label', label) from public.survey_sources where id = v.source_id),
    'qr_point', (select jsonb_build_object('id', id, 'code', code, 'label', label) from public.qr_points where id = v.qr_point_id),
    'attribution', jsonb_build_object(
      'branch_status', v.branch_status,
      'branch', (select jsonb_build_object('id', id, 'code', code, 'name', name) from public.branches where id = v.issuing_branch_id),
      'region', (select jsonb_build_object('id', id, 'name', name) from public.regions where id = v.region_id),
      'label', coalesce((select name from public.branches where id = v.issuing_branch_id), analytics.branch_status_label(v.branch_status)),
      'is_corrected', v.is_corrected,
      'original', jsonb_build_object(
        'branch_status', v.original_branch_status,
        'branch', (select jsonb_build_object('id', id, 'code', code, 'name', name) from public.branches where id = v.original_issuing_branch_id),
        'region', (select jsonb_build_object('id', id, 'name', name) from public.regions where id = v.original_region_id),
        'label', coalesce((select name from public.branches where id = v.original_issuing_branch_id),
                          analytics.branch_status_label(v.original_branch_status)))),
    'answers', v_answers,
    'comment_visible', v_text,
    'comment', case when v_text then v_raw.comment end,
    'has_comment', v.has_comment,
    'text_redacted_at', v.text_redacted_at,
    'has_contact_consent', v_raw.contact_consent,
    'contact', case when v_raw.contact_consent then jsonb_build_object(
      'masked', case when v_contact.phone_e164_enc is not null
                     then pii.mask_phone(pii.decrypt_field(v_contact.dek_enc, v_contact.phone_e164_enc)) end,
      'erased', v_contact.erased_at is not null) end);
end;
$$;
