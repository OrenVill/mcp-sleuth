import { test, expect } from '@playwright/test';
import {
  closeApp,
  launchApp,
  selectServer,
  setupVault,
  waitForConnected,
  type LaunchedApp,
} from './helpers';

/**
 * The desktop path for the self-signed certificate option.
 *
 * Worth its own spec because the mechanism is completely different from the
 * browser build's. There is no local proxy here — MCP leaves the main process —
 * so the waiver is an Electron session with a certificate verify proc, scoped
 * to the hostnames of servers the user ticked. Only an end-to-end run against a
 * real TLS server with an untrusted certificate proves that wiring works.
 */
const TLS_URL = 'https://localhost:3004/mcp';
const SERVER_NAME = 'Secure sample';

test.describe.serial('Electron — self-signed certificate option', () => {
  let launched: LaunchedApp;

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    launched = await launchApp();
    await setupVault(launched.page);
  });

  test.afterAll(async () => closeApp(launched));

  test('refuses an untrusted certificate until the user says otherwise', async () => {
    const page = launched.page;
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Name').fill(SERVER_NAME);
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(TLS_URL);
    await page.getByRole('button', { name: 'Add & connect' }).click();

    await page
      .locator('aside li')
      .filter({ hasText: SERVER_NAME })
      .locator('.bg-red-500')
      .waitFor({ timeout: 20_000 });
  });

  test('connects once the option is ticked, from the main process', async () => {
    const page = launched.page;
    await page.locator('aside li').filter({ hasText: SERVER_NAME }).hover();
    await page.getByRole('button', { name: 'Edit' }).first().click();

    const checkbox = page.getByRole('checkbox', { name: /self-signed/i });
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await page.getByRole('button', { name: /Save|Update/ }).click();

    await waitForConnected(page, SERVER_NAME);
    await selectServer(page, SERVER_NAME);
    await expect(
      page.locator('aside + aside ul li').filter({ hasText: 'echo_secure' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('the waiver does not leak to any other host', async () => {
    // A second server on a different hostname, same untrusted certificate, with
    // the option off. If the waiver were global rather than per host, this would
    // connect.
    const page = launched.page;
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Name').fill('Other host');
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill('https://127.0.0.1:3004/mcp');
    await page.getByRole('button', { name: 'Add & connect' }).click();

    await page
      .locator('aside li')
      .filter({ hasText: 'Other host' })
      .locator('.bg-red-500')
      .waitFor({ timeout: 20_000 });
  });
});
