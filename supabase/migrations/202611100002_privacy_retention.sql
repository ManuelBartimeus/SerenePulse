-- MS-09 privacy and retention (M16, D-16, FR-45): retention per data class, nightly run with an
-- audit entry and job status, and data-subject request tools (find, export, erase).

-- ---------------------------------------------------------------------------
-- Retention, one function per class (SPEC §2.3 "Data retention")
-- ---------------------------------------------------------------------------

-- Free-text comments and "other" texts → "[removed]" after 24 months. This is the only code path
-- that sets app.retention_redact, which survey.responses_immutable() honours (Rule 5).
create or replace function ops.retention_redact_texts(p_cutoff timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  perform set_config('app.retention_redact', 'on', true);
  update survey.responses r
     set comment = case when r.comment is not null then '[removed]' end,
         service_channel_other_text = case when r.service_channel_other_text is not null then '[removed]' end,
         issuing_branch_other_text = case when r.issuing_branch_other_text is not null then '[removed]' end,
         insurance_product_other_text = case when r.insurance_product_other_text is not null then '[removed]' end,
         improvement_other_text = case when r.improvement_other_text is not null then '[removed]' end,
         text_redacted_at = now()
   where r.submitted_at < p_cutoff
     and r.text_redacted_at is null
     and (r.comment is not null or r.service_channel_other_text is not null or r.issuing_branch_other_text is not null
          or r.insurance_product_other_text is not null or r.improvement_other_text is not null);
  get diagnostics v_n = row_count;
  perform set_config('app.retention_redact', 'off', true);
  return v_n;
end;
$$;

-- Consented phone numbers and names: erased 12 months after the response.
create or replace function ops.retention_erase_contacts(p_cutoff timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update pii.contact_requests c
     set phone_e164_enc = null, phone_hmac = null, first_name_enc = null, dek_enc = null, erased_at = now()
    from survey.responses r
   where r.id = c.response_id and r.submitted_at < p_cutoff and c.erased_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Export files (7 days) and report files (30 days): rows are marked expired (no more downloads);
-- generate-report then deletes the Storage objects and the rows (report_files_purged).
create or replace function ops.retention_expire_files()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired int;
  v_stale int;
begin
  update public.report_files
     set status = 'failed', completed_at = now(), error = 'The export did not finish.'
   where kind = 'export' and status = 'pending' and created_at < now() - interval '1 hour';
  get diagnostics v_stale = row_count;
  delete from reports.export_rows x
   where not exists (select 1 from public.report_files f where f.id = x.file_id and f.status = 'pending');
  update public.report_files set status = 'expired' where status <> 'expired' and expires_at <= now();
  get diagnostics v_expired = row_count;
  return jsonb_build_object('files_expired', v_expired, 'stale_exports_failed', v_stale,
                            'files_awaiting_purge', (select count(*) from public.report_files where status = 'expired'));
end;
$$;

create or replace function ops.retention_run()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job bigint;
  v_counts jsonb;
  v_files jsonb;
begin
  insert into ops.job_runs (job, status) values ('retention', 'running') returning id into v_job;
  begin
    v_files := ops.retention_expire_files();
    v_counts := jsonb_build_object(
      'texts_redacted', ops.retention_redact_texts(now() - interval '24 months'),
      'contacts_erased', ops.retention_erase_contacts(now() - interval '12 months'))
      || v_files
      || jsonb_build_object('survey', survey.retention_purge());
    perform audit.append('retention.run', 'retention', to_char(now() at time zone 'Africa/Accra', 'YYYY-MM-DD'),
                         null, v_counts, 'system');
    if (v_files ->> 'files_awaiting_purge')::int > 0 then
      perform reports.invoke_generator(jsonb_build_object('action', 'purge'));
    end if;
    update ops.job_runs set status = 'succeeded', finished_at = now(), detail = v_counts where id = v_job;
  exception when others then
    update ops.job_runs set status = 'failed', finished_at = now(), detail = jsonb_build_object('error', sqlerrm)
     where id = v_job;
    return jsonb_build_object('error', sqlerrm);
  end;
  return v_counts;
end;
$$;
comment on function ops.retention_run() is 'Nightly retention (D-16), 03:00 Africa/Accra. Writes ops.job_runs and an audit entry retention.run with counts.';

revoke all on function ops.retention_redact_texts(timestamptz), ops.retention_erase_contacts(timestamptz),
  ops.retention_expire_files(), ops.retention_run() from public, anon, authenticated;
select cron.schedule('retention-nightly', '0 3 * * *', 'select ops.retention_run()');

-- ---------------------------------------------------------------------------
-- Data-subject requests (M16, FR-45). pii.view + settings.manage, or an Executive; audited.
-- ---------------------------------------------------------------------------
create or replace function pii.require_privacy_access()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or not app.has_perm('pii.view')
     or not (app.has_perm('settings.manage') or coalesce((auth.jwt() -> 'app_roles') ? 'executive', false))
     or not app.user_has_perm_now(v_uid, 'pii.view')
     or not (app.user_has_perm_now(v_uid, 'settings.manage')
             or exists (select 1 from public.user_role_grants g join public.roles r on r.id = g.role_id
                        where g.user_id = v_uid and g.status = 'active' and r.key = 'executive')) then
    raise exception 'You don''t have permission to handle data-protection requests.' using errcode = '42501',
      detail = 'pii.view + settings.manage, or executive';
  end if;
end;
$$;

create or replace function pii.normalize_lookup_phone(p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e164 text := survey.normalize_phone(p_phone,
    coalesce((select s.value from public.settings s where s.key = 'ghana_mobile_prefixes'), '[]'::jsonb));
begin
  if v_e164 is null then
    raise exception 'Enter a Ghana mobile number, for example 024 123 4567.' using errcode = '22023';
  end if;
  return v_e164;
end;
$$;

create or replace function pii.cases_for_response(p_response_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.j ->> 'id', 'reference', x.j ->> 'reference',
                                        'status', x.j ->> 'status', 'created_at', x.j ->> 'created_at'))
    from (select to_jsonb(c) as j from public.cases c where c.response_id = p_response_id) x), '[]'::jsonb);
