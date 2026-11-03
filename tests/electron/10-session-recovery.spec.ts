import { test, expect } from '@playwright/test';
import {
  closeApp,
  launchApp,
  paramInput,
  selectServer,
  setupVault,
  waitForConnected,
  type LaunchedApp,
} from './helpers';

const STATEFUL_URL = 'http://127.0.0.1:3005/mcp';
const SERVER_NAME = 'Stateful sample';
const ECHO_MESSAGE = 'survived restart';

async function fixtureControl(path: string): Promise<void> {
  const res = await fetch(`http://127.0.0.1:3005${path}`, { method: 'POST' });
  expect(res.ok).toBe(true);
}

test.describe.serial('Electron — session recovery after server restart', () => {
  let launched: LaunchedApp;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    launched = await launchApp();
    await setupVault(launched.page);

    const page = launched.page;
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Name').fill(SERVER_NAME);
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(STATEFUL_URL);
    await page.getByRole('button', { name: 'Add & connect' }).click();
    await waitForConnected(page, SERVER_NAME);
    await selectServer(page, SERVER_NAME);
  });

  test.afterAll(async () => {
    await fixtureControl('/__online');
    await closeApp(launched);
  });

  test('tool call succeeds after the fixture forgets the session', async () => {
    const page = launched.page;
    await fixtureControl('/__restart');

    await page.locator('aside + aside ul li').filter({ hasText: 'echo_text' }).click();
    await paramInput(page, 'message').fill(ECHO_MESSAGE);
    await page.getByRole('button', { name: 'Run tool' }).click();

    await expect(page.locator('main').getByText(ECHO_MESSAGE).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.locator('aside li').filter({ hasText: SERVER_NAME }).locator('.bg-emerald-400'),
    ).toBeVisible();
  });

  test('marks the server errored with Reconnect when the server is down', async () => {
    test.setTimeout(60_000);
    const page = launched.page;
    await selectServer(page, SERVER_NAME);
    await fixtureControl('/__offline');
    await fixtureControl('/__restart');

    await page.locator('aside + aside ul li').filter({ hasText: 'echo_text' }).click();
    await paramInput(page, 'message').fill('should fail');
    await page.getByRole('button', { name: 'Run tool' }).click();

    const row = page.locator('aside li').filter({ hasText: SERVER_NAME });
    await expect(row.getByRole('button', { name: 'Reconnect' })).toBeVisible({ timeout: 30_000 });
    await expect(row.locator('.bg-red-500')).toBeVisible();

    await fixtureControl('/__online');
    await row.getByRole('button', { name: 'Reconnect' }).click();
    await waitForConnected(page, SERVER_NAME);
  });
});
