import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

test.describe.serial('Electron — native persistence', () => {
  let launched: LaunchedApp;

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    launched = await launchApp();
    await setupVault(launched.page);
  });

  test.afterAll(async () => closeApp(launched));

  test('writes vault.json into the shared data directory, not IndexedDB', async () => {
    await expect
      .poll(() => existsSync(join(launched.dataDir, 'vault.json')), { timeout: 15_000 })
      .toBe(true);

    // Same envelope format the CLI reads — the file must stay portable.
    const envelope = JSON.parse(readFileSync(join(launched.dataDir, 'vault.json'), 'utf8'));
    expect(envelope).toHaveProperty('cipher');
    expect(envelope).toHaveProperty('kdf');
  });

  test('the app header acts as the title bar without trapping its buttons', async () => {
    const info = await launched.page.evaluate(() => {
      const header = document.querySelector('.app-header');
      const button = header?.querySelector('button');
      return {
        header: header ? getComputedStyle(header).getPropertyValue('-webkit-app-region') : null,
        button: button ? getComputedStyle(button).getPropertyValue('-webkit-app-region') : null,
        strip: !!document.querySelector('.app-drag-strip'),
      };
    });

    expect(info.header).toBe('drag');
    // Without no-drag the header buttons would be unclickable.
    expect(info.button).toBe('no-drag');
    // The strip is only for screens with no header.
    expect(info.strip).toBe(false);
  });

  test('does not write a device key when the platform has no secure store', () => {
    // This machine has no keyring, so auto-unlock must be declined rather than
    // sealing a passphrase with the insecure basic_text backend.
    const files = readdirSync(launched.dataDir);
    expect(files).not.toContain('device-key.bin');
  });

  test('persists servers across a window reload', async () => {
    const page = launched.page;
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Name').fill(SERVER_NAME);
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: 'Add & connect' }).click();
    await waitForConnected(page, SERVER_NAME);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // The vault is passphrase-protected here (no keyring), so unlock first.
    await page.getByLabel(/passphrase/i).first().fill('test-electron-pass-123');
    await page.getByRole('button', { name: /unlock/i }).click();

    await expect(page.locator('aside li').filter({ hasText: SERVER_NAME })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('writes app data as gzip that the CLI can read', async () => {
    const page = launched.page;
    await selectServer(page, SERVER_NAME);

    // Servers persist across a reload but connections do not — reconnect first.
    const connect = page.getByRole('button', { name: 'Connect' }).first();
    if (await connect.isVisible().catch(() => false)) {
      await connect.click();
      await waitForConnected(page, SERVER_NAME);
    }

    await page.getByRole('button', { name: /^Tools/ }).click();
    await page.locator('aside + aside ul li').filter({ hasText: 'echo_markdown' }).first().click();

    // A completed tool call appends to call history, which is app data
    // (src/lib/history.ts:24 -> patchAppData).
    await paramInput(page, 'message').fill('persist me');
    await page.getByRole('button', { name: 'Run tool' }).click();
    await expect(page.locator('main').getByText('persist me').first()).toBeVisible({
      timeout: 20_000,
    });

    await expect
      .poll(() => existsSync(join(launched.dataDir, 'data.gz')), { timeout: 15_000 })
      .toBe(true);

    // gzip magic bytes — app-data-handler.js reads the same format.
    const buf = readFileSync(join(launched.dataDir, 'data.gz'));
    expect(buf[0]).toBe(0x1f);
    expect(buf[1]).toBe(0x8b);
  });

  test('the save dialog writes a real file', async () => {
    const page = launched.page;
    await page.getByRole('button', { name: 'Export' }).click();
    const download = page.getByRole('button', { name: /download/i }).first();
    await download.click();

    await expect
      .poll(() => readdirSync(launched.saveDir).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });
});
