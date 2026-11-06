// Payment (simulated gateway that behaves like the real one): Mobile Money or card.
import type { Payment, StartPaymentRequest } from '@serene/proposals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import {
  accountApi,
  keys,
  meQuery,
  policyQuery,
  proposalQuery,
  type PaymentWithPolicy,
} from '../api/queries';
import { downloadCertificate } from '../lib/documents';
import {
  CARD_BRAND_LABEL,
  cardBrand,
  expiryValid,
  formatCardNumber,
  formatCountdown,
  formatDate,
  formatExpiryInput,
  formatMoney,
  formatPhoneInput,
  formatPhoneLocal,
  isGhanaMobile,
  luhnValid,
  toE164,
} from '../lib/format';
import { Banner, Button, PageSkeleton, cx } from '../ui/components';
import { Icon } from '../ui/icons';
import { TextInput } from '../ui/inputs';
import { usePageTitle } from '../ui/shell';
import { QuoteBreakdown } from '../wizard/quote-panel';

const route = getRouteApi('/app/proposals/$id/pay');
type Network = NonNullable<StartPaymentRequest['network']>;
const NETWORKS: { id: Network; label: string; hint: string }[] = [
  { id: 'mtn', label: 'MTN MoMo', hint: '024, 025, 053, 054, 055, 059' },
  { id: 'telecel', label: 'Telecel Cash', hint: '020, 050' },
  { id: 'airteltigo', label: 'AirtelTigo Money', hint: '026, 027, 056, 057' },
];
const APPROVE_SECONDS = 120;

