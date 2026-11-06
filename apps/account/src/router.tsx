import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router';
import { AuthGate, RootLayout } from './ui/shell';
import { NotFoundPage, RouteError } from './pages/errors';
import { PageSkeleton } from './ui/components';

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length < 500 ? v : undefined;
/** Only same-app paths are accepted as a return path (no open redirect). */
export const safeRedirect = (v: unknown): string | undefined => {
  const s = str(v);
  return s && s.startsWith('/') && !s.startsWith('//') && !s.includes('://') ? s : undefined;
};

const flag = (v: unknown) => v === true || v === '1' || v === 1 || v === 'true';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteError,
});

const signIn = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const r = safeRedirect(s.redirect);
    return r ? { redirect: r } : {};
  },
  component: lazyRouteComponent(() => import('./pages/sign-in'), 'SignInPage'),
});

const app = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AuthGate });

const dashboard = createRoute({
  getParentRoute: () => app,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/dashboard'), 'DashboardPage'),
});

const welcome = createRoute({
  getParentRoute: () => app,
  path: '/welcome',
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const r = safeRedirect(s.redirect);
    return r ? { redirect: r } : {};
  },
  component: lazyRouteComponent(() => import('./pages/welcome'), 'WelcomePage'),
});

const buy = createRoute({
  getParentRoute: () => app,
  path: '/buy',
  validateSearch: (s: Record<string, unknown>): { product?: string; for?: 'individual' | 'business' } => {
    const out: { product?: string; for?: 'individual' | 'business' } = {};
    const p = str(s.product);
    if (p && /^[A-Z]{3}$/.test(p.toUpperCase())) out.product = p.toUpperCase();
    if (s.for === 'business' || s.for === 'individual') out.for = s.for;
    return out;
  },
  component: lazyRouteComponent(() => import('./pages/buy'), 'BuyPage'),
});

const proposal = createRoute({
  getParentRoute: () => app,
  path: '/proposals/$id',
  validateSearch: (s: Record<string, unknown>): { step?: number; submitted?: boolean; renewed?: boolean } => {
    const out: { step?: number; submitted?: boolean; renewed?: boolean } = {};
    const n = Number(s.step);
    if (s.step !== undefined && Number.isInteger(n) && n >= 0 && n < 100) out.step = n;
    if (flag(s.submitted)) out.submitted = true;
    if (flag(s.renewed)) out.renewed = true;
    return out;
  },
  component: lazyRouteComponent(() => import('./pages/proposal'), 'ProposalPage'),
});

const pay = createRoute({
  getParentRoute: () => app,
  path: '/proposals/$id/pay',
  component: lazyRouteComponent(() => import('./pay/pay-page'), 'PayPage'),
});

const policy = createRoute({
  getParentRoute: () => app,
  path: '/policies/$id',
  component: lazyRouteComponent(() => import('./pages/policy'), 'PolicyPage'),
});

const newClaim = createRoute({
  getParentRoute: () => app,
  path: '/policies/$id/claim',
  component: lazyRouteComponent(() => import('./pages/claims/new-claim'), 'NewClaimPage'),
});

const claims = createRoute({
  getParentRoute: () => app,
  path: '/claims',
  component: lazyRouteComponent(() => import('./pages/claims/claims-list'), 'ClaimsListPage'),
});

const claim = createRoute({
  getParentRoute: () => app,
  path: '/claims/$id',
  validateSearch: (s: Record<string, unknown>): { submitted?: boolean } =>
    flag(s.submitted) ? { submitted: true } : {},
  component: lazyRouteComponent(() => import('./pages/claims/claim-detail'), 'ClaimDetailPage'),
});

const profile = createRoute({
  getParentRoute: () => app,
  path: '/profile',
  component: lazyRouteComponent(() => import('./pages/profile'), 'ProfilePage'),
});

const routeTree = rootRoute.addChildren([
  signIn,
  app.addChildren([dashboard, welcome, buy, proposal, pay, policy, newClaim, claims, claim, profile]),
]);

export const router = createRouter({
  routeTree,
  basepath: '/account',
  defaultPreload: 'intent',
  defaultPendingComponent: () => <PageSkeleton />,
  defaultPendingMs: 150,
  scrollRestoration: true,
  defaultNotFoundComponent: NotFoundPage,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
