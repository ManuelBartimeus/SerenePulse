// Pure validators for the configuration screens. The settings rules mirror app.settings_validate()
// in supabase/migrations/202611070001_config_screens.sql; keep them in step.

/** Catalogue and directory codes: uppercase, start with a letter, permanent once saved (M02/M03). */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '_');
}

export function codeError(
  code: string,
  opts: { allowHyphen?: boolean; taken?: string[] } = {},
): string | null {
  const allowHyphen = opts.allowHyphen ?? true;
  if (!code) return 'Enter a code.';
  if (code.length > 30) return 'Keep the code to 30 characters or fewer.';
  const re = allowHyphen ? /^[A-Z][A-Z0-9_-]*$/ : /^[A-Z][A-Z0-9_]*$/;
  if (!re.test(code)) {
    return allowHyphen
      ? 'Start with a letter and use only capital letters, digits, "_" or "-".'
      : 'Start with a letter and use only capital letters, digits or "_".';
  }
  if (opts.taken?.includes(code))
    return 'That code is already used. Codes are never reused, even when inactive.';
  return null;
}

export function labelError(label: string, max = 80, what = 'a label'): string | null {
  const t = label.trim();
  if (!t) return `Enter ${what}.`;
  if (t.length > max) return `Keep it to ${max} characters or fewer.`;
  return null;
}

// ---------------------------------------------------------------------------
// Settings (M17)
// ---------------------------------------------------------------------------
export type SettingKind = 'int' | 'text' | 'bool' | 'keywords';

export interface SettingSpec {
  key: string;
  label: string;
  kind: SettingKind;
  group: 'survey' | 'analytics' | 'company' | 'privacy' | 'notifications';
  helper: string;
  min?: number;
  max?: number;
  unit?: string;
  /** Message when an int is out of range (defaults to "Enter a whole number from min to max."). */
  rangeError?: string;
  optional?: boolean;
  inputType?: 'text' | 'email' | 'tel';
}

export const SETTING_SPECS: SettingSpec[] = [
  {
    key: 'device_cooldown_hours',
    label: 'Wait before the same device can submit again',
    kind: 'int',
    group: 'survey',
    min: 0,
    max: 168,
    unit: 'hours',
    rangeError: 'Enter a whole number of hours from 0 (off) to 168.',
    helper: '0 turns this off — the same device can submit the form more than once.',
  },
  {
    key: 'session_expiry_hours',
    label: 'Unfinished survey expiry',
    kind: 'int',
    group: 'survey',
    min: 1,
    max: 168,
    unit: 'hours',
    helper: 'An unsubmitted survey with no activity for this long expires and counts as abandoned (1–168).',
  },
  {
    key: 'minimum_sample',
    label: 'Fewest responses to compare',
    kind: 'int',
    group: 'analytics',
    min: 5,
    max: 1000,
    unit: 'responses',
    helper:
      'Branches and groups with fewer responses than this are left out of comparisons and rankings (5–1,000).',
  },
  {
    key: 'include_unverified_default',
    label: 'Count responses that skipped the robot check',
    kind: 'bool',
    group: 'analytics',
    helper:
      'Some responses could not complete the quick robot check. When this is off, dashboards leave them out.',
  },
  {
    key: 'comment_keywords',
    label: 'Comment keywords',
    kind: 'keywords',
    group: 'analytics',
    helper:
      'A comment containing any of these words or phrases is flagged for review. Matching ignores capitals.',
  },
  {
    key: 'company_display_name',
    label: 'Company display name',
    kind: 'text',
    group: 'company',
    max: 120,
    helper: 'Used in customer-facing copy, for example the survey header and posters.',
  },
  {
    key: 'company_legal_name',
    label: 'Company legal name',
    kind: 'text',
    group: 'company',
    max: 120,
    helper: 'Used in the privacy notice and report footers.',
  },
  {
    key: 'support_phone',
    label: 'Support phone',
    kind: 'text',
    group: 'privacy',
    optional: true,
    inputType: 'tel',
    helper: 'Shown to customers in the privacy notice, for example +233 30 200 0000.',
  },
  {
    key: 'support_email',
    label: 'Support email',
    kind: 'text',
    group: 'privacy',
    optional: true,
    inputType: 'email',
    helper: 'Shown to customers in the privacy notice.',
  },
  {
    key: 'data_protection_contact',
    label: 'Data-protection contact',
    kind: 'text',
    group: 'privacy',
    optional: true,
    max: 200,
    helper:
      'Who customers contact about their data, for example the Data Protection Officer’s name and email.',
  },
  {
    key: 'dpc_registration_number',
    label: 'DPC registration number',
    kind: 'text',
    group: 'privacy',
    optional: true,
    max: 50,
    helper: 'Serene’s Data Protection Commission registration number, shown in the privacy notice.',
  },
  {
    key: 'email_daily_budget',
    label: 'Daily email budget',
    kind: 'int',
    group: 'notifications',
    min: 0,
    max: 500,
    unit: 'emails a day',
    helper:
      'The most emails the system sends in a day. Digests are held back first when the budget runs low (0–500).',
  },
];

