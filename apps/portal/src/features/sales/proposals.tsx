// Sales › Proposals: the review queue and one proposal (form, documents, price, history).
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { formById, productByCode, PRODUCTS, type Answers, type Quote } from '@serene/proposals';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Button, Spinner, TextField } from '../../ui/controls';
import { IconDownload } from '../../ui/icons';
import { TextActionDialog } from '../cases/ui';
import { ConfirmDialog, Tabs } from '../config/shared';
import {
  useCustomer,
  useProposal,
  useProposalEvents,
  useProposalFiles,
  useProposals,
  useSalesAction,
  useSalesSettings,
  useSignedUrl,
  type ProposalFileRow,
  type ProposalRow,
} from './api';
import { renderProposal } from './documents';
import { useSignedUrls } from './files';
import {
  computeQuote,
  formatDay,
  formatWhen,
  ghs,
  humanise,
  isProposalTab,
  matchesSearch,
  productName,
  proposalStatus,
  PROPOSAL_TABS,
  round2,
  sortBy,
  tabStatuses,
  taxesFromRates,
  type ProposalTab,
} from './format';
import {
  BackLink,
  DataTable,
  DateInput,
  DetailList,
  DocumentGrid,
  ErrorNote,
  FilterSelect,
  IdentityBadge,
  Panel,
  ProposalBadge,
  QueryState,
  saveBytes,
  SearchBox,
  type Column,
  type SortState,
} from './ui';

const FormView = lazy(() => import('./form-view').then((m) => ({ default: m.ProposalFormView })));

const COLUMNS: Column<ProposalRow>[] = [
  { key: 'no', header: 'Proposal', cell: (p) => p.proposal_no, sort: (p) => p.proposal_no },
  {
    key: 'customer',
    header: 'Customer',
    cell: (p) => p.customer_name ?? p.customer_no ?? '—',
    sort: (p) => p.customer_name,
  },
  {
    key: 'product',
    header: 'Product',
    cell: (p) => productName(p.product_code),
    sort: (p) => productName(p.product_code),
  },
  {
    key: 'subject',
    header: 'Insured',
    cell: (p) => p.insured_subject ?? '—',
    sort: (p) => p.insured_subject,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (p) => <ProposalBadge status={p.status} />,
    sort: (p) => p.status,
  },
  {
    key: 'amount',
    header: 'Amount',
    cell: (p) => ghs(p.total ?? p.premium),
    sort: (p) => Number(p.total ?? p.premium ?? 0),
    numeric: true,
  },
  { key: 'sent', header: 'Sent', cell: (p) => formatWhen(p.submitted_at), sort: (p) => p.submitted_at },
  { key: 'updated', header: 'Updated', cell: (p) => formatWhen(p.updated_at), sort: (p) => p.updated_at },
];

