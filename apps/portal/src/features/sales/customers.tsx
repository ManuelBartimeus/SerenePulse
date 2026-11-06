// Sales › Customers: everyone who has signed in to buy online, and one customer's full record.
import { useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, TextField } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { TextArea } from '../cases/ui';
import {
  useClaims,
  useCustomer,
  useCustomers,
  usePayments,
  usePolicies,
  useProposalFiles,
  useProposals,
  useSalesAction,
  useSignedUrl,
  type CustomerRow,
  type IdentityStatus,
  type ProposalFileRow,
} from './api';
import { ClaimsPanel } from './claims';
import {
  formatDay,
  formatWhen,
  ghs,
  localPhone,
  matchesSearch,
  productName,
  sortBy,
  IDENTITY_STATUS,
} from './format';
import {
  BackLink,
  DataTable,
  DetailList,
  DocumentGrid,
  ErrorNote,
  FilterSelect,
  IdentityBadge,
  Panel,
  PaymentBadge,
  PolicyBadge,
  ProposalBadge,
  QueryState,
  SearchBox,
  type Column,
  type DocItem,
  type SortState,
} from './ui';
import { useSignedUrls } from './files';
import { paymentMethod } from './format';

const customerName = (c: Pick<CustomerRow, 'full_name' | 'company_name' | 'customer_no'>) =>
  c.full_name || c.company_name || c.customer_no;

const COLUMNS: Column<CustomerRow>[] = [
  { key: 'name', header: 'Name', cell: (c) => customerName(c), sort: (c) => customerName(c) },
  { key: 'no', header: 'Customer no.', cell: (c) => c.customer_no, sort: (c) => c.customer_no },
  { key: 'phone', header: 'Phone', cell: (c) => localPhone(c.phone_e164), sort: (c) => c.phone_e164 },
  {
    key: 'email',
    header: 'Email',
    cell: (c) => c.email ?? <span className="text-muted">—</span>,
    sort: (c) => c.email,
    card: false,
  },
  {
    key: 'identity',
    header: 'Identity',
    cell: (c) => <IdentityBadge status={c.identity_status} />,
    sort: (c) => c.identity_status ?? 'unverified',
  },
  {
    key: 'policies',
    header: 'Policies',
    cell: (c) => c.policy_count ?? 0,
    sort: (c) => c.policy_count ?? 0,
    numeric: true,
  },
  {
    key: 'proposals',
    header: 'Proposals',
    cell: (c) => c.proposal_count ?? 0,
    sort: (c) => c.proposal_count ?? 0,
    numeric: true,
  },
  {
    key: 'premium',
    header: 'Total premium',
    cell: (c) => ghs(c.total_premium ?? 0),
    sort: (c) => Number(c.total_premium ?? 0),
    numeric: true,
  },
  { key: 'joined', header: 'Joined', cell: (c) => formatDay(c.created_at), sort: (c) => c.created_at },
  {
    key: 'seen',
    header: 'Last sign-in',
    cell: (c) => formatWhen(c.last_sign_in_at),
    sort: (c) => c.last_sign_in_at,
    card: false,
  },
];

export function CustomersPage() {
  const list = useCustomers();
  const [q, setQ] = useState('');
  const [identity, setIdentity] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'joined', dir: 'desc' });
  const visible = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const filtered = (list.data ?? []).filter(
      (c) =>
        (!identity || (c.identity_status ?? 'unverified') === identity) &&
        matchesSearch(q, c.full_name, c.company_name, c.customer_no, c.phone_e164, c.email),
    );
    return col?.sort ? sortBy(filtered, col.sort, sort.dir) : filtered;
  }, [list.data, q, identity, sort]);

  return (
    <>
      <PageHeader title="Customers" subtitle="Everyone who has signed in to buy insurance online." />
      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <SearchBox
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Name, customer number, phone or email"
          />
          <FilterSelect label="Identity check" value={identity} onChange={setIdentity}>
            <option value="">All customers</option>
            {(Object.keys(IDENTITY_STATUS) as IdentityStatus[]).map((k) => (
              <option key={k} value={k}>
                {IDENTITY_STATUS[k].label}
              </option>
            ))}
          </FilterSelect>
        </div>
        <QueryState query={list}>
          {() => (
            <>
              <p className="px-4 pt-3 text-[13px] text-muted" aria-live="polite">
                {visible.length} customer{visible.length === 1 ? '' : 's'}
              </p>
              <DataTable
                rows={visible}
                columns={COLUMNS}
                rowKey={(c) => c.id}
                rowLink={(c) => ({ to: '/customers/$customerId', params: { customerId: c.id } })}
                caption="Customers"
                sort={sort}
                onSort={setSort}
                empty={q || identity ? 'No customer matches this search.' : 'No customers yet.'}
              />
            </>
          )}
        </QueryState>
      </Panel>
    </>
  );
}

