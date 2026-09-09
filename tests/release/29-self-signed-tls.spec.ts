import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addServer, waitForConnected, waitForError } from './helpers';

/**
 * §3.29 — Allowing a self-signed certificate, per server
 *
 * A development or intranet MCP endpoint commonly has a certificate no public
 * CA signed. The fixture on 3004 is exactly that, so connecting to it must fail
 * until the user says otherwise, and succeed once they do.
 *
 * The order matters: the failure is asserted first, because a test that only
 * checked the success case would pass just as well if verification had been
 * turned off everywhere.
 */
const TLS_URL = 'https://localhost:3004/mcp';
const SERVER = 'Secure sample';

test.describe.serial('§3.29 — Self-signed certificate option', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
  });

  test.afterAll(() => ctx.close());

  test('a self-signed endpoint fails to connect by default', async () => {
    await addServer(page, SERVER, TLS_URL);
    await waitForError(page, SERVER);
  });

  test('the option is offered only once the URL is https', async () => {
    await page.locator('aside li').filter({ hasText: SERVER }).hover();
    await page.getByRole('button', { name: 'Edit' }).first().click();

    const checkbox = page.getByRole('checkbox', { name: /self-signed/i });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    // Over plain HTTP there is no certificate to waive, so the option goes away.
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill('http://localhost:3004/mcp');
    await expect(checkbox).toBeHidden();

    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(TLS_URL);
    await expect(checkbox).toBeVisible();
  });

  test('ticking it connects, and the tool list arrives', async () => {
    await page.getByRole('checkbox', { name: /self-signed/i }).check();
    await page.getByRole('button', { name: /Save|Update/ }).click();

    await waitForConnected(page, SERVER);
    await expect(page.getByText('echo_secure')).toBeVisible({ timeout: 10_000 });
  });

  test('the choice survives a reload', async () => {
    await page.reload();
    await page.getByLabel('Passphrase', { exact: true }).fill('test-release-pass-123');
    await page.getByRole('button', { name: /Unlock/i }).click();
    await page.getByRole('button', { name: 'Add' }).waitFor({ timeout: 10_000 });

    await page.locator('aside li').filter({ hasText: SERVER }).hover();
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.getByRole('checkbox', { name: /self-signed/i })).toBeChecked();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
