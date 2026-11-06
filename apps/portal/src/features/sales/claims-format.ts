// Claims: plain-language statuses, queue tabs, document checklist and the one-week principle.
// Pure functions (unit-tested).
import { humanise, isoDay } from './format';

type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

export const CLAIM_STATUS: Record<string, { label: string; tone: Tone }> = {
  received: { label: 'New', tone: 'warning' },
  under_review: { label: 'Being assessed', tone: 'info' },
  info_requested: { label: 'Waiting for customer', tone: 'warning' },
  approved: { label: 'Approved', tone: 'brand' },
  settled: { label: 'Paid', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};
export const claimStatus = (s: string) => CLAIM_STATUS[s] ?? { label: humanise(s), tone: 'neutral' as Tone };

export type ClaimTab = 'new' | 'assessing' | 'waiting' | 'approved' | 'paid' | 'declined' | 'all';
export const CLAIM_TABS: { key: ClaimTab; label: string; statuses: readonly string[] }[] = [
  { key: 'new', label: 'New', statuses: ['received'] },
  { key: 'assessing', label: 'Being assessed', statuses: ['under_review'] },
  { key: 'waiting', label: 'Waiting for customer', statuses: ['info_requested'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'paid', label: 'Paid', statuses: ['settled'] },
  { key: 'declined', label: 'Declined', statuses: ['declined', 'withdrawn'] },
  { key: 'all', label: 'All', statuses: [] },
];
export const claimTabStatuses = (tab: string): readonly string[] =>
  (CLAIM_TABS.find((t) => t.key === tab) ?? CLAIM_TABS[0])?.statuses ?? [];
export const isClaimTab = (v: unknown): v is ClaimTab => CLAIM_TABS.some((t) => t.key === v);

/** Claims still waiting for a decision. */
export const OPEN_CLAIM_STATUSES = ['received', 'under_review', 'info_requested'] as const;
export const isOpenClaim = (s: string) => (OPEN_CLAIM_STATUSES as readonly string[]).includes(s);

export interface ClaimAction {
  to: string;
  label: string;
  /** What the dialog asks for; every action sends the customer a message. */
  prompt: string;
  danger?: boolean;
}

/** Staff actions allowed from each claim status (mirrors sales.claim_next_statuses). */
export function claimActions(status: string): ClaimAction[] {
  const a = {
    assess: { to: 'under_review', label: 'Start assessing', prompt: 'Message to the customer (optional)' },
    ask: {
      to: 'info_requested',
      label: 'Ask the customer for more',
      prompt: 'What do you need from the customer?',
    },
    approve: { to: 'approved', label: 'Approve', prompt: 'Message to the customer (amount and next steps)' },
    paid: { to: 'settled', label: 'Mark paid', prompt: 'Message to the customer (how and when it was paid)' },
    decline: {
      to: 'declined',
      label: 'Decline',
      prompt: 'Reason, as the customer will read it',
      danger: true,
    },
  };
  switch (status) {
    case 'received':
      return [a.assess];
    case 'under_review':
      return [a.ask, a.approve, a.decline];
    case 'info_requested':
      return [a.assess];
    case 'approved':
      return [a.paid];
    default:
      return [];
  }
}

/**
 * Working days (Mon–Fri, not a public holiday) from `from` to `to`, not counting the start day:
 * a claim reported on Monday is 1 working day old on Tuesday. Africa/Accra is UTC+0.
 */
export function workingDaysBetween(
  from: string | Date,
  to: string | Date,
  holidays: ReadonlySet<string> = new Set(),
): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let n = 0;
  while (d < last) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(isoDay(d))) n++;
  }
  return n;
}

interface DocSpec {
  kind: string;
  label: string;
  required: boolean;
}
interface FileLike {
  kind: string;
  created_at: string;
}

/** Each document the claim type asks for, and whether the customer has added it. */
export function documentChecklist(documents: readonly DocSpec[], files: readonly FileLike[]) {
  return documents.map((d) => ({ ...d, present: files.some((f) => f.kind === d.kind) }));
}

/**
 * When the last required document arrived (null while any is missing). A claim type with no
 * required documents is complete when it was reported.
 */
export function documentsCompleteAt(
  documents: readonly Pick<DocSpec, 'kind' | 'required'>[],
  files: readonly FileLike[],
  reportedAt: string,
): string | null {
  let latest = reportedAt;
  for (const d of documents.filter((x) => x.required)) {
    const first = files
      .filter((f) => f.kind === d.kind)
      .map((f) => f.created_at)
      .sort()[0];
    if (!first) return null;
    if (first > latest) latest = first;
  }
  return latest;
}

/** Serene's one-week claim principle: a decision within 5 working days of the last document. */
export const CLAIM_DECISION_DAYS = 5;

export function claimOverdue(
  status: string,
  completeAt: string | null,
  now: Date,
  holidays: ReadonlySet<string> = new Set(),
): boolean {
  if (!completeAt || !['received', 'under_review'].includes(status)) return false;
  return workingDaysBetween(completeAt, now, holidays) > CLAIM_DECISION_DAYS;
}
