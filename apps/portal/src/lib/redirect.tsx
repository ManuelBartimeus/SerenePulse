import { createRoute, Navigate, type AnyRoute } from '@tanstack/react-router';

/**
 * Old addresses of pages that moved or were removed (2026-11-06 streamlining) send people to the
 * closest page instead of "page not found". Search params (filters) and path params are kept.
 */
export function redirectRoutes(parent: AnyRoute, map: Record<string, string>): AnyRoute[] {
  return Object.entries(map).map(([from, to]) =>
    createRoute({
      getParentRoute: () => parent,
      path: from,
      component: () => <Navigate to={to} params={true as never} search={true as never} replace />,
    }),
  );
}

/** Where each removed or moved page now lives. */
export const REDIRECTS: Record<string, string> = {
  // Feedback insights became one page with tabs.
  '/branches': '/insights/branches',
  '/branches/$branchId': '/insights/branches/$branchId',
  '/channels': '/insights/channels',
  '/products': '/insights/products',
  '/trends': '/insights/trends',
  '/factors': '/insights/areas-to-improve',
  // Removed pages → the closest page that remains.
  '/completion': '/insights',
  '/cases/performance': '/cases',
  '/alerts': '/insights',
  '/alerts/rules': '/insights',
  '/targets': '/insights',
  '/reports': '/records',
  '/reports/exports': '/records',
  '/reports/schedules': '/records',
  '/reports/files': '/records',
  '/reports/corrections': '/records',
  // Moved into Settings tabs / the audit log.
  '/config/settings': '/settings',
  '/reports/privacy': '/settings/data-protection',
  '/reports/ops': '/settings/system-status',
  '/reports/audit-export': '/audit/export',
};
