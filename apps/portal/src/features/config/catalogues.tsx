// S-B17 Catalogues (M03): service channels, products, improvement-factor labels and case categories.
// The flag / auto-case toggles on improvement factors are managed on the flag-rules screen (S-B9a).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, EmptyState, TextField } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import {
  ActiveBadge,
  CodeChip,
  ConfirmDialog,
  ErrorAlert,
  ListSkeleton,
  ReorderButtons,
  Section,
  SelectField,
  SystemBadge,
  Tabs,
  Toggle,
  moveItem,
  updateVersioned,
} from './shared';
import { codeError, labelError, normaliseCode } from './validation';

type BranchRequirement = 'required' | 'optional' | 'hidden';

interface Row {
  id: string;
  code: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  version: number;
  is_other?: boolean;
  is_none?: boolean;
  official_name?: string;
  show_in_survey?: boolean;
  branch_requirement?: BranchRequirement;
  allows_other_text?: boolean;
}

type CatalogueKey = 'service_channels' | 'insurance_products' | 'improvement_factors' | 'case_categories';

interface CatalogueSpec {
  key: CatalogueKey;
  title: string;
  singular: string;
  description: ReactNode;
  select: string;
  /** Customer-facing lists reach the survey only at the next publish (A-73). */
  customerFacing: boolean;
}

export const BRANCH_REQUIREMENT_HELP: Record<BranchRequirement, string> = {
  required: 'Customers must choose the issuing branch. Use for walk-in, where a branch issued the policy.',
  optional: 'The branch question is shown, but customers may skip it.',
  hidden: 'No branch question. These responses are never attributed to a branch (digital, phone, agents).',
};

const SPECS: CatalogueSpec[] = [
  {
    key: 'service_channels',
    title: 'Service channels',
    singular: 'channel',
    description:
      'How the customer obtained the policy (Page 1). Each channel decides whether the branch question appears.',
    select:
      'id, code, label, branch_requirement, allows_other_text, is_other, is_active, sort_order, version',
    customerFacing: true,
  },
  {
    key: 'insurance_products',
    title: 'Products',
    singular: 'product',
    description:
      'Insurance products on Page 1. The customer label is what customers read; the official name is for staff and reports.',
    select: 'id, code, official_name, label, show_in_survey, is_other, is_active, sort_order, version',
    customerFacing: true,
  },
  {
    key: 'improvement_factors',
    title: 'Improvement factors',
    singular: 'factor',
    description:
      'The “main thing we could improve” options on Page 5. Whether choosing a factor raises a flag or opens a case is set on the Flag rules screen.',
    select: 'id, code, label, is_other, is_none, is_active, sort_order, version',
    customerFacing: true,
  },
  {
    key: 'case_categories',
    title: 'Case categories',
    singular: 'category',
    description: 'Categories staff choose when they open or classify a case. Not shown to customers.',
    select: 'id, code, label, is_active, sort_order, version',
    customerFacing: false,
  },
];

const isSystem = (r: Row) => !!(r.is_other || r.is_none);

