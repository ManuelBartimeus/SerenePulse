import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { toUserError, type UserFacingError } from '../lib/errors';
import { useSession } from '../lib/session';
import { AuthCard } from '../ui/auth-card';
import { Alert, Button, TextField } from '../ui/controls';

const MIN_PASSWORD = 8; // D-43
// The most common passwords, rejected regardless of length (SPEC AUTHENTICATION, compensating for D-43).
const COMMON = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'admin123',
  'welcome1',
  'welcome123',
  'letmein1',
  'abc12345',
  'football',
  'sunshine',
  'princess',
  'baseball',
  '11111111',
  '00000000',
  'serene123',
  'serene2026',
  'insurance',
  'password@1',
]);

export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common. Choose one that is harder to guess.';
  if (email && pw.toLowerCase() === email.toLowerCase())
    return "Don't use your email address as your password.";
  return null;
}

/** S-A0 sign in: email and password only (D-23, D-44). */
export function SignInPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { reason?: string; next?: string };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await signIn(email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    navigate({ to: search.next && search.next.startsWith('/') ? search.next : '/' });
  }

  return (
    <AuthCard title="Sign in to Serene CX">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {search.reason === 'idle' && (
          <Alert tone="info">You were signed out after 30 minutes without activity.</Alert>
        )}
        {search.reason === 'expired' && <Alert tone="info">Your session ended. Please sign in again.</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" busy={busy} className="w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <a
          href="/forgot-password"
          className="text-center text-[14px] font-medium text-brand underline-offset-2 hover:underline"
        >
          Forgot your password?
        </a>
      </form>
    </AuthCard>
  );
}

/** Set a new password: invite acceptance, password reset and forced change at first sign-in. */
export function SetPasswordPage() {
  const { supabase, session, claims, refreshClaims, ready } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (ready && !session) {
    return (
      <AuthCard title="This link has expired">
        <p className="text-secondary">
          Invitation and password-reset links work once and expire after 24 hours. Ask your system
          administrator for a new link.
        </p>
        <a href="/sign-in" className="mt-6 inline-block font-medium text-brand hover:underline">
          Back to sign in
        </a>
      </AuthCard>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, claims?.email);
    if (problem) return setFieldError(problem);
    if (password !== confirm) return setFieldError('The two passwords don’t match.');
    setFieldError(null);
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      return setError({
        message: /same/i.test(updateError.message)
          ? 'Choose a password different from your current one.'
          : /weak|short|least/i.test(updateError.message)
            ? `Use at least ${MIN_PASSWORD} characters.`
            : "We couldn't save your password. Please try again.",
        detail: updateError.message,
      });
    }
    const { error: rpcError } = await supabase.rpc('me_complete_password_change');
    if (rpcError) {
      setBusy(false);
      return setError(toUserError(rpcError));
    }
    await refreshClaims();
    navigate({ to: '/' });
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle={claims?.email ? <>For {claims.email}. You’ll use it every time you sign in.</> : undefined}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {error && (
          <Alert tone="danger" detail={error.detail}>
            {error.message}
          </Alert>
        )}
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helper={`At least ${MIN_PASSWORD} characters. A short phrase is easier to remember and harder to guess.`}
          error={fieldError ?? undefined}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" busy={busy} className="w-full">
          {busy ? 'Saving…' : 'Save password and continue'}
        </Button>
      </form>
    </AuthCard>
  );
}

/** Reset links are issued by an administrator while the portal sends no email (D-45). */
export function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?">
      <p className="text-secondary">
        Ask your system administrator for a password-reset link. They can create one from the Users page; it
        works once and expires in 24 hours.
      </p>
      <a href="/sign-in" className="mt-6 inline-block font-medium text-brand hover:underline">
        Back to sign in
      </a>
    </AuthCard>
  );
}
