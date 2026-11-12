/* global document, window, getComputedStyle, sessionStorage, URL, location, NodeFilter, setTimeout */
// Browser checks for the static website. Build first: node apps/landing/build.mjs
// Run: npx playwright test -c apps/landing/playwright.config.mjs
// Serves dist/ like the site Worker (see serve.mjs). /api is absent, so the quick quote must fall back.
//
// Layout matrix (every page):
//   full checks at 320×568, 390×844, 768×1024 and 1440×900: overflow with the clip lifted, text
//   overflow in containers, tap targets (44×44 and 8px apart on touch screens), 16px inputs and body
//   text, headings never broken mid-word, images never stretched, heading order, anchors clear of the
//   sticky header, console errors; axe at 390 and 1440.
//   overflow checks at 360×740, 375×667, 393×873, 412×915, 430×932, 820×1180, 1024×768, 1280×800
//   and landscape 844×390.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pagePaths, serve } from './serve.mjs';

const PAGES = [...pagePaths(), '/no-such-page/'];
const touch = (width) => width < 1100;
const FULL = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];
const OVERFLOW_ONLY = [
  { width: 360, height: 740 },
  { width: 375, height: 667 },
  { width: 393, height: 873 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 844, height: 390 },
];
const AXE_AT = new Set([390, 1440]);
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

const contextFor = (vp) => ({
  viewport: vp,
  hasTouch: touch(vp.width),
  isMobile: touch(vp.width),
  reducedMotion: 'reduce',
});

/** Scrolls through the page so lazy images load, then back to the top. */
async function settle(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 15));
    }
    window.scrollTo(0, 0);
  });
}

/** Horizontal overflow with any overflow clip on html/body lifted (CSSOM, allowed by the CSP). */
const overflowLifted = (page) =>
  page.evaluate(() => {
    for (const el of [document.documentElement, document.body]) {
      el.style.setProperty('overflow', 'visible', 'important');
    }
    const extra = document.documentElement.scrollWidth - window.innerWidth;
    for (const el of [document.documentElement, document.body]) el.style.removeProperty('overflow');
    return extra;
  });

