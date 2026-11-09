// Staff portal browser tests against `vite` + the LOCAL Supabase stack.
// Prerequisites: `pnpm db:start`, `npx supabase functions serve` (auth-sign-in), `node scripts/sync-secrets.mjs local`
// (writes apps/portal/.env.local), and a local admin from `node scripts/seed-admin.mjs local` whose
// must_change_password flag is cleared. Credentials come from PORTAL_E2E_EMAIL / PORTAL_E2E_PASSWORD;
// the tests skip when they are not set.
// Run: pnpm --filter @serene/portal e2e
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 5'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npx vite --port 5173 --strictPort --host 127.0.0.1',
    cwd: '..',
    url: 'http://127.0.0.1:5173/admin/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
