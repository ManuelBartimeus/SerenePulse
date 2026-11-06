// Sales › Policies & certificates, and Payments.
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Button, Spinner } from '../../ui/controls';
import { IconDownload } from '../../ui/icons';
import { TextActionDialog } from '../cases/ui';
import { StatTile } from '../analytics/ui';
import {
  useClaims,
  usePayments,
  usePolicies,
  usePolicy,
  useSalesAction,
  type PaymentRow,
  type PolicyRow,
} from './api';
import { ClaimsPanel } from './claims';
import { renderCertificate } from './documents';
import {
  formatDay,
  formatWhen,
  ghs,
  isoDay,
  matchesSearch,
  paymentMethod,
  paymentTotals,
  periodStart,
  productName,
  sortBy,
  PAYMENT_STATUS,
  POLICY_STATUS,
} from './format';
import {
  BackLink,
  DataTable,
  DateInput,
  DetailList,
  ErrorNote,
  FilterSelect,
  Panel,
  PaymentBadge,
  PolicyBadge,
  QueryState,
  saveBytes,
  SearchBox,
  type Column,
  type SortState,
} from './ui';

const POLICY_COLUMNS: Column<PolicyRow>[] = [
  { key: 'policy', header: 'Policy', cell: (p) => p.policy_no, sort: (p) => p.policy_no },
  { key: 'cert', header: 'Certificate', cell: (p) => p.certificate_no, sort: (p) => p.certificate_no },
  {
    key: 'customer',
    header: 'Customer',
    cell: (p) => p.customer_name ?? p.customer_no ?? '—',
    sort: (p) => p.customer_name,
  },
  {
    key: 'cover',
    header: 'Product / cover',
    cell: (p) => (
      <span>
        {productName(p.product_code)}
        <span className="block text-[13px] text-muted">{p.cover_title}</span>
      </span>
    ),
    sort: (p) => p.cover_title,
  },
  {
    key: 'subject',
    header: 'Insured',
    cell: (p) => p.insured_subject ?? '—',
    sort: (p) => p.insured_subject,
  },
  { key: 'start', header: 'Starts', cell: (p) => formatDay(p.starts_on), sort: (p) => p.starts_on },
  { key: 'expiry', header: 'Expires', cell: (p) => formatDay(p.expires_on), sort: (p) => p.expires_on },
  { key: 'status', header: 'Status', cell: (p) => <PolicyBadge status={p.status} />, sort: (p) => p.status },
];

export function PoliciesPage() {
  const list = usePolicies();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'start', dir: 'desc' });
  const visible = useMemo(() => {
    const col = POLICY_COLUMNS.find((c) => c.key === sort.key);
    const rows = (list.data ?? []).filter(
      (p) =>
        (!status || p.status === status) &&
        matchesSearch(q, p.policy_no, p.certificate_no, p.customer_name, p.customer_no, p.insured_subject),
    );
    return col?.sort ? sortBy(rows, col.sort, sort.dir) : rows;
  }, [list.data, q, status, sort]);
  return (
    <>
      <PageHeader
        title="Policies & certificates"
        subtitle="Every policy issued online, with the certificate of insurance the customer received."
      />
      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <SearchBox
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Policy or certificate number, customer, vehicle"
          />
          <FilterSelect label="Status" value={status} onChange={setStatus}>
            <option value="">All policies</option>
            {['active', 'expired', 'cancelled'].map((k) => (
              <option key={k} value={k}>
                {POLICY_STATUS[k]?.label}
              </option>
            ))}
          </FilterSelect>
        </div>
        <QueryState query={list}>
          {() => (
            <>
              <p className="px-4 pt-3 text-[13px] text-muted" aria-live="polite">
                {visible.length} polic{visible.length === 1 ? 'y' : 'ies'}
              </p>
              <DataTable
                rows={visible}
                columns={POLICY_COLUMNS}
                rowKey={(p) => p.id}
                rowLink={(p) => ({ to: '/policies/$policyId', params: { policyId: p.id } })}
                caption="Policies"
                sort={sort}
                onSort={setSort}
                empty={q || status ? 'No policy matches.' : 'No policies issued yet.'}
              />
            </>
          )}
        </QueryState>
      </Panel>
    </>
  );
}

