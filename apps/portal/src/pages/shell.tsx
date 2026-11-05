import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import logoUrl from '@serene/ui/assets/serene-logo.svg';
import { useSession } from '../lib/session';
import { Button, EmptyState } from '../ui/controls';
import { Dialog } from '../ui/dialog';

interface NavItem {
  to: string;
  label: string;
  permission?: string;
  group?: 'admin';
}

/** Permission-aware navigation (REQ §19): items the user can't use are not shown. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Overview' },
  { to: '/admin/users', label: 'Users & roles', permission: 'users.manage', group: 'admin' },
  { to: '/admin/approvals', label: 'Approvals', permission: 'survey.publish.approve', group: 'admin' },
  { to: '/admin/audit', label: 'Audit log', permission: 'audit.view', group: 'admin' },
];

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000;

/** WCAG 2.2.1: warn 2 minutes before the 30-minute idle sign-out, with a way to stay. */
function IdleTimeout() {
  const { signOut } = useSession();
  const navigate = useNavigate();
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(IDLE_WARNING_MS / 1000);
  const lastActivity = useRef(Date.now());

  const reset = useCallback(() => {
    lastActivity.current = Date.now();
    setWarning(false);
  }, []);

  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'scroll', 'focus'] as const;
    const onActivity = () => {
      if (!warning) lastActivity.current = Date.now();
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LIMIT_MS) {
        signOut().then(() => navigate({ to: '/sign-in', search: { reason: 'idle' } }));
      } else if (idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS) {
        setWarning(true);
        setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      }
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
    };
  }, [navigate, signOut, warning]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  return (
    <Dialog
      open={warning}
      onOpenChange={(open) => !open && reset()}
      title="Are you still there?"
      description={`For security you'll be signed out in ${minutes}:${seconds} unless you continue.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => signOut().then(() => navigate({ to: '/sign-in' }))}>
            Sign out now
          </Button>
          <Button onClick={reset}>Stay signed in</Button>
        </>
      }
    />
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useSession();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const visible = NAV.filter((i) => !i.permission || can(i.permission));
  const render = (items: NavItem[]) =>
    items.map((item) => {
      const active = item.to === '/' ? path === '/' : path.startsWith(item.to);
      return (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={`flex h-11 items-center rounded-sm border-l-4 px-3 text-[16px] ${
            active
              ? 'border-brand bg-brand-50 font-medium text-brand'
              : 'border-transparent text-ink hover:bg-surface-muted'
          }`}
        >
          {item.label}
        </Link>
      );
    });
  const main = visible.filter((i) => !i.group);
  const admin = visible.filter((i) => i.group === 'admin');
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {render(main)}
      {admin.length > 0 && (
        <>
          <p className="mt-6 px-3 text-[12px] font-medium uppercase leading-4 tracking-[1px] text-muted">
            Administration
          </p>
          {render(admin)}
        </>
      )}
    </nav>
  );
}

function UserMenu() {
  const { claims, signOut } = useSession();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/profile"
        className="hidden max-w-[220px] truncate text-[14px] text-secondary hover:text-ink md:block"
      >
        {claims?.email}
      </Link>
      <Button
        variant="ghost"
        className="h-10 px-4 text-[14px]"
        onClick={() => signOut().then(() => navigate({ to: '/sign-in' }))}
      >
        Sign out
      </Button>
    </div>
  );
}

/** App shell (E7): 264 px sidebar on desktop; a menu button opening a sheet on phones. */
export function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const isProd = import.meta.env.VITE_APP_ENV === 'production';
  return (
    <div className="min-h-screen bg-subtle">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-[264px] flex-col border-r border-border bg-white px-4 py-5 lg:flex">
        <img src={logoUrl} alt="Serene Insurance" className="mb-8 h-7 w-auto self-start" />
        <NavLinks />
      </aside>
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-white px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="grid size-11 place-items-center rounded-sm hover:bg-surface-muted lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen(true)}
            >
              <span aria-hidden className="text-[22px] leading-none">
                ☰
              </span>
              <span className="sr-only">Open menu</span>
            </button>
            <img src={logoUrl} alt="Serene Insurance" className="h-6 w-auto lg:hidden" />
            {!isProd && (
              <span className="rounded-full bg-accent-50 px-3 py-1 text-[12px] font-medium text-ink">
                {import.meta.env.VITE_APP_ENV} · demo data
              </span>
            )}
          </div>
          <UserMenu />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen} title="Menu">
        <div id="mobile-nav">
          <NavLinks onNavigate={() => setMenuOpen(false)} />
        </div>
      </Dialog>
      <IdleTimeout />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[28px] font-medium leading-9 tracking-[-0.5px] md:text-[36px] md:leading-[44px] md:tracking-[-1px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </div>
  );
}

export function HomePage() {
  const { claims } = useSession();
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Customer feedback dashboards arrive with the analytics milestones."
      />
      <section className="rounded-lg bg-white">
        <EmptyState title="No feedback data yet">
          The customer survey goes live in a later milestone. Until then this page stays empty rather than
          showing sample figures. Your roles: {claims?.app_roles.join(', ') || 'none'}.
        </EmptyState>
      </section>
    </>
  );
}

export function AccessDeniedPage() {
  return (
    <section className="rounded-lg bg-white">
      <EmptyState
        title="You don’t have access to this page"
        action={
          <Link to="/" className="font-medium text-brand hover:underline">
            Go to the overview
          </Link>
        }
      >
        If you need it for your work, ask your system administrator to review your roles.
      </EmptyState>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="rounded-lg bg-white">
      <EmptyState
        title="We can’t find that page"
        action={
          <Link to="/" className="font-medium text-brand hover:underline">
            Go to the overview
          </Link>
        }
      >
        The link may be out of date.
      </EmptyState>
    </section>
  );
}
