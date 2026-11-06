import { createRoute, type AnyRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RequirePerm } from '../../lib/require-perm';
import { CaseDetailPage } from './case-detail';
import { CasesPage } from './cases-list';
import { FlagQueuePage, FlagRulesPage } from './flags';
import { NotificationPreferencesPage, NotificationsPage } from './notifications';

const guarded = (permission: string | string[] | null, page: () => ReactNode) => () =>
  permission ? <RequirePerm permission={permission}>{page()}</RequirePerm> : <>{page()}</>;

/** Routes for cases, flagged feedback and notifications (router basepath /admin; paths are relative). */
export function casesRoutes(parent: AnyRoute): AnyRoute[] {
  const r = (path: string, permission: string | string[] | null, page: () => ReactNode) =>
    createRoute({ getParentRoute: () => parent, path, component: guarded(permission, page) });
  return [
    r('/flags', 'flags.view', () => <FlagQueuePage />),
    r('/flags/rules', 'flags.configure', () => <FlagRulesPage />),
    r('/cases', 'cases.view', () => <CasesPage />),
    r('/cases/mine', 'cases.work', () => <CasesPage mine />),
    r('/cases/$caseId', 'cases.view', () => <CaseDetailPage />),
    r('/notifications', null, () => <NotificationsPage />),
    r('/notifications/preferences', null, () => <NotificationPreferencesPage />),
  ];
}
