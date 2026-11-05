-- Device cooldown switched off for now (user direction, 2026-11-05): the same device may submit
-- the form several times. The mechanism stays in place — survey_start_session / survey_submit
-- skip the check when device_cooldown_hours is 0 — so turning it back on is a settings change
-- (Settings › Survey, or set device_cooldown_hours to e.g. 24). 0 now means "off".

create or replace function app.settings_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v jsonb := new.value;
  v_text text;
begin
  case new.key
    when 'device_cooldown_hours' then
      if not app.setting_int_between(v, 0, 168) then
        raise exception 'Enter a whole number of hours from 0 (off) to 168.' using errcode = '22023';
      end if;
    when 'session_expiry_hours' then
      if not app.setting_int_between(v, 1, 168) then
        raise exception 'Enter a whole number of hours from 1 to 168.' using errcode = '22023';
      end if;
    when 'minimum_sample' then
      if not app.setting_int_between(v, 5, 1000) then
        raise exception 'Enter a whole number from 5 to 1,000.' using errcode = '22023';
      end if;
    when 'email_daily_budget' then
      if not app.setting_int_between(v, 0, 500) then
        raise exception 'Enter a whole number of emails from 0 to 500.' using errcode = '22023';
      end if;
    when 'include_unverified_default' then
      if jsonb_typeof(v) <> 'boolean' then
        raise exception 'Choose on or off.' using errcode = '22023';
      end if;
    when 'company_display_name', 'company_legal_name' then
      v_text := btrim(coalesce(v #>> '{}', ''));
      if jsonb_typeof(v) <> 'string' or v_text = '' or length(v_text) > 120 then
        raise exception 'Enter a name of 1 to 120 characters.' using errcode = '22023';
      end if;
    when 'support_phone' then
      v_text := btrim(coalesce(v #>> '{}', ''));
      if jsonb_typeof(v) <> 'string' or (v_text <> '' and v_text !~ '^\+?[0-9][0-9 ()-]{5,18}[0-9]$') then
        raise exception 'Enter a phone number using digits, spaces, brackets or dashes, e.g. +233 30 200 0000.'
          using errcode = '22023';
      end if;
    when 'support_email' then
      v_text := btrim(coalesce(v #>> '{}', ''));
      if jsonb_typeof(v) <> 'string' or (v_text <> '' and v_text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
         or length(v_text) > 254 then
        raise exception 'Enter an email address like name@example.com.' using errcode = '22023';
      end if;
    when 'data_protection_contact' then
      if jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 200 then
        raise exception 'Keep the data-protection contact under 200 characters.' using errcode = '22023';
      end if;
    when 'dpc_registration_number' then
      v_text := btrim(coalesce(v #>> '{}', ''));
      if jsonb_typeof(v) <> 'string' or (v_text <> '' and v_text !~ '^[A-Za-z0-9][A-Za-z0-9 /.-]{0,49}$') then
        raise exception 'Use letters, numbers, spaces, slashes, dots or dashes (up to 50 characters).'
          using errcode = '22023';
      end if;
    when 'comment_keywords' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 100 then
        raise exception 'Keep the keyword list to 100 entries or fewer.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(v) e
                 where jsonb_typeof(e) <> 'string' or length(btrim(e #>> '{}')) not between 2 and 40) then
        raise exception 'Each keyword must be 2 to 40 characters.' using errcode = '22023';
      end if;
      if (select count(distinct lower(btrim(e #>> '{}'))) from jsonb_array_elements(v) e) <> jsonb_array_length(v) then
        raise exception 'Each keyword may appear only once.' using errcode = '22023';
      end if;
    else
      null;
  end case;
  return new;
end;
$$;

update public.settings
   set value = '0'::jsonb,
       description = 'Hours a device must wait after submitting before starting another survey (A-123). 0 = off: the same device may submit several times.'
 where key = 'device_cooldown_hours';
