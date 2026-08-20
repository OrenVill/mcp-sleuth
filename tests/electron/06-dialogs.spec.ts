import { test, expect } from '@playwright/test';
import { rmSync } from 'node:fs';
import {
  closeApp,
  launchApp,
  setupVault,
  VAULT_PASS,
  type LaunchedApp,
} from './helpers';

test.describe.serial('Electron — in-app dialogs', () => {
  let launched: LaunchedApp;
  let dataDir: string;
  const nativeDialogs: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(90_000);

    // Create a vault, then relaunch against the same data dir so the app comes
    // up on the unlock screen — the only place Reset vault is reachable.
    const first = await launchApp();
    dataDir = first.dataDir;
    await setupVault(first.page);
    await closeApp(first, { keepDataDir: true });

    launched = await launchApp({ dataDir });
    // A native window.confirm surfaces to Playwright as a dialog event.
    launched.page.on('dialog', (d) => {
      nativeDialogs.push(d.message());
      void d.dismiss();
    });
    await launched.page.getByRole('button', { name: 'Unlock' }).waitFor({ timeout: 20_000 });
  });

  test.afterAll(async () => {
    await closeApp(launched, { keepDataDir: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('Reset vault sits with the card, not pinned to the window bottom', async () => {
    const geometry = await launched.page.evaluate(() => {
      const form = document.querySelector('form')!;
      const reset = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Reset vault'),
      )!;
      return {
        gap: Math.round(reset.getBoundingClientRect().top - form.getBoundingClientRect().bottom),
        fromBottom: Math.round(window.innerHeight - reset.getBoundingClientRect().bottom),
      };
    });

    // It used to stretch to the bottom because VaultUnlock owned `h-full`.
    expect(geometry.gap).toBeLessThan(40);
    expect(geometry.fromBottom).toBeGreaterThan(60);
  });

  test('confirming a reset uses an in-app dialog, not browser chrome', async () => {
    await launched.page.getByRole('button', { name: 'Reset vault' }).click();

    const dialog = launched.page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText('cannot be undone');
    // window.confirm would have surfaced as a Playwright dialog event.
    expect(nativeDialogs).toEqual([]);
  });

  test('cancelling leaves the vault alone', async () => {
    await launched.page.getByRole('button', { name: 'Cancel' }).click();

    await expect(launched.page.getByRole('alertdialog')).toBeHidden();
    await expect(launched.page.getByRole('button', { name: 'Unlock' })).toBeVisible();
  });

  test('Escape dismisses the dialog', async () => {
    await launched.page.getByRole('button', { name: 'Reset vault' }).click();
    await expect(launched.page.getByRole('alertdialog')).toBeVisible();

    await launched.page.keyboard.press('Escape');
    await expect(launched.page.getByRole('alertdialog')).toBeHidden();
  });

  test('confirming actually resets the vault', async () => {
    await launched.page.getByRole('button', { name: 'Reset vault' }).click();
    await launched.page.getByRole('alertdialog').getByRole('button', { name: 'Reset vault' }).click();

    // Back to first-run setup, and the old passphrase is gone with it.
    await expect(launched.page.getByRole('button', { name: 'Create vault' })).toBeVisible({
      timeout: 15_000,
    });
    expect(VAULT_PASS).toBeTruthy();
  });
});
