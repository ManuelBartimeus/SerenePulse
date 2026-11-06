// Walks every screen against the mock API (or a real Worker with E2E_BASE_URL), screenshots it and
// checks the layout: no horizontal overflow, 16 px inputs, 44 px tap targets that don't overlap,
// no clipped text in buttons/badges/stepper, and the sticky action bar never hiding the last field.
// Screenshots: e2e/screenshots/<project>/<nn>-<name>.png and e2e/screenshots/viewports/.
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import {
  clearOfChrome,
  dialogProblems,
  expectCleanLayout,
  layoutProblems,
  overflowReport,
  renderedFonts,
} from './layout';

const here = dirname(fileURLToPath(import.meta.url));

/** A real 160×120 RGB PNG with a gradient, so thumbnails and compression have something to show. */
function makePng(w = 160, h = 120): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = (crcTable[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = 40 + (x * 150) / w;
      raw[i + 1] = 90 + (y * 100) / h;
      raw[i + 2] = 200;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = makePng();

const REAL = !!process.env.E2E_BASE_URL;
const isTouch = (info: TestInfo) => !!info.project.use.hasTouch;
const flowProject = (info: TestInfo) => info.project.name !== 'viewports';

let n = 0;
/** Layout checks (full, at this project's viewport) and a full-page screenshot. */
async function shot(page: Page, name: string, info: TestInfo) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .waitForFunction(() => !document.querySelector('[aria-busy="true"][aria-label^="Loading"]'), null, {
      timeout: 10_000,
    })
    .catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await expectCleanLayout(page, name, { touch: isTouch(info), full: true });
  const dir = join(here, 'screenshots', info.project.name);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true });
}

/** Native select on phones, searchable combobox on desktop. */
async function choose(page: Page, id: string, label: string) {
  const el = page.locator(`#${id}`);
  const tag = await el.evaluate((e) => e.tagName);
  if (tag === 'SELECT') await el.selectOption({ label });
  else {
    await el.click();
    await el.fill(label);
    await page.getByRole('option', { name: label, exact: true }).first().click();
  }
}

async function yesNo(page: Page, id: string, answer: 'Yes' | 'No') {
  await page.locator(`#f-${id}`).getByText(answer, { exact: true }).click();
}

async function attach(page: Page, fieldId: string, name = 'photo.png') {
  const input = page.locator(`#f-${fieldId}`).locator('xpath=..').locator('input[type=file]:not([capture])');
  await input.setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
  await expect(
    page
      .locator(`#f-${fieldId}`)
      .getByText(/Uploaded|Your face photo/)
      .first()
      .or(page.locator(`#f-${fieldId} img[alt="Your face photo"]`)),
  ).toBeVisible();
}

/** The main action: the sticky bar below 1024 px, the inline button from 1024 px. */
async function cont(page: Page) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024;
  if (mobile) await page.locator('.action-bar').getByRole('button').last().click();
  else
    await page
      .getByRole('button', { name: /^(Continue|Continue to sign|Sign and|Submit claim)/ })
      .last()
      .click();
}

async function signIn(page: Page, phone: string, stay = false) {
  if (!stay) await page.goto('/account/sign-in');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Test mode:')).toBeVisible();
}

/** Reads the code from the "Test mode" banner (simulated SMS) and types it. */
async function enterCode(page: Page) {
  const banner = await page.getByText('Test mode:').locator('xpath=..').innerText();
  const code = /(\d{6})/.exec(banner)?.[1] ?? '123456';
  await page.getByLabel('Digit 1 of 6').fill(code);
}

/** The six code boxes fit the screen side by side, without touching. */
async function expectOtpFits(page: Page) {
  const boxes = await page
    .getByLabel(/^Digit \d of 6$/)
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  expect(boxes).toHaveLength(6);
  const vw = page.viewportSize()?.width ?? 0;
  for (const [i, b] of boxes.entries()) {
    expect(b.left, `box ${i + 1} left`).toBeGreaterThanOrEqual(0);
    expect(b.right, `box ${i + 1} right`).toBeLessThanOrEqual(vw);
    expect(b.width, `box ${i + 1} width`).toBeGreaterThanOrEqual(36);
    expect(b.height, `box ${i + 1} height`).toBeGreaterThanOrEqual(44);
    const next = boxes[i + 1];
    if (next) expect(next.left - b.right, `gap after box ${i + 1}`).toBeGreaterThanOrEqual(4);
    expect(b.top).toBe(boxes[0]?.top);
  }
}

