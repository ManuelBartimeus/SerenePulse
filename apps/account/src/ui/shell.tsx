import logoUrl from '@serene/ui/assets/serene-logo.svg';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError, MOCK } from '../api/client';
import { meQuery } from '../api/queries';
import { initials } from '../lib/format';
import { Banner, Button, PageSkeleton, Skeleton } from './components';
import { Icon } from './icons';

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

export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Serene Insurance`;
  }, [title]);
}

export function RootLayout() {
  const online = useOnline();
  useRouteFocus();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {!online && (
        <div
          className="sticky top-0 z-50 bg-ink px-4 py-2.5 text-center text-[14px] font-medium text-white"
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

function Header() {
  const me = useQuery(meQuery);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const inits = initials(me.data?.fullName);
  const nav = [
    { to: '/', label: 'Home', active: path === '/' || path === '/account' || path === '/account/' },
    { to: '/buy', label: 'Buy insurance', active: path.endsWith('/buy') },
    { to: '/claims', label: 'Claims', active: path.includes('/claims') || path.endsWith('/claim') },
  ] as const;
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="wrap flex h-16 items-center justify-between gap-3">
        <Link to="/" className="flex items-center rounded-lg" aria-label="Serene Insurance, my account home">
          <Logo className="h-9 w-auto md:h-10" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`hidden h-11 items-center rounded-full px-4 text-[15px] font-semibold no-underline md:inline-flex ${
                n.active ? 'bg-brand-50 text-brand' : 'text-secondary hover:bg-surface-muted hover:text-ink'
              }`}
              aria-current={n.active ? 'page' : undefined}
            >
              {n.label}
            </Link>
          ))}
          <Link to="/buy" className="btn btn-soft btn-sm md:hidden" aria-label="Buy insurance">
            <Icon name="plus" size={18} />
            Buy
          </Link>
          <Link
            to="/profile"
            className="ml-1 grid h-11 w-11 place-items-center rounded-full bg-brand text-[14px] font-bold text-white no-underline"
            aria-label="Your profile"
          >
            {inits || <Icon name="user" size={20} />}
          </Link>
        </nav>
      </div>
    </header>
  );
}

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
        <header className="border-b border-border-subtle bg-white">
          <div className="wrap flex h-16 items-center justify-between">
            <Logo className="h-9 w-auto md:h-10" />
            <Skeleton className="h-11 w-11 rounded-full" />
          </div>
        </header>
        <PageSkeleton />
      </>
    );
  if (me.isError)
    return (
      <div className="wrap wrap-narrow py-16">
        <Logo />
        <h1 className="h-display mt-8">We can’t load your account</h1>
        <Banner tone="danger" className="mt-6">
          This is usually a connection problem. Check your internet connection and try again.
        </Banner>
        <Button className="mt-6" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </div>
    );
  return (
    <>
      <Header />
      <main id="main" className="flex-1 pb-16">
        <Outlet />
      </main>
      <footer className="border-t border-border-subtle bg-white py-6 pb-[calc(24px+var(--safe-b))] text-[13px] text-secondary">
        <div className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <span>Serene Insurance Company Limited · Licensed by the National Insurance Commission</span>
          <span className="flex gap-4">
            <a href="/terms" className="text-secondary underline-offset-2">
              Terms
            </a>
            <a href="/privacy" className="text-secondary underline-offset-2">
              Privacy
            </a>
            <a href="tel:+233302917444" className="text-secondary underline-offset-2">
              Call 030 291 7444
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}
