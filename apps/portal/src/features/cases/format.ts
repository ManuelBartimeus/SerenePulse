// Pure helpers for the cases feature (labels, response-deadline countdown, mentions, errors). Unit-tested.

export type CaseStatus = 'new' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type SlaState = 'on_track' | 'warning' | 'breached' | 'met' | 'missed';

export const CASE_STATUSES: { key: CaseStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];
export const PRIORITIES: { key: Priority; label: string; days: number }[] = [
  { key: 'P1', label: 'Urgent', days: 1 },
  { key: 'P2', label: 'High', days: 3 },
  { key: 'P3', label: 'Normal', days: 5 },
  { key: 'P4', label: 'Low', days: 10 },
];
export const FOLLOW_UP_OUTCOMES = [
  { key: 'not_required', label: 'No follow-up needed' },
  { key: 'contacted_resolved', label: 'Contacted, customer satisfied' },
  { key: 'contacted_unresolved', label: 'Contacted, still unhappy' },
  { key: 'unreachable', label: 'Could not reach the customer' },
  { key: 'declined', label: 'Customer declined contact' },
] as const;
export const ESCALATION_LABELS = [
  'Officer',
  'Department head',
  'Customer experience administrator',
  'Executive',
];

export function statusLabel(s: string): string {
  return CASE_STATUSES.find((x) => x.key === s)?.label ?? s.replace(/_/g, ' ');
}

export function statusTone(s: string): 'brand' | 'info' | 'warning' | 'success' | 'neutral' {
  switch (s) {
    case 'new':
      return 'brand';
    case 'assigned':
      return 'info';
    case 'in_progress':
      return 'warning';
    case 'resolved':
      return 'success';
    default:
      return 'neutral';
  }
}

/** Plain priority name (Urgent / High / Normal / Low) for a stored P1–P4 value. */
export function priorityLabel(p: string): string {
  return PRIORITIES.find((x) => x.key === p)?.label ?? p;
}

export function priorityTone(p: string): 'danger' | 'warning' | 'info' | 'neutral' {
  return p === 'P1' ? 'danger' : p === 'P2' ? 'warning' : p === 'P3' ? 'info' : 'neutral';
}

export function slaLabel(state: string): string {
  return (
    (
      {
        on_track: 'On track',
        warning: 'Deadline approaching',
        breached: 'Past deadline',
        met: 'Resolved on time',
        missed: 'Resolved late',
      } as Record<string, string>
    )[state] ?? state
  );
}

export function slaTone(state: string): 'success' | 'warning' | 'danger' | 'neutral' {
  return state === 'breached' || state === 'missed'
    ? 'danger'
    : state === 'warning'
      ? 'warning'
      : state === 'met'
        ? 'success'
        : 'neutral';
}

/** "1 day 3 h" from fractional working days (9 working hours per day, D-18). */
export function formatWorkingDays(days: number | null | undefined): string {
  if (days === null || days === undefined || Number.isNaN(days)) return '—';
  const totalHours = Math.round(Math.abs(days) * 9);
  const d = Math.floor(totalHours / 9);
  const h = totalHours % 9;
  if (d === 0 && h === 0) return 'under 1 working hour';
  const parts = [d ? `${d} working day${d === 1 ? '' : 's'}` : '', h ? `${h} h` : ''].filter(Boolean);
  return parts.join(' ');
}

/** Response-deadline countdown text and progress for the case header. */
export function slaSummary(sla: {
  state: string;
  target_working_days: number;
  elapsed_working_days: number | null;
  remaining_working_days: number | null;
  overdue_working_days: number | null;
}): { text: string; pct: number } {
  const pct = Math.max(
    0,
    Math.min(100, Math.round(((sla.elapsed_working_days ?? 0) / (sla.target_working_days || 1)) * 100)),
  );
  if (sla.state === 'met') return { text: 'Resolved before the deadline', pct };
  if (sla.state === 'missed') return { text: 'Resolved after the deadline', pct };
  if (sla.state === 'breached')
    return { text: `Past deadline by ${formatWorkingDays(sla.overdue_working_days)}`, pct: 100 };
  return { text: `${formatWorkingDays(sla.remaining_working_days)} left`, pct };
}

const dateTime = new Intl.DateTimeFormat('en-GH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Accra',
});
const dateOnly = new Intl.DateTimeFormat('en-GH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Africa/Accra',
});
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : '—';
export const formatDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : '—');

/** "5 min ago", "3 h ago", or the date for anything older than a day. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return formatDate(iso);
}

export interface Person {
  user_id: string;
  display_name: string;
}

/**
 * The @mentions in a note: people whose "@Display Name" appears in the text (case-insensitive,
 * longest names first so "@Ama Mensah" wins over "@Ama").
 */
export function findMentions(body: string, people: Person[]): string[] {
  const text = body.toLowerCase();
  const found = new Set<string>();
  let rest = text;
  for (const p of [...people]
    .filter((x) => x.display_name.trim())
    .sort((a, b) => b.display_name.length - a.display_name.length)) {
    const tag = '@' + p.display_name.trim().toLowerCase();
    const idx = rest.indexOf(tag);
    if (idx >= 0) {
      const after = rest.charAt(idx + tag.length);
      if (after === '' || !/[\p{L}\p{N}]/u.test(after)) {
        found.add(p.user_id);
        rest = rest.slice(0, idx) + ' '.repeat(tag.length) + rest.slice(idx + tag.length);
      }
    }
  }
  return [...found];
}

/** The partial "@name" being typed at the end of the text, for suggestions. */
export function mentionQuery(body: string): string | null {
  const m = /(?:^|\s)@([\p{L}\p{N} .'-]{0,40})$/u.exec(body);
  return m ? (m[1] ?? '').trimStart() : null;
}

export const ACTIVITY_LABELS: Record<string, string> = {
  created: 'Case created',
  assigned: 'Assigned',
  reassigned: 'Reassigned',
  status_changed: 'Status changed',
  priority_changed: 'Priority changed',
  note: 'Note',
  investigation: 'Investigation',
  escalated: 'Escalated',
  de_escalated: 'De-escalated',
  corrective_action: 'Corrective action',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
  sla_warning: 'Deadline approaching',
  sla_breached: 'Past deadline',
  follow_up_recorded: 'Follow-up recorded',
  contact_revealed: 'Contact details revealed',
};

export function activityValue(type: string, v: string | null): string | null {
  if (v === null) return null;
  if (type === 'status_changed' || type === 'resolved' || type === 'closed' || type === 'reopened')
    return statusLabel(v);
  if (type === 'priority_changed') return priorityLabel(v);
  if (type === 'follow_up_recorded') return FOLLOW_UP_OUTCOMES.find((o) => o.key === v)?.label ?? v;
  return v;
}

/**
 * Plain wording for system-written reasons and descriptions ("CSAT 2; comment keyword" →
 * "Satisfaction rating 2 of 5; concerning comment").
 */
export function plainReason(text: string): string {
  return text
    .replace(/\bCSAT (\d)\b/g, 'Satisfaction rating $1 of 5')
    .replace(/\bcomment keyword\b/g, 'concerning comment');
}

/** True when an error is the optimistic-lock conflict (P0409). */
export function isConflict(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P0409';
}

/** Opaque cursor parts → next page parameter for infinite queries. */
export function nextCursor(page: { next_cursor: string | null }): string | undefined {
  return page.next_cursor ?? undefined;
}
