import * as Popover from '@radix-ui/react-popover';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useCatalogues, type Option } from './catalogues';
import {
  accraToday,
  activeFilterCount,
  BRANCH_STATUSES,
  CASE_STATUSES,
  DEFAULT_FILTERS,
  FILTER_SEARCH_KEYS,
  GRANULARITIES,
  NPS_CLASSES,
  parseFilterSearch,
  periodLabel,
  PRESETS,
  resolvePeriod,
  SATISFACTION,
  SOURCES,
  toFilterSearch,
  toRpcFilters,
  type FilterState,
  type Granularity,
  type ListKey,
  type Preset,
} from './filters-state';

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
    if (saved && Object.keys(saved).length > 0) write(saved);
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

const control =
  'h-11 rounded-sm border border-border-strong bg-white px-3 text-[14px] outline-none hover:border-ink focus-visible:border-brand';

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string; group?: string; inactive?: boolean | undefined }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const id = useId();
  const summary =
    selected.length === 0
      ? 'All'
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? '1 selected')
        : `${selected.length} selected`;
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <Popover.Root>
      <Popover.Trigger
        className={`${control} inline-flex max-w-[260px] items-center gap-1 ${selected.length ? 'border-brand bg-brand-50' : ''}`}
      >
        <span className="text-secondary">{label}:</span>
        <span className="truncate font-medium">{summary}</span>
        <span aria-hidden>▾</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-[60vh] w-[280px] overflow-y-auto rounded-sm border border-border bg-white p-2 shadow-float"
        >
          <fieldset>
            <legend className="px-2 pb-1 text-[12px] font-medium uppercase tracking-[1px] text-muted">
              {label}
            </legend>
            {options.length === 0 && <p className="px-2 py-2 text-[14px] text-secondary">No options.</p>}
            {options.map((o, i) => (
              <div key={o.id}>
                {o.group && o.group !== options[i - 1]?.group && (
                  <p className="mt-2 border-t border-border px-2 pt-2 text-[12px] text-muted">{o.group}</p>
                )}
                <label
                  htmlFor={`${id}-${o.id}`}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xs px-2 text-[14px] hover:bg-surface-muted"
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
                    {o.inactive && <span className="text-muted"> (inactive)</span>}
                  </span>
                </label>
              </div>
            ))}
          </fieldset>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 h-11 w-full rounded-xs text-[14px] font-medium text-brand hover:bg-brand-50"
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const fromOptions = (xs: readonly { key: string; label: string }[], group?: string) =>
  xs.map((x) => ({ id: x.key, label: x.label, ...(group ? { group } : {}) }));
const fromCatalogue = (xs: Option[] | undefined) =>
  (xs ?? []).map((x) => ({ id: x.id, label: x.label, inactive: x.inactive }));

/**
 * The global filter bar (SPEC M08 common filter set). `granularity` shows the time-granularity
 * switch; `caseStatus` adds the case-status filter (records and case views only); `hide` removes
 * filters that don't apply to a view (e.g. answers on the funnel).
 */
