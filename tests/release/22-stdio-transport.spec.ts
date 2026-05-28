import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setupVault, waitForConnected, selectServer } from './helpers';

const FIXTURE_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/stdio-mcp-server.mjs',
);

const SERVER_NAME = 'Stdio Fixture';
const ECHO_MESSAGE = 'hello from playwright stdio';

test.describe.serial('§3.22 — Stdio MCP transport', () => {
  test('add stdio server, connect, invoke echo tool', async ({ page }) => {
    test.setTimeout(60_000);
    await setupVault(page);

    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('heading', { name: 'Add MCP Server' })).toBeVisible();

    await page.getByRole('radio', { name: 'Stdio' }).click({ force: true });
    await page.getByLabel('Name').fill(SERVER_NAME);
    await page.getByLabel('Command').fill(process.execPath);
    await page.getByLabel('Arguments').fill(FIXTURE_SCRIPT);
    await page.getByRole('button', { name: 'Add & connect' }).click();

    await page.locator('aside li').filter({ hasText: SERVER_NAME }).waitFor({ timeout: 5_000 });
    await waitForConnected(page, SERVER_NAME);
    await selectServer(page, SERVER_NAME);

    await page.locator('aside + aside ul li').filter({ hasText: 'echo' }).click();

    const messageInput = page
      .locator('div')
      .filter({ has: page.getByText('message', { exact: true }) })
      .locator('input[type="text"]')
      .first();
    await messageInput.fill(ECHO_MESSAGE);

    await page.getByRole('button', { name: 'Run tool' }).click();
    await expect(
      page.locator('main pre.shiki-block').filter({ hasText: ECHO_MESSAGE }),
    ).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'test-results/22-stdio-echo-result.png', fullPage: true });
  });
});
