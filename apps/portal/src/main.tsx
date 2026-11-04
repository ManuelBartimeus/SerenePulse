import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import logoUrl from '@serene/ui/assets/serene-logo.svg';
import { loadConfig } from './config';
import './styles.css';

const config = loadConfig();

/** MS-01 skeleton: proves build, tokens and config validation. Sign-in arrives in MS-02. */
function App() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-[420px] rounded-lg bg-surface p-8 text-center">
        <img src={logoUrl} alt="Serene Insurance" className="mx-auto h-12 w-auto" />
        {config.ok ? (
          <>
            <h1 className="mt-6 text-[24px] leading-8 font-medium">Serene CX portal</h1>
            <p className="mt-2 text-secondary">Staff sign-in will be available here soon.</p>
            {config.env.VITE_APP_ENV !== 'production' && (
              <p className="mt-6 inline-block rounded-full bg-accent-50 px-3 py-1 text-[12px] font-medium">
                {config.env.VITE_APP_ENV} environment
              </p>
            )}
          </>
        ) : (
          <div role="alert" className="mt-6 rounded-sm bg-danger-bg p-4 text-left text-danger">
            <p className="font-medium">The portal is misconfigured and cannot start.</p>
            <p className="mt-1 text-[14px] leading-5">{config.problem}</p>
          </div>
        )}
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html is missing #root');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
