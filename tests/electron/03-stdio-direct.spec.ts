import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  closeApp,
  launchApp,
  paramInput,
  selectServer,
  setupVault,
  waitForConnected,
  type LaunchedApp,
} from './helpers';

const FIXTURE_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/stdio-mcp-server.mjs',
);
const SERVER_NAME = 'Stdio Fixture';
const ECHO_MESSAGE = 'hello from electron stdio';

test.describe.serial('Electron — direct stdio transport', () => {
  let launched: LaunchedApp;
  const rendererRequests: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    launched = await launchApp();
    launched.page.on('request', (req) => rendererRequests.push(req.url()));
    await setupVault(launched.page);

    const page = launched.page;
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('radio', { name: 'Stdio' }).click({ force: true });
    await page.getByLabel('Name').fill(SERVER_NAME);
    await page.getByLabel('Command').fill(process.execPath);
    await page.getByLabel('Arguments').fill(FIXTURE_SCRIPT);
    await page.getByRole('button', { name: 'Add & connect' }).click();
    await waitForConnected(page, SERVER_NAME);
    await selectServer(page, SERVER_NAME);
  });

  test.afterAll(async () => closeApp(launched));

  test('spawns the subprocess directly and lists its tools', async () => {
    await expect(
      launched.page.locator('aside + aside ul li').filter({ hasText: 'echo' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('the renderer never touched the stdio HTTP bridge', () => {
    expect(rendererRequests.filter((u) => u.includes('__mcp_stdio'))).toEqual([]);
  });

  test('invoking the spawned tool returns its result', async () => {
    const page = launched.page;
    await page.locator('aside + aside ul li').filter({ hasText: 'echo' }).click();
    await paramInput(page, 'message').fill(ECHO_MESSAGE);
    await page.getByRole('button', { name: 'Run tool' }).click();

    await expect(page.locator('main').getByText(ECHO_MESSAGE).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
