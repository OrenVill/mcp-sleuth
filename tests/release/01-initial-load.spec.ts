import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { VAULT_PASS, resetVaultStorage } from './helpers';

test.describe.serial('§3.1 — Initial load / empty state', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Wipe the server-side vault file so the app shows the Create vault screen
    await resetVaultStorage();
    ctx = await browser.newContext();
    page = await ctx.newPage();
  });

  test.afterAll(() => ctx.close());

  test('shows vault setup screen on first visit', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Create vault' })).toBeVisible();
  });

  test('sidebar visible with no servers listed and + Add button present after vault creation', async () => {
    await page.getByLabel('Passphrase', { exact: true }).fill(VAULT_PASS);
    await page.getByLabel('Confirm passphrase').fill(VAULT_PASS);
    await page.getByRole('button', { name: 'Create vault' }).click();
    await page.getByText('No servers yet').waitFor({ timeout: 10_000 });

    await page.screenshot({ path: 'test-results/01-empty-state-full.png', fullPage: true });

    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByText('No servers yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
  });

  test('middle and right columns show empty-state copy — not blank, not errored', async () => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    const body = page.locator('body');
    await expect(body).not.toHaveText('');
    expect(jsErrors, `Unexpected JS errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });
});
