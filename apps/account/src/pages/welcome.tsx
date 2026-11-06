import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import { accountApi, keys, meQuery } from '../api/queries';
import { formatPhoneLocal } from '../lib/format';
import { Banner, Button } from '../ui/components';
import { usePageTitle } from '../ui/shell';
import { TextInput } from '../ui/inputs';

const route = getRouteApi('/app/welcome');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function WelcomePage() {
  usePageTitle('About you');
  const { redirect } = route.useSearch();
  const me = useQuery(meQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(me.data?.fullName ?? '');
  const [email, setEmail] = useState(me.data?.email ?? '');
  const [errors, setErrors] = useState<{ email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const done = () => navigate({ to: redirect ?? '/', replace: true });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim() && !EMAIL.test(email.trim())) {
      setErrors({ email: 'Enter an email address like name@example.com, or leave it blank.' });
      document.getElementById('welcome-email')?.focus();
      return;
    }
    setErrors({});
    const patch: { fullName?: string; email?: string } = {};
    if (name.trim()) patch.fullName = name.trim().replace(/\s+/g, ' ');
    if (email.trim()) patch.email = email.trim();
    if (Object.keys(patch).length === 0) return void done();
    setBusy(true);
    try {
      const profile = await accountApi.updateMe(patch);
      qc.setQueryData(keys.me, profile);
      await done();
    } catch (err) {
      setFailure(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="wrap wrap-narrow py-8 md:py-14">
      <form onSubmit={submit} noValidate className="enter card card-pad">
        <p className="eyebrow">Signed in as {me.data ? formatPhoneLocal(me.data.phone) : ''}</p>
        <h1 className="h-display mt-2">About you</h1>
        <p className="mt-3 text-secondary">
          We use your name on your proposals and certificates, and email you copies. You can change these
          later.
        </p>
        <div className="mt-8 grid gap-6">
          <TextInput
            id="welcome-name"
            label="Full name"
            hint="As on your Ghana Card or passport."
            value={name}
            onChange={setName}
            autoComplete="name"
            autoCapitalize="words"
          />
          <TextInput
            id="welcome-email"
            label="Email address (optional)"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            error={errors.email}
          />
        </div>
        {failure && (
          <Banner tone="danger" className="mt-6" role="alert">
            {failure}
          </Banner>
        )}
        <div className="mt-8 flex flex-col-reverse gap-3 tab:flex-row tab:items-center tab:justify-between">
          <button type="button" className="btn btn-ghost" onClick={() => void done()}>
            Skip for now
          </button>
          <Button type="submit" size="lg" busy={busy} busyLabel="Saving">
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
