/* global document, window, getComputedStyle, sessionStorage, URL */
// Browser checks for the static website. Build first: node apps/landing/build.mjs
// Run: npx playwright test -c apps/landing/playwright.config.mjs
// Serves dist/ like the site Worker (see serve.mjs). /api is absent, so the quick quote must fall back.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pagePaths, serve } from './serve.mjs';

const PAGES = [...pagePaths(), '/no-such-page/'];
const VIEWPORTS = [
  { name: 'phone', width: 360, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
];
// Served by other apps on the same origin, not part of this build.
const EXTERNAL_APPS = /^\/(account|admin|customerfeedback|api)(\/|$|\?)/;

let server;
let base;
test.beforeAll(async () => {
  ({ server, base } = await serve());
});
test.afterAll(() => server?.close());

function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const path of PAGES) {
      test(`page ${path}`, async ({ page }) => {
        const errors = watchErrors(page);
        const res = await page.goto(base + path, { waitUntil: 'networkidle' });
        expect(res.status()).toBe(path === '/no-such-page/' ? 404 : 200);

        // No horizontal scroll.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);

        // One h1, and heading levels never skip on the way down.
        const levels = await page.$$eval('h1, h2, h3, h4, h5, h6', (hs) =>
          hs
            .filter((h) => h.getClientRects().length || h.closest('.sr-only'))
            .map((h) => Number(h.tagName[1])),
        );
        expect(levels.filter((l) => l === 1).length, 'exactly one h1').toBe(1);
        expect(levels[0]).toBe(1);
        for (let i = 1; i < levels.length; i++) {
          expect(
            levels[i] - levels[i - 1],
            `heading order at #${i}: ${levels.join(',')}`,
          ).toBeLessThanOrEqual(1);
        }

        // Body text at least 16px.
        const fontSize = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);

        // Tap targets: controls and stand-alone links are at least 44px tall.
        const small = await page.evaluate(() => {
          const out = [];
          const els = document.querySelectorAll(
            'button, input:not([type="hidden"]), select, summary, .btn, .nav-links a, .footer-nav a, .prod-links a, .branch-contact a, .buy-links a, .toc a',
          );
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || el.closest('[hidden]')) continue;
            const isRadio = el.type === 'radio';
            const target = isRadio ? el.closest('label').getBoundingClientRect() : r;
            if (target.height < 44 - 0.5)
              out.push(
                `${el.tagName} "${(el.textContent || el.id).trim().slice(0, 30)}" ${Math.round(target.height)}px`,
              );
          }
          return out;
        });
        expect(small, 'tap targets under 44px').toEqual([]);

        // Accessibility.
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const serious = axe.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map(
            (v) =>
              `${v.id}: ${v.nodes
                .map((n) => n.target.join(' '))
                .slice(0, 3)
                .join(' | ')}`,
          );
        expect(serious, 'axe serious/critical').toEqual([]);

        // 404 pages log the failed document request; nothing else may error.
        const relevant = errors.filter((e) => !(path === '/no-such-page/' && /404/.test(e)));
        expect(relevant, 'console errors').toEqual([]);
      });
    }
  });
}

test('every internal link and fragment resolves', async ({ page, request }) => {
  const checked = new Map();
  const ids = new Map();
  const idsOf = async (p) => {
    if (!ids.has(p)) {
      await page.goto(base + p);
      ids.set(p, new Set(await page.$$eval('[id]', (els) => els.map((e) => e.id))));
    }
    return ids.get(p);
  };
  const problems = [];
  for (const path of pagePaths()) {
    await page.goto(base + path);
    const hrefs = await page.$$eval('a[href], link[href], img[src], script[src]', (els) =>
      els.map((e) => e.getAttribute('href') ?? e.getAttribute('src')),
    );
    const srcsets = await page.$$eval('img[srcset]', (els) =>
      els.flatMap((e) =>
        e
          .getAttribute('srcset')
          .split(',')
          .map((s) => s.trim().split(' ')[0]),
      ),
    );
    for (const href of [...hrefs, ...srcsets]) {
      if (/^(https?:|mailto:|tel:)/.test(href)) continue;
      const url = new URL(href, base + path);
      if (url.origin !== base) continue;
      if (EXTERNAL_APPS.test(url.pathname)) continue;
      const p = url.pathname;
      if (!checked.has(p)) checked.set(p, (await request.get(base + p, { maxRedirects: 0 })).status());
      if (checked.get(p) !== 200) problems.push(`${path} → ${href} (${checked.get(p)})`);
      else if (url.hash && p.endsWith('/') && !(await idsOf(p)).has(decodeURIComponent(url.hash.slice(1))))
        problems.push(`${path} → ${href} (missing #id)`);
    }
  }
  expect(problems).toEqual([]);
});

