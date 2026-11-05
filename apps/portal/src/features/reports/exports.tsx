// S-B10 Exports (FR-25, M13) and the auditors' audit-log CSV export (M15).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Button, EmptyState, Spinner, TextField } from '../../ui/controls';
import { FilterBar, useAnalyticsFilters } from '../analytics/filters';
import { PageTabs, REPORT_TABS } from '../cases/page-tabs';
import { functionErrorMessage, useFunctions, type ReportFile } from './api';
import { Check, ErrorBox, FileRow, SelectField, TextArea } from './ui';

interface Created {
  file_id: string;
  rows: number;
  signed_path: string;
  file_name: string;
}

function useMyExports(reportKey: 'responses_export' | 'audit_export') {
  const { supabase, claims } = useSession();
  return useQuery({
    queryKey: ['reports', 'exports', reportKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_files')
        .select('*')
        .eq('report_key', reportKey)
        .eq('requested_by', claims?.sub ?? '')
        .neq('status', 'expired')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as ReportFile[];
    },
  });
}

function RecentExports({
  reportKey,
  title,
}: {
  reportKey: 'responses_export' | 'audit_export';
  title: string;
}) {
  const list = useMyExports(reportKey);
  const fns = useFunctions();
  const dl = useMutation({ mutationFn: (id: string) => fns.download(id) });
  return (
    <section className="mt-6 rounded-lg bg-white" aria-labelledby="recent-exports">
      <h2 id="recent-exports" className="border-b border-border p-4 text-[18px] font-medium">
        Your recent downloads
      </h2>
      <p className="px-4 pt-3 text-[14px] text-secondary">
        Files are kept for 7 days. Each download link works for 15 minutes and is recorded in the audit log.
      </p>
      {dl.isError && (
        <div className="p-4">
          <Alert tone="danger">{functionErrorMessage(dl.error)}</Alert>
        </div>
      )}
      {list.isPending ? (
        <div className="p-4">
          <Spinner label="Loading exports" />
        </div>
      ) : list.isError ? (
        <div className="p-4">
          <ErrorBox error={list.error} />
        </div>
      ) : list.data.length === 0 ? (
        <EmptyState title="No downloads yet">Files you create appear here for 7 days.</EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {list.data.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              title={title}
              busy={dl.isPending && dl.variables === f.id}
              onDownload={(id) => dl.mutate(id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ExportsPage() {
  const { can } = useSession();
  const { rpcFilters, periodText } = useAnalyticsFilters();
  const fns = useFunctions();
  const qc = useQueryClient();
  const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [includePii, setIncludePii] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const create = useMutation({
    mutationFn: () =>
      fns.call<Created>('export', {
        action: 'create',
        kind: 'responses',
        filters: rpcFilters,
        format,
        include_pii: includePii,
        reason: includePii ? reason.trim() : null,
      }),
    onSuccess: (r) => {
      fns.openSigned(r.signed_path, r.file_name);
      qc.invalidateQueries({ queryKey: ['reports', 'exports'] });
    },
  });

  const submit = () => {
    if (includePii && reason.trim().length < 10) {
      setReasonError('Say why this export needs contact details (at least 10 characters).');
      return;
    }
    setReasonError(undefined);
    create.mutate();
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Download customer feedback, schedule regular reports and find the files sent to you."
      />
      <PageTabs tabs={REPORT_TABS} label="Reports" />
      <div className="mb-4">
        <FilterBar />
      </div>
      <section className="rounded-lg bg-white p-4 md:p-6" aria-labelledby="export-settings">
        <h2 id="export-settings" className="text-[18px] font-medium">
          Download customer responses
        </h2>
        <p className="mt-1 text-secondary">
          {periodText}, using the filters above. Customers’ comments are included if you may view them;
          contact details are left out unless you ask for them.
        </p>
        <div className="mt-4 grid gap-4 md:max-w-md">
          <SelectField
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'csv' | 'xlsx')}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </SelectField>
          {can('pii.export') && (
            <>
              <Check
                label="Include contact details"
                hint="Only for customers who asked to be contacted. Your reason is recorded in the audit log."
                checked={includePii}
                onChange={setIncludePii}
              />
              {includePii && (
                <TextArea
                  label="Why do you need contact details?"
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  error={reasonError}
                />
              )}
            </>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button busy={create.isPending} onClick={submit}>
            Download responses
          </Button>
        </div>
        <div aria-live="polite" className="mt-4">
          {create.isPending && (
            <p className="text-secondary">Preparing your file. Large downloads can take up to a minute…</p>
          )}
          {create.isSuccess && (
            <Alert tone="success">
              Your file is downloading. You can download it again below for 7 days.
            </Alert>
          )}
          {create.isError && <Alert tone="danger">{functionErrorMessage(create.error)}</Alert>}
        </div>
      </section>
      <RecentExports reportKey="responses_export" title="Customer responses" />
    </>
  );
}

const ACTION_FILTERS = [
  { value: '', label: 'All events' },
  { value: 'auth.', label: 'Sign-in and passwords' },
  { value: 'export.', label: 'Exports and downloads' },
  { value: 'privacy.', label: 'Data-protection requests' },
  { value: 'pii.', label: 'Contact reveals' },
  { value: 'response.correction', label: 'Branch corrections' },
  { value: 'retention.', label: 'Retention runs' },
  { value: 'public.settings', label: 'Settings changes' },
];

const accraToday = () => new Date().toISOString().slice(0, 10);

export function AuditExportPage() {
  const { can } = useSession();
  const fns = useFunctions();
  const qc = useQueryClient();
  const today = accraToday();
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [prefix, setPrefix] = useState('');
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const invalid = !from || !to || from > to;
  const create = useMutation({
    mutationFn: () =>
      fns.call<Created>('export', {
        action: 'create',
        kind: 'audit',
        format,
        filters: { from, to, ...(prefix ? { action_prefix: prefix } : {}) },
      }),
    onSuccess: (r) => {
      fns.openSigned(r.signed_path, r.file_name);
      qc.invalidateQueries({ queryKey: ['reports', 'exports'] });
    },
  });
  return (
    <>
      <PageHeader
        title="Export the audit log"
        subtitle={
          can('audit.view_all')
            ? 'Every audit event in the period, with its hash so the chain can be checked outside the portal.'
            : 'Configuration and account events in the period. Data-access events need the auditor role.'
        }
      />
      <section className="rounded-lg bg-white p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2 md:max-w-2xl">
          <TextField
            label="From"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            label="To"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            error={invalid ? 'The start date must be on or before the end date.' : undefined}
          />
          <SelectField label="Events" value={prefix} onChange={(e) => setPrefix(e.target.value)}>
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'csv' | 'xlsx')}
          >
            <option value="csv">CSV (.csv)</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </SelectField>
        </div>
        <p className="mt-3 text-[14px] text-secondary">
          Dates are Africa/Accra. The export itself is recorded in the audit log.
        </p>
        <div className="mt-6">
          <Button busy={create.isPending} disabled={invalid} onClick={() => create.mutate()}>
            Export audit log
          </Button>
        </div>
        <div aria-live="polite" className="mt-4">
          {create.isSuccess && <Alert tone="success">The audit log is downloading.</Alert>}
          {create.isError && <Alert tone="danger">{functionErrorMessage(create.error)}</Alert>}
        </div>
      </section>
      <RecentExports reportKey="audit_export" title="Audit log export" />
    </>
  );
}
