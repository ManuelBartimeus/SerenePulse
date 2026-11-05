/* global process, console, URL, document, window, setTimeout */
// Visual check: serves dist/ on a local port, then captures full-page screenshots of the landing page
// (and, when PORTAL_URL is set, the portal sign-in page) at 375 px and 1440 px.
// Usage: node apps/landing/scripts/screenshots.mjs <out-dir>   (needs `pnpm exec playwright install chromium`)
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist');
const out = process.argv[2] ?? join(dist, '../.screenshots');
mkdirSync(out, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  let file = join(dist, path || 'index.html');
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const shots = [];
const targets = [['landing', base]];
if (process.env.PORTAL_URL) targets.push(['portal-sign-in', process.env.PORTAL_URL]);
for (const [name, url] of targets) {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width < 800 ? 812 : 900 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    // Load lazy images before the full-page capture.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
    const file = join(out, `${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    shots.push(`${file}${overflow > 0 ? `  (horizontal overflow ${overflow}px)` : ''}`);
    if (process.env.SECTIONS && name === 'landing') {
      const parts = await page.$$('header.site-header, main > section, footer.site-footer');
      for (const [i, el] of parts.entries()) {
        await el.screenshot({ path: join(out, `${name}-${width}-part${String(i).padStart(2, '0')}.png`) });
      }
    }
    if (name === 'landing' && width === 375) {
      await page.click('.menu-btn');
      await page.screenshot({ path: join(out, `${name}-${width}-menu.png`) });
      shots.push(join(out, `${name}-${width}-menu.png`));
    }
    await page.close();
  }
}
await browser.close();
server.close();
console.log(shots.join('\n'));
