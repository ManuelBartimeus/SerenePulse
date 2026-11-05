import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import logoUrl from '@serene/ui/assets/serene-logo.svg';
import { analyticsNav } from '../features/analytics/routes';
import { NotificationBell } from '../features/cases/notification-bell';
import { casesNav } from '../features/cases/routes';
import { configNav } from '../features/config/routes';
import { reportsNav } from '../features/reports/routes';
import type { NavItem } from '../lib/nav';
import { useSession } from '../lib/session';
import { Button, EmptyState } from '../ui/controls';
import { Dialog } from '../ui/dialog';
import {
  IconBell,
  IconBoard,
  IconBuilding,
  IconChart,
  IconCheckCircle,
  IconChevronRight,
  IconDownload,
  IconFile,
  IconFlag,
  IconFolder,
  IconHome,
  IconLayers,
  IconList,
  IconLock,
  IconMenu,
  IconMessage,
  IconQr,
  IconSettings,
  IconShield,
  IconSignOut,
  IconSliders,
  IconTable,
  IconTarget,
  IconTrend,
  IconUsers,
  type IconProps,
} from '../ui/icons';

/** Permission-aware navigation (REQ §19): items the user can't use are not shown. */
export const NAV: NavItem[] = [
  ...analyticsNav,
  // Feedback form (config) leads the Operations group (user direction).
  ...configNav.filter((i) => i.group === 'operations'),
  ...casesNav,
  ...reportsNav,
  ...configNav.filter((i) => i.group !== 'operations'),
  { to: '/users', label: 'Users & roles', permission: 'users.manage', group: 'admin' },
  { to: '/approvals', label: 'Approvals', permission: 'survey.publish.approve', group: 'admin' },
  { to: '/audit', label: 'Audit log', permission: 'audit.view', group: 'admin' },
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

/**
 * Presentation only: picks a nav icon from the route path, so feature streams don't need to supply one.
 * The first matching rule wins; unknown routes get a neutral list icon.
 */
const NAV_ICONS: [RegExp, (p: IconProps) => ReactNode][] = [
  [/^\/$/, IconHome],
  [/record|response/, IconTable],
  [/trend/, IconTrend],
  [/analytic|insight|compare|breakdown|nps|csat/, IconChart],
  [/flag-rule|rules/, IconSliders],
  [/flag/, IconFlag],
  [/board/, IconBoard],
  [/case/, IconFolder],
  [/target/, IconTarget],
  [/alert|notification/, IconBell],
  [/export|download/, IconDownload],
  [/report/, IconFile],
  [/privacy|retention|dsr/, IconLock],
  [/correction|approval/, IconCheckCircle],
  [/qr/, IconQr],
  [/sms|feedback-form|survey/, IconMessage],
  [/directory|branch|region/, IconBuilding],
  [/catalogue/, IconLayers],
  [/setting|config|ops/, IconSettings],
  [/user|role/, IconUsers],
  [/audit/, IconShield],
];
function NavIcon({ to }: { to: string }) {
  const Icon = NAV_ICONS.find(([re]) => re.test(to))?.[1] ?? IconList;
  return <Icon size={18} />;
}

const GROUPS: { key: NavItem['group']; title: string }[] = [
  { key: undefined, title: '' },
  { key: 'insights', title: 'Insights' },
  { key: 'operations', title: 'Operations' },
  { key: 'admin', title: 'Administration' },
];

function matches(to: string, path: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
}

/** Only the most specific matching item is active (e.g. "My cases" rather than "Cases" too). */
function isActive(item: NavItem, path: string, all: NavItem[]) {
  if (!matches(item.to, path)) return false;
  return !all.some((o) => o.to.length > item.to.length && matches(o.to, path));
}

function useVisibleNav() {
  const { can } = useSession();
  return NAV.filter(
    (i) => !i.permission || (Array.isArray(i.permission) ? i.permission : [i.permission]).some((p) => can(p)),
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const visible = useVisibleNav();
  const render = (items: NavItem[]) =>
    items.map((item) => {
      const active = isActive(item, path, visible);
      return (
        <Link
          key={item.to}
          to={item.to}
          // Keep the analytics filters in the URL when moving between views (REQ §17.1.6).
          search={(prev: Record<string, unknown>) => prev}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={`group relative flex h-11 items-center gap-3 rounded-sm px-3 text-[15px] leading-5 transition-colors duration-200 lg:h-10 ${
            active
              ? 'bg-brand-50 font-medium text-brand'
              : 'text-secondary hover:bg-surface-muted hover:text-ink'
          }`}
        >
          <span
            aria-hidden
            className={`absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand transition-opacity duration-200 ${
              active ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <span className={active ? 'text-brand' : 'text-muted group-hover:text-ink'}>
            <NavIcon to={item.to} />
          </span>
          <span className="truncate">{item.label}</span>
        </Link>
      );
    });
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {GROUPS.map(({ key, title }) => {
        const items = visible.filter((i) => i.group === key);
        if (items.length === 0) return null;
        return (
          <div key={title || 'main'} className="flex flex-col gap-0.5">
            {title && (
              <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">
                {title}
              </p>
            )}
            {render(items)}
          </div>
        );
      })}
    </nav>
  );
}

/** Header title area: "Section › Page" for the current route, derived from the nav. */
function Breadcrumb() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const visible = useVisibleNav();
  const current = [...visible]
    .filter((i) => isActive(i, path, visible))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const group = GROUPS.find((g) => g.key === current?.group)?.title;
  if (!current) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
      <ol className="flex items-center gap-1.5 text-[14px] leading-5">
        {group && (
          <>
            <li className="text-muted">{group}</li>
            <li aria-hidden className="text-border-strong">
              <IconChevronRight size={14} />
            </li>
          </>
        )}
        <li className="truncate font-medium text-ink" aria-current="page">
          {current.label}
        </li>
      </ol>
    </nav>
  );
}

function initials(email?: string) {
  const name = (email ?? '').split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}

function UserMenu() {
  const { claims, signOut } = useSession();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-1 md:gap-2">
      <NotificationBell />
      <Link
        to="/profile"
        className="flex h-10 items-center gap-2 rounded-full pl-1 pr-1 transition-colors duration-200 hover:bg-surface-muted md:pr-3"
      >
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-brand text-[12px] font-semibold tracking-[0.02em] text-white"
        >
          {initials(claims?.email)}
        </span>
        <span className="hidden max-w-[200px] truncate text-[14px] text-secondary md:block">
          {claims?.email}
        </span>
        <span className="sr-only md:hidden">Your profile</span>
      </Link>
      <span aria-hidden className="mx-1 hidden h-6 w-px bg-border-subtle md:block" />
      <Button
        variant="ghost"
        className="h-10 gap-1.5 px-3 text-[14px] text-secondary hover:text-ink"
        onClick={() => signOut().then(() => navigate({ to: '/sign-in' }))}
      >
        <IconSignOut size={18} />
        <span className="hidden md:inline">Sign out</span>
        <span className="sr-only md:hidden">Sign out</span>
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand focus:px-5 focus:py-2.5 focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-[264px] flex-col border-r border-border-subtle bg-white lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 px-5">
          <img src={logoUrl} alt="Serene Insurance" className="h-8 w-auto" />
          <span aria-hidden className="h-5 w-px bg-border-subtle" />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-secondary">Staff portal</span>
        </div>
        <div className="serene-scroll flex-1 overflow-y-auto px-3 pb-6 pt-2">
          <NavLinks />
        </div>
        {!isProd && (
          <div className="border-t border-border-subtle px-5 py-3 text-[12px] leading-4 text-muted">
            Environment: <span className="font-medium text-secondary">{import.meta.env.VITE_APP_ENV}</span>
          </div>
        )}
      </aside>
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border-subtle bg-white px-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-surface-muted lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen(true)}
            >
              <IconMenu size={22} />
              <span className="sr-only">Open menu</span>
            </button>
            <img src={logoUrl} alt="Serene Insurance" className="h-7 w-auto lg:hidden" />
            <span aria-hidden className="hidden h-5 w-px bg-border-subtle md:block lg:hidden" />
            <Breadcrumb />
            {!isProd && (
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-accent bg-accent-50 px-2.5 py-0.5 text-[12px] font-medium leading-5 text-ink md:inline-flex">
                <span aria-hidden className="size-1.5 rounded-full bg-ink" />
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
          {!isProd && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-50 px-2.5 py-0.5 text-[12px] font-medium leading-5 text-ink">
              <span aria-hidden className="size-1.5 rounded-full bg-ink" />
              {import.meta.env.VITE_APP_ENV} · demo data
            </p>
          )}
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
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] font-medium leading-9 tracking-[-0.02em] md:text-[36px] md:leading-[44px] md:tracking-[-0.025em]">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[15px] leading-6 text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function AccessDeniedPage() {
  return (
    <section className="rounded-lg border border-border-subtle bg-white shadow-xs">
      <EmptyState
        icon={<IconLock size={26} />}
        title="You don’t have access to this page"
        action={
          <Link to="/" className="font-medium text-brand underline-offset-4 hover:underline">
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
    <section className="rounded-lg border border-border-subtle bg-white shadow-xs">
      <EmptyState
        title="We can’t find that page"
        action={
          <Link to="/" className="font-medium text-brand underline-offset-4 hover:underline">
            Go to the overview
          </Link>
        }
      >
        The link may be out of date.
      </EmptyState>
    </section>
  );
}
