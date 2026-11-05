import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Badge, Button, EmptyState, TextField } from '../../ui/controls';
import { useCatalogues } from '../analytics/catalogues';
import { useCasePeople, useRpc, type CaseItem, type CasePage } from './api';
import { CASE_STATUSES, ESCALATION_LABELS, formatDate, nextCursor, PRIORITIES } from './format';
import { ErrorAlert, Loading, PriorityBadge, Select, SlaBadge, StatusBadge } from './ui';

interface Filters {
  status: string;
  priority: string;
  branch: string;
  department: string;
  officer: string;
  overdue: boolean;
  escalated: boolean;
  q: string;
}
const EMPTY: Filters = {
  status: 'open',
  priority: '',
  branch: '',
  department: '',
  officer: '',
  overdue: false,
  escalated: false,
  q: '',
};

/** Maps the screen filters to cases_list's p_filters. "open" = every status before resolved. */
export function toCaseFilters(f: Filters, mine: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.status === 'open') out.statuses = ['new', 'assigned', 'in_progress'];
  else if (f.status) out.statuses = [f.status];
  if (f.priority) out.priorities = [f.priority];
  if (f.branch) out.branch_ids = [f.branch];
  if (f.department) out.department_ids = [f.department];
  if (f.officer === 'unassigned') out.unassigned = true;
  else if (f.officer) out.officer_ids = [f.officer];
  if (f.overdue) out.overdue = true;
  if (f.escalated) out.escalated = true;
  if (f.q.trim()) out.q = f.q.trim();
  if (mine) out.mine = true;
  return out;
}

function CaseCard({ c }: { c: CaseItem }) {
  return (
    <Link
      to="/cases/$caseId"
      params={{ caseId: c.id }}
      className="block rounded-lg border border-border bg-white p-3 hover:border-brand focus-visible:border-brand"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{c.reference}</span>
        <PriorityBadge priority={c.priority} />
        {c.is_escalated && <Badge tone="danger">{ESCALATION_LABELS[c.escalation_level]}</Badge>}
      </div>
      <p className="mt-1 line-clamp-2 text-[14px]">{c.description}</p>
      <p className="mt-2 text-[12px] text-secondary">
        {c.branch_name ?? 'No branch'} · {c.officer_name ?? c.department_name ?? 'Unassigned'}
      </p>
      <div className="mt-2">
        <SlaBadge state={c.sla_state} />
      </div>
    </Link>
  );
}

/** S-B4 case list and board; S-B6 "My cases" with `mine`. */
export function CasesPage({ mine = false }: { mine?: boolean }) {
  const rpc = useRpc();
  const { can } = useSession();
  const [f, setF] = useState<Filters>(EMPTY);
  const [layout, setLayout] = useState<'list' | 'board'>('list');
  const catalogues = useCatalogues();
  const people = useCasePeople(can('cases.assign'));
  const filters = useMemo(
    () => toCaseFilters(layout === 'board' ? { ...f, status: '' } : f, mine),
    [f, layout, mine],
  );
  const q = useInfiniteQuery({
    queryKey: ['cases', 'list', filters, layout],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      rpc<CasePage>('cases_list', {
        p_filters: filters,
        p_cursor: pageParam,
        p_limit: layout === 'board' ? 300 : 50,
      }),
    getNextPageParam: nextCursor,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));

  return (
    <>
      <PageHeader
        title={mine ? 'My cases' : 'Cases'}
        subtitle={
          mine
            ? 'Cases assigned to you, newest first.'
            : 'All new cases arrive in the CX central queue; CX Administrators assign them (D-17).'
        }
        actions={
          <div
            className="flex rounded-full border border-border-strong bg-white p-1"
            role="group"
            aria-label="Layout"
          >
            {(['list', 'board'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={layout === l}
                onClick={() => setLayout(l)}
                className={`h-10 rounded-full px-4 text-[14px] font-medium ${layout === l ? 'bg-brand text-white' : 'text-ink'}`}
              >
                {l === 'list' ? 'List' : 'Board'}
              </button>
            ))}
          </div>
        }
      />
      <section
        aria-label="Filters"
        className="mb-4 grid gap-3 rounded-lg bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <TextField
          label="Search reference"
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="CASE-… or FB-…"
        />
        {layout === 'list' && (
          <Select label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="open">Open (new, assigned, in progress)</option>
            <option value="">All statuses</option>
            {CASE_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
        <Select label="Priority" value={f.priority} onChange={(e) => set({ priority: e.target.value })}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select label="Branch" value={f.branch} onChange={(e) => set({ branch: e.target.value })}>
          <option value="">All branches</option>
          {(catalogues.data?.branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
        {people.data && (
          <>
            <Select
              label="Department"
              value={f.department}
              onChange={(e) => set({ department: e.target.value })}
            >
              <option value="">All departments</option>
              {people.data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            {!mine && (
              <Select label="Officer" value={f.officer} onChange={(e) => set({ officer: e.target.value })}>
                <option value="">Anyone</option>
                <option value="unassigned">Unassigned (CX queue)</option>
                {people.data.people
                  .filter((p) => p.can_work)
                  .map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.display_name || 'Unnamed user'}
                    </option>
                  ))}
              </Select>
            )}
          </>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={f.overdue}
              onChange={(e) => set({ overdue: e.target.checked })}
            />
            Overdue only
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={f.escalated}
              onChange={(e) => set({ escalated: e.target.checked })}
            />
            Escalated only
          </label>
        </div>
      </section>

      {q.isPending ? (
        <Loading label="Loading cases" />
      ) : q.isError ? (
        <ErrorAlert error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <section className="rounded-lg bg-white">
          <EmptyState title={mine ? 'No cases assigned to you' : 'No cases match these filters'}>
            {mine ? 'New assignments appear here and in your notifications.' : 'Try clearing a filter.'}
          </EmptyState>
        </section>
      ) : layout === 'board' ? (
        <div className="grid gap-4 overflow-x-auto md:grid-cols-5" aria-label="Case board">
          {CASE_STATUSES.map((s) => {
            const col = items.filter((c) => c.status === s.key);
            return (
              <section
                key={s.key}
                aria-label={s.label}
                className="min-w-[220px] rounded-lg bg-surface-muted p-3"
              >
                <h2 className="mb-3 text-[14px] font-medium">
                  {s.label} <span className="text-secondary">({col.length})</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {col.map((c) => (
                    <CaseCard key={c.id} c={c} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg bg-white md:block">
            <table className="w-full text-left text-[14px]">
              <caption className="sr-only">Cases</caption>
              <thead className="border-b border-border text-secondary">
                <tr>
                  {['Reference', 'Priority', 'Status', 'Branch', 'Assigned to', 'Created', 'Due', 'SLA'].map(
                    (h) => (
                      <th key={h} scope="col" className="px-4 py-3 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                    <td className="px-4 py-3">
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        className="font-medium text-brand hover:underline"
                      >
                        {c.reference}
                      </Link>
                      {c.is_escalated && (
                        <span className="ml-2">
                          <Badge tone="danger">Escalated</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">{c.branch_name ?? '—'}</td>
                    <td className="px-4 py-3">{c.officer_name ?? c.department_name ?? 'CX queue'}</td>
                    <td className="px-4 py-3">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3">{formatDate(c.target_resolution_at)}</td>
                    <td className="px-4 py-3">
                      <SlaBadge state={c.sla_state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {items.map((c) => (
              <li key={c.id}>
                <CaseCard c={c} />
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="mt-4">
              <Button variant="secondary" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
