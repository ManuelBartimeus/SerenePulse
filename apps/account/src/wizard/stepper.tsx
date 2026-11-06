import { useState } from 'react';
import { Sheet, cx } from '../ui/components';
import { Icon } from '../ui/icons';

export interface StepState {
  step: { index: number; id: string; title: string; kind: string };
  done: boolean;
  reachable: boolean;
}

export function Stepper({
  steps,
  current,
  onGo,
  label = 'Proposal progress',
}: {
  steps: StepState[];
  current: number;
  onGo: (index: number) => void;
  label?: string;
}) {
  const pos = Math.max(
    0,
    steps.findIndex((s) => s.step.index === current),
  );
  const cur = steps[pos];
  const [open, setOpen] = useState(false);
  const pct = ((pos + 1) / steps.length) * 100;

  return (
    <>
      {/* Desktop: numbered steps with a connecting line */}
      <nav aria-label={label} className="hidden lg:block">
        <ol className="m-0 flex list-none items-start p-0">
          {steps.map((s, i) => {
            const active = s.step.index === current;
            const clickable = s.reachable && !active && s.step.kind !== 'pay';
            const circle = (
              <span
                className={cx(
                  'tnum relative z-10 grid h-9 w-9 place-items-center rounded-full text-[14px] font-bold ring-4 ring-[var(--app-bg)] transition-colors',
                  active
                    ? 'bg-brand text-white'
                    : s.done
                      ? 'bg-brand-50 text-brand'
                      : 'border-[1.5px] border-border-strong bg-white text-secondary',
                )}
              >
                {s.done && !active ? <Icon name="check" size={18} /> : i + 1}
              </span>
            );
            const label = (
              <span
                className={cx(
                  'mt-2 block px-1 text-center text-[13px] leading-[18px]',
                  active
                    ? 'font-bold text-ink'
                    : s.done
                      ? 'font-semibold text-ink'
                      : 'font-medium text-secondary',
                )}
              >
                {s.step.title}
              </span>
            );
            return (
              <li key={s.step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={cx(
                      'absolute top-[17px] right-1/2 h-[2px] w-full',
                      steps[i - 1]?.done || active || s.done ? 'bg-brand' : 'bg-border',
                    )}
                  />
                )}
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onGo(s.step.index)}
                    className="group flex cursor-pointer flex-col items-center rounded-xl border-0 bg-transparent p-0"
                    aria-label={`Step ${i + 1}: ${s.step.title}${s.done ? ', completed' : ''}. Go to this step`}
                  >
                    {circle}
                    <span className="group-hover:underline">{label}</span>
                  </button>
                ) : (
                  <span className="flex flex-col items-center" aria-current={active ? 'step' : undefined}>
                    {circle}
                    {label}
                    <span className="sr-only">
                      {active ? ' (current step)' : s.done ? ' (completed)' : ''}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Phones and tablets: compact summary + progress bar + sheet with every step */}
      <div className="lg:hidden">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border-0 bg-transparent p-0 text-left"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="min-w-0 text-[15px]">
            <span className="tnum font-semibold text-secondary">
              Step {pos + 1} of {steps.length}
            </span>
            <span className="text-secondary"> · </span>
            <span className="font-bold text-ink">{cur?.step.title}</span>
          </span>
          <span className="inline-flex min-h-11 flex-none items-center gap-1 text-[14px] font-semibold text-brand">
            All steps
            <Icon name="chevronDown" size={18} />
          </span>
        </button>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-border-subtle"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={pos + 1}
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Steps">
        <ol className="m-0 grid list-none gap-1 p-0">
          {steps.map((s, i) => {
            const active = s.step.index === current;
            const clickable = s.reachable && s.step.kind !== 'pay';
            return (
              <li key={s.step.id}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onGo(s.step.index);
                  }}
                  className={cx(
                    'flex min-h-[52px] w-full items-center gap-3 rounded-xl border-0 px-3 text-left',
                    active ? 'bg-brand-50' : 'bg-transparent',
                    clickable ? 'cursor-pointer hover:bg-subtle' : 'cursor-default',
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  <span
                    className={cx(
                      'tnum grid h-8 w-8 flex-none place-items-center rounded-full text-[13px] font-bold',
                      active
                        ? 'bg-brand text-white'
                        : s.done
                          ? 'bg-brand-50 text-brand'
                          : 'border-[1.5px] border-border-strong text-secondary',
                    )}
                  >
                    {s.done && !active ? <Icon name="check" size={16} /> : i + 1}
                  </span>
                  <span
                    className={cx(
                      'flex-1 text-[16px]',
                      active || s.done ? 'font-semibold text-ink' : 'text-secondary',
                    )}
                  >
                    {s.step.title}
                  </span>
                  {s.done && !active && <span className="text-[13px] text-success">Done</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </Sheet>
    </>
  );
}
