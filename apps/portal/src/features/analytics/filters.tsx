import * as Popover from '@radix-ui/react-popover';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useId, useMemo, type ReactNode } from 'react';
import { WORDS } from '../../lib/terms';
import { IconChevronDown, IconFilter } from '../../ui/icons';
import { useCatalogues, type Option } from './catalogues';
import {
  accraToday,
  activeFilterCount,
  CASE_STATUSES,
  DEFAULT_FILTERS,
  FILTER_SEARCH_KEYS,
  GRANULARITIES,
  MORE_KEYS,
  parseFilterSearch,
  periodLabel,
  PRESETS,
  resolvePeriod,
  SATISFACTION,
  toFilterSearch,
  toRpcFilters,
  type FilterState,
  type ListKey,
  type Preset,
} from './filters-state';
import { Segmented } from './ui';

const STORAGE_KEY = 'serene.analytics.filters';

function readSaved(): Record<string, string> | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/**
 * The global analytics filters, kept in the URL search params (REQ §17.1.6). Arriving at an analytics
 * view without any filter in the URL restores the last filters used in this tab, so they carry across
 * views even through links that don't copy the search.
 */
export function useAnalyticsFilters() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const filters = useMemo(() => parseFilterSearch(search), [search]);
  const today = accraToday();
  const rpcFilters = useMemo(() => toRpcFilters(filters, today), [filters, today]);
  const period = useMemo(() => resolvePeriod(filters, today), [filters, today]);
  const searchParams = useMemo(() => toFilterSearch(filters), [filters]);
  const hasAny = FILTER_SEARCH_KEYS.some((k) => k in search);

  const write = (next: Record<string, string>) => {
    navigate({
      to: '.',
      replace: true,
      search: (prev: Record<string, unknown>) => {
        const kept = Object.fromEntries(
          Object.entries(prev).filter(([k]) => !FILTER_SEARCH_KEYS.includes(k)),
        );
        return { ...kept, ...next };
      },
    } as Parameters<typeof navigate>[0]);
  };

  useEffect(() => {
    if (hasAny) return;
    const saved = readSaved();
    if (saved && Object.keys(saved).length > 0) write(toFilterSearch(parseFilterSearch(saved)));
    // Only on arrival.
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(searchParams));
    } catch {
      // Storage may be unavailable (private mode); the URL still holds the filters.
    }
  }, [searchParams]);

  return {
    filters,
    rpcFilters,
    period,
    periodText: periodLabel(period),
    searchParams,
    setFilters: (next: FilterState | ((current: FilterState) => FilterState)) =>
      write(toFilterSearch(typeof next === 'function' ? next(filters) : next)),
  };
}

/** Day / Week / Month / Quarter, shown on trend charts. */
export function GranularityControl() {
  const { filters, setFilters } = useAnalyticsFilters();
  return (
    <Segmented
      label="Show by"
      options={GRANULARITIES}
      value={filters.granularity}
      onChange={(granularity) => setFilters((f) => ({ ...f, granularity }))}
    />
  );
}

type Choice = { id: string; label: string; inactive?: boolean | undefined };

const pill =
  'inline-flex h-10 items-center gap-1.5 rounded-full border bg-white px-4 text-[14px] outline-none transition-colors hover:border-ink focus-visible:border-brand';
const pillIdle = 'border-border-strong text-ink';
const pillActive = 'border-brand bg-brand-50 font-medium text-brand';

