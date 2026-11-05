// Shared page-level tab bar (links styled as tabs, so each tab keeps its own URL) and the
// "More filters" popover used to keep filter rows short. Used by cases, flagged feedback, alerts
// and reports (revision Q: fewer sidebar entries, calmer filter rows).
import * as Popover from '@radix-ui/react-popover';
import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useSession } from '../../lib/session';
import { IconChevronDown, IconFilter } from '../../ui/icons';

export interface PageTab {
  to: string;
  label: string;
  /** Any-of permissions; the tab is hidden when the user holds none. */
  permission?: string | string[];
  /** Extra paths that should mark this tab as current (e.g. a detail route). */
  match?: (path: string) => boolean;
}

export function PageTabs({ tabs, label }: { tabs: PageTab[]; label: string }) {
  const { can } = useSession();
  const path = useRouterState({ select: (s) => s.location.pathname }).replace(/^\/admin/, '') || '/';
  const visible = tabs.filter((t) => {
    if (!t.permission) return true;
    const perms = Array.isArray(t.permission) ? t.permission : [t.permission];
    return perms.some((p) => can(p));
  });
  if (visible.length < 2) return null;
  return (
    <nav aria-label={label} className="-mt-2 mb-6 overflow-x-auto border-b border-border md:-mt-4">
      <ul className="flex gap-1">
        {visible.map((t) => {
          const current = t.match ? t.match(path) : path === t.to;
          return (
            <li key={t.to} className="shrink-0">
              <Link
                to={t.to}
                aria-current={current ? 'page' : undefined}
                className={`-mb-px inline-flex h-11 items-center border-b-2 px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  current
                    ? 'border-brand font-medium text-brand'
                    : 'border-transparent text-secondary hover:text-ink'
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Secondary filters behind one button. `active` is the number of secondary filters currently set;
 * `onClear` resets just those.
 */
export function MoreFilters({
  active,
  onClear,
  children,
}: {
  active: number;
  onClear?: () => void;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className={`inline-flex h-11 items-center gap-2 rounded-sm border px-3 text-[14px] font-medium outline-none hover:border-ink focus-visible:border-brand ${
          active ? 'border-brand bg-brand-50 text-brand' : 'border-border-strong bg-white text-ink'
        }`}
      >
        <IconFilter size={16} aria-hidden />
        More filters{active ? ` (${active})` : ''}
        <IconChevronDown size={16} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 flex max-h-[70vh] w-[min(320px,calc(100vw-32px))] flex-col gap-4 overflow-y-auto rounded-md border border-border bg-white p-4 shadow-float"
        >
          {children}
          {onClear && active > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="self-start text-[14px] font-medium text-brand underline-offset-2 hover:underline"
            >
              Clear these filters
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export const CASE_TABS: PageTab[] = [
  {
    to: '/cases',
    label: 'All cases',
    permission: 'cases.view',
  },
  { to: '/cases/mine', label: 'My cases', permission: 'cases.work' },
];

export const FLAG_TABS: PageTab[] = [
  { to: '/flags', label: 'Feedback to review', permission: 'flags.view' },
  { to: '/flags/rules', label: 'Flagging rules', permission: 'flags.configure' },
];

export const ALERT_TABS: PageTab[] = [
  { to: '/alerts', label: 'Alerts' },
  { to: '/alerts/rules', label: 'Alert rules', permission: 'alerts.manage' },
  { to: '/targets', label: 'Targets', permission: ['targets.manage', 'analytics.view'] },
];

export const REPORT_TABS: PageTab[] = [
  { to: '/reports/exports', label: 'Download data', permission: 'exports.create' },
  {
    to: '/reports/schedules',
    label: 'Scheduled reports',
    permission: ['reports.schedule', 'analytics.view'],
  },
  { to: '/reports/files', label: 'Report files', permission: 'analytics.view' },
];
