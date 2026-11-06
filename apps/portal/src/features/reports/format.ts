// Date and size formatting for downloads, data-protection requests and system status (Africa/Accra).

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
