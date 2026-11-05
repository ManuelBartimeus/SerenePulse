import { expect, test } from '@playwright/test';
import {
  draft,
  expectNoSeriousA11yIssues,
  expectStep,
  nextDraft,
  page1,
  rate,
  responseCount,
  sessionId,
  sql,
  submitAndConfirm,
  toPage5,
} from './helpers';

const START = '/customerfeedback?src=sms';

test.describe('REQ §17.2 rating round trip', () => {
  test('T-M06-e2e-001…006: save, advance, progress, back, restore, change without duplicate', async ({
    page,
  }) => {
    await page.goto(START);
    const id = await sessionId(page);
    await page1(page);

    // e2e-001 save the Page 2 rating to the current session; e2e-002 go straight to Page 3
    const saved = nextDraft(page);
    await rate(page, '4, Satisfied', 3);
    expect((await saved).status()).toBe(204);
    await expect.poll(() => draft(id, 'csat')).toBe('4');
    // e2e-003 progress state
    await expectStep(page, 3);

    // e2e-004 navigate back; e2e-005 previous rating restored without reselecting
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectStep(page, 2);
    await expect(page.getByRole('radio', { name: '4, Satisfied', exact: true })).toBeChecked();

    // e2e-006 change the rating and continue; the draft is updated in place
    await rate(page, '2, Dissatisfied', 3);
    await expect.poll(() => draft(id, 'csat')).toBe('2');
    await rate(page, '3, Neither easy nor difficult', 4);
    await rate(page, '6', 5);
    await submitAndConfirm(page);
    expect(responseCount(id)).toBe(1);
    expect(sql(`select csat_score from survey.responses where session_id = '${id}'`)).toBe('2');
    expect(sql(`select changed_previous_answer::text from survey.responses where session_id = '${id}'`)).toBe(
      'true',
    );
  });
});

