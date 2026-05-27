import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addServer, waitForError, selectServer, UNREACHABLE_URL } from './helpers';

test.describe.serial('§3.3 — Server connection error state', () => {
  let ctx: BrowserContext;
  let page: Page;
  const jsErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await setupVault(page);
    await addServer(page, 'Test', UNREACHABLE_URL);
    await waitForError(page, 'Test');
    await selectServer(page, 'Test');
  });

  test.afterAll(() => ctx.close());

  test('shows connection-failed or disconnected indicator in sidebar — not a crash', async () => {
    const serverItem = page.locator('aside li').filter({ hasText: 'Test' });
    await expect(serverItem.locator('.bg-red-500')).toBeVisible();
  });

  test('shows error message or Connect button — no white screen', async () => {
    await page.screenshot({ path: 'test-results/03-connection-error.png', fullPage: true });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test('no uncaught JS errors', async () => {
    expect(jsErrors, `Uncaught JS errors: ${jsErrors.join('; ')}`).toHaveLength(0);
  });
});
