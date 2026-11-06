import { expect, test } from '@playwright/test';
import {
  chooseImprovement,
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

test.describe('submit overlay (locked while sending)', () => {
  const THANKS = 'Thank you! Your feedback has been received.';

  test('blurs and locks the form at once, ignores taps, then shows the tick and the thank-you page', async ({
    page,
  }) => {
    await page.goto(START);
    const id = await sessionId(page);
    await toPage5(page);
    await chooseImprovement(page, 'Speed of service');
    const other = page.getByRole('radio', { name: 'Nothing, I am satisfied', exact: true });
    const box = await other.boundingBox();
    if (!box) throw new Error('the option has no box');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route('**/api/v1/survey/submit', async (route) => {
      await gate;
      await route.continue();
    });

    await page.getByRole('button', { name: 'Submit feedback' }).click();
    const overlay = page.locator('[data-submit-overlay]');
    await expect(overlay).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Submitting your feedback…');
    await expect(page.getByRole('dialog')).toBeFocused();
    await expect(page.locator('#main')).toHaveAttribute('inert', '');
    await expect(page.locator('input[name="factor"]').first()).toBeDisabled();
    expect(await overlay.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');

    // A tap on another answer, or Tab + Space, cannot change anything while it is sending.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog')).toBeFocused();
    await expect(other).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Speed of service', exact: true })).toBeChecked();

    release();
    const confirmed = page.locator('[data-submit-overlay][data-done] [role="status"]');
    await confirmed.waitFor(); // the tick shows for under a second, so wait on the element itself
    expect(await confirmed.textContent()).toBe('Feedback received');
    await expect(page.getByRole('heading', { name: THANKS })).toBeVisible();
    await expect(overlay).toHaveCount(0);
    await expect(page.locator('#main')).not.toHaveAttribute('inert', '');
    expect(
      sql(
        `select f.code from survey.responses r join public.improvement_factors f on f.id = r.improvement_factor_id where r.session_id = '${id}'`,
      ),
    ).toBe('SPEED');
  });

  test('a failed submit removes the overlay, gives the form back and shows the error', async ({ page }) => {
    await page.goto(START);
    await toPage5(page);
    await chooseImprovement(page, 'Speed of service');
    let fail = true;
    await page.route('**/api/v1/survey/submit', async (route) => {
      if (!fail) return route.continue();
      await new Promise((r) => setTimeout(r, 400));
      return route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'unavailable', status: 503 }),
      });
    });
    await page.getByRole('button', { name: 'Submit feedback' }).click();
    await expect(page.locator('[data-submit-overlay]')).toBeVisible();
    await expect(page.locator('#sv-msg')).toHaveText(
      "We couldn't send your feedback just now. Your answers are safe — please try again.",
    );
    await expect(page.locator('[data-submit-overlay]')).toHaveCount(0);
    await expect(page.locator('#main')).not.toHaveAttribute('inert', '');
    // interactive again: the customer can change an answer and retry
    await chooseImprovement(page, 'Nothing, I am satisfied');
    await expect(page.getByRole('radio', { name: 'Nothing, I am satisfied', exact: true })).toBeChecked();
    fail = false;
    await submitAndConfirm(page);
  });
});

