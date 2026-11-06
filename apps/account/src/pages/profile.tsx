import { ID_TYPES, TITLES, type CustomerProfile } from '@serene/proposals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import { accountApi, keys, meQuery } from '../api/queries';
import { formatDate, formatDigitalAddressInput, formatGhanaCardInput, formatPhoneLocal } from '../lib/format';
import { Banner, Button, PageSkeleton } from '../ui/components';
import { Icon } from '../ui/icons';
import { CheckboxRow, FieldShell, TextArea, TextInput } from '../ui/inputs';
import { usePageTitle } from '../ui/shell';
import { dateBounds } from '../wizard/fields';

type Editable = Pick<
  CustomerProfile,
  | 'title'
  | 'fullName'
  | 'email'
  | 'dateOfBirth'
  | 'postalAddress'
  | 'residentialAddress'
  | 'digitalAddress'
  | 'occupation'
  | 'idType'
  | 'idNumber'
> & { marketingConsent: boolean };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ProfilePage() {
  usePageTitle('Your details');
  const me = useQuery(meQuery);
  if (me.isPending || !me.data) return <PageSkeleton />;
  return <ProfileForm profile={me.data} />;
}

function ProfileForm({ profile }: { profile: CustomerProfile }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [v, setV] = useState<Editable>(() => ({
    title: profile.title ?? '',
    fullName: profile.fullName ?? '',
    email: profile.email ?? '',
    dateOfBirth: profile.dateOfBirth ?? '',
    postalAddress: profile.postalAddress ?? '',
    residentialAddress: profile.residentialAddress ?? '',
    digitalAddress: profile.digitalAddress ?? '',
    occupation: profile.occupation ?? '',
    idType: profile.idType ?? '',
    idNumber: profile.idNumber ?? '',
    marketingConsent: profile.marketingConsent,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const up = <K extends keyof Editable>(k: K, val: Editable[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setSaved(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (v.email && !EMAIL.test(v.email.trim())) errs.email = 'Enter an email address like name@example.com.';
    if (v.idType === 'ghana_card' && v.idNumber && !/^GHA-\d{9}-\d$/.test(v.idNumber))
      errs.idNumber = 'Enter the Ghana Card number as printed, for example GHA-123456789-0.';
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) return document.getElementById(`p-${first}`)?.focus();
    setBusy(true);
    setFailure(null);
    try {
      const patch: Partial<CustomerProfile> = { marketingConsent: v.marketingConsent };
      for (const k of [
        'title',
        'fullName',
        'email',
        'dateOfBirth',
        'postalAddress',
        'residentialAddress',
        'digitalAddress',
        'occupation',
        'idType',
        'idNumber',
      ] as const) {
        const val = (v[k] ?? '').trim();
        if (val || profile[k]) patch[k] = val;
      }
      const next = await accountApi.updateMe(patch);
      qc.setQueryData(keys.me, next);
      setSaved(true);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await accountApi.signOut();
    } catch {
      /* the cookie is cleared server-side; continue either way */
    }
    qc.clear();
    await navigate({ to: '/sign-in', replace: true });
  }

  const dob = dateBounds({ minAge: 18, maxAge: 100 });

  return (
    <div className="wrap wrap-narrow py-6 md:py-10">
      <Link to="/" className="btn btn-ghost -ml-3 text-secondary">
        <Icon name="arrowLeft" size={18} />
        My account
      </Link>
      <h1 className="h-display mt-2">Your details</h1>
      <p className="mt-2 text-secondary">
        We fill these in on new proposals for you. Changes here don’t alter proposals you have already signed.
      </p>

      <div className="card card-pad mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-secondary">Mobile number (used to sign in)</p>
          <p className="tnum mt-0.5 text-[18px] font-bold">{formatPhoneLocal(profile.phone)}</p>
        </div>
        <div className="text-right text-[13px] text-secondary">
          <p>
            Customer number <span className="tnum font-semibold text-ink">{profile.customerNo}</span>
          </p>
          <p>Since {formatDate(profile.createdAt)}</p>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="card card-pad mt-4 grid gap-6">
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-4 tab:grid-cols-[140px_minmax(0,1fr)]">
          <FieldShell id="p-title" label="Title">
            <select
              id="p-title"
              className="input"
              value={v.title}
              onChange={(e) => up('title', e.target.value)}
              autoComplete="honorific-prefix"
            >
              <option value="">–</option>
              {TITLES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FieldShell>
          <TextInput
            id="p-fullName"
            label="Full name"
            value={v.fullName ?? ''}
            onChange={(x) => up('fullName', x)}
            autoComplete="name"
            autoCapitalize="words"
          />
        </div>
        <TextInput
          id="p-email"
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={v.email ?? ''}
          onChange={(x) => up('email', x)}
          error={errors.email}
        />
        <FieldShell id="p-dob" label="Date of birth">
          <input
            id="p-dob"
            type="date"
            className="input tnum max-w-xs"
            min={dob.min}
            max={dob.max}
            value={v.dateOfBirth ?? ''}
            onChange={(e) => up('dateOfBirth', e.target.value)}
            autoComplete="bday"
          />
        </FieldShell>
        <div className="grid gap-4 tab:grid-cols-2">
          <FieldShell id="p-idType" label="ID type">
            <select
              id="p-idType"
              className="input"
              value={v.idType ?? ''}
              onChange={(e) => up('idType', e.target.value)}
            >
              <option value="">Choose…</option>
              {ID_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FieldShell>
          <TextInput
            id="p-idNumber"
            label="ID number"
            value={v.idNumber ?? ''}
            onChange={(x) =>
              up('idNumber', v.idType === 'ghana_card' ? formatGhanaCardInput(x) : x.toUpperCase())
            }
            placeholder={v.idType === 'ghana_card' ? 'GHA-123456789-0' : undefined}
            autoCapitalize="characters"
            autoComplete="off"
            error={errors.idNumber}
          />
        </div>
        <TextArea
          label="Postal address"
          value={v.postalAddress ?? ''}
          onChange={(x) => up('postalAddress', x)}
          rows={2}
          maxLength={200}
        />
        <TextArea
          label="Residential address"
          value={v.residentialAddress ?? ''}
          onChange={(x) => up('residentialAddress', x)}
          rows={2}
          maxLength={200}
        />
        <div className="grid gap-4 tab:grid-cols-2">
          <TextInput
            label="GhanaPost GPS address"
            value={v.digitalAddress ?? ''}
            onChange={(x) => up('digitalAddress', formatDigitalAddressInput(x))}
            placeholder="GA-123-4567"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <TextInput
            label="Occupation"
            value={v.occupation ?? ''}
            onChange={(x) => up('occupation', x)}
            autoComplete="organization-title"
          />
        </div>
        <div className="border-t border-border-subtle pt-5">
          <CheckboxRow checked={v.marketingConsent} onChange={(x) => up('marketingConsent', x)}>
            Send me news and offers from Serene Insurance by SMS or email.
          </CheckboxRow>
        </div>
        {failure && (
          <Banner tone="danger" role="alert">
            {failure}
          </Banner>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" busy={busy} busyLabel="Saving">
            Save changes
          </Button>
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-success"
          >
            {saved && (
              <>
                <Icon name="check" size={18} /> Saved
              </>
            )}
          </span>
        </div>
      </form>

      <div className="card card-pad mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Sign out</p>
          <p className="text-[14px] text-secondary">You’ll need a new code to sign in again.</p>
        </div>
        <Button variant="secondary" onClick={() => void signOut()} busy={signingOut} busyLabel="Signing out">
          <Icon name="logout" size={18} />
          Sign out
        </Button>
      </div>
    </div>
  );
}
