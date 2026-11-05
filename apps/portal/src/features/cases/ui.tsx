import {
  useId,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { toUserError } from '../../lib/errors';
import { Alert, Badge, Button, Spinner } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { priorityTone, slaLabel, slaTone, statusLabel, statusTone } from './format';

export const controlClass =
  'h-11 w-full rounded-sm border border-border-strong bg-white px-3 text-[16px] outline-none hover:border-ink focus-visible:border-brand md:text-[14px]';

export function Select({
  label,
  children,
  hideLabel = false,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hideLabel?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-[14px] font-medium leading-5'}>
        {label}
      </label>
      <select id={id} className={controlClass} {...rest}>
        {children}
      </select>
    </div>
  );
}

export function TextArea({
  label,
  helper,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; helper?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        aria-describedby={helper ? `${id}-help` : undefined}
        className="w-full rounded-sm border border-border-strong bg-white px-4 py-3 text-[16px] outline-none hover:border-ink focus-visible:border-brand"
        {...rest}
      />
      {helper && (
        <p id={`${id}-help`} className="text-[14px] leading-5 text-secondary">
          {helper}
        </p>
      )}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-white p-4 md:p-6">
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-[18px] font-medium leading-6">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
);
export const PriorityBadge = ({ priority }: { priority: string }) => (
  <Badge tone={priorityTone(priority)}>{priority}</Badge>
);
export const SlaBadge = ({ state }: { state: string }) => (
  <Badge tone={slaTone(state)}>{slaLabel(state)}</Badge>
);

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-6 text-secondary" role="status">
      <Spinner />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorAlert({ error, retry }: { error: unknown; retry?: () => void }) {
  const e = toUserError(error);
  return (
    <Alert tone="danger" title="This didn't load" detail={e.detail}>
      {e.message}
      {retry && (
        <button type="button" className="ml-2 font-medium underline" onClick={retry}>
          Try again
        </button>
      )}
    </Alert>
  );
}

/**
 * A dialog that asks for text (reason, note, resolution) before running an action. Validation and
 * server errors are shown inside the dialog; success closes it.
 */
export function TextActionDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  minLength = 3,
  confirmLabel,
  danger = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  minLength?: number;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (text: string) => Promise<unknown>;
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string | undefined } | null>(null);
  const tooShort = text.trim().length < minLength;
  const submit = async () => {
    if (tooShort) {
      setError({ message: `Enter at least ${minLength} characters.` });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      setText('');
      onOpenChange(false);
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        <TextArea label={label} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
        <div aria-live="polite">
          {error && (
            <Alert tone="danger" detail={error.detail}>
              {error.message}
            </Alert>
          )}
        </div>
      </div>
    </Dialog>
  );
}
