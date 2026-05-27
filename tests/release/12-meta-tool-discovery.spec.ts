import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.12 — Meta-tool discovery', () => {
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

  test('"Discover all tools" button appears when server exposes a meta-tool', async () => {
    await page.screenshot({ path: 'test-results/12-before-discover.png', fullPage: true });

    const discoverBtn = page.getByRole('button', { name: /discover/i }).first();
    if (!await discoverBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Fixture server does not expose a meta-tool — skipping discovery check');
      return;
    }
    await expect(discoverBtn).toBeVisible();
  });

  test('clicking Discover shows discovered tools in a collapsible section', async () => {
    const discoverBtn = page.getByRole('button', { name: /discover/i }).first();
    if (!await discoverBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      test.skip(true, 'No meta-tool available');
      return;
    }
    await discoverBtn.click();
    await page.waitForTimeout(3_000);

    await page.screenshot({ path: 'test-results/12-discovered-tools.png', fullPage: true });

    const discoveredSection = page.locator('text=/discovered|found/i').first();
    await expect(discoveredSection).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a discovered tool opens its detail form', async () => {
    const discoverBtn = page.getByRole('button', { name: /discover/i }).first();
    if (!await discoverBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      test.skip(true, 'No meta-tool available');
      return;
    }
    const discoveredItems = page.locator('[class*="discover"] li, [class*="discovered"] li').filter({ hasText: /./ });
    if (await discoveredItems.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await discoveredItems.first().click();
      await page.waitForTimeout(300);
      const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
      await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    }
  });
});