export function PolicyDetailPage() {
  const { policyId } = useParams({ strict: false }) as { policyId: string };
  const policy = usePolicy(policyId);
  return (
    <>
      <BackLink to="/policies">All policies</BackLink>
      <QueryState query={policy}>
        {(p) =>
          p ? (
            <PolicyDetail p={p} />
          ) : (
            <Alert tone="info" title="Policy not found">
              The link may be out of date.
            </Alert>
          )
        }
      </QueryState>
    </>
  );
}

/** The issued certificate, rendered from its stored snapshot, previewed and downloadable. */
function CertificatePreview({ p }: { p: PolicyRow }) {
  const { supabase } = useSession();
  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<unknown>(null);
  // The signature frozen on the policy when it was issued, never today's setting.
  const sigPath = p.signature_path ?? undefined;
  const ready = true;

  useEffect(() => {
    if (!ready || !p.certificate) return;
    let revoked = false;
    let objectUrl: string | null = null;
    renderCertificate(supabase, p.certificate, sigPath || null)
      .then((b) => {
        if (revoked) return;
        setBytes(b);
        objectUrl = URL.createObjectURL(new Blob([b as BlobPart], { type: 'application/pdf' }));
        setUrl(objectUrl);
      })
      .catch((e) => !revoked && setError(e));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ready, p.certificate, sigPath, supabase]);

  if (!p.certificate) {
    return <Alert tone="warning">This policy has no certificate record.</Alert>;
  }
  return (
    <Panel
      title="Certificate of insurance"
      actions={
        <Button
          variant="secondary"
          disabled={!bytes}
          onClick={() => bytes && saveBytes(bytes, `Certificate ${p.certificate_no}.pdf`, 'application/pdf')}
        >
          <IconDownload size={18} /> Download PDF
        </Button>
      }
    >
      {error ? (
        <ErrorNote error={error} />
      ) : url ? (
        <object
          data={url}
          type="application/pdf"
          aria-label={`Certificate ${p.certificate_no}`}
          className="h-[70vh] min-h-[480px] w-full rounded-md border border-border-subtle"
        >
          <p className="p-4 text-[15px]">
            Your browser can’t show the certificate here.{' '}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand underline"
            >
              Open it in a new tab
            </a>
            .
          </p>
        </object>
      ) : (
        <div className="grid h-64 place-items-center">
          <Spinner label="Preparing the certificate" />
        </div>
      )}
    </Panel>
  );
}

function PolicyDetail({ p }: { p: PolicyRow }) {
  const { can } = useSession();
  const actions = useSalesAction();
  const claims = useClaims({ policyId: p.id });
  const [cancel, setCancel] = useState(false);
  return (
    <>
      <PageHeader
        title={p.policy_no}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PolicyBadge status={p.status} /> {p.cover_title} · certificate {p.certificate_no}
          </span>
        }
        actions={
          can('policies.manage') &&
          p.status !== 'cancelled' && (
            <Button variant="secondary" onClick={() => setCancel(true)}>
              Cancel policy
            </Button>
          )
        }
      />
      {p.status === 'cancelled' && (
        <div className="mb-6">
          <Alert tone="warning" title={`Cancelled ${p.cancelled_at ? formatWhen(p.cancelled_at) : ''}`}>
            {p.cancel_reason}
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Policy">
            <DetailList
              items={[
                {
                  label: 'Customer',
                  value: (
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: p.customer_id } as never}
                      className="font-medium text-brand underline-offset-2 hover:underline"
                    >
                      {p.customer_name ?? p.customer_no}
                    </Link>
                  ),
                },
                { label: 'Customer no.', value: p.customer_no },
                { label: 'Product', value: productName(p.product_code) },
                { label: 'Cover', value: p.cover_title },
                { label: 'Insured', value: p.insured_subject },
                { label: 'Starts', value: formatDay(p.starts_on) },
                { label: 'Expires', value: formatDay(p.expires_on) },
                { label: 'Premium', value: ghs(p.premium) },
                { label: 'Sum insured', value: p.sum_insured ? ghs(p.sum_insured) : null },
                { label: 'Issued', value: formatWhen(p.issued_at) },
                {
                  label: 'Proposal',
                  value: p.proposal_id ? (
                    <Link
                      to="/proposals/$proposalId"
                      params={{ proposalId: p.proposal_id } as never}
                      className="font-medium text-brand underline-offset-2 hover:underline"
                    >
                      {p.proposal_no ?? 'Open proposal'}
                    </Link>
                  ) : null,
                },
              ]}
            />
          </Panel>
          {can('claims.view') && <ClaimsPanel filter={{ policyId: p.id }} query={claims} />}
        </div>
        <CertificatePreview p={p} />
      </div>
      <TextActionDialog
        open={cancel}
        onOpenChange={setCancel}
        title="Cancel this policy"
        description="The certificate stops being valid straight away, and the public certificate check will show it as cancelled. This can’t be undone here."
        label="Reason"
        minLength={5}
        danger
        confirmLabel="Cancel policy"
        onConfirm={(reason) => actions.cancelPolicy.mutateAsync({ id: p.id, reason })}
      />
    </>
  );
}