test.describe('resume choice for a returning customer', () => {
  test('asks first; "Pick up" restores the answers on the first page with an unanswered question', async ({
    page,
    context,
  }) => {
    await page.goto(START);
    const id = await sessionId(page);
    await page1(page);
    await rate(page, '4, Satisfied', 3);
    await expect.poll(() => draft(id, 'csat')).toBe('4');
    // The customer wandered back to Page 1 before leaving: resuming still skips to Page 3.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectStep(page, 1);
    await expect.poll(() => sql(`select current_page from survey.sessions where id = '${id}'`)).toBe('1');

    const later = await context.newPage(); // e.g. the SMS link again, another day
    await later.goto(START);
    await expect(later.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(
      later.getByText(/You started this form on \d{1,2} [A-Z][a-z]+ \d{4} at \d{1,2}:\d{2} [ap]m\./),
    ).toBeVisible();
    await expect(later.locator('form#sv-form')).toHaveCount(0);
    await expectNoSeriousA11yIssues(later);

    await later.getByRole('button', { name: 'Pick up where you left off' }).click();
    await expectStep(later, 3);
    expect(await sessionId(later)).toBe(id);
    await later.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(later.getByRole('radio', { name: '4, Satisfied', exact: true })).toBeChecked();
    await later.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(later.getByRole('radio', { name: 'Mobile application', exact: true })).toBeChecked();

    // A reload in the middle of the form carries on; it does not ask again.
    await later.reload();
    await expect(later.locator('form#sv-form')).toHaveCount(1);
    await expect(later.getByRole('heading', { name: 'Welcome back' })).toHaveCount(0);
  });

  test('"Start a new feedback form" closes the old draft server-side and opens a blank form', async ({
    page,
    context,
  }) => {
    await page.goto(START);
    const id = await sessionId(page);
    await page1(page);
    await expect.poll(() => draft(id, 'channel')).toBe('MOBILE_APP');

    const later = await context.newPage();
    await later.goto(START);
    await later.getByRole('button', { name: 'Start a new feedback form' }).click();
    await expectStep(later, 1);
    const fresh = await sessionId(later);
    expect(fresh).not.toBe(id);
    await expect(later.getByRole('radio', { name: 'Mobile application', exact: true })).not.toBeChecked();
    expect(sql(`select status || ':' || draft_answers::text from survey.sessions where id = '${id}'`)).toBe(
      'expired:{}',
    );
    // Coming back again offers nothing from the old draft.
    const again = await context.newPage();
    await again.goto(START);
    await expect(again.locator('form#sv-form')).toHaveCount(1);
    expect(await sessionId(again)).toBe(fresh);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the choice screen is a plain form that works the same', async ({ page }) => {
      await page.goto(START);
      const id = await sessionId(page);
      sql(
        `update survey.sessions set draft_answers = '{"channel":"MOBILE_APP","product":"MOTOR"}', answer_seq = 1 where id = '${id}'`,
      );
      await page.goto(START);
      await page.getByRole('button', { name: 'Pick up where you left off' }).click();
      await expect(page.locator('form#sv-form')).toHaveCount(1);
      await expect(page.getByRole('radio', { name: 'Mobile application', exact: true })).toBeChecked();
      await page.goto(START);
      await page.getByRole('button', { name: 'Start a new feedback form' }).click();
      await expect(page.locator('form#sv-form')).toHaveCount(1);
      await expect(page.getByRole('radio', { name: 'Mobile application', exact: true })).not.toBeChecked();
      expect(sql(`select status from survey.sessions where id = '${id}'`)).toBe('expired');
    });
  });
});

test.describe('survey v3 and the recommendation scale', () => {
  test('"Ease of the process" and "Pricing and charges" are no longer offered', async ({ page }) => {
    await page.goto(START);
    await toPage5(page);
    await expect(page.getByRole('radio', { name: 'Speed of service', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Ease of the process' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Pricing and charges' })).toHaveCount(0);
    // retired, not deleted: old responses still resolve their labels
    expect(
      sql(
        `select string_agg(label, ' | ' order by code) from public.improvement_factors where code in ('EASE', 'PRICE') and not is_active`,
      ),
    ).toBe('Ease of the process | Pricing and charges');
  });

  test('every 0–10 digit is centred in its box and the row fits from 320 px up', async ({ page }) => {
    await page.goto(START);
    await page1(page);
    await rate(page, '4, Satisfied', 3);
    await rate(page, '5, Very easy', 4);
    for (const width of [320, 360, 414, 600, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        boxes: Array.from(document.querySelectorAll('.nps .box')).map((b) => {
          const r = document.createRange();
          r.selectNodeContents(b.querySelector('.num') as Node);
          const t = r.getBoundingClientRect();
          const o = b.getBoundingClientRect();
          return {
            dx: t.left + t.width / 2 - (o.left + o.width / 2),
            dy: t.top + t.height / 2 - (o.top + o.height / 2),
            w: o.width,
          };
        }),
      }));
      expect(m.overflow, `no sideways scrolling at ${width}px`).toBeLessThanOrEqual(0);
      expect(m.boxes).toHaveLength(11);
      for (const [i, b] of m.boxes.entries()) {
        expect(Math.abs(b.dx), `${i} centred horizontally at ${width}px`).toBeLessThanOrEqual(0.75);
        expect(Math.abs(b.dy), `${i} centred vertically at ${width}px`).toBeLessThanOrEqual(1.5);
        expect(b.w, `${i} is a comfortable tap target at ${width}px`).toBeGreaterThanOrEqual(36);
      }
    }
  });
});
