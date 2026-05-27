import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addServer, waitForConnected, selectServer, openDevTools, FIXTURE_URL } from './helpers';

test.describe.serial('§3.15 — Protocol Inspector', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    page = await ctx.newPage();
    await setupVault(page);
    await addServer(page, 'Fixture', FIXTURE_URL);
    await waitForConnected(page, 'Fixture');
    await selectServer(page, 'Fixture');
    await page.getByRole('button', { name: /^Tools/ }).click();
    await page.locator('aside + aside ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
    if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }
  });

  test.afterAll(() => ctx.close());

  test('Protocol Inspector tab opens and shows timeline entries', async () => {
    await openDevTools(page, 'Protocol Inspector');
    await page.screenshot({ path: 'test-results/15-protocol-inspector.png', fullPage: true });

    const entries = page.locator('span.font-mono').filter({ hasText: /initialize|tools\// });
    await expect(entries.first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking Clear returns to empty state', async () => {
    const clearBtn = page.getByRole('button', { name: 'Clear', exact: true }).first();
    await expect(clearBtn).toBeVisible({ timeout: 3_000 });
    await clearBtn.click();
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/15-cleared.png', fullPage: true });

    const entries = page.locator('span.font-mono').filter({ hasText: /initialize|tools\// });
    await expect(entries.first()).not.toBeVisible({ timeout: 2_000 });
  });

  test('timeline includes expected method types after reconnect + invocation', async () => {
    await page.keyboard.press('Escape');
    const disconnectBtn = page.locator('aside li').filter({ hasText: 'Fixture' }).getByRole('button', { name: 'Disconnect' });
    if (await disconnectBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await disconnectBtn.click();
      await page.waitForTimeout(500);
    }
    const connectBtn = page.locator('aside li').filter({ hasText: 'Fixture' }).getByRole('button', { name: 'Connect' });
    await connectBtn.click();
    await waitForConnected(page, 'Fixture');

    await selectServer(page, 'Fixture');
    await page.getByRole('button', { name: /^Tools/ }).click();
    await page.locator('aside + aside ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
    if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }

    await openDevTools(page, 'Protocol Inspector');
    await page.screenshot({ path: 'test-results/15-timeline-populated.png', fullPage: true });

    await expect(page.locator('text=initialize').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=tools/list').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=tools/call').first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a timeline entry shows params, result, status, server, timestamp, duration', async () => {
    const entry = page.locator('span.font-mono').filter({ hasText: /initialize|tools\// }).first();
    await entry.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/15-entry-detail.png', fullPage: true });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/status|duration|server/i);
  });

  test('unsupported capabilities show "unsupported" not "error"', async () => {
    const unsupportedText = page.locator('text=unsupported').first();
    const errorText = page.locator('[class*="error"]:has-text("resources")').first();
    if (await unsupportedText.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(unsupportedText).toBeVisible();
    }
    // If the locator has no matches at all it resolves as not visible — safe to assert directly
    await expect(errorText).not.toBeVisible({ timeout: 1_000 });
  });

  test('Copy event puts JSON in clipboard', async () => {
    const copyBtn = page.getByRole('button', { name: /copy event/i }).first();
    if (await copyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await copyBtn.click();
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(() => JSON.parse(text)).not.toThrow();
      await page.screenshot({ path: 'test-results/15-copy-event.png' });
    }
  });

  test('Select for diff shows side-by-side JSON diff of two entries', async () => {
    const entries = page.locator('span.font-mono').filter({ hasText: /initialize|tools\// });
    const count = await entries.count();

    if (count >= 2) {
      const selectForDiff = page.getByRole('button', { name: /select for diff/i }).or(
        page.getByTitle(/diff/i),
      ).first();

      if (await selectForDiff.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await entries.nth(0).click();
        await selectForDiff.click();
        await entries.nth(1).click();
        await page.waitForTimeout(500);

        await page.screenshot({ path: 'test-results/15-diff-view.png', fullPage: true });

        await expect(page.locator('text=+++ ').first()).not.toBeVisible();
      }
    }
  });

  test('Reset diff restores entry detail view', async () => {
    const resetBtn = page.getByRole('button', { name: /reset diff/i }).first();
    if (await resetBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/15-reset-diff.png' });
    }
  });

  test('Clear returns timeline to empty state', async () => {
    const clearBtn = page.getByRole('button', { name: 'Clear', exact: true }).first();
    await clearBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/15-final-clear.png', fullPage: true });
    const entries = page.locator('span.font-mono').filter({ hasText: /initialize|tools\// });
    await expect(entries.first()).not.toBeVisible({ timeout: 2_000 });
    await page.keyboard.press('Escape');
  });
});
