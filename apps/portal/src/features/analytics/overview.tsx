import { EmptyState } from '../../ui/controls';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';

export function HomePage() {
  const { claims } = useSession();
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Customer feedback dashboards arrive with the analytics milestones."
      />
      <section className="rounded-lg bg-white">
        <EmptyState title="No feedback data yet">
          The customer survey goes live in a later milestone. Until then this page stays empty rather than
          showing sample figures. Your roles: {claims?.app_roles.join(', ') || 'none'}.
        </EmptyState>
      </section>
    </>
  );
}
