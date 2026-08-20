import { test, expect } from '@playwright/test';
import {
  closeApp,
  FIXTURE_URL,
  launchApp,
  paramInput,
  selectServer,
  setupVault,
  waitForConnected,
  type LaunchedApp,
} from './helpers';

const SERVER_NAME = 'Fixture';
const ECHO_MESSAGE = 'hello from electron';

test.describe.serial('Electron — direct HTTP transport', () => {
  let launched: LaunchedApp;
  const rendererRequests: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    launched = await launchApp();
    launched.page.on('request', (req) => rendererRequests.push(req.url()));
    await setupVault(launched.page);

    const page = launched.page;
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Name').fill(SERVER_NAME);
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: 'Add & connect' }).click();
    await waitForConnected(page, SERVER_NAME);
    await selectServer(page, SERVER_NAME);
  });

  test.afterAll(async () => closeApp(launched));

  test('connects and lists tools with no local server running', async () => {
    await expect(
      launched.page.locator('aside + aside ul li').filter({ hasText: 'echo_markdown' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('the renderer never issued a proxy request', () => {
    expect(rendererRequests.filter((u) => u.includes('__mcp_proxy'))).toEqual([]);
  });

  test('the renderer never issued an MCP request at all', () => {
    // Every MCP byte leaves from the main process, so the renderer should not
    // have touched the fixture origin.
    expect(rendererRequests.filter((u) => u.includes('localhost:3001'))).toEqual([]);
  });

  test('invoking a tool returns its result', async () => {
    const page = launched.page;
    await page.locator('aside + aside ul li').filter({ hasText: 'echo_markdown' }).click();
    await paramInput(page, 'message').fill(ECHO_MESSAGE);
    await page.getByRole('button', { name: 'Run tool' }).click();

    await expect(page.locator('main').getByText(ECHO_MESSAGE).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('resources and prompts load over IPC', async () => {
    const page = launched.page;
    await page.getByRole('button', { name: /Resources/i }).click();
    await expect(
      page.locator('aside + aside ul li').filter({ hasText: 'page.html' }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Prompts/i }).click();
    await expect(
      page.locator('aside + aside ul li').filter({ hasText: 'summarize_text' }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