// ---- Detail ------------------------------------------------------------------------------

const KYC_KINDS = ['id_selfie', 'id_passport'];
const KIND_LABEL: Record<string, string> = {
  id_selfie: 'Face photo',
  id_passport: 'Passport photo page',
};

function IdentityPanel({ c, files }: { c: CustomerRow; files: ProposalFileRow[] }) {
  const { can } = useSession();
  const actions = useSalesAction();
  const [dialog, setDialog] = useState<'verified' | 'mismatch' | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selfie = [...files].reverse().find((f) => f.kind === 'id_selfie');
  const photo = useSignedUrl(selfie?.storage_path);
  const isGhanaCard = !c.id_type || /ghana/i.test(c.id_type);

  const submit = () => {
    if (dialog === 'verified' && !reference.trim()) {
      setError('Enter the NIA transaction reference.');
      return;
    }
    if (dialog === 'mismatch' && note.trim().length < 5) {
      setError('Say what did not match (at least 5 characters).');
      return;
    }
    setError(null);
    actions.setIdentity.mutate(
      {
        customerId: c.id,
        status: dialog ?? 'pending',
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { onSuccess: () => setDialog(null) },
    );
  };

  return (
    <Panel title="Identity check" actions={<IdentityBadge status={c.identity_status} />}>
      <div className="flex flex-col gap-5 md:flex-row">
        <div className="w-40 max-w-full shrink-0">
          {selfie ? (
            photo.data ? (
              <img
                src={photo.data}
                alt={`Face photo of ${customerName(c)}`}
                className="aspect-square w-full rounded-md border border-border-subtle object-cover"
              />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded-md bg-surface-muted" />
            )
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-md border border-dashed border-border-strong px-3 text-center text-[13px] text-muted">
              No face photo yet
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <DetailList
            items={[
              {
                label: isGhanaCard ? 'Ghana Card number' : 'ID type',
                value: isGhanaCard ? c.id_number : c.id_type,
              },
              ...(isGhanaCard ? [] : [{ label: 'ID number', value: c.id_number }]),
              { label: 'Nationality', value: c.nationality },
              { label: 'NIA reference', value: c.identity_reference },
              {
                label: 'Checked',
                value: c.identity_checked_at ? formatWhen(c.identity_checked_at) : null,
              },
              { label: 'Note', value: c.identity_note },
            ]}
          />
          <p className="mt-4 text-[13px] leading-5 text-secondary">
            Check the face photo against the Ghana Card number with NIA. By law (L.I. 2523) we don’t ask for
            or keep images of the Ghana Card.
          </p>
          {can('proposals.review') && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setReference(c.identity_reference ?? '');
                  setNote('');
                  setError(null);
                  setDialog('verified');
                }}
              >
                Mark verified
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setNote('');
                  setError(null);
                  setDialog('mismatch');
                }}
              >
                Mark as mismatch
              </Button>
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === 'verified' ? 'Mark identity as verified' : 'Mark identity as a mismatch'}
        description={
          dialog === 'verified'
            ? 'Record the reference NIA gave for the successful check.'
            : 'The customer’s proposals will show a warning until the identity is checked again.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={dialog === 'mismatch' ? 'danger' : 'primary'}
              busy={actions.setIdentity.isPending}
              onClick={submit}
            >
              {dialog === 'verified' ? 'Mark verified' : 'Mark as mismatch'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {dialog === 'verified' && (
            <TextField
              label="NIA transaction reference"
              value={reference}
              maxLength={80}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
          <TextArea
            label={dialog === 'mismatch' ? 'What did not match?' : 'Note (optional)'}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
          <div aria-live="polite" className="flex flex-col gap-2">
            {error && <Alert tone="danger">{error}</Alert>}
            <ErrorNote error={actions.setIdentity.error} />
          </div>
        </div>
      </Dialog>
    </Panel>
  );
}

export function CustomerDetailPage() {
  const { customerId } = useParams({ strict: false }) as { customerId: string };
  const customer = useCustomer(customerId);
  return (
    <>
      <BackLink to="/customers">All customers</BackLink>
      <QueryState query={customer}>
        {(c) =>
          c ? (
            <CustomerDetail c={c} />
          ) : (
            <Alert tone="info" title="Customer not found">
              The link may be out of date.
            </Alert>
          )
        }
      </QueryState>
    </>
  );
}

function CustomerDetail({ c }: { c: CustomerRow }) {
  const { can } = useSession();
  const proposals = useProposals({ customerId: c.id });
  const policies = usePolicies({ customerId: c.id });
  const payments = usePayments({ customerId: c.id });
  const files = useProposalFiles({ customerId: c.id });
  const claims = useClaims({ customerId: c.id });
  const fileList = files.data ?? [];
  const kyc = fileList.filter((f) => KYC_KINDS.includes(f.kind));
  const urls = useSignedUrls(kyc.map((f) => f.storage_path));
  const docs: DocItem[] = kyc.map((f) => ({
    id: f.id,
    name: f.original_name ?? `${f.kind}.${f.mime.split('/')[1] ?? 'file'}`,
    mime: f.mime,
    url: urls[f.storage_path],
    caption: KIND_LABEL[f.kind] ?? f.kind,
  }));

  return (
    <>
      <PageHeader
        title={customerName(c)}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {c.customer_no} · {localPhone(c.phone_e164)}
            {c.status && c.status !== 'active' && <Badge tone="warning">{c.status}</Badge>}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          <DetailList
            items={[
              { label: 'Name', value: [c.title, c.full_name].filter(Boolean).join(' ') || null },
              { label: 'Company', value: c.company_name },
              { label: 'Phone', value: localPhone(c.phone_e164) },
              { label: 'Email', value: c.email },
              { label: 'Date of birth', value: c.date_of_birth ? formatDay(c.date_of_birth) : null },
              { label: 'Gender', value: c.gender },
              { label: 'Occupation', value: c.occupation },
              { label: 'Employer', value: c.employer },
              { label: 'Residential address', value: c.residential_address },
              { label: 'Postal address', value: c.postal_address },
              { label: 'Digital address', value: c.digital_address },
              { label: 'TIN', value: c.tin },
              { label: 'Company registration no.', value: c.company_reg_no },
              { label: 'Marketing messages', value: c.marketing_consent ? 'Agreed' : 'Not agreed' },
              { label: 'Joined', value: formatWhen(c.created_at) },
              { label: 'Last sign-in', value: formatWhen(c.last_sign_in_at) },
            ]}
          />
        </Panel>
        <div className="flex flex-col gap-6">
          <IdentityPanel c={c} files={fileList} />
          <Panel title="ID documents">
            <QueryState query={files} skeleton="h-24">
              {() => <DocumentGrid items={docs} empty="No ID documents uploaded." />}
            </QueryState>
          </Panel>
        </div>
      </div>

      {can('proposals.view') && (
        <Panel title="Proposals" padded={false} className="mt-6">
          <QueryState query={proposals} skeleton="h-24">
            {(rows) => (
              <DataTable
                rows={rows}
                caption="Proposals"
                rowKey={(p) => p.id}
                rowLink={(p) => ({ to: '/proposals/$proposalId', params: { proposalId: p.id } })}
                empty="No proposals yet."
                columns={[
                  { key: 'no', header: 'Proposal', cell: (p) => p.proposal_no },
                  { key: 'product', header: 'Product', cell: (p) => productName(p.product_code) },
                  { key: 'subject', header: 'Insured', cell: (p) => p.insured_subject ?? '—' },
                  { key: 'status', header: 'Status', cell: (p) => <ProposalBadge status={p.status} /> },
                  { key: 'total', header: 'Amount', cell: (p) => ghs(p.total ?? p.premium), numeric: true },
                  { key: 'updated', header: 'Updated', cell: (p) => formatWhen(p.updated_at) },
                ]}
              />
            )}
          </QueryState>
        </Panel>
      )}

      {can('policies.view') && (
        <Panel title="Policies & certificates" padded={false} className="mt-6">
          <QueryState query={policies} skeleton="h-24">
            {(rows) => (
              <DataTable
                rows={rows}
                caption="Policies"
                rowKey={(p) => p.id}
                rowLink={(p) => ({ to: '/policies/$policyId', params: { policyId: p.id } })}
                empty="No policies yet."
                columns={[
                  { key: 'no', header: 'Policy', cell: (p) => p.policy_no },
                  { key: 'cert', header: 'Certificate', cell: (p) => p.certificate_no },
                  { key: 'cover', header: 'Cover', cell: (p) => p.cover_title },
                  { key: 'subject', header: 'Insured', cell: (p) => p.insured_subject ?? '—' },
                  { key: 'expires', header: 'Expires', cell: (p) => formatDay(p.expires_on) },
                  { key: 'status', header: 'Status', cell: (p) => <PolicyBadge status={p.status} /> },
                ]}
              />
            )}
          </QueryState>
        </Panel>
      )}

      {can('claims.view') && <ClaimsPanel filter={{ customerId: c.id }} query={claims} className="mt-6" />}

      {can('policies.view') && (
        <Panel title="Payments" padded={false} className="mt-6">
          <QueryState query={payments} skeleton="h-24">
            {(rows) => (
              <DataTable
                rows={rows}
                caption="Payments"
                rowKey={(p) => p.id}
                empty="No payments yet."
                columns={[
                  { key: 'ref', header: 'Reference', cell: (p) => p.reference },
                  { key: 'proposal', header: 'Proposal', cell: (p) => p.proposal_no ?? '—' },
                  { key: 'method', header: 'Method', cell: (p) => paymentMethod(p.method, p.network) },
                  { key: 'account', header: 'Account', cell: (p) => p.masked_account ?? '—' },
                  { key: 'amount', header: 'Amount', cell: (p) => ghs(p.amount), numeric: true },
                  { key: 'status', header: 'Status', cell: (p) => <PaymentBadge status={p.status} /> },
                  { key: 'when', header: 'Time', cell: (p) => formatWhen(p.completed_at ?? p.created_at) },
                ]}
              />
            )}
          </QueryState>
        </Panel>
      )}

      <CustomerHistory proposals={proposals.data ?? []} policies={policies.data ?? []} c={c} />
    </>
  );
}

/** A simple, newest-first record of what happened on the account. */
function CustomerHistory({
  c,
  proposals,
  policies,
}: {
  c: CustomerRow;
  proposals: {
    proposal_no: string;
    created_at: string;
    submitted_at?: string | null;
    product_code: string;
  }[];
  policies: { policy_no: string; issued_at: string; status: string }[];
}) {
  const items = [
    { at: c.created_at, text: 'Signed in for the first time and created an account' },
    ...proposals.flatMap((p) => [
      { at: p.created_at, text: `Started proposal ${p.proposal_no} (${productName(p.product_code)})` },
      ...(p.submitted_at ? [{ at: p.submitted_at, text: `Signed and sent proposal ${p.proposal_no}` }] : []),
    ]),
    ...policies.map((p) => ({ at: p.issued_at, text: `Policy ${p.policy_no} issued` })),
    ...(c.identity_checked_at
      ? [
          {
            at: c.identity_checked_at,
            text: `Identity check: ${IDENTITY_STATUS[c.identity_status ?? 'unverified']?.label}`,
          },
        ]
      : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Panel title="History" className="mt-6">
      <ol className="flex flex-col gap-3">
        {items.map((i, n) => (
          <li key={n} className="flex flex-col gap-0.5 border-l-2 border-border pl-3 sm:flex-row sm:gap-4">
            <span className="shrink-0 text-[13px] text-muted sm:w-44">{formatWhen(i.at)}</span>
            <span className="text-[15px]">{i.text}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
