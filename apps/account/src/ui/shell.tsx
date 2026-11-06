import logoUrl from '@serene/ui/assets/serene-logo.svg';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, MOCK } from '../api/client';
import { accountApi, meQuery } from '../api/queries';
import { firstName, formatPhoneLocal, initials } from '../lib/format';
import { Banner, Button, PageSkeleton, Skeleton, cx } from './components';
import { Icon, type IconName } from './icons';

export const PHONE_TEL = '+233302917444';
export const PHONE_DISPLAY = '030 291 7444';
const WHATSAPP_URL = 'https://wa.me/233500517114';
const WHATSAPP_DISPLAY = '050 051 7114';
const EMAIL = 'info@sereneinsurance.com';

/** Public-website navigation (same items as the site header in apps/landing). */
const SITE_NAV: { href: string; label: string }[] = [
  { href: '/insurance/#personal', label: 'Personal' },
  { href: '/insurance/#business', label: 'Business' },
  { href: '/claims/', label: 'Claims' },
  { href: '/branches/', label: 'Branches' },
  { href: '/help/', label: 'Help' },
];

type AppTo = '/' | '/buy' | '/claims' | '/profile';
const ACCOUNT_NAV: { to: AppTo; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/', label: 'My account', icon: 'home', match: (p) => /^\/account\/?$/.test(p) },
  { to: '/buy', label: 'Buy insurance', icon: 'plus', match: (p) => p.endsWith('/buy') },
  {
    to: '/claims',
    label: 'My claims',
    icon: 'claim',
    match: (p) => p.includes('/claims') || p.endsWith('/claim'),
  },
  { to: '/profile', label: 'Your details', icon: 'user', match: (p) => p.endsWith('/profile') },
];

/** True inside the signed-in frame (header and footer already drawn). */
const ShellContext = createContext(false);
export const useInShell = () => useContext(ShellContext);

export function Logo({ className = 'h-10 w-auto' }: { className?: string }) {
  return <img src={logoUrl} alt="Serene Insurance" width={82} height={40} className={className} />;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Moves focus to the new page's heading after client-side navigation (not on first load). */
function useRouteFocus() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const last = useRef(path);
  useEffect(() => {
    if (last.current === path) return;
    last.current = path;
    // Wait for lazy route content to paint.
    let tries = 0;
    const t = window.setInterval(() => {
      const h = document.querySelector<HTMLElement>('main h1');
      if (h || ++tries > 20) {
        window.clearInterval(t);
        if (h) {
          if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
          h.focus({ preventScroll: true });
        }
      }
    }, 50);
    return () => window.clearInterval(t);
  }, [path]);
}

const TEXT_FIELD =
  'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]):not([type=range]), textarea, select';

/**
 * Keeps the focused field visible: on phones the on-screen keyboard shrinks the visual viewport,
 * and the sticky header and bottom action bar cover the edges. If the field is outside the clear
 * area it is scrolled to the centre (again once the keyboard has finished opening).
 */
