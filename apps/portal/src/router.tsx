import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useSession } from './lib/session';
import { ForgotPasswordPage, SetPasswordPage, SignInPage } from './pages/auth';
import { AuditPage } from './pages/audit';
import { ProfilePage } from './pages/profile';
import { analyticsRoutes } from './features/analytics/routes';
import { casesRoutes } from './features/cases/routes';
import { configRoutes } from './features/config/routes';
import { reportsRoutes } from './features/reports/routes';
import { AccessDeniedPage, NotFoundPage, Shell } from './pages/shell';
import { ApprovalsPage, UsersPage } from './pages/users';
import { Spinner } from './ui/controls';

function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center bg-subtle">
      <Spinner label="Loading" />
    </div>
  );
}

/** Signed-in area: no session → sign in; must change password → set a new one first (F16). */
function AuthGate() {
  const { ready, session, claims } = useSession();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!ready) return <FullPageSpinner />;
  if (!session) return <Navigate to="/sign-in" search={{ next: path }} replace />;
  if (claims?.app_must_change_password) return <Navigate to="/set-password" replace />;
  return <Shell />;
}

/** Direct URL access without the permission shows the access-denied page (STEP 7). */
export function RequirePerm({
  permission,
  children,
}: {
  permission: string | string[];
  children: ReactNode;
}) {
  const { can } = useSession();
  const allowed = (Array.isArray(permission) ? permission : [permission]).some((p) => can(p));
  return allowed ? <>{children}</> : <AccessDeniedPage />;
}

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage });

const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: SignInPage });
const setPassword = createRoute({
  getParentRoute: () => rootRoute,
  path: '/set-password',
  component: SetPasswordPage,
});
const forgot = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

const app = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AuthGate });
const users = createRoute({
  getParentRoute: () => app,
  path: '/admin/users',
  component: () => (
    <RequirePerm permission="users.manage">
      <UsersPage />
    </RequirePerm>
  ),
});
const approvals = createRoute({
  getParentRoute: () => app,
  path: '/admin/approvals',
  component: () => (
    <RequirePerm permission="survey.publish.approve">
      <ApprovalsPage />
    </RequirePerm>
  ),
});
const audit = createRoute({
  getParentRoute: () => app,
  path: '/admin/audit',
  component: () => (
    <RequirePerm permission="audit.view">
      <AuditPage />
    </RequirePerm>
  ),
});
const profile = createRoute({ getParentRoute: () => app, path: '/profile', component: ProfilePage });

const routeTree = rootRoute.addChildren([
  signIn,
  setPassword,
  forgot,
  app.addChildren([
    ...analyticsRoutes(app),
    ...casesRoutes(app),
    ...configRoutes(app),
    ...reportsRoutes(app),
    users,
    approvals,
    audit,
    profile,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