/** Text containers whose content is wider than their box (clipped or spilling text). */
const textOverflow = (page) =>
  page.evaluate(() => {
    const out = [];
    const sel =
      'h1, h2, h3, h4, p, a, button, label, li, td, th, dt, dd, summary, figcaption, legend, .btn, .tag, .qq-badge';
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('.sr-only, [hidden]')) continue;
      // A header menu item holds its closed dropdown (visibility: hidden), which is not text overflow.
      if (el.matches('.nav-item')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.display === 'none' || !el.clientWidth) continue;
      if (el.scrollWidth > el.clientWidth + 1)
        out.push(`${el.tagName} "${el.textContent.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
    }
    return out;
  });

for (const vp of FULL) {
  test.describe(`full ${vp.width}×${vp.height}`, () => {
    test.use(contextFor(vp));

    for (const path of PAGES) {
      test(`page ${path}`, async ({ page }) => {
        const errors = watchErrors(page);
        const res = await page.goto(base + path, { waitUntil: 'networkidle' });
        expect(res.status()).toBe(path === '/no-such-page/' ? 404 : 200);
        await settle(page);
        await page.waitForLoadState('networkidle');

        expect(await overflowLifted(page), 'horizontal overflow').toBeLessThanOrEqual(0);
        expect(await textOverflow(page), 'text overflowing its box').toEqual([]);

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

        // Text sizes: body 16px, every input 16px (iOS zooms into smaller ones).
        const sizes = await page.evaluate(() => ({
          body: parseFloat(getComputedStyle(document.body).fontSize),
          inputs: [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')]
            .filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16)
            .map((i) => i.id || i.name),
        }));
        expect(sizes.body).toBeGreaterThanOrEqual(16);
        expect(sizes.inputs, 'inputs under 16px').toEqual([]);

        // Tap targets: 44×44 and 8px apart on touch screens; 24×24 (WCAG 2.5.8) with a mouse.
        const isTouch = vp.width < 1100;
        const targets = await page.evaluate((isTouchScreen) => {
          const W = window.innerWidth;
          const min = isTouchScreen ? 44 : 24;
          const blockOf = (el) => {
            let p = el.parentElement;
            while (p && ['inline', 'contents'].includes(getComputedStyle(p).display)) p = p.parentElement;
            return p;
          };
          // A link inside running text (its block has more text than the link) is exempt, as in WCAG.
          const inline = (a) => {
            const b = blockOf(a);
            return (
              b &&
              b.textContent.replace(/\s+/g, ' ').trim().length >
                a.textContent.replace(/\s+/g, ' ').trim().length + 2
            );
          };
          const els = [
            ...document.querySelectorAll(
              'a[href], button, input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, summary, label.choice',
            ),
          ].filter((el) => {
            if (el.classList.contains('skip')) return false;
            if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
            const r = el.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) return false;
            if (r.left < -1 || r.right > W + 1) return false; // off-screen slides and cards
            if (el.tagName === 'A' && inline(el)) return false;
            return true;
          });
          const name = (el) =>
            `${el.tagName} "${(el.textContent || el.id || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 32)}"`;
          const small = [];
          const close = [];
          const rects = els.map((el) => el.getBoundingClientRect());
          els.forEach((el, i) => {
            const r = rects[i];
            if (r.height < min - 0.5 || r.width < min - 0.5)
              small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
          });
          if (isTouchScreen) {
            for (let i = 0; i < els.length; i++) {
              for (let j = i + 1; j < els.length; j++) {
                if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
                const a = rects[i];
                const b = rects[j];
                const dx = Math.max(0, b.left - a.right, a.left - b.right);
                const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
                if (Math.max(dx, dy) < 7.5)
                  close.push(`${name(els[i])} / ${name(els[j])} ${Math.round(Math.max(dx, dy))}px`);
              }
            }
          }
          return { small, close: close.slice(0, 20) };
        }, isTouch);
        expect(targets.small, 'tap targets too small').toEqual([]);
        expect(targets.close, 'tap targets closer than 8px').toEqual([]);

        // Headings never break inside a word.
        const broken = await page.evaluate(() => {
          const out = [];
          for (const h of document.querySelectorAll('h1, h2, h3, h4')) {
            if (!h.getClientRects().length || h.closest('.sr-only')) continue;
            const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (n.parentElement.closest('.sr-only')) continue;
              for (const m of n.data.matchAll(/[^\s\-/]+/g)) {
                const range = document.createRange();
                range.setStart(n, m.index);
                range.setEnd(n, m.index + m[0].length);
                const tops = new Set(
                  [...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)),
                );
                if (tops.size > 1) out.push(`"${m[0]}" in "${h.textContent.trim().slice(0, 40)}"`);
              }
            }
          }
          return out;
        });
        expect(broken, 'headings broken mid-word').toEqual([]);

        // Images: explicit width/height, never stretched.
        const images = await page.evaluate(() =>
          [...document.images]
            .filter((img) => img.getClientRects().length && img.complete && img.naturalWidth)
            .flatMap((img) => {
              const problems = [];
              if (!img.getAttribute('width') || !img.getAttribute('height'))
                problems.push(`${img.src} has no width/height`);
              const fit = getComputedStyle(img).objectFit;
              const r = img.getBoundingClientRect();
              if (fit === 'fill' && r.width > 2 && r.height > 2) {
                const natural = img.naturalWidth / img.naturalHeight;
                const shown = r.width / r.height;
                if (Math.abs(natural - shown) / natural > 0.02)
                  problems.push(`${img.src} stretched ${natural.toFixed(2)} vs ${shown.toFixed(2)}`);
              }
              return problems;
            }),
        );
        expect(images, 'image problems').toEqual([]);

        // The sticky header never covers an anchor target.
        const anchor = await page.evaluate(() => {
          const link = document.querySelector('.toc a[href^="#"], .jump a[href^="#"]');
          return link ? link.getAttribute('href').slice(1) : null;
        });
        if (anchor) {
          await page.evaluate((id) => {
            location.hash = id;
          }, anchor);
          await page.waitForTimeout(50);
          const pos = await page.evaluate((id) => {
            const header = document.querySelector('[data-header]').getBoundingClientRect();
            return { target: document.getElementById(id).getBoundingClientRect().top, header: header.bottom };
          }, anchor);
          expect(pos.target, `#${anchor} under the header`).toBeGreaterThanOrEqual(pos.header - 1);
        }

        if (AXE_AT.has(vp.width)) {
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
        }

        // 404 pages log the failed document request; nothing else may error.
        const relevant = errors.filter((e) => !(path === '/no-such-page/' && /404/.test(e)));
        expect(relevant, 'console errors').toEqual([]);
      });
    }
  });
}

