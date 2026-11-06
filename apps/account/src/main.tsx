import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { onUnauthorised } from './api/client';
import { keys } from './api/queries';
import { router } from './router';
import { AppErrorBoundary } from './pages/errors';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html is missing #root');

const queryClient = new QueryClient({
  queryCache: new QueryCache(),
  defaultOptions: {
    queries: {
      retry: (count, err) => {
        const status = (err as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return count < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 20_000,
    },
  },
});

// Session expiry: any 401 sends the customer to sign in, then back to where they were.
onUnauthorised(() => {
  const loc = router.state.location;
  if (loc.pathname.endsWith('/sign-in')) return;
  // Not signed in yet (first load): AuthGate redirects on its own.
  if (!queryClient.getQueryData(keys.me)) return;
  const redirect = loc.href.replace(/^\/account/, '') || '/';
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.me[0] });
  queryClient.setQueryData(keys.me, undefined);
  void router.navigate({ to: '/sign-in', search: redirect === '/' ? {} : { redirect }, replace: true });
});

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{}} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
