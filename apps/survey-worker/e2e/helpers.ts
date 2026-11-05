import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const DOCKER_DIR = 'C:/Users/manue/AppData/Local/Programs/DockerDesktop/resources/bin';
const DB_CONTAINER = process.env.SURVEY_E2E_DB_CONTAINER ?? 'supabase_db_serene-pulse';

/** Runs one read-only SQL query in the local database and returns the first column of the first row. */
export function sql(query: string): string {
  const env = { ...process.env };
  if (existsSync(DOCKER_DIR))
    env.PATH = `${DOCKER_DIR}${process.platform === 'win32' ? ';' : ':'}${env.PATH ?? ''}`;
  return execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-At', '-c', query], {
    env,
    encoding: 'utf8',
    timeout: 20_000,
  }).trim();
}

export async function sessionId(page: Page): Promise<string> {
  const raw = await page.locator('#sv-boot').textContent();
  const id = (JSON.parse(raw ?? '{}') as { sessionId?: string }).sessionId ?? '';
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

export const draft = (id: string, key: string) =>
  sql(`select coalesce(draft_answers ->> '${key}', '') from survey.sessions where id = '${id}'`);
export const responseCount = (id: string) =>
  Number(sql(`select count(*) from survey.responses where session_id = '${id}'`));

export async function expectStep(page: Page, n: number) {
  await expect(page.locator('#sv-step')).toHaveText(`Step ${n} of 5`);
  await expect(page.locator('#sv-bar span[data-on]')).toHaveCount(n);
  await expect(page.locator(`section[data-page="${n}"]`)).toBeVisible();
  await expect(page.locator('section.page:visible')).toHaveCount(1);
}

/** Waits for the next draft PATCH the island sends (debounced 300 ms). */
export const nextDraft = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith('/api/v1/survey/answers') && r.request().method() === 'PATCH');

export async function page1(page: Page, channel = 'Mobile application', product = 'Motor insurance') {
  await page.getByRole('radio', { name: channel, exact: true }).click();
  await page.getByRole('radio', { name: product, exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectStep(page, 2);
}

export async function rate(page: Page, name: string, nextStep: number) {
  await page.getByRole('radio', { name, exact: true }).click();
  await expectStep(page, nextStep);
}

export async function toPage5(page: Page, csat = '4, Satisfied') {
  await page1(page);
  await rate(page, csat, 3);
  await rate(page, '5, Very easy', 4);
  await rate(page, '9', 5);
}

export async function submitAndConfirm(page: Page) {
  await page.getByRole('button', { name: 'Submit feedback' }).click();
  await expect(
    page.getByRole('heading', { name: 'Thank you! Your feedback has been received.' }),
  ).toBeVisible({
    timeout: 30_000,
  });
  const ref = (await page.locator('[data-reference]').textContent())?.trim() ?? '';
  expect(ref).toMatch(/^FB-\d{4}-\d{6,}$/);
  return ref;
}

export async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
