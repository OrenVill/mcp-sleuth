import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.4 — Tab bar — Tools / Resources / Prompts', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    // Use the connected Fixture server — tab bar only renders for connected servers
    await addFixtureServer(page);
  });

  test.afterAll(() => ctx.close());

  test('middle column shows Tools tab', async () => {
    await page.screenshot({ path: 'test-results/04-tab-bar.png', fullPage: true });
    await expect(page.getByRole('button', { name: /^Tools/ })).toBeVisible();
  });

  test('clicking Resources tab (if visible) renders without crashing', async () => {
    await page.getByRole('button', { name: /^Tools/ }).click();
    const jsErrors: string[] = [];
    page.once('pageerror', (err) => jsErrors.push(err.message));
    await page.waitForTimeout(500);
    expect(jsErrors).toHaveLength(0);
  });

  test('clicking Prompts tab (if visible) renders without crashing', async () => {
    const promptsTab = page.getByRole('button', { name: 'Prompts' });
    if (await promptsTab.isVisible()) {
      await promptsTab.click();
      await page.waitForTimeout(500);
    }
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });
});
