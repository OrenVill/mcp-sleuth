import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, openDevTools } from './helpers';

test.describe.serial('§3.33 — Server-initiated MCP requests', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
  });

  test.afterAll(() => ctx.close());

  test('Server Requests tab is available in Dev Tools', async () => {
    await openDevTools(page, 'Server Requests');
    await expect(page.getByText(/No pending server requests/i)).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
  });
});