for (const vp of OVERFLOW_ONLY) {
  test(`overflow at ${vp.width}×${vp.height}`, async ({ browser }) => {
    const ctx = await browser.newContext(contextFor(vp));
    const page = await ctx.newPage();
    const problems = [];
    for (const path of pagePaths()) {
      await page.goto(base + path, { waitUntil: 'load' });
      const extra = await overflowLifted(page);
      if (extra > 0) problems.push(`${path}: ${extra}px wider than the screen`);
      for (const t of await textOverflow(page)) problems.push(`${path}: ${t}`);
    }
    await ctx.close();
    expect(problems).toEqual([]);
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
    const srcsets = await page.$$eval('img[srcset], source[srcset]', (els) =>
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

test.describe('type and images', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // DM Sans has no ₵ (U+20B5) in either Google subset; scripts/make-cedi-font.py builds one from DM
  // Sans's own C as a third face with unicode-range U+20B5. These checks make sure prices never fall
  // back to a system font.
  test('the cedi sign renders in DM Sans; all three DM Sans faces are declared and load', async ({
    page,
  }) => {
    const faces = async () =>
      page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter((f) => f.family.replace(/"/g, '') === 'DM Sans')
          .map((f) => ({ status: f.status, range: f.unicodeRange.toLowerCase(), weight: f.weight }));
      });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const home = await faces();
    expect(home).toHaveLength(3);
    expect(home.every((f) => f.weight === '400 700')).toBe(true);
    expect(home.find((f) => f.range === 'u+20b5')?.status, 'cedi face').toBe('loaded');
    expect(home.find((f) => f.range.startsWith('u+0-ff'))?.status, 'latin face').toBe('loaded');
    // The glyphs of a price are drawn with DM Sans only (CDP reports the fonts actually used).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    for (const selector of ['.stats dt', '#slide-1 .slide-lede', '.quote-facts strong']) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      expect(await page.textContent(selector)).toContain('₵');
      expect(fonts.length).toBeGreaterThan(0);
      for (const f of fonts) {
        expect(f.isCustomFont, `${selector}: ${f.familyName}`).toBe(true);
        expect(f.familyName, selector).toMatch(/^DM Sans/);
      }
    }
    expect(await page.$eval('.stats dt', (el) => getComputedStyle(el).fontFamily)).toMatch(/^"?DM Sans/);
    // The latin-ext face is served and valid: it loads as soon as a latin-ext letter (here Ɛ, used in
    // Ghanaian languages) is asked for.
    const loaded = await page.evaluate(async () => (await document.fonts.load('16px "DM Sans"', 'Ɛ')).length);
    expect(loaded).toBe(1);
    expect((await faces()).find((f) => f.range.startsWith('u+100-2ba'))?.status, 'latin-ext face').toBe(
      'loaded',
    );
  });

  test('only the first hero image is eager and high priority; the rest are lazy', async ({ page }) => {
    await page.goto(base + '/');
    const imgs = await page.$$eval('main img', (els) =>
      els.map((e) => ({ loading: e.getAttribute('loading'), priority: e.getAttribute('fetchpriority') })),
    );
    expect(imgs[0]).toEqual({ loading: null, priority: 'high' });
    expect(imgs.slice(1).every((i) => i.loading === 'lazy' && i.priority === null)).toBe(true);
    expect(await page.locator('.is-placeholder').count(), 'placeholder photos left').toBe(0);
  });
});

test.describe('hero carousel', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('swipes with a touch gesture and updates the dots', async ({ page }) => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const box = await page.locator('[data-track]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    // A finger dragged right to left across the slide (real touch events, not a mouse).
    const y = Math.round(box.y + 240);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 320 - i * 22, y }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('[data-dot="1"]')).toHaveAttribute('aria-current', 'true');
    await expect
      .poll(() => page.$eval('[data-track]', (t) => t.scrollLeft), { message: 'snapped to slide 2' })
      .toBeCloseTo(box.width, 0);
  });

  test('dots, arrows and arrow keys move between slides; dots have 44px hit areas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const dot = page.locator('[data-dot="2"]');
    const b = await dot.boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    await dot.click();
    await expect(dot).toHaveAttribute('aria-current', 'true');
    await page.click('[data-next]');
    await expect(page.locator('[data-dot="0"]')).toHaveAttribute('aria-current', 'true');
    await page.focus('[data-dot="0"]');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-dot="1"]')).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-dot="0"]')).toHaveAttribute('aria-current', 'true');
    // Text sits on the solid panel, never on the photo.
    const panel = await page.locator('#slide-1 .slide-panel').boundingBox();
    const title = await page.locator('#slide-1 .slide-title').boundingBox();
    expect(title.y + title.height).toBeLessThanOrEqual(panel.y + panel.height);
  });

  test('is readable at 320px: the H1 and both actions fit above the photo', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 320, height: 568 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(base + '/');
    const size = await page.$eval('.slide-title', (el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(32);
    const actions = await page.locator('#slide-1 .slide-actions .btn').all();
    for (const a of actions) {
      const r = await a.boundingBox();
      expect(r.x).toBeGreaterThanOrEqual(15);
      expect(r.x + r.width).toBeLessThanOrEqual(305);
    }
    await ctx.close();
  });
});

