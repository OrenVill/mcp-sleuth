import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { addServer, openDevTools, setupVault, waitForConnected } from './helpers';

const REVERSE_MCP_URL = 'http://127.0.0.1:3006/mcp';

test.describe.serial('§3.33 — Server-initiated MCP requests', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addServer(page, 'Reverse sample', REVERSE_MCP_URL);
    await waitForConnected(page, 'Reverse sample');
    await page.locator('aside li').filter({ hasText: 'Reverse sample' }).click();
  });

  test.afterAll(() => ctx.close());

  test('Server Requests tab is available in Dev Tools', async () => {
    await openDevTools(page, 'Server Requests');
    await expect(page.getByText(/Client roots/i)).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
  });

  test('elicitation flow surfaces approval UI and completes tool call', async () => {
    await page.getByRole('button', { name: /^Tools/ }).click();
    await page.locator('aside + aside ul li').filter({ hasText: 'ask_confirm' }).click();
    await page.getByLabel('step').fill('playwright-step');
    await page.getByRole('button', { name: 'Invoke' }).click();

    await openDevTools(page, 'Server Requests');
    await expect(page.getByText(/Elicitation request/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText(/Elicitation request/i)).toBeHidden({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    await expect(page.getByText(/"action"\s*:\s*"accept"/i)).toBeVisible({ timeout: 15_000 });
  });
});