/** Draws a wave with the finger (CDP touch events → pointerType "touch") or the mouse. */
async function drawSignature(page: Page, touch: boolean) {
  const canvas = page.locator('[data-signature-canvas]');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('signature canvas not visible');
  const pts = Array.from({ length: 25 }, (_, i) => ({
    x: Math.round(box.x + 24 + (i * (box.width - 60)) / 24),
    y: Math.round(box.y + box.height * 0.55 - Math.sin(i / 2.5) * box.height * 0.22),
  }));
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const p0 = pts[0] as { x: number; y: number };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p0] });
    for (const p of pts.slice(1))
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    const p0 = pts[0] as { x: number; y: number };
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
    await page.mouse.up();
  }
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
}

/** The drawn ink: backing store matches the box at the device pixel ratio, ink inside the box. */
async function canvasState(page: Page) {
  return page.locator('[data-signature-canvas]').evaluate((c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    const ctx = c.getContext('2d');
    const data = ctx?.getImageData(0, 0, c.width, c.height).data ?? new Uint8ClampedArray();
    let ink = 0;
    let maxX = 0;
    let maxY = 0;
    for (let i = 3; i < data.length; i += 4)
      if ((data[i] ?? 0) > 0) {
        ink++;
        const px = ((i - 3) / 4) % c.width;
        const py = Math.floor((i - 3) / 4 / c.width);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
    return {
      cssW: r.width,
      cssH: r.height,
      w: c.width,
      h: c.height,
      dpr: window.devicePixelRatio,
      ink,
      inside: maxX < c.width - 1 && maxY < c.height - 1,
    };
  });
}

/** Every glyph of the element (including ₵) is drawn with DM Sans, not a fallback font. */
async function expectDmSans(page: Page, selector: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => (await renderedFonts(page, selector)).filter((f) => !/^DM Sans/.test(f)), {
      message: `fonts other than DM Sans in ${selector}`,
      timeout: 5000,
    })
    .toEqual([]);
  expect(await page.locator(selector).first().innerText()).toContain('₵');
}

/** A fresh number per run against a real database, so the customer is always new. */
const NEW_PHONE = REAL
  ? `024 ${String(Math.floor(1000000 + Math.random() * 8999999)).replace(/(\d{3})(\d{4})/, '$1 $2')}`
  : '024 000 1111';

