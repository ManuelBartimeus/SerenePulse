// Sales › Claims: the claims queue (with Serene's one-week principle), one claim, and the Claims
// panel shown on a customer's and a policy's page.
import type { UseQueryResult } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { CLAIM_TYPES, PRODUCTS } from '@serene/proposals';
import { useMemo, useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button } from '../../ui/controls';
import { IconCheck, IconClose } from '../../ui/icons';
import { TextActionDialog } from '../cases/ui';
import {
  useClaim,
  useClaimEvents,
  useClaimFiles,
  useClaims,
  useHolidays,
  usePolicy,
  useUpdateClaim,
  type ClaimFileRow,
  type ClaimRow,
} from './api';
import {
  CLAIM_DECISION_DAYS,
  CLAIM_TABS,
  claimActions,
  claimOverdue,
  claimStatus,
  claimTabStatuses,
  documentChecklist,
  documentsCompleteAt,
  isClaimTab,
  workingDaysBetween,
  type ClaimAction,
  type ClaimTab,
} from './claims-format';
import { useSignedUrls } from './files';
import {
  formatDay,
  formatWhen,
  ghs,
  humanise,
  localPhone,
  matchesSearch,
  productName,
  sortBy,
} from './format';
import {
  BackLink,
  DataTable,
  DetailList,
  DocumentGrid,
  FilterSelect,
  Panel,
  PolicyBadge,
  QueryState,
  SearchBox,
  type Column,
  type SortState,
} from './ui';

const claimType = (id: string) => CLAIM_TYPES.find((t) => t.id === id);
const claimTypeLabel = (id: string) => claimType(id)?.label ?? humanise(id);

export const ClaimBadge = ({ status }: { status: string }) => {
  const s = claimStatus(status);
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

interface ClaimView extends ClaimRow {
  ageDays: number;
  completeAt: string | null;
  overdue: boolean;
}

function useClaimViews(rows: readonly ClaimRow[]): ClaimView[] {
  const holidays = useHolidays();
  const open = rows.filter((r) => ['received', 'under_review'].includes(r.status)).map((r) => r.id);
  const files = useClaimFiles(open);
  return useMemo(() => {
    const now = new Date();
    const h = holidays.data ?? new Set<string>();
    return rows.map((r) => {
      const reported = r.submitted_at ?? r.created_at;
      const docs = claimType(r.claim_type)?.documents ?? [];
      const mine = (files.data ?? []).filter((f) => f.claim_id === r.id);
      const completeAt = open.includes(r.id) ? documentsCompleteAt(docs, mine, reported) : null;
      return {
        ...r,
        ageDays: workingDaysBetween(reported, now, h),
        completeAt,
        overdue: claimOverdue(r.status, completeAt, now, h),
      };
    });
  }, [rows, files.data, holidays.data, open]);
}

const COLUMNS: Column<ClaimView>[] = [
  { key: 'no', header: 'Claim', cell: (c) => c.claim_no, sort: (c) => c.claim_no },
  {
    key: 'customer',
    header: 'Customer',
    cell: (c) => c.customer_name ?? c.customer_no ?? '—',
    sort: (c) => c.customer_name,
  },
  {
    key: 'type',
    header: 'What happened',
    cell: (c) => (
      <span>
        {claimTypeLabel(c.claim_type)}
        <span className="block text-[13px] text-muted">
          {c.product_code ? productName(c.product_code) : ''} · {c.policy_no}
        </span>
      </span>
    ),
    sort: (c) => claimTypeLabel(c.claim_type),
  },
  {
    key: 'incident',
    header: 'Incident',
    cell: (c) => formatDay(c.incident_date),
    sort: (c) => c.incident_date,
  },
  { key: 'status', header: 'Status', cell: (c) => <ClaimBadge status={c.status} />, sort: (c) => c.status },
  {
    key: 'age',
    header: 'Age',
    cell: (c) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {c.ageDays} working day{c.ageDays === 1 ? '' : 's'}
        {c.overdue && <Badge tone="danger">Decision overdue</Badge>}
      </span>
    ),
    sort: (c) => (c.overdue ? 10_000 : 0) + c.ageDays,
    numeric: true,
  },
];

