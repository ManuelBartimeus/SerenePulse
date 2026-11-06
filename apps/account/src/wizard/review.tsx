import type { Answers, FormDefinition, TableField } from '@serene/proposals';
import { displayAnswer, isStepVisible, reviewRows, wizardSteps } from '../lib/wizard';
import { Icon } from '../ui/icons';
import type { UploadedFile } from './context';

export function ReviewStep({
  form,
  answers,
  files,
  onEdit,
}: {
  form: FormDefinition;
  answers: Answers;
  files: ReadonlyMap<string, UploadedFile>;
  onEdit: (index: number) => void;
}) {
  const fileName = (id: string) => files.get(id)?.name ?? 'Attached file';
  const steps = wizardSteps(form).filter((s) => s.kind === 'form' && isStepVisible(s, answers));
  return (
    <div className="grid gap-4">
      {steps.map((s) => {
        if (s.kind !== 'form') return null;
        const rows = reviewRows(s.step, answers);
        return (
          <section key={s.id} className="card overflow-hidden" aria-labelledby={`rev-${s.id}`}>
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
              <h3 id={`rev-${s.id}`} className="text-[17px] font-bold">
                {s.title}
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm -mr-2"
                onClick={() => onEdit(s.index)}
                aria-label={`Edit ${s.title}`}
              >
                <Icon name="edit" size={18} />
                Edit
              </button>
            </div>
            <dl className="m-0 divide">
              {rows.map(({ field }) => {
                if (field.type === 'table')
                  return <TableReview key={field.id} field={field} answers={answers} />;
                const value = displayAnswer(field, answers, fileName);
                return (
                  <div
                    key={field.id}
                    className="grid gap-1 px-5 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6"
                  >
                    <dt className="text-[14px] leading-5 text-secondary">{field.label}</dt>
                    <dd className="m-0 min-w-0 text-[15px] leading-[22px] font-semibold break-words whitespace-pre-line">
                      {field.type === 'file' && value ? (
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          {value.split(', ').map((n, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5">
                              <Icon
                                name={/\.pdf$/i.test(n) ? 'pdf' : 'file'}
                                size={16}
                                className="text-secondary"
                              />
                              {n}
                            </span>
                          ))}
                        </span>
                      ) : (
                        value || <span className="font-normal text-muted">Not answered</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

function TableReview({ field, answers }: { field: TableField; answers: Answers }) {
  const rows = Array.isArray(answers[field.id]) ? (answers[field.id] as Record<string, unknown>[]) : [];
  const cell = (colId: string, v: unknown) => {
    const col = field.columns.find((c) => c.id === colId);
    if (v === undefined || v === null || v === '') return '';
    if (col?.type === 'select') return col.options?.find((o) => o.value === v)?.label ?? String(v);
    if (col?.type === 'money')
      return `GH₵ ${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
    return `${String(v)}${col?.unit ? ` ${col.unit}` : ''}`;
  };
  return (
    <div className="px-5 py-3">
      <dt className="text-[14px] text-secondary">{field.label}</dt>
      <dd className="m-0 mt-2 grid gap-2">
        {rows.length === 0 && <span className="text-[15px] text-muted">None</span>}
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl bg-subtle px-3.5 py-2.5">
            {rows.length > 1 && <p className="mb-1 text-[13px] font-bold text-secondary">{i + 1}</p>}
            <dl className="m-0 grid gap-x-6 gap-y-1 tab:grid-cols-2">
              {field.columns.map((c) =>
                cell(c.id, r[c.id]) ? (
                  <div key={c.id} className="flex min-w-0 justify-between gap-3 text-[14px] tab:block">
                    <dt className="text-secondary">{c.label}</dt>
                    <dd className="m-0 text-right font-semibold break-words tab:text-left">
                      {cell(c.id, r[c.id])}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>
        ))}
      </dd>
    </div>
  );
}
