import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.11 — Export / documentation generation', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /^Tools/ }).click();
    await page.locator('aside + aside ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
    if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }
  });

  test.afterAll(() => ctx.close());

  test('Export dialog renders output tab(s)', async () => {
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 5_000 });
    await exportBtn.click();

    await page.screenshot({ path: 'test-results/11-export-dialog.png', fullPage: true });

    // ExportDialog is a fixed overlay with an h2 heading — no role="dialog"
    await expect(page.getByRole('heading', { name: /Export/i }).first()).toBeVisible({ timeout: 3_000 });
  });

  test('download/copy button present and triggers without JS error', async () => {
    const jsErrors: string[] = [];
    page.once('pageerror', (err) => jsErrors.push(err.message));

    const copyBtn = page
      .getByRole('button', { name: /copy|download/i })
      .first();

    await expect(copyBtn).toBeVisible({ timeout: 3_000 });
    await copyBtn.click();
    await page.waitForTimeout(500);

    expect(jsErrors, `JS error on copy/download: ${jsErrors.join('; ')}`).toHaveLength(0);
    await page.keyboard.press('Escape');
  });
});
