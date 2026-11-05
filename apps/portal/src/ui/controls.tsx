import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-700 disabled:bg-border-strong',
  secondary: 'bg-white text-ink border border-border-strong hover:bg-surface-muted disabled:text-muted',
  ghost: 'bg-transparent text-ink hover:bg-surface-muted disabled:text-muted',
  danger: 'bg-danger text-white hover:brightness-90 disabled:bg-border-strong',
};

/** Pill button (DS §5.1, E1): 48 px, medium label, 200 ms background transition. */
export function Button({
  variant = 'primary',
  busy = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[16px] font-medium transition-colors duration-200 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
    />
  );
}

/** Text input with a visible label, helper text and inline error (E4). */
export function TextField({
  label,
  helper,
  error,
  optional,
  type = 'text',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  helper?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
}) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const describedBy =
    [helper ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-sm border bg-white px-4 text-[16px] outline-none transition-colors hover:border-ink focus-visible:border-brand ${
            error ? 'border-danger' : 'border-border-strong'
          } ${isPassword ? 'pr-20' : ''}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute inset-y-0 right-1 my-1 rounded-sm px-3 text-[14px] font-medium text-brand hover:bg-brand-50"
            aria-label={reveal ? 'Hide password' : 'Show password'}
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
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

type Tone = 'danger' | 'success' | 'info' | 'warning';
const TONES: Record<Tone, string> = {
  danger: 'bg-danger-bg text-danger',
  success: 'bg-success-bg text-success',
  info: 'bg-info-bg text-info',
  warning: 'bg-warning-bg text-warning',
};

/** Inline alert (E5). Errors use role=alert; everything else is a polite status. */
export function Alert({
  tone,
  title,
  children,
  detail,
}: {
  tone: Tone;
  title?: string | undefined;
  children?: ReactNode;
  detail?: string | undefined;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-sm px-4 py-3 text-[14px] leading-5 ${TONES[tone]}`}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      {detail && (
        <details className="mt-2 text-[12px] leading-4 opacity-80">
          <summary className="cursor-pointer">Details</summary>
          <code className="break-all">{detail}</code>
        </details>
      )}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone | 'neutral' | 'brand';
  children: ReactNode;
}) {
  const cls =
    tone === 'neutral'
      ? 'bg-surface-muted text-secondary'
      : tone === 'brand'
        ? 'bg-brand-50 text-brand'
        : TONES[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-4 ${cls}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div
        aria-hidden
        className="grid size-16 place-items-center rounded-full bg-subtle text-[28px] text-brand"
      >
        ○
      </div>
      <p className="text-[18px] font-medium leading-6">{title}</p>
      {children && <div className="max-w-md text-secondary">{children}</div>}
      {action}
    </div>
  );
}