function CheckList({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: Choice[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const id = useId();
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <fieldset>
      <legend className="px-2 pb-1 text-[12px] font-medium tracking-[0.02em] text-muted">{legend}</legend>
      {options.length === 0 && <p className="px-2 py-2 text-[14px] text-secondary">Nothing to choose yet.</p>}
      {options.map((o) => (
        <label
          key={o.id}
          htmlFor={`${id}-${o.id}`}
          className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xs px-2 text-[14px] hover:bg-subtle"
        >
          <input
            id={`${id}-${o.id}`}
            type="checkbox"
            className="size-4 accent-[var(--color-brand)]"
            checked={selected.includes(o.id)}
            onChange={() => toggle(o.id)}
          />
          <span>
            {o.label}
            {o.inactive && <span className="text-muted"> (no longer used)</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** A compact dropdown: "All branches", "Accra Central", "3 branches". */
function MultiSelect({
  label,
  allLabel,
  plural,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  plural: string;
  options: Choice[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? `1 ${label.toLowerCase()}`)
        : `${selected.length} ${plural}`;
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`${label}: ${summary}`}
        className={`${pill} max-w-[240px] ${selected.length ? pillActive : pillIdle}`}
      >
        <span className="truncate">{summary}</span>
        <IconChevronDown size={16} aria-hidden className="shrink-0 opacity-70" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-[60vh] w-[280px] overflow-y-auto rounded-md border border-border bg-white p-2 shadow-float"
        >
          <CheckList legend={label} options={options} selected={selected} onChange={onChange} />
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 h-10 w-full rounded-xs text-[14px] font-medium text-brand hover:bg-brand-50"
            >
              Show {allLabel.toLowerCase()}
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const fromOptions = (xs: readonly { key: string; label: string }[]): Choice[] =>
  xs.map((x) => ({ id: x.key, label: x.label }));
const fromCatalogue = (xs: Option[] | undefined): Choice[] =>
  (xs ?? []).map((x) => ({ id: x.id, label: x.label, inactive: x.inactive }));

/**
 * The global filter bar: Period, Branch, Channel and Product in one row; Region, customer rating, area
 * to improve (and case status where it applies) under "More filters". `hide` removes filters that don't
 * apply to a view (e.g. the branch filter on a single branch's page).
 */
export function FilterBar({
  caseStatus = false,
  hide = [],
  periodOnly = false,
  children,
}: {
  caseStatus?: boolean;
  hide?: ListKey[];
  /** Only the period applies on this view. */
  periodOnly?: boolean;
  children?: ReactNode;
}) {
  const { filters, setFilters, periodText } = useAnalyticsFilters();
  const catalogues = useCatalogues();
  const set = (key: ListKey, values: string[]) =>
    setFilters((f) => ({ ...f, lists: { ...f.lists, [key]: values } }));
  const shown = (k: ListKey) => !periodOnly && !hide.includes(k);

  const main: { key: ListKey; label: string; all: string; plural: string; options: Choice[] }[] = [
    {
      key: 'branch',
      label: 'Branch',
      all: 'All branches',
      plural: 'branches',
      options: fromCatalogue(catalogues.data?.branches),
    },
    {
      key: 'channel',
      label: 'Channel',
      all: 'All channels',
      plural: 'channels',
      options: fromCatalogue(catalogues.data?.channels),
    },
    {
      key: 'product',
      label: 'Product',
      all: 'All products',
      plural: 'products',
      options: fromCatalogue(catalogues.data?.products),
    },
  ];
  const more: { key: ListKey; label: string; options: Choice[] }[] = [
    { key: 'region', label: 'Region', options: fromCatalogue(catalogues.data?.regions) },
    { key: 'sat', label: 'Customer rating', options: fromOptions(SATISFACTION) },
    { key: 'factor', label: WORDS.factor, options: fromCatalogue(catalogues.data?.factors) },
    ...(caseStatus
      ? [{ key: 'case' as const, label: 'Case status', options: fromOptions(CASE_STATUSES) }]
      : []),
  ];
  const moreShown = more.filter((m) => shown(m.key));
  const visibleKeys = [...main.map((m) => m.key), ...moreShown.map((m) => m.key)].filter(shown);
  const count = activeFilterCount(filters, visibleKeys);
  const moreCount = activeFilterCount(
    filters,
    MORE_KEYS.filter((k) => moreShown.some((m) => m.key === k)),
  );
  const canClear = count > 0 || filters.preset !== DEFAULT_FILTERS.preset;

  return (
    <section aria-label="Filters" className="mb-8">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="analytics-period">
          Period
        </label>
        <div className="relative">
          <select
            id="analytics-period"
            className={`${pill} appearance-none pr-9 ${filters.preset !== DEFAULT_FILTERS.preset ? pillActive : pillIdle}`}
            value={filters.preset}
            onChange={(e) => {
              const preset = e.target.value as Preset;
              const range = resolvePeriod(filters);
              setFilters((f) => ({
                ...f,
                preset,
                from: preset === 'custom' ? range.from : undefined,
                to: preset === 'custom' ? range.to : undefined,
              }));
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <IconChevronDown
            size={16}
            aria-hidden
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 opacity-70"
          />
        </div>
        {filters.preset === 'custom' && (
          <span className="inline-flex items-center gap-1.5 text-[14px]">
            <label className="sr-only" htmlFor="analytics-from">
              From
            </label>
            <input
              id="analytics-from"
              type="date"
              className={`${pill} ${pillIdle}`}
              value={filters.from ?? ''}
              max={filters.to}
              onChange={(e) => e.target.value && setFilters((f) => ({ ...f, from: e.target.value }))}
            />
            <span aria-hidden className="text-muted">
              to
            </span>
            <label className="sr-only" htmlFor="analytics-to">
              To
            </label>
            <input
              id="analytics-to"
              type="date"
              className={`${pill} ${pillIdle}`}
              value={filters.to ?? ''}
              min={filters.from}
              onChange={(e) => e.target.value && setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </span>
        )}
        {main
          .filter((m) => shown(m.key))
          .map((m) => (
            <MultiSelect
              key={m.key}
              label={m.label}
              allLabel={m.all}
              plural={m.plural}
              options={m.options}
              selected={filters.lists[m.key] ?? []}
              onChange={(v) => set(m.key, v)}
            />
          ))}
        {moreShown.length > 0 && (
          <Popover.Root>
            <Popover.Trigger className={`${pill} ${moreCount ? pillActive : pillIdle}`}>
              <IconFilter size={16} aria-hidden className="opacity-70" />
              More filters
              {moreCount > 0 && (
                <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">
                  {moreCount}
                  <span className="sr-only"> active</span>
                </span>
              )}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={6}
                className="z-50 grid max-h-[70vh] w-[300px] gap-3 overflow-y-auto rounded-md border border-border bg-white p-3 shadow-float"
              >
                {moreShown.map((m, i) => (
                  <div key={m.key} className={i > 0 ? 'border-t border-border-subtle pt-3' : ''}>
                    <CheckList
                      legend={m.label}
                      options={m.options}
                      selected={filters.lists[m.key] ?? []}
                      onChange={(v) => set(m.key, v)}
                    />
                  </div>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        {canClear && (
          <button
            type="button"
            onClick={() => setFilters({ ...DEFAULT_FILTERS, granularity: filters.granularity })}
            className="h-10 rounded-full px-3 text-[14px] font-medium text-brand hover:bg-brand-50"
          >
            Clear{count > 0 ? ` (${count})` : ''}
          </button>
        )}
        {children}
        <p className="ml-auto text-[13px] text-muted" aria-live="polite">
          {periodText}
        </p>
      </div>
      {catalogues.isError && (
        <p role="alert" className="mt-2 text-[14px] text-danger">
          Filter options couldn’t load. The figures still use the filters already chosen.
        </p>
      )}
    </section>
  );
}