test.describe('Page 1 (FR-03, FR-04)', () => {
  test('T-M06-102 Continue stays disabled until valid and points at the first missing field', async ({
    page,
  }) => {
    await page.goto(START);
    const cont = page.getByRole('button', { name: 'Continue' });
    await expect(cont).toHaveAttribute('aria-disabled', 'true');
    await cont.click({ force: true }); // a tap while disabled points at the first missing field
    await expect(page.locator('#e-channel')).toHaveText('Please choose how you got your policy.');
    await expect(page.locator('#q-channel input:focus')).toHaveCount(1);
    await expectStep(page, 1);
    await page.getByRole('radio', { name: 'Mobile application', exact: true }).click();
    await expect(page.locator('#e-channel')).toHaveText('');
    await expect(cont).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('radio', { name: 'Motor insurance', exact: true }).click();
    await expect(cont).toHaveAttribute('aria-disabled', 'false');
  });

  test('T-M06-101/103 branch shown for walk-in only, cleared when hidden, not restored', async ({ page }) => {
    await page.goto(START);
    const id = await sessionId(page);
    const branch = page.getByLabel('Which branch issued your policy?');
    await expect(branch).toBeHidden();
    await page.getByRole('radio', { name: 'Walk-in at a branch office', exact: true }).click();
    await expect(branch).toBeVisible();
    await expect(page.locator('#sv-live')).toHaveText('Branch question added');
    await expect(page.locator('#q-branch [data-optional]')).toBeHidden();
    await page.getByRole('radio', { name: 'Motor insurance', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveAttribute('aria-disabled', 'true');
    await branch.selectOption({ label: 'Kasoa' });
    await expect.poll(() => draft(id, 'branch')).toBe('KASOA');
    await page.getByRole('radio', { name: 'Company website', exact: true }).click();
    await expect(branch).toBeHidden();
    await expect.poll(() => draft(id, 'branch')).toBe('');
    await page.getByRole('radio', { name: 'Walk-in at a branch office', exact: true }).click();
    await expect(branch).toHaveValue('');
    await page.getByRole('radio', { name: 'Other', exact: true }).first().click();
    await expect(page.locator('#q-branch [data-optional]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveAttribute('aria-disabled', 'false');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expectStep(page, 2);
    await expect.poll(() => draft(id, 'channel')).toBe('OTHER');
    await expect.poll(() => draft(id, 'product')).toBe('MOTOR');
  });
});

test.describe('navigation (FR-05, FR-06, FR-07, FR-12)', () => {
  test('T-M06-104/105/106/109 tap-to-advance, Back on 2–5, answers and comment survive a round trip', async ({
    page,
  }) => {
    await page.goto(START);
    await expect(page.locator('section[data-page="1"] [data-back]')).toHaveCount(0);
    await toPage5(page);
    for (const n of [2, 3, 4, 5])
      await expect(page.locator(`section[data-page="${n}"] [data-back]`)).toHaveCount(1);
    const comment = page.getByLabel("Anything else you'd like to tell us? (optional)");
    await comment.fill('Quick and friendly service.');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectStep(page, 4);
    await expect(page.getByRole('radio', { name: '9', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectStep(page, 3);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectStep(page, 2);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectStep(page, 1);
    await expect(page.getByRole('radio', { name: 'Mobile application', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Continue' }).click();
    await rate(page, '4, Satisfied', 3);
    await rate(page, '5, Very easy', 4);
    await rate(page, '9', 5);
    await expect(comment).toHaveValue('Quick and friendly service.');
  });

  test('T-M06-020 reload resumes on the same page with the answers', async ({ page }) => {
    await page.goto(START);
    await page1(page);
    const saved = nextDraft(page);
    await rate(page, '5, Very satisfied', 3);
    await saved;
    await page.reload();
    await expectStep(page, 3);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('radio', { name: '5, Very satisfied', exact: true })).toBeChecked();
  });
});

test.describe('Page 5 and submission', () => {
  test('v2 Page 5: no heading text, even after a low score; the improvement question is required', async ({
    page,
  }) => {
    await page.goto(START);
    await toPage5(page, '1, Very dissatisfied');
    await expect(page.getByText('fell short')).toHaveCount(0);
    await expect(page.getByText('Additional feedback')).toHaveCount(0);
    await expect(page.getByText('What main thing should we improve upon?')).toBeVisible();
    await page.getByRole('button', { name: 'Submit feedback' }).click();
    await expect(page.getByText('Please choose what we should improve.', { exact: false })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Thank you! Your feedback has been received.' }),
    ).toHaveCount(0);
    await submitAndConfirm(page);
  });

  test('T-M06-030 phone required only while consent is on; masked number on the confirmation', async ({
    page,
  }) => {
    await page.goto(START);
    const id = await sessionId(page);
    await toPage5(page);
    const submit = page.getByRole('button', { name: 'Submit feedback' });
    await page.getByRole('switch', { name: 'You may contact me about my feedback' }).check();
    await expect(page.locator('#sv-live')).toHaveText('Mobile number and first name added');
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await page.getByLabel('Your mobile number').fill('0111');
    await submit.click({ force: true });
    await expect(page.locator('#e-phone')).toContainText('Please enter a Ghana mobile number');
    await page.getByLabel('Your mobile number').fill('024 123 4567');
    await page.getByLabel('Your first name (optional)').fill('Ama');
    await expect(submit).toHaveAttribute('aria-disabled', 'false');
    await submitAndConfirm(page);
    await expect(page.getByText('Our customer experience team may call you on 024 ••• 4567.')).toBeVisible();
    // contact details never went into the plain draft
    expect(
      sql(`select count(*) from survey.sessions where id = '${id}' and draft_answers::text like '%4567%'`),
    ).toBe('0');
  });

  test('T-M06-110 Back and reload after submit show the confirmation; cooldown off allows another response', async ({
    page,
    context,
  }) => {
    await page.goto(START);
    const id = await sessionId(page);
    await toPage5(page);
    const ref = await submitAndConfirm(page);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Thank you! Your feedback has been received.' }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-reference]')).toHaveText(ref);
    await expect(page.locator('form#sv-form')).toHaveCount(0);
    expect(responseCount(id)).toBe(1);
    // The device cooldown is off (device_cooldown_hours = 0): a new session from the same device
    // gets a fresh, blank form — never the "already shared" page.
    expect(sql(`select value::text from public.settings where key = 'device_cooldown_hours'`)).toBe('0');
    const cookies = (await context.cookies()).filter((c) => c.name !== 'dev-svs');
    await context.clearCookies();
    await context.addCookies(cookies);
    await page.goto(START);
    await expect(page.locator('form#sv-form')).toHaveCount(1);
    expect(await sessionId(page)).not.toBe(id);
    await expect(page.getByRole('heading', { name: /already shared/ })).toHaveCount(0);
  });

  test('"Share more feedback" starts a brand-new blank survey on the same device', async ({ page }) => {
    await page.goto(START);
    const id = await sessionId(page);
    await toPage5(page);
    await submitAndConfirm(page);
    await page.getByRole('link', { name: 'Share more feedback' }).click();
    await expect(page).toHaveURL(/\/customerfeedback$/);
    await expect(page.locator('form#sv-form')).toHaveCount(1);
    const fresh = await sessionId(page);
    expect(fresh).not.toBe(id);
    expect(draft(fresh, 'csat')).toBe('');
    await expectStep(page, 1);
    // The new form may save its own (empty) draft at once; nothing of the previous survey survives.
    const stored = await page.evaluate(() =>
      Object.keys(sessionStorage).map(
        (k) => JSON.parse(sessionStorage.getItem(k) ?? '{}') as { sid?: string; answers?: object },
      ),
    );
    for (const s of stored) {
      expect(s.sid).toBe(fresh);
      expect(Object.keys(s.answers ?? {})).toEqual([]);
    }
  });
});

test.describe('no-JS fallback (A-38, UG-06)', () => {
  test.use({ javaScriptEnabled: false });

  test('T-M06-060 one server-posted form, same validation, stored as unverified_no_js', async ({ page }) => {
    await page.goto(START);
    const id = await sessionId(page);
    await expect(page.locator('section.page:visible')).toHaveCount(5);
    await page.getByRole('radio', { name: 'Walk-in at a branch office', exact: true }).check();
    await page.getByRole('radio', { name: 'Motor insurance', exact: true }).check();
    await page.getByRole('radio', { name: '4, Satisfied', exact: true }).check();
    await page.getByRole('radio', { name: '5, Very easy', exact: true }).check();
    await page.getByRole('radio', { name: '10, Extremely likely', exact: true }).check();
    await page.getByRole('button', { name: 'Submit feedback' }).click();
    // branch is required for walk-in: same server rule, field-level message, answers kept
    await expect(page.locator('#e-branch')).toHaveText('Please choose the branch that issued your policy.');
    // the improvement question is required too (survey v2)
    await expect(page.locator('#e-factor')).toContainText('Please choose what we should improve.');
    await expect(page.getByRole('radio', { name: '4, Satisfied', exact: true })).toBeChecked();
    await page.getByLabel('Which branch issued your policy?').selectOption({ label: 'Kasoa' });
    await page.getByRole('radio', { name: 'Speed of service', exact: true }).check();
    await page.getByRole('button', { name: 'Submit feedback' }).click();
    await expect(
      page.getByRole('heading', { name: 'Thank you! Your feedback has been received.' }),
    ).toBeVisible();
    expect(
      sql(`select verification || ':' || branch_status from survey.responses where session_id = '${id}'`),
    ).toBe('unverified_no_js:selected');
  });
});

test.describe('accessibility (WCAG 2.2 AA, axe)', () => {
  test('pages 1, 2, 4, 5, confirmation and privacy have no serious or critical issues', async ({ page }) => {
    await page.goto(START);
    await expectNoSeriousA11yIssues(page);
    await page1(page);
    await expectNoSeriousA11yIssues(page);
    await rate(page, '4, Satisfied', 3);
    await rate(page, '5, Very easy', 4);
    await expectNoSeriousA11yIssues(page);
    await rate(page, '9', 5);
    await page.getByRole('switch', { name: 'You may contact me about my feedback' }).check();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole('switch', { name: 'You may contact me about my feedback' }).uncheck();
    await submitAndConfirm(page);
    await expectNoSeriousA11yIssues(page);
    await page.goto('/customerfeedback/privacy');
    await expectNoSeriousA11yIssues(page);
  });

  test('keyboard: arrow keys move without advancing, Enter selects and advances', async ({ page }) => {
    await page.goto(START);
    await page1(page);
    const first = page.getByRole('radio', { name: '1, Very dissatisfied', exact: true });
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
    await expectStep(page, 2);
    await page.keyboard.press('Enter');
    await expectStep(page, 3);
    await expect(page.locator('#sv-live')).toHaveText('Question 3 of 5');
  });
});

test.describe('retired QR points (revision Q)', () => {
  test('old QR-point links redirect to the form and record no QR source', async ({ page }) => {
    await page.goto('/customerfeedback/q/ZZZZ');
    expect(new URL(page.url()).pathname).toBe('/customerfeedback');
    const id = await sessionId(page);
    expect(
      sql(
        `select coalesce(s.code, '') from survey.sessions x left join public.survey_sources s on s.id = x.source_id where x.id = '${id}'`,
      ),
    ).not.toBe('qr');
    await expectStep(page, 1);
  });
});
