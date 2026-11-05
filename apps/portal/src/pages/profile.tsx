import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { toUserError, type UserFacingError } from '../lib/errors';
import { useSession } from '../lib/session';
import { Alert, Button, TextField } from '../ui/controls';
import { passwordProblem } from './auth';
import { PageHeader } from './shell';

/** S-B23 Profile: display name, password change, sign out everywhere. */
export function ProfilePage() {
  const { supabase, claims, signOut } = useSession();
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', claims?.sub ?? '')
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [name, setName] = useState('');
  useEffect(() => setName(profile.data?.display_name ?? ''), [profile.data]);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{
    tone: 'success' | 'danger';
    text: string;
    detail?: string | undefined;
  } | null>(null);

  const saveName = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('me_update_profile', { p_display_name: name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setMessage({ tone: 'success', text: 'Your name has been updated.' });
    },
    onError: (e) => setMessage({ tone: 'danger', text: toUserError(e).message }),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const problem = passwordProblem(password, claims?.email);
      if (problem) throw { message: problem } satisfies UserFacingError;
      const { error } = await supabase.auth.updateUser({ password });
      if (error)
        throw { message: "We couldn't change your password. Please try again.", detail: error.message };
      const { error: rpcError } = await supabase.rpc('me_complete_password_change');
      if (rpcError) throw toUserError(rpcError);
    },
    onSuccess: () => {
      setPassword('');
      setMessage({ tone: 'success', text: 'Your password has been changed.' });
    },
    onError: (e) => {
      const err = e as UserFacingError;
      setMessage({ tone: 'danger', text: err.message, detail: err.detail });
    },
  });

  return (
    <>
      <PageHeader title="Your profile" subtitle={claims?.email} />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone} detail={message.detail}>
            {message.text}
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="flex flex-col gap-5 rounded-lg bg-white p-6"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            saveName.mutate();
          }}
        >
          <h2 className="text-[18px] font-medium leading-6">Name</h2>
          <TextField
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          <Button type="submit" variant="secondary" busy={saveName.isPending} className="self-start">
            Save name
          </Button>
        </form>
        <form
          className="flex flex-col gap-5 rounded-lg bg-white p-6"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            changePassword.mutate();
          }}
        >
          <h2 className="text-[18px] font-medium leading-6">Password</h2>
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helper="At least 8 characters."
          />
          <Button type="submit" variant="secondary" busy={changePassword.isPending} className="self-start">
            Change password
          </Button>
        </form>
        <section className="flex flex-col gap-3 rounded-lg bg-white p-6 lg:col-span-2">
          <h2 className="text-[18px] font-medium leading-6">Sessions</h2>
          <p className="text-secondary">
            Signed in on a shared or lost device? Sign out everywhere, including here.
          </p>
          <Button
            variant="secondary"
            className="self-start"
            onClick={async () => {
              await supabase.auth.signOut({ scope: 'global' });
              await signOut();
            }}
          >
            Sign out of all devices
          </Button>
        </section>
      </div>
    </>
  );
}
