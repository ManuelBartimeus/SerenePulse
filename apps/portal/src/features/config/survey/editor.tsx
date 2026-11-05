// S-B19 Survey version editor (M04): page outline, question inspector, rule builder, live preview, diff,
// guardrails, publish request and four-eyes approval.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ANSWER_SLOTS,
  guardrails,
  questions,
  type Definition,
  type GuardrailProblem,
  type Page,
  type Question,
  type QuestionType,
  type Rule,
  type Snapshot,
} from '@serene/survey-engine';
import { useSession } from '../../../lib/session';
import { PageHeader } from '../../../pages/shell';
import { Alert, Badge, Button, TextField } from '../../../ui/controls';
import { Dialog } from '../../../ui/dialog';
import {
  ConfirmDialog,
  ErrorAlert,
  ListSkeleton,
  Section,
  SelectField,
  Tabs,
  TextArea,
  dateTime,
} from '../shared';
import {
  STATUS_LABEL,
  STATUS_TONE,
  useBaseVersion,
  usePreviewSnapshot,
  useVersion,
  useVersionList,
  type VersionRow,
} from './data';
import { diffDefinitions, scaleChanged, type DiffEntry } from './diff';
import { SurveyPreview } from './preview';
import { RuleBuilder } from './rule-builder';

const REQUIRED_SLOTS = ['channel', 'product', 'csat', 'ces', 'nps'];
const TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: 'Single choice',
  rating_5: '1–5 rating',
  rating_0_10: '0–10 rating',
  text_short: 'Short text',
  text_long: 'Long text',
  toggle: 'On/off switch',
  phone: 'Phone number',
};
const SOURCE_LABEL: Record<string, string> = {
  service_channels: 'Service channels',
  branches: 'Branches',
  insurance_products: 'Products',
  improvement_factors: 'Areas to improve',
};

/** Mirrors the engine's guardrail cap for max_length. */
export function maxLengthCap(q: Question): number {
  if (q.id.endsWith('_other')) return q.id === 'factor_other' ? 200 : 80;
  return q.type === 'text_long' ? 1000 : 80;
}

type Selection = { kind: 'survey' } | { kind: 'page'; index: number } | { kind: 'question'; id: string };