test('new customer: sign in, buy motor, fill, sign, pay, certificate', async ({ page }, info) => {
  test.skip(!flowProject(info), 'runs in the flow projects');
  n = 0;
  const touch = isTouch(info);
  await page.goto('/account/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
  await shot(page, 'sign-in', info);
  await page.getByRole('button', { name: 'Send code' }).click();
  await shot(page, 'sign-in-error', info);

  await signIn(page, NEW_PHONE);
  await expectOtpFits(page);
  await shot(page, 'otp', info);
  await enterCode(page);
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await shot(page, 'about-you', info);
  await page.getByLabel('Full name').fill('Kwame Asante Boateng');
  await page.getByLabel(/Email address/).fill('kwame.boateng@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Hello, Kwame' })).toBeVisible();
  await shot(page, 'dashboard-empty', info);

  await page.goto('/account/buy');
  await expect(page.getByRole('heading', { name: 'What would you like to insure?' })).toBeVisible();
  await shot(page, 'buy', info);
  await page.getByRole('tab', { name: 'Businesses' }).click();
  await shot(page, 'buy-business', info);
  await page.getByRole('tab', { name: 'Individuals' }).click();
  await page
    .getByRole('button', { name: /Motor insurance/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await dialogProblems(page), 'buy sheet').toEqual([]);
  await shot(page, 'buy-motor-sheet', info);
  await page.getByRole('button', { name: 'Start proposal' }).click();

  // Step 1: Your details
  await expect(page.getByRole('heading', { name: 'Your details', level: 1 })).toBeVisible();
  await shot(page, 'wizard-1-details', info);
  await cont(page);
  await expect(page.locator('#error-summary')).toBeVisible();
  await page.waitForTimeout(400);
  // The error summary (or the first field in error, which takes focus) is never under the bar.
  const focused = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(await clearOfChrome(page, focused ? `#${focused}` : '#error-summary')).toBeNull();
  await page.locator('#error-summary').scrollIntoViewIfNeeded();
  expect(await clearOfChrome(page, '#error-summary')).toBeNull();
  await shot(page, 'wizard-1-errors', info);
  await page.locator('#f-date_of_birth').fill('1986-03-14');
  await page.locator('#f-postal_address').fill('P.O. Box AN 11021, Accra North');
  await choose(page, 'f-id_type', 'Ghana Card');
  await page.locator('#f-id_number').pressSequentially('7234567814');
  await expect(page.locator('#f-id_number')).toHaveValue('GHA-723456781-4');
  await page.locator('#f-occupation').fill('Civil engineer');
  await cont(page);

  // Step 2: Vehicle (single-row table renders as grouped fields)
  await expect(page.getByRole('heading', { name: 'Vehicle', level: 1 })).toBeVisible();
  await page.locator('#f-vehicles-0-reg_no').fill('gr 2224-ad');
  await choose(page, 'f-vehicles-0-make', 'Toyota');
  await page.locator('#f-vehicles-0-model').fill('Corolla');
  await choose(page, 'f-vehicles-0-body_type', 'Saloon');
  await page.locator('#f-vehicles-0-cubic_capacity').fill('1800');
  await page.locator('#f-vehicles-0-seating_capacity').fill('5');
  await page.locator('#f-vehicles-0-year_of_make').fill('2019');
  await page.locator('#f-vehicles-0-estimated_value').fill('85000');
  await choose(page, 'f-vehicles-0-colour', 'Silver');
  await page.locator('#f-chassis_no').fill('JTDBR32E520123456');
  await shot(page, 'wizard-2-vehicle', info);
  await cont(page);

  // Step 3: Use & ownership
  await expect(page.getByRole('heading', { name: 'Use & ownership', level: 1 })).toBeVisible();
  await page.getByText('Private and business', { exact: true }).click();
  await yesNo(page, 'is_owner', 'Yes');
  await yesNo(page, 'registered_in_name', 'No');
  await expect(page.locator('#f-registered_in_name__details')).toBeVisible();
  await page.locator('#f-registered_in_name__details').fill('Ama Boateng (wife), Dzorwulu, Accra');
  await yesNo(page, 'hire_purchase', 'No');
  await shot(page, 'wizard-3-use', info);
  await cont(page);

  // Step 4: Driver & history
  await expect(page.getByRole('heading', { name: 'Driver & history', level: 1 })).toBeVisible();
  await yesNo(page, 'physical_defect', 'No');
  await yesNo(page, 'previously_insured', 'Yes');
  await choose(page, 'f-previous_insurer', 'Enterprise Insurance');
  await page.locator('#f-years_insured').fill('3');
  await yesNo(page, 'ncd_entitled', 'No');
  await shot(page, 'wizard-4-history', info);
  await cont(page);

  // Step 5: Cover (live price)
  await expect(page.getByRole('heading', { name: 'Cover', level: 1 })).toBeVisible();
  await page.getByText('Comprehensive', { exact: true }).click();
  await yesNo(page, 'tppd_increase', 'No');
  const start = new Date().toISOString().slice(0, 10); // cover from today, so a claim can follow
  await page.locator('#f-cover_start').fill(start);
  await expect(page.locator('#f-cover_end')).not.toHaveValue('');
  await page.waitForTimeout(2200); // autosave + quote
  await shot(page, 'wizard-5-cover-price', info);
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await page
      .locator('.action-bar')
      .getByRole('button', { name: /Details/ })
      .click();
    expect(await dialogProblems(page), 'price sheet').toEqual([]);
    await shot(page, 'wizard-5-price-sheet', info);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: /All steps/ }).click();
    expect(await dialogProblems(page), 'steps sheet').toEqual([]);
    await shot(page, 'wizard-steps-sheet', info);
    await page.getByRole('button', { name: 'Close' }).click();
  }
  await cont(page);

  // Step 6: Documents (selfie + vehicle documents and photos)
  await expect(page.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible();
  await expect(page.getByText('We don’t take copies of the card.')).toBeVisible();
  await shot(page, 'wizard-6-documents-empty', info);
  await attach(page, 'id_selfie', 'face.png');
  await attach(page, 'registration_document', 'dvla.png');
  for (const f of [
    'photo_front',
    'photo_rear',
    'photo_left',
    'photo_right',
    'photo_dashboard',
    'photo_chassis',
  ])
    await attach(page, f, `${f}.png`);
  await shot(page, 'wizard-6-documents-done', info);
  await cont(page);

  // Review
  await expect(page.getByRole('heading', { name: 'Check your answers' })).toBeVisible();
  await shot(page, 'wizard-7-review', info);
  await cont(page);

  // Sign
  await expect(page.getByRole('heading', { name: 'Declaration and signature' })).toBeVisible();
  await shot(page, 'wizard-8-sign', info);
  await cont(page);
  await shot(page, 'wizard-8-sign-errors', info);
  for (const cb of await page.locator('input[id^="f-c-"]').all()) await cb.check();
  await drawSignature(page, touch);
  const before = await canvasState(page);
  expect(before.ink).toBeGreaterThan(50);
  expect(before.w).toBe(Math.round(before.cssW * before.dpr));
  const vp = page.viewportSize();
  if (touch && vp && vp.width < 768) {
    // Rotate to landscape and back: the canvas follows its box at full resolution, ink kept inside.
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await page.waitForTimeout(400);
    const land = await canvasState(page);
    expect(land.cssW).toBeGreaterThan(before.cssW);
    expect(land.w).toBe(Math.round(land.cssW * land.dpr));
    expect(land.h).toBe(Math.round(land.cssH * land.dpr));
    expect(land.ink).toBeGreaterThan(50);
    expect(land.inside).toBe(true);
    await expectCleanLayout(page, 'sign, landscape', { touch, full: false });
    await page.setViewportSize(vp);
    await page.waitForTimeout(400);
    const back = await canvasState(page);
    expect(back.w).toBe(Math.round(back.cssW * back.dpr));
    expect(back.ink).toBeGreaterThan(50);
    expect(back.inside).toBe(true);
  }
  await shot(page, 'wizard-8-sign-drawn', info);
  await page.getByRole('tab', { name: 'Type' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'wizard-8-sign-typed', info);
  await cont(page);

  // Pay
  await expect(page.getByRole('heading', { name: /^Pay GH₵/ })).toBeVisible();
  await expectDmSans(page, 'main h1');
  await shot(page, 'pay', info);
  await page.getByText('MTN MoMo', { exact: true }).click();
  await page.getByRole('button', { name: /^Pay GH₵/ }).click();
  await expect(page.getByRole('heading', { name: 'Approve the payment on your phone' })).toBeVisible();
  await shot(page, 'pay-momo-pending', info);
  await page.getByRole('button', { name: 'Approve on phone (test)' }).click();
  await expect(page.getByRole('heading', { name: 'Your policy is ready' })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, 'pay-success', info);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download certificate' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^Serene-certificate-.*\.pdf$/);

  await page.getByRole('button', { name: 'View policy' }).click();
  await expect(page.getByRole('button', { name: 'Download certificate' })).toBeVisible();
  await shot(page, 'policy', info);

  // Proposal page with its status history
  await page.getByRole('link', { name: 'Proposal and its history' }).click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await shot(page, 'proposal-history', info);
  await page.goBack();

  // Report a claim on the new policy (works against the mock and the real Worker)
  await page.getByRole('link', { name: 'Report a claim' }).first().click();
  await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
  await page.getByText('Damage to my vehicle').click();
  await cont(page);
  await page.locator('#c-incidentDate').fill(new Date().toISOString().slice(0, 10));
  await page.locator('#c-incidentLocation').fill('Liberation Road, near the Airport roundabout, Accra');
  await page
    .locator('#c-description')
    .fill(
      'A motorbike scraped the left side of the car in slow traffic. The rear door and wing are scratched.',
    );
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible();
  for (const k of ['claim_photos', 'repair_estimate', 'drivers_licence']) {
    const input = page.locator(`#c-doc-${k}`).locator('xpath=..').locator('input[type=file]:not([capture])');
    await input.setInputFiles({ name: `${k}.png`, mimeType: 'image/png', buffer: PNG });
    await expect(page.locator(`#c-doc-${k}`).getByText('Uploaded').first()).toBeVisible();
  }
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Check and submit' })).toBeVisible();
  await cont(page);
  await expect(page.getByText(/received\./)).toBeVisible();
  await shot(page, 'claim-submitted-new', info);
  await page.goto('/account/');
  await expect(page.getByRole('heading', { name: 'Your policies' })).toBeVisible();
  await shot(page, 'dashboard-after-purchase', info);
});