test.describe('quick quote', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('falls back to the static tariff when /api is absent and continues to /account/buy', async ({
    page,
  }) => {
    await page.goto(base + '/');
    await expect(page.locator('#m-value')).toBeHidden();
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

test.describe('menus', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('phone menu: full-height sheet, accordions with 44px rows, both actions, Escape closes', async ({
    page,
  }) => {
    await page.goto(base + '/claims/');
    const btn = page.locator('.menu-btn');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const nav = page.locator('#site-nav');
    await expect(nav.getByRole('link', { name: 'Get a quote' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Sign in' })).toBeVisible();
    const box = await nav.boundingBox();
    expect(box.y).toBeLessThanOrEqual(0);
    expect(box.y + box.height).toBeGreaterThanOrEqual(843);
    // The current section starts open; another opens on tap.
    await expect(nav.locator('#menu-claims')).toBeVisible();
    await nav.getByRole('button', { name: 'Business' }).click();
    await expect(nav.getByRole('button', { name: 'Business' })).toHaveAttribute('aria-expanded', 'true');
    const row = await nav.locator('#menu-business a').first().boundingBox();
    expect(row.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toBeFocused();
    await expect(nav).toBeHidden();
  });

  test('Home: first item in the phone menu, goes to the home page; not an accordion', async ({ page }) => {
    await page.goto(base + '/claims/');
    await page.click('.menu-btn');
    const nav = page.locator('#site-nav');
    const home = nav.getByRole('link', { name: 'Home', exact: true });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute('href', '/');
    expect((await home.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const tops = await nav.locator('.nav-list > li > .nav-top').allTextContents();
    expect(tops.map((t) => t.trim())).toEqual(['Home', 'Personal', 'Business', 'Claims', 'About']);
    await home.click();
    await expect(page).toHaveURL(base + '/');
    // On the home page, opening the sheet marks Home current and opens no menu.
    await page.click('.menu-btn');
    await expect(home).toHaveAttribute('aria-current', 'page');
    await expect(home).not.toHaveAttribute('aria-expanded', /.*/);
    await expect(nav.locator('.nav-item.is-open')).toHaveCount(0);
  });

  test('Home: desktop link before Personal, same height, goes home, current only on the home page', async ({
    browser,
  }) => {
    for (const width of [1024, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(base + '/about/');
      const home = page.locator('.nav-list').getByRole('link', { name: 'Home', exact: true });
      const personal = page.getByRole('button', { name: 'Personal' });
      const [h, p] = [await home.boundingBox(), await personal.boundingBox()];
      expect(h.x + h.width).toBeLessThanOrEqual(p.x);
      expect(h.height).toBe(p.height);
      expect(Math.abs(h.y - p.y)).toBeLessThan(1);
      await expect(home).not.toHaveAttribute('aria-current', /.*/);
      // Header stays on one row: the actions do not wrap below the menu.
      const row = await page.locator('.header-row').boundingBox();
      expect(row.height).toBeLessThanOrEqual(96);
      await home.click();
      await expect(page).toHaveURL(base + '/');
      await expect(home).toHaveAttribute('aria-current', 'page');
      await ctx.close();
    }
  });

  test('phone menu scrolls in landscape (844×390) and the scrim closes it', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(base + '/');
    await page.click('.menu-btn');
    const nav = page.locator('#site-nav');
    for (const label of ['Personal', 'Business']) await nav.getByRole('button', { name: label }).click();
    const sizes = await nav.evaluate((n) => ({ scroll: n.scrollHeight, client: n.clientHeight }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    const last = nav.locator('.nav-contact a').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await page.mouse.click(830, 200);
    await expect(page.locator('.menu-btn')).toHaveAttribute('aria-expanded', 'false');
    await ctx.close();
  });

  test('desktop dropdowns open on click and by keyboard, close on Escape; focus is visible', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base + '/about/');
    const top = page.getByRole('button', { name: 'Personal' });
    await top.click();
    await expect(top).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#menu-personal').getByRole('link', { name: 'Motor insurance' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(top).toHaveAttribute('aria-expanded', 'false');
    await expect(top).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#menu-personal')).toBeVisible();
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return {
        style: s.outlineStyle,
        width: parseFloat(s.outlineWidth),
        text: document.activeElement.textContent,
      };
    });
    expect(outline.text).toContain('All personal insurance');
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await ctx.close();
  });
});

test.describe('other interactions', () => {
  test.use({ viewport: { width: 390, height: 844 } });

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
    const menu = page.locator('.menu-link');
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.locator('#footer-nav').getByRole('link', { name: 'Make a claim' })).toBeInViewport();
    expect(await overflowLifted(page)).toBeLessThanOrEqual(0);
    // The hero still swipes (native scroll) and the first slide shows.
    await expect(page.locator('#slide-1 .slide-title')).toBeVisible();
    await page.goto(base + '/branches/');
    await expect(page.locator('.branch:visible')).toHaveCount(13);
    await ctx.close();
  });
});