// ---------------------------------------------------------------------------
// Immutable definition edits
// ---------------------------------------------------------------------------
function without<T extends object>(obj: T, keys: (keyof T)[]): T {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k as keyof T))) as T;
}
function withQuestion(
  def: Definition,
  id: string,
  patch: Partial<Question>,
  remove: (keyof Question)[] = [],
): Definition {
  return {
    ...def,
    pages: def.pages.map((p) => ({
      ...p,
      questions: p.questions.map((q) => {
        if (q.id !== id) return q;
        return without({ ...q, ...patch }, remove);
      }),
    })),
  };
}
function withPage(
  def: Definition,
  index: number,
  patch: Partial<Page>,
  remove: (keyof Page)[] = [],
): Definition {
  return {
    ...def,
    pages: def.pages.map((p, i) => {
      if (i !== index) return p;
      return without({ ...p, ...patch }, remove);
    }),
  };
}
function moveQuestion(def: Definition, id: string, delta: -1 | 1): Definition {
  return {
    ...def,
    pages: def.pages.map((p) => {
      const i = p.questions.findIndex((q) => q.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= p.questions.length) return p;
      const qs = p.questions.slice();
      [qs[i], qs[j]] = [qs[j] as Question, qs[i] as Question];
      return { ...p, questions: qs };
    }),
  };
}
function removeQuestion(def: Definition, id: string): Definition {
  return {
    ...def,
    pages: def.pages.map((p) => ({ ...p, questions: p.questions.filter((q) => q.id !== id) })),
  };
}
export function newQuestionForSlot(id: string): Question {
  const slot = ANSWER_SLOTS[id];
  const type = (slot?.type[0] ?? 'text_short') as QuestionType;
  const q: Question = { id, type, label: '' };
  if (slot?.source) q.options_source = slot.source;
  if (id.endsWith('_other')) {
    q.visible_when = { var: `${id.replace(/_other$/, '')}.is_other` };
    q.max_length = id === 'factor_other' ? 200 : 80;
  }
  if (type === 'phone') {
    q.visible_when = { var: 'contact_consent' };
    q.required = { var: 'contact_consent' };
  }
  if (id === 'first_name') {
    q.visible_when = { var: 'contact_consent' };
    q.max_length = 40;
  }
  if (REQUIRED_SLOTS.includes(id)) q.required = true;
  return q;
}
function addQuestion(def: Definition, pageIndex: number, id: string): Definition {
  return {
    ...def,
    pages: def.pages.map((p, i) =>
      i === pageIndex ? { ...p, questions: [...p.questions, newQuestionForSlot(id)] } : p,
    ),
  };
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
function QuestionInspector({
  def,
  q,
  snapshot,
  readOnly,
  onChange,
  problems,
}: {
  def: Definition;
  q: Question;
  snapshot: Snapshot | null;
  readOnly: boolean;
  onChange: (def: Definition) => void;
  problems: GuardrailProblem[];
}) {
  const set = (patch: Partial<Question>, remove: (keyof Question)[] = []) =>
    onChange(withQuestion(def, q.id, patch, remove));
  const isText = q.type === 'text_short' || q.type === 'text_long';
  const fixedRequired = REQUIRED_SLOTS.includes(q.id);
  const requiredMode =
    q.required === true ? 'always' : q.required === undefined || q.required === false ? 'optional' : 'when';
  const anchorsCount = q.type === 'rating_5' ? 5 : q.type === 'rating_0_10' ? 2 : 0;
  const cap = maxLengthCap(q);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[12px] font-medium uppercase leading-4 tracking-[1px] text-muted">Question</p>
        <p className="mt-1 text-[18px] font-medium leading-6">
          {q.id} <Badge>{TYPE_LABEL[q.type]}</Badge>
        </p>
        {q.options_source && (
          <p className="mt-1 text-[14px] text-secondary">
            Options come from the “{SOURCE_LABEL[q.options_source] ?? q.options_source}” list under Lists &
            options.
          </p>
        )}
      </div>
      {problems.length > 0 && (
        <Alert tone="danger" title="Fix before publishing">
          <ul className="list-disc pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      <TextArea
        label="Wording"
        value={q.label}
        rows={2}
        disabled={readOnly}
        maxLength={300}
        onChange={(e) => set({ label: e.target.value })}
        helper="What the customer reads. Use plain, friendly words."
      />
      <TextArea
        label="Help text"
        optional
        rows={2}
        disabled={readOnly}
        maxLength={300}
        value={q.help ?? ''}
        onChange={(e) => (e.target.value ? set({ help: e.target.value }) : set({}, ['help']))}
      />
      {anchorsCount > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[14px] font-medium">
            {q.type === 'rating_5' ? 'Labels for 1 to 5' : 'Labels for 0 and 10'}
          </legend>
          {Array.from({ length: anchorsCount }, (_, i) => {
            const point = q.type === 'rating_5' ? i + 1 : i === 0 ? 0 : 10;
            return (
              <TextField
                key={i}
                label={`Score ${point}`}
                disabled={readOnly}
                maxLength={60}
                value={q.anchors?.[i] ?? ''}
                onChange={(e) => {
                  const anchors = Array.from({ length: anchorsCount }, (_, j) => q.anchors?.[j] ?? '');
                  anchors[i] = e.target.value;
                  set({ anchors });
                }}
              />
            );
          })}
          <p className="text-[14px] text-secondary">
            The scale itself can’t be changed here: changing a rating scale breaks trends.
          </p>
        </fieldset>
      )}
      {(isText || q.max_length !== undefined) && (
        <TextField
          label="Maximum length (characters)"
          type="number"
          inputMode="numeric"
          min={1}
          max={cap}
          disabled={readOnly}
          value={q.max_length ?? ''}
          helper={`1 to ${cap}. Leave empty for the default (${q.type === 'text_long' ? 1000 : 80}).`}
          onChange={(e) =>
            e.target.value === ''
              ? set({}, ['max_length'])
              : set({ max_length: Math.trunc(Number(e.target.value)) })
          }
        />
      )}
      <div className="flex flex-col gap-3">
        {fixedRequired ? (
          <p className="text-[14px]">
            <span className="font-medium">Required:</span> always. The system needs this answer.
          </p>
        ) : isText ? (
          <p className="text-[14px]">
            <span className="font-medium">Required:</span> never. Free-text answers are always optional (Rule
            20).
          </p>
        ) : q.type === 'phone' ? (
          <RuleBuilder
            def={def}
            questionId={q.id}
            snapshot={snapshot}
            rule={typeof q.required === 'object' ? q.required : undefined}
            disabled={readOnly}
            title="Required when"
            emptyText="Optional."
            onChange={(r) => (r === undefined ? set({}, ['required']) : set({ required: r }))}
          />
        ) : (
          <>
            <SelectField
              label="Required"
              disabled={readOnly}
              value={requiredMode}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'optional') set({}, ['required']);
                else if (v === 'always') set({ required: true });
                else set({ required: { var: questions(def)[0]?.id ?? q.id } as Rule });
              }}
            >
              <option value="optional">Optional</option>
              <option value="always">Always required</option>
              <option value="when">Required when…</option>
            </SelectField>
            {requiredMode === 'when' && (
              <RuleBuilder
                def={def}
                questionId={q.id}
                snapshot={snapshot}
                rule={q.required as Rule}
                disabled={readOnly}
                title="Required when"
                emptyText="Add a condition, or choose Optional."
                onChange={(r) => (r === undefined ? set({}, ['required']) : set({ required: r }))}
              />
            )}
          </>
        )}
      </div>
      <RuleBuilder
        def={def}
        questionId={q.id}
        snapshot={snapshot}
        rule={q.visible_when}
        disabled={readOnly}
        title="Show this question when"
        emptyText="Always shown."
        onChange={(r) => (r === undefined ? set({}, ['visible_when']) : set({ visible_when: r }))}
      />
      {!readOnly && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button
            variant="secondary"
            className="h-11 text-[14px]"
            onClick={() => onChange(moveQuestion(def, q.id, -1))}
          >
            Move up
          </Button>
          <Button
            variant="secondary"
            className="h-11 text-[14px]"
            onClick={() => onChange(moveQuestion(def, q.id, 1))}
          >
            Move down
          </Button>
          {!fixedRequired && (
            <Button
              variant="ghost"
              className="h-11 text-[14px] text-danger"
              onClick={() => onChange(removeQuestion(def, q.id))}
            >
              Remove question
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PageInspector({
  def,
  index,
  readOnly,
  onChange,
  problems,
}: {
  def: Definition;
  index: number;
  readOnly: boolean;
  onChange: (def: Definition) => void;
  problems: GuardrailProblem[];
}) {
  const page = def.pages[index];
  const [slot, setSlot] = useState('');
  if (!page) return null;
  const used = new Set(questions(def).map((q) => q.id));
  const unused = Object.keys(ANSWER_SLOTS).filter((id) => !used.has(id));
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[12px] font-medium uppercase leading-4 tracking-[1px] text-muted">
        Page {index + 1}
      </p>
      {problems.length > 0 && (
        <Alert tone="danger" title="Fix before publishing">
          <ul className="list-disc pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      <TextField
        label="Page heading"
        value={page.title}
        disabled={readOnly}
        maxLength={120}
        onChange={(e) => onChange(withPage(def, index, { title: e.target.value }))}
      />
      <TextField
        label="Heading when the customer was dissatisfied"
        optional
        value={page.title_when_low_csat ?? ''}
        disabled={readOnly}
        maxLength={120}
        helper="Shown instead when the satisfaction score is 1 or 2."
        onChange={(e) =>
          onChange(
            e.target.value
              ? withPage(def, index, { title_when_low_csat: e.target.value })
              : withPage(def, index, {}, ['title_when_low_csat']),
          )
        }
      />
      {!readOnly && unused.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4 md:flex-row md:items-end">
          <div className="flex-1">
            <SelectField
              label="Add a question to this page"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              helper="Only answers the system can store are available. New kinds of question need a change to the system (Rule 15)."
            >
              <option value="">Choose an answer slot</option>
              {unused.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </SelectField>
          </div>
          <Button
            variant="secondary"
            className="md:mb-7"
            disabled={!slot}
            onClick={() => {
              onChange(addQuestion(def, index, slot));
              setSlot('');
            }}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------
function DiffView({
  entries,
  baseLabel,
  scale,
}: {
  entries: DiffEntry[];
  baseLabel: string;
  scale: boolean;
}) {
  const title = (e: DiffEntry) =>
    e.target === 'intro'
      ? 'Introduction'
      : e.target.startsWith('page:')
        ? `Page ${e.target.slice(5)}`
        : e.target;
  return (
    <div className="flex flex-col gap-4">
      {scale && (
        <Alert tone="warning" title="Rating scales changed">
          Trends will break at the publish date. Charts will show “Not comparable” across it.
        </Alert>
      )}
      {entries.length === 0 ? (
        <p className="text-secondary">No differences from {baseLabel}.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {entries.map((e, i) => (
            <li key={i} className="grid gap-1 p-3 text-[14px] leading-5 md:grid-cols-[180px_1fr]">
              <span>
                <Badge tone={e.kind === 'added' ? 'success' : e.kind === 'removed' ? 'danger' : 'info'}>
                  {e.kind}
                </Badge>{' '}
                <span className="font-medium">{title(e)}</span>
                {e.field && <span className="block text-secondary">{e.field}</span>}
              </span>
              <span className="break-words">
                {e.before !== undefined && (
                  <span className="block">
                    <span className="sr-only">Before: </span>
                    <del className="text-danger">{e.before}</del>
                  </span>
                )}
                {e.after !== undefined && (
                  <span className="block">
                    <span className="sr-only">After: </span>
                    <ins className="text-success no-underline">{e.after}</ins>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval panel (survey.publish.approve)
// ---------------------------------------------------------------------------
function ApprovalPanel({
  row,
  preparerName,
  onDone,
}: {
  row: VersionRow;
  preparerName: string;
  onDone: () => void;
}) {
  const { supabase, claims } = useSession();
  const [confirming, setConfirming] = useState<{ scale: boolean } | null>(null);
  const [ack, setAck] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const own = row.prepared_by === claims?.sub;
  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('survey_version_validate', { p_id: row.id });
      if (error) throw error;
      return data as { problems: GuardrailProblem[]; scale_changed: boolean };
    },
    onSuccess: (r) => {
      setAck(false);
      if (r.problems.length === 0) setConfirming({ scale: r.scale_changed });
    },
  });
  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('survey_version_approve_publish', {
        p_id: row.id,
        p_confirm_scale_change: confirming?.scale ?? false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirming(null);
      onDone();
    },
  });
  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('survey_version_reject', {
        p_id: row.id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRejecting(false);
      setReason('');
      onDone();
    },
  });
  return (
    <Section
      title="Review and publish"
      description={`Prepared by ${preparerName}. Someone other than the person who prepared it must publish it.`}
    >
      <div className="flex flex-col gap-4 p-4 md:p-5">
        {own ? (
          <Alert tone="warning" title="You prepared this version">
            Someone other than the person who prepared it must publish it. Ask another Executive to review it.
          </Alert>
        ) : (
          <p className="text-secondary">
            Check the preview and the changes, then publish or send it back. Publishing retires the current
            version; new surveys use this one straight away, with the answer options as they are at that
            moment.
          </p>
        )}
        {check.error && <ErrorAlert error={check.error} />}
        {check.data && check.data.problems.length > 0 && (
          <Alert tone="danger" title="This version breaks the survey guardrails and can’t be published">
            <ul className="list-disc pl-5">
              {check.data.problems.map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button disabled={own} busy={check.isPending} onClick={() => check.mutate()}>
            Approve and publish
          </Button>
          <Button variant="secondary" disabled={own} onClick={() => setRejecting(true)}>
            Send back with comments
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Publish version ${row.version_no}?`}
        tone="primary"
        confirmLabel="Publish"
        busy={approve.isPending}
        error={approve.error}
        confirmDisabled={!!confirming?.scale && !ack}
        onConfirm={() => approve.mutate()}
      >
        <p className="text-secondary">
          New surveys will use version {row.version_no} immediately. Responses already given stay linked to
          their version.
        </p>
        {confirming?.scale && (
          <>
            <Alert tone="warning" title="Trends will break at this date">
              The rating scales differ from the published version, so scores before and after today can’t be
              compared directly.
            </Alert>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-[var(--color-brand)]"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>I understand that trends will break at this date.</span>
            </label>
          </>
        )}
      </ConfirmDialog>
      <Dialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Send back with comments"
        description="The draft returns to the preparer with your comments."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={reject.isPending}
              disabled={!reason.trim() || reason.length > 500}
              onClick={() => reject.mutate()}
            >
              Send back
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {reject.error && <ErrorAlert error={reject.error} />}
          <TextArea
            label="What should change?"
            value={reason}
            maxLength={500}
            rows={4}
            onChange={(e) => setReason(e.target.value)}
            counter={`${reason.length}/500`}
          />
        </div>
      </Dialog>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Editor body (keyed by row.version so a save or reload resets local state)
// ---------------------------------------------------------------------------
function VersionEditor({
  row,
  base,
  snapshot,
  snapshotError,
  preparerName,
}: {
  row: VersionRow;
  base: VersionRow | null;
  snapshot: Snapshot | null;
  snapshotError: unknown;
  preparerName: string;
}) {
  const { supabase, can } = useSession();
  const qc = useQueryClient();
  const editable = row.status === 'draft' && can('survey.edit');
  const [def, setDef] = useState<Definition>(row.definition);
  const [note, setNote] = useState(row.change_note ?? '');
  const [selected, setSelected] = useState<Selection>({ kind: 'survey' });
  const [tab, setTab] = useState('edit');
  const dirty = JSON.stringify(def) !== JSON.stringify(row.definition) || note !== (row.change_note ?? '');
  const problems = useMemo(() => guardrails(def), [def]);
  const diff = useMemo(() => diffDefinitions(base?.definition ?? null, def), [base, def]);
  const scale = useMemo(() => scaleChanged(base?.definition ?? null, def), [base, def]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['survey'] });
  };
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('survey_version_update', {
        p_id: row.id,
        p_definition: def,
        p_change_note: note,
        p_expected_version: row.version,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const validateServer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('survey_version_validate', { p_id: row.id });
      if (error) throw error;
      return data as { problems: GuardrailProblem[]; scale_changed: boolean };
    },
  });
  const request = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('survey_version_request_publish', { p_id: row.id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('survey_version_withdraw', { p_id: row.id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const actionError = save.error ?? request.error ?? withdraw.error ?? validateServer.error;

  const problemsFor = (sel: Selection) =>
    problems.filter((p) =>
      sel.kind === 'question'
        ? p.path === `questions.${sel.id}`
        : sel.kind === 'page'
          ? p.path === `pages.${sel.index}`
          : p.path === 'pages' ||
            (p.path.startsWith('questions.') && !questions(def).some((q) => `questions.${q.id}` === p.path)),
    );
  const selectedQuestion =
    selected.kind === 'question' ? questions(def).find((q) => q.id === selected.id) : undefined;

  const outline = (
    <nav aria-label="Survey outline" className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setSelected({ kind: 'survey' })}
        aria-current={selected.kind === 'survey' ? 'true' : undefined}
        className={`flex min-h-11 items-center justify-between rounded-sm px-3 text-left ${
          selected.kind === 'survey' ? 'bg-brand-50 font-medium text-brand' : 'hover:bg-surface-muted'
        }`}
      >
        Introduction and checks
        {problemsFor({ kind: 'survey' }).length > 0 && (
          <Badge tone="danger">{problemsFor({ kind: 'survey' }).length}</Badge>
        )}
      </button>
      {def.pages.map((p, i) => (
        <div key={p.id} className="mt-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setSelected({ kind: 'page', index: i })}
            aria-current={selected.kind === 'page' && selected.index === i ? 'true' : undefined}
            className={`flex min-h-11 items-center justify-between rounded-sm px-3 text-left text-[14px] font-medium uppercase tracking-[1px] ${
              selected.kind === 'page' && selected.index === i
                ? 'bg-brand-50 text-brand'
                : 'text-secondary hover:bg-surface-muted'
            }`}
          >
            <span>
              Page {i + 1}: <span className="normal-case tracking-normal">{p.title || 'Untitled'}</span>
            </span>
            {problemsFor({ kind: 'page', index: i }).length > 0 && <Badge tone="danger">!</Badge>}
          </button>
          {p.questions.map((q) => {
            const n = problemsFor({ kind: 'question', id: q.id }).length;
            const active = selected.kind === 'question' && selected.id === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelected({ kind: 'question', id: q.id })}
                aria-current={active ? 'true' : undefined}
                className={`ml-3 flex min-h-11 items-center justify-between gap-2 rounded-sm border-l-4 px-3 text-left text-[14px] ${
                  active ? 'border-brand bg-brand-50 text-brand' : 'border-transparent hover:bg-surface-muted'
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{q.id}</span>
                  <span className="block truncate text-secondary">{q.label || 'No wording yet'}</span>
                </span>
                {n > 0 && (
                  <Badge tone="danger">
                    {n}
                    <span className="sr-only"> problem{n === 1 ? '' : 's'}</span>
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const inspector =
    selected.kind === 'question' && selectedQuestion ? (
      <QuestionInspector
        def={def}
        q={selectedQuestion}
        snapshot={snapshot}
        readOnly={!editable}
        onChange={setDef}
        problems={problemsFor(selected)}
      />
    ) : selected.kind === 'page' ? (
      <PageInspector
        def={def}
        index={selected.index}
        readOnly={!editable}
        onChange={setDef}
        problems={problemsFor(selected)}
      />
    ) : (
      <div className="flex flex-col gap-5">
        <TextArea
          label="Introduction"
          value={def.intro}
          rows={2}
          disabled={!editable}
          maxLength={300}
          onChange={(e) => setDef({ ...def, intro: e.target.value })}
          helper="Shown above the first question."
        />
        {editable && (
          <TextArea
            label="Change note"
            optional
            value={note}
            rows={2}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            helper="What changed and why, for the reviewer and the list of versions."
            counter={`${note.length}/500`}
          />
        )}
        <div aria-live="polite">
          {problems.length === 0 ? (
            <Alert tone="success">No guardrail problems.</Alert>
          ) : (
            <Alert
              tone="danger"
              title={`${problems.length} guardrail problem${problems.length === 1 ? '' : 's'}`}
            >
              <ul className="list-disc pl-5">
                {problems.map((p, i) => (
                  <li key={i}>
                    {p.path}: {p.message}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
        {validateServer.data && (
          <Alert
            tone={validateServer.data.problems.length ? 'danger' : 'success'}
            title={
              validateServer.data.problems.length
                ? 'The server found problems in the saved draft'
                : 'The saved draft passed the server check'
            }
          >
            {validateServer.data.problems.length > 0 && (
              <ul className="list-disc pl-5">
                {validateServer.data.problems.map((p, i) => (
                  <li key={i}>{p.message}</li>
                ))}
              </ul>
            )}
            {validateServer.data.scale_changed && <p>Rating scales differ from the published version.</p>}
          </Alert>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {row.status === 'draft' && row.rejection_reason && (
        <Alert tone="warning" title="Sent back by the reviewer">
          {row.rejection_reason}
        </Alert>
      )}
      {row.status === 'pending_approval' && (
        <Alert tone="info" title="Waiting for approval">
          The draft is locked while it waits. Withdraw the request to make more changes.
        </Alert>
      )}
      {(row.status === 'published' || row.status === 'retired') && (
        <Alert tone="info">
          {row.status === 'published' ? 'This is the live survey.' : 'This version is retired.'} Published
          versions never change; start a new draft to make changes.
        </Alert>
      )}
      {snapshotError ? (
        <ErrorAlert error={snapshotError} title="The current answer options couldn’t be loaded" />
      ) : null}
      {actionError && <ErrorAlert error={actionError} />}
      {(editable || row.status === 'pending_approval') && can('survey.edit') && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-float">
          {editable && (
            <>
              <Button busy={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
                Save draft
              </Button>
              <Button
                variant="secondary"
                busy={validateServer.isPending}
                disabled={dirty}
                onClick={() => validateServer.mutate()}
              >
                Check on server
              </Button>
              <Button
                variant="secondary"
                busy={request.isPending}
                disabled={dirty || problems.length > 0}
                onClick={() => request.mutate()}
              >
                Request publication
              </Button>
              <span className="text-[14px] text-secondary" aria-live="polite">
                {dirty
                  ? 'Unsaved changes'
                  : problems.length > 0
                    ? 'Fix the problems before requesting publication'
                    : 'Saved'}
              </span>
            </>
          )}
          {row.status === 'pending_approval' && (
            <Button variant="secondary" busy={withdraw.isPending} onClick={() => withdraw.mutate()}>
              Withdraw request
            </Button>
          )}
        </div>
      )}
      {row.status === 'pending_approval' && can('survey.publish.approve') && (
        <ApprovalPanel row={row} preparerName={preparerName} onDone={refresh} />
      )}
      <Tabs
        label="Survey views"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            value: 'edit',
            label: editable ? 'Edit' : 'Definition',
            content: (
              <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                <div className="rounded-lg bg-white p-3 lg:sticky lg:top-36 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
                  {outline}
                </div>
                <div className="rounded-lg bg-white p-4 md:p-6">{inspector}</div>
              </div>
            ),
          },
          {
            value: 'preview',
            label: 'Preview',
            content: snapshot ? (
              <SurveyPreview def={def} snapshot={snapshot} />
            ) : (
              <ListSkeleton label="Loading preview" />
            ),
          },
          {
            value: 'changes',
            label: `Changes${diff.length ? ` (${diff.length})` : ''}`,
            content: (
              <div className="rounded-lg bg-white p-4 md:p-6">
                <p className="mb-4 text-secondary">
                  {base
                    ? `Compared with version ${base.version_no} (${STATUS_LABEL[base.status].toLowerCase()}).`
                    : 'There is no earlier version to compare with.'}
                </p>
                <DiffView
                  entries={diff}
                  baseLabel={base ? `version ${base.version_no}` : 'the earlier version'}
                  scale={scale}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/** S-B19 one survey version. */
export function SurveyVersionPage() {
  const { versionId } = useParams({ strict: false }) as { versionId?: string };
  const { can } = useSession();
  const version = useVersion(versionId ?? '');
  const base = useBaseVersion(version.data);
  const list = useVersionList();
  const row = version.data;
  const open = row?.status === 'draft' || row?.status === 'pending_approval';
  const live = usePreviewSnapshot(!!row && open && (can('survey.edit') || can('survey.publish.approve')));
  const meta = list.data?.find((v) => v.id === row?.id);
  const snapshot = open ? (live.data ?? null) : (row?.catalogue_snapshot ?? null);
  return (
    <>
      <PageHeader
        title={row ? `Survey questions · version ${row.version_no}` : 'Survey questions'}
        subtitle={
          row ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              {row.published_at && <span>Published {dateTime.format(new Date(row.published_at))}</span>}
              {meta && <span>Prepared by {meta.preparer_name ?? 'the system'}</span>}
              {meta?.approver_name && <span>· approved by {meta.approver_name}</span>}
            </span>
          ) : undefined
        }
        actions={
          <Link
            to="/config/survey"
            className="inline-flex h-12 items-center rounded-full px-5 font-medium text-brand hover:bg-brand-50"
          >
            All versions
          </Link>
        }
      />
      {version.isPending ? (
        <div className="rounded-lg bg-white">
          <ListSkeleton rows={6} label="Loading the survey version" />
        </div>
      ) : version.isError ? (
        <ErrorAlert error={version.error} />
      ) : row ? (
        <VersionEditor
          key={`${row.id}:${row.version}:${row.status}`}
          row={row}
          base={base.data ?? null}
          snapshot={snapshot}
          snapshotError={open ? live.error : null}
          preparerName={meta?.preparer_name ?? 'a staff member'}
        />
      ) : null}
    </>
  );
}