test('returning customer: dashboard, renew, claims, card payment, read block, table, profile', async ({
  page,
}, info) => {
  test.skip(REAL || !flowProject(info), 'needs the mock seed data');
  n = 40;
  await page.goto('/account/policies/x');
  await expect(page).toHaveURL(/sign-in\?redirect=/);
  await signIn(page, '024 123 4567', true);
  await enterCode(page);
  await expect(page).toHaveURL(/\/account\/policies\/x$/);
  await expect(page.getByRole('heading', { name: 'We can’t find that page' })).toBeVisible();
  await shot(page, 'not-found', info);

  await page.goto('/account/');
  await expect(page.getByRole('heading', { name: 'Hello, Ama' })).toBeVisible();
  await shot(page, 'dashboard', info);

  // Menu: drawer below 1024 px, account menu from 1024 px
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    expect(await dialogProblems(page), 'menu drawer').toEqual([]);
    expect(await layoutProblems(page, { touch: true }), 'menu drawer targets').toEqual([]);
    await shot(page, 'menu-drawer', info);
    await page.getByRole('button', { name: 'Close menu' }).click();
  } else {
    await page.getByRole('button', { name: /Ama’s account/ }).click();
    await expect(page.getByRole('link', { name: 'Your details' })).toBeVisible();
    await shot(page, 'account-menu', info);
    await page.keyboard.press('Escape');
  }

  // Policy page
  await page.getByRole('link', { name: 'Details' }).first().click();
  await expect(page.getByRole('heading', { name: 'Policy details' })).toBeVisible();
  await shot(page, 'policy-renewable', info);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /My proposal form/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^Serene-proposal-.*\.pdf$/);

  // Claim: existing one needing information
  await page.goto('/account/claims');
  await shot(page, 'claims', info);
  await page
    .getByRole('link', { name: /CLM-26-000041/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'We need more from you' })).toBeVisible();
  await shot(page, 'claim-detail-info', info);

  // New claim
  await page.goto('/account/claims');
  await page.getByRole('link', { name: /GR 2224-AD/ }).click();
  await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
  await shot(page, 'claim-1-type', info);
  await page.getByText('Someone else’s property was damaged').click();
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Tell us about it' })).toBeVisible();
  await cont(page);
  await shot(page, 'claim-2-details-errors', info);
  await page
    .locator('#c-incidentDate')
    .fill(new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10));
  await page.locator('#c-incidentLocation').fill('Kwame Nkrumah Circle, Accra');
  await page
    .locator('#c-description')
    .fill(
      'I was turning at the circle when I hit the back of a taxi that stopped suddenly. Its rear bumper is cracked.',
    );
  await page.locator('#c-tpName').fill('Kojo Mensah');
  await page.locator('#c-tpReg').fill('gt 4471-21');
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible();
  for (const k of ['claim_photos', 'police_report', 'drivers_licence']) {
    const input = page.locator(`#c-doc-${k}`).locator('xpath=..').locator('input[type=file]:not([capture])');
    await input.setInputFiles({ name: `${k}.png`, mimeType: 'image/png', buffer: PNG });
    await expect(page.locator(`#c-doc-${k}`).getByText('Uploaded').first()).toBeVisible();
  }
  await shot(page, 'claim-3-documents', info);
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Check and submit' })).toBeVisible();
  await shot(page, 'claim-4-review', info);
  await cont(page);
  await expect(page.getByText(/received\./)).toBeVisible();
  await shot(page, 'claim-submitted', info);

  // Renew from the dashboard banner
  await page.goto('/account/');
  await page.getByRole('button', { name: 'Renew' }).first().click();
  await expect(page.getByText('We’ve copied your details from last year.')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, 'renew-wizard-cover', info);

  // Quoted proposal: status page, then card payment with 3-D Secure
  await page.goto('/account/');
  await page.getByRole('link', { name: 'Pay now' }).first().click();
  await expect(page.getByRole('heading', { name: /^Pay GH₵/ })).toBeVisible();
  await page.getByRole('link', { name: /^Proposal PRP-/ }).click();
  await expect(page.getByRole('heading', { name: 'Your price' })).toBeVisible();
  await shot(page, 'proposal-quoted', info);
  await page.getByRole('link', { name: /^Pay GH₵/ }).click();
  await page.getByText('Card', { exact: true }).click();
  await page.locator('#pay-number').fill('4242424242424242');
  await page.locator('#pay-expiry').pressSequentially('1229');
  await page.locator('#pay-cvc').fill('123');
  await shot(page, 'pay-card', info);
  await page.getByRole('button', { name: /^Pay GH₵/ }).click();
  await expect(page.getByRole('heading', { name: 'Confirm it’s you' })).toBeVisible();
  await shot(page, 'pay-card-3ds', info);
  await page.getByRole('button', { name: 'Decline (test)' }).click();
  await expect(page.getByText('Payment not completed')).toBeVisible();
  await shot(page, 'pay-declined', info);

  // Underwriter proposal needing a response (info_requested)
  await page.goto('/account/');
  await page.getByRole('link', { name: 'Respond to underwriter' }).click();
  await expect(page.getByText('Message from the underwriter')).toBeVisible();
  await shot(page, 'info-requested-wizard', info);

  // Travel draft: the trip step has a notice that must be read, the next step a repeating table
  await page.goto('/account/');
  await page.locator('tr', { hasText: 'Travel insurance' }).getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Trip', level: 1 })).toBeVisible();
  await shot(page, 'wizard-read-block', info);
  // The seeded draft's first step still lacks the passport and citizenship.
  await page.goto(`${page.url().split('?')[0]}?step=0`);
  await expect(page.getByRole('heading', { name: 'Your details', level: 1 })).toBeVisible();
  await page.locator('#f-passport_no').fill('G1234567');
  await choose(page, 'f-citizenship', 'Ghana');
  for (const [id, v] of [
    ['address', 'House 12, Dzorwulu, Accra'],
    ['email', 'ama.mensah@example.com'],
    ['occupation', 'Pharmacist'],
  ] as const)
    if (!(await page.locator(`#f-${id}`).inputValue())) await page.locator(`#f-${id}`).fill(v);
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Trip', level: 1 })).toBeVisible();
  await page.locator('#f-final_destination').fill('Lisbon, Portugal');
  await choose(page, 'f-destination_zone', 'Schengen & Europe');
  const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  await page.locator('#f-cover_start').fill(day(7));
  await page.locator('#f-cover_end').fill(day(21));
  await page.locator('#f-no_medical_treatment_abroad').check();
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Travellers', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Add a traveller' }).click();
  await page.locator('#f-accompanying_travellers-0-name').fill('Kofi Mensah Junior the Second');
  await page.locator('#f-accompanying_travellers-0-date_of_birth').fill('2014-05-02');
  await page.getByRole('button', { name: 'Add a traveller' }).click();
  await page.locator('#f-accompanying_travellers-1-name').fill('Akosua Mensah');
  await shot(page, 'wizard-table', info);

  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await shot(page, 'profile', info);
  await page.locator('main').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/sign-in/);
});

