// Resume rules shared by the Worker (choice screen, first render) and the island (hydration), so a
// returning customer lands on the same page with or without JavaScript.
import {
  isPresent,
  pageOf,
  validate,
  type Answers,
  type Definition,
  type Snapshot,
} from '@serene/survey-engine';

/** `?resume=1`: the customer chose "Pick up where you left off" (or is reloading a form in progress). */
export const RESUME_PARAM = 'resume';
/** `?fresh=1`: the customer chose "Start a new feedback form"; nothing from the old form carries over. */
export const FRESH_PARAM = 'fresh';

/** True when a draft holds at least one real answer (an untouched toggle does not count). */
export function hasDraftAnswers(answers: Answers): boolean {
  return Object.values(answers).some((v) => isPresent(v) && v !== false);
}

/**
 * The first (1-based) page that still has an unanswered required question, or an answer that no
 * longer validates. When everything required is answered, the last page (where Submit is).
 */
export function firstOpenPage(def: Definition, snap: Snapshot, answers: Answers): number {
  let first = def.pages.length;
  for (const e of validate(def, snap, answers).errors) {
    const p = pageOf(def, e.field) + 1;
    if (p > 0 && p < first) first = p;
  }
  return first;
}

/** "5 November 2026 at 2:05 pm" in Ghana time (Africa/Accra, UTC+0). */
export function formatStarted(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = 'Africa/Accra';
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(d)
    .replace(/\s?([ap])\.?m\.?$/i, ' $1m')
    .toLowerCase();
  return `${date} at ${time}`;
}