export function settingSpec(key: string): SettingSpec | undefined {
  return SETTING_SPECS.find((s) => s.key === key);
}

/** Keywords: trimmed, empty entries dropped. Duplicates are reported, not silently merged. */
export function normaliseKeyword(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function keywordError(word: string, existing: string[]): string | null {
  const w = normaliseKeyword(word);
  if (w.length < 2 || w.length > 40) return 'Each keyword must be 2 to 40 characters.';
  if (existing.some((e) => e.toLowerCase() === w.toLowerCase())) return `“${w}” is already in the list.`;
  if (existing.length >= 100) return 'The list can hold up to 100 keywords.';
  return null;
}

const PHONE = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DPC = /^[A-Za-z0-9][A-Za-z0-9 /.-]{0,49}$/;

/**
 * Parses the form value for a setting into the JSON stored in public.settings, or returns the
 * message to show next to the field.
 */
export function parseSetting(
  key: string,
  input: string | boolean | string[],
): { ok: true; value: unknown } | { ok: false; error: string } {
  const spec = settingSpec(key);
  if (!spec) return { ok: false, error: 'Unknown setting.' };
  switch (spec.kind) {
    case 'bool':
      return typeof input === 'boolean'
        ? { ok: true, value: input }
        : { ok: false, error: 'Choose on or off.' };
    case 'int': {
      const s = String(input).trim().replace(/,/g, '');
      const lo = spec.min ?? 0;
      const hi = spec.max ?? Number.MAX_SAFE_INTEGER;
      const n = /^-?\d+$/.test(s) ? Number(s) : NaN;
      if (!Number.isInteger(n) || n < lo || n > hi) {
        return {
          ok: false,
          error:
            spec.rangeError ??
            `Enter a whole number from ${lo.toLocaleString('en-GH')} to ${hi.toLocaleString('en-GH')}.`,
        };
      }
      return { ok: true, value: n };
    }
    case 'keywords': {
      if (!Array.isArray(input)) return { ok: false, error: 'Add keywords one at a time.' };
      const words = input.map(normaliseKeyword).filter(Boolean);
      if (words.length > 100) return { ok: false, error: 'Keep the keyword list to 100 entries or fewer.' };
      if (words.some((w) => w.length < 2 || w.length > 40))
        return { ok: false, error: 'Each keyword must be 2 to 40 characters.' };
      if (new Set(words.map((w) => w.toLowerCase())).size !== words.length)
        return { ok: false, error: 'Each keyword may appear only once.' };
      return { ok: true, value: words };
    }
    case 'text': {
      const t = String(input).trim();
      if (!t && !spec.optional) return { ok: false, error: 'This can’t be empty.' };
      if (spec.max && t.length > spec.max)
        return { ok: false, error: `Keep it to ${spec.max} characters or fewer.` };
      if (t && key === 'support_phone' && !PHONE.test(t))
        return {
          ok: false,
          error: 'Enter a phone number using digits, spaces, brackets or dashes, e.g. +233 30 200 0000.',
        };
      if (t && key === 'support_email' && (!EMAIL.test(t) || t.length > 254))
        return { ok: false, error: 'Enter an email address like name@example.com.' };
      if (t && key === 'dpc_registration_number' && !DPC.test(t))
        return {
          ok: false,
          error: 'Use letters, numbers, spaces, slashes, dots or dashes (up to 50 characters).',
        };
      return { ok: true, value: t };
    }
  }
}

/** Turns a stored setting value into the form's input value. */
export function settingInput(key: string, value: unknown): string | boolean | string[] {
  const spec = settingSpec(key);
  if (spec?.kind === 'bool') return value === true;
  if (spec?.kind === 'keywords') return Array.isArray(value) ? value.map(String) : [];
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Plain rendering of a stored value for the history list. */
export function formatSettingValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty list)';
  if (value === '') return '(empty)';
  return String(value);
}
