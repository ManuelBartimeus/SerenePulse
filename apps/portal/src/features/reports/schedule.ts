// Report catalogue and schedule maths for the portal. Mirrors reports.next_run_at / reports.period_for
// in supabase/migrations/202611100001_reports_exports.sql (the database is authoritative; this shows
// "Next run" while a schedule is being edited). Africa/Accra is UTC+0 all year, so UTC dates are local.

export type ReportKey = 'daily_operational' | 'weekly_branch' | 'monthly_executive' | 'quarterly_trend';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export const REPORTS: {
  key: ReportKey;
  frequency: Frequency;
  label: string;
  when: string;
  covers: string;
}[] = [
  {
    key: 'daily_operational',
    frequency: 'daily',
    label: 'Daily operational summary',
    when: 'Every day at 07:00',
    covers: 'the previous day',
  },
  {
    key: 'weekly_branch',
    frequency: 'weekly',
    label: 'Weekly branch report',
    when: 'Mondays at 07:00',
    covers: 'the previous Monday to Sunday',
  },
  {
    key: 'monthly_executive',
    frequency: 'monthly',
    label: 'Monthly executive report',
    when: 'The 1st of each month at 07:00',
    covers: 'the previous month',
  },
  {
    key: 'quarterly_trend',
    frequency: 'quarterly',
    label: 'Quarterly trend report',
    when: 'The first working day of each quarter at 07:00',
    covers: 'the previous quarter, month by month',
  },
];

export function reportInfo(key: ReportKey) {
  const found = REPORTS.find((r) => r.key === key);
  if (!found) throw new Error(`Unknown report ${key}`);
  return found;
}

export const reportLabel = (key: string) => REPORTS.find((r) => r.key === key)?.label ?? key;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m, d, h));

/** Mon–Fri and not a public holiday (public.holidays, D-18). */
export function isWorkingDay(day: Date, holidays: ReadonlySet<string>): boolean {
  const dow = day.getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(iso(day));
}

export function firstWorkingDayOnOrAfter(day: Date, holidays: ReadonlySet<string>): Date {
  const d = new Date(day);
  while (!isWorkingDay(d, holidays)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Next 07:00 Africa/Accra run strictly after `after`. */
export function nextRunAt(
  frequency: Frequency,
  after: Date,
  holidays: ReadonlySet<string> = new Set(),
): Date {
  const y = after.getUTCFullYear();
  const m = after.getUTCMonth();
  const d = after.getUTCDate();
  switch (frequency) {
    case 'daily': {
      const at = utc(y, m, d, 7);
      return at > after ? at : utc(y, m, d + 1, 7);
    }
    case 'weekly': {
      const monday = d - ((after.getUTCDay() + 6) % 7);
      const at = utc(y, m, monday, 7);
      return at > after ? at : utc(y, m, monday + 7, 7);
    }
    case 'monthly': {
      const at = utc(y, m, 1, 7);
      return at > after ? at : utc(y, m + 1, 1, 7);
    }
    case 'quarterly': {
      let q = utc(y, m - (m % 3), 1);
      for (;;) {
        const day = firstWorkingDayOnOrAfter(q, holidays);
        const at = utc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 7);
        if (at > after) return at;
        q = utc(q.getUTCFullYear(), q.getUTCMonth() + 3, 1);
      }
    }
  }
}

/** The complete period a run on `runDate` (YYYY-MM-DD) reports on. */
export function periodFor(frequency: Frequency, runDate: string): { from: string; to: string } {
  const [y, m, d] = runDate.split('-').map(Number) as [number, number, number];
  const day = utc(y, m - 1, d);
  switch (frequency) {
    case 'daily':
      return { from: iso(utc(y, m - 1, d - 1)), to: iso(utc(y, m - 1, d - 1)) };
    case 'weekly': {
      const monday = d - ((day.getUTCDay() + 6) % 7);
      return { from: iso(utc(y, m - 1, monday - 7)), to: iso(utc(y, m - 1, monday - 1)) };
    }
    case 'monthly':
      return { from: iso(utc(y, m - 2, 1)), to: iso(utc(y, m - 1, 0)) };
    case 'quarterly': {
      const q = m - 1 - ((m - 1) % 3);
      return { from: iso(utc(y, q - 3, 1)), to: iso(utc(y, q, 0)) };
    }
  }
}

const dateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Accra',
});
const dateOnly = new Intl.DateTimeFormat('en-GH', { dateStyle: 'short', timeZone: 'Africa/Accra' });

export const formatDateTime = (v: string | Date) => dateTime.format(new Date(v));
export const formatDate = (v: string | Date) =>
  dateOnly.format(typeof v === 'string' && v.length === 10 ? new Date(`${v}T00:00:00Z`) : new Date(v));

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
