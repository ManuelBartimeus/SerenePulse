import * as Switch from '@radix-ui/react-switch';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toUserError } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, EmptyState, TextField } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { useCaseMutation, useRpc, type FlagItem, type FlagPage } from './api';
import { WORDS } from '../../lib/terms';
import { nextCursor, plainReason, PRIORITIES, timeAgo } from './format';
import { FLAG_TABS, MoreFilters, PageTabs } from './page-tabs';
import { Card, ErrorAlert, Loading, PriorityBadge, Select, TextActionDialog, TextArea } from './ui';

const RULE_LABELS: Record<string, string> = {
  low_csat: 'Low satisfaction rating',
  improvement_factor: WORDS.factor,
  comment_keyword: 'Concerning comment',
};
/** Plain explanations shown on the Flagging rules tab (the stored text uses older jargon). */
const RULE_HELP: Record<string, string> = {
  low_csat: 'The customer rated their overall experience poorly.',
  improvement_factor:
    'The customer picked something we could do better. Each area below has its own switches; “Nothing, I am satisfied” never raises a flag.',
  comment_keyword: 'The customer’s comment contains one of the words listed at the bottom of this page.',
};

/** S-B3 Flagged feedback: default view is unhappy customers (A-126); group by reason, bulk dismiss, open a case. */
export function FlagQueuePage() {
  const rpc = useRpc();
  const { can } = useSession();
  const [view, setView] = useState<'csat_lte_2' | 'all'>('csat_lte_2');
  const [status, setStatus] = useState<'open' | 'dismissed' | 'converted' | 'all'>('open');
  const [rule, setRule] = useState<string>('');
  const [grouped, setGrouped] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissOpen, setDismissOpen] = useState(false);
  const [convert, setConvert] = useState<FlagItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canReview = can('flags.review');

  const q = useInfiniteQuery({
    queryKey: ['flags', 'queue', view, status, rule],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      rpc<FlagPage>('flags_list', {
        p_status: status,
        p_view: view,
        p_rule_key: rule || null,
        p_cursor: pageParam,
        p_limit: 50,
      }),
    getNextPageParam: nextCursor,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const counts = q.data?.pages[0]?.counts ?? {};
  const openItems = items.filter((i) => i.status === 'open');
  const allSelected = openItems.length > 0 && openItems.every((i) => selected.has(i.id));

  const dismiss = useCaseMutation((reason: string) =>
    rpc<number>('flag_dismiss', { p_flag_ids: [...selected], p_reason: reason }),
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const groups = grouped
    ? Object.keys(RULE_LABELS)
        .map((k) => ({ key: k, items: items.filter((i) => i.rule_key === k) }))
        .filter((g) => g.items.length > 0)
    : [{ key: 'all', items }];

  return (
    <>
      <PageHeader
        title="Flagged feedback"
        subtitle="Feedback that needs a closer look. Open a case to follow it up, or dismiss it with a reason."
      />
      <PageTabs tabs={FLAG_TABS} label="Flagged feedback" />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-white p-4">
        <div className="w-full sm:w-64">
          <Select label="Show" value={view} onChange={(e) => setView(e.target.value as typeof view)}>
            <option value="csat_lte_2">Unhappy customers</option>
            <option value="all">All flagged feedback</option>
          </Select>
        </div>
        <div className="w-full sm:w-56">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="open">Waiting for review</option>
            <option value="dismissed">Dismissed</option>
            <option value="converted">Turned into a case</option>
            <option value="all">Any status</option>
          </Select>
        </div>
        <div className="ml-auto">
          <MoreFilters
            active={(rule ? 1 : 0) + (grouped ? 0 : 1)}
            onClear={() => {
              setRule('');
              setGrouped(true);
            }}
          >
            <Select label="Reason" value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="">Any reason</option>
              {Object.entries(RULE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l} ({counts[k] ?? 0})
                </option>
              ))}
            </Select>
            <label className="flex min-h-11 items-center gap-3 text-[14px]">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-brand)]"
                checked={grouped}
                onChange={(e) => setGrouped(e.target.checked)}
              />
              Group by reason
            </label>
          </MoreFilters>
        </div>
      </div>

      {canReview && status === 'open' && (
        <div className="sticky top-16 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
          <label className="flex min-h-11 items-center gap-3 px-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={allSelected}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(openItems.map((i) => i.id)) : new Set())
              }
            />
            Select all shown
          </label>
          <span className="text-[14px] text-secondary" aria-live="polite">
            {selected.size} selected
          </span>
          <Button variant="secondary" disabled={selected.size === 0} onClick={() => setDismissOpen(true)}>
            Dismiss with reason
          </Button>
        </div>
      )}
      <div aria-live="polite" className="mb-4">
        {notice && <Alert tone="success">{notice}</Alert>}
      </div>

      {q.isPending ? (
        <Loading label="Loading flagged feedback" />
      ) : q.isError ? (
        <ErrorAlert error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <section className="rounded-lg bg-white">
          <EmptyState title={status === 'open' ? 'Nothing waiting for review' : 'Nothing to show'}>
            {view === 'csat_lte_2'
              ? 'Choose “All flagged feedback” under Show to see everything.'
              : 'Try another status.'}
          </EmptyState>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={RULE_LABELS[g.key] ?? WORDS.flags}>
              {grouped && <h2 className="mb-2 text-[16px] font-medium">{RULE_LABELS[g.key]}</h2>}
              <ul className="flex flex-col gap-2">
                {g.items.map((f) => (
                  <li key={f.id} className="flex gap-3 rounded-lg bg-white p-4">
                    {canReview && f.status === 'open' && (
                      <input
                        type="checkbox"
                        className="mt-1 size-5 shrink-0"
                        aria-label={`Select ${f.response_reference}`}
                        checked={selected.has(f.id)}
                        onChange={() => toggle(f.id)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{f.response_reference}</span>
                        <Badge tone={f.csat_score <= 2 ? 'danger' : 'neutral'}>
                          Rated {f.csat_score} of 5
                        </Badge>
                        <span className="text-[14px]">{plainReason(f.reason)}</span>
                        <PriorityBadge priority={f.suggested_priority} />
                      </div>
                      <p className="mt-1 text-[14px] text-secondary">
                        {[f.branch_name ?? 'No branch', f.channel_label, f.product_label].join(' · ')} ·{' '}
                        {timeAgo(f.created_at)}
                      </p>
                      {f.comment_excerpt && (
                        <p className="mt-2 line-clamp-2 text-[14px]">“{f.comment_excerpt}”</p>
                      )}
                      {f.status === 'dismissed' && (
                        <p className="mt-2 text-[14px] text-secondary">Dismissed: {f.dismissal_reason}</p>
                      )}
                      {f.status === 'converted' && f.case_id && (
                        <Link
                          to="/cases/$caseId"
                          params={{ caseId: f.case_id }}
                          className="mt-2 inline-block text-[14px] font-medium text-brand hover:underline"
                        >
                          Case {f.case_reference}
                        </Link>
                      )}
                    </div>
                    {canReview && can('cases.create') && f.status === 'open' && (
                      <Button variant="secondary" className="h-11 shrink-0" onClick={() => setConvert(f)}>
                        Open a case
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {q.hasNextPage && (
            <Button variant="secondary" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              Show more
            </Button>
          )}
        </div>
      )}

      <TextActionDialog
        open={dismissOpen}
        onOpenChange={setDismissOpen}
        title={`Dismiss ${selected.size} item${selected.size === 1 ? '' : 's'}`}
        description="The reason is kept with each item and shown to other reviewers."
        label="Reason"
        confirmLabel="Dismiss"
        onConfirm={async (reason) => {
          const n = await dismiss.mutateAsync(reason);
          setSelected(new Set());
          setNotice(`${n as number} item${n === 1 ? '' : 's'} dismissed.`);
        }}
      />
      {convert && <ConvertDialog flag={convert} onClose={() => setConvert(null)} />}
    </>
  );
}

function ConvertDialog({ flag, onClose }: { flag: FlagItem; onClose: () => void }) {
  const rpc = useRpc();
  const navigate = useNavigate();
  const [priority, setPriority] = useState(flag.suggested_priority);
  const [description, setDescription] = useState(plainReason(flag.reason));
  const m = useCaseMutation(() =>
    rpc<{ case_id: string; reference: string; created: boolean }>('flag_convert_to_case', {
      p_flag_id: flag.id,
      p_priority: priority,
      p_description: description,
    }),
  );
  const err = m.error ? toUserError(m.error) : null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Open a case for ${flag.response_reference}`}
      description="The case goes to the customer experience team’s queue. Anything else flagged on this response is linked to it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={m.isPending}
            onClick={() =>
              m.mutate(undefined, {
                onSuccess: (r) =>
                  void navigate({
                    to: '/cases/$caseId',
                    params: { caseId: (r as { case_id: string }).case_id },
                  }),
              })
            }
          >
            Create case
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          {PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} — {p.days} working day{p.days === 1 ? '' : 's'}
            </option>
          ))}
        </Select>
        <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div aria-live="polite">
          {err && (
            <Alert tone="danger" detail={err.detail}>
              {err.message}
            </Alert>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// S-B9a Flagging rules (flags.configure): Flag / Auto-create case per rule and per factor (D-19)
// ---------------------------------------------------------------------------
interface RuleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  params: { csat_lte?: number };
  flag_enabled: boolean;
  auto_create_case: boolean;
  default_priority: string;
  is_active: boolean;
  version: number;
}
interface FactorRow {
  id: string;
  code: string;
  label: string;
  is_none: boolean;
  is_active: boolean;
  flag_on_select: boolean;
  auto_create_case: boolean;
  default_priority: string;
  version: number;
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[14px]">
      <Switch.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="relative h-7 w-12 shrink-0 rounded-full bg-border-strong outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 data-[state=checked]:bg-brand"
      >
        <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-white transition-transform data-[state=checked]:translate-x-6" />
      </Switch.Root>
      {label}
    </label>
  );
}

export function FlagRulesPage() {
  const { supabase } = useSession();
  const rpc = useRpc();
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ['flags', 'rules'],
    queryFn: async () => {
      const [r, f, s] = await Promise.all([
        supabase.from('flag_rules').select('*').order('sort_order'),
        supabase
          .from('improvement_factors')
          .select(
            'id, code, label, is_none, is_active, flag_on_select, auto_create_case, default_priority, version',
          )
          .order('sort_order'),
        supabase.from('settings').select('value').eq('key', 'comment_keywords').maybeSingle(),
      ]);
      const failed = [r, f, s].find((x) => x.error);
      if (failed?.error) throw failed.error;
      return {
        rules: r.data as RuleRow[],
        factors: f.data as FactorRow[],
        keywords: ((s.data?.value as string[] | undefined) ?? []).join(', '),
      };
    },
  });

  const save = async (
    table: 'flag_rules' | 'improvement_factors',
    row: { id: string; version: number },
    patch: object,
  ) => {
    setError(null);
    setSaved(null);
    const { data: out, error: e } = await supabase
      .from(table)
      .update(patch)
      .eq('id', row.id)
      .eq('version', row.version)
      .select('id');
    if (e) setError(e);
    else if (!out?.length)
      setError({ code: 'P0409', message: 'Someone else changed this rule. The page has been reloaded.' });
    else setSaved('Saved. New responses use this setting straight away.');
    await qc.invalidateQueries({ queryKey: ['flags', 'rules'] });
  };

  // "Open a case automatically" implies "Flag"; turning "Flag" off also turns auto-case off.
  const flagPatch = (flagKey: string, autoKey: string, which: 'flag' | 'auto', v: boolean) =>
    which === 'flag'
      ? { [flagKey]: v, ...(v ? {} : { [autoKey]: false }) }
      : { [autoKey]: v, ...(v ? { [flagKey]: true } : {}) };

  const [keywords, setKeywords] = useState<string | null>(null);
  const kwValue = keywords ?? data.data?.keywords ?? '';

  if (data.isPending) return <Loading label="Loading flagging rules" />;
  if (data.isError) return <ErrorAlert error={data.error} retry={() => void data.refetch()} />;
  const { rules, factors } = data.data;
  const err = error ? toUserError(error) : null;
  return (
    <>
      <PageHeader
        title="Flagged feedback"
        subtitle="Choose which feedback is flagged for review, and where a case should open automatically."
      />
      <PageTabs tabs={FLAG_TABS} label="Flagged feedback" />
      <div aria-live="polite" className="mb-4 flex flex-col gap-2">
        {err && (
          <Alert tone="danger" detail={err.detail}>
            {err.message}
          </Alert>
        )}
        {saved && <Alert tone="success">{saved}</Alert>}
      </div>
      <div className="flex flex-col gap-6">
        <Card title={WORDS.flagRules}>
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="max-w-xl">
                  <p className="font-medium">{RULE_LABELS[r.key] ?? r.name}</p>
                  <p className="text-[14px] text-secondary">{RULE_HELP[r.key] ?? r.description}</p>
                </div>
                {r.key === 'improvement_factor' ? (
                  <Toggle
                    label="Use the switches for each area below"
                    checked={r.is_active}
                    onChange={(v) => void save('flag_rules', r, { is_active: v })}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <Toggle
                      label="Flag"
                      checked={r.flag_enabled}
                      onChange={(v) =>
                        void save('flag_rules', r, flagPatch('flag_enabled', 'auto_create_case', 'flag', v))
                      }
                    />
                    <Toggle
                      label="Open a case automatically"
                      checked={r.auto_create_case}
                      onChange={(v) =>
                        void save('flag_rules', r, flagPatch('flag_enabled', 'auto_create_case', 'auto', v))
                      }
                    />
                    <div className="w-40">
                      <Select
                        label="Priority"
                        value={r.default_priority}
                        onChange={(e) => void save('flag_rules', r, { default_priority: e.target.value })}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {r.key === 'low_csat' && (
                      <div className="w-40">
                        <Select
                          label="Flag ratings up to"
                          value={String(r.params.csat_lte ?? 2)}
                          onChange={(e) =>
                            void save('flag_rules', r, {
                              params: { ...r.params, csat_lte: Number(e.target.value) },
                            })
                          }
                        >
                          <option value="1">1 of 5</option>
                          <option value="2">2 of 5</option>
                          <option value="3">3 of 5</option>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title={WORDS.factors}>
          <ul className="divide-y divide-border">
            {factors.map((f) => (
              <li
                key={f.id}
                className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
              >
                <p className="font-medium">
                  {f.label} {!f.is_active && <Badge>Inactive</Badge>}
                </p>
                {f.is_none ? (
                  <p className="text-[14px] text-secondary">Never flagged and never opens a case.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <Toggle
                      label="Flag"
                      checked={f.flag_on_select}
                      onChange={(v) =>
                        void save(
                          'improvement_factors',
                          f,
                          flagPatch('flag_on_select', 'auto_create_case', 'flag', v),
                        )
                      }
                    />
                    <Toggle
                      label="Open a case automatically"
                      checked={f.auto_create_case}
                      onChange={(v) =>
                        void save(
                          'improvement_factors',
                          f,
                          flagPatch('flag_on_select', 'auto_create_case', 'auto', v),
                        )
                      }
                    />
                    <div className="w-40">
                      <Select
                        label="Priority"
                        hideLabel
                        value={f.default_priority}
                        onChange={(e) =>
                          void save('improvement_factors', f, { default_priority: e.target.value })
                        }
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Comment keywords">
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setSaved(null);
              try {
                await rpc('flag_rules_set_keywords', {
                  p_keywords: kwValue
                    .split(',')
                    .map((k) => k.trim())
                    .filter(Boolean),
                });
                setKeywords(null);
                setSaved('Keywords saved. Matching is case-insensitive and on whole words.');
                await qc.invalidateQueries({ queryKey: ['flags', 'rules'] });
              } catch (x) {
                setError(x);
              }
            }}
          >
            <TextField
              label="Keywords, separated by commas"
              helper="A comment containing any of these words is flagged as a “Concerning comment”."
              value={kwValue}
              onChange={(e) => setKeywords(e.target.value)}
            />
            <div>
              <Button type="submit" variant="secondary">
                Save keywords
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
