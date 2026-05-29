import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, openDevTools } from './helpers';

test.describe.serial('§3.22 — Trust evaluators (permission, injection, journal)', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /^Tools/ }).click();
  });

  test.afterAll(() => ctx.close());

  test('Permission Surface tab shows risk summary for connected server', async () => {
    await openDevTools(page, 'Permission Surface');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/risk surface|permission/i);
    expect(bodyText).toMatch(/Fixture/i);
    await page.keyboard.press('Escape');
  });

  test('Prompt Injection tab scans tools without API keys', async () => {
    await openDevTools(page, 'Prompt Injection');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/prompt injection|scanned/i);
    const apiKeyError = page.locator('text=/api key required|openai/i').first();
    await expect(apiKeyError).not.toBeVisible({ timeout: 2_000 });
    await page.keyboard.press('Escape');
  });

  test('Observation Journal tab supports trust decision and export', async () => {
    await openDevTools(page, 'Observation Journal');
    await expect(page.getByRole('button', { name: 'Approved' })).toBeVisible({ timeout: 3_000 });
    await page.getByRole('button', { name: 'Approved' }).click();
    await page.getByPlaceholder('Why this trust decision?').fill('Release suite smoke test');
    await page.getByRole('button', { name: 'Export markdown' }).click();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/trust decision|general notes/i);
    await page.keyboard.press('Escape');
  });
});
