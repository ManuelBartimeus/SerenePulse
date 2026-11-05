// S-B11 Scheduled reports (MS-12, D-26) and the report files list.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toUserError } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, EmptyState, Spinner, TextField } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { useCatalogues } from '../analytics/catalogues';
import { PageTabs, REPORT_TABS } from '../cases/page-tabs';
import { functionErrorMessage, useFunctions, type ReportFile } from './api';
import { formatDateTime, nextRunAt, reportInfo, REPORTS, reportLabel, type ReportKey } from './schedule';
import { Check, ErrorBox, FileRow, SelectField } from './ui';

interface Schedule {
  id: string;
  name: string;
  report_key: ReportKey;
  frequency: string;
  filters: { branch_ids?: string[] };
  formats: ('pdf' | 'xlsx')[];
  recipient_user_ids: string[];
  owner_id: string;
  owner_name: string | null;
  next_run_at: string;
  last_run_at: string | null;
  is_active: boolean;
  version: number;
  can_edit: boolean;
  recipients: { user_id: string; display_name: string }[];
}
interface RecipientOption {
  user_id: string;
  display_name: string;
  org_scope: boolean;
  branch_ids: string[];
}

function useHolidays() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['reports', 'holidays'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('holidays').select('holiday_date');
      if (error) throw error;
      return new Set((data as { holiday_date: string }[]).map((h) => h.holiday_date));
    },
  });
}