export function ProposalsPage() {
  const search = useSearch({ strict: false }) as { tab?: string };
  const tab: ProposalTab = isProposalTab(search.tab) ? search.tab : 'review';
  const [product, setProduct] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'updated', dir: tab === 'review' ? 'asc' : 'desc' });
  const list = useProposals({
    statuses: tabStatuses(tab),
    product: product || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const visible = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const rows = (list.data ?? []).filter((p) =>
      matchesSearch(q, p.proposal_no, p.customer_name, p.customer_no, p.insured_subject),
    );
    return col?.sort ? sortBy(rows, col.sort, sort.dir) : rows;
  }, [list.data, q, sort]);

  return (
    <>
      <PageHeader
        title="Proposals"
        subtitle="Proposal forms customers filled in online. Review, price or decline the ones waiting for you."
      />
      <nav
        aria-label="Proposal status"
        className="-mt-2 mb-5 overflow-x-auto border-b border-border md:-mt-4"
      >
        <ul className="flex gap-1">
          {PROPOSAL_TABS.map((t) => (
            <li key={t.key} className="shrink-0">
              <Link
                to="/proposals"
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
      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <SearchBox
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Proposal number, customer or vehicle"
          />
          <FilterSelect label="Product" value={product} onChange={setProduct}>
            <option value="">All products</option>
            {PRODUCTS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <DateInput label="Updated from" value={from} max={to || undefined} onChange={setFrom} />
          <DateInput label="Updated to" value={to} min={from || undefined} onChange={setTo} />
          {(product || from || to) && (
            <Button
              variant="ghost"
              className="h-11"
              onClick={() => {
                setProduct('');
                setFrom('');
                setTo('');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        <QueryState query={list}>
          {() => (
            <>
              <p className="px-4 pt-3 text-[13px] text-muted" aria-live="polite">
                {visible.length} proposal{visible.length === 1 ? '' : 's'}
              </p>
              <DataTable
                rows={visible}
                columns={COLUMNS}
                rowKey={(p) => p.id}
                rowLink={(p) => ({ to: '/proposals/$proposalId', params: { proposalId: p.id } })}
                caption="Proposals"
                sort={sort}
                onSort={setSort}
                empty={tab === 'review' ? 'Nothing is waiting for review.' : 'No proposals match.'}
              />
            </>
          )}
        </QueryState>
      </Panel>
    </>
  );
}

// ---- Detail ------------------------------------------------------------------------------

export function ProposalDetailPage() {
  const { proposalId } = useParams({ strict: false }) as { proposalId: string };
  const proposal = useProposal(proposalId);
  return (
    <>
      <BackLink to="/proposals">All proposals</BackLink>
      <QueryState query={proposal}>
        {(p) =>
          p ? (
            <ProposalDetail p={p} />
          ) : (
            <Alert tone="info" title="Proposal not found">
              The link may be out of date.
            </Alert>
          )
        }
      </QueryState>
    </>
  );
}

const QUOTABLE = ['submitted', 'under_review', 'quoted', 'expired'];
const INFO_OK = ['submitted', 'under_review'];
const DECLINE_OK = ['submitted', 'under_review', 'info_requested', 'quoted', 'expired'];
const CANCEL_OK = ['draft', 'submitted', 'under_review', 'info_requested', 'quoted', 'expired'];

function ProposalDetail({ p }: { p: ProposalRow }) {
  const { can, supabase } = useSession();
  const actions = useSalesAction();
  const files = useProposalFiles({ proposalId: p.id });
  const customer = useCustomer(p.customer_id);
  const [tab, setTab] = useState('form');
  const [dialog, setDialog] = useState<'info' | 'decline' | 'cancel' | null>(null);
  const [busyDoc, setBusyDoc] = useState<'pdf' | 'docx' | null>(null);
  const [docError, setDocError] = useState<unknown>(null);
  const product = productByCode(p.product_code);
  const review = can('proposals.review');
  const identity = customer.data?.identity_status ?? null;

  const download = async (kind: 'pdf' | 'docx') => {
    setBusyDoc(kind);
    setDocError(null);
    try {
      const doc = await renderProposal(kind, supabase, p, files.data ?? []);
      saveBytes(doc.bytes, doc.name, doc.type);
    } catch (e) {
      setDocError(e);
    } finally {
      setBusyDoc(null);
    }
  };

  return (
    <>
      <PageHeader
        title={p.proposal_no}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ProposalBadge status={p.status} />
            {product?.name ?? p.product_code}
            {product && (
              <span className="text-muted">
                · {product.purchase === 'instant' ? 'Instant price' : 'Priced by an underwriter'}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" busy={busyDoc === 'pdf'} onClick={() => void download('pdf')}>
              <IconDownload size={18} /> Download PDF
            </Button>
            <Button variant="secondary" busy={busyDoc === 'docx'} onClick={() => void download('docx')}>
              <IconDownload size={18} /> Download Word
            </Button>
          </>
        }
      />
      <div className="mb-6 flex flex-col gap-3" aria-live="polite">
        {docError ? <ErrorNote error={docError} /> : null}
        {customer.data && identity !== 'verified' && (
          <Alert tone="warning" title="Customer’s identity not verified yet">
            <span className="inline-flex flex-wrap items-center gap-2">
              Identity check: <IdentityBadge status={identity} />
              <Link
                to="/customers/$customerId"
                params={{ customerId: p.customer_id } as never}
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                Check it on the customer’s record
              </Link>
            </span>
          </Alert>
        )}
        {p.staff_message && ['info_requested', 'declined', 'cancelled'].includes(p.status) && (
          <Alert tone="info" title="Message sent to the customer">
            {p.staff_message}
          </Alert>
        )}
        {p.refer_reasons &&
          p.refer_reasons.length > 0 &&
          ['submitted', 'under_review'].includes(p.status) && (
            <Alert tone="info" title="Why this needs an underwriter">
              <ul className="list-disc pl-5">
                {p.refer_reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Alert>
          )}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Summary">
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
              { label: 'Insured', value: p.insured_subject },
              {
                label: 'Cover',
                value: p.cover_start ? `${formatDay(p.cover_start)} to ${formatDay(p.cover_end)}` : null,
              },
              { label: 'Sum insured', value: p.sum_insured ? ghs(p.sum_insured) : null },
              { label: 'Amount payable', value: p.total ? ghs(p.total) : null },
              { label: 'Signed and sent', value: p.submitted_at ? formatWhen(p.submitted_at) : 'Not yet' },
              { label: 'Last updated', value: formatWhen(p.updated_at) },
            ]}
          />
        </Panel>
        {review && (
          <Panel title="Actions">
            <div className="flex flex-col gap-3">
              {p.status === 'submitted' && (
                <Button busy={actions.review.isPending} onClick={() => actions.review.mutate(p.id)}>
                  Start review
                </Button>
              )}
              {QUOTABLE.includes(p.status) && (
                <Button
                  variant={p.status === 'submitted' ? 'secondary' : 'primary'}
                  onClick={() => setTab('quote')}
                >
                  {p.status === 'quoted' ? 'Change the price' : 'Set the price'}
                </Button>
              )}
              {INFO_OK.includes(p.status) && (
                <Button variant="secondary" onClick={() => setDialog('info')}>
                  Ask the customer for information
                </Button>
              )}
              {DECLINE_OK.includes(p.status) && (
                <Button variant="secondary" onClick={() => setDialog('decline')}>
                  Decline
                </Button>
              )}
              {CANCEL_OK.includes(p.status) && (
                <Button variant="ghost" onClick={() => setDialog('cancel')}>
                  Cancel proposal
                </Button>
              )}
              {!QUOTABLE.includes(p.status) && !CANCEL_OK.includes(p.status) && (
                <p className="text-[15px] text-secondary">
                  No actions are needed for a proposal in this state.
                </p>
              )}
              <ErrorNote error={actions.review.error} />
            </div>
          </Panel>
        )}
      </div>

      <Tabs
        label="Proposal"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'form', label: 'Form', content: <FormTab p={p} files={files.data ?? []} /> },
          {
            value: 'documents',
            label: `Documents${files.data ? ` (${files.data.length})` : ''}`,
            content: <DocumentsTab files={files} />,
          },
          { value: 'quote', label: 'Price', content: <QuoteTab p={p} /> },
          { value: 'history', label: 'History', content: <HistoryTab id={p.id} /> },
        ]}
      />

      <TextActionDialog
        open={dialog === 'info'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Ask the customer for information"
        description="The proposal goes back to the customer, who can change their answers and send it again."
        label="Message to the customer"
        minLength={5}
        confirmLabel="Send to the customer"
        onConfirm={(message) => actions.requestInfo.mutateAsync({ id: p.id, message })}
      />
      <TextActionDialog
        open={dialog === 'decline'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Decline this proposal"
        description="The customer is told the proposal was declined, with your reason. This can’t be undone."
        label="Reason, as the customer will read it"
        minLength={5}
        danger
        confirmLabel="Decline proposal"
        onConfirm={(reason) => actions.decline.mutateAsync({ id: p.id, reason })}
      />
      <TextActionDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Cancel this proposal"
        description="Use this when the customer asks to withdraw. Any payment waiting for approval is stopped."
        label="Reason"
        minLength={5}
        danger
        confirmLabel="Cancel proposal"
        onConfirm={(reason) => actions.cancelProposal.mutateAsync({ id: p.id, reason })}
      />
    </>
  );
}

function FormTab({ p, files }: { p: ProposalRow; files: ProposalFileRow[] }) {
  const def = formById(p.form_id);
  const sig = useSignedUrl(p.signature?.imagePath);
  if (!def) {
    return (
      <Alert tone="warning" title="This form can’t be shown">
        The form “{p.form_id}” isn’t in this version of the portal. Download the PDF instead.
      </Alert>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center p-10">
          <Spinner label="Loading the form" />
        </div>
      }
    >
      {def.version !== p.form_version && (
        <div className="mb-4">
          <Alert tone="info">
            This proposal was filled in on version {p.form_version} of the form; it is shown with today’s
            questions (version {def.version}).
          </Alert>
        </div>
      )}
      <FormView
        def={def}
        answers={(p.answers ?? {}) as Answers}
        files={files.map((f) => ({ id: f.id, name: f.original_name ?? f.kind, fieldId: f.field_id }))}
        {...(p.signature?.signedName ? { signature: p.signature } : {})}
        {...(sig.data ? { signatureUrl: sig.data } : {})}
        {...(p.submitted_at ? { submittedAt: p.submitted_at } : {})}
      />
    </Suspense>
  );
}

function DocumentsTab({ files }: { files: ReturnType<typeof useProposalFiles> }) {
  const urls = useSignedUrls((files.data ?? []).map((f) => f.storage_path));
  return (
    <Panel>
      <QueryState query={files} skeleton="h-32">
        {(list) => (
          <DocumentGrid
            empty="The customer hasn’t attached any documents."
            items={list.map((f) => ({
              id: f.id,
              name: f.original_name ?? f.kind,
              mime: f.mime,
              url: urls[f.storage_path],
              caption: `${humanise(f.kind)}${f.original_name ? ` · ${f.original_name}` : ''}`,
            }))}
          />
        )}
      </QueryState>
    </Panel>
  );
}

function QuoteLines({ quote }: { quote: Quote }) {
  return (
    <table className="w-full max-w-lg text-[15px]">
      <caption className="sr-only">Price</caption>
      <tbody>
        {quote.lines.map((l, i) => (
          <tr key={`l${i}`} className="border-b border-border-subtle">
            <th scope="row" className="py-2 pr-4 text-left font-normal text-secondary">
              {l.label}
            </th>
            <td className="py-2 text-right tabular-nums">{ghs(l.amount)}</td>
          </tr>
        ))}
        <tr className="border-b border-border-subtle">
          <th scope="row" className="py-2 pr-4 text-left font-medium">
            Premium
          </th>
          <td className="py-2 text-right font-medium tabular-nums">{ghs(quote.premium)}</td>
        </tr>
        {quote.taxes.map((l, i) => (
          <tr key={`t${i}`} className="border-b border-border-subtle">
            <th scope="row" className="py-2 pr-4 text-left font-normal text-secondary">
              {l.label}
            </th>
            <td className="py-2 text-right tabular-nums">{ghs(l.amount)}</td>
          </tr>
        ))}
        <tr>
          <th scope="row" className="py-2 pr-4 text-left text-[17px] font-semibold">
            Total to pay
          </th>
          <td className="py-2 text-right text-[17px] font-semibold tabular-nums">{ghs(quote.total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function QuoteTab({ p }: { p: ProposalRow }) {
  const { can } = useSession();
  const editable = can('proposals.review') && QUOTABLE.includes(p.status);
  return (
    <div className="flex flex-col gap-6">
      {p.quote ? (
        <Panel title={p.status === 'quoted' ? 'Price sent to the customer' : 'Price'}>
          <QuoteLines quote={p.quote} />
          <p className="mt-4 text-[14px] text-secondary">
            {p.quote.source === 'underwriter'
              ? 'Set by an underwriter'
              : 'Worked out automatically from the rates'}
            {p.quote.indicative ? ' · indicative, to be confirmed by underwriting' : ''} · valid until{' '}
            {formatDay(p.quote.validUntil)}
          </p>
          {p.quote.underwriterNote && (
            <p className="mt-2 text-[15px]">
              <span className="text-secondary">Note to the customer:</span> {p.quote.underwriterNote}
            </p>
          )}
        </Panel>
      ) : (
        !editable && (
          <Panel>
            <p className="text-[15px] text-secondary">No price yet.</p>
          </Panel>
        )
      )}
      {editable && <QuoteEditor p={p} />}
    </div>
  );
}

function QuoteEditor({ p }: { p: ProposalRow }) {
  const settings = useSalesSettings();
  const actions = useSalesAction();
  const taxes = taxesFromRates(settings.data?.sales_rates?.value);
  const defaultDays = Number(settings.data?.sales_quote_validity_days?.value ?? 30) || 30;
  const [premium, setPremium] = useState(p.quote?.premium ? String(p.quote.premium) : '');
  const [lines, setLines] = useState<{ label: string; amount: string }[]>(
    p.quote?.source === 'underwriter'
      ? p.quote.lines.map((l) => ({ label: l.label, amount: String(l.amount) }))
      : [],
  );
  const [days, setDays] = useState('');
  const [note, setNote] = useState(p.quote?.underwriterNote ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  const premiumNum = Number(premium);
  const totals = computeQuote(Number.isFinite(premiumNum) ? premiumNum : 0, p.product_code, taxes);
  const lineSum = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const validDays = days ? Number(days) : Math.min(defaultDays, 90);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!premium || !Number.isFinite(premiumNum) || premiumNum <= 0)
      e.premium = 'Enter a premium above zero.';
    lines.forEach((l, i) => {
      if (!l.label.trim()) e[`label${i}`] = 'Give this line a name.';
      if (!l.amount || !Number.isFinite(Number(l.amount))) e[`amount${i}`] = 'Enter an amount.';
    });
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 90) e.days = 'Between 1 and 90 days.';
    if (note.length > 1000) e.note = 'Keep the note under 1,000 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const send = () =>
    actions.quote.mutate(
      {
        id: p.id,
        premium: totals.premium,
        lines: lines.map((l) => ({ label: l.label.trim(), amount: round2(Number(l.amount)) })),
        taxes: totals.taxes,
        validityDays: validDays,
        note: note.trim(),
      },
      {
        onSuccess: () => {
          setConfirm(false);
          setSaved(true);
        },
      },
    );

  return (
    <Panel title={p.quote ? 'Change the price' : 'Set the price'}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <TextField
            label="Premium (GH₵, before taxes)"
            inputMode="decimal"
            value={premium}
            onChange={(e) => setPremium(e.target.value.replace(/[^\d.]/g, ''))}
            error={errors.premium}
          />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[14px] font-medium">
              How the premium is made up <span className="font-normal text-muted">(optional)</span>
            </legend>
            {lines.map((l, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-md border border-border-subtle p-3 sm:flex-row sm:items-start"
              >
                <div className="flex-1">
                  <TextField
                    label={`Line ${i + 1}`}
                    value={l.label}
                    maxLength={120}
                    placeholder="e.g. Buildings at 0.15%"
                    onChange={(e) =>
                      setLines((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))
                    }
                    error={errors[`label${i}`]}
                  />
                </div>
                <div className="sm:w-40">
                  <TextField
                    label="Amount (GH₵)"
                    inputMode="decimal"
                    value={l.amount}
                    onChange={(e) =>
                      setLines((x) =>
                        x.map((y, j) =>
                          j === i ? { ...y, amount: e.target.value.replace(/[^\d.-]/g, '') } : y,
                        ),
                      )
                    }
                    error={errors[`amount${i}`]}
                  />
                </div>
                <Button
                  variant="ghost"
                  className="sm:mt-7"
                  onClick={() => setLines((x) => x.filter((_, j) => j !== i))}
                  aria-label={`Remove line ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button variant="secondary" onClick={() => setLines((x) => [...x, { label: '', amount: '' }])}>
                Add a line
              </Button>
            </div>
            {lines.length > 0 && Math.abs(lineSum - totals.premium) > 0.009 && (
              <Alert tone="warning">
                The lines add up to {ghs(lineSum)}, not the premium of {ghs(totals.premium)}.
              </Alert>
            )}
          </fieldset>
          <TextField
            label="Price valid for (days)"
            inputMode="numeric"
            value={days}
            placeholder={String(Math.min(defaultDays, 90))}
            helper={`Leave blank for ${Math.min(defaultDays, 90)} days.`}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
            error={errors.days}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="quote-note" className="text-[14px] font-medium">
              Note to the customer <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="quote-note"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-sm border border-border-strong bg-white px-4 py-3 text-[16px] outline-none hover:border-ink focus-visible:border-brand"
            />
            {errors.note && <p className="text-[14px] text-danger">{errors.note}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-subtle p-4">
            <h3 className="mb-2 text-[15px] font-semibold">What the customer will pay</h3>
            <QuoteLines
              quote={{
                currency: 'GHS',
                premium: totals.premium,
                lines: [],
                taxes: totals.taxes,
                total: totals.total,
                indicative: false,
                notes: [],
                validUntil: '',
                source: 'underwriter',
              }}
            />
            <p className="mt-3 text-[13px] text-secondary">
              {totals.taxes.length
                ? 'Taxes are added automatically: VAT, NHIL and GETFund levy.'
                : 'Motor insurance carries no VAT, NHIL or GETFund levy.'}
            </p>
          </div>
          {saved && <Alert tone="success">The price was sent. The customer can now pay online.</Alert>}
          <ErrorNote error={actions.quote.error} />
          <div>
            <Button onClick={() => validate() && setConfirm(true)}>Send the price to the customer</Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Send this price?"
        confirmLabel="Send price"
        tone="primary"
        busy={actions.quote.isPending}
        error={actions.quote.error}
        onConfirm={send}
      >
        <p className="text-[15px]">
          The customer will be asked to pay <strong>{ghs(totals.total)}</strong>. The price is valid for{' '}
          {validDays} day{validDays === 1 ? '' : 's'}.
        </p>
      </ConfirmDialog>
    </Panel>
  );
}

function HistoryTab({ id }: { id: string }) {
  const events = useProposalEvents(id);
  return (
    <Panel>
      <QueryState query={events} skeleton="h-32">
        {(list) =>
          list.length === 0 ? (
            <p className="text-[15px] text-secondary">No history yet.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {[...list].reverse().map((e) => (
                <li key={String(e.id)} className="border-l-2 border-border pl-4">
                  <p className="text-[13px] text-muted">
                    {formatWhen(e.at)} ·{' '}
                    {e.actor_type === 'customer'
                      ? 'Customer'
                      : e.actor_type === 'system'
                        ? 'System'
                        : (e.actor_name ?? 'Staff')}
                  </p>
                  <p className="text-[15px] font-medium">
                    {e.event === 'policy_cancelled'
                      ? 'Policy cancelled'
                      : e.to_status
                        ? proposalStatus(e.to_status).label
                        : humanise(e.event ?? '')}
                  </p>
                  {e.note && (
                    <p className="mt-0.5 whitespace-pre-wrap text-[15px] text-secondary">{e.note}</p>
                  )}
                </li>
              ))}
            </ol>
          )
        }
      </QueryState>
    </Panel>
  );
}
