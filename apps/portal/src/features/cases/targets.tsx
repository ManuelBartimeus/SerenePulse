import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toUserError } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, EmptyState, TextField } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { useCatalogues } from '../analytics/catalogues';
import { accraToday } from '../analytics/filters-state';
import { MEASURES } from '../../lib/terms';
import { formatDate } from './format';
import { ALERT_TABS, PageTabs } from './page-tabs';
import { Card, ErrorAlert, Loading, Select, TextArea } from './ui';

export const TARGET_METRICS = [
  { key: 'csat_pct', label: `${MEASURES.csat_pct.label} (%)`, direction: 'higher_is_better', unit: '%' },
  {
    key: 'csat_avg',
    label: `${MEASURES.csat_avg.label} (out of 5)`,
    direction: 'higher_is_better',
    unit: '',
  },
  { key: 'nps', label: `${MEASURES.nps.label} (−100 to +100)`, direction: 'higher_is_better', unit: '' },
  { key: 'ces_avg', label: `${MEASURES.ces_avg.label} (out of 5)`, direction: 'higher_is_better', unit: '' },
  {
    key: 'completion_rate',
    label: `${MEASURES.completion_rate.label} (%)`,
    direction: 'higher_is_better',
    unit: '%',
  },
  {
    key: 'negative_rate',
    label: `${MEASURES.negative_rate.label} (%)`,
    direction: 'lower_is_better',
    unit: '%',
  },
  {
    key: 'resolution_time_days',
    label: 'Average time to resolve cases (working days)',
    direction: 'lower_is_better',
    unit: ' days',
  },
  {
    key: 'sla_compliance_pct',
    label: 'Cases resolved on time (%)',
    direction: 'higher_is_better',
    unit: '%',
  },
] as const;
const SCOPES = [
  { key: 'organisation', label: 'Whole organisation' },
  { key: 'region', label: 'Region' },
  { key: 'branch', label: 'Branch' },
  { key: 'channel', label: 'Channel' },
  { key: 'product', label: 'Product' },
] as const;

interface TargetRow {
  id: string;
  metric: string;
  scope_type: string;
  scope_id: string | null;
  target_value: number;
  direction: string;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
  version: number;
}

/** Whether a target is in force today, ended, or starts later (local Accra date). */
export function targetState(t: { effective_from: string; effective_to: string | null }, today: string) {
  if (t.effective_from > today) return 'scheduled' as const;
  if (t.effective_to !== null && t.effective_to < today) return 'ended' as const;
  return 'current' as const;
}

/** Validation for the target form; returns a message to show, or null. */
export function validateTarget(v: {
  metric: string;
  scope_type: string;
  scope_id: string;
  target_value: string;
  effective_from: string;
  effective_to: string;
}): string | null {
  const n = Number(v.target_value);
  if (v.target_value.trim() === '' || Number.isNaN(n)) return 'Enter the target as a number.';
  if (v.scope_type !== 'organisation' && !v.scope_id) return 'Choose which one the target applies to.';
  if (
    ['csat_pct', 'completion_rate', 'negative_rate', 'sla_compliance_pct'].includes(v.metric) &&
    (n < 0 || n > 100)
  )
    return 'Percentages must be between 0 and 100.';
  if (['csat_avg', 'ces_avg'].includes(v.metric) && (n < 1 || n > 5))
    return 'Averages must be between 1 and 5.';
  if (v.metric === 'nps' && (n < -100 || n > 100))
    return 'The recommendation score must be between −100 and +100.';
  if (v.metric === 'resolution_time_days' && n <= 0) return 'The time to resolve must be more than 0.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.effective_from)) return 'Choose the date the target starts.';
  if (v.effective_to && v.effective_to < v.effective_from)
    return 'The end date must be on or after the start date.';
  return null;
}

