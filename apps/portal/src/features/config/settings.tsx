// S-B21 Settings (M17). Each setting saves on its own, with an optimistic check on updated_at.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Button, EmptyState, TextField } from '../../ui/controls';
import { CONFLICT_MESSAGE, ErrorAlert, ListSkeleton, Section, Toggle, dateTime } from './shared';
import {
  SETTING_SPECS,
  formatSettingValue,
  keywordError,
  normaliseKeyword,
  parseSetting,
  settingInput,
  settingSpec,
  type SettingSpec,
} from './validation';

interface SettingRow {
  key: string;
  value: unknown;
  description: string;
  updated_at: string;
}
interface HistoryRow {
  id: number;
  key: string;
  old_value: unknown;
  new_value: unknown;
  changed_at: string;
  changed_by: string | null;
}

const GROUPS: { key: SettingSpec['group']; title: string; description: string }[] = [
  {
    key: 'survey',
    title: 'Survey access',
    description:
      'Protection against repeat or automated submissions, and how long an unfinished survey stays open.',
  },
  {
    key: 'analytics',
    title: 'Dashboards and flagged feedback',
    description: 'How dashboards treat small groups, and which comments are flagged for review.',
  },
  { key: 'company', title: 'Company', description: 'Names used in customer-facing copy and reports.' },
  {
    key: 'privacy',
    title: 'Privacy notice contacts',
    description:
      'Shown to customers in the survey’s privacy notice. Leave blank only until the details are confirmed.',
  },
  { key: 'notifications', title: 'Email', description: 'Protects the email provider’s daily sending limit.' },
];

function KeywordsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  function add() {
    const w = normaliseKeyword(draft);
    if (!w) return;
    const problem = keywordError(w, value);
    setError(problem);
    if (problem) return;
    onChange([...value, w]);
    setDraft('');
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2" aria-label="Keywords">
        {value.length === 0 && (
          <li className="text-[14px] text-muted">No keywords. Comments won’t be flagged by keyword.</li>
        )}
        {value.map((w) => (
          <li
            key={w}
            className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-[14px] text-brand"
          >
            {w}
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full hover:bg-white"
              aria-label={`Remove “${w}”`}
              onClick={() => onChange(value.filter((x) => x !== w))}
            >
              <span aria-hidden>×</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 md:flex-row md:items-start">
        <div className="flex-1">
          <TextField
            label="Add a keyword or phrase"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={onKey}
            helper="Press Enter to add. 2–40 characters each, up to 100."
            error={error ?? undefined}
            maxLength={40}
          />
        </div>
        <Button type="button" variant="secondary" className="md:mt-7" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

function SettingField({ spec, row }: { spec: SettingSpec; row: SettingRow | undefined }) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const initial = settingInput(spec.key, row?.value);
  const [value, setValue] = useState<string | boolean | string[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const save = useMutation({
    mutationFn: async () => {
      const parsed = parseSetting(spec.key, value);
      if (!parsed.ok) throw { code: 'client', message: parsed.error };
      const { data, error: e } = await supabase
        .from('settings')
        .update({ value: parsed.value })
        .eq('key', spec.key)
        .eq('updated_at', row?.updated_at ?? '')
        .select('key');
      if (e) throw e;
      if (!data || data.length === 0) throw { code: 'P0409', message: CONFLICT_MESSAGE };
    },
    onMutate: () => {
      setError(null);
      setSaved(false);
    },
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['config', 'settings'] });
    },
  });
  if (!row) {
    return (
      <Alert tone="warning">
        “{spec.label}” isn’t set up in this environment yet. Ask the team that runs the database to add it.
      </Alert>
    );
  }
  const clientError = (save.error as { code?: string; message?: string } | null)?.code === 'client';
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      {spec.kind === 'bool' ? (
        <Toggle label={spec.label} helper={spec.helper} checked={value === true} onChange={setValue} />
      ) : spec.kind === 'keywords' ? (
        <>
          <div>
            <p className="text-[14px] font-medium leading-5">{spec.label}</p>
            <p className="text-[14px] leading-5 text-secondary">{spec.helper}</p>
          </div>
          <KeywordsEditor value={Array.isArray(value) ? value : []} onChange={setValue} />
        </>
      ) : (
        <TextField
          label={spec.unit ? `${spec.label} (${spec.unit})` : spec.label}
          optional={spec.optional ?? false}
          inputMode={spec.kind === 'int' ? 'numeric' : undefined}
          type={spec.inputType ?? 'text'}
          value={String(value)}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onBlur={() => {
            const p = parseSetting(spec.key, value);
            setError(p.ok ? null : p.error);
          }}
          helper={spec.helper}
          error={error ?? (clientError ? (save.error as { message: string }).message : undefined)}
        />
      )}
      {save.error && !clientError && <ErrorAlert error={save.error} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          className="h-11"
          disabled={!dirty}
          busy={save.isPending}
          onClick={() => save.mutate()}
        >
          Save<span className="sr-only"> {spec.label}</span>
        </Button>
        {dirty && (
          <Button variant="ghost" className="h-11" onClick={() => setValue(initial)}>
            Undo changes
          </Button>
        )}
        <span className="text-[14px] text-secondary" aria-live="polite">
          {saved && !dirty ? 'Saved.' : `Last changed ${dateTime.format(new Date(row.updated_at))}`}
        </span>
      </div>
    </div>
  );
}

function SettingsHistory() {
  const { supabase } = useSession();
  const history = useQuery({
    queryKey: ['config', 'settings-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings_history')
        .select('id, key, old_value, new_value, changed_at, changed_by')
        .order('changed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = data as HistoryRow[];
      const ids = [...new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: people } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', ids);
        (people ?? []).forEach((p: { user_id: string; display_name: string }) =>
          names.set(p.user_id, p.display_name),
        );
      }
      return rows.map((r) => ({
        ...r,
        who: r.changed_by ? names.get(r.changed_by) || 'A staff member' : 'System (migration)',
      }));
    },
  });
  return (
    <Section
      title="Settings history"
      description="The last 50 changes. Every change is also in the audit log."
    >
      {history.isPending ? (
        <ListSkeleton label="Loading history" />
      ) : history.isError ? (
        <div className="p-4">
          <ErrorAlert error={history.error} />
        </div>
      ) : history.data.length === 0 ? (
        <EmptyState title="No changes yet" />
      ) : (
        <ul className="divide-y divide-border">
          {history.data.map((h) => (
            <li
              key={h.id}
              className="grid gap-1 px-4 py-3 text-[14px] leading-5 md:grid-cols-[180px_1fr_200px]"
            >
              <span className="text-secondary">{dateTime.format(new Date(h.changed_at))}</span>
              <span>
                <span className="font-medium">{settingSpec(h.key)?.label ?? h.key}</span>:{' '}
                {h.old_value === null ? 'set to ' : `${formatSettingValue(h.old_value)} → `}
                {formatSettingValue(h.new_value)}
              </span>
              <span className="text-secondary">{h.who}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** S-B21 Settings (M17). */
export function SettingsPage() {
  const { supabase } = useSession();
  const settings = useQuery({
    queryKey: ['config', 'settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('key, value, description, updated_at');
      if (error) throw error;
      return data as SettingRow[];
    },
  });
  const byKey = useMemo(() => new Map((settings.data ?? []).map((s) => [s.key, s])), [settings.data]);
  return (
    <>
      <PageHeader title="General" subtitle="Changes apply immediately and are recorded." />
      {settings.isPending ? (
        <div className="rounded-lg bg-white">
          <ListSkeleton rows={8} label="Loading settings" />
        </div>
      ) : settings.isError ? (
        <ErrorAlert error={settings.error} />
      ) : (
        <div className="flex flex-col gap-6">
          {GROUPS.map((g) => (
            <Section key={g.key} title={g.title} description={g.description}>
              <div className="divide-y divide-border p-4 md:p-5">
                {SETTING_SPECS.filter((s) => s.group === g.key).map((s) => {
                  const row = byKey.get(s.key);
                  // Remount after a save so the field picks up the stored value and timestamp.
                  return <SettingField key={`${s.key}:${row?.updated_at ?? ''}`} spec={s} row={row} />;
                })}
              </div>
            </Section>
          ))}
          <SettingsHistory />
        </div>
      )}
    </>
  );
}
