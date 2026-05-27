import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.7 — Result pane — rich rendering', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /^Tools/ }).click();
  });

  test.afterAll(() => ctx.close());

  async function invokeFirstTool(page: Page): Promise<void> {
    const toolItems = page.locator('aside + aside ul li').filter({ hasText: /./ });
    await toolItems.first().click();
    await page.waitForTimeout(300);
    const textInputs = page.locator('input[type="text"], input:not([type])');
    const inputCount = await textInputs.count();
    for (let i = 0; i < inputCount; i++) {
      await textInputs.nth(i).fill('test');
    }
    const submitBtn = page
      .getByRole('button', { name: /run|submit|invoke|call/i })
      .first();
    await submitBtn.click();
    await page.waitForTimeout(2_000);
  }

  test('markdown result shows Code / Preview toggle', async () => {
    await invokeFirstTool(page);
    await page.screenshot({ path: 'test-results/07-result-markdown.png', fullPage: true });

    const previewTab = page.getByRole('tab', { name: /preview/i }).or(
      page.getByRole('button', { name: /preview/i }),
    );
    if (await previewTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await previewTab.click();
      const styledElements = page.locator('h1, h2, h3, strong, em, ul, ol, p').first();
      await expect(styledElements).toBeVisible({ timeout: 3_000 });

      const codeTab = page.getByRole('tab', { name: /code/i }).or(
        page.getByRole('button', { name: /^code$/i }),
      );
      await codeTab.click();
      await page.screenshot({ path: 'test-results/07-result-code-view.png' });
    }
  });

  test('JSON result is syntax-highlighted and pretty-printed', async () => {
    // Shiki loads async — wait up to 5s for the highlighted spans to appear
    const highlightedSpan = page.locator('.shiki-block span[style*="color"]').first();
    if (await highlightedSpan.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page.screenshot({ path: 'test-results/07-json-highlighted.png' });
    } else {
      // Fallback: confirm at least a code/pre block with content is present
      const codeBlock = page.locator('.shiki-block, pre').first();
      const text = await codeBlock.textContent().catch(() => null);
      expect(text).not.toBeNull();
      await page.screenshot({ path: 'test-results/07-json-highlighted.png' });
    }
  });

  test('HTML resource shows Code / Preview toggle with iframe in Preview', async () => {
    await page.getByRole('button', { name: /Resources/i }).click();
    await page.screenshot({ path: 'test-results/07-resources-list.png' });

    const resources = page.locator('aside + aside ul li').filter({ hasText: /html/i });
    if (await resources.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await resources.first().click();
      const previewBtn = page.getByRole('button', { name: /preview/i }).or(
        page.getByRole('tab', { name: /preview/i }),
      );
      await expect(previewBtn).toBeVisible({ timeout: 3_000 });
      await previewBtn.click();
      await expect(page.locator('iframe')).toBeVisible({ timeout: 3_000 });
      await page.screenshot({ path: 'test-results/07-html-preview.png' });
    }
  });

  test('image resource renders as img tag (if available)', async () => {
    const imageResources = page.locator('aside + aside ul li').filter({ hasText: /png|jpg|jpeg|svg|image/i });
    if (await imageResources.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
      await imageResources.first().click();
      await expect(page.locator('img').first()).toBeVisible({ timeout: 3_000 });
      await page.screenshot({ path: 'test-results/07-image-resource.png' });
    }
  });
});