end;
$$;

create or replace function public.privacy_find_contact(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e164 text;
  v_result jsonb;
begin
  perform pii.require_privacy_access();
  v_e164 := pii.normalize_lookup_phone(p_phone);
  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_id', c.id, 'response_id', r.id, 'reference', r.reference, 'submitted_at', r.submitted_at,
           'consent_text_version', c.consent_text_version, 'has_first_name', c.first_name_enc is not null,
           'cases', pii.cases_for_response(r.id)) order by r.submitted_at), '[]'::jsonb)
    into v_result
  from pii.contact_requests c
  join survey.responses r on r.id = c.response_id
  where c.phone_hmac = app.hmac('phone:' || v_e164) and c.erased_at is null;
  perform audit.append('privacy.contact_searched', 'contact', null, null,
                       jsonb_build_object('phone_masked', pii.mask_phone(v_e164), 'matches', jsonb_array_length(v_result)));
  return jsonb_build_object('phone_masked', pii.mask_phone(v_e164), 'contacts', v_result);
end;
$$;

-- Everything held about the person behind this number, for a subject-access request.
create or replace function public.privacy_export_subject(p_phone text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e164 text;
  v_records jsonb;
begin
  perform pii.require_privacy_access();
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Record the request reference or reason (at least 10 characters).' using errcode = '22023';
  end if;
  v_e164 := pii.normalize_lookup_phone(p_phone);
  select coalesce(jsonb_agg(jsonb_build_object(
           'reference', r.reference,
           'submitted_at', to_char(r.submitted_at at time zone 'Africa/Accra', 'YYYY-MM-DD HH24:MI:SS'),
           'first_name', pii.decrypt_field(c.dek_enc, c.first_name_enc),
           'phone', pii.decrypt_field(c.dek_enc, c.phone_e164_enc),
           'consent_text_version', c.consent_text_version,
           'service_channel', ch.label, 'service_channel_other', r.service_channel_other_text,
           'branch', b.name, 'branch_answer', r.branch_status, 'branch_other', r.issuing_branch_other_text,
           'insurance_product', pr.label, 'insurance_product_other', r.insurance_product_other_text,
           'satisfaction', r.csat_score, 'effort', r.ces_score, 'recommend', r.nps_score,
           'improvement_factor', fa.label, 'improvement_other', r.improvement_other_text,
           'comment', r.comment, 'cases', pii.cases_for_response(r.id)) order by r.submitted_at), '[]'::jsonb)
    into v_records
  from pii.contact_requests c
  join survey.responses r on r.id = c.response_id
  join public.service_channels ch on ch.id = r.service_channel_id
  join public.insurance_products pr on pr.id = r.insurance_product_id
  left join public.branches b on b.id = r.issuing_branch_id
  left join public.improvement_factors fa on fa.id = r.improvement_factor_id
  where c.phone_hmac = app.hmac('phone:' || v_e164) and c.erased_at is null;
  perform audit.append('privacy.subject_exported', 'contact', null, null,
                       jsonb_build_object('phone_masked', pii.mask_phone(v_e164), 'records', jsonb_array_length(v_records),
                                          'reason', left(btrim(p_reason), 500)));
  return jsonb_build_object('generated_at', now(), 'time_zone', 'Africa/Accra',
                            'controller', (select s.value #>> '{}' from public.settings s where s.key = 'company_legal_name'),
                            'records', v_records);
end;
$$;

-- Erase one contact (responses kept, de-identified: the link to a person is removed).
create or replace function public.privacy_erase_contact(p_contact_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c pii.contact_requests%rowtype;
begin
  perform pii.require_privacy_access();
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Record the request reference or reason (at least 10 characters).' using errcode = '22023';
  end if;
  select * into v_c from pii.contact_requests where id = p_contact_id for update;
  if not found then
    raise exception 'That contact no longer exists.' using errcode = 'P0002';
  end if;
  if v_c.erased_at is not null then
    raise exception 'These contact details were already erased.' using errcode = '22023';
  end if;
  update pii.contact_requests
     set phone_e164_enc = null, phone_hmac = null, first_name_enc = null, dek_enc = null, erased_at = now()
   where id = p_contact_id
   returning * into v_c;
  perform audit.append('privacy.contact_erased', 'contact', v_c.id::text, null,
                       jsonb_build_object('response_id', v_c.response_id, 'reason', left(btrim(p_reason), 500)));
  return jsonb_build_object('contact_id', v_c.id, 'response_id', v_c.response_id, 'erased_at', v_c.erased_at);
end;
$$;

revoke all on function pii.require_privacy_access(), pii.normalize_lookup_phone(text), pii.cases_for_response(uuid)
  from public, anon, authenticated;
revoke all on function public.privacy_find_contact(text), public.privacy_export_subject(text, text),
  public.privacy_erase_contact(uuid, text) from public, anon;
grant execute on function public.privacy_find_contact(text), public.privacy_export_subject(text, text),
  public.privacy_erase_contact(uuid, text) to authenticated;
