import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.5 — Live MCP fixture server', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
  });

  test.afterAll(() => ctx.close());

  test('fixture server connects successfully', async () => {
    const serverItem = page.locator('aside li').filter({ hasText: 'Fixture' });
    await expect(serverItem.locator('.bg-emerald-400')).toBeVisible();
  });

  test('tools list is non-empty', async () => {
    await page.getByRole('button', { name: /^Tools/ }).click();
    await page.screenshot({ path: 'test-results/05-tools-list.png', fullPage: true });
    // At least one tool item should be listed
    await expect(page.locator('aside + aside ul li').filter({ hasText: /./ }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Resources tab appears and is non-empty', async () => {
    const resourcesTab = page.getByRole('button', { name: /Resources/i });
    await expect(resourcesTab).toBeVisible({ timeout: 5_000 });
    await resourcesTab.click();
    await page.screenshot({ path: 'test-results/05-resources-tab.png', fullPage: true });
    // At least one resource item listed
    const resourceItems = page.locator('aside + aside ul li').filter({ hasText: /./ });
    await expect(resourceItems.first()).toBeVisible({ timeout: 5_000 });
  });

  test('Prompts tab appears and lists prompts', async () => {
    const promptsTab = page.getByRole('button', { name: /Prompts/i });
    await expect(promptsTab).toBeVisible({ timeout: 5_000 });
    await promptsTab.click();
    await page.screenshot({ path: 'test-results/05-prompts-tab.png', fullPage: true });
    // At least one prompt listed
    const promptItems = page.locator('aside + aside ul li').filter({ hasText: /./ });
    await expect(promptItems.first()).toBeVisible({ timeout: 5_000 });
  });
});
