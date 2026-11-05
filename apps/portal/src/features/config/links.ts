// Public survey links (M05). The survey lives under VITE_SURVEY_URL (e.g. https://<origin>/customerfeedback).

/**
 * Joins the survey base URL with an optional path and query without doubling or dropping slashes.
 * `surveyLink(base)` → base; `surveyLink(base, '/q/K7P2')` → base/q/K7P2; `surveyLink(base, '', {src:'sms'})`
 * → base?src=sms (no slash before "?").
 */
export function surveyLink(base: string, path = '', query?: Record<string, string>): string {
  const trimmed = base.trim().replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  let url = cleanPath ? `${trimmed}/${cleanPath}` : trimmed;
  const params = query ? new URLSearchParams(query).toString() : '';
  if (params) url += `?${params}`;
  return url;
}

export const qrLink = (base: string, code: string) => surveyLink(base, `/q/${encodeURIComponent(code)}`);
export const smsLink = (base: string) => surveyLink(base, '', { src: 'sms' });

/** The link without the scheme, for printing as a short text fallback. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

// ---------------------------------------------------------------------------
// SMS length (the SMS team's provider bills per 160-character GSM-7 segment)
// ---------------------------------------------------------------------------
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';

export interface SmsLength {
  encoding: 'GSM-7' | 'UCS-2';
  /** Characters as the network counts them (extended GSM characters count twice). */
  units: number;
  /** Characters allowed in a single message for this encoding. */
  limit: 160 | 70;
  segments: number;
  fitsOne: boolean;
}

export function smsLength(text: string): SmsLength {
  const chars = [...text];
  const gsm = chars.every((c) => GSM_BASIC.includes(c) || GSM_EXTENDED.includes(c));
  if (gsm) {
    const units = chars.reduce((n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
    const segments = units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153);
    return { encoding: 'GSM-7', units, limit: 160, segments, fitsOne: units <= 160 };
  }
  const units = text.length; // UTF-16 code units
  const segments = units <= 70 ? 1 : Math.ceil(units / 67);
  return { encoding: 'UCS-2', units, limit: 70, segments, fitsOne: units <= 70 };
}

/** SPEC NOTIFICATIONS [A-88] suggested wording, with the real link. */
export function suggestedSmsWording(link: string, companyName = 'Serene Insurance'): string {
  return `Thank you for choosing ${companyName}. Tell us how we did in under 1 minute: ${link}`;
}
