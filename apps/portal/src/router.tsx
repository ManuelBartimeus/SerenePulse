import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { useRef } from 'react';
import { useSession } from './lib/session';
import { ForgotPasswordPage, SetPasswordPage, SignInPage } from './pages/auth';
import { AuditPage } from './pages/audit';
import { ProfilePage } from './pages/profile';
import { analyticsRoutes } from './features/analytics/routes';
import { casesRoutes } from './features/cases/routes';
import { configRoutes } from './features/config/routes';
import { settingsRoutes } from './features/reports/routes';
import { salesRoutes } from './features/sales/routes';
import { REDIRECTS, redirectRoutes } from './lib/redirect';
import { RequirePerm } from './lib/require-perm';
import { NotFoundPage, Shell } from './pages/shell';
import { UsersPage } from './pages/users';
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
  // The page the user asked for, captured on the first render. While the redirect runs, the router
  // already reports /sign-in and this gate renders once more; without the ref that second render
  // replaced next=/customers with next=/sign-in and the requested page was lost.
  const requested = useRef(path);
  if (!ready) return <FullPageSpinner />;
  if (!session) {
    const next = requested.current.startsWith('/sign-in') ? undefined : requested.current;
    return <Navigate to="/sign-in" search={next ? { next } : {}} replace />;
  }
  if (claims?.app_must_change_password) return <Navigate to="/set-password" replace />;
  return <Shell />;
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
  path: '/users',
  component: () => (
    <RequirePerm permission="users.manage">
      <UsersPage />
    </RequirePerm>
  ),
});
const audit = createRoute({
  getParentRoute: () => app,
  path: '/audit',
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
    ...salesRoutes(app),
    ...analyticsRoutes(app),
    ...casesRoutes(app),
    ...configRoutes(app),
    ...settingsRoutes(app),
    ...redirectRoutes(app, REDIRECTS),
    users,
    audit,
    profile,
  ]),
]);

export const router = createRouter({ routeTree, basepath: '/admin', defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
