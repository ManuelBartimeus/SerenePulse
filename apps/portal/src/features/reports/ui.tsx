// Small building blocks for the reports area (forms, file rows, status badges).
import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { toUserError } from '../../lib/errors';
import { Alert, Badge, Button } from '../../ui/controls';
import { FORMAT_LABEL, type ReportFile } from './api';
import { formatBytes, formatDate, formatDateTime } from './schedule';

export const fieldClass =
  'h-12 w-full rounded-sm border border-border-strong bg-white px-4 text-[16px] outline-none hover:border-ink focus-visible:border-brand';

export function SelectField({
  label,
  helper,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; helper?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
      </label>
      <select id={id} className={fieldClass} aria-describedby={helper ? `${id}-help` : undefined} {...rest}>
        {children}
      </select>
      {helper && (
        <p id={`${id}-help`} className="text-[14px] leading-5 text-secondary">
          {helper}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  helper,
  error,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  helper?: ReactNode;
  error?: string | undefined;
}) {
  const id = useId();
  const describedBy =
    [helper ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-sm border bg-white px-4 py-3 text-[16px] outline-none hover:border-ink focus-visible:border-brand ${
          error ? 'border-danger' : 'border-border-strong'
        }`}
        {...rest}
      />
      {helper && (
        <p id={`${id}-help`} className="text-[14px] leading-5 text-secondary">
          {helper}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="rounded-xs bg-danger-bg px-3 py-2 text-[14px] leading-5 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A labelled checkbox with a 44 px target. */
export function Check({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-start gap-3 py-1">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 accent-[var(--color-brand,#17524a)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <label htmlFor={id} className="text-[16px] leading-6">
        {label}
        {hint && (
          <span id={`${id}-hint`} className="block text-[14px] leading-5 text-secondary">
            {hint}
          </span>
        )}
      </label>
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const e = toUserError(error);
  return (
    <Alert tone="danger" detail={e.detail}>
      {e.message}
    </Alert>
  );
}

export function StatusBadge({ file }: { file: ReportFile }) {
  const expired = file.status === 'expired' || new Date(file.expires_at) <= new Date();
  if (expired) return <Badge>Expired</Badge>;
  switch (file.status) {
    case 'ready':
      return <Badge tone="success">Ready</Badge>;
    case 'pending':
      return <Badge tone="info">Generating</Badge>;
    case 'failed':
      return <Badge tone="danger">Failed</Badge>;
    default:
      return <Badge>{file.status}</Badge>;
  }
}

/** One file in a list: what it is, its period, size, expiry and a download button when ready. */
export function FileRow({
  file,
  title,
  onDownload,
  busy,
}: {
  file: ReportFile;
  title: string;
  onDownload: (id: string) => void;
  busy: boolean;
}) {
  const ready = file.status === 'ready' && new Date(file.expires_at) > new Date();
  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {title} <Badge tone="brand">{FORMAT_LABEL[file.format] ?? file.format}</Badge>{' '}
          <StatusBadge file={file} />
          {file.contains_pii && <Badge tone="warning">Contains contact details</Badge>}
        </p>
        <p className="text-[14px] text-secondary">
          {file.period_from && file.period_to
            ? `${formatDate(file.period_from)} to ${formatDate(file.period_to)} · `
            : ''}
          {file.row_count !== null ? `${file.row_count.toLocaleString('en-GH')} rows · ` : ''}
          {formatBytes(file.byte_size)} · created {formatDateTime(file.created_at)}
          {ready ? ` · available until ${formatDateTime(file.expires_at)}` : ''}
        </p>
        {file.status === 'failed' && file.error && <p className="text-[14px] text-danger">{file.error}</p>}
      </div>
      {ready && (
        <Button
          variant="secondary"
          busy={busy}
          onClick={() => onDownload(file.id)}
          aria-label={`Download ${title}`}
        >
          Download
        </Button>
      )}
    </li>
  );
}
