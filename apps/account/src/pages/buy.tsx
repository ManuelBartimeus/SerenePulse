import {
  CATEGORY_LABELS,
  PRODUCTS,
  formById,
  isEmpty,
  type Answers,
  type Product,
  type ProductCategory,
} from '@serene/proposals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { accountApi, keys, proposalsQuery } from '../api/queries';
import { formatDate } from '../lib/format';
import { Banner, Button, Sheet, cx } from '../ui/components';
import { Icon } from '../ui/icons';
import { usePageTitle } from '../ui/shell';
import { CATEGORY_ICON } from './dashboard';

const route = getRouteApi('/app/buy');
type Audience = 'individual' | 'business';
const QUICK_QUOTE_KEY = 'serene.quickQuote';

function readQuickQuote(): { productCode: string; answers: Answers } | null {
  try {
    const raw = sessionStorage.getItem(QUICK_QUOTE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { productCode?: unknown; answers?: unknown };
    if (typeof v.productCode !== 'string' || !v.answers || typeof v.answers !== 'object') return null;
    return { productCode: v.productCode.toUpperCase(), answers: v.answers as Answers };
  } catch {
    return null;
  }
}

export const isAvailableOnline = (p: Product): boolean => (formById(p.formId)?.steps.length ?? 0) > 0;

export function priceLine(p: Product): string {
  return p.purchase === 'instant'
    ? 'Instant price'
    : 'Priced by an underwriter, usually within 1 working day';
}

export function BuyPage() {
  usePageTitle('Buy insurance');
  const search = route.useSearch();
  const navigate = useNavigate();
  const preselected = search.product ? PRODUCTS.find((p) => p.code === search.product) : undefined;
  const [audience, setAudience] = useState<Audience>(
    search.for ?? (preselected && !preselected.audience.includes('individual') ? 'business' : 'individual'),
  );
  const [selected, setSelected] = useState<Product | null>(preselected ?? null);
  const [category, setCategory] = useState<ProductCategory | null>(null);

  const groups = useMemo(() => {
    const list = PRODUCTS.filter((p) => p.audience.includes(audience));
    const byCat = new Map<ProductCategory, Product[]>();
    for (const p of list) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
    // Instant products first inside each category.
    for (const [k, v] of byCat)
      byCat.set(
        k,
        [...v].sort((a, b) => Number(b.purchase === 'instant') - Number(a.purchase === 'instant')),
      );
    return [...byCat.entries()];
  }, [audience]);

  function pick(p: Product) {
    setSelected(p);
    void navigate({
      to: '/buy',
      search: { product: p.code, ...(audience === 'business' ? { for: 'business' as const } : {}) },
      replace: true,
    });
  }
  function close() {
    setSelected(null);
    void navigate({ to: '/buy', search: audience === 'business' ? { for: 'business' } : {}, replace: true });
  }

  return (
    <div className="wrap py-6 md:py-10">
      <Link to="/" className="btn btn-ghost -ml-3 text-secondary">
        <Icon name="arrowLeft" size={18} />
        My account
      </Link>
      <h1 className="h-display mt-2">What would you like to insure?</h1>
      <p className="mt-2 max-w-2xl text-[17px] leading-7 text-secondary">
        Choose a cover to start the proposal form. You can save and come back at any time.
      </p>

      <div role="tablist" aria-label="Who is the cover for" className="segmented mt-6 !max-w-[360px]">
        {(['individual', 'business'] as const).map((a) => (
          <button
            key={a}
            role="tab"
            type="button"
            aria-selected={audience === a}
            className={cx(
              'min-h-[46px] rounded-[10px] font-semibold',
              audience === a
                ? 'bg-white text-brand shadow-[0_1px_2px_rgb(17_17_17/0.08),0_0_0_1px_var(--color-brand)]'
                : 'text-secondary',
            )}
            onClick={() => {
              setAudience(a);
              setCategory(null);
              void navigate({
                to: '/buy',
                search: a === 'business' ? { for: 'business' } : {},
                replace: true,
              });
            }}
          >
            {a === 'individual' ? 'Individuals' : 'Businesses'}
          </button>
        ))}
      </div>

      <div
        className="mt-6 -mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none]"
        role="tabpanel"
      >
        <div className="flex w-max gap-2 pb-1" role="group" aria-label="Filter by type of cover">
          {[null, ...groups.map(([c]) => c)].map((c) => {
            const on = category === c;
            return (
              <button
                key={c ?? 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => setCategory(c)}
                className={cx(
                  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px] font-semibold whitespace-nowrap transition-colors',
                  on ? 'border-ink bg-ink text-white' : 'border-border bg-white text-ink hover:border-ink',
                )}
              >
                {c && <Icon name={CATEGORY_ICON[c] ?? 'shield'} size={18} />}
                {c ? CATEGORY_LABELS[c] : 'All covers'}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="m-0 mt-5 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
        {groups
          .filter(([c]) => !category || c === category)
          .flatMap(([, products]) => products)
          .map((p) => (
            <li key={p.code}>
              <button
                type="button"
                onClick={() => pick(p)}
                className="card group flex h-full w-full cursor-pointer flex-col items-start gap-2 p-5 text-left transition-[border-color,box-shadow] hover:border-brand hover:shadow-sm"
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-secondary">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand">
                      <Icon name={CATEGORY_ICON[p.category] ?? 'shield'} size={18} />
                    </span>
                    {CATEGORY_LABELS[p.category]}
                  </span>
                  <Icon
                    name="arrowRight"
                    size={20}
                    className="flex-none text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                  />
                </span>
                <span className="mt-1 text-[17px] leading-6 font-bold text-ink">{p.name}</span>
                <span className="text-[15px] leading-[22px] text-secondary">{p.summary}</span>
                <span className="mt-auto pt-2">
                  {p.purchase === 'instant' ? (
                    <span className="chip chip-success">Instant price</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-secondary">
                      <Icon name="clock" size={16} />
                      Priced by an underwriter
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
      </ul>

      <Sheet open={!!selected} onClose={close} title={selected?.name ?? ''}>
        {selected && <ProductDetail product={selected} />}
      </Sheet>
    </div>
  );
}

function ProductDetail({ product }: { product: Product }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const proposals = useQuery(proposalsQuery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = formById(product.formId);
  const available = isAvailableOnline(product);
  const quick = useRef(readQuickQuote());
  const carry = quick.current && quick.current.productCode === product.code ? quick.current.answers : null;
  const drafts = (proposals.data ?? []).filter(
    (p) => p.productCode === product.code && (p.status === 'draft' || p.status === 'info_requested'),
  );

  const documents = useMemo(() => {
    if (!form) return [];
    const files = form.steps
      .flatMap((s) => s.sections.flatMap((sec) => sec.fields))
      .filter((f) => f.type === 'file' && f.required && !f.showIf);
    return files.slice(0, 4).map((f) => f.label);
  }, [form]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const answers = carry && Object.values(carry).some((v) => !isEmpty(v)) ? carry : undefined;
      const created = await accountApi.createProposal({
        productCode: product.code,
        ...(answers ? { answers } : {}),
      });
      if (answers) sessionStorage.removeItem(QUICK_QUOTE_KEY);
      qc.setQueryData(keys.proposal(created.id), created);
      void qc.invalidateQueries({ queryKey: keys.proposals });
      await navigate({ to: '/proposals/$id', params: { id: created.id }, search: { step: 0 } });
    } catch (e) {
      setError(errorMessage(e, 'We could not start the proposal. Please try again.'));
      setBusy(false);
    }
  }

  // Coming straight from the public site's quick quote: start at once.
  const auto = useRef(false);
  useEffect(() => {
    if (carry && available && !auto.current && proposals.isSuccess && drafts.length === 0) {
      auto.current = true;
      void start();
    }
  }, [proposals.isSuccess]);

  return (
    <div className="pb-1">
      <p className="text-[16px] leading-6 text-secondary">{product.summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {product.purchase === 'instant' ? (
          <span className="chip chip-success">Instant price</span>
        ) : (
          <span className="chip chip-info">Priced by an underwriter</span>
        )}
        <span className="text-[14px] text-secondary">
          {product.purchase === 'instant'
            ? 'See your price as you answer, then pay and download the certificate.'
            : 'Usually within 1 working day. We text you when your price is ready.'}
        </span>
      </div>

      {available && form ? (
        <>
          <h3 className="mt-6 text-[15px] font-bold">The form asks about</h3>
          <ol className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {form.steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 text-[15px]">
                <span className="tnum grid h-6 w-6 flex-none place-items-center rounded-full bg-surface-muted text-[12px] font-bold">
                  {i + 1}
                </span>
                {s.title}
              </li>
            ))}
          </ol>
          {documents.length > 0 && (
            <>
              <h3 className="mt-6 text-[15px] font-bold">Have these ready</h3>
              <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[15px]">
                {documents.map((d) => (
                  <li key={d} className="flex gap-2">
                    <Icon name="camera" size={18} className="mt-0.5 flex-none text-secondary" />
                    {d}
                  </li>
                ))}
              </ul>
            </>
          )}
          {carry && (
            <Banner tone="info" className="mt-6">
              We’ll use the answers from your quick quote, so you won’t need to enter them again.
            </Banner>
          )}
          {drafts.length > 0 && (
            <div className="mt-6 rounded-2xl bg-subtle p-4">
              <p className="text-[15px] font-semibold">You already started one</p>
              {drafts.map((d) => (
                <Link
                  key={d.id}
                  to="/proposals/$id"
                  params={{ id: d.id }}
                  className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-ink no-underline ring-1 ring-border-subtle hover:ring-brand"
                >
                  <span className="min-w-0">
                    <span className="tnum block text-[15px] font-semibold">{d.proposalNo}</span>
                    <span className="block text-[13px] text-secondary">
                      Last saved {formatDate(d.updatedAt)}
                    </span>
                  </span>
                  <span className="btn btn-soft btn-sm pointer-events-none">Continue</span>
                </Link>
              ))}
            </div>
          )}
          {error && (
            <Banner tone="danger" className="mt-6" role="alert">
              {error}
            </Banner>
          )}
          <Button
            size="lg"
            block
            className="mt-6"
            onClick={() => void start()}
            busy={busy}
            busyLabel="Starting"
          >
            {drafts.length ? 'Start a new proposal' : 'Start proposal'}
            <Icon name="arrowRight" size={18} />
          </Button>
        </>
      ) : (
        <Banner tone="neutral" className="mt-6" title="This form is not online yet">
          Call us on <a href="tel:+233302917444">030 291 7444</a> or visit any Serene branch and we’ll arrange
          this cover for you.
        </Banner>
      )}
    </div>
  );
}