// ---- Every screen at every width ----------------------------------------------------------------

const VIEWPORTS: { w: number; h: number; full?: boolean }[] = [
  { w: 320, h: 568, full: true },
  { w: 360, h: 740 },
  { w: 375, h: 667 },
  { w: 390, h: 844, full: true },
  { w: 393, h: 873 },
  { w: 412, h: 915 },
  { w: 430, h: 932 },
  { w: 768, h: 1024, full: true },
  { w: 820, h: 1180 },
  { w: 1024, h: 768 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900, full: true },
  { w: 844, h: 390 },
];
const touchVp = (w: number) => w <= 1024;

async function newCtx(browser: Browser, touch: boolean): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: test.info().project.use.baseURL,
    locale: 'en-GH',
    timezoneId: 'Africa/Accra',
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
    ...(touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
}

async function signedIn(browser: Browser, touch: boolean) {
  const ctx = await newCtx(browser, touch);
  const page = await ctx.newPage();
  await signIn(page, '024 123 4567');
  await enterCode(page);
  await expect(page.getByRole('heading', { name: 'Hello, Ama' })).toBeVisible();
  return { ctx, page };
}

/** Paths of the seeded screens, read from the dashboard. */
async function screens(page: Page): Promise<[string, string][]> {
  await page.goto('/account/');
  await expect(page.getByRole('heading', { name: 'Your policies' })).toBeVisible();
  const href = async (name: string | RegExp) =>
    (await page.getByRole('link', { name }).first().getAttribute('href')) ?? '';
  const travel = await href('Continue');
  const fire = await href('Respond to underwriter');
  const pay = await href('Pay now');
  const policy = await href('Details');
  const claim = await href(/Claim CLM-26-000041/);
  return [
    ['dashboard', '/account/'],
    ['buy', '/account/buy'],
    ['buy-sheet', '/account/buy?product=MTR'],
    ['wizard-details', `${travel}?step=0`],
    ['wizard-read', `${travel}?step=1`],
    ['wizard-info', fire],
    ['proposal-quoted', pay.replace(/\/pay$/, '')],
    ['pay', pay],
    ['policy', policy],
    ['new-claim', `${policy}/claim`],
    ['claims', '/account/claims'],
    ['claim-detail', claim],
    ['profile', '/account/profile'],
    ['not-found', '/account/nothing-here'],
  ];
}

