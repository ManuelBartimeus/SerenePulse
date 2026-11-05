import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadConfig } from './config';
import { SessionProvider } from './lib/session';
import { createSupabase } from './lib/supabase';
import { router } from './router';
import { AuthCard } from './ui/auth-card';
import { Alert } from './ui/controls';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html is missing #root');

const config = loadConfig();
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

createRoot(rootElement).render(
  <StrictMode>
    {config.ok ? (
      <SessionProvider supabase={createSupabase(config.env)} env={config.env}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </SessionProvider>
    ) : (
      <AuthCard title="The portal can’t start">
        <Alert tone="danger" detail={config.problem}>
          The portal is misconfigured. Please tell your system administrator.
        </Alert>
      </AuthCard>
    )}
  </StrictMode>,
);
