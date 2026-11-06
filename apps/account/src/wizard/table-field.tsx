// Repeating lists (vehicles, travellers, claims history …). Phones: one card per row.
// Desktop: a grid. maxRows 1: plain grouped fields (no add/remove).
import type { Scalar, TableColumn, TableField, TableRow } from '@serene/proposals';
import { useEffect, useRef, useState } from 'react';
import { amountToInput, currencySymbol, formatAmountInput, parseAmount } from '../lib/format';
import { cx } from '../ui/components';
import { Icon } from '../ui/icons';
import { Combobox } from './combobox';
import { useDesktop, useMedia, useWizard } from './context';

const cellId = (field: string, row: number, col: string) => `f-${field}-${row}-${col}`;

export function TableFieldInput({ field }: { field: TableField }) {
  const { answers, set, errors } = useWizard();
  const wide = useMedia('(min-width: 1200px)');
  const v = answers[field.id];
  const rows: readonly TableRow[] = Array.isArray(v) ? (v as TableRow[]) : [];
  const single = field.maxRows === 1;
  const lastAdded = useRef<number | null>(null);

  // A single-row table always has its row.
  useEffect(() => {
    if (single && rows.length === 0) set(field.id, [{}]);
  }, [single, rows.length]);

  useEffect(() => {
    if (lastAdded.current !== null) {
      const first = field.columns[0];
      if (first) document.getElementById(cellId(field.id, lastAdded.current, first.id))?.focus();
      lastAdded.current = null;
    }
  });

  const update = (i: number, col: string, value: Scalar | undefined) => {
    const next = rows.map((r, j) => {
      if (j !== i) return r;
      const rest = Object.fromEntries(Object.entries(r).filter(([k]) => k !== col)) as TableRow;
      return value === undefined || value === '' ? rest : { ...rest, [col]: value };
    });
    set(field.id, next);
  };
  const add = () => {
    lastAdded.current = rows.length;
    set(field.id, [...rows, {}]);
  };
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    set(field.id, next.length ? next : undefined);
  };
  const cellErr = (i: number, col: string) =>
    errors.find((e) => e.field === field.id && e.row === i && e.column === col)?.message;
  const canAdd = !field.maxRows || rows.length < field.maxRows;
  const singular = field.addLabel.replace(/^Add (another |a |an )?/i, '');

  if (single) {
    const row = rows[0] ?? {};
    return (
      <div className="grid gap-x-4 gap-y-5 md:grid-cols-2" id={`f-${field.id}`} tabIndex={-1}>
        {field.columns.map((c) => (
          <Cell
            key={c.id}
            field={field.id}
            col={c}
            row={0}
            value={row[c.id]}
            error={cellErr(0, c.id)}
            onChange={(x) => update(0, c.id, x)}
            labelled
          />
        ))}
      </div>
    );
  }

  const gridCols = field.columns
    .map((c) => `minmax(${c.type === 'select' ? 160 : 120}px, ${c.weight ?? 1}fr)`)
    .join(' ');

  return (
    <div id={`f-${field.id}`} tabIndex={-1}>
      {rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border-strong px-4 py-5 text-center text-[15px] text-secondary">
          Nothing added yet.
        </p>
      )}
      {wide && rows.length > 0 && field.columns.length <= 6 ? (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle">
          <div role="table" className="min-w-full">
            <div
              role="row"
              className="grid gap-3 bg-subtle px-4 py-2.5 text-[13px] font-semibold text-secondary"
              style={{ gridTemplateColumns: `${gridCols} 44px` }}
            >
              {field.columns.map((c) => (
                <span role="columnheader" key={c.id}>
                  {c.label}
                  {!c.required && <span className="font-normal"> (optional)</span>}
                </span>
              ))}
              <span className="sr-only">Remove</span>
            </div>
            {rows.map((row, i) => (
              <div
                role="row"
                key={i}
                className="grid items-start gap-3 border-t border-border-subtle px-4 py-3"
                style={{ gridTemplateColumns: `${gridCols} 44px` }}
              >
                {field.columns.map((c) => (
                  <div role="cell" key={c.id} className="min-w-0">
                    <Cell
                      field={field.id}
                      col={c}
                      row={i}
                      value={row[c.id]}
                      error={cellErr(i, c.id)}
                      onChange={(x) => update(i, c.id, x)}
                      ariaLabel={`${c.label}, row ${i + 1}`}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-icon mt-1"
                  onClick={() => remove(i)}
                  aria-label={`Remove row ${i + 1}`}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ol className="m-0 grid list-none gap-3 p-0">
          {rows.map((row, i) => (
            <li key={i} className="rounded-2xl border border-border bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[15px] font-bold capitalize">
                  {singular} {i + 1}
                </p>
                <button type="button" className="btn btn-danger-ghost btn-sm -mr-2" onClick={() => remove(i)}>
                  <Icon name="trash" size={18} />
                  Remove
                </button>
              </div>
              <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
                {field.columns.map((c) => (
                  <Cell
                    key={c.id}
                    field={field.id}
                    col={c}
                    row={i}
                    value={row[c.id]}
                    error={cellErr(i, c.id)}
                    onChange={(x) => update(i, c.id, x)}
                    labelled
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
      {canAdd && (
        <button type="button" className="btn btn-soft mt-3 w-full tab:w-auto" onClick={add}>
          <Icon name="plus" size={18} />
          {field.addLabel}
        </button>
      )}
      {field.maxRows && <p className="hint mt-2">Up to {field.maxRows}.</p>}
    </div>
  );
}

function Cell({
  field,
  col,
  row,
  value,
  error,
  onChange,
  labelled,
  ariaLabel,
}: {
  field: string;
  col: TableColumn;
  row: number;
  value: Scalar | undefined;
  error: string | undefined;
  onChange: (v: Scalar | undefined) => void;
  labelled?: boolean;
  ariaLabel?: string;
}) {
  const desktop = useDesktop();
  const id = cellId(field, row, col.id);
  const errId = `${id}-err`;
  const common = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errId : undefined,
    ...(labelled ? {} : { 'aria-label': ariaLabel ?? col.label }),
  };
  let control: React.ReactNode;
  if (col.type === 'select') {
    const options = col.options ?? [];
    control =
      desktop && options.length > 12 ? (
        <Combobox
          id={id}
          options={options}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          invalid={!!error}
          describedBy={error ? errId : undefined}
        />
      ) : (
        <select
          {...common}
          className={cx('input', !value && 'text-[#6b6b6b]')}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="text-ink">
              {o.label}
            </option>
          ))}
        </select>
      );
  } else if (col.type === 'date') {
    control = (
      <input
        {...common}
        type="date"
        className="input tnum"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  } else if (col.type === 'text') {
    const upper = /reg|chassis|vin|plate/i.test(col.id);
    control = (
      <input
        {...common}
        type="text"
        className={cx('input', upper && 'uppercase')}
        autoCapitalize={upper ? 'characters' : 'sentences'}
        autoComplete="off"
        value={typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
      />
    );
  } else {
    control = <NumberCell common={common} col={col} value={value} onChange={onChange} />;
  }
  return (
    <div className="min-w-0">
      {labelled && (
        <label htmlFor={id} className="label text-[14px]">
          {col.label}
          {!col.required && <span className="font-normal text-secondary"> (optional)</span>}
        </label>
      )}
      <div className={labelled ? 'mt-1.5' : ''}>{control}</div>
      {error && (
        <p id={errId} className="error-text mt-1.5">
          <Icon name="alert" size={16} className="mt-0.5 flex-none" />
          {error}
        </p>
      )}
    </div>
  );
}

function NumberCell({
  common,
  col,
  value,
  onChange,
}: {
  common: Record<string, unknown>;
  col: TableColumn;
  value: Scalar | undefined;
  onChange: (v: Scalar | undefined) => void;
}) {
  const decimals = col.type === 'money' ? 2 : 0;
  const [text, setText] = useState(() =>
    col.type === 'year' ? (value ? String(value) : '') : amountToInput(value, decimals),
  );
  const prefix = col.type === 'money' ? currencySymbol('GHS') : null;
  // Re-sync when the row's value changes from outside (row removed above this one, prefill).
  useEffect(() => {
    const cur = col.type === 'year' ? (text ? Number(text) : undefined) : (parseAmount(text) ?? undefined);
    if (cur !== (value ?? undefined))
      setText(col.type === 'year' ? (value ? String(value) : '') : amountToInput(value, decimals));
  }, [value]);
  return (
    <div className="input-affix">
      {prefix && <span className="affix affix-start text-[15px]">{prefix}</span>}
      <input
        {...common}
        type="text"
        className="input tnum"
        style={{
          ...(prefix ? { paddingLeft: 50 } : {}),
          ...(col.unit ? { paddingRight: col.unit.length * 9 + 26 } : {}),
        }}
        inputMode={decimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        placeholder={col.type === 'year' ? 'YYYY' : undefined}
        value={text}
        onChange={(e) => {
          if (col.type === 'year') {
            const t = e.target.value.replace(/\D/g, '').slice(0, 4);
            setText(t);
            onChange(t ? Number(t) : undefined);
            return;
          }
          const t = formatAmountInput(e.target.value, decimals);
          setText(t);
          const n = parseAmount(t);
          onChange(n ?? undefined);
        }}
      />
      {col.unit && <span className="affix affix-end text-[15px]">{col.unit}</span>}
    </div>
  );
}