test('every screen at every viewport', async ({ browser }, info) => {
  test.skip(REAL || info.project.name !== 'viewports', 'one pass (mock data)');
  // ~40 screens × 13 viewports: about 6 minutes on its own, longer when other suites share the CPU.
  test.setTimeout(15 * 60_000);
  const dir = join(here, 'screenshots', 'viewports');
  mkdirSync(dir, { recursive: true });
  const sessions = { touch: await signedIn(browser, true), desk: await signedIn(browser, false) };
  const lists = { touch: await screens(sessions.touch.page), desk: await screens(sessions.desk.page) };
  const anon = { touch: await newCtx(browser, true), desk: await newCtx(browser, false) };
  for (const vp of VIEWPORTS) {
    const touch = touchVp(vp.w);
    const { page } = touch ? sessions.touch : sessions.desk;
    const list = touch ? lists.touch : lists.desk;
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const label = `${vp.w}x${vp.h}`;
    for (const [name, path] of list) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.waitForTimeout(150);
      await expectCleanLayout(page, `${name} at ${label}`, { touch, full: !!vp.full });
      if (name === 'buy-sheet') {
        await expect(page.getByRole('dialog')).toBeVisible();
        expect(await dialogProblems(page), `buy sheet at ${label}`).toEqual([]);
      }
      if (name === 'dashboard' || name === 'wizard-read')
        await page.screenshot({ path: join(dir, `${label}-${name}.png`), fullPage: true });
    }
    // Signed out: sign-in and the code screen
    const a = await (touch ? anon.touch : anon.desk).newPage();
    await a.setViewportSize({ width: vp.w, height: vp.h });
    await a.goto('/account/sign-in');
    await expectCleanLayout(a, `sign-in at ${label}`, { touch, full: !!vp.full });
    await signIn(a, '024 555 0101', true);
    await expectOtpFits(a);
    await expectCleanLayout(a, `otp at ${label}`, { touch, full: !!vp.full });
    await a.close();
  }
  for (const c of [sessions.touch.ctx, sessions.desk.ctx, anon.touch, anon.desk]) await c.close();
});

