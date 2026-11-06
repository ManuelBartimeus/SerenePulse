// Browser tests for the static website: npx playwright test -c apps/landing/playwright.config.mjs
// (build first with node apps/landing/build.mjs). The spec starts its own static server.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: true,
  reporter: [['list']],
  use: { browserName: 'chromium' },
  timeout: 60_000,
});