// ---- Payments ----------------------------------------------------------------------------

const PAYMENT_COLUMNS: Column<PaymentRow>[] = [
  { key: 'ref', header: 'Reference', cell: (p) => p.reference, sort: (p) => p.reference },
  { key: 'customer', header: 'Customer', cell: (p) => p.customer_name ?? '—', sort: (p) => p.customer_name },
  {
    key: 'proposal',
    header: 'Proposal',
    cell: (p) =>
      p.proposal_id ? (
        <Link
          to="/proposals/$proposalId"
          params={{ proposalId: p.proposal_id } as never}
          className="text-brand underline-offset-2 hover:underline"
        >
          {p.proposal_no ?? 'Open'}
        </Link>
      ) : (
        '—'
      ),
    sort: (p) => p.proposal_no,
  },
  { key: 'method', header: 'Method', cell: (p) => paymentMethod(p.method, p.network), sort: (p) => p.method },
  { key: 'account', header: 'Account', cell: (p) => p.masked_account ?? '—' },
  {
    key: 'amount',
    header: 'Amount',
    cell: (p) => ghs(p.amount),
    sort: (p) => Number(p.amount),
    numeric: true,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (p) => (
      <span>
        <PaymentBadge status={p.status} />
        {p.failure_reason && <span className="mt-1 block text-[12px] text-muted">{p.failure_reason}</span>}
      </span>
    ),
    sort: (p) => p.status,
  },
  {
    key: 'time',
    header: 'Time',
    cell: (p) => formatWhen(p.completed_at ?? p.created_at),
    sort: (p) => p.created_at,
  },
];

export function PaymentsPage() {
  const [from, setFrom] = useState(periodStart('month'));
  const [to, setTo] = useState(isoDay(new Date()));
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'time', dir: 'desc' });
  const list = usePayments({ from: from || undefined, to: to || undefined });
  const filtered = useMemo(
    () =>
      (list.data ?? []).filter(
        (p) =>
          (!status || p.status === status) &&
          matchesSearch(q, p.reference, p.customer_name, p.proposal_no, p.masked_account),
      ),
    [list.data, status, q],
  );
  const visible = useMemo(() => {
    const col = PAYMENT_COLUMNS.find((c) => c.key === sort.key);
    return col?.sort ? sortBy(filtered, col.sort, sort.dir) : filtered;
  }, [filtered, sort]);
  const totals = paymentTotals(list.data ?? []);
  return (
    <>
      <PageHeader title="Payments" subtitle="Premium payments made online, by mobile money or card." />
      <Alert tone="info">
        Payments run in test mode until a payment account is connected; no real money moves yet.
      </Alert>
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Collected"
          value={ghs(totals.collected)}
          footer={<p className="text-secondary">{totals.count} payments</p>}
        />
        <StatTile label="Waiting for customer" value={ghs(totals.pending)} large={false} />
        <StatTile label="Failed" value={ghs(totals.failed)} large={false} />
      </div>
      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <SearchBox label="Search" value={q} onChange={setQ} placeholder="Reference, customer or proposal" />
          <DateInput label="From" value={from} max={to || undefined} onChange={setFrom} />
          <DateInput label="To" value={to} min={from || undefined} onChange={setTo} />
          <FilterSelect label="Status" value={status} onChange={setStatus}>
            <option value="">All payments</option>
            {Object.entries(PAYMENT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </FilterSelect>
        </div>
        <QueryState query={list}>
          {() => (
            <DataTable
              rows={visible}
              columns={PAYMENT_COLUMNS}
              rowKey={(p) => p.id}
              caption="Payments"
              sort={sort}
              onSort={setSort}
              empty="No payments in this period."
            />
          )}
        </QueryState>
      </Panel>
    </>
  );
}
