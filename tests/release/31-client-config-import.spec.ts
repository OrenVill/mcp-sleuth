import { test, expect } from '@playwright/test';
import { setupVault, FIXTURE_URL } from './helpers';
import { generateCursorConfig } from '../../src/lib/clientConfigExport';

test.describe('§3.31 — MCP Client Config Import', () => {
  test('Import client config adds servers to the vault', async ({ page }) => {
    await setupVault(page);

    const snippet = generateCursorConfig({
      name: 'Imported Fixture',
      url: FIXTURE_URL,
    });

    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('heading', { name: /import client config/i })).toBeVisible();

    await page.locator('textarea').fill(snippet);
    await expect(page.getByText(/1 to add/i)).toBeVisible({ timeout: 3_000 });

    await page.getByRole('button', { name: /import into vault/i }).click();
    await expect(page.getByRole('heading', { name: /import client config/i })).not.toBeVisible();

    await expect(page.locator('aside li').filter({ hasText: 'Imported Fixture' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('Import dialog warns about unresolved env placeholders', async ({ page }) => {
    await setupVault(page);

    const snippet = generateCursorConfig({
      name: 'Auth Import',
      url: FIXTURE_URL,
      auth: { method: 'bearer', bearerToken: 'secret' },
    });

    await page.getByRole('button', { name: 'Import' }).click();
    await page.locator('textarea').fill(snippet);
    await expect(page.getByText(/Unresolved env vars/i)).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Escape');
  });
});
