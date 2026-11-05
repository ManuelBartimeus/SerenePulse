import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import type { NavItem } from '../../lib/nav';
import { RequirePerm } from '../../lib/require-perm';
import { useSession } from '../../lib/session';
import { EmptyState, Spinner } from '../../ui/controls';
import { PageHeader } from '../../pages/shell';

// Route-level code splitting (A-26): each dashboard is its own chunk.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));
const HomePage = named(() => import('./overview'), 'HomePage');
const BranchesPage = named(() => import('./branches'), 'BranchesPage');
const BranchDetailPage = named(() => import('./branches'), 'BranchDetailPage');
const TrendsPage = named(() => import('./trends'), 'TrendsPage');
const FactorsPage = named(() => import('./factors'), 'FactorsPage');
const SourcesPage = named(() => import('./sources'), 'SourcesPage');
const CompletionPage = named(() => import('./sources'), 'CompletionPage');
const RecordsPage = named(() => import('./records'), 'RecordsPage');
const ChannelsPage = lazy(() =>
  import('./dimension').then((m) => ({
    default: () => (
      <m.DimensionPage
        dimension="channel"
        noun="channel"
        title="Channels"
        subtitle="How customers who obtained their policy through each channel rate the experience."
      />
    ),
  })),
);
const ProductsPage = lazy(() =>
  import('./dimension').then((m) => ({
    default: () => (
      <m.DimensionPage
        dimension="product"
        noun="product"
        title="Products"
        subtitle="Experience by type of insurance policy."
      />
    ),
  })),
);

function Loading() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner label="Loading" />
    </div>
  );
}

function Guard({ permission, children }: { permission: string; children: ReactNode }) {
  return (
    <RequirePerm permission={permission}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </RequirePerm>
  );
}

/** "/" is the overview for analytics users; other signed-in users get a plain welcome. */
function Home() {
  const { can, claims } = useSession();
  if (can('analytics.view')) {
    return (
      <Suspense fallback={<Loading />}>
        <HomePage />
      </Suspense>
    );
  }
  return (
    <>
      <PageHeader title="Welcome" />
      <section className="rounded-lg bg-white">
        <EmptyState title="No dashboards for your role">
          Your roles ({claims?.app_roles.join(', ') || 'none'}) don’t include analytics. Use the menu for the
          areas you work in.
        </EmptyState>
      </section>
    </>
  );
}

/** Routes for dashboards and feedback records. This area owns "/" (the overview). Paths are relative to the router basepath. */
export function analyticsRoutes(parent: AnyRoute): AnyRoute[] {
  const route = (path: string, permission: string, Page: ComponentType) =>
    createRoute({
      getParentRoute: () => parent,
      path,
      component: () => (
        <Guard permission={permission}>
          <Page />
        </Guard>
      ),
    });
  return [
    createRoute({ getParentRoute: () => parent, path: '/', component: Home }),
    route('/branches', 'analytics.view', BranchesPage),
    route('/branches/$branchId', 'analytics.view', BranchDetailPage),
    route('/channels', 'analytics.view', ChannelsPage),
    route('/products', 'analytics.view', ProductsPage),
    route('/trends', 'analytics.view', TrendsPage),
    route('/factors', 'analytics.view', FactorsPage),
    route('/sources', 'analytics.view', SourcesPage),
    route('/completion', 'analytics.view', CompletionPage),
    route('/records', 'responses.view', RecordsPage),
  ];
}

export const analyticsNav: NavItem[] = [
  { to: '/', label: 'Overview' },
  { to: '/branches', label: 'Branches', permission: 'analytics.view', group: 'insights' },
  { to: '/channels', label: 'Channels', permission: 'analytics.view', group: 'insights' },
  { to: '/products', label: 'Products', permission: 'analytics.view', group: 'insights' },
  { to: '/trends', label: 'Trends', permission: 'analytics.view', group: 'insights' },
  { to: '/factors', label: 'Improvement factors', permission: 'analytics.view', group: 'insights' },
  { to: '/sources', label: 'Sources & funnel', permission: 'analytics.view', group: 'insights' },
  { to: '/completion', label: 'Completion time', permission: 'analytics.view', group: 'insights' },
  { to: '/records', label: 'Records', permission: 'responses.view', group: 'insights' },
];