function ScheduleDialog({
  schedule,
  open,
  onOpenChange,
}: {
  schedule: Schedule | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { supabase, claims } = useSession();
  const qc = useQueryClient();
  const catalogues = useCatalogues();
  const holidays = useHolidays();
  const people = useQuery({
    queryKey: ['reports', 'recipients'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_recipient_options');
      if (error) throw error;
      return data as RecipientOption[];
    },
  });
  const [name, setName] = useState(schedule?.name ?? '');
  const [key, setKey] = useState<ReportKey>(schedule?.report_key ?? 'weekly_branch');
  const [formats, setFormats] = useState<string[]>(schedule?.formats ?? ['pdf', 'xlsx']);
  const [recipients, setRecipients] = useState<string[]>(
    schedule?.recipient_user_ids ?? (claims ? [claims.sub] : []),
  );
  const [branches, setBranches] = useState<string[]>(schedule?.filters.branch_ids ?? []);
  const orgScope = claims?.app_org_scope ?? false;
  const branchOptions = (catalogues.data?.branches ?? []).filter(
    (b) => !b.inactive && (orgScope || claims?.app_branch_ids.includes(b.id)),
  );
  const freq = reportInfo(key);
  const next = holidays.data ? nextRunAt(freq.frequency, new Date(), holidays.data) : null;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('report_schedule_save', {
        p_id: schedule?.id ?? null,
        p_name: name,
        p_report_key: key,
        p_filters: branches.length ? { branch_ids: branches } : {},
        p_formats: formats,
        p_recipient_user_ids: recipients,
        p_is_active: schedule?.is_active ?? true,
        p_expected_version: schedule?.version ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', 'schedules'] });
      onOpenChange(false);
    },
  });
  const toggle = (list: string[], v: string, on: boolean) =>
    on ? [...new Set([...list, v])] : list.filter((x) => x !== v);
  const invalid = !name.trim() || formats.length === 0 || recipients.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={schedule ? 'Edit schedule' : 'New scheduled report'}
      description="Recipients get an in-app notice and an email with a link. Files are never attached."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button busy={save.isPending} disabled={invalid} onClick={() => save.mutate()}>
            Save schedule
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextField label="Name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <SelectField
          label="Report"
          value={key}
          onChange={(e) => setKey(e.target.value as ReportKey)}
          helper={`${freq.when} (Africa/Accra), covering ${freq.covers}.${next ? ` Next run: ${formatDateTime(next)}.` : ''}`}
        >
          {REPORTS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <fieldset>
          <legend className="text-[14px] font-medium">Formats</legend>
          <Check
            label="PDF"
            checked={formats.includes('pdf')}
            onChange={(v) => setFormats((f) => toggle(f, 'pdf', v))}
          />
          <Check
            label="Excel"
            checked={formats.includes('xlsx')}
            onChange={(v) => setFormats((f) => toggle(f, 'xlsx', v))}
          />
        </fieldset>
        <fieldset>
          <legend className="text-[14px] font-medium">Branches</legend>
          <p className="text-[14px] text-secondary">
            {orgScope
              ? 'Leave all unticked for the whole organisation.'
              : 'Leave all unticked for all of your branches.'}
          </p>
          <div className="max-h-48 overflow-y-auto">
            {catalogues.isPending ? (
              <Spinner label="Loading branches" />
            ) : (
              branchOptions.map((b) => (
                <Check
                  key={b.id}
                  label={b.label}
                  checked={branches.includes(b.id)}
                  onChange={(v) => setBranches((l) => toggle(l, b.id, v))}
                />
              ))
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[14px] font-medium">Recipients</legend>
          <p className="text-[14px] text-secondary">
            Portal users with dashboard access only. Branch-based users can only receive reports for their
            branches.
          </p>
          <div className="max-h-56 overflow-y-auto">
            {people.isPending ? (
              <Spinner label="Loading people" />
            ) : people.isError ? (
              <ErrorBox error={people.error} />
            ) : (
              people.data.map((p) => (
                <Check
                  key={p.user_id}
                  label={p.display_name || 'Unnamed user'}
                  hint={p.org_scope ? 'Whole organisation' : `${p.branch_ids.length} branch(es)`}
                  checked={recipients.includes(p.user_id)}
                  onChange={(v) => setRecipients((l) => toggle(l, p.user_id, v))}
                />
              ))
            )}
          </div>
        </fieldset>
        <div aria-live="polite">{save.isError && <ErrorBox error={save.error} />}</div>
      </div>
    </Dialog>
  );
}

export function SchedulesPage() {
  const { supabase, can } = useSession();
  const qc = useQueryClient();
  const fns = useFunctions();
  const [editing, setEditing] = useState<Schedule | null | 'new'>(null);
  const list = useQuery({
    queryKey: ['reports', 'schedules'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_schedule_list');
      if (error) throw error;
      return data as Schedule[];
    },
  });
  const pause = useMutation({
    mutationFn: async (s: Schedule) => {
      const { error } = await supabase.rpc('report_schedule_save', {
        p_id: s.id,
        p_name: s.name,
        p_report_key: s.report_key,
        p_filters: s.filters,
        p_formats: s.formats,
        p_recipient_user_ids: s.recipient_user_ids,
        p_is_active: !s.is_active,
        p_expected_version: s.version,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', 'schedules'] }),
  });
  const runNow = useMutation({
    mutationFn: (s: Schedule) =>
      fns.call<{ run_id: string; files: { status: string }[] }>('generate-report', {
        action: 'run_now',
        schedule_id: s.id,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', 'files'] }),
  });

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Daily, weekly, monthly and quarterly reports in PDF and Excel, sent to colleagues at 07:00."
        actions={
          can('reports.schedule') ? (
            <Button onClick={() => setEditing('new')}>New scheduled report</Button>
          ) : undefined
        }
      />
      <PageTabs tabs={REPORT_TABS} label="Reports" />
      <div aria-live="polite" className="mb-4 grid gap-2">
        {pause.isError && <Alert tone="danger">{toUserError(pause.error).message}</Alert>}
        {runNow.isPending && <Alert tone="info">Generating the report. This can take a few seconds…</Alert>}
        {runNow.isSuccess && (
          <Alert tone="success">
            {runNow.data.files.every((f) => f.status === 'ready')
              ? 'The report is ready. Find it under Report files.'
              : 'Some files could not be generated. See Report files for details.'}
          </Alert>
        )}
        {runNow.isError && <Alert tone="danger">{functionErrorMessage(runNow.error)}</Alert>}
      </div>
      <section className="rounded-lg bg-white">
        {list.isPending ? (
          <div className="p-4">
            <Spinner label="Loading schedules" />
          </div>
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBox error={list.error} />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState title="No scheduled reports yet">
            {can('reports.schedule')
              ? 'Create one to send a regular report to your team.'
              : 'Reports you receive appear here.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {s.name} {s.is_active ? <Badge tone="success">Active</Badge> : <Badge>Paused</Badge>}
                    {s.formats.map((f) => (
                      <Badge key={f} tone="brand">
                        {f === 'pdf' ? 'PDF' : 'Excel'}
                      </Badge>
                    ))}
                  </p>
                  <p className="text-[14px] text-secondary">
                    {reportLabel(s.report_key)} ·{' '}
                    {s.filters.branch_ids?.length
                      ? `${s.filters.branch_ids.length} ${s.filters.branch_ids.length === 1 ? 'branch' : 'branches'}`
                      : 'Whole organisation'}{' '}
                    · owner {s.owner_name || 'unknown'}
                  </p>
                  <p className="text-[14px] text-secondary">
                    To: {s.recipients.map((r) => r.display_name || 'Unnamed user').join(', ')}
                  </p>
                  <p className="text-[14px] text-secondary">
                    {s.is_active ? `Next run ${formatDateTime(s.next_run_at)}` : 'Paused'}
                    {s.last_run_at ? ` · last run ${formatDateTime(s.last_run_at)}` : ''}
                  </p>
                </div>
                {s.can_edit && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      busy={runNow.isPending && runNow.variables?.id === s.id}
                      onClick={() => runNow.mutate(s)}
                    >
                      Run now
                    </Button>
                    <Button variant="secondary" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      busy={pause.isPending && pause.variables?.id === s.id}
                      onClick={() => pause.mutate(s)}
                    >
                      {s.is_active ? 'Pause' : 'Resume'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {editing && (
        <ScheduleDialog
          key={editing === 'new' ? 'new' : editing.id}
          schedule={editing === 'new' ? null : editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}

export function ReportFilesPage() {
  const { supabase } = useSession();
  const search = useSearch({ strict: false }) as { run?: string };
  const fns = useFunctions();
  const dl = useMutation({ mutationFn: (id: string) => fns.download(id) });
  const files = useQuery({
    queryKey: ['reports', 'files', search.run ?? null],
    queryFn: async () => {
      let q = supabase
        .from('report_files')
        .select('*, report_schedules(name)')
        .eq('kind', 'report')
        .neq('status', 'expired')
        .order('created_at', { ascending: false })
        .limit(100);
      if (search.run) q = q.eq('run_id', search.run);
      const { data, error } = await q;
      if (error) throw error;
      return data as ReportFile[];
    },
  });
  const rows = useMemo(() => files.data ?? [], [files.data]);
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Reports sent to you or that you own. Files are kept for 30 days."
      />
      <PageTabs tabs={REPORT_TABS} label="Reports" />
      <section className="rounded-lg bg-white">
        {search.run && (
          <p className="border-b border-border p-4 text-[14px] text-secondary">Showing one report run.</p>
        )}
        {dl.isError && (
          <div className="p-4">
            <Alert tone="danger">{functionErrorMessage(dl.error)}</Alert>
          </div>
        )}
        {files.isPending ? (
          <div className="p-4">
            <Spinner label="Loading report files" />
          </div>
        ) : files.isError ? (
          <div className="p-4">
            <ErrorBox error={files.error} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No report files">
            Reports appear here after a scheduled or on-demand run.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                title={f.report_schedules?.name ?? reportLabel(f.report_key)}
                busy={dl.isPending && dl.variables === f.id}
                onDownload={(id) => dl.mutate(id)}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