export function ClaimsPage() {
  const search = useSearch({ strict: false }) as { tab?: string };
  const tab: ClaimTab = isClaimTab(search.tab) ? search.tab : 'new';
  const list = useClaims({ statuses: claimTabStatuses(tab) });
  const [product, setProduct] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'age', dir: 'desc' });
  const views = useClaimViews(list.data ?? []);
  const visible = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const rows = views.filter(
      (c) =>
        (!product || c.product_code === product) &&
        (!type || c.claim_type === type) &&
        matchesSearch(q, c.claim_no, c.customer_name, c.policy_no, c.customer_phone),
    );
    return col?.sort ? sortBy(rows, col.sort, sort.dir) : rows;
  }, [views, product, type, q, sort]);
  const overdue = views.filter((v) => v.overdue).length;

  return (
    <>
      <PageHeader
        title="Claims"
        subtitle={`Claims customers reported online. Our principle: a decision within ${CLAIM_DECISION_DAYS} working days of the last document.`}
      />
      <nav aria-label="Claim status" className="-mt-2 mb-5 overflow-x-auto border-b border-border md:-mt-4">
        <ul className="flex gap-1">
          {CLAIM_TABS.map((t) => (
            <li key={t.key} className="shrink-0">
              <Link
                to="/claims"
                search={{ tab: t.key } as never}
                aria-current={tab === t.key ? 'page' : undefined}
                className={`-mb-px inline-flex h-11 items-center border-b-2 px-4 text-[15px] ${
                  tab === t.key
                    ? 'border-brand font-medium text-brand'
                    : 'border-transparent text-secondary hover:text-ink'
                }`}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {overdue > 0 && (
        <div className="mb-4">
          <Alert
            tone="warning"
            title={`${overdue} claim${overdue === 1 ? '' : 's'} past the one-week principle`}
          >
            All the documents have been in for more than {CLAIM_DECISION_DAYS} working days without a
            decision.
          </Alert>
        </div>
      )}
      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <SearchBox
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Claim or policy number, customer, phone"
          />
          <FilterSelect label="Product" value={product} onChange={setProduct}>
            <option value="">All products</option>
            {PRODUCTS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Type of claim" value={type} onChange={setType}>
            <option value="">All types</option>
            {CLAIM_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </FilterSelect>
        </div>
        <QueryState query={list}>
          {() => (
            <DataTable
              rows={visible}
              columns={COLUMNS}
              rowKey={(c) => c.id}
              rowLink={(c) => ({ to: '/claims/$claimId', params: { claimId: c.id } })}
              caption="Claims"
              sort={sort}
              onSort={setSort}
              empty={tab === 'new' ? 'No new claims.' : 'No claims match.'}
            />
          )}
        </QueryState>
      </Panel>
    </>
  );
}

/** Claims on a customer's or policy's page. */
export function ClaimsPanel({
  query,
  className = '',
}: {
  filter: { customerId?: string; policyId?: string };
  query: UseQueryResult<ClaimRow[]>;
  className?: string;
}) {
  return (
    <Panel title="Claims" padded={false} className={className}>
      <QueryState query={query} skeleton="h-24">
        {(rows) => (
          <DataTable
            rows={rows}
            caption="Claims"
            rowKey={(c) => c.id}
            rowLink={(c) => ({ to: '/claims/$claimId', params: { claimId: c.id } })}
            empty="No claims."
            columns={[
              { key: 'no', header: 'Claim', cell: (c) => c.claim_no },
              { key: 'type', header: 'What happened', cell: (c) => claimTypeLabel(c.claim_type) },
              { key: 'incident', header: 'Incident', cell: (c) => formatDay(c.incident_date) },
              { key: 'status', header: 'Status', cell: (c) => <ClaimBadge status={c.status} /> },
            ]}
          />
        )}
      </QueryState>
    </Panel>
  );
}

// ---- Detail ------------------------------------------------------------------------------

export function ClaimDetailPage() {
  const { claimId } = useParams({ strict: false }) as { claimId: string };
  const claim = useClaim(claimId);
  return (
    <>
      <BackLink to="/claims">All claims</BackLink>
      <QueryState query={claim}>
        {(c) =>
          c ? (
            <ClaimDetail c={c} />
          ) : (
            <Alert tone="info" title="Claim not found">
              The link may be out of date.
            </Alert>
          )
        }
      </QueryState>
    </>
  );
}

function ClaimDetail({ c }: { c: ClaimRow }) {
  const { can } = useSession();
  const files = useClaimFiles([c.id]);
  const events = useClaimEvents(c.id);
  const policy = usePolicy(c.policy_id);
  const holidays = useHolidays();
  const update = useUpdateClaim();
  const [action, setAction] = useState<ClaimAction | null>(null);
  const type = claimType(c.claim_type);
  const list: ClaimFileRow[] = files.data ?? [];
  const urls = useSignedUrls(list.map((f) => f.storage_path));
  const checklist = documentChecklist(type?.documents ?? [], list);
  const reported = c.submitted_at ?? c.created_at;
  const completeAt = documentsCompleteAt(type?.documents ?? [], list, reported);
  const now = new Date();
  const h = holidays.data ?? new Set<string>();
  const overdue = claimOverdue(c.status, completeAt, now, h);
  const docLabel = (kind: string) => type?.documents.find((d) => d.kind === kind)?.label ?? humanise(kind);

  return (
    <>
      <PageHeader
        title={c.claim_no}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ClaimBadge status={c.status} /> {claimTypeLabel(c.claim_type)} · reported {formatWhen(reported)}{' '}
            · {workingDaysBetween(reported, now, h)} working days ago
          </span>
        }
      />
      <div className="mb-6 flex flex-col gap-3">
        {overdue && (
          <Alert tone="warning" title="Decision overdue">
            All the documents have been in since {formatWhen(completeAt)}, more than {CLAIM_DECISION_DAYS}{' '}
            working days without a decision.
          </Alert>
        )}
        {c.staff_message && (
          <Alert tone="info" title="Last message to the customer">
            {c.staff_message}
          </Alert>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="What happened">
            <DetailList
              items={[
                { label: 'Type of claim', value: claimTypeLabel(c.claim_type) },
                { label: 'Date of incident', value: formatDay(c.incident_date) },
                { label: 'Where', value: c.incident_location },
                {
                  label: 'Estimated amount',
                  value: c.estimated_amount !== null ? ghs(c.estimated_amount) : null,
                },
                ...(c.third_party
                  ? [
                      { label: 'Other party', value: c.third_party.name },
                      { label: 'Other party’s phone', value: c.third_party.phone },
                      { label: 'Other party’s vehicle', value: c.third_party.vehicleReg },
                    ]
                  : []),
              ]}
            />
            <h3 className="mb-1 mt-5 text-[13px] font-medium text-muted">Customer’s account</h3>
            <p className="whitespace-pre-wrap text-[15px] leading-6">{c.description}</p>
          </Panel>
          <Panel title="Documents">
            {type && (
              <ul className="mb-5 flex flex-col gap-2" aria-label="Documents this type of claim needs">
                {checklist.map((d) => (
                  <li key={d.kind} className="flex items-start gap-2 text-[15px]">
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                        d.present
                          ? 'bg-success-bg text-success'
                          : d.required
                            ? 'bg-danger-bg text-danger'
                            : 'bg-surface-muted text-muted'
                      }`}
                    >
                      {d.present ? <IconCheck size={14} /> : <IconClose size={12} />}
                    </span>
                    <span>
                      {d.label}
                      <span className="text-muted">
                        {' '}
                        · {d.present ? 'received' : d.required ? 'missing' : 'not sent (optional)'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <QueryState query={files} skeleton="h-24">
              {() => (
                <DocumentGrid
                  empty="No documents yet."
                  items={list.map((f) => ({
                    id: f.id,
                    name: f.original_name,
                    mime: f.mime,
                    url: urls[f.storage_path],
                    caption: docLabel(f.kind),
                  }))}
                />
              )}
            </QueryState>
          </Panel>
          <Panel title="Timeline">
            <QueryState query={events} skeleton="h-24">
              {(ev) => (
                <ol className="flex flex-col gap-4">
                  {[...ev].reverse().map((e) => (
                    <li key={e.id} className="border-l-2 border-border pl-4">
                      <p className="text-[13px] text-muted">
                        {formatWhen(e.at)} ·{' '}
                        {e.actor_type === 'customer'
                          ? 'Customer'
                          : e.actor_type === 'system'
                            ? 'System'
                            : (e.actor_name ?? 'Staff')}
                      </p>
                      <p className="text-[15px] font-medium">{claimStatus(e.status).label}</p>
                      {e.note && (
                        <p className="mt-0.5 whitespace-pre-wrap text-[15px] text-secondary">{e.note}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </QueryState>
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          {can('claims.manage') && (
            <Panel title="Actions">
              <div className="flex flex-col gap-3">
                {claimActions(c.status).map((a) => (
                  <Button
                    key={a.to}
                    variant={a.danger ? 'secondary' : 'primary'}
                    onClick={() => setAction(a)}
                  >
                    {a.label}
                  </Button>
                ))}
                {claimActions(c.status).length === 0 && (
                  <p className="text-[15px] text-secondary">This claim is closed.</p>
                )}
              </div>
            </Panel>
          )}
          <Panel title="Customer">
            <DetailList
              items={[
                {
                  label: 'Name',
                  value: (
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: c.customer_id } as never}
                      className="font-medium text-brand underline-offset-2 hover:underline"
                    >
                      {c.customer_name ?? c.customer_no}
                    </Link>
                  ),
                },
                { label: 'Customer no.', value: c.customer_no },
                { label: 'Phone', value: localPhone(c.customer_phone) },
              ]}
            />
          </Panel>
          <Panel title="Policy">
            <QueryState query={policy} skeleton="h-24">
              {(pol) =>
                pol ? (
                  <DetailList
                    items={[
                      {
                        label: 'Policy',
                        value: (
                          <Link
                            to="/policies/$policyId"
                            params={{ policyId: pol.id } as never}
                            className="font-medium text-brand underline-offset-2 hover:underline"
                          >
                            {pol.policy_no}
                          </Link>
                        ),
                      },
                      { label: 'Status', value: <PolicyBadge status={pol.status} /> },
                      { label: 'Cover', value: pol.cover_title },
                      { label: 'Insured', value: pol.insured_subject },
                      {
                        label: 'Cover period',
                        value: `${formatDay(pol.starts_on)} to ${formatDay(pol.expires_on)}`,
                      },
                      { label: 'Sum insured', value: pol.sum_insured ? ghs(pol.sum_insured) : null },
                    ]}
                  />
                ) : (
                  <p className="text-secondary">{c.policy_no}</p>
                )
              }
            </QueryState>
          </Panel>
        </div>
      </div>
      <TextActionDialog
        open={action !== null}
        onOpenChange={(o) => !o && setAction(null)}
        title={action?.label ?? ''}
        description="The customer sees this message on their claim."
        label={action?.prompt ?? 'Message'}
        minLength={action && ['info_requested', 'declined'].includes(action.to) ? 5 : 0}
        danger={action?.danger ?? false}
        confirmLabel={action?.label ?? 'Save'}
        onConfirm={(message) => update.mutateAsync({ id: c.id, status: action?.to ?? '', message })}
      />
    </>
  );
}
