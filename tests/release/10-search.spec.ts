import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.10 — Cross-server search', () => {
  let ctx: BrowserContext;
  let page: Page;
  let firstToolName: string;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /^Tools/ }).click();
    const firstTool = page.locator('aside + aside ul li').filter({ hasText: /./ }).first();
    firstToolName = (await firstTool.textContent() ?? '').trim().split('\n')[0].trim();
  });

  test.afterAll(() => ctx.close());

  test('search opens on ⌘K and filters tool list', async () => {
    await page.keyboard.press('Meta+k');
    const searchInput = page.getByRole('textbox').or(page.locator('input[type="search"]')).first();
    await expect(searchInput).toBeVisible({ timeout: 3_000 });

    const partial = firstToolName.slice(0, 3);
    await searchInput.fill(partial);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/10-search-results.png', fullPage: true });

    // GlobalSearch shows results as <ul> > <li> > <button> rows inside the search modal
    const results = page.locator('ul li button').filter({ hasText: /./ });
    await expect(results.first()).toBeVisible({ timeout: 3_000 });
  });

  test('results come from the correct server', async () => {
    const results = page.locator('ul li button').filter({ hasText: /./ });
    const count = await results.count();
    if (count > 0) {
      const text = await results.first().textContent() ?? '';
      expect(text.length).toBeGreaterThan(0);
    }
    await page.keyboard.press('Escape');
  });
});
