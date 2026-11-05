import { createRoute, type AnyRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { NavItem } from '../../lib/nav';
import { RequirePerm } from '../../lib/require-perm';
import { AlertInboxPage, AlertRulesPage } from './alerts';
import { CaseDetailPage } from './case-detail';
import { CasesPage } from './cases-list';
import { FlagQueuePage, FlagRulesPage } from './flags';
import { NotificationPreferencesPage, NotificationsPage } from './notifications';
import { CasePerformancePage } from './performance';
import { TargetsPage } from './targets';

const guarded = (permission: string | string[] | null, page: () => ReactNode) => () =>
  permission ? <RequirePerm permission={permission}>{page()}</RequirePerm> : <>{page()}</>;

/** Routes for flags, cases, targets, alerts and notifications (router basepath /admin; paths are relative). */
export function casesRoutes(parent: AnyRoute): AnyRoute[] {
  const r = (path: string, permission: string | string[] | null, page: () => ReactNode) =>
    createRoute({ getParentRoute: () => parent, path, component: guarded(permission, page) });
  return [
    r('/flags', 'flags.view', () => <FlagQueuePage />),
    r('/flags/rules', 'flags.configure', () => <FlagRulesPage />),
    r('/cases', 'cases.view', () => <CasesPage />),
    r('/cases/mine', 'cases.work', () => <CasesPage mine />),
    r('/cases/performance', ['cases.view', 'analytics.view'], () => <CasePerformancePage />),
    r('/cases/$caseId', 'cases.view', () => <CaseDetailPage />),
    r('/targets', ['targets.manage', 'analytics.view'], () => <TargetsPage />),
    r('/alerts', null, () => <AlertInboxPage />),
    r('/alerts/rules', 'alerts.manage', () => <AlertRulesPage />),
    r('/notifications', null, () => <NotificationsPage />),
    r('/notifications/preferences', null, () => <NotificationPreferencesPage />),
  ];
}

/** Sidebar entries; sub-pages (My cases, Flagging rules, Alert rules, Targets) are tabs on these pages. */
export const casesNav: NavItem[] = [
  { to: '/flags', label: 'Flagged feedback', permission: 'flags.view', group: 'operations' },
  { to: '/cases', label: 'Cases', permission: 'cases.view', group: 'operations' },
  {
    to: '/cases/performance',
    label: 'Case performance',
    permission: ['cases.view', 'analytics.view'],
    group: 'operations',
  },
  { to: '/alerts', label: 'Alerts', permission: ['alerts.manage', 'analytics.view'], group: 'operations' },
];
