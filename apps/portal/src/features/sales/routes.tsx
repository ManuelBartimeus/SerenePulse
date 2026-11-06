import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { lazy, Suspense, type ComponentType } from 'react';
import { RequirePerm } from '../../lib/require-perm';
import { PERMS } from '../../pages/shell';
import { Loading } from '../analytics/routes';

// Each sales page is its own chunk; the document renderers load only when a document is opened.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));
const OverviewPage = named(() => import('./overview'), 'BusinessOverviewPage');
const CustomersPage = named(() => import('./customers'), 'CustomersPage');
const CustomerDetailPage = named(() => import('./customers'), 'CustomerDetailPage');
const ProposalsPage = named(() => import('./proposals'), 'ProposalsPage');
const ProposalDetailPage = named(() => import('./proposals'), 'ProposalDetailPage');
const PoliciesPage = named(() => import('./policies'), 'PoliciesPage');
const PolicyDetailPage = named(() => import('./policies'), 'PolicyDetailPage');
const PaymentsPage = named(() => import('./policies'), 'PaymentsPage');
const ClaimsPage = named(() => import('./claims'), 'ClaimsPage');
const ClaimDetailPage = named(() => import('./claims'), 'ClaimDetailPage');
const ProductsRatesPage = named(() => import('./products-rates'), 'ProductsRatesPage');

/** "/" (business overview) and the sales pages (router basepath /admin). */
export function salesRoutes(parent: AnyRoute): AnyRoute[] {
  const r = (path: string, permission: string[] | null, Page: ComponentType) =>
    createRoute({
      getParentRoute: () => parent,
      path,
      component: () => {
        const page = (
          <Suspense fallback={<Loading />}>
            <Page />
          </Suspense>
        );
        return permission ? <RequirePerm permission={permission}>{page}</RequirePerm> : page;
      },
    });
  return [
    r('/', null, OverviewPage),
    r('/customers', PERMS.customers, CustomersPage),
    r('/customers/$customerId', PERMS.customers, CustomerDetailPage),
    r('/proposals', PERMS.proposals, ProposalsPage),
    r('/proposals/$proposalId', PERMS.proposals, ProposalDetailPage),
    r('/policies', PERMS.policies, PoliciesPage),
    r('/policies/$policyId', PERMS.policies, PolicyDetailPage),
    r('/claims', PERMS.claims, ClaimsPage),
    r('/claims/$claimId', PERMS.claims, ClaimDetailPage),
    r('/payments', PERMS.policies, PaymentsPage),
    r('/config/products', PERMS.products, ProductsRatesPage),
  ];
}
