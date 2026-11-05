import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { IconAlert, IconCheckCircle, IconInbox, IconInfo, IconXCircle } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-white shadow-xs hover:bg-brand-700 active:bg-brand-700 disabled:bg-border-strong disabled:shadow-none',
  secondary:
    'bg-white text-ink border border-border-strong/60 shadow-xs hover:border-ink hover:bg-subtle active:bg-surface-muted disabled:border-border disabled:text-muted disabled:shadow-none',
  ghost: 'bg-transparent text-ink hover:bg-surface-muted active:bg-border-subtle disabled:text-muted',
  danger:
    'bg-danger text-white shadow-xs hover:brightness-90 active:brightness-[.85] disabled:bg-border-strong',
};

/** Pill button (DS §5.1, E1): 48 px, medium label, 200 ms background transition, 1 px press. */
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
      className={`inline-flex h-12 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-medium tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 motion-reduce:transition-none ${VARIANTS[variant]} ${className}`}
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
      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80 motion-reduce:animate-none"
    />
  );
}

/**
 * Loading placeholder with the shape of the content it replaces (E5: skeletons over spinners).
 * Decorative; pair it with a polite status message for screen readers on the containing region.
 */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-xs bg-surface-muted motion-reduce:animate-none ${className}`}
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
      <label htmlFor={id} className="text-[14px] font-medium leading-5 text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-sm border bg-white px-4 text-[16px] text-ink shadow-xs outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted hover:border-ink focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_var(--color-brand-50)] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted motion-reduce:transition-none ${
            error ? 'border-danger hover:border-danger' : 'border-border-strong'
          } ${isPassword ? 'pr-20' : ''}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute inset-y-0 right-1 my-1 rounded-xs px-3 text-[14px] font-medium text-brand transition-colors duration-200 hover:bg-brand-50"
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
        <p
          id={`${id}-err`}
          className="flex items-start gap-2 rounded-xs bg-danger-bg px-3 py-2 text-[14px] leading-5 text-danger"
        >
          <IconAlert size={16} className="mt-0.5" />
          <span>{error}</span>
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
const TONE_BORDERS: Record<Tone, string> = {
  danger: 'border-danger/20',
  success: 'border-success/20',
  info: 'border-info/20',
  warning: 'border-warning/20',
};
const TONE_ICONS: Record<Tone, typeof IconInfo> = {
  danger: IconXCircle,
  success: IconCheckCircle,
  info: IconInfo,
  warning: IconAlert,
};

/** Inline alert (E5): semantic surface + icon + text. Errors use role=alert; others are polite status. */
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
  const Icon = TONE_ICONS[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-sm border px-4 py-3 text-[14px] leading-5 ${TONES[tone]} ${TONE_BORDERS[tone]}`}
    >
      <Icon size={18} className="mt-px" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-ink/80' : ''}>{children}</div>}
        {detail && (
          <details className="mt-2 text-[12px] leading-4 opacity-80">
            <summary className="cursor-pointer select-none">Details</summary>
            <code className="mt-1 block break-all">{detail}</code>
          </details>
        )}
      </div>
    </div>
  );
}

const DOTS: Record<Tone | 'neutral' | 'brand', string> = {
  neutral: 'bg-muted',
  brand: 'bg-brand',
  danger: 'bg-danger',
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
};

/** Status badge (E5): pill, 12/16 medium, semantic pair plus a dot so state is not colour-only text. */
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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-4 ${cls}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${DOTS[tone]}`} />
      {children}
    </span>
  );
}

/** Empty state (E5): icon in a 64 px subtle circle, one-line explanation, optional primary action. */
export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Optional icon from ./icons; defaults to an inbox. */
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div
        aria-hidden
        className="mb-1 grid size-16 place-items-center rounded-full border border-border-subtle bg-subtle text-brand"
      >
        {icon ?? <IconInbox size={26} />}
      </div>
      <p className="text-[18px] font-medium leading-6 tracking-[-0.01em]">{title}</p>
      {children && <div className="max-w-md text-[15px] leading-6 text-secondary">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