test('keyboard, dialogs and sheets on small and landscape screens', async ({ browser }, info) => {
  test.skip(REAL || info.project.name !== 'viewports', 'one pass (mock data)');
  const { ctx, page } = await signedIn(browser, true);
  const list = Object.fromEntries(await screens(page));
  const dir = join(here, 'screenshots', 'viewports');

  // On-screen keyboard: a 390×500 viewport. Focusing a field (as a tap does, without the
  // browser's own scrolling) brings it into the clear area between header and action bar.
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto(list['wizard-details'] ?? '/account/');
  await expect(page.getByRole('heading', { name: 'Your details', level: 1 })).toBeVisible();
  const ids = await page
    .locator('main input.input:not([type=date]), main textarea.input')
    .evaluateAll((els) => els.map((e) => e.id).filter(Boolean));
  expect(ids.length).toBeGreaterThan(3);
  for (const id of [ids[ids.length - 1], ids[0], ids[Math.floor(ids.length / 2)]]) {
    // Park the field out of view: under the action bar for the last one, under the header for the first.
    await page.evaluate((i) => {
      const el = document.getElementById(i as string) as HTMLElement;
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top - window.innerHeight + 20);
      if (el.getBoundingClientRect().top < 100) window.scrollBy(0, r.top + 400);
      (document.activeElement as HTMLElement | null)?.blur();
      el.focus({ preventScroll: true });
    }, id);
    await page.waitForTimeout(600);
    expect(await clearOfChrome(page, `#${id}`), `focused #${id} at 390x500`).toBeNull();
  }
  await page.screenshot({ path: join(dir, '390x500-keyboard.png') });

  // Dialogs at 320×568 and in landscape: they fit, and their content scrolls to the last item.
  for (const vp of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    const label = `${vp.width}x${vp.height}`;
    await page.setViewportSize(vp);
    await page.goto(list['buy-sheet'] ?? '/account/buy');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await dialogProblems(page), `buy sheet at ${label}`).toEqual([]);
    await page.screenshot({ path: join(dir, `${label}-buy-sheet.png`) });

    await page.goto(list['wizard-read'] ?? '/account/');
    await page.getByRole('button', { name: /All steps/ }).click();
    await expect(page.getByRole('dialog', { name: 'Steps' })).toBeVisible();
    expect(await dialogProblems(page), `steps sheet at ${label}`).toEqual([]);
    const last = page.getByRole('dialog', { name: 'Steps' }).getByRole('button', { name: /Pay/ });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await page.screenshot({ path: join(dir, `${label}-steps-sheet.png`) });
    await page.getByRole('button', { name: 'Close' }).click();

    await page
      .locator('.action-bar')
      .getByRole('button', { name: /Details/ })
      .click();
    expect(await dialogProblems(page), `price sheet at ${label}`).toEqual([]);
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Menu' }).click();
    expect(await dialogProblems(page), `menu at ${label}`).toEqual([]);
    await page.screenshot({ path: join(dir, `${label}-menu.png`) });
    await page.getByRole('button', { name: 'Close menu' }).click();
  }

  // The cedi sign comes from DM Sans (latin-ext subset), not a fallback font.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(list.pay ?? '/account/');
  await expect(page.getByRole('heading', { name: /^Pay GH₵/ })).toBeVisible();
  await expectDmSans(page, 'main h1');
  const o = await overflowReport(page);
  expect(o.culprits).toEqual([]);
  await ctx.close();
});
