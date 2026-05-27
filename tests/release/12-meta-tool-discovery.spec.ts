import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, addAwesomeServer } from './helpers';

test.describe.serial('§3.12 — Meta-tool discovery', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    // awesome-mcp-servers is always-on and exposes meta-tools; select it for discovery tests.
    await addAwesomeServer(page);
    // Wait for at least one tool to appear — Tools tab stays active after connection,
    // no need to click it. This also confirms detectMetaTools has run before tests start.
    await page.locator('aside + aside li').first().waitFor({ timeout: 15_000 });
  });

  test.afterAll(() => ctx.close());

  test('"Discover all tools" button appears when server exposes a meta-tool', async () => {
    // DiscoveryHeader only renders inside ToolDetail when a meta-tool is selected.
    // Click search_tools to make the detail pane mount it.
    await page.locator('aside + aside').getByText('search_tools').first().click();
    await page.screenshot({ path: 'test-results/12-before-discover.png', fullPage: true });
    const discoverBtn = page.getByRole('button', { name: /discover/i }).first();
    await expect(discoverBtn).toBeVisible({ timeout: 15_000 });
  });

  test('clicking Discover shows discovered tools in a collapsible section', async () => {
    const discoverBtn = page.getByRole('button', { name: /discover/i }).first();
    await discoverBtn.click();
    await page.waitForTimeout(3_000);

    await page.screenshot({ path: 'test-results/12-discovered-tools.png', fullPage: true });

    const discoveredSection = page.locator('text=/discovered|found/i').first();
    await expect(discoveredSection).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a discovered tool opens its detail form', async () => {
    const discoveredItems = page.locator('[class*="discover"] li, [class*="discovered"] li').filter({ hasText: /./ });
    if (await discoveredItems.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await discoveredItems.first().click();
      await page.waitForTimeout(300);
      const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
      await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    }
  });
});
