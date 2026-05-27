import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, UNREACHABLE_URL } from './helpers';

test.describe.serial('§3.2 — Add Server dialog', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
  });

  test.afterAll(() => ctx.close());

  test('clicking + Add opens dialog with Name, URL, Description fields', async () => {
    await page.getByRole('button', { name: 'Add' }).click();

    await page.screenshot({ path: 'test-results/02-add-server-dialog.png', fullPage: true });

    await expect(page.getByRole('heading', { name: 'Add MCP Server' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('MCP HTTP URL')).toBeVisible();
    await expect(page.getByLabel('Description')).toBeVisible();
  });

  test('URL placeholder suggests http://host:port/mcp pattern', async () => {
    const urlInput = page.getByLabel('MCP HTTP URL');
    const placeholder = await urlInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/^http/);
    expect(placeholder).toMatch(/mcp/i);
  });

  test('submitting adds server to sidebar with an indicator', async () => {
    await page.getByLabel('Name').fill('Test');
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(UNREACHABLE_URL);
    await page.getByRole('button', { name: 'Add & connect' }).click();

    const serverItem = page.locator('aside li').filter({ hasText: 'Test' });
    await serverItem.waitFor({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/02-server-in-sidebar.png', fullPage: true });

    await expect(serverItem).toBeVisible();
    await expect(serverItem.locator('span[title]').first()).toBeVisible();
  });
});
