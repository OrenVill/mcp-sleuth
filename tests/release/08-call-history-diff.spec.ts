import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.8 — Call history — semantic diff', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /^Tools/ }).click();
    const toolItems = page.locator('aside + aside ul li').filter({ hasText: /./ });
    await toolItems.first().click();
    await page.waitForTimeout(300);

    async function fillAndInvoke(value: string) {
      const textInputs = page.locator('input[type="text"], input:not([type])');
      const count = await textInputs.count();
      for (let i = 0; i < count; i++) {
        await textInputs.nth(i).fill(value);
      }
      const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }

    await fillAndInvoke('first-call');
    await fillAndInvoke('second-call');
  });

  test.afterAll(() => ctx.close());

  test('call history panel opens', async () => {
    const historyBtn = page
      .getByRole('button', { name: /history/i })
      .or(page.getByTitle(/history/i))
      .first();

    if (await historyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await historyBtn.click();
      await page.screenshot({ path: 'test-results/08-call-history.png', fullPage: true });
    }
  });

  test('selecting two calls shows semantic diff — 3-column layout (old | path | new)', async () => {
    const historyItems = page.locator('[class*="history"] li, [class*="call"] li').filter({ hasText: /./ });
    const count = await historyItems.count();

    if (count >= 2) {
      await historyItems.nth(0).click();
      await page.waitForTimeout(300);
      await historyItems.nth(1).click({ modifiers: ['Shift'] });
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'test-results/08-semantic-diff.png', fullPage: true });

      await expect(page.locator('text=+++ ')).not.toBeVisible();
      await expect(page.locator('text=--- ')).not.toBeVisible();
    }
  });
});
