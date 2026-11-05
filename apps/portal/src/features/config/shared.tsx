// Building blocks shared by the configuration screens (E4 forms, E5 overlays, E6 lists).
import * as RadixSwitch from '@radix-ui/react-switch';
import * as RadixTabs from '@radix-ui/react-tabs';
import {
  useId,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { toUserError, type UserFacingError } from '../../lib/errors';
import type { Supabase } from '../../lib/supabase';
import { Alert, Badge, Button } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';

export const CONFLICT_MESSAGE =
  'Someone else changed this while you were editing. Reload to see their version, then make your change again.';

/** Errors from config writes, with the optimistic-lock and duplicate-code cases spelled out. */
export function configError(error: unknown): UserFacingError {
  const e = (error ?? {}) as { code?: string; message?: string; details?: string };
  if (e.code === 'P0409') return { message: e.message || CONFLICT_MESSAGE };
  if (e.code === '23505')
    return {
      message: /code/i.test(`${e.message} ${e.details}`)
        ? 'That code is already used. Codes are permanent and never reused, even for inactive entries.'
        : e.message || 'That entry already exists.',
      detail: e.details,
    };
  if (e.code === '23514')
    return { message: 'One of the values isn’t allowed. Check the fields and try again.', detail: e.message };
  return toUserError(error);
}

/**
 * Updates one row only if nobody changed it since it was loaded (optimistic locking on `version`).
 * The Data API returns no row when the version no longer matches; that is reported as a conflict.
 */
export async function updateVersioned(
  supabase: Supabase,
  table: string,
  id: string,
  version: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq('id', id)
    .eq('version', version)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw { code: 'P0409', message: CONFLICT_MESSAGE };
}

export function ErrorAlert({ error, title }: { error: unknown; title?: string }) {
  const e = configError(error);
  return (
    <Alert tone="danger" title={title} detail={e.detail}>
      {e.message}
    </Alert>
  );
}

/** Skeleton rows shaped like a list (state matrix: no blank spinners). */
export function ListSkeleton({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-sm bg-surface-muted motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg bg-white">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-start md:justify-between md:p-5">
        <div>
          <h2 id={id} className="text-[18px] font-medium leading-6">
            {title}
          </h2>
          {description && (
            <div className="mt-1 max-w-3xl text-[14px] leading-5 text-secondary">{description}</div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function ActiveBadge({
  active,
  inactiveLabel = 'Inactive',
}: {
  active: boolean;
  inactiveLabel?: string;
}) {
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Active' : inactiveLabel}</Badge>;
}

export function SystemBadge() {
  return <Badge tone="brand">System</Badge>;
}

export function CodeChip({ code }: { code: string }) {
  return (
    <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 text-[12px] font-medium leading-4 text-secondary">
      {code}
    </code>
  );
}

/** Switch with a visible label and optional helper (E4: ≥ 44 px hit area). */
export function Toggle({
  label,
  helper,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  helper?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-[14px] font-medium leading-5">
          {label}
        </label>
        {helper && (
          <p id={`${id}-help`} className="mt-0.5 text-[14px] leading-5 text-secondary">
            {helper}
          </p>
        )}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={helper ? `${id}-help` : undefined}
        className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-border-strong transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 data-[state=checked]:bg-brand"
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-1 rounded-full bg-white shadow transition-transform duration-200 data-[state=checked]:translate-x-6 motion-reduce:transition-none" />
      </RadixSwitch.Root>
    </div>
  );
}

export function SelectField({
  label,
  helper,
  error,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; helper?: ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [helper ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
        }
        className={`h-12 w-full rounded-sm border bg-white px-3 text-[16px] outline-none hover:border-ink focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand ${
          error ? 'border-danger' : 'border-border-strong'
        }`}
        {...rest}
      >
        {children}
      </select>
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

export function TextArea({
  label,
  helper,
  error,
  optional,
  counter,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  helper?: ReactNode;
  error?: string | null;
  optional?: boolean;
  counter?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [helper ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
        }
        className={`min-h-24 w-full rounded-sm border bg-white px-4 py-3 text-[16px] outline-none hover:border-ink focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand ${
          error ? 'border-danger' : 'border-border-strong'
        }`}
        {...rest}
      />
      {(helper || counter) && (
        <div className="flex justify-between gap-3 text-[14px] leading-5 text-secondary">
          <p id={`${id}-help`}>{helper}</p>
          {counter && <p aria-live="polite">{counter}</p>}
        </div>
      )}
      {error && (
        <p id={`${id}-err`} className="rounded-xs bg-danger-bg px-3 py-2 text-[14px] leading-5 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Keyboard-operable reorder controls (the drag alternative, WCAG 2.5.7). */
export function ReorderButtons({
  name,
  index,
  count,
  onMove,
  disabled,
}: {
  name: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
}) {
  const cls =
    'grid size-11 place-items-center rounded-sm text-[18px] text-secondary hover:bg-surface-muted disabled:opacity-30';
  return (
    <span className="flex">
      <button
        type="button"
        className={cls}
        disabled={disabled || index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label={`Move ${name} up`}
      >
        <span aria-hidden>↑</span>
      </button>
      <button
        type="button"
        className={cls}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label={`Move ${name} down`}
      >
        <span aria-hidden>↓</span>
      </button>
    </span>
  );
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** A confirmation dialog for deactivation and other consequential actions (E5). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  tone = 'danger',
  busy,
  error,
  onConfirm,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone} busy={busy ?? false} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <ErrorAlert error={error} /> : null}
        {children}
      </div>
    </Dialog>
  );
}

export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      window.setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('failed');
    }
  }
  return (
    <>
      <Button type="button" variant="secondary" onClick={copy}>
        {state === 'copied' ? copiedLabel : label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {state === 'copied'
          ? 'Copied to the clipboard'
          : state === 'failed'
            ? 'Copying failed; select the text and copy it'
            : ''}
      </span>
    </>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: string; label: string; content: ReactNode }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onChange}>
      <RadixTabs.List aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            className="h-11 shrink-0 border-b-2 border-transparent px-4 text-[16px] text-secondary outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand data-[state=active]:border-brand data-[state=active]:font-medium data-[state=active]:text-brand"
          >
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((t) => (
        <RadixTabs.Content key={t.value} value={t.value} className="outline-none">
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

export const dateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Accra',
});
export const dateOnly = new Intl.DateTimeFormat('en-GH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Africa/Accra',
});
/** DD/MM/YYYY for a 'YYYY-MM-DD' calendar date, without timezone shifts. */
export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
