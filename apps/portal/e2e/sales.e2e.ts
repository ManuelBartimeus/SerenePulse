// Sales pages of the staff portal, through the site Worker so the production CSP applies
// (PORTAL_E2E_BASE_URL, see playwright.config.ts). Needs a signed-in staff member who can see
// customers, proposals and policies (PORTAL_E2E_EMAIL / PORTAL_E2E_PASSWORD) and at least one issued
// proposal with attached photos in the local database (the customer app's purchase test makes one).
//
// Regressions covered (2026-11-09, user report):
//   1. face photos, ID documents, proposal/claim documents and signatures did not show anywhere in
//      the portal: the CSP blocked images from the Supabase Storage origin;
//   2. the Proposals page opened on "Awaiting review" instead of "All";
//   3. the proposal PDF download, checked end to end;
//   4. the identity check, vehicle documents and vehicle photos were printed in the form;
//   5. "Download all documents" (zip of every attachment);
//   6. images on the proposal's Documents tab did not show.
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';

const EMAIL = process.env.PORTAL_E2E_EMAIL ?? '';
const PASSWORD = process.env.PORTAL_E2E_PASSWORD ?? '';

test.skip(!EMAIL || !PASSWORD, 'set PORTAL_E2E_EMAIL and PORTAL_E2E_PASSWORD for a local staff member');
test.skip(!process.env.PORTAL_E2E_BASE_URL, 'set PORTAL_E2E_BASE_URL to the site Worker (CSP applies)');

/** Collects Content-Security-Policy violations reported by the browser. */
function cspViolations(page: Page): string[] {
  const out: string[] = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|violates the following/i.test(t)) out.push(t.slice(0, 240));
  });
  return out;
}

/** A visible record in a list: a table row on desktop, a card (list item) on phones. */
const record = (page: Page, text?: string) => {
  const any = page.locator('main').locator('tbody tr:visible, ul[aria-label] > li:visible');
  return text ? any.filter({ hasText: text }) : any;
};

async function signIn(page: Page) {
  await page.goto('/admin/sign-in');
  await page.getByLabel('Email').fill(EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/** Every <img> inside `scope` has finished loading real pixels. */
async function expectImagesLoaded(page: Page, selector: string, min: number) {
  const imgs = page.locator(selector);
  await expect.poll(() => imgs.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(min);
  await expect
    .poll(
      () =>
        imgs.evaluateAll((els) =>
          els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** Opens the most recent issued proposal (it has documents and a signature). */
async function openIssuedProposal(page: Page) {
  await page.goto('/admin/proposals?tab=issued');
  const row = record(page, 'Policy issued').first();
  await expect(row).toBeVisible();
  await row.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/admin\/proposals\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^PRP-/);
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test('the Proposals page opens on "All"', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/proposals');
  const nav = page.getByRole('navigation', { name: 'Proposal status' });
  await expect(nav.getByRole('link', { name: 'All', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link').first()).toHaveText('All');
  // Not only the review queue: issued proposals are listed too.
  await expect(record(page, 'Policy issued').first()).toBeVisible();
});

test('customer page shows the face photo and ID documents', async ({ page }) => {
  const csp = cspViolations(page);
  await signIn(page);
  await openIssuedProposal(page);
  await page.getByRole('region', { name: 'Summary' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/admin\/customers\/[0-9a-f-]{36}/);
  await expectImagesLoaded(page, 'main img[alt^="Face photo of"]', 1);
  await expectImagesLoaded(page, 'main img', 1);
  expect(csp).toEqual([]);
});

test('proposal: form without uploads, signature and document images load, PDF and zip download', async ({
  page,
}) => {
  const csp = cspViolations(page);
  await signIn(page);
  await openIssuedProposal(page);

  // Form tab: no identity check, vehicle documents or vehicle photos; the signature image loads.
  const form = page.locator('article');
  await expect(form).toBeVisible();
  for (const gone of ['Identity check', 'Vehicle documents', 'Photos of the vehicle', 'A photo of your face'])
    await expect(form.getByText(gone, { exact: false })).toHaveCount(0);
  await expectImagesLoaded(page, 'article img[alt^="Signature of"]', 1);

  // PDF download: a complete PDF file, plus the "save" link for browsers that block the automatic one.
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toMatch(/^PRP-\d{2}-\d{6} proposal form\.pdf$/);
  const pdfBytes = await readFile(await pdf.path());
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdfBytes.subarray(-6).toString()).toContain('%%EOF');
  await expect(page.getByRole('link', { name: /save “PRP-.* proposal form\.pdf”/ })).toBeVisible();

  // Documents tab: every thumbnail loads.
  const tab = page.getByRole('tab', { name: /^Documents/ });
  const count = Number((await tab.innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
  expect(count).toBeGreaterThan(0);
  await tab.click();
  const panel = page.getByRole('tabpanel');
  await expectImagesLoaded(page, '[role="tabpanel"] img', 1);

  // Each file's own download link asks Storage for an attachment (not a page navigation).
  const firstDownload = panel.getByRole('link', { name: /^Download / }).first();
  await expect(firstDownload).toHaveAttribute('href', /[?&]download=/);

  // Download all documents: one zip with every attachment plus a contents list.
  const zipDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: `Download all documents (${count})` }).click();
  const zip = await zipDownload;
  expect(zip.suggestedFilename()).toMatch(/^PRP-\d{2}-\d{6} documents\.zip$/);
  const entries = unzipSync(new Uint8Array(await readFile(await zip.path())));
  const names = Object.keys(entries);
  expect(names).toContain('Contents.txt');
  expect(names.filter((n) => n !== 'Contents.txt')).toHaveLength(count);
  for (const n of names) expect(entries[n]?.length ?? 0, n).toBeGreaterThan(0);
  expect(new TextDecoder().decode(entries['Contents.txt'])).not.toContain('DOES NOT MATCH');

  // The lightbox shows the full-size image.
  await panel
    .getByRole('button', { name: /^View / })
    .first()
    .click();
  await expectImagesLoaded(page, '[role="dialog"] img', 1);
  await page.keyboard.press('Escape');

  expect(csp).toEqual([]);
});

test('policy page previews the certificate without CSP errors', async ({ page }) => {
  const csp = cspViolations(page);
  await signIn(page);
  await page.goto('/admin/policies');
  await record(page).first().getByRole('link').first().click();
  await expect(page.locator('object[type="application/pdf"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  expect(csp).toEqual([]);
});
