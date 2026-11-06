import type { OtpStartResponse } from '@serene/proposals';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { accountApi, keys } from '../api/queries';
import { formatCountdown, formatPhoneInput, isGhanaMobile, toE164 } from '../lib/format';
import { Banner, Button } from '../ui/components';
import { Icon } from '../ui/icons';
import { PAGE, SiteFooter, SiteHeader, TitleBand, usePageTitle } from '../ui/shell';

const route = getRouteApi('/sign-in');

export function SignInPage() {
  const { redirect } = route.useSearch();
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<(OtpStartResponse & { phone: string }) | null>(null);
  usePageTitle(challenge ? 'Enter your code' : 'Sign in');

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <TitleBand
          crumbs={[{ label: 'Sign in' }]}
          title={challenge ? 'Enter your code' : 'Sign in or create an account'}
          intro={
            challenge ? (
              <>
                Enter the code we sent to{' '}
                <span className="font-semibold whitespace-nowrap text-ink">{challenge.maskedPhone}</span>.
              </>
            ) : (
              'Enter your mobile number. We’ll text you a 6-digit code. No password needed.'
            )
          }
        />
        <div className={PAGE}>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-20">
            <div className="min-w-0">
              {challenge ? (
                <CodeStep
                  challenge={challenge}
                  redirect={redirect}
                  onChangeNumber={() => setChallenge(null)}
                  onResent={(c) => setChallenge({ ...c, phone: challenge.phone })}
                />
              ) : (
                <PhoneStep
                  phone={phone}
                  setPhone={setPhone}
                  onSent={(c, p) => setChallenge({ ...c, phone: p })}
                />
              )}
            </div>
            <aside aria-labelledby="why-h" className="min-w-0 lg:pt-1">
              <h2 id="why-h" className="h-section">
                With your Serene account you can
              </h2>
              <span className="accent-bar mt-3" aria-hidden="true" />
              <ol className="steps mt-6">
                {[
                  [
                    'Get a price straight away',
                    'Motor, travel and home cover are priced as you answer. Business covers are priced by an underwriter.',
                  ],
                  [
                    'Fill in the proposal form and sign on screen',
                    'Save and come back at any time. Photos and documents are taken with your phone.',
                  ],
                  [
                    'Pay and download your certificate',
                    'Pay with Mobile Money or card. Your certificate and proposal stay in your account.',
                  ],
                ].map(([t, d], i) => (
                  <li key={t}>
                    <span className="step-num">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[16px] leading-6 font-medium">{t}</p>
                      <p className="card-text mt-1">{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function PhoneStep({
  phone,
  setPhone,
  onSent,
}: {
  phone: string;
  setPhone: (v: string) => void;
  onSent: (c: OtpStartResponse, e164: string) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!e164 || !isGhanaMobile(phone)) {
      setError('Enter a Ghana mobile number, for example 024 123 4567.');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await accountApi.otpStart({ phone: e164 });
      onSent(res, e164);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="enter">
      <div>
        <label htmlFor={id} className="label">
          Mobile number
        </label>
        <div className="input-affix mt-2">
          <span className="affix affix-start gap-2 text-ink">
            <span aria-hidden="true" className="text-[15px] font-medium">
              GH
            </span>
            <span aria-hidden="true" className="h-5 w-px bg-border-strong" />
          </span>
          <input
            ref={inputRef}
            id={id}
            className="input tnum !min-h-12 !pl-[56px] text-[18px] tracking-wide"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="024 123 4567"
            value={phone}
            onChange={(e) => {
              setPhone(formatPhoneInput(e.target.value));
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : `${id}-hint`}
            autoFocus
          />
        </div>
        {error ? (
          <p id={`${id}-err`} className="error-text mt-2" role="alert">
            <Icon name="alert" size={18} className="mt-px flex-none" />
            {error}
          </p>
        ) : (
          <p id={`${id}-hint`} className="hint mt-2">
            MTN, Telecel or AirtelTigo. You can also type +233.
          </p>
        )}
      </div>
      <Button type="submit" size="lg" block className="mt-6" busy={busy} busyLabel="Sending code">
        Send code
      </Button>
      <p className="mt-5 text-[14px] leading-[22px] text-secondary">
        By continuing you agree to our{' '}
        <a href="/terms" className="font-semibold">
          terms
        </a>{' '}
        and{' '}
        <a href="/privacy" className="font-semibold">
          privacy notice
        </a>
        .
      </p>
    </form>
  );
}

const LEN = 6;

function CodeStep({
  challenge,
  redirect,
  onChangeNumber,
  onResent,
}: {
  challenge: OtpStartResponse & { phone: string };
  redirect: string | undefined;
  onChangeNumber: () => void;
  onResent: (c: OtpStartResponse) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [digits, setDigits] = useState<string[]>(() => Array<string>(LEN).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(() => Date.now() + challenge.resendInSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const [resentNote, setResentNote] = useState('');
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const submitted = useRef('');

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    refs.current[0]?.focus();
  }, [challenge.challengeId]);

  // WebOTP (Chrome on Android): read the code from the SMS when it arrives.
  useEffect(() => {
    if (!('OTPCredential' in window)) return;
    const ac = new AbortController();
    (
      navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal,
      } as CredentialRequestOptions) as Promise<(Credential & { code?: string }) | null>
    )
      .then((cred) => {
        if (cred?.code) fill(cred.code);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [challenge.challengeId]);

  async function verify(code: string) {
    if (code.length !== LEN || submitted.current === code) return;
    submitted.current = code;
    setBusy(true);
    setError(null);
    try {
      const res = await accountApi.otpVerify({ challengeId: challenge.challengeId, code });
      qc.setQueryData(keys.me, res.profile);
      if (res.isNew || !res.profile.fullName) {
        await navigate({ to: '/welcome', search: redirect ? { redirect } : {}, replace: true });
      } else {
        await navigate({ to: redirect ?? '/', replace: true });
      }
    } catch (e) {
      submitted.current = '';
      setBusy(false);
      const expired = e instanceof ApiError && (e.status === 410 || /expired/i.test(e.message));
      setError(
        expired
          ? 'This code has expired. Send a new one below.'
          : errorMessage(e, 'That code is not right. Check the SMS and try again.'),
      );
      setDigits(Array<string>(LEN).fill(''));
      refs.current[0]?.focus();
    }
  }

  function fill(raw: string, from = 0) {
    const chars = raw
      .replace(/\D/g, '')
      .slice(0, LEN - from)
      .split('');
    if (chars.length === 0) return;
    const next = [...digits];
    chars.forEach((c, i) => (next[from + i] = c));
    setDigits(next);
    setError(null);
    const focusAt = Math.min(from + chars.length, LEN - 1);
    refs.current[focusAt]?.focus();
    const code = next.join('');
    if (code.length === LEN && !next.includes('')) void verify(code);
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      const res = await accountApi.otpStart({ phone: challenge.phone });
      onResent(res);
      setResendAt(Date.now() + res.resendInSeconds * 1000);
      setDigits(Array<string>(LEN).fill(''));
      setResentNote('We sent a new code. The old one no longer works.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setResending(false);
    }
  }

  const wait = Math.max(0, (resendAt - now) / 1000);

  return (
    <div className="enter">
      <button type="button" className="btn btn-ghost -ml-3 -mt-2 text-secondary" onClick={onChangeNumber}>
        <Icon name="arrowLeft" size={18} />
        Change number
      </button>

      {challenge.simulatedCode && (
        <Banner tone="info" icon="info" className="mt-4">
          <span>
            <strong className="font-semibold">Test mode:</strong> SMS is not connected yet. Your code is{' '}
            <span className="font-bold tracking-wider">{challenge.simulatedCode}</span>.
          </span>
        </Banner>
      )}

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void verify(digits.join(''));
        }}
      >
        <fieldset className="m-0 border-0 p-0">
          <legend className="label mb-3">6-digit code</legend>
          <div
            className="grid max-w-[400px] grid-cols-6 gap-1 min-[360px]:gap-2 sm:gap-3"
            onPaste={(e) => {
              e.preventDefault();
              fill(e.clipboardData.getData('text'));
            }}
          >
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="input tnum h-14 min-w-0 !px-0 text-center text-[24px] font-semibold sm:h-16"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={i === 0 ? LEN : 1}
                aria-label={`Digit ${i + 1} of ${LEN}`}
                aria-invalid={error ? true : undefined}
                value={d}
                disabled={busy}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  if (v.length > 1) fill(v, v.length >= LEN ? 0 : i);
                  else if (v.length === 1) fill(v, i);
                  else {
                    const next = [...digits];
                    next[i] = '';
                    setDigits(next);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digits[i] && i > 0) {
                    e.preventDefault();
                    const next = [...digits];
                    next[i - 1] = '';
                    setDigits(next);
                    refs.current[i - 1]?.focus();
                  } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
                  else if (e.key === 'ArrowRight' && i < LEN - 1) refs.current[i + 1]?.focus();
                }}
              />
            ))}
          </div>
        </fieldset>
        <div aria-live="assertive" className="min-h-0">
          {error && (
            <p className="error-text mt-3">
              <Icon name="alert" size={18} className="mt-px flex-none" />
              {error}
            </p>
          )}
        </div>
        <Button
          type="submit"
          size="lg"
          block
          className="mt-6"
          busy={busy}
          busyLabel="Checking"
          disabled={digits.includes('')}
        >
          Continue
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-secondary">
        <span>Didn’t get it?</span>
        {wait > 0 ? (
          <span className="tnum">Send a new code in {formatCountdown(wait)}</span>
        ) : (
          <button type="button" className="link min-h-11" onClick={() => void resend()} disabled={resending}>
            {resending ? 'Sending…' : 'Send a new code'}
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-[14px] text-secondary">
        {resentNote}
      </p>
    </div>
  );
}
