import { type Page } from '@playwright/test';

export const VAULT_PASS = 'test-release-pass-123';
export const FIXTURE_URL = 'http://localhost:3001/mcp';
export const UNREACHABLE_URL = 'http://localhost:9999/mcp';

/** Delete the server-side vault file so the next page load shows the Create vault screen. */
export async function resetVaultStorage(): Promise<void> {
  await fetch('http://127.0.0.1:4173/__vault_storage', { method: 'DELETE' });
}

export async function setupVault(page: Page): Promise<void> {
  // Always wipe the vault file first so every spec gets a clean, empty vault.
  // The DELETE endpoint returns 204 even when no file exists, so this is safe.
  await resetVaultStorage();
  await page.goto('/');
  // The page always shows Create vault after a reset
  // Use exact:true so "Passphrase" doesn't also match "Confirm passphrase"
  await page.getByLabel('Passphrase', { exact: true }).fill(VAULT_PASS);
  await page.getByLabel('Confirm passphrase').fill(VAULT_PASS);
  await page.getByRole('button', { name: 'Create vault' }).click();
  // Wait for main UI — the Add button is always in the sidebar after vault creation
  await page.getByRole('button', { name: 'Add' }).waitFor({ timeout: 10_000 });
}

export async function addServer(
  page: Page,
  name: string,
  url: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('Name').fill(name);
  // Clear default URL then type ours
  await page.getByLabel('MCP HTTP URL').clear();
  await page.getByLabel('MCP HTTP URL').fill(url);
  await page.getByRole('button', { name: 'Add & connect' }).click();
  await page.locator('aside li').filter({ hasText: name }).waitFor({ timeout: 5_000 });
}

export async function waitForConnected(page: Page, serverName: string): Promise<void> {
  await page
    .locator('aside li')
    .filter({ hasText: serverName })
    .locator('.bg-emerald-400')
    .waitFor({ timeout: 15_000 });
}

export async function waitForError(page: Page, serverName: string): Promise<void> {
  await page
    .locator('aside li')
    .filter({ hasText: serverName })
    .locator('.bg-red-500')
    .waitFor({ timeout: 15_000 });
}

export async function selectServer(page: Page, name: string): Promise<void> {
  await page.locator('aside li').filter({ hasText: name }).click();
}

export async function openDevTools(page: Page, tab?: string): Promise<void> {
  await page.getByRole('button', { name: 'Dev Tools' }).click();
  if (tab) {
    await page.getByRole('button', { name: tab }).click();
  }
  // wait for modal to settle
  await page.locator('text=Dev Tools').first().waitFor({ timeout: 3_000 });
}

export async function addFixtureServer(page: Page): Promise<void> {
  await addServer(page, 'Fixture', FIXTURE_URL);
  await waitForConnected(page, 'Fixture');
  await selectServer(page, 'Fixture');
}
