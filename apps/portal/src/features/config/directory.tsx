// S-B16 Branches & regions (M02): branches, regions, departments and the holiday calendar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
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
  Tabs,
  Toggle,
  configError,
  formatDay,
  moveItem,
  updateVersioned,
} from './shared';
import { codeError, labelError, normaliseCode } from './validation';

interface Region {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  version: number;
}
interface Branch {
  id: string;
  code: string;
  name: string;
  region_id: string;
  is_head_office: boolean;
  is_active: boolean;
  deactivated_at: string | null;
  sort_order: number;
  version: number;
}
interface BranchSummary {
  period: { from: string; to: string; tz: string };
  branches: {
    branch_id: string;
    managers: { user_id: string; display_name: string }[];
    manager_count: number;
    responses_30d: number;
    unverified_30d: number;
  }[];
}
interface Department {
  id: string;
  code: string;
  name: string;
  head_user_id: string | null;
  is_active: boolean;
  version: number;
}
interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  needs_confirmation: boolean;
}

function useRegions() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['config', 'regions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('regions')
        .select('id, code, name, is_active, sort_order, version')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as Region[];
    },
  });
}

function useBranches() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['config', 'branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, code, name, region_id, is_head_office, is_active, deactivated_at, sort_order, version')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as Branch[];
    },
  });
}

