import { createRoute, Navigate, type AnyRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { NavItem } from '../../lib/nav';
import { RequirePerm } from '../../lib/require-perm';
import { useSession } from '../../lib/session';
import { REPORT_TABS } from '../cases/page-tabs';
import { CorrectionsPage } from './corrections';
import { AuditExportPage, ExportsPage } from './exports';
import { OpsPage } from './ops';
import { PrivacyPage } from './privacy';
import { ReportFilesPage, SchedulesPage } from './schedules';

const CORRECTION_PERMS = ['responses.attribution.propose', 'responses.attribution.approve'];
const OPS_PERMS = ['settings.manage', 'audit.view_all'];
// NavItem permissions are any-of; the real rule (pii.view AND settings.manage, or Executive) is enforced in the
// page and the database. Executives hold responses.attribution.approve; System Admins hold settings.manage.
const PRIVACY_NAV_PERMS = ['responses.attribution.approve', 'settings.manage'];
const SCHEDULE_PERMS = ['reports.schedule', 'analytics.view'];

const guarded = (permission: string | string[], page: () => ReactNode) => () => (
  <RequirePerm permission={permission}>{page()}</RequirePerm>
);

/** /reports opens the first Reports tab this user may see. */
function ReportsLanding() {
  const { can } = useSession();
  const first = REPORT_TABS.find((t) =>
    (Array.isArray(t.permission) ? t.permission : [t.permission ?? '']).some((p) => !p || can(p)),
  );
  return <Navigate to={first?.to ?? '/reports/exports'} replace />;
}

/** Routes for exports, scheduled reports, privacy requests, corrections and operations (router basepath /admin). */
export function reportsRoutes(parent: AnyRoute): AnyRoute[] {
  const r = (path: string, permission: string | string[], page: () => ReactNode) =>
    createRoute({ getParentRoute: () => parent, path, component: guarded(permission, page) });
  return [
    createRoute({ getParentRoute: () => parent, path: '/reports', component: ReportsLanding }),
    r('/reports/exports', 'exports.create', () => <ExportsPage />),
    r('/reports/schedules', SCHEDULE_PERMS, () => <SchedulesPage />),
    r('/reports/files', 'analytics.view', () => <ReportFilesPage />),
    r('/reports/audit-export', 'audit.view', () => <AuditExportPage />),
    r('/reports/corrections', CORRECTION_PERMS, () => <CorrectionsPage />),
    r('/reports/privacy', PRIVACY_NAV_PERMS, () => <PrivacyPage />),
    r('/reports/ops', OPS_PERMS, () => <OpsPage />),
  ];
}

export const reportsNav: NavItem[] = [
  // One entry for the tabbed Reports page (Download data / Scheduled reports / Report files).
  {
    to: '/reports',
    label: 'Reports',
    permission: ['exports.create', ...SCHEDULE_PERMS],
    group: 'insights',
  },
  {
    to: '/reports/corrections',
    label: 'Branch corrections',
    permission: CORRECTION_PERMS,
    group: 'admin',
  },
  {
    to: '/reports/privacy',
    label: 'Data-protection requests',
    permission: PRIVACY_NAV_PERMS,
    group: 'admin',
  },
  { to: '/reports/ops', label: 'Operations & usage', permission: OPS_PERMS, group: 'admin' },
];
