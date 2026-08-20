import { test, expect } from '@playwright/test';
import { closeApp, launchApp, setupVault, type LaunchedApp } from './helpers';

test.describe.serial('Electron — app chrome', () => {
  let launched: LaunchedApp;

  test.beforeAll(async () => {
    test.setTimeout(60_000);
    launched = await launchApp();
    await setupVault(launched.page);
  });

  test.afterAll(async () => closeApp(launched));

  test('external links never open a second Electron window', async () => {
    // Deliberately an unsafe scheme: it exercises setWindowOpenHandler's deny
    // path without spawning anything. A real https link would hand off to the
    // OS browser, which would pop a window onto the developer's desktop mid-run
    // (this machine is WSL, where handoff goes to the Windows default browser).
    // The scheme filter itself is covered in electron/externalLinks.test.js.
    const before = await launched.app.evaluate(async ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().length,
    );

    await launched.page.evaluate(() => window.open('file:///etc/passwd', '_blank'));
    await launched.page.waitForTimeout(800);

    const after = await launched.app.evaluate(async ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().length,
    );
    expect(after).toBe(before);
  });

  test('the window paints its own rounded shell', async () => {
    // The window is transparent, so these are what give it a window shape
    // rather than a full-bleed web page.
    const shell = await launched.page.evaluate(() => {
      const root = getComputedStyle(document.getElementById('root')!);
      return {
        radius: root.borderRadius,
        borderWidth: root.borderTopWidth,
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });

    expect(shell.radius).toBe('10px');
    expect(shell.borderWidth).toBe('1px');
    // A painted body would square off the corners it sits behind.
    expect(shell.bodyBg).toBe('rgba(0, 0, 0, 0)');
  });

  test('the shell squares off when maximized', async () => {
    await launched.page.getByRole('button', { name: 'Maximize' }).click();

    await expect
      .poll(
        () =>
          launched.page.evaluate(
            () => getComputedStyle(document.getElementById('root')!).borderRadius,
          ),
        { timeout: 5_000 },
      )
      .toBe('0px');

    await launched.page.getByRole('button', { name: 'Restore' }).click();
    await expect
      .poll(
        () =>
          launched.page.evaluate(
            () => getComputedStyle(document.getElementById('root')!).borderRadius,
          ),
        { timeout: 5_000 },
      )
      .toBe('10px');
  });

  test('the header drops its web-page affordances', async () => {
    const header = await launched.page.evaluate(() => {
      const el = document.querySelector('.app-header');
      const gh = el?.querySelector('a[href*="github.com"]');
      return {
        text: el?.textContent ?? '',
        githubLabel: gh?.textContent?.trim() ?? null,
        githubHasIcon: !!gh?.querySelector('svg'),
      };
    });

    expect(header.text).not.toContain('connect · list · invoke');
    // Icon only — a labelled link reads as a website nav item.
    expect(header.githubLabel).toBe('');
    expect(header.githubHasIcon).toBe(true);
  });
});
