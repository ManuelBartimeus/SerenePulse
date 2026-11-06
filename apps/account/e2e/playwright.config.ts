// Screenshot + layout checks against `vite dev` with the mock API (VITE_MOCK_API=1).
// Run: pnpm --filter @serene/account e2e:mock   (needs `npx playwright install chromium` once)
import { defineConfig } from '@playwright/test';

const PORT = 5175;
/** Set to run against a real site Worker instead (e.g. http://127.0.0.1:8787); no mock, no dev server. */
const EXTERNAL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: './test-results',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: EXTERNAL ?? `http://localhost:${PORT}`,
    locale: 'en-GH',
    timezoneId: 'Africa/Accra',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: EXTERNAL
    ? undefined
    : {
        command: 'npx vite --port 5175 --strictPort',
        cwd: '..',
        url: `http://localhost:${PORT}/account/sign-in`,
        reuseExistingServer: true,
        timeout: 60_000,
        env: { VITE_MOCK_API: '1' },
      },
});
