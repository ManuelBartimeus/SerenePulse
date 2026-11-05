// Public survey links (M05). The survey lives under VITE_SURVEY_URL (e.g. https://<origin>/customerfeedback).

/**
 * Joins the survey base URL with an optional path and query without doubling or dropping slashes.
 * `surveyLink(base)` → base; `surveyLink(base, '/thanks')` → base/thanks; `surveyLink(base, '', {lang:'en'})`
 * → base?lang=en (no slash before "?").
 */
export function surveyLink(base: string, path = '', query?: Record<string, string>): string {
  const trimmed = base.trim().replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  let url = cleanPath ? `${trimmed}/${cleanPath}` : trimmed;
  const params = query ? new URLSearchParams(query).toString() : '';
  if (params) url += `?${params}`;
  return url;
}

/** The link without the scheme, for printing as a short text fallback. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