test.describe('quick quote', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('falls back to the static tariff when /api is absent and continues to /account/buy', async ({
    page,
  }) => {
    await page.goto(base + '/');
    await page.click('#panel-motor button[type="submit"]');
    const result = page.locator('#panel-motor [data-result]');
    await expect(result.locator('h3')).toHaveText(/can’t show a live price/);
    await expect(result).toContainText('GH₵ 557 a year');
    await page.route('**/account/buy**', (r) => r.fulfill({ status: 200, body: 'buy page' }));
    await result.getByRole('button', { name: 'Continue to the proposal form' }).click();
    await page.waitForURL('**/account/buy?product=MTR');
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('serene.quickQuote')));
    expect(saved.productCode).toBe('MTR');
    expect(saved.answers).toMatchObject({ vehicle_use: 'private', cover_type: 'tpo', tppd_increase: 'no' });
    expect(saved.answers.vehicles[0]).toMatchObject({ body_type: 'saloon', seating_capacity: 5 });
    expect(saved.answers.cover_end > saved.answers.cover_start).toBe(true);
  });

  test('shows the price, the breakdown and the indicative note from the API', async ({ page }) => {
    let sent;
    await page.route('**/api/account/quick-quote', async (route) => {
      sent = { body: route.request().postDataJSON(), headers: route.request().headers() };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currency: 'GHS',
          premium: 4500,
          lines: [
            { label: 'Third-party premium: Private individual / corporate', amount: 557 },
            { label: 'Own damage, fire & theft: 5% of GH₵ 90,000.00', amount: 3943 },
          ],
          taxes: [],
          total: 4500,
          indicative: true,
          notes: ['Subject to the vehicle photos and documents you attach.'],
          validUntil: '2026-12-06',
          source: 'rating',
        }),
      });
    });
    await page.goto(base + '/');
    await page.check('input[name="cover_type"][value="comprehensive"]');
    await expect(page.locator('#m-value')).toBeVisible();
    await page.click('#panel-motor button[type="submit"]');
    await expect(page.locator('#m-value-error')).toBeVisible();
    await page.fill('#m-value', '90,000');
    await page.fill('#m-year', '2018');
    await page.click('#panel-motor button[type="submit"]');
    const result = page.locator('#panel-motor [data-result]');
    await expect(result.locator('.qq-total')).toHaveText('GH₵ 4,500.00');
    await expect(result).toContainText('Indicative price');
    expect(sent.headers['x-requested-with']).toBe('serene-account');
    expect(sent.body.productCode).toBe('MTR');
    expect(sent.body.answers.vehicles[0]).toMatchObject({ estimated_value: 90000, year_of_make: 2018 });
  });

  test('shows referral reasons from a 422', async ({ page }) => {
    await page.route('**/api/account/quick-quote', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          title: 'Referred',
          status: 422,
          refer: ['Buses with more than 23 seats are rated by an underwriter.'],
        }),
      }),
    );
    await page.goto(base + '/');
    await page.selectOption('#m-vehicle', 'trotro');
    await page.fill('#m-seats', '30');
    await page.click('#panel-motor button[type="submit"]');
    const result = page.locator('#panel-motor [data-result]');
    await expect(result).toContainText('An underwriter needs to price this');
    await expect(result).toContainText('more than 23 seats');
  });

  test('travel tab builds the travel answers', async ({ page }) => {
    let body;
    await page.route('**/api/account/quick-quote', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 503, body: 'down' });
    });
    await page.goto(base + '/');
    await page.getByRole('tab', { name: 'Travel' }).click();
    await page.selectOption('#t-zone', 'schengen_europe');
    const d = (n) => {
      const x = new Date();
      x.setDate(x.getDate() + n);
      return x.toISOString().slice(0, 10);
    };
    await page.fill('#t-start', d(10));
    await page.fill('#t-end', d(24));
    await page.fill('#t-dob-0', '1985-03-14');
    await page.click('[data-add-traveller]');
    await page.fill('#t-dob-1', '2015-07-01');
    await page.click('#panel-travel button[type="submit"]');
    await expect(page.locator('#panel-travel [data-result] h3')).toHaveText(/can’t show a live price/);
    expect(body.productCode).toBe('TRV');
    expect(body.answers).toMatchObject({
      destination_zone: 'schengen_europe',
      date_of_birth: '1985-03-14',
      accompanying_travellers: [{ name: 'Traveller 2', date_of_birth: '2015-07-01' }],
    });
  });
});

