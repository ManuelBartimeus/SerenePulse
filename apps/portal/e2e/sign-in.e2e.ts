// Regression (2026-11-09): staff had to press "Sign in" twice. The session reached React only after
// navigation, so the signed-in area saw "signed out" and bounced back to the sign-in page.
import { expect, test, type Page } from '@playwright/test';

const EMAIL = process.env.PORTAL_E2E_EMAIL ?? '';
const PASSWORD = process.env.PORTAL_E2E_PASSWORD ?? '';

test.skip(!EMAIL || !PASSWORD, 'set PORTAL_E2E_EMAIL and PORTAL_E2E_PASSWORD for a local admin');

/** Counts calls to the sign-in Edge Function. */
function countSignIns(page: Page) {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/functions/v1/auth-sign-in') && r.method() === 'POST') calls.push(r.url());
  });
  return calls;
}

async function fillAndSubmitOnce(page: Page, password = PASSWORD) {
  await page.getByLabel('Email').fill(EMAIL);
  // The password field's label also names the "Show password" button, so target the input itself.
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test('one click on "Sign in" opens the portal', async ({ page }) => {
  const calls = countSignIns(page);
  await page.goto('/admin/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to the staff portal' })).toBeVisible();
  await fillAndSubmitOnce(page);
  await expect(page).not.toHaveURL(/\/sign-in/);
  // The signed-in shell is showing (on phones the sidebar sits in the menu drawer, so use the heading).
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Stays signed in: no bounce back to the sign-in page a moment later.
  await page.waitForTimeout(1500);
  await expect(page).not.toHaveURL(/\/sign-in/);
  expect(calls).toHaveLength(1);
});

test('a deep link comes back to the page asked for after one click', async ({ page }) => {
  await page.goto('/admin/customers');
  await expect(page).toHaveURL(/\/admin\/sign-in\?next=%2Fcustomers|\/admin\/sign-in\?next=\/customers/);
  await fillAndSubmitOnce(page);
  await expect(page).toHaveURL(/\/admin\/customers$/);
});

test('a wrong password stays on sign in with an error, and the button works again', async ({ page }) => {
  await page.goto('/admin/sign-in');
  await fillAndSubmitOnce(page, `${PASSWORD}-wrong`);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

test('every sidebar icon is drawn inside the same frame (no oversized gear)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the sidebar is visible on desktop');
  await page.goto('/admin/sign-in');
  await fillAndSubmitOnce(page);
  await expect(page).not.toHaveURL(/\/sign-in/);
  const nav = page.getByRole('navigation', { name: 'Main' }).first();
  await expect(nav).toBeVisible();
  const boxes = await nav.locator('svg').evaluateAll((svgs) =>
    svgs.map((svg) => {
      const b = (svg as SVGSVGElement).getBBox();
      const label = svg.closest('a,button')?.textContent?.trim() ?? '';
      return { label, x: b.x, y: b.y, w: b.width, h: b.height };
    }),
  );
  const icons = boxes.filter((b) => b.w > 8); // skip chevrons and icons in collapsed sections
  expect(icons.map((b) => b.label)).toEqual(expect.arrayContaining(['Administration']));
  for (const b of icons) {
    expect(b.x, b.label).toBeGreaterThanOrEqual(2.5);
    expect(b.y, b.label).toBeGreaterThanOrEqual(2.5);
    expect(b.x + b.w, b.label).toBeLessThanOrEqual(21.5);
    expect(b.y + b.h, b.label).toBeLessThanOrEqual(21.5);
  }
});

test('the sign-in panel uses the general wording', async ({ page }) => {
  await page.goto('/admin/sign-in');
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('Customers, proposals, policies and feedback in one place.');
});
