// Searchable select for long option lists on desktop (vehicle makes, insurers, countries).
import type { Option } from '@serene/proposals';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export function Combobox({
  id,
  options,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder = 'Type to search',
}: {
  id: string;
  options: readonly Option[];
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  describedBy?: string | undefined;
  placeholder?: string;
}) {
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) setQuery(selected?.label ?? '');
  }, [selected?.label, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q === selected?.label.toLowerCase()) return options;
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(q));
    const contains = options.filter(
      (o) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q),
    );
    return [...starts, ...contains];
  }, [options, query, selected?.label]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(o: Option) {
    onChange(o.value);
    setQuery(o.label);
    setOpen(false);
  }

  return (
    <div
      ref={wrap}
      className="relative"
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          // Typed an exact label: accept it.
          const exact = options.find((o) => o.label.toLowerCase() === query.trim().toLowerCase());
          if (exact && exact.value !== value) onChange(exact.value);
        }
      }}
    >
      <input
        id={id}
        className="input pr-11"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
          setActive(
            Math.max(
              0,
              filtered.findIndex((o) => o.value === value),
            ),
          );
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open) {
            const o = filtered[active];
            if (o) {
              e.preventDefault();
              choose(o);
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
            setQuery(selected?.label ?? '');
          }
        }}
      />
      <svg
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-secondary"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      {open && (
        <ul ref={list} id={listId} role="listbox" className="listbox" tabIndex={-1}>
          {filtered.length === 0 ? (
            <li className="!cursor-default text-secondary" aria-disabled="true">
              No match. Try another spelling.
            </li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                {o.label}
                {o.hint && <span className="block text-[13px] text-secondary">{o.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