export function FilterBar({
  granularity = false,
  caseStatus = false,
  hide = [],
  children,
}: {
  granularity?: boolean;
  caseStatus?: boolean;
  hide?: ListKey[];
  children?: ReactNode;
}) {
  const { filters, setFilters, periodText } = useAnalyticsFilters();
  const catalogues = useCatalogues();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = activeFilterCount(filters);
  const set = (key: ListKey, values: string[]) =>
    setFilters((f) => ({ ...f, lists: { ...f.lists, [key]: values } }));
  const branchSelection = [...(filters.lists.branch ?? []), ...(filters.lists.bstatus ?? [])];
  const statusKeys: string[] = BRANCH_STATUSES.map((s) => s.key);
  const lists: { key: ListKey; label: string; options: ReturnType<typeof fromOptions> }[] = [
    { key: 'region', label: 'Region', options: fromCatalogue(catalogues.data?.regions) },
    { key: 'channel', label: 'Channel', options: fromCatalogue(catalogues.data?.channels) },
    { key: 'product', label: 'Product', options: fromCatalogue(catalogues.data?.products) },
    { key: 'sat', label: 'Satisfaction', options: fromOptions(SATISFACTION) },
    { key: 'nps', label: 'NPS class', options: fromOptions(NPS_CLASSES) },
    { key: 'factor', label: 'Improvement factor', options: fromCatalogue(catalogues.data?.factors) },
    { key: 'src', label: 'Source', options: fromOptions(SOURCES) },
    { key: 'qr', label: 'QR point', options: fromCatalogue(catalogues.data?.qrPoints) },
    { key: 'ver', label: 'Survey version', options: fromCatalogue(catalogues.data?.versions) },
    ...(caseStatus
      ? [{ key: 'case' as const, label: 'Case status', options: fromOptions(CASE_STATUSES) }]
      : []),
  ];

  return (
    <section aria-label="Filters" className="mb-6 rounded-lg bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[14px] font-medium">
          Period
          <select
            className={control}
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
        </label>
        {filters.preset === 'custom' && (
          <>
            <label className="flex flex-col gap-1 text-[14px] font-medium">
              From
              <input
                type="date"
                className={control}
                value={filters.from ?? ''}
                max={filters.to}
                onChange={(e) => e.target.value && setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-[14px] font-medium">
              To
              <input
                type="date"
                className={control}
                value={filters.to ?? ''}
                min={filters.from}
                onChange={(e) => e.target.value && setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </label>
          </>
        )}
        {granularity && (
          <label className="flex flex-col gap-1 text-[14px] font-medium">
            Granularity
            <select
              className={control}
              value={filters.granularity}
              onChange={(e) => setFilters((f) => ({ ...f, granularity: e.target.value as Granularity }))}
            >
              {GRANULARITIES.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className={`${control} font-medium md:hidden`}
        >
          Filters{count > 0 ? ` (${count})` : ''}
        </button>
        <p className="text-[14px] text-secondary" aria-live="polite">
          {periodText} · Africa/Accra · by submission date
        </p>
      </div>
      <div id={panelId} className={`${open ? 'flex' : 'hidden'} mt-3 flex-wrap items-center gap-2 md:flex`}>
        {!hide.includes('branch') && (
          <MultiSelect
            label="Branch"
            options={[
              ...fromCatalogue(catalogues.data?.branches),
              ...fromOptions(BRANCH_STATUSES, 'No issuing branch'),
            ]}
            selected={branchSelection}
            onChange={(next) =>
              setFilters((f) => ({
                ...f,
                lists: {
                  ...f.lists,
                  branch: next.filter((v) => !statusKeys.includes(v)),
                  bstatus: next.filter((v) => statusKeys.includes(v)),
                },
              }))
            }
          />
        )}
        {lists
          .filter((l) => !hide.includes(l.key))
          .map((l) => (
            <MultiSelect
              key={l.key}
              label={l.label}
              options={l.options}
              selected={filters.lists[l.key] ?? []}
              onChange={(v) => set(l.key, v)}
            />
          ))}
        <label className="inline-flex min-h-11 items-center gap-2 px-2 text-[14px]">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-brand)]"
            checked={filters.includeUnverified}
            onChange={(e) => setFilters((f) => ({ ...f, includeUnverified: e.target.checked }))}
          />
          Include unverified submissions
        </label>
        {(count > 0 || filters.preset !== DEFAULT_FILTERS.preset) && (
          <button
            type="button"
            onClick={() => setFilters({ ...DEFAULT_FILTERS, granularity: filters.granularity })}
            className="h-11 rounded-full px-4 text-[14px] font-medium text-brand hover:bg-brand-50"
          >
            Reset filters
          </button>
        )}
        {children}
      </div>
      {catalogues.isError && (
        <p role="alert" className="mt-2 text-[14px] text-danger">
          Filter options couldn’t load. Figures still use the filters in the address bar.
        </p>
      )}
    </section>
  );
}
