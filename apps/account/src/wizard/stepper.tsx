// Progress through a multi-step flow, in the numbered-steps pattern of nic.gov.gh's complaints page:
// a tint circle with the number, the title, dividers. Desktop (≥1024px): a vertical list in the
// sidebar. Phones and tablets: "Step 3 of 9 · Title", a progress bar and a sheet with every step.
import { useState } from 'react';
import { Sheet, cx } from '../ui/components';
import { Icon } from '../ui/icons';

export interface StepState {
  step: { index: number; id: string; title: string; kind: string };
  done: boolean;
  reachable: boolean;
}

interface StepperProps {
  steps: StepState[];
  current: number;
  onGo: (index: number) => void;
  label?: string;
}

function StepCircle({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <span
      className={cx(
        'tnum grid h-7 w-7 flex-none place-items-center rounded-full text-[13px] font-semibold transition-colors',
        active
          ? 'bg-brand text-white'
          : done
            ? 'bg-brand-50 text-brand'
            : 'bg-accent-surface text-secondary ring-1 ring-border',
      )}
      aria-hidden="true"
    >
      {done && !active ? <Icon name="check" size={15} /> : n}
    </span>
  );
}

/** Vertical numbered list (desktop sidebar). */
export function StepList({ steps, current, onGo, label = 'Proposal progress' }: StepperProps) {
  const pos = Math.max(
    0,
    steps.findIndex((s) => s.step.index === current),
  );
  return (
    <nav aria-label={label} data-stepper="list">
      <p className="kicker">
        Step <span className="tnum">{pos + 1}</span> of <span className="tnum">{steps.length}</span>
      </p>
      <ol className="m-0 mt-3 list-none border-t border-border p-0">
        {steps.map((s, i) => {
          const active = s.step.index === current;
          const clickable = s.reachable && !active && s.step.kind !== 'pay';
          const body = (
            <>
              <StepCircle n={i + 1} active={active} done={s.done} />
              <span
                className={cx(
                  'min-w-0 flex-1 text-[15px] leading-[22px] break-words',
                  active ? 'font-semibold text-brand' : s.done ? 'font-medium text-ink' : 'text-secondary',
                )}
              >
                {s.step.title}
              </span>
            </>
          );
          return (
            <li
              key={s.step.id}
              className={cx('relative border-b border-border', active && 'bg-accent-surface')}
            >
              {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" aria-hidden="true" />}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onGo(s.step.index)}
                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 py-2 text-left hover:bg-accent-surface"
                  aria-label={`Step ${i + 1}: ${s.step.title}${s.done ? ', completed' : ''}. Go to this step`}
                >
                  {body}
                </button>
              ) : (
                <span
                  className="flex min-h-12 items-center gap-3 px-3 py-2"
                  aria-current={active ? 'step' : undefined}
                >
                  {body}
                  <span className="sr-only">{active ? ' (current step)' : s.done ? ' (completed)' : ''}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Compact bar with a progress meter; "All steps" opens a scrollable sheet (phones, tablets). */
export function StepBar({ steps, current, onGo, label = 'Proposal progress' }: StepperProps) {
  const pos = Math.max(
    0,
    steps.findIndex((s) => s.step.index === current),
  );
  const cur = steps[pos];
  const [open, setOpen] = useState(false);
  const pct = ((pos + 1) / steps.length) * 100;
  return (
    <div data-stepper="bar">
      <button
        type="button"
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-0 text-left"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="min-w-0 text-[15px] leading-[22px]">
          <span className="tnum font-medium text-secondary">
            Step {pos + 1} of {steps.length}
          </span>
          <span className="text-secondary"> · </span>
          <span className="font-semibold break-words text-ink">{cur?.step.title}</span>
        </span>
        <span className="inline-flex flex-none items-center gap-1 text-[14px] font-medium text-brand">
          All steps
          <Icon name="chevronDown" size={16} />
        </span>
      </button>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted"
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

      <Sheet open={open} onClose={() => setOpen(false)} title="Steps">
        <ol className="m-0 list-none border-t border-border p-0" aria-label={label}>
          {steps.map((s, i) => {
            const active = s.step.index === current;
            const clickable = s.reachable && s.step.kind !== 'pay';
            return (
              <li key={s.step.id} className="border-b border-border">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onGo(s.step.index);
                  }}
                  className={cx(
                    'flex min-h-12 w-full items-center gap-3 border-0 px-2 py-2 text-left',
                    active ? 'bg-accent-surface' : 'bg-transparent',
                    clickable ? 'cursor-pointer hover:bg-accent-surface' : 'cursor-default',
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  <StepCircle n={i + 1} active={active} done={s.done} />
                  <span
                    className={cx(
                      'min-w-0 flex-1 text-[16px] leading-6 break-words',
                      active
                        ? 'font-semibold text-brand'
                        : s.done
                          ? 'font-medium text-ink'
                          : 'text-secondary',
                    )}
                  >
                    {s.step.title}
                  </span>
                  {s.done && !active && <span className="text-[13px] font-medium text-success">Done</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </Sheet>
    </div>
  );
}
