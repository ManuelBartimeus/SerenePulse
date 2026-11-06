// Screenshot + layout checks against `vite dev` with the mock API (VITE_MOCK_API=1).
// Run: pnpm --filter @serene/account e2e:mock   (needs `npx playwright install chromium` once)
//
// Projects: the purchase and returning-customer flows run with full layout checks on phones
// (320, 360, 390), a tablet (768) and desktop (1440); "viewports" walks every screen at all
// 13 widths (overflow everywhere, full checks at 320/390/768/1440) plus the keyboard, dialog,
// signature-rotation and font checks.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5175;
/** Set to run against a real site Worker instead (e.g. http://127.0.0.1:8787); no mock, no dev server. */
const EXTERNAL = process.env.E2E_BASE_URL;

const touch = (width: number, height: number, deviceScaleFactor = 2) => ({
  viewport: { width, height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor,
});

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: './test-results',
  timeout: 300_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: EXTERNAL ?? `http://localhost:${PORT}`,
    locale: 'en-GH',
    timezoneId: 'Africa/Accra',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone-320', use: touch(320, 568) },
    { name: 'phone-360', use: touch(360, 740) },
    { name: 'phone-390', use: touch(390, 844, 3) },
    { name: 'tablet-768', use: touch(768, 1024) },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'viewports', use: { viewport: { width: 1440, height: 900 } } },
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
