import type { Quote } from '@serene/proposals';
import { formatDate, formatMoney } from '../lib/format';
import { Skeleton, cx } from '../ui/components';
import { Icon } from '../ui/icons';

export type QuoteState =
  | { kind: 'idle' }
  | { kind: 'loading'; previous?: Quote | undefined }
  | { kind: 'ready'; quote: Quote }
  | { kind: 'unavailable'; message: string };

export function QuoteBreakdown({ quote }: { quote: Quote }) {
  return (
    <div>
      <dl className="m-0 grid gap-2 text-[15px]">
        {quote.lines.map((l, i) => (
          <div key={`l${i}`} className="flex items-start justify-between gap-4">
            <dt className="min-w-0 text-secondary">{l.label}</dt>
            <dd className="tnum m-0 flex-none font-medium">{formatMoney(l.amount)}</dd>
          </div>
        ))}
        {quote.taxes.length > 0 && (
          <>
            <div className="flex items-start justify-between gap-4 border-t border-border-subtle pt-2">
              <dt className="text-secondary">Premium</dt>
              <dd className="tnum m-0 font-medium">{formatMoney(quote.premium)}</dd>
            </div>
            {quote.taxes.map((t, i) => (
              <div key={`t${i}`} className="flex items-start justify-between gap-4">
                <dt className="min-w-0 text-secondary">{t.label}</dt>
                <dd className="tnum m-0 flex-none font-medium">{formatMoney(t.amount)}</dd>
              </div>
            ))}
          </>
        )}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <dt className="font-bold">Total to pay</dt>
          <dd className="tnum m-0 text-[22px] font-bold tracking-tight">{formatMoney(quote.total)}</dd>
        </div>
      </dl>
      {quote.indicative && (
        <p className="mt-3 flex gap-2 rounded-xl bg-warning-bg px-3 py-2 text-[14px] leading-5 text-[#5e3d00]">
          <Icon name="info" size={18} className="mt-px flex-none" />
          Indicative price, confirmed when you submit.
        </p>
      )}
      {quote.notes.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-1 p-0 text-[13px] leading-[18px] text-secondary">
          {quote.notes.map((n) => (
            <li key={n} className="flex gap-1.5">
              <Icon name="check" size={14} className="mt-0.5 flex-none" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuoteSidebar({ state, productName }: { state: QuoteState; productName: string }) {
  return (
    <aside className="card sticky top-24 p-6" aria-labelledby="price-h">
      <p className="eyebrow">{productName}</p>
      <h2 id="price-h" className="h-section mt-1">
        Your price
      </h2>
      <div className="mt-4" aria-live="polite" aria-busy={state.kind === 'loading'}>
        <QuoteBody state={state} />
      </div>
    </aside>
  );
}

function QuoteBody({ state }: { state: QuoteState }) {
  if (state.kind === 'ready') return <QuoteBreakdown quote={state.quote} />;
  if (state.kind === 'loading')
    return state.previous ? (
      <div className="opacity-50 transition-opacity">
        <QuoteBreakdown quote={state.previous} />
      </div>
    ) : (
      <div className="grid gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-3 h-7 w-1/2" />
      </div>
    );
  return (
    <p className="text-[15px] leading-[22px] text-secondary">
      {state.kind === 'unavailable'
        ? state.message
        : 'Your price appears here as soon as you’ve answered the cover questions.'}
    </p>
  );
}

/** Phones: compact total above the action bar; tap for the breakdown. */
export function QuoteBarButton({ state, onOpen }: { state: QuoteState; onOpen: () => void }) {
  const q = state.kind === 'ready' ? state.quote : state.kind === 'loading' ? state.previous : undefined;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'mb-2 flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border-0 bg-brand-50 px-3.5 py-2 text-left',
        !q && 'opacity-90',
      )}
      aria-haspopup="dialog"
    >
      <span className="min-w-0 text-[14px]">
        {q ? (
          <>
            <span className="font-semibold text-secondary">
              {q.indicative ? 'Indicative price' : 'Your price'}{' '}
            </span>
            <span
              className={cx('tnum text-[17px] font-bold text-ink', state.kind === 'loading' && 'opacity-50')}
            >
              {formatMoney(q.total)}
            </span>
          </>
        ) : (
          <span className="font-semibold text-secondary">
            {state.kind === 'loading'
              ? 'Working out your price…'
              : 'Price shown once you’ve chosen your cover'}
          </span>
        )}
      </span>
      <span className="inline-flex flex-none items-center gap-1 text-[14px] font-semibold text-brand">
        Details
        <Icon name="chevronUp" size={16} />
      </span>
    </button>
  );
}

export function QuoteSheetBody({ state }: { state: QuoteState }) {
  return (
    <div aria-live="polite">
      <QuoteBody state={state} />
      {state.kind === 'ready' && (
        <p className="hint mt-4">Price valid until {formatDate(state.quote.validUntil)}.</p>
      )}
    </div>
  );
}
