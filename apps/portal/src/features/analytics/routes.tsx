import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { WORDS } from '../../lib/terms';
import { RequirePerm } from '../../lib/require-perm';
import { Spinner } from '../../ui/controls';
import { TabbedPage } from '../../pages/tabbed';
import type { PageTab } from '../cases/page-tabs';

// Route-level code splitting (A-26): each dashboard is its own chunk.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));
const SummaryPage = named(() => import('./overview'), 'HomePage');
const BranchesPage = named(() => import('./branches'), 'BranchesPage');
const BranchDetailPage = named(() => import('./branches'), 'BranchDetailPage');
const TrendsPage = named(() => import('./trends'), 'TrendsPage');
const FactorsPage = named(() => import('./factors'), 'FactorsPage');
const RecordsPage = named(() => import('./records'), 'RecordsPage');
const ChannelsPage = lazy(() =>
  import('./dimension').then((m) => ({
    default: () => (
      <m.DimensionPage
        dimension="channel"
        noun="channel"
        title="Channels"
        subtitle="How customers rate their experience, by the channel they used to get their policy."
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
        subtitle="How customers rate their experience, by type of policy."
      />
    ),
  })),
);

export function Loading() {
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

/** Feedback insights: one page, one tab per view (user direction 2026-11-06). */
export const INSIGHT_TABS: PageTab[] = [
  { to: '/insights', label: 'Summary' },
  { to: '/insights/branches', label: 'Branches', match: (p) => p.startsWith('/insights/branches') },
  { to: '/insights/channels', label: 'Channels' },
  { to: '/insights/products', label: 'Products' },
  { to: '/insights/trends', label: 'Trends' },
  { to: '/insights/areas-to-improve', label: WORDS.factors },
];

/** Routes for the feedback dashboards and customer responses (paths relative to the /admin basepath). */
export function analyticsRoutes(parent: AnyRoute): AnyRoute[] {
  const insights = createRoute({
    getParentRoute: () => parent,
    path: '/insights',
    component: () => (
      <RequirePerm permission="analytics.view">
        <TabbedPage
          title="Feedback insights"
          subtitle="How customers feel about their experience with Serene Insurance."
          tabs={INSIGHT_TABS}
        />
      </RequirePerm>
    ),
  });
  const tab = (path: string, Page: ComponentType) =>
    createRoute({
      getParentRoute: () => insights,
      path,
      component: () => (
        <Guard permission="analytics.view">
          <Page />
        </Guard>
      ),
    });
  return [
    insights.addChildren([
      tab('/', SummaryPage),
      tab('/branches', BranchesPage),
      tab('/branches/$branchId', BranchDetailPage),
      tab('/channels', ChannelsPage),
      tab('/products', ProductsPage),
      tab('/trends', TrendsPage),
      tab('/areas-to-improve', FactorsPage),
    ]),
    createRoute({
      getParentRoute: () => parent,
      path: '/records',
      component: () => (
        <Guard permission="responses.view">
          <RecordsPage />
        </Guard>
      ),
    }),
  ];
}