/** S-B12 Targets: metric × scope × effective period. There are no default targets (A-113). */
export function TargetsPage() {
  const { supabase, can } = useSession();
  const catalogues = useCatalogues();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const today = accraToday();
  const q = useQuery({
    queryKey: ['cases', 'targets'],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from('targets')
        .select('*')
        .order('metric')
        .order('scope_type')
        .order('effective_from', { ascending: false });
      if (e) throw e;
      return data as TargetRow[];
    },
  });
  const scopeName = (t: { scope_type: string; scope_id: string | null }) => {
    if (t.scope_type === 'organisation') return 'Whole organisation';
    const list =
      t.scope_type === 'region'
        ? catalogues.data?.regions
        : t.scope_type === 'branch'
          ? catalogues.data?.branches
          : t.scope_type === 'channel'
            ? catalogues.data?.channels
            : catalogues.data?.products;
    return list?.find((o) => o.id === t.scope_id)?.label ?? '…';
  };
  const endToday = async (t: TargetRow) => {
    setError(null);
    const { data, error: e } = await supabase
      .from('targets')
      .update({ effective_to: today < t.effective_from ? t.effective_from : today })
      .eq('id', t.id)
      .eq('version', t.version)
      .select('id');
    if (e) setError(e);
    else if (!data?.length)
      setError({ code: 'P0409', message: 'Someone else changed this target. Reload and try again.' });
    await qc.invalidateQueries({ queryKey: ['cases', 'targets'] });
  };
  const err = error ? toUserError(error) : null;
  const manage = can('targets.manage');

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Targets for each measure, for the whole company or one branch, region, channel or product."
        actions={manage ? <Button onClick={() => setAdding(true)}>Add target</Button> : null}
      />
      <PageTabs tabs={ALERT_TABS} label="Alerts" />
      <div aria-live="polite" className="mb-4">
        {err && (
          <Alert tone="danger" detail={err.detail}>
            {err.message}
          </Alert>
        )}
      </div>
      {q.isPending ? (
        <Loading label="Loading targets" />
      ) : q.isError ? (
        <ErrorAlert error={q.error} retry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <section className="rounded-lg bg-white">
          <EmptyState
            title="No targets yet"
            action={manage ? <Button onClick={() => setAdding(true)}>Add target</Button> : undefined}
          >
            No targets have been set yet. Add one to be alerted when a measure falls short of it.
          </EmptyState>
        </section>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {q.data.map((t) => {
              const m = TARGET_METRICS.find((x) => x.key === t.metric);
              const state = targetState(t, today);
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {m?.label ?? t.metric} · {scopeName(t)}
                    </p>
                    <p className="text-[14px] text-secondary">
                      {t.direction === 'higher_is_better' ? 'At least' : 'At most'} {t.target_value}
                      {m?.unit} · from {formatDate(t.effective_from)}
                      {t.effective_to ? ` to ${formatDate(t.effective_to)}` : ', open-ended'}
                      {t.note ? ` · ${t.note}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      tone={state === 'current' ? 'success' : state === 'scheduled' ? 'info' : 'neutral'}
                    >
                      {state === 'current' ? 'In force' : state === 'scheduled' ? 'Starts later' : 'Ended'}
                    </Badge>
                    {manage && state !== 'ended' && (
                      <Button variant="secondary" className="h-11" onClick={() => void endToday(t)}>
                        End today
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {adding && <AddTargetDialog onClose={() => setAdding(false)} today={today} />}
    </>
  );
}

function AddTargetDialog({ onClose, today }: { onClose: () => void; today: string }) {
  const { supabase } = useSession();
  const catalogues = useCatalogues();
  const qc = useQueryClient();
  const [v, setV] = useState({
    metric: 'csat_pct',
    scope_type: 'organisation',
    scope_id: '',
    target_value: '',
    effective_from: today,
    effective_to: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string | undefined } | null>(null);
  const options =
    v.scope_type === 'region'
      ? catalogues.data?.regions
      : v.scope_type === 'branch'
        ? catalogues.data?.branches
        : v.scope_type === 'channel'
          ? catalogues.data?.channels
          : v.scope_type === 'product'
            ? catalogues.data?.products
            : [];
  const submit = async () => {
    const problem = validateTarget(v);
    if (problem) return setError({ message: problem });
    setBusy(true);
    setError(null);
    const metric = TARGET_METRICS.find((m) => m.key === v.metric);
    const { error: e } = await supabase.from('targets').insert({
      metric: v.metric,
      scope_type: v.scope_type,
      scope_id: v.scope_type === 'organisation' ? null : v.scope_id,
      target_value: Number(v.target_value),
      direction: metric?.direction ?? 'higher_is_better',
      effective_from: v.effective_from,
      effective_to: v.effective_to || null,
      note: v.note.trim() || null,
    });
    setBusy(false);
    if (e) return setError(toUserError(e));
    await qc.invalidateQueries({ queryKey: ['cases', 'targets'] });
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a target"
      description="A newer target for the same measure replaces the older one from its start date."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} onClick={() => void submit()}>
            Save target
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Measure" value={v.metric} onChange={(e) => setV({ ...v, metric: e.target.value })}>
          {TARGET_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label} ({m.direction === 'higher_is_better' ? 'higher is better' : 'lower is better'})
            </option>
          ))}
        </Select>
        <Select
          label="Applies to"
          value={v.scope_type}
          onChange={(e) => setV({ ...v, scope_type: e.target.value, scope_id: '' })}
        >
          {SCOPES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        {v.scope_type !== 'organisation' && (
          <Select
            label="Which one"
            value={v.scope_id}
            onChange={(e) => setV({ ...v, scope_id: e.target.value })}
          >
            <option value="">Choose…</option>
            {(options ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
        <TextField
          label="Target value"
          type="number"
          step="any"
          value={v.target_value}
          onChange={(e) => setV({ ...v, target_value: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Starts"
            type="date"
            value={v.effective_from}
            onChange={(e) => setV({ ...v, effective_from: e.target.value })}
          />
          <TextField
            label="Ends"
            optional
            type="date"
            value={v.effective_to}
            onChange={(e) => setV({ ...v, effective_to: e.target.value })}
          />
        </div>
        <TextArea
          label="Note (optional)"
          rows={2}
          value={v.note}
          maxLength={300}
          onChange={(e) => setV({ ...v, note: e.target.value })}
        />
        <div aria-live="polite">
          {error && (
            <Alert tone="danger" detail={error.detail}>
              {error.message}
            </Alert>
          )}
        </div>
      </div>
    </Dialog>
  );
}
