// Survey e2e against `wrangler dev` + the local Supabase stack.
// Prerequisites: `pnpm db:start` (migrations applied), `node scripts/sync-secrets.mjs local` (writes the
// git-ignored apps/survey-worker/.dev.vars), Docker CLI on PATH (DB assertions use `docker exec psql`).
// Run: pnpm --filter @serene/survey-worker e2e
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.SURVEY_E2E_PORT ?? 8787);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 5'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm exec wrangler dev --port ${PORT} --ip 127.0.0.1`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
