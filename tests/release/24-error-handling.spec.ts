import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault } from './helpers';

test.describe.serial('§3.24 — Error handling', () => {
  let ctx: BrowserContext;
  let page: Page;
  const consoleErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await setupVault(page);
  });

  test.afterAll(() => ctx.close());

  test('an unhandled promise rejection is reported, not swallowed', async () => {
    // An MCP call that rejects outside a try/catch used to vanish silently,
    // leaving the UI stuck with no clue why.
    await page.evaluate(() => {
      void Promise.reject(new Error('synthetic-rejection-for-test'));
    });

    await expect
      .poll(() => consoleErrors.some((e) => e.includes('unhandled rejection')), { timeout: 5_000 })
      .toBe(true);
  });

  test('an uncaught error is reported', async () => {
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('synthetic-uncaught-for-test');
      }, 0);
    });

    await expect
      .poll(() => consoleErrors.some((e) => e.includes('uncaught error')), { timeout: 5_000 })
      .toBe(true);
  });

  test('the app stays usable after both', async () => {
    // The point of the handlers: report and carry on, rather than white-screen.
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('heading', { name: 'Add MCP Server' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  // The ErrorBoundary's own render path is not covered here: React only catches
  // errors thrown during render, and there is no way to force one from outside
  // the app without adding a test-only backdoor. Its message formatting is unit
  // tested in src/lib/errorMessage.test.ts.
});
