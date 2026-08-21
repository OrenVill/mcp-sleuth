import { expect, test } from '@playwright/test';
import { setupVault } from './helpers';

/**
 * §3.25 — the update notifier is desktop-only.
 *
 * The browser build is served either by Vite or by the CLI's static server, and
 * both update through npm rather than an installer. Its host reports no update
 * channel at all, so neither the banner nor the version pill exists here — this
 * spec is the guard against a desktop-only surface leaking into the web build.
 */
test.describe('§3.25 update notifier — browser build', () => {
  test('renders no update banner', async ({ page }) => {
    await setupVault(page);

    await expect(page.getByTestId('update-banner')).toHaveCount(0);
  });

  test('renders no version pill', async ({ page }) => {
    await setupVault(page);

    await expect(page.getByTestId('version-pill')).toHaveCount(0);
  });

  test('never calls a release feed', async ({ page }) => {
    const feedRequests: string[] = [];
    page.on('request', (request) => {
      if (/releases\/latest|api\.github\.com/.test(request.url())) feedRequests.push(request.url());
    });

    await setupVault(page);
    // Past the delay the desktop build's startup check waits out.
    await page.waitForTimeout(6000);

    expect(feedRequests).toEqual([]);
  });
});
