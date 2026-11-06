import { Link, type ErrorComponentProps } from '@tanstack/react-router';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Leaf } from '../ui/icons';
import { usePageTitle } from '../ui/shell';

function ErrorLayout({ title, children, action }: { title: string; children: ReactNode; action: ReactNode }) {
  return (
    <main id="main" className="wrap wrap-narrow flex flex-1 flex-col justify-center py-16">
      <Leaf className="text-brand" size={56} />
      <h1 className="h-display mt-6">{title}</h1>
      <div className="mt-3 max-w-prose text-[17px] leading-7 text-secondary">{children}</div>
      <div className="mt-8 flex flex-wrap gap-3">{action}</div>
    </main>
  );
}

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <ErrorLayout
      title="We can’t find that page"
      action={
        <>
          <Link to="/" className="btn btn-primary btn-lg">
            Go to my account
          </Link>
          <a href="/" className="btn btn-secondary btn-lg">
            Serene Insurance home
          </a>
        </>
      }
    >
      <p>
        The link may be old, or the page may have moved. Your policies and proposals are safe in your account.
      </p>
    </ErrorLayout>
  );
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const chunk = /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(
    String((error as Error | undefined)?.message ?? ''),
  );
  return (
    <ErrorLayout
      title={chunk ? 'A newer version is available' : 'Something went wrong on this page'}
      action={
        <>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => (chunk ? location.reload() : reset())}
          >
            {chunk ? 'Reload the page' : 'Try again'}
          </button>
          <Link to="/" className="btn btn-secondary btn-lg">
            Go to my account
          </Link>
        </>
      }
    >
      <p>
        {chunk
          ? 'We updated the app while you were using it. Reload to continue. Your saved answers are kept.'
          : 'Your saved answers are safe. Try again, and if it keeps happening call us on 030 291 7444.'}
      </p>
    </ErrorLayout>
  );
}

/** Last-resort boundary around the whole app (errors outside the router). */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorLayout
        title="Something went wrong"
        action={
          <button type="button" className="btn btn-primary btn-lg" onClick={() => location.reload()}>
            Reload
          </button>
        }
      >
        <p>
          Your saved answers are safe. Reload the page, and if it keeps happening call us on 030 291 7444.
        </p>
      </ErrorLayout>
    );
  }
}
