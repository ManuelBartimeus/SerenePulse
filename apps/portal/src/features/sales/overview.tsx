// "/" — the business overview: sales at a glance, then a compact customer-satisfaction strip.
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MEASURES, WORDS } from '../../lib/terms';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, EmptyState, Skeleton } from '../../ui/controls';
import { useSummary, type KpiKey } from '../analytics/api';
import { useAnalyticsFilters } from '../analytics/filters';
import { formatCount } from '../analytics/format';
import { KpiCard, StatTile } from '../analytics/ui';
import { CLAIMS, isMissingObject, SALES } from './api';
import { OPEN_CLAIM_STATUSES } from './claims-format';
import { ghs, periodStart, round2 } from './format';

interface SalesNumbers {
  awaitingReview: number | null;
  newProposals: number | null;
  policiesIssued: number | null;
  premiumCollected: number | null;
  newCustomers: number | null;
  openClaims: number | null;
}

function useSalesNumbers() {
  const { supabase, can } = useSession();
  const week = periodStart('week');
  const month = periodStart('month');
  return useQuery({
    queryKey: ['sales', 'overview', week, month],
    refetchInterval: 120_000,
    queryFn: async (): Promise<SalesNumbers> => {
      const count = async (
        allowed: boolean,
        build: () => PromiseLike<{ count: number | null; error: { message: string; code?: string } | null }>,
      ) => {
        if (!allowed) return null;
        const { count: n, error } = await build();
        if (error) {
          if (isMissingObject(error)) return null;
          throw error;
        }
        return n ?? 0;
      };
      const head = { count: 'exact' as const, head: true };
      const [awaitingReview, newProposals, policiesIssued, newCustomers, openClaims, premiumCollected] =
        await Promise.all([
          count(can('proposals.view'), () =>
            supabase
              .from(SALES.views.proposals)
              .select('id', head)
              .in('status', ['submitted', 'under_review']),
          ),
          count(can('proposals.view'), () =>
            supabase.from(SALES.views.proposals).select('id', head).gte('submitted_at', `${week}T00:00:00Z`),
          ),
          count(can('policies.view'), () =>
            supabase.from(SALES.views.policies).select('id', head).gte('issued_at', `${month}T00:00:00Z`),
          ),
          count(can('customers.view'), () =>
            supabase.from(SALES.views.customers).select('id', head).gte('created_at', `${month}T00:00:00Z`),
          ),
          count(can('claims.view'), () =>
            supabase
              .from(CLAIMS.views.list)
              .select('id', head)
              .in('status', [...OPEN_CLAIM_STATUSES]),
          ),
          (async () => {
            if (!can('policies.view')) return null;
            const { data, error } = await supabase
              .from(SALES.views.payments)
              .select('amount')
              .eq('status', 'succeeded')
              .gte('completed_at', `${month}T00:00:00Z`)
              .limit(10000);
            if (error) {
              if (isMissingObject(error)) return null;
              throw error;
            }
            return round2((data as { amount: number }[]).reduce((s, p) => s + Number(p.amount || 0), 0));
          })(),
        ]);
      return { awaitingReview, newProposals, policiesIssued, premiumCollected, newCustomers, openClaims };
    },
  });
}

function Tile({ label, value, to, hint }: { label: string; value: ReactNode; to: string; hint: string }) {
  const [path, query] = to.split('?');
  const search = Object.fromEntries(new URLSearchParams(query ?? ''));
  return (
    <Link
      to={path ?? '/'}
      search={search as never}
      className="block rounded-lg outline-none transition-shadow hover:shadow-float focus-visible:ring-2 focus-visible:ring-brand"
    >
      <StatTile label={label} value={value} footer={<p className="text-secondary">{hint}</p>} />
    </Link>
  );
}

function SalesTiles() {
  const q = useSalesNumbers();
  if (q.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (q.isError) return <Alert tone="danger">The sales summary couldn’t load. Try again shortly.</Alert>;
  const d = q.data;
  const tiles = [
    d.awaitingReview !== null && {
      label: 'Proposals awaiting review',
      value: formatCount(d.awaitingReview),
      to: '/proposals?tab=review',
      hint: 'Signed and sent, not yet priced or decided',
    },
    d.newProposals !== null && {
      label: 'New proposals this week',
      value: formatCount(d.newProposals),
      to: '/proposals?tab=all',
      hint: 'Sent since Monday',
    },
    d.policiesIssued !== null && {
      label: 'Policies issued this month',
      value: formatCount(d.policiesIssued),
      to: '/policies',
      hint: 'Certificates issued online',
    },
    d.premiumCollected !== null && {
      label: 'Premium collected this month',
      value: ghs(d.premiumCollected),
      to: '/payments',
      hint: 'Successful payments, including taxes',
    },
    d.newCustomers !== null && {
      label: 'New customers this month',
      value: formatCount(d.newCustomers),
      to: '/customers',
      hint: 'Signed in for the first time',
    },
    d.openClaims !== null && {
      label: 'Open claims',
      value: formatCount(d.openClaims),
      to: '/claims?tab=all',
      hint: 'Waiting for a decision or the customer',
    },
  ].filter((t): t is { label: string; value: string; to: string; hint: string } => !!t);
  if (tiles.length === 0) {
    return (
      <Alert tone="info" title="Online sales isn’t switched on yet">
        Sales figures appear here once online sales is set up on this system.
      </Alert>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
      {tiles.map((t) => (
        <Tile key={t.label} {...t} />
      ))}
    </div>
  );
}

const STRIP: KpiKey[] = ['csat_pct', 'nps', 'ces_avg'];

function SatisfactionStrip() {
  const { rpcFilters, periodText } = useAnalyticsFilters();
  const summary = useSummary(rpcFilters);
  return (
    <section aria-labelledby="satisfaction-heading" className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="satisfaction-heading" className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">
            Customer satisfaction
          </h2>
          <p className="text-[14px] text-secondary">{periodText}, from the customer feedback survey.</p>
        </div>
        <Link to="/insights" className="font-medium text-brand underline-offset-4 hover:underline">
          Feedback insights
        </Link>
      </div>
      {summary.isPending ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : summary.isError ? (
        <Alert tone="danger">The satisfaction summary couldn’t load. Try again shortly.</Alert>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STRIP.map((k) => (
            <KpiCard key={k} metric={k} m={summary.data.metrics[k]} />
          ))}
          <StatTile
            label={MEASURES.responses.label}
            explain={MEASURES.responses.explain}
            value={summary.data.n === 0 ? WORDS.noData : formatCount(summary.data.n)}
            muted={summary.data.n === 0}
            large={summary.data.n > 0}
          />
        </div>
      )}
    </section>
  );
}

/** The business overview (user direction 2026-11-06): sales first, satisfaction below. */
export function BusinessOverviewPage() {
  const { can, claims } = useSession();
  const sales = ['proposals.view', 'policies.view', 'customers.view', 'claims.view'].some((p) => can(p));
  const feedback = can('analytics.view');
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="How Serene Insurance is doing: online sales and what customers say."
      />
      {sales && <SalesTiles />}
      {feedback && <SatisfactionStrip />}
      {!sales && !feedback && (
        <section className="rounded-lg bg-white">
          <EmptyState title="No summaries for your role">
            Your roles ({claims?.app_roles.join(', ') || 'none'}) don’t include the overview figures. Use the
            menu for the areas you work in.
          </EmptyState>
        </section>
      )}
    </>
  );
}
