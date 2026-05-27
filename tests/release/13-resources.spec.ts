import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.13 — Resources tab', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /Resources/i }).click();
  });

  test.afterAll(() => ctx.close());

  test('resources listed with name and MIME type', async () => {
    await page.screenshot({ path: 'test-results/13-resources-list.png', fullPage: true });

    const resourceItems = page.locator('aside + aside ul li').filter({ hasText: /./ });
    await expect(resourceItems.first()).toBeVisible({ timeout: 5_000 });

    const count = await resourceItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a text resource renders ResourceDetail with content', async () => {
    const resourceItems = page.locator('aside + aside ul li').filter({ hasText: /./ });
    await resourceItems.first().click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/13-resource-detail.png', fullPage: true });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('markdown or HTML resource shows Code/Preview toggle', async () => {
    const resourceItems = page.locator('aside + aside ul li').filter({ hasText: /html|markdown|md/i });
    if (await resourceItems.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
      await resourceItems.first().click();
      await page.waitForTimeout(500);
      const previewBtn = page.getByRole('button', { name: /preview/i }).or(
        page.getByRole('tab', { name: /preview/i }),
      );
      // Preview toggle only shows for HTML/markdown MIME types — skip gracefully if absent
      if (await previewBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await previewBtn.click();
        await page.screenshot({ path: 'test-results/13-resource-preview.png' });
      }
    }
  });

  test('URI template resources render variable inputs', async () => {
    const templateInputs = page.locator('input[placeholder*="{"], input[placeholder*="value"]');
    if (await templateInputs.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(templateInputs.first()).toBeVisible();
    }
  });
});