function useReorder(catalogue: 'branches' | 'regions') {
  const { supabase } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('catalogue_reorder', { p_catalogue: catalogue, p_ids: ids });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['config', catalogue] }),
  });
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
function BranchDialog({
  branch,
  regions,
  allCodes,
  nextOrder,
  onClose,
}: {
  branch: Branch | null;
  regions: Region[];
  allCodes: string[];
  nextOrder: number;
  onClose: () => void;
}) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState(branch?.name ?? '');
  const [regionId, setRegionId] = useState(branch?.region_id ?? '');
  const [headOffice, setHeadOffice] = useState(branch?.is_head_office ?? false);
  const [touched, setTouched] = useState(false);
  const isNew = !branch;
  const errors = {
    code: isNew ? codeError(code, { taken: allCodes }) : null,
    name: labelError(name, 80, 'the branch name'),
    region: regionId ? null : 'Choose the region.',
  };
  const regionChanged = branch && branch.region_id !== regionId;
  const save = useMutation({
    mutationFn: async () => {
      if (branch) {
        await updateVersioned(supabase, 'branches', branch.id, branch.version, {
          name: name.trim(),
          region_id: regionId,
          is_head_office: headOffice,
        });
      } else {
        const { error } = await supabase.from('branches').insert({
          code,
          name: name.trim(),
          region_id: regionId,
          is_head_office: headOffice,
          sort_order: nextOrder,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'branches'] });
      qc.invalidateQueries({ queryKey: ['config', 'branch-summary'] });
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    save.mutate();
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'Add a branch' : `Edit ${branch.name}`}
      description={
        isNew ? 'New branches are offered to customers once the next survey version is published.' : undefined
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {save.error && <ErrorAlert error={save.error} />}
        {isNew ? (
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(normaliseCode(e.target.value))}
            helper="A short permanent identifier, e.g. KSI-NORTH. It can’t be changed later."
            error={touched ? (errors.code ?? undefined) : undefined}
            autoComplete="off"
          />
        ) : (
          <p className="text-[14px] text-secondary">
            Code <CodeChip code={branch.code} /> (permanent)
          </p>
        )}
        <TextField
          label="Branch name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={touched ? (errors.name ?? undefined) : undefined}
          maxLength={80}
        />
        <SelectField
          label="Region"
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
          error={touched ? errors.region : null}
          helper={
            regionChanged
              ? 'Moving a branch is effective from now. Earlier responses keep the region they were submitted under.'
              : undefined
          }
        >
          <option value="">Choose a region</option>
          {regions
            .filter((r) => r.is_active || r.id === branch?.region_id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_active ? '' : ' (inactive)'}
              </option>
            ))}
        </SelectField>
        <Toggle
          label="Head office"
          helper="A label only. Digital and call-centre responses are never attributed to the head office."
          checked={headOffice}
          onChange={setHeadOffice}
        />
        <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={save.isPending}>
            {isNew ? 'Add branch' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function BranchesTab() {
  const { supabase, can } = useSession();
  const qc = useQueryClient();
  const branches = useBranches();
  const regions = useRegions();
  const summary = useQuery({
    queryKey: ['config', 'branch-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('branch_directory_summary');
      if (error) throw error;
      return data as BranchSummary;
    },
  });
  const reorder = useReorder('branches');
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);
  const canEdit = can('config.directory');

  const regionName = useMemo(() => new Map((regions.data ?? []).map((r) => [r.id, r.name])), [regions.data]);
  const stats = useMemo(
    () => new Map((summary.data?.branches ?? []).map((s) => [s.branch_id, s])),
    [summary.data],
  );

  const deactivate = useMutation({
    mutationFn: async (b: Branch) => {
      const { error } = await supabase.rpc('branch_deactivate', {
        p_branch_id: b.id,
        p_expected_version: b.version,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDeactivating(null);
      qc.invalidateQueries({ queryKey: ['config', 'branches'] });
    },
  });
  const reactivate = useMutation({
    mutationFn: (b: Branch) => updateVersioned(supabase, 'branches', b.id, b.version, { is_active: true }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['config', 'branches'] }),
  });

  const list = branches.data ?? [];
  const period = summary.data?.period;
  const impact = deactivating ? stats.get(deactivating.id) : undefined;

  return (
    <Section
      title="Branches"
      description={
        <>
          The issuing branches customers can choose on Page 1. Deactivated branches disappear from new surveys
          straight away but stay in analytics and history.
          {period && (
            <>
              {' '}
              Responses cover {formatDay(period.from)} – {formatDay(period.to)} (Accra time), by the branch
              the customer chose.
            </>
          )}
        </>
      }
      actions={canEdit && <Button onClick={() => setEditing('new')}>Add branch</Button>}
    >
      {(reorder.error || reactivate.error) && (
        <div className="p-4">
          <ErrorAlert error={reorder.error ?? reactivate.error} />
        </div>
      )}
      {summary.isError && (
        <div className="p-4">
          <Alert tone="warning" title="Manager and response counts are unavailable">
            {configError(summary.error).message}
          </Alert>
        </div>
      )}
      {branches.isPending || regions.isPending ? (
        <ListSkeleton rows={6} label="Loading branches" />
      ) : branches.isError ? (
        <div className="p-4">
          <ErrorAlert error={branches.error} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="No branches yet"
          action={canEdit && <Button onClick={() => setEditing('new')}>Add branch</Button>}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[14px] leading-5">
            <thead className="sticky top-0 bg-white text-secondary">
              <tr className="border-b border-border">
                {canEdit && <th className="w-24 px-4 py-3 font-medium">Order</th>}
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Region</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Active managers</th>
                <th className="px-4 py-3 text-right font-medium">Responses (30 days)</th>
                {canEdit && (
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((b, i) => {
                const s = stats.get(b.id);
                return (
                  <tr key={b.id} className="hover:bg-surface-muted">
                    {canEdit && (
                      <td className="px-2 py-1">
                        <ReorderButtons
                          name={b.name}
                          index={i}
                          count={list.length}
                          disabled={reorder.isPending}
                          onMove={(from, to) => reorder.mutate(moveItem(list, from, to).map((x) => x.id))}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="font-medium">{b.name}</span>{' '}
                      {b.is_head_office && <Badge tone="brand">Head office</Badge>}
                      <span className="mt-0.5 block">
                        <CodeChip code={b.code} />
                      </span>
                    </td>
                    <td className="px-4 py-3">{regionName.get(b.region_id) ?? '—'}</td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={b.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      {summary.isPending ? (
                        <span className="text-muted">Loading…</span>
                      ) : !s ? (
                        <span className="text-muted">—</span>
                      ) : s.manager_count === 0 ? (
                        <span className="text-muted">None assigned</span>
                      ) : (
                        s.managers.map((m) => m.display_name || 'Unnamed user').join(', ')
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {summary.isPending || !s ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <>
                          {s.responses_30d.toLocaleString('en-GH')}
                          {s.unverified_30d > 0 && (
                            <span className="block text-[12px] text-muted">
                              incl. {s.unverified_30d} unverified
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            className="h-11 px-4 text-[14px]"
                            onClick={() => setEditing(b)}
                          >
                            Edit<span className="sr-only"> {b.name}</span>
                          </Button>
                          {b.is_active ? (
                            <Button
                              variant="ghost"
                              className="h-11 px-4 text-[14px]"
                              onClick={() => {
                                deactivate.reset();
                                setDeactivating(b);
                              }}
                            >
                              Deactivate<span className="sr-only"> {b.name}</span>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              className="h-11 px-4 text-[14px]"
                              busy={reactivate.isPending && reactivate.variables?.id === b.id}
                              onClick={() => reactivate.mutate(b)}
                            >
                              Reactivate<span className="sr-only"> {b.name}</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <BranchDialog
          branch={editing === 'new' ? null : editing}
          regions={regions.data ?? []}
          allCodes={list.map((b) => b.code)}
          nextOrder={Math.max(0, ...list.map((b) => b.sort_order)) + 1}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title={`Deactivate ${deactivating?.name ?? 'branch'}?`}
        confirmLabel="Deactivate branch"
        busy={deactivate.isPending}
        error={deactivate.error}
        onConfirm={() => deactivating && deactivate.mutate(deactivating)}
      >
        <p>Impact summary:</p>
        <ul className="list-disc pl-6 text-secondary">
          <li>
            Customers starting a new survey will no longer see this branch. Surveys already open keep it.
          </li>
          <li>
            {impact
              ? `${impact.responses_30d.toLocaleString('en-GH')} response${impact.responses_30d === 1 ? '' : 's'} in the last 30 days`
              : 'Its responses'}{' '}
            stay in analytics, shown under “Inactive”, and in history.
          </li>
          <li>
            {impact && impact.manager_count > 0
              ? `${impact.manager_count} active manager${impact.manager_count === 1 ? '' : 's'} (${impact.managers
                  .map((m) => m.display_name || 'Unnamed user')
                  .join(
                    ', ',
                  )}) keep their access to this branch’s history. Review their roles in Users & roles.`
              : 'No active managers are assigned to this branch.'}
          </li>
          <li>You can reactivate it later. Its code stays reserved.</li>
        </ul>
      </ConfirmDialog>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------
function RegionDialog({
  region,
  allCodes,
  nextOrder,
  onClose,
}: {
  region: Region | null;
  allCodes: string[];
  nextOrder: number;
  onClose: () => void;
}) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState(region?.name ?? '');
  const [touched, setTouched] = useState(false);
  const errors = {
    code: region ? null : codeError(code, { taken: allCodes }),
    name: labelError(name, 80, 'the region name'),
  };
  const save = useMutation({
    mutationFn: async () => {
      if (region)
        await updateVersioned(supabase, 'regions', region.id, region.version, { name: name.trim() });
      else {
        const { error } = await supabase
          .from('regions')
          .insert({ code, name: name.trim(), sort_order: nextOrder });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'regions'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={region ? `Edit ${region.name}` : 'Add a region'}
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!errors.code && !errors.name) save.mutate();
        }}
      >
        {save.error && <ErrorAlert error={save.error} />}
        {region ? (
          <p className="text-[14px] text-secondary">
            Code <CodeChip code={region.code} /> (permanent)
          </p>
        ) : (
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(normaliseCode(e.target.value))}
            helper="Permanent, e.g. UPPER_EAST."
            error={touched ? (errors.code ?? undefined) : undefined}
          />
        )}
        <TextField
          label="Region name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          error={touched ? (errors.name ?? undefined) : undefined}
        />
        <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={save.isPending}>
            {region ? 'Save changes' : 'Add region'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RegionsTab() {
  const { supabase, can } = useSession();
  const qc = useQueryClient();
  const regions = useRegions();
  const branches = useBranches();
  const reorder = useReorder('regions');
  const [editing, setEditing] = useState<Region | 'new' | null>(null);
  const [toggling, setToggling] = useState<Region | null>(null);
  const canEdit = can('config.directory');
  const setActive = useMutation({
    mutationFn: (r: Region) =>
      updateVersioned(supabase, 'regions', r.id, r.version, { is_active: !r.is_active }),
    onSuccess: () => {
      setToggling(null);
      qc.invalidateQueries({ queryKey: ['config', 'regions'] });
    },
  });
  const list = regions.data ?? [];
  const activeBranches = (id: string) =>
    (branches.data ?? []).filter((b) => b.region_id === id && b.is_active);
  return (
    <Section
      title="Regions"
      description="Ghana regions used to group branches. A branch’s region changes are effective-dated, so earlier reports don’t shift."
      actions={canEdit && <Button onClick={() => setEditing('new')}>Add region</Button>}
    >
      {reorder.error && (
        <div className="p-4">
          <ErrorAlert error={reorder.error} />
        </div>
      )}
      {regions.isPending ? (
        <ListSkeleton label="Loading regions" />
      ) : regions.isError ? (
        <div className="p-4">
          <ErrorAlert error={regions.error} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="No regions yet" />
      ) : (
        <ul className="divide-y divide-border">
          {list.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
              {canEdit && (
                <ReorderButtons
                  name={r.name}
                  index={i}
                  count={list.length}
                  disabled={reorder.isPending}
                  onMove={(from, to) => reorder.mutate(moveItem(list, from, to).map((x) => x.id))}
                />
              )}
              <span className="min-w-40 flex-1">
                <span className="font-medium">{r.name}</span> <CodeChip code={r.code} />
                <span className="block text-[14px] text-secondary">
                  {branches.data ? `${activeBranches(r.id).length} active branches` : ''}
                </span>
              </span>
              <ActiveBadge active={r.is_active} />
              {canEdit && (
                <span className="flex gap-2">
                  <Button variant="ghost" className="h-11 px-4 text-[14px]" onClick={() => setEditing(r)}>
                    Edit<span className="sr-only"> {r.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 px-4 text-[14px]"
                    onClick={() => {
                      setActive.reset();
                      setToggling(r);
                    }}
                  >
                    {r.is_active ? 'Deactivate' : 'Reactivate'}
                    <span className="sr-only"> {r.name}</span>
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <RegionDialog
          region={editing === 'new' ? null : editing}
          allCodes={list.map((r) => r.code)}
          nextOrder={Math.max(0, ...list.map((r) => r.sort_order)) + 1}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.is_active ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling?.name ?? ''}?`}
        confirmLabel={toggling?.is_active ? 'Deactivate region' : 'Reactivate region'}
        tone={toggling?.is_active ? 'danger' : 'primary'}
        busy={setActive.isPending}
        error={setActive.error}
        onConfirm={() => toggling && setActive.mutate(toggling)}
      >
        {toggling?.is_active ? (
          <p className="text-secondary">
            {activeBranches(toggling.id).length > 0
              ? `${activeBranches(toggling.id).length} active branches are still in this region. They stay where they are; move them first if the region is being retired. `
              : ''}
            Inactive regions can’t be chosen for branches. History is unchanged.
          </p>
        ) : (
          <p className="text-secondary">The region can be chosen for branches again.</p>
        )}
      </ConfirmDialog>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
function usePeople() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['config', 'people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, status')
        .in('status', ['active', 'invited'])
        .order('display_name');
      if (error) throw error;
      return data as { user_id: string; display_name: string; status: string }[];
    },
  });
}

function DepartmentDialog({
  dept,
  allCodes,
  people,
  onClose,
}: {
  dept: Department | null;
  allCodes: string[];
  people: { user_id: string; display_name: string }[];
  onClose: () => void;
}) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState(dept?.name ?? '');
  const [head, setHead] = useState(dept?.head_user_id ?? '');
  const [touched, setTouched] = useState(false);
  const errors = {
    code: dept ? null : codeError(code, { allowHyphen: false, taken: allCodes }),
    name: labelError(name, 80, 'the department name'),
  };
  const save = useMutation({
    mutationFn: async () => {
      const patch = { name: name.trim(), head_user_id: head || null };
      if (dept) await updateVersioned(supabase, 'departments', dept.id, dept.version, patch);
      else {
        const { error } = await supabase.from('departments').insert({ code, ...patch });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'departments'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={dept ? `Edit ${dept.name}` : 'Add a department'}
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!errors.code && !errors.name) save.mutate();
        }}
      >
        {save.error && <ErrorAlert error={save.error} />}
        {dept ? (
          <p className="text-[14px] text-secondary">
            Code <CodeChip code={dept.code} /> (permanent)
          </p>
        ) : (
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(normaliseCode(e.target.value).replace(/-/g, '_'))}
            helper="Permanent, e.g. LEGAL. Capital letters, digits and “_”."
            error={touched ? (errors.code ?? undefined) : undefined}
          />
        )}
        <TextField
          label="Department name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          error={touched ? (errors.name ?? undefined) : undefined}
        />
        <SelectField
          label="Head of department"
          value={head}
          onChange={(e) => setHead(e.target.value)}
          helper="The person responsible for cases routed to this department."
        >
          <option value="">No head assigned</option>
          {people.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.display_name || 'Unnamed user'}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={save.isPending}>
            {dept ? 'Save changes' : 'Add department'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DepartmentsTab() {
  const { supabase, can } = useSession();
  const qc = useQueryClient();
  const canEdit = can('config.directory');
  const depts = useQuery({
    queryKey: ['config', 'departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, code, name, head_user_id, is_active, version')
        .order('name');
      if (error) throw error;
      return data as Department[];
    },
  });
  const people = usePeople();
  const names = useMemo(
    () => new Map((people.data ?? []).map((p) => [p.user_id, p.display_name])),
    [people.data],
  );
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const [toggling, setToggling] = useState<Department | null>(null);
  const setActive = useMutation({
    mutationFn: (d: Department) =>
      updateVersioned(supabase, 'departments', d.id, d.version, { is_active: !d.is_active }),
    onSuccess: () => {
      setToggling(null);
      qc.invalidateQueries({ queryKey: ['config', 'departments'] });
    },
  });
  const list = depts.data ?? [];
  return (
    <Section
      title="Departments"
      description="Cases are routed to departments. Deactivated departments can’t receive new cases; existing cases keep them."
      actions={canEdit && <Button onClick={() => setEditing('new')}>Add department</Button>}
    >
      {depts.isPending ? (
        <ListSkeleton label="Loading departments" />
      ) : depts.isError ? (
        <div className="p-4">
          <ErrorAlert error={depts.error} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="No departments yet" />
      ) : (
        <ul className="divide-y divide-border">
          {list.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-48 flex-1">
                <span className="font-medium">{d.name}</span> <CodeChip code={d.code} />
                <span className="block text-[14px] text-secondary">
                  Head: {d.head_user_id ? names.get(d.head_user_id) || 'A staff member' : 'Not assigned'}
                </span>
              </span>
              <ActiveBadge active={d.is_active} />
              {canEdit && (
                <span className="flex gap-2">
                  <Button variant="ghost" className="h-11 px-4 text-[14px]" onClick={() => setEditing(d)}>
                    Edit<span className="sr-only"> {d.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 px-4 text-[14px]"
                    onClick={() => {
                      setActive.reset();
                      setToggling(d);
                    }}
                  >
                    {d.is_active ? 'Deactivate' : 'Reactivate'}
                    <span className="sr-only"> {d.name}</span>
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <DepartmentDialog
          dept={editing === 'new' ? null : editing}
          allCodes={list.map((d) => d.code)}
          people={people.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.is_active ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling?.name ?? ''}?`}
        confirmLabel={toggling?.is_active ? 'Deactivate department' : 'Reactivate department'}
        tone={toggling?.is_active ? 'danger' : 'primary'}
        busy={setActive.isPending}
        error={setActive.error}
        onConfirm={() => toggling && setActive.mutate(toggling)}
      >
        <p className="text-secondary">
          {toggling?.is_active
            ? 'New cases can’t be routed here. Open cases keep this department until someone reassigns them.'
            : 'Cases can be routed to this department again.'}
        </p>
      </ConfirmDialog>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------
function HolidaysTab() {
  const { supabase, can } = useSession();
  const qc = useQueryClient();
  const canEdit = can('config.directory');
  const thisYear = Number(
    new Intl.DateTimeFormat('en-GH', { year: 'numeric', timeZone: 'Africa/Accra' }).format(new Date()),
  );
  const [year, setYear] = useState(thisYear);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [estimate, setEstimate] = useState(false);
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState<Holiday | null>(null);
  const holidays = useQuery({
    queryKey: ['config', 'holidays', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, holiday_date, name, needs_confirmation')
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`)
        .order('holiday_date');
      if (error) throw error;
      return data as Holiday[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['config', 'holidays'] });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('holidays')
        .insert({ holiday_date: date, name: name.trim(), needs_confirmation: estimate });
      if (error)
        throw error.code === '23505'
          ? { ...error, message: 'There is already a holiday on that date.', code: '22023' }
          : error;
    },
    onSuccess: () => {
      setAdding(false);
      setDate('');
      setName('');
      setEstimate(false);
      setTouched(false);
      refresh();
    },
  });
  const confirmDate = useMutation({
    mutationFn: async (h: Holiday) => {
      const { error } = await supabase.from('holidays').update({ needs_confirmation: false }).eq('id', h.id);
      if (error) throw error;
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (h: Holiday) => {
      const { error } = await supabase.from('holidays').delete().eq('id', h.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRemoving(null);
      refresh();
    },
  });
  const errors = {
    date: !date
      ? 'Choose the date.'
      : !date.startsWith(String(year))
        ? `Choose a date in ${year}, or switch year.`
        : null,
    name: labelError(name, 80, 'the holiday name'),
  };
  const list = holidays.data ?? [];
  const unconfirmed = list.filter((h) => h.needs_confirmation).length;
  return (
    <Section
      title="Holiday calendar"
      description="Public holidays are excluded from case SLA clocks (working days are Monday to Friday, 08:00–17:00 Accra time)."
      actions={
        <>
          <div className="flex items-center gap-1" role="group" aria-label="Year">
            <Button
              variant="secondary"
              className="h-11 px-4"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
            >
              ←
            </Button>
            <span className="min-w-16 text-center text-[16px] font-medium tabular-nums" aria-live="polite">
              {year}
            </span>
            <Button
              variant="secondary"
              className="h-11 px-4"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
            >
              →
            </Button>
          </div>
          {canEdit && <Button onClick={() => setAdding(true)}>Add holiday</Button>}
        </>
      }
    >
      {unconfirmed > 0 && (
        <div className="p-4">
          <Alert tone="warning" title={`${unconfirmed} date${unconfirmed === 1 ? '' : 's'} still to confirm`}>
            Moveable holidays such as Eid are estimates until the government announces them. Update the date
            when it’s announced, then mark it confirmed.
          </Alert>
        </div>
      )}
      {(confirmDate.error || remove.error) && (
        <div className="p-4">
          <ErrorAlert error={confirmDate.error ?? remove.error} />
        </div>
      )}
      {holidays.isPending ? (
        <ListSkeleton label="Loading holidays" />
      ) : holidays.isError ? (
        <div className="p-4">
          <ErrorAlert error={holidays.error} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={`No holidays recorded for ${year}`}
          action={canEdit && <Button onClick={() => setAdding(true)}>Add holiday</Button>}
        >
          SLA clocks will count every weekday in {year} until holidays are added.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-28 font-medium tabular-nums">{formatDay(h.holiday_date)}</span>
              <span className="min-w-40 flex-1">
                {h.name} {h.needs_confirmation && <Badge tone="warning">Needs confirmation</Badge>}
              </span>
              {canEdit && (
                <span className="flex gap-2">
                  {h.needs_confirmation && (
                    <Button
                      variant="ghost"
                      className="h-11 px-4 text-[14px]"
                      busy={confirmDate.isPending && confirmDate.variables?.id === h.id}
                      onClick={() => confirmDate.mutate(h)}
                    >
                      Mark confirmed<span className="sr-only"> {h.name}</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="h-11 px-4 text-[14px]"
                    onClick={() => {
                      remove.reset();
                      setRemoving(h);
                    }}
                  >
                    Remove<span className="sr-only"> {h.name}</span>
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={adding} onOpenChange={setAdding} title={`Add a holiday in ${year}`}>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!errors.date && !errors.name) add.mutate();
          }}
        >
          {add.error && <ErrorAlert error={add.error} />}
          <TextField
            label="Date"
            type="date"
            value={date}
            min={`${year}-01-01`}
            max={`${year}-12-31`}
            onChange={(e) => setDate(e.target.value)}
            error={touched ? (errors.date ?? undefined) : undefined}
          />
          <TextField
            label="Name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            error={touched ? (errors.name ?? undefined) : undefined}
          />
          <Toggle
            label="Date is an estimate"
            helper="Marks the holiday “Needs confirmation” until the official date is announced."
            checked={estimate}
            onChange={setEstimate}
          />
          <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" busy={add.isPending}>
              Add holiday
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'holiday'}?`}
        confirmLabel="Remove holiday"
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => removing && remove.mutate(removing)}
      >
        <p className="text-secondary">
          {removing && formatDay(removing.holiday_date)} will count as a working day for SLA clocks.
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/** S-B16 Branches & regions. */
export function DirectoryPage() {
  const [tab, setTab] = useState('branches');
  return (
    <>
      <PageHeader
        title="Branches & regions"
        subtitle="The organisation directory: branches, regions, departments and holidays."
      />
      <Tabs
        label="Directory sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'branches', label: 'Branches', content: <BranchesTab /> },
          { value: 'regions', label: 'Regions', content: <RegionsTab /> },
          { value: 'departments', label: 'Departments', content: <DepartmentsTab /> },
          { value: 'holidays', label: 'Holidays', content: <HolidaysTab /> },
        ]}
      />
    </>
  );
}