export function PayPage() {
  usePageTitle('Pay');
  const { id } = route.useParams();
  const q = useQuery(proposalQuery(id));
  const [payment, setPayment] = useState<PaymentWithPolicy | null>(null);
  const [startedAt, setStartedAt] = useState(0);

  if (q.isPending) return <PageSkeleton />;
  if (q.isError)
    return (
      <div className="wrap wrap-narrow py-10">
        <Banner tone="danger">{errorMessage(q.error)}</Banner>
      </div>
    );
  const d = q.data;
  if (payment?.status === 'succeeded') return <Success payment={payment} productName={d.productName} />;
  if (d.status === 'issued' && d.policyId && !payment)
    return (
      <div className="wrap wrap-narrow py-10">
        <h1 className="h-display">This proposal is already paid</h1>
        <Link to="/policies/$id" params={{ id: d.policyId }} className="btn btn-primary btn-lg mt-6">
          View your policy
        </Link>
      </div>
    );
  if (d.status !== 'quoted' || !d.quote)
    return (
      <div className="wrap wrap-narrow py-10">
        <h1 className="h-display">Payment isn’t available yet</h1>
        <p className="mt-3 text-secondary">You can pay once your price is ready.</p>
        <Link to="/proposals/$id" params={{ id }} className="btn btn-secondary btn-lg mt-6">
          Back to the proposal
        </Link>
      </div>
    );

  const quote = d.quote;
  return (
    <div className="wrap py-6 md:py-10">
      <Link to="/" className="btn btn-ghost -ml-3 text-secondary">
        <Icon name="arrowLeft" size={18} />
        My account
      </Link>
      <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 max-w-[620px]">
          <h1 className="h-display">{payment ? 'Confirm the payment' : `Pay ${formatMoney(quote.total)}`}</h1>
          <p className="mt-2 text-secondary">
            {d.productName} · <span className="tnum">{d.proposalNo}</span>
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5 text-[13px] font-semibold text-[#444]">
            <Icon name="info" size={16} />
            Test payment: no money is taken
          </p>
          <div className="mt-6">
            {payment && payment.status === 'pending' ? (
              <Pending
                payment={payment}
                startedAt={startedAt}
                onUpdate={setPayment}
                onCancel={() => setPayment(null)}
              />
            ) : (
              <PayForm
                proposalId={id}
                amount={quote.total}
                failed={
                  payment?.status === 'failed'
                    ? (payment.failureReason ?? 'The payment did not go through.')
                    : null
                }
                onStarted={(p) => {
                  setPayment(p);
                  setStartedAt(Date.now());
                }}
              />
            )}
          </div>
        </div>
        <aside className="order-first lg:order-none">
          <div className="card p-5 lg:sticky lg:top-24 lg:p-6">
            <h2 className="h-section">Summary</h2>
            {d.insuredSubject && <p className="mt-1 text-[14px] text-secondary">{d.insuredSubject}</p>}
            <details className="group mt-3 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                <span className="text-[15px] font-semibold">Total to pay</span>
                <span className="flex items-center gap-2">
                  <span className="tnum text-[20px] font-bold">{formatMoney(quote.total)}</span>
                  <Icon name="chevronDown" size={18} className="transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="pt-2">
                <QuoteBreakdown quote={quote} />
              </div>
            </details>
            <div className="mt-4 hidden lg:block">
              <QuoteBreakdown quote={quote} />
            </div>
            <p className="mt-4 flex items-center gap-2 text-[13px] text-secondary">
              <Icon name="lock" size={16} />
              Price valid until {formatDate(quote.validUntil)}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PayForm({
  proposalId,
  amount,
  failed,
  onStarted,
}: {
  proposalId: string;
  amount: number;
  failed: string | null;
  onStarted: (p: Payment) => void;
}) {
  const me = useQuery(meQuery);
  const [method, setMethod] = useState<'momo' | 'card'>('momo');
  const [network, setNetwork] = useState<Network | null>(null);
  const [momo, setMomo] = useState(() => (me.data?.phone ? formatPhoneLocal(me.data.phone) : ''));
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', name: me.data?.fullName ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brand = cardBrand(card.number);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (method === 'momo') {
      if (!network) e.network = 'Choose your Mobile Money network.';
      if (!isGhanaMobile(momo)) e.momo = 'Enter the Mobile Money number, for example 024 123 4567.';
    } else {
      if (!luhnValid(card.number)) e.number = 'Check the card number.';
      if (!expiryValid(card.expiry)) e.expiry = 'Enter the expiry date as MM/YY.';
      if (!/^\d{3,4}$/.test(card.cvc)) e.cvc = 'Enter the 3 digits on the back of the card.';
      if (card.name.trim().length < 3) e.name = 'Enter the name on the card.';
    }
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(`pay-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const req: StartPaymentRequest =
        method === 'momo'
          ? { method, network: network as Network, account: toE164(momo) ?? momo }
          : {
              method,
              account: card.number.replace(/\s/g, ''),
              cardExpiry: card.expiry,
              cardCvc: card.cvc,
              cardName: card.name.trim(),
            };
      const p = await accountApi.startPayment(proposalId, req);
      onStarted(p);
    } catch (err) {
      setError(errorMessage(err, 'The payment could not be started. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {failed && (
        <Banner tone="danger" className="mb-5" title="Payment not completed" role="alert">
          {failed} You can try again or use another method.
        </Banner>
      )}
      <fieldset className="m-0 border-0 p-0">
        <legend className="label mb-3">How would you like to pay?</legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { id: 'momo', label: 'Mobile Money', icon: 'phone' },
              { id: 'card', label: 'Card', icon: 'card' },
            ] as const
          ).map((m) => (
            <label key={m.id} className="option !items-center">
              <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
              <span className="radio-dot" aria-hidden="true" />
              <Icon name={m.icon} size={20} className="flex-none text-secondary" />
              <span className="font-semibold">{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {method === 'momo' ? (
        <div className="mt-6 grid gap-6">
          <fieldset
            className="m-0 border-0 p-0"
            aria-describedby={errors.network ? 'pay-network-err' : undefined}
          >
            <legend className="label mb-3">Network</legend>
            <div className="grid gap-2.5 tab:grid-cols-3" id="pay-network" tabIndex={-1}>
              {NETWORKS.map((n) => (
                <label key={n.id} className={cx('option', errors.network && 'option-invalid')}>
                  <input
                    type="radio"
                    name="network"
                    checked={network === n.id}
                    onChange={() => setNetwork(n.id)}
                  />
                  <span className="radio-dot mt-0.5" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{n.label}</span>
                    <span className="tnum block text-[13px] text-secondary">{n.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.network && (
              <p id="pay-network-err" className="error-text mt-2">
                {errors.network}
              </p>
            )}
            <p className="hint mt-2">
              Choose the network your wallet is on, even if you moved your number from another network.
            </p>
          </fieldset>
          <TextInput
            id="pay-momo"
            label="Mobile Money number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={momo}
            onChange={(v) => setMomo(formatPhoneInput(v))}
            error={errors.momo}
            className="max-w-sm"
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-5">
          <div>
            <TextInput
              id="pay-number"
              label="Card number"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 5678 9012 3456"
              value={card.number}
              onChange={(v) => setCard({ ...card, number: formatCardNumber(v) })}
              error={errors.number}
              hint={brand ? CARD_BRAND_LABEL[brand] : 'Visa, Mastercard or Verve'}
              className="tnum"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              id="pay-expiry"
              label="Expiry"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              value={card.expiry}
              onChange={(v) => setCard((c) => ({ ...c, expiry: formatExpiryInput(v, c.expiry) }))}
              error={errors.expiry}
              maxLength={5}
            />
            <TextInput
              id="pay-cvc"
              label="Security code"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              value={card.cvc}
              onChange={(v) => setCard({ ...card, cvc: v.replace(/\D/g, '').slice(0, 4) })}
              error={errors.cvc}
              maxLength={4}
            />
          </div>
          <TextInput
            id="pay-name"
            label="Name on card"
            autoComplete="cc-name"
            autoCapitalize="words"
            value={card.name}
            onChange={(v) => setCard({ ...card, name: v })}
            error={errors.name}
          />
        </div>
      )}

      {error && (
        <Banner tone="danger" className="mt-6" role="alert">
          {error}
        </Banner>
      )}
      <Button type="submit" size="lg" block className="mt-8" busy={busy} busyLabel="Starting payment">
        <Icon name="lock" size={18} />
        Pay {formatMoney(amount)}
      </Button>
      <p className="mt-3 text-center text-[13px] text-secondary">
        {method === 'momo'
          ? 'You’ll approve the payment on your phone.'
          : 'Your bank may ask you to confirm it’s you.'}
      </p>
    </form>
  );
}

function Pending({
  payment,
  startedAt,
  onUpdate,
  onCancel,
}: {
  payment: PaymentWithPolicy;
  startedAt: number;
  onUpdate: (p: PaymentWithPolicy) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const left = Math.max(0, APPROVE_SECONDS - (now - startedAt) / 1000);
  const momo = payment.method === 'momo';
  const network = NETWORKS.find((n) => n.id === payment.network)?.label ?? 'Mobile Money';

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  // Poll the gateway status (the real flow completes on the handset).
  useEffect(() => {
    const t = window.setInterval(async () => {
      try {
        const p = await accountApi.payment(payment.reference);
        if (p.status !== 'pending') finish(p);
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => window.clearInterval(t);
  }, [payment.reference]);

  function finish(p: PaymentWithPolicy) {
    void qc.invalidateQueries({ queryKey: keys.proposals });
    void qc.invalidateQueries({ queryKey: keys.policies });
    onUpdate(p);
  }

  async function simulate(approve: boolean) {
    setBusy(approve ? 'approve' : 'decline');
    setError(null);
    try {
      finish(await accountApi.simulatePayment(payment.reference, approve));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="card overflow-hidden" role="status" aria-live="polite">
      {momo ? (
        <div className="p-6 text-center md:p-8">
          <div className="relative mx-auto grid h-20 w-20 place-items-center">
            <span className="pulse-ring absolute inset-0 rounded-full bg-brand-100" aria-hidden="true" />
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-brand text-white">
              <Icon name="phone" size={30} />
            </span>
          </div>
          <h2 className="mt-5 text-[22px] leading-7 font-bold">Approve the payment on your phone</h2>
          <p className="mt-2 text-secondary">
            We sent a {network} prompt to{' '}
            <span className="tnum font-semibold text-ink">{payment.maskedAccount}</span> for{' '}
            <span className="tnum font-semibold text-ink">{formatMoney(payment.amount)}</span>. Enter your
            MoMo PIN to approve.
          </p>
          <p className="tnum mt-4 text-[15px] font-semibold text-secondary">
            {left > 0
              ? `Waiting for approval · ${formatCountdown(left)}`
              : 'No approval yet. Check your phone, or try again.'}
          </p>
          <p className="mt-2 text-[13px] text-secondary">
            No prompt? Dial your network’s MoMo menu and check pending approvals.
          </p>
        </div>
      ) : (
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand">
              <Icon name="shield" size={26} />
            </span>
            <div>
              <h2 className="text-[20px] leading-7 font-bold">Confirm it’s you</h2>
              <p className="text-[14px] text-secondary">3-D Secure check by your card issuer</p>
            </div>
          </div>
          <dl className="m-0 mt-5 grid gap-2 rounded-2xl bg-subtle p-4 text-[15px]">
            <div className="flex justify-between gap-3">
              <dt className="text-secondary">Merchant</dt>
              <dd className="m-0 font-semibold">Serene Insurance</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-secondary">Amount</dt>
              <dd className="tnum m-0 font-semibold">{formatMoney(payment.amount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-secondary">Card</dt>
              <dd className="tnum m-0 font-semibold">{payment.maskedAccount}</dd>
            </div>
          </dl>
          <p className="tnum mt-4 text-[14px] text-secondary">
            Your bank would normally ask for a one-time code here · {formatCountdown(left)}
          </p>
        </div>
      )}
      <div className="border-t border-border-subtle bg-subtle p-4 md:p-5">
        <p className="mb-3 text-center text-[13px] font-semibold text-secondary">
          Test mode: these buttons stand in for {momo ? 'your phone' : 'your bank'}
        </p>
        <div className="grid gap-2 tab:grid-cols-2">
          <Button
            size="lg"
            onClick={() => void simulate(true)}
            busy={busy === 'approve'}
            disabled={!!busy}
            busyLabel="Approving"
          >
            {momo ? 'Approve on phone (test)' : 'Confirm (test)'}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => void simulate(false)}
            busy={busy === 'decline'}
            disabled={!!busy}
            busyLabel="Declining"
          >
            Decline (test)
          </Button>
        </div>
        {error && <p className="error-text mt-3 justify-center">{error}</p>}
        <button type="button" className="link mx-auto mt-4 block min-h-11 text-[14px]" onClick={onCancel}>
          Use a different payment method
        </button>
      </div>
    </div>
  );
}

function Success({ payment, productName }: { payment: PaymentWithPolicy; productName: string }) {
  usePageTitle('Your policy is ready');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const policy = useQuery({ ...policyQuery(payment.policyId ?? ''), enabled: !!payment.policyId });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    void qc.invalidateQueries({ queryKey: keys.policies });
  }, [qc]);

  async function download() {
    if (!policy.data) return;
    setBusy(true);
    setErr(null);
    try {
      await downloadCertificate(policy.data);
    } catch (e) {
      setErr(errorMessage(e, 'The certificate could not be created. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap wrap-narrow py-10 md:py-16">
      <div className="card card-pad enter text-center">
        <svg className="mx-auto" width="88" height="88" viewBox="0 0 52 52" aria-hidden="true">
          <circle
            className="tick-circle"
            cx="26"
            cy="26"
            r="25"
            fill="none"
            stroke="var(--success-strong)"
            strokeWidth="2.5"
          />
          <path
            className="tick-mark"
            fill="none"
            stroke="var(--success-strong)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 27l7 7 15-15"
          />
        </svg>
        <h1 ref={heading} tabIndex={-1} className="h-display mt-5 outline-none">
          Your policy is ready
        </h1>
        <p className="mt-2 text-secondary">
          We received <span className="tnum font-semibold text-ink">{formatMoney(payment.amount)}</span> for
          your {productName.toLowerCase()}. Receipt{' '}
          <span className="tnum font-semibold text-ink">{payment.reference}</span>.
        </p>
        {policy.data && (
          <dl className="m-0 mt-6 grid gap-3 rounded-2xl bg-subtle p-4 text-left text-[15px] tab:grid-cols-2">
            <div>
              <dt className="text-secondary">Policy number</dt>
              <dd className="tnum m-0 font-semibold break-all">{policy.data.policyNo}</dd>
            </div>
            <div>
              <dt className="text-secondary">Covered</dt>
              <dd className="m-0 font-semibold">
                {formatDate(policy.data.startsOn)} to {formatDate(policy.data.expiresOn)}
              </dd>
            </div>
          </dl>
        )}
        <div className="mt-7 grid gap-3 tab:grid-cols-2">
          <Button
            size="lg"
            onClick={() => void download()}
            busy={busy || policy.isPending}
            busyLabel={policy.isPending ? 'Loading' : 'Preparing PDF'}
          >
            <Icon name="download" size={18} />
            Download certificate
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() =>
              payment.policyId && void navigate({ to: '/policies/$id', params: { id: payment.policyId } })
            }
          >
            View policy
          </Button>
        </div>
        {err && (
          <p className="error-text mt-3 justify-center" role="alert">
            {err}
          </p>
        )}
        <p className="mt-6 text-[14px] text-secondary">
          You can download the certificate again from your account at any time.
        </p>
      </div>
    </div>
  );
}
