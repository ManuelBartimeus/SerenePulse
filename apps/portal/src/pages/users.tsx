import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toUserError, type UserFacingError } from '../lib/errors';
import { useSession } from '../lib/session';
import { Alert, Badge, Button, EmptyState, Spinner, TextField } from '../ui/controls';
import { Dialog } from '../ui/dialog';
import { PageHeader } from './shell';

interface Grant {
  id: string;
  role: string;
  role_name: string;
  scope_id: string | null;
  status: 'active' | 'pending_approval';
}
interface UserRow {
  user_id: string;
  email: string;
  display_name: string;
  status: 'invited' | 'active' | 'suspended' | 'deactivated';
  last_login_at: string | null;
  locked: boolean;
  grants: Grant[];
}
interface Role {
  key: string;
  name: string;
  description: string;
  scope: 'organisation' | 'branch';
}

const STATUS_TONE = {
  invited: 'info',
  active: 'success',
  suspended: 'warning',
  deactivated: 'neutral',
} as const;
const dateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Accra',
});

function useRoles() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('key, name, description, scope')
        .order('name');
      if (error) throw error;
      return data as Role[];
    },
    staleTime: Infinity,
  });
}

/** Role picker. Branch-scoped roles need branches, which arrive with the directory (MS-03). */
function RolePicker({
  roles,
  selected,
  onChange,
}: {
  roles: Role[];
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[14px] font-medium">Roles</legend>
      {roles.map((role) => {
        const disabled = role.scope === 'branch';
        const checked = selected.includes(role.key);
        return (
          <label
            key={role.key}
            className={`flex min-h-14 cursor-pointer gap-3 rounded-md border p-3 ${
              checked ? 'border-2 border-brand bg-brand-50' : 'border-border'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="checkbox"
              className="mt-1 size-5 accent-[var(--color-brand)]"
              checked={checked}
              disabled={disabled}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, role.key] : selected.filter((k) => k !== role.key))
              }
            />
            <span>
              <span className="block font-medium">{role.name}</span>
              <span className="block text-[14px] leading-5 text-secondary">
                {disabled ? 'Available once branches are set up in the directory.' : role.description}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { session, env } = useSession();
  const qc = useQueryClient();
  const roles = useRoles();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [done, setDone] = useState<{ pending: number } | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          displayName: name.trim(),
          grants: selected.map((role) => ({ role })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw { message: body.detail ?? "We couldn't send the invitation.", detail: body.request_id };
      return body as { pendingApproval: number };
    },
    onSuccess: (body) => {
      setDone({ pending: body.pendingApproval });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => setError(e as UserFacingError),
  });

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setEmail('');
      setName('');
      setSelected([]);
      setError(null);
      setDone(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) return setError({ message: 'Enter the person’s name and email.' });
    if (selected.length === 0) return setError({ message: 'Choose at least one role.' });
    invite.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={done ? 'Invitation sent' : 'Invite a staff member'}
      description={
        done
          ? undefined
          : 'They’ll get an email with a link to set their password. The link works once and expires in 24 hours.'
      }
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success">{email} has been invited.</Alert>
          {done.pending > 0 && (
            <Alert tone="warning" title="Waiting for a second approver">
              One of the roles can reveal customers’ contact details, so another Executive must approve it
              before it takes effect.
            </Alert>
          )}
          <Button onClick={() => close(false)}>Done</Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          {error && (
            <Alert tone="danger" detail={error.detail}>
              {error.message}
            </Alert>
          )}
          <TextField
            label="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <TextField
            label="Work email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
          {roles.data ? (
            <RolePicker roles={roles.data} selected={selected} onChange={setSelected} />
          ) : (
            <Spinner label="Loading roles" />
          )}
          <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
            <Button type="button" variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" busy={invite.isPending}>
              Send invitation
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { supabase, claims } = useSession();
  const qc = useQueryClient();
  const roles = useRoles();
  const [selected, setSelected] = useState(user.grants.map((g) => g.role));
  const [error, setError] = useState<UserFacingError | null>(null);
  const [confirm, setConfirm] = useState<'suspended' | 'deactivated' | null>(null);
  const isSelf = user.user_id === claims?.sub;

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const saveRoles = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.rpc('admin_set_grants', {
        p_user_id: user.user_id,
        p_grants: selected.map((role) => ({ role })),
      });
      if (e) throw e;
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => setError(toUserError(e)),
  });
  const setStatus = useMutation({
    mutationFn: async (status: 'active' | 'suspended' | 'deactivated') => {
      const { error: e } = await supabase.rpc('admin_set_user_status', {
        p_user_id: user.user_id,
        p_status: status,
      });
      if (e) throw e;
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => {
      setConfirm(null);
      setError(toUserError(e));
    },
  });
  const unlock = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.rpc('admin_unlock_user', { p_user_id: user.user_id });
      if (e) throw e;
    },
    onSuccess: refresh,
    onError: (e) => setError(toUserError(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={user.display_name || user.email}
      description={user.email}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <Alert tone="danger" detail={error.detail}>
            {error.message}
          </Alert>
        )}
        {user.locked && (
          <Alert tone="warning" title="Temporarily locked">
            Too many wrong passwords. The lock lifts by itself after 15 minutes.{' '}
            <button className="font-medium underline" onClick={() => unlock.mutate()}>
              Unlock now
            </button>
          </Alert>
        )}
        {roles.data && <RolePicker roles={roles.data} selected={selected} onChange={setSelected} />}
        <Button
          onClick={() => saveRoles.mutate()}
          busy={saveRoles.isPending}
          disabled={selected.length === 0}
        >
          Save roles
        </Button>
        {!isSelf && user.status !== 'invited' && (
          <div className="border-t border-border pt-5">
            <p className="mb-3 text-[14px] font-medium">Account</p>
            {confirm ? (
              <Alert
                tone="warning"
                title={confirm === 'suspended' ? 'Suspend this account?' : 'Deactivate this account?'}
              >
                They’ll be signed out everywhere immediately and won’t be able to sign in
                {confirm === 'suspended' ? ' until you reactivate them.' : '. Their history is kept.'}
                <div className="mt-3 flex gap-3">
                  <Button
                    variant="danger"
                    className="h-10"
                    busy={setStatus.isPending}
                    onClick={() => setStatus.mutate(confirm)}
                  >
                    {confirm === 'suspended' ? 'Suspend' : 'Deactivate'}
                  </Button>
                  <Button variant="secondary" className="h-10" onClick={() => setConfirm(null)}>
                    Keep active
                  </Button>
                </div>
              </Alert>
            ) : user.status === 'active' ? (
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setConfirm('suspended')}>
                  Suspend
                </Button>
                <Button variant="secondary" onClick={() => setConfirm('deactivated')}>
                  Deactivate
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                busy={setStatus.isPending}
                onClick={() => setStatus.mutate('active')}
              >
                Reactivate
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** S-B15 Users & roles. */
export function UsersPage() {
  const { supabase } = useSession();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [query, setQuery] = useState('');
  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_users');
      if (error) throw error;
      return data as UserRow[];
    },
  });

  const q = query.trim().toLowerCase();
  const rows = (users.data ?? []).filter(
    (u) => !q || u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q),
  );

  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle="Staff accounts are invite-only."
        actions={<Button onClick={() => setInviteOpen(true)}>Invite user</Button>}
      />
      <section className="rounded-lg bg-white">
        <div className="border-b border-border p-4">
          <div className="max-w-sm">
            <TextField
              label="Search"
              placeholder="Name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {users.isPending ? (
          <div className="flex flex-col gap-3 p-4" aria-busy>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-sm bg-surface-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : users.isError ? (
          <div className="p-4">
            <Alert tone="danger" detail={toUserError(users.error).detail}>
              {toUserError(users.error).message}
            </Alert>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={q ? 'No users match your search' : 'No users yet'} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((u) => (
              <li key={u.user_id}>
                <button
                  type="button"
                  onClick={() => setEditing(u)}
                  className="grid w-full gap-2 px-4 py-3 text-left hover:bg-surface-muted md:grid-cols-[2fr_2fr_1fr_1fr] md:items-center"
                >
                  <span>
                    <span className="block font-medium">{u.display_name || '—'}</span>
                    <span className="block text-[14px] text-secondary">{u.email}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {u.grants.length === 0 && <span className="text-[14px] text-muted">No roles</span>}
                    {u.grants.map((g) => (
                      <Badge key={g.id} tone={g.status === 'pending_approval' ? 'warning' : 'brand'}>
                        {g.role_name}
                        {g.status === 'pending_approval' ? ' · awaiting approval' : ''}
                      </Badge>
                    ))}
                  </span>
                  <span className="flex gap-1.5">
                    <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
                    {u.locked && <Badge tone="warning">locked</Badge>}
                  </span>
                  <span className="text-[14px] text-secondary">
                    {u.last_login_at
                      ? `Last sign-in ${dateTime.format(new Date(u.last_login_at))}`
                      : 'Never signed in'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {editing && <EditUserDialog user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

interface PendingGrant {
  id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  roles: { name: string } | null;
}

/** Executives approve or reject grants that can reveal contact details (A-68, D-36). */
export function ApprovalsPage() {
  const { supabase, claims } = useSession();
  const qc = useQueryClient();
  const [error, setError] = useState<UserFacingError | null>(null);
  const pending = useQuery({
    queryKey: ['pending-grants'],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from('user_role_grants')
        .select('id, user_id, granted_by, granted_at, roles(name)')
        .eq('status', 'pending_approval')
        .order('granted_at');
      if (e) throw e;
      const ids = [...new Set(data.flatMap((g) => [g.user_id, g.granted_by]).filter(Boolean))] as string[];
      const { data: people } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', ids);
      const names = new Map((people ?? []).map((p) => [p.user_id, p.display_name]));
      return (data as unknown as PendingGrant[]).map((g) => ({
        ...g,
        userName: names.get(g.user_id) || 'A user',
        grantorName: g.granted_by ? names.get(g.granted_by) || 'a System Administrator' : 'the system',
      }));
    },
  });
  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error: e } = await supabase.rpc('admin_decide_grant', { p_grant_id: id, p_approve: approve });
      if (e) throw e;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-grants'] }),
    onError: (e) => setError(toUserError(e)),
  });

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Roles that can reveal customers’ contact details need a second person’s approval."
      />
      {error && (
        <div className="mb-4">
          <Alert tone="danger" detail={error.detail}>
            {error.message}
          </Alert>
        </div>
      )}
      <section className="rounded-lg bg-white">
        {pending.isPending ? (
          <div className="p-4">
            <Spinner label="Loading" />
          </div>
        ) : pending.isError ? (
          <div className="p-4">
            <Alert tone="danger">{toUserError(pending.error).message}</Alert>
          </div>
        ) : pending.data.length === 0 ? (
          <EmptyState title="Nothing waiting for approval" />
        ) : (
          <ul className="divide-y divide-border">
            {pending.data.map((g) => {
              const own = g.granted_by === claims?.sub || g.user_id === claims?.sub;
              return (
                <li
                  key={g.id}
                  className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <p>
                    <span className="font-medium">{g.userName}</span> → {g.roles?.name}
                    <span className="block text-[14px] text-secondary">Requested by {g.grantorName}</span>
                    {own && (
                      <span className="block text-[14px] text-warning">
                        You requested this grant or would receive it, so another Executive must decide.
                      </span>
                    )}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      disabled={own}
                      onClick={() => decide.mutate({ id: g.id, approve: false })}
                    >
                      Reject
                    </Button>
                    <Button
                      disabled={own}
                      busy={decide.isPending}
                      onClick={() => decide.mutate({ id: g.id, approve: true })}
                    >
                      Approve
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