function useKeepFocusedFieldVisible() {
  useEffect(() => {
    const isField = (el: Element | null): el is HTMLElement =>
      el instanceof HTMLElement && el.matches(TEXT_FIELD) && !el.closest('dialog');
    const ensure = (el: HTMLElement) => {
      if (document.activeElement !== el) return;
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      const offset = vv ? vv.offsetTop : 0;
      const root = getComputedStyle(document.documentElement);
      const header = parseFloat(root.getPropertyValue('--header-h')) || 64;
      const bar = parseFloat(root.getPropertyValue('--bar-h')) || 0;
      const r = el.getBoundingClientRect();
      const top = offset + header + 8;
      const bottom = offset + height - bar - 8;
      if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    };
    const timers = new Set<number>();
    const onFocus = (e: FocusEvent) => {
      const el = e.target as Element | null;
      if (!isField(el)) return;
      requestAnimationFrame(() => ensure(el));
      const t = window.setTimeout(() => {
        timers.delete(t);
        ensure(el);
      }, 350);
      timers.add(t);
    };
    const onViewport = () => {
      const el = document.activeElement;
      if (isField(el)) ensure(el);
    };
    document.addEventListener('focusin', onFocus);
    window.visualViewport?.addEventListener('resize', onViewport);
    return () => {
      document.removeEventListener('focusin', onFocus);
      window.visualViewport?.removeEventListener('resize', onViewport);
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);
}

export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Serene Insurance`;
  }, [title]);
}

export function RootLayout() {
  const online = useOnline();
  useRouteFocus();
  useKeepFocusedFieldVisible();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {!online && (
        <div
          className="sticky top-0 z-50 bg-navy px-4 py-2.5 text-center text-[14px] font-medium text-white"
          role="status"
        >
          <span className="inline-flex items-center gap-2">
            <Icon name="wifiOff" size={18} />
            You are offline. Your answers are kept and will save when you reconnect.
          </span>
        </div>
      )}
      {MOCK && (
        <div className="bg-accent-50 px-4 py-1.5 text-center text-[12px] font-semibold text-ink">
          Demo data (mock API). Nothing is sent to Serene.
        </div>
      )}
      <Outlet />
    </>
  );
}

// ---- Header ------------------------------------------------------------------------------------

function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await accountApi.signOut();
    } catch {
      /* the cookie is cleared server-side; continue either way */
    }
    qc.clear();
    await navigate({ to: '/sign-in', replace: true });
  }
  return { signOut, busy };
}

/**
 * The site header, as on the public website: logo (to the public home page), the site's main
 * links, and on the right the account menu (signed in) or "Get a quote". Below 1024px a menu
 * button opens a left drawer with the same links.
 */
export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  const [drawer, setDrawer] = useState(false);
  return (
    <header className="site-header">
      <div className="wrap flex h-full items-center gap-2">
        <a
          href="/"
          className="-ml-1 flex flex-none items-center rounded-md p-1"
          aria-label="Serene Insurance home"
        >
          <Logo className="h-9 w-auto sm:h-10" />
        </a>
        <nav aria-label="Serene Insurance website" className="ml-6 hidden items-center gap-1 lg:flex">
          {SITE_NAV.map((n) => (
            <a key={n.href} href={n.href} className="nav-link">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <>
              <Link to="/buy" className="btn btn-primary hidden lg:inline-flex">
                Buy insurance
              </Link>
              <AccountMenu />
            </>
          ) : (
            <a href="/#quote" className="btn btn-primary hidden lg:inline-flex">
              Get a quote
            </a>
          )}
          <button
            type="button"
            className="btn btn-ghost -mr-2 gap-2 px-3 text-ink lg:hidden"
            onClick={() => setDrawer(true)}
            aria-haspopup="dialog"
            aria-expanded={drawer}
          >
            <Icon name="menu" size={22} />
            <span className="text-[15px] font-medium">Menu</span>
          </button>
        </div>
      </div>
      <MenuDrawer open={drawer} onClose={() => setDrawer(false)} signedIn={signedIn} />
    </header>
  );
}

function AccountMenu() {
  const me = useQuery(meQuery);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { signOut, busy } = useSignOut();
  const name = firstName(me.data?.fullName);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative hidden lg:block">
      <button
        ref={button}
        type="button"
        className="btn btn-secondary gap-2 pr-3 pl-1.5"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="grid h-8 w-8 place-items-center rounded-full bg-brand text-[13px] font-bold text-white"
          aria-hidden="true"
        >
          {initials(me.data?.fullName) || <Icon name="user" size={18} />}
        </span>
        <span>{name ? `${name}’s account` : 'My account'}</span>
        <Icon name="chevronDown" size={16} className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={menuId} className="menu-pop">
          {me.data && (
            <div className="border-b border-border px-3 pt-2 pb-3">
              <p className="truncate text-[14px] font-semibold">{me.data.fullName || 'Your account'}</p>
              <p className="tnum text-[13px] text-secondary">
                {formatPhoneLocal(me.data.phone)} · {me.data.customerNo}
              </p>
            </div>
          )}
          <ul className="m-0 grid list-none gap-0.5 p-0 pt-1.5">
            {ACCOUNT_NAV.map((n) => (
              <li key={n.to}>
                <Link
                  to={n.to}
                  className="menu-item"
                  aria-current={n.match(path) ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={n.icon} size={18} className="text-brand" />
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 border-t border-border pt-1.5">
            <button type="button" className="menu-item" onClick={() => void signOut()} disabled={busy}>
              <Icon name="logout" size={18} className="text-secondary" />
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuDrawer({ open, onClose, signedIn }: { open: boolean; onClose: () => void; signedIn: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const me = useQuery({ ...meQuery, enabled: signedIn });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { signOut, busy } = useSignOut();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => onClose(), [path]);
  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label="Menu"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex h-16 flex-none items-center justify-between gap-3 border-b border-border px-4">
        <a href="/" className="flex items-center rounded-md p-1" aria-label="Serene Insurance home">
          <Logo className="h-9 w-auto" />
        </a>
        <button
          type="button"
          className="btn btn-ghost btn-icon -mr-2 text-ink"
          onClick={onClose}
          aria-label="Close menu"
        >
          <Icon name="close" size={22} />
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-[calc(16px+var(--safe-b))]"
        data-sheet-body
      >
        {signedIn && (
          <>
            {me.data && (
              <div className="mb-2 flex items-center gap-3 rounded-lg bg-subtle px-3 py-3">
                <span
                  className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand text-[14px] font-bold text-white"
                  aria-hidden="true"
                >
                  {initials(me.data.fullName) || <Icon name="user" size={20} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{me.data.fullName || 'Your account'}</span>
                  <span className="tnum block text-[13px] text-secondary">
                    {formatPhoneLocal(me.data.phone)}
                  </span>
                </span>
              </div>
            )}
            <p className="kicker px-3 pt-3 pb-1">My account</p>
            <ul className="m-0 grid list-none gap-0.5 p-0">
              {ACCOUNT_NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="drawer-link" aria-current={n.match(path) ? 'page' : undefined}>
                    <Icon name={n.icon} size={20} className="text-brand" />
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="kicker px-3 pt-5 pb-1">Serene Insurance</p>
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {!signedIn && (
            <li>
              <a href="/#quote" className="drawer-link">
                Get a quote
              </a>
            </li>
          )}
          {SITE_NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="drawer-link">
                {n.label === 'Personal'
                  ? 'Personal insurance'
                  : n.label === 'Business'
                    ? 'Business insurance'
                    : n.label === 'Claims'
                      ? 'How claims work'
                      : n.label}
              </a>
            </li>
          ))}
          <li>
            <a href="/contact/" className="drawer-link">
              Contact us
            </a>
          </li>
        </ul>
        <div className="mt-4 grid gap-0.5 border-t border-border pt-4">
          <a href={`tel:${PHONE_TEL}`} className="drawer-link">
            <Icon name="phone" size={20} className="text-brand" />
            <span className="tnum">{PHONE_DISPLAY}</span>
          </a>
          <a href={WHATSAPP_URL} rel="noopener" className="drawer-link">
            <Icon name="chat" size={20} className="text-brand" />
            WhatsApp <span className="tnum">{WHATSAPP_DISPLAY}</span>
          </a>
        </div>
        {signedIn && (
          <div className="mt-4 border-t border-border pt-4">
            <Button
              variant="secondary"
              block
              onClick={() => void signOut()}
              busy={busy}
              busyLabel="Signing out"
            >
              <Icon name="logout" size={18} />
              Sign out
            </Button>
          </div>
        )}
      </div>
    </dialog>
  );
}

// ---- Footer -------------------------------------------------------------------------------------

const FOOTER_COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: 'Insurance',
    links: [
      ['Motor insurance', '/insurance/motor/'],
      ['Travel insurance', '/insurance/travel/'],
      ['Home insurance', '/insurance/home/'],
      ['Personal accident', '/insurance/personal-accident/'],
      ['Business cover', '/insurance/#business'],
      ['All covers', '/insurance/'],
    ],
  },
  {
    title: 'Customers',
    links: [
      ['My account', '/account/'],
      ['Make a claim', '/claims/'],
      ['Check a certificate', '/verify/'],
      ['Proposal forms', '/downloads/'],
      ['Help', '/help/'],
      ['Share your feedback', '/customerfeedback'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About Serene', '/about/'],
      ['Branches', '/branches/'],
      ['Contact us', '/contact/'],
      ['Complaints', '/contact/#complaints'],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer pb-[calc(var(--bar-h)+var(--safe-b))]">
      <div className="wrap py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] lg:gap-8">
          <div className="min-w-0">
            <a href="/" className="inline-flex rounded-md" aria-label="Serene Insurance home">
              <Logo className="h-11 w-auto" />
            </a>
            <p className="card-text mt-4 max-w-sm">
              Serene Insurance Company Limited. Licensed by the National Insurance Commission to carry out
              general (non-life) insurance business in Ghana.
            </p>
            <ul className="footer-links mt-4">
              <li>
                <a href={`tel:${PHONE_TEL}`}>
                  <Icon name="phone" size={16} />
                  <span className="tnum">030 291 7444 to 7446</span>
                </a>
              </li>
              <li>
                <a href={WHATSAPP_URL} rel="noopener">
                  <Icon name="chat" size={16} />
                  WhatsApp <span className="tnum">{WHATSAPP_DISPLAY}</span>
                </a>
              </li>
              <li>
                <a href={`mailto:${EMAIL}`}>
                  <Icon name="mail" size={16} />
                  {EMAIL}
                </a>
              </li>
            </ul>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:contents">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="min-w-0">
                <h2 className="text-[14px] leading-5 font-semibold">{col.title}</h2>
                <ul className="footer-links mt-3">
                  {col.links.map(([label, href]) => (
                    <li key={href}>
                      <a href={href}>
                        <Icon name="chevronRight" size={14} />
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="wrap flex flex-col gap-2 py-6 text-[14px] leading-5 text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Serene Insurance Company Limited. All rights reserved.</p>
          <ul className="footer-links flex flex-wrap gap-x-5">
            <li>
              <a href="/privacy/">Privacy notice</a>
            </li>
            <li>
              <a href="/terms/">Terms of business online</a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

// ---- Title band and breadcrumbs -------------------------------------------------------------------

export interface Crumb {
  label: string;
  /** App route (inside /account). */
  to?: '/' | '/buy' | '/claims' | '/profile' | '/proposals/$id' | '/policies/$id' | '/claims/$id';
  params?: { id: string };
  /** Public-site path. */
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ label: 'Home', href: '/' }, ...items];
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol>
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={`${c.label}-${i}`}>
              {last ? (
                <span aria-current="page" className="inline-flex min-h-8 items-center">
                  {c.label}
                </span>
              ) : c.to ? (
                <Link to={c.to} {...(c.params ? { params: c.params } : {})}>
                  {c.label}
                </Link>
              ) : (
                <a href={c.href}>{c.label}</a>
              )}
              {!last && <Icon name="chevronRight" size={14} className="sep" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** White band under the header: breadcrumb, H1 30/700, optional intro and actions (NIC inner pages). */
export function TitleBand({
  crumbs,
  title,
  intro,
  aside,
  children,
}: {
  crumbs: Crumb[];
  title: ReactNode;
  intro?: ReactNode;
  /** Shown to the right of the title on wide screens (status badge, primary action). */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="band">
      <div className="wrap">
        <Breadcrumbs items={crumbs} />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-[min(100%,28rem)]">
            <h1 className="h-display break-words">{title}</h1>
            {intro && <div className="prose-w mt-2 text-[16px] leading-[26px] text-secondary">{intro}</div>}
          </div>
          {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Page body under the title band. */
export const PAGE = 'wrap py-8 sm:py-10 lg:py-12';

// ---- Sticky bottom action bar -----------------------------------------------------------------------

/**
 * Fixed bar for the main action on phones and tablets (hidden from 1024px). Its height, including
 * the safe area, is published as --bar-h so the spacer, the footer, scroll padding and the
 * keep-focused-field-visible logic all leave room for it.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--bar-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener('resize', set);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', set);
      root.style.removeProperty('--bar-h');
    };
  }, []);
  return (
    <>
      <div className="action-bar-spacer lg:hidden" aria-hidden="true" />
      <div ref={ref} className="action-bar lg:hidden">
        <div className="mx-auto max-w-[760px]">{children}</div>
      </div>
    </>
  );
}

// ---- Signed-in frame ----------------------------------------------------------------------------------

/** Signed-in area: no session → sign in with a return path. */
export function AuthGate() {
  const me = useQuery(meQuery);
  const href = useRouterState({ select: (s) => s.location.href });
  const navigate = useNavigate();
  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  const redirected = useRef(false);
  useEffect(() => {
    // One redirect only: the href changes while the sign-in page loads.
    if (!signedOut || redirected.current) return;
    redirected.current = true;
    const redirect = href.replace(/^\/account/, '') || '/';
    void navigate({
      to: '/sign-in',
      search: redirect === '/' || redirect.startsWith('/sign-in') ? {} : { redirect },
      replace: true,
    });
  }, [signedOut, href, navigate]);
  if (me.isPending || signedOut)
    return (
      <>
        <header className="site-header">
          <div className="wrap flex h-full items-center justify-between">
            <Logo className="h-9 w-auto sm:h-10" />
            <Skeleton className="h-11 w-24" />
          </div>
        </header>
        <PageSkeleton />
      </>
    );
  if (me.isError)
    return (
      <>
        <SiteHeader />
        <main id="main" className="flex-1">
          <TitleBand crumbs={[{ label: 'My account' }]} title="We can’t load your account" />
          <div className={PAGE}>
            <div className="max-w-[640px]">
              <Banner tone="danger">
                This is usually a connection problem. Check your internet connection and try again.
              </Banner>
              <Button className="mt-6" onClick={() => void me.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  return (
    <ShellContext.Provider value={true}>
      <SiteHeader signedIn />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </ShellContext.Provider>
  );
}
