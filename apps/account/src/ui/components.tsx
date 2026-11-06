import type { ProposalStatus } from '@serene/proposals';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, Spinner, type IconName } from './icons';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---- Banner --------------------------------------------------------------------------------------

type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';
const TONE_ICON: Record<Tone, IconName> = {
  neutral: 'info',
  info: 'info',
  warning: 'alert',
  danger: 'alert',
  success: 'check',
};

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  icon,
  role,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  role?: 'status' | 'alert';
  className?: string;
}) {
  return (
    <div className={cx('banner', `banner-${tone}`, className)} role={role}>
      <Icon name={icon ?? TONE_ICON[tone]} size={20} className="mt-0.5 flex-none" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

// ---- Status chip ---------------------------------------------------------------------------------

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'With underwriter',
  info_requested: 'Action needed',
  quoted: 'Ready to pay',
  declined: 'Declined',
  paid: 'Paid',
  issued: 'Policy issued',
  cancelled: 'Cancelled',
  expired: 'Quote expired',
};
const STATUS_TONE: Record<ProposalStatus, string> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  info_requested: 'warning',
  quoted: 'brand',
  declined: 'danger',
  paid: 'success',
  issued: 'success',
  cancelled: 'neutral',
  expired: 'neutral',
};

export function StatusChip({ status }: { status: ProposalStatus }) {
  return <span className={`chip chip-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

// ---- Skeleton ------------------------------------------------------------------------------------

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function PageSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="wrap py-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-8 w-64 max-w-full" />
      <div className="mt-8 grid gap-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="card card-pad">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-6 w-3/4" />
            <Skeleton className="mt-5 h-11 w-40 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Buttons -------------------------------------------------------------------------------------------

export function Button({
  variant = 'primary',
  size,
  block,
  busy,
  busyLabel,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger-ghost' | undefined;
  size?: 'lg' | 'sm' | undefined;
  block?: boolean | undefined;
  busy?: boolean | undefined;
  busyLabel?: string | undefined;
}) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <Spinner />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

// ---- Sheet (native dialog: focus trap, Esc, backdrop) ---------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 md:px-6 md:pt-5">
          <h2 className="h-section">{title}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon -mr-2 text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">{children}</div>
        {footer && (
          <div className="border-t border-border-subtle px-5 pt-3 pb-[calc(12px+var(--safe-b))] md:px-6">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}

// ---- Misc -----------------------------------------------------------------------------------------------

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 tab:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[13px] font-medium text-secondary">{it.label}</dt>
          <dd className="mt-0.5 m-0 break-words font-semibold">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Polite live region for async results ("Saved", "Price updated"). */
export function LiveText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span role="status" aria-live="polite" className={className}>
      {children}
    </span>
  );
}

export function BackLink({ onClick, children = 'Back' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="btn btn-ghost -ml-3 text-secondary" onClick={onClick}>
      <Icon name="arrowLeft" size={18} />
      {children}
    </button>
  );
}
