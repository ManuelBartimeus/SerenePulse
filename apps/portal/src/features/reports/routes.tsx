import { createRoute, Navigate, type AnyRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RequirePerm } from '../../lib/require-perm';
import { useSession } from '../../lib/session';
import { PERMS } from '../../pages/shell';
import { TabbedPage } from '../../pages/tabbed';
import type { PageTab } from '../cases/page-tabs';
import { SettingsPage } from '../config/settings';
import { AuditExportPage } from './exports';
import { OpsPage } from './ops';
import { PrivacyPage } from './privacy';

const OPS_PERMS = ['settings.manage', 'audit.view_all'];
// Tab permissions are any-of; the real rule for data-protection requests (pii.view AND
// settings.manage, or Executive) is enforced in the page and the database.
const PRIVACY_PERMS = ['responses.attribution.approve', 'settings.manage'];

export const SETTINGS_TABS: PageTab[] = [
  { to: '/settings', label: 'General', permission: 'settings.manage' },
  { to: '/settings/data-protection', label: 'Data protection', permission: PRIVACY_PERMS },
  { to: '/settings/system-status', label: 'System status', permission: OPS_PERMS },
];

const guarded = (permission: string | string[], page: () => ReactNode) => () => (
  <RequirePerm permission={permission}>{page()}</RequirePerm>
);

/** /settings opens General, or the first tab this user may see. */
function SettingsIndex() {
  const { can } = useSession();
  if (can('settings.manage')) return <SettingsPage />;
  const first = SETTINGS_TABS.find((t) => [t.permission ?? []].flat().some((p) => can(p)));
  return first && first.to !== '/settings' ? <Navigate to={first.to} replace /> : <SettingsPage />;
}

/** Settings (General · Data protection · System status) and the audit-log export (basepath /admin). */
export function settingsRoutes(parent: AnyRoute): AnyRoute[] {
  const settings = createRoute({
    getParentRoute: () => parent,
    path: '/settings',
    component: () => (
      <RequirePerm permission={PERMS.settings}>
        <TabbedPage
          title="Settings"
          subtitle="System-wide settings, data-protection requests and the health of the system."
          tabs={SETTINGS_TABS}
        />
      </RequirePerm>
    ),
  });
  const tab = (path: string, permission: string | string[], page: () => ReactNode) =>
    createRoute({ getParentRoute: () => settings, path, component: guarded(permission, page) });
  return [
    settings.addChildren([
      tab('/', PERMS.settings, () => <SettingsIndex />),
      tab('/data-protection', PRIVACY_PERMS, () => <PrivacyPage />),
      tab('/system-status', OPS_PERMS, () => <OpsPage />),
    ]),
    createRoute({
      getParentRoute: () => parent,
      path: '/audit/export',
      component: guarded('audit.view', () => <AuditExportPage />),
    }),
  ];
}
