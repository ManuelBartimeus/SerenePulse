/* global process, console, document, window, setTimeout */
// Visual check: serves dist/ like the site Worker and captures full-page screenshots of every page.
// Usage: node apps/landing/scripts/screenshots.mjs <out-dir> [widths=390,1440] [filter]
//   (needs `npx playwright install chromium`). Also captures the open mobile menu and a quick-quote
//   result (with the /api absent, i.e. the fallback) at the first width.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pagePaths, serve } from '../e2e/serve.mjs';

const out = process.argv[2] ?? 'screenshots';
const widths = (process.argv[3] ?? '390,1440').split(',').map(Number);
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null;
mkdirSync(out, { recursive: true });

const { server, base } = await serve();
const browser = await chromium.launch();
const shots = [];
const name = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '-'));
const paths = [...pagePaths(), '/404-check'].filter((p) => !filter || filter.test(p));

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: width < 800 ? 844 : 900 } });
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 20));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
    const file = join(out, `${name(p)}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    shots.push(`${file}${overflow > 0 ? `  (horizontal overflow ${overflow}px)` : ''}`);
  }
  if (width === widths[0] && !filter) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    if (width < 1024) {
      await page.click('.menu-btn');
      await page.screenshot({ path: join(out, `menu-${width}.png`) });
      shots.push(join(out, `menu-${width}.png`));
      await page.keyboard.press('Escape');
    }
    await page.click('#panel-motor button[type="submit"]');
    await page.waitForSelector('#panel-motor [data-result]:not([hidden]) h3');
    const q = await page.$('#quote');
    await q.screenshot({ path: join(out, `quote-fallback-${width}.png`) });
    shots.push(join(out, `quote-fallback-${width}.png`));
  }
  await page.close();
}
await browser.close();
server.close();
console.log(shots.join('\n'));
