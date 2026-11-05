// Rule builder UI (M04) over the model in ./rules.
import { useId } from 'react';
import type { Definition, Json, Rule, Snapshot } from '@serene/survey-engine';
import { Alert, Button } from '../../../ui/controls';
import {
  OPS_FOR_KIND,
  OP_LABELS,
  conditionProblem,
  defaultConditionFor,
  describeRule,
  fieldsBefore,
  newCondition,
  parseRule,
  serialiseRule,
  type Condition,
  type ConditionOp,
  type RuleField,
  type RuleModel,
} from './rules';

const selectCls =
  'h-11 w-full rounded-sm border border-border-strong bg-white px-3 text-[14px] outline-none hover:border-ink focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand disabled:bg-surface-muted';

function ValueInput({
  field,
  condition,
  onChange,
  disabled,
}: {
  field: RuleField;
  condition: Condition;
  onChange: (v: Json) => void;
  disabled: boolean;
}) {
  if (condition.op === 'is_true' || condition.op === 'is_false') return null;
  if (field.kind === 'number') {
    const [lo, hi] = field.range ?? [0, 10];
    return (
      <select
        aria-label="Value"
        className={selectCls}
        disabled={disabled}
        value={typeof condition.value === 'number' ? condition.value : lo}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    );
  }
  const options = field.options ?? [];
  if (condition.op === 'in') {
    const chosen = Array.isArray(condition.value) ? condition.value : [];
    return (
      <fieldset className="flex flex-col gap-1 rounded-sm border border-border p-2">
        <legend className="px-1 text-[12px] text-secondary">Values</legend>
        {options.length === 0 && <span className="text-[14px] text-muted">No options available.</span>}
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-brand)]"
              disabled={disabled}
              checked={chosen.includes(o.value)}
              onChange={(e) =>
                onChange(e.target.checked ? [...chosen, o.value] : chosen.filter((x) => x !== o.value))
              }
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <select
      aria-label="Value"
      className={selectCls}
      disabled={disabled}
      value={typeof condition.value === 'string' ? condition.value : ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function RuleBuilder({
  def,
  questionId,
  snapshot,
  rule,
  onChange,
  title,
  emptyText,
  disabled = false,
}: {
  def: Definition;
  questionId: string;
  snapshot: Snapshot | null;
  rule: Rule | undefined;
  onChange: (rule: Rule | undefined) => void;
  title: string;
  emptyText: string;
  disabled?: boolean;
}) {
  const id = useId();
  const fields = fieldsBefore(def, questionId, snapshot);
  const model = parseRule(rule);
  const write = (m: RuleModel) => onChange(serialiseRule(m));

  if (model === null) {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[14px] font-medium">{title}</legend>
        <Alert tone="warning" title="This rule can’t be shown in the builder">
          It was written by hand. It still works as written.
        </Alert>
        <pre className="overflow-x-auto rounded-sm bg-surface-muted p-3 text-[12px] leading-4">
          {JSON.stringify(rule, null, 2)}
        </pre>
        {!disabled && (
          <Button variant="secondary" className="h-11 self-start" onClick={() => onChange(undefined)}>
            Replace with a new rule
          </Button>
        )}
      </fieldset>
    );
  }

  const update = (i: number, c: Condition) =>
    write({ ...model, conditions: model.conditions.map((x, j) => (j === i ? c : x)) });

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-[14px] font-medium">{title}</legend>
      <p className="text-[14px] leading-5 text-secondary" aria-live="polite">
        {model.conditions.length === 0 ? emptyText : describeRule(model, fields)}
      </p>
      {model.conditions.length > 1 && (
        <label className="flex flex-col gap-1 text-[14px]">
          <span id={`${id}-comb`}>Combine conditions</span>
          <select
            className={selectCls}
            disabled={disabled}
            value={model.combinator}
            onChange={(e) => write({ ...model, combinator: e.target.value as 'all' | 'any' })}
          >
            <option value="all">All of these are true</option>
            <option value="any">Any of these is true</option>
          </select>
        </label>
      )}
      {model.conditions.map((c, i) => {
        const field = fields.find((f) => f.path === c.field);
        const problem = conditionProblem(c, fields);
        const labelId = `${id}-c${i}`;
        return (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
            role="group"
            aria-labelledby={labelId}
          >
            <p id={labelId} className="text-[12px] font-medium uppercase leading-4 tracking-[1px] text-muted">
              Condition {i + 1}
            </p>
            <label className="flex flex-col gap-1 text-[14px]">
              <span>Question</span>
              <select
                className={selectCls}
                disabled={disabled}
                value={field ? c.field : ''}
                onChange={(e) => {
                  const f = fields.find((x) => x.path === e.target.value);
                  if (f) update(i, defaultConditionFor(f));
                }}
              >
                {!field && <option value="">{c.field} (not an earlier question)</option>}
                {fields.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {field && (
              <label className="flex flex-col gap-1 text-[14px]">
                <span>Comparison</span>
                <select
                  className={selectCls}
                  disabled={disabled}
                  value={c.op}
                  onChange={(e) => {
                    const op = e.target.value as ConditionOp;
                    const value =
                      op === 'in'
                        ? typeof c.value === 'string' && c.value
                          ? [c.value]
                          : []
                        : Array.isArray(c.value)
                          ? (c.value[0] ?? '')
                          : (c.value ?? null);
                    update(
                      i,
                      op === 'is_true' || op === 'is_false'
                        ? { field: c.field, op }
                        : { field: c.field, op, value },
                    );
                  }}
                >
                  {OPS_FOR_KIND[field.kind].map((op) => (
                    <option key={op} value={op}>
                      {OP_LABELS[op]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {field && (
              <ValueInput
                field={field}
                condition={c}
                disabled={disabled}
                onChange={(value) => update(i, { ...c, value })}
              />
            )}
            {problem && <p className="text-[14px] text-danger">{problem}</p>}
            {!disabled && (
              <Button
                variant="ghost"
                className="h-11 self-start px-3 text-[14px]"
                onClick={() => write({ ...model, conditions: model.conditions.filter((_, j) => j !== i) })}
              >
                Remove condition {i + 1}
              </Button>
            )}
          </div>
        );
      })}
      {!disabled && (
        <Button
          variant="secondary"
          className="h-11 self-start text-[14px]"
          disabled={fields.length === 0}
          onClick={() => {
            const c = newCondition(fields);
            if (c) write({ ...model, conditions: [...model.conditions, c] });
          }}
        >
          Add condition
        </Button>
      )}
      {fields.length === 0 && (
        <p className="text-[14px] text-muted">
          Rules can only refer to earlier questions, and this is the first one.
        </p>
      )}
    </fieldset>
  );
}