test.describe('other interactions', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile menu opens full height with both actions and closes on Escape', async ({ page }) => {
    await page.goto(base + '/claims/');
    const btn = page.locator('.menu-btn');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#site-nav').getByRole('link', { name: 'Get a quote' })).toBeVisible();
    await expect(page.locator('#site-nav').getByRole('link', { name: 'Sign in' })).toBeVisible();
    const box = await page.locator('#site-nav').boundingBox();
    expect(box.y + box.height).toBeGreaterThanOrEqual(843);
    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toBeFocused();
  });

  test('certificate check reads ?certificate= and shows the result', async ({ page }) => {
    await page.route('**/api/verify?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          found: true,
          status: 'active',
          certificateNo: 'C01-26-10001',
          policyNo: 'SE26MTP10001-E',
          productName: 'Motor insurance',
          coverTitle: 'Third party only',
          insuredSubject: 'GR 1234-22',
          holderInitials: 'A. I.',
          startsOn: '2026-11-06',
          expiresOn: '2027-11-05',
        }),
      }),
    );
    await page.goto(base + '/verify/?certificate=C01-26-10001');
    await expect(page.locator('#v-cert')).toHaveValue('C01-26-10001');
    await expect(page.locator('#v-reg')).toBeFocused();
    await page.fill('#v-reg', 'GR 1234-22');
    await page.click('[data-verify] button[type="submit"]');
    const result = page.locator('[data-verify-result]');
    await expect(result).toHaveClass(/is-valid/);
    await expect(result).toContainText('Valid certificate');
    await expect(result).toContainText('A. I.');
  });

  test('branch search filters the list', async ({ page }) => {
    await page.goto(base + '/branches/');
    await page.fill('#branch-q', 'tema');
    await expect(page.locator('.branch:visible')).toHaveCount(2);
    await expect(page.locator('[data-branch-status]')).toHaveText('Showing 2 of 13 branches');
    await page.fill('#branch-q', 'zzzz');
    await expect(page.locator('[data-branch-empty]')).toBeVisible();
  });

  test('works without JavaScript', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base + '/');
    await expect(page.locator('.nav-links a', { hasText: 'Claims' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.goto(base + '/branches/');
    await expect(page.locator('.branch:visible')).toHaveCount(13);
    await ctx.close();
  });
});

test('no horizontal scroll at 320, 390, 414, 768, 1024 and 1280 px', async ({ browser }) => {
  const problems = [];
  for (const width of [320, 390, 414, 768, 1024, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    for (const path of pagePaths()) {
      await page.goto(base + path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${path} at ${width}px: ${overflow}px`);
    }
    await page.close();
  }
  expect(problems).toEqual([]);
});
