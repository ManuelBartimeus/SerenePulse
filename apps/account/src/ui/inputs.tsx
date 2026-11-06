// Labelled inputs used outside the wizard (sign-in extras, profile, payment, claims).
import { useId, type ReactNode } from 'react';
import { Icon } from './icons';
import { cx } from './components';

export function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  optional,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode | undefined;
  error?: string | undefined;
  children: ReactNode;
  optional?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="font-normal text-secondary"> (optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="hint mt-1">
          {hint}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {error && <ErrorText id={`${id}-err`}>{error}</ErrorText>}
    </div>
  );
}

export function ErrorText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="error-text mt-2">
      <Icon name="alert" size={18} className="mt-px flex-none" />
      <span>{children}</span>
    </p>
  );
}

export const describedBy = (id: string, hint: unknown, error: unknown): string | undefined =>
  [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;

type NativeInput = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'id'>;

export function TextInput({
  id: givenId,
  label,
  hint,
  error,
  value,
  onChange,
  optional,
  prefix,
  className,
  ...rest
}: NativeInput & {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  prefix?: string;
}) {
  const auto = useId();
  const id = givenId ?? auto;
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional ?? false}
      {...(className ? { className } : {})}
    >
      <div className="input-affix">
        {prefix && <span className="affix affix-start">{prefix}</span>}
        <input
          id={id}
          className="input"
          style={prefix ? { paddingLeft: `${prefix.length * 10 + 26}px` } : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export function TextArea({
  id: givenId,
  label,
  hint,
  error,
  value,
  onChange,
  optional,
  maxLength,
  rows = 4,
  disabled,
}: {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
}) {
  const auto = useId();
  const id = givenId ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional ?? false}>
      <textarea
        id={id}
        className="input"
        rows={rows}
        disabled={disabled}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
      {maxLength && value.length > maxLength * 0.7 && (
        <p className="hint tnum mt-1 text-right">
          {value.length} / {maxLength}
        </p>
      )}
    </FieldShell>
  );
}

export function CheckboxRow({
  id: givenId,
  checked,
  onChange,
  children,
  error,
  disabled,
}: {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const auto = useId();
  const id = givenId ?? auto;
  return (
    <div>
      <div className={cx('flex items-start gap-3 rounded-xl py-1', disabled && 'opacity-60')}>
        <input
          id={id}
          type="checkbox"
          className="check mt-0.5"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-[15px] leading-[22px]">
          {children}
        </label>
      </div>
      {error && <ErrorText id={`${id}-err`}>{error}</ErrorText>}
    </div>
  );
}