function CatalogueDialog({
  spec,
  row,
  allCodes,
  nextOrder,
  onClose,
}: {
  spec: CatalogueSpec;
  row: Row | null;
  allCodes: string[];
  nextOrder: number;
  onClose: () => void;
}) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState(row?.label ?? '');
  const [official, setOfficial] = useState(row?.official_name ?? '');
  const [showInSurvey, setShowInSurvey] = useState(row?.show_in_survey ?? true);
  const [requirement, setRequirement] = useState<BranchRequirement>(row?.branch_requirement ?? 'hidden');
  const [otherText, setOtherText] = useState(row?.allows_other_text ?? false);
  const [touched, setTouched] = useState(false);
  const isProduct = spec.key === 'insurance_products';
  const isChannel = spec.key === 'service_channels';
  const errors = {
    code: row ? null : codeError(code, { taken: allCodes }),
    label: labelError(label, 80, isProduct ? 'the customer label' : 'a label'),
    official: isProduct ? labelError(official, 120, 'the official name') : null,
  };
  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = { label: label.trim() };
      if (isProduct) Object.assign(patch, { official_name: official.trim(), show_in_survey: showInSurvey });
      if (isChannel) Object.assign(patch, { branch_requirement: requirement, allows_other_text: otherText });
      if (row) await updateVersioned(supabase, spec.key, row.id, row.version, patch);
      else {
        const { error } = await supabase.from(spec.key).insert({ ...patch, code, sort_order: nextOrder });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'catalogue', spec.key] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? `Edit ${row.label}` : `Add a ${spec.singular}`}
      description={
        spec.customerFacing
          ? 'Customers see new options and label changes when the next survey version is published.'
          : undefined
      }
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!Object.values(errors).some(Boolean)) save.mutate();
        }}
      >
        {save.error && <ErrorAlert error={save.error} />}
        {row ? (
          <p className="text-[14px] text-secondary">
            Code <CodeChip code={row.code} /> (permanent){row && isSystem(row) ? ' · system option' : ''}
          </p>
        ) : (
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(normaliseCode(e.target.value))}
            helper="Type it once: capital letters, digits, “_” or “-”. It can’t be changed or reused later."
            error={touched ? (errors.code ?? undefined) : undefined}
            autoComplete="off"
          />
        )}
        {isProduct && (
          <TextField
            label="Official name"
            value={official}
            maxLength={120}
            onChange={(e) => setOfficial(e.target.value)}
            helper="For staff and reports, e.g. “Fire and Allied Perils”."
            error={touched ? (errors.official ?? undefined) : undefined}
          />
        )}
        <TextField
          label={isProduct ? 'Customer label' : 'Label'}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          helper={spec.customerFacing ? 'Plain words customers recognise.' : undefined}
          error={touched ? (errors.label ?? undefined) : undefined}
        />
        {isProduct && (
          <Toggle
            label="Show in survey"
            helper="When off, the product stays available for reports but customers can’t choose it."
            checked={showInSurvey}
            onChange={setShowInSurvey}
          />
        )}
        {isChannel && (
          <>
            <SelectField
              label="Branch question"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value as BranchRequirement)}
              helper={BRANCH_REQUIREMENT_HELP[requirement]}
            >
              <option value="required">Required</option>
              <option value="optional">Optional</option>
              <option value="hidden">Hidden</option>
            </SelectField>
            <Toggle
              label="Allows other text"
              helper="Records that this option collects a typed description. The published survey asks for it where its rules say so (by default, for “Other”)."
              checked={otherText}
              onChange={setOtherText}
            />
          </>
        )}
        <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={save.isPending}>
            {row ? 'Save changes' : `Add ${spec.singular}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CatalogueList({ spec }: { spec: CatalogueSpec }) {
  const { supabase, can } = useSession();
  const qc = useQueryClient();
  const canEdit = can('config.catalogues');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [toggling, setToggling] = useState<Row | null>(null);
  const rows = useQuery({
    queryKey: ['config', 'catalogue', spec.key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(spec.key)
        .select(spec.select)
        .order('sort_order')
        .order('label');
      if (error) throw error;
      return data as unknown as Row[];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['config', 'catalogue', spec.key] });
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('catalogue_reorder', { p_catalogue: spec.key, p_ids: ids });
      if (error) throw error;
    },
    onMutate: (ids) => {
      // Optimistic order; the refetch brings the new versions.
      qc.setQueryData<Row[]>(['config', 'catalogue', spec.key], (old) =>
        old ? ids.map((id) => old.find((r) => r.id === id)).filter((r): r is Row => !!r) : old,
      );
    },
    onSettled: invalidate,
  });
  const setActive = useMutation({
    mutationFn: (r: Row) => updateVersioned(supabase, spec.key, r.id, r.version, { is_active: !r.is_active }),
    onSuccess: () => {
      setToggling(null);
      invalidate();
    },
  });
  const list = rows.data ?? [];
  const isChannel = spec.key === 'service_channels';
  const isProduct = spec.key === 'insurance_products';
  return (
    <Section
      title={spec.title}
      description={spec.description}
      actions={canEdit && <Button onClick={() => setEditing('new')}>Add {spec.singular}</Button>}
    >
      {spec.customerFacing && (
        <div className="px-4 pt-4">
          <Alert tone="info">
            New options, label changes and order reach customers when the next survey version is published.
            Deactivating an option removes it from new surveys straight away.
          </Alert>
        </div>
      )}
      {reorder.error && (
        <div className="px-4 pt-4">
          <ErrorAlert error={reorder.error} />
        </div>
      )}
      {rows.isPending ? (
        <ListSkeleton label={`Loading ${spec.title.toLowerCase()}`} />
      ) : rows.isError ? (
        <div className="p-4">
          <ErrorAlert error={rows.error} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={`No ${spec.title.toLowerCase()} yet`}
          action={canEdit && <Button onClick={() => setEditing('new')}>Add {spec.singular}</Button>}
        />
      ) : (
        <ol className="mt-2 divide-y divide-border" aria-label={`${spec.title} in survey order`}>
          {list.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
              {canEdit && (
                <ReorderButtons
                  name={r.label}
                  index={i}
                  count={list.length}
                  disabled={reorder.isPending}
                  onMove={(from, to) => reorder.mutate(moveItem(list, from, to).map((x) => x.id))}
                />
              )}
              <span className="min-w-52 flex-1 py-1">
                <span className="font-medium">{r.label}</span> <CodeChip code={r.code} />{' '}
                {isSystem(r) && <SystemBadge />}
                {isProduct && (
                  <span className="block text-[14px] text-secondary">
                    Official name: {r.official_name}
                    {r.show_in_survey === false && ' · hidden from the survey'}
                  </span>
                )}
                {isChannel && r.branch_requirement && (
                  <span className="block text-[14px] text-secondary">
                    Branch question:{' '}
                    <Badge tone={r.branch_requirement === 'required' ? 'brand' : 'neutral'}>
                      {r.branch_requirement}
                    </Badge>
                    {r.allows_other_text && ' · allows other text'}
                  </span>
                )}
              </span>
              <ActiveBadge active={r.is_active} />
              {canEdit && (
                <span className="flex gap-2">
                  <Button variant="ghost" className="h-11 px-4 text-[14px]" onClick={() => setEditing(r)}>
                    Edit<span className="sr-only"> {r.label}</span>
                  </Button>
                  {isSystem(r) ? (
                    <span className="flex h-11 items-center px-2 text-[14px] text-muted">Always offered</span>
                  ) : (
                    <Button
                      variant="ghost"
                      className="h-11 px-4 text-[14px]"
                      onClick={() => {
                        setActive.reset();
                        setToggling(r);
                      }}
                    >
                      {r.is_active ? 'Deactivate' : 'Reactivate'}
                      <span className="sr-only"> {r.label}</span>
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <CatalogueDialog
          spec={spec}
          row={editing === 'new' ? null : editing}
          allCodes={list.map((r) => r.code)}
          nextOrder={Math.max(0, ...list.map((r) => r.sort_order)) + 1}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={
          toggling?.is_active ? `Deactivate “${toggling.label}”?` : `Reactivate “${toggling?.label ?? ''}”?`
        }
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'}
        tone={toggling?.is_active ? 'danger' : 'primary'}
        busy={setActive.isPending}
        error={setActive.error}
        onConfirm={() => toggling && setActive.mutate(toggling)}
      >
        <p className="text-secondary">
          {toggling?.is_active
            ? spec.customerFacing
              ? 'Customers starting a new survey won’t see it. Past responses keep it, and reports still show it.'
              : 'Staff can’t choose it for new cases. Existing cases keep it.'
            : spec.customerFacing
              ? 'It becomes available again for new surveys.'
              : 'Staff can choose it again.'}
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/** S-B17 Catalogues. */
export function CataloguesPage() {
  const [tab, setTab] = useState<CatalogueKey>('service_channels');
  return (
    <>
      <PageHeader
        title="Catalogues"
        subtitle="Controlled lists used by the survey and by case handling. Entries are deactivated, never deleted."
      />
      <Tabs
        label="Catalogues"
        value={tab}
        onChange={(v) => setTab(v as CatalogueKey)}
        tabs={SPECS.map((s) => ({ value: s.key, label: s.title, content: <CatalogueList spec={s} /> }))}
      />
    </>
  );
}
