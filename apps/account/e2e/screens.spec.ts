// Walks every screen against the mock API, screenshots it and checks there is no horizontal
// scroll. Screenshots: e2e/screenshots/<project>/<nn>-<name>.png
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

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

/** Real overflow: lifts the CSS safety net (overflow-x: clip) and lists what sticks out. */
async function overflowReport(page: Page): Promise<{ sw: number; iw: number; culprits: string[] }> {
  return page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body{overflow-x:visible!important}';
    document.head.append(st);
    const iw = document.documentElement.clientWidth;
    const sw = (document.scrollingElement ?? document.documentElement).scrollWidth;
    const culprits: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= iw + 0.5) continue;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if (o !== 'visible' && a.getBoundingClientRect().right <= iw + 0.5) clipped = true;
      }
      if (!clipped && getComputedStyle(el).position !== 'fixed')
        culprits.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)}`,
        );
    }
    st.remove();
    return { sw, iw, culprits: culprits.slice(0, 6) };
  });
}

let n = 0;
async function shot(page: Page, name: string, project: string) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  const overflow = await overflowReport(page);
  expect(overflow.culprits, `horizontal overflow on ${name}`).toEqual([]);

  const dir = join(here, 'screenshots', project);
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

async function cont(page: Page) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 1200;
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

const REAL = !!process.env.E2E_BASE_URL;
/** A fresh number per run against a real database, so the customer is always new. */
const NEW_PHONE = REAL
  ? `024 ${String(Math.floor(1000000 + Math.random() * 8999999)).replace(/(\d{3})(\d{4})/, '$1 $2')}`
  : '024 000 1111';

test('new customer: sign in, buy motor, fill, sign, pay, certificate', async ({ page }, info) => {
  n = 0;
  const p = info.project.name;
  await page.goto('/account/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
  await shot(page, 'sign-in', p);
  await page.getByRole('button', { name: 'Send code' }).click();
  await shot(page, 'sign-in-error', p);

  await signIn(page, NEW_PHONE);
  await shot(page, 'otp', p);
  await enterCode(page);
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await shot(page, 'about-you', p);
  await page.getByLabel('Full name').fill('Kwame Asante Boateng');
  await page.getByLabel(/Email address/).fill('kwame.boateng@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Hello, Kwame' })).toBeVisible();
  await shot(page, 'dashboard-empty', p);

  await page.goto('/account/buy');
  await expect(page.getByRole('heading', { name: 'What would you like to insure?' })).toBeVisible();
  await shot(page, 'buy', p);
  await page.getByRole('tab', { name: 'Businesses' }).click();
  await shot(page, 'buy-business', p);
  await page.getByRole('tab', { name: 'Individuals' }).click();
  await page
    .getByRole('button', { name: /Motor insurance/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, 'buy-motor-sheet', p);
  await page.getByRole('button', { name: 'Start proposal' }).click();

  // Step 1: Your details
  await expect(page.getByRole('heading', { name: 'Your details', level: 1 })).toBeVisible();
  await shot(page, 'wizard-1-details', p);
  await cont(page);
  await expect(page.locator('#error-summary')).toBeVisible();
  await shot(page, 'wizard-1-errors', p);
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
  await shot(page, 'wizard-2-vehicle', p);
  await cont(page);

  // Step 3: Use & ownership
  await expect(page.getByRole('heading', { name: 'Use & ownership', level: 1 })).toBeVisible();
  await page.getByText('Private and business', { exact: true }).click();
  await yesNo(page, 'is_owner', 'Yes');
  await yesNo(page, 'registered_in_name', 'No');
  await expect(page.locator('#f-registered_in_name__details')).toBeVisible();
  await page.locator('#f-registered_in_name__details').fill('Ama Boateng (wife), Dzorwulu, Accra');
  await yesNo(page, 'hire_purchase', 'No');
  await shot(page, 'wizard-3-use', p);
  await cont(page);

  // Step 4: Driver & history
  await expect(page.getByRole('heading', { name: 'Driver & history', level: 1 })).toBeVisible();
  await yesNo(page, 'physical_defect', 'No');
  await yesNo(page, 'previously_insured', 'Yes');
  await choose(page, 'f-previous_insurer', 'Enterprise Insurance');
  await page.locator('#f-years_insured').fill('3');
  await yesNo(page, 'ncd_entitled', 'No');
  await shot(page, 'wizard-4-history', p);
  await cont(page);

  // Step 5: Cover (live price)
  await expect(page.getByRole('heading', { name: 'Cover', level: 1 })).toBeVisible();
  await page.getByText('Comprehensive', { exact: true }).click();
  await yesNo(page, 'tppd_increase', 'No');
  const start = new Date().toISOString().slice(0, 10); // cover from today, so a claim can follow
  await page.locator('#f-cover_start').fill(start);
  await expect(page.locator('#f-cover_end')).not.toHaveValue('');
  await page.waitForTimeout(2200); // autosave + quote
  await shot(page, 'wizard-5-cover-price', p);
  if (p === 'mobile') {
    await page.getByRole('button', { name: /Details/ }).click();
    await shot(page, 'wizard-5-price-sheet', p);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: /All steps/ }).click();
    await shot(page, 'wizard-steps-sheet', p);
    await page.getByRole('button', { name: 'Close' }).click();
  }
  await cont(page);

  // Step 6: Documents (selfie + vehicle documents and photos)
  await expect(page.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible();
  await expect(page.getByText('We don’t take copies of the card.')).toBeVisible();
  await shot(page, 'wizard-6-documents-empty', p);
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
  await shot(page, 'wizard-6-documents-done', p);
  await cont(page);

  // Review
  await expect(page.getByRole('heading', { name: 'Check your answers' })).toBeVisible();
  await shot(page, 'wizard-7-review', p);
  await cont(page);

  // Sign
  await expect(page.getByRole('heading', { name: 'Declaration and signature' })).toBeVisible();
  await shot(page, 'wizard-8-sign', p);
  await cont(page);
  await shot(page, 'wizard-8-sign-errors', p);
  for (const cb of await page.locator('input[id^="f-c-"]').all()) await cb.check();
  const canvas = page.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('signature canvas not visible');
  await page.mouse.move(box.x + 30, box.y + 120);
  await page.mouse.down();
  for (let i = 0; i <= 24; i++)
    await page.mouse.move(box.x + 30 + i * 9, box.y + 120 - Math.sin(i / 2.5) * 40);
  await page.mouse.up();
  await page.getByRole('tab', { name: 'Type' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'wizard-8-sign-typed', p);
  await cont(page);

  // Pay
  await expect(page.getByRole('heading', { name: /^Pay GH₵/ })).toBeVisible();
  await shot(page, 'pay', p);
  await page.getByText('MTN MoMo', { exact: true }).click();
  await page.getByRole('button', { name: /^Pay GH₵/ }).click();
  await expect(page.getByRole('heading', { name: 'Approve the payment on your phone' })).toBeVisible();
  await shot(page, 'pay-momo-pending', p);
  await page.getByRole('button', { name: 'Approve on phone (test)' }).click();
  await expect(page.getByRole('heading', { name: 'Your policy is ready' })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, 'pay-success', p);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download certificate' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^Serene-certificate-.*\.pdf$/);

  await page.getByRole('button', { name: 'View policy' }).click();
  await expect(page.getByRole('button', { name: 'Download certificate' })).toBeVisible();
  await shot(page, 'policy', p);

  // Proposal page with its status history
  await page.getByRole('link', { name: 'Proposal and its history' }).click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await shot(page, 'proposal-history', p);
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
  await shot(page, 'claim-submitted-new', p);
  await page.goto('/account/');
  await expect(page.getByRole('heading', { name: 'Your policies' })).toBeVisible();
  await shot(page, 'dashboard-after-purchase', p);
});

test('returning customer: dashboard, renew, claims, card payment, profile', async ({ page }, info) => {
  test.skip(REAL, 'needs the mock seed data');
  n = 40;
  const p = info.project.name;
  await page.goto('/account/policies/x');
  await expect(page).toHaveURL(/sign-in\?redirect=/);
  await signIn(page, '024 123 4567', true);
  await enterCode(page);
  await expect(page).toHaveURL(/\/account\/policies\/x$/);
  await expect(page.getByRole('heading', { name: 'We can’t find that page' })).toBeVisible();
  await shot(page, 'not-found', p);

  await page.goto('/account/');
  await expect(page.getByRole('heading', { name: 'Hello, Ama' })).toBeVisible();
  await shot(page, 'dashboard', p);

  // Policy page
  await page.getByRole('link', { name: 'Details' }).first().click();
  await expect(page.getByRole('heading', { name: 'Policy details' })).toBeVisible();
  await shot(page, 'policy-renewable', p);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /My proposal form/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^Serene-proposal-.*\.pdf$/);

  // Claim: existing one needing information
  await page.goto('/account/claims');
  await shot(page, 'claims', p);
  await page.getByRole('link', { name: /CLM-26-000041/ }).click();
  await expect(page.getByRole('heading', { name: 'We need more from you' })).toBeVisible();
  await shot(page, 'claim-detail-info', p);

  // New claim
  await page.goto('/account/claims');
  await page.getByRole('link', { name: /GR 2224-AD/ }).click();
  await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
  await shot(page, 'claim-1-type', p);
  await page.getByText('Someone else’s property was damaged').click();
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Tell us about it' })).toBeVisible();
  await cont(page);
  await shot(page, 'claim-2-details-errors', p);
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
  await shot(page, 'claim-3-documents', p);
  await cont(page);
  await expect(page.getByRole('heading', { name: 'Check and submit' })).toBeVisible();
  await shot(page, 'claim-4-review', p);
  await cont(page);
  await expect(page.getByText(/received\./)).toBeVisible();
  await shot(page, 'claim-submitted', p);

  // Renew from the dashboard banner
  await page.goto('/account/');
  await page.getByRole('button', { name: 'Renew' }).first().click();
  await expect(page.getByText('We’ve copied your details from last year.')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, 'renew-wizard-cover', p);

  // Quoted proposal → card payment with 3-D Secure
  await page.goto('/account/');
  await page.getByRole('link', { name: 'Pay now' }).first().click();
  await page.getByText('Card', { exact: true }).click();
  await page.locator('#pay-number').fill('4242424242424242');
  await page.locator('#pay-expiry').pressSequentially('1229');
  await page.locator('#pay-cvc').fill('123');
  await shot(page, 'pay-card', p);
  await page.getByRole('button', { name: /^Pay GH₵/ }).click();
  await expect(page.getByRole('heading', { name: 'Confirm it’s you' })).toBeVisible();
  await shot(page, 'pay-card-3ds', p);
  await page.getByRole('button', { name: 'Decline (test)' }).click();
  await expect(page.getByText('Payment not completed')).toBeVisible();
  await shot(page, 'pay-declined', p);

  // Underwriter proposal needing a response (info_requested) and a draft with a read panel
  await page.goto('/account/');
  await page.getByRole('link', { name: 'Respond to underwriter' }).click();
  await expect(page.getByText('Message from the underwriter')).toBeVisible();
  await shot(page, 'info-requested-wizard', p);
  await page.goto('/account/');
  await page.getByRole('link', { name: 'Continue' }).first().click();
  await expect(page.locator('main h1')).toBeVisible();
  await shot(page, 'travel-draft', p);

  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await shot(page, 'profile', p);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/sign-in/);
});

test('no horizontal scroll at every breakpoint', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' || REAL, 'one pass is enough (mock data)');
  await signIn(page, '024 123 4567');
  await enterCode(page);
  await expect(page.getByRole('heading', { name: 'Hello, Ama' })).toBeVisible();
  const routes = ['/account/', '/account/buy', '/account/claims', '/account/profile'];
  const proposalLinks = await page
    .getByRole('link', { name: /Continue|Pay now|Respond to underwriter|View/ })
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).pathname));
  routes.push(...proposalLinks);
  for (const width of [320, 360, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const r of routes) {
      await page.goto(r);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(150);
      const o = await overflowReport(page);
      expect(o.culprits, `${r} at ${width}px`).toEqual([]);
      // Inputs never below 16 px (iOS zoom) and buttons at least 44 px tall.
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(
          'input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea',
        )) {
          if (el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16)
            out.push(`font ${el.id || el.tagName}`);
        }
        for (const el of document.querySelectorAll<HTMLElement>('button, a.btn')) {
          const rect = el.getBoundingClientRect();
          if (el.offsetParent && rect.height > 0 && rect.height < 43.5 && !el.closest('.sr-only'))
            out.push(`target ${el.textContent?.trim().slice(0, 30)} ${Math.round(rect.height)}px`);
        }
        return out;
      });
      expect(bad, `${r} at ${width}px`).toEqual([]);
    }
    const dir = join(here, 'screenshots', 'widths');
    mkdirSync(dir, { recursive: true });
    await page.goto('/account/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: join(dir, `dashboard-${width}.png`), fullPage: true });
  }
});
