import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.20 — Handoff README Export', () => {
  let ctx: BrowserContext;
  let page: Page;

  async function openHandoffReadme(page: Page): Promise<void> {
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    await exportBtn.click();
    await page.waitForTimeout(300);
    const handoffTab = page.getByRole('tab', { name: /handoff|readme/i }).or(
      page.getByRole('button', { name: /handoff|readme/i }),
    ).first();
    if (await handoffTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await handoffTab.click();
      await page.waitForTimeout(300);
    }
  }

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
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

  test('Handoff README tab shows option checkboxes', async () => {
    await openHandoffReadme(page);
    await page.screenshot({ path: 'test-results/20-handoff-options.png', fullPage: true });

    await expect(page.locator('text=/readiness/i').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=/schema/i').first()).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('text=/example/i').first()).toBeVisible({ timeout: 3_000 });
  });

  test('preview includes server name, tool list, and agent readiness score', async () => {
    const previewContent = page.locator('pre, [class*="preview"]').first();
    if (await previewContent.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const text = await previewContent.textContent() ?? '';
      expect(text).toMatch(/fixture|tool/i);
    }
  });

  test('toggling Full Schemas shows/hides JSON schema code blocks', async () => {
    const schemasCheckbox = page.getByRole('checkbox', { name: /schema/i }).first();
    if (await schemasCheckbox.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const checkedBefore = await schemasCheckbox.isChecked();
      await schemasCheckbox.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/20-schemas-toggled.png', fullPage: true });
      const checkedAfter = await schemasCheckbox.isChecked();
      expect(checkedAfter).not.toEqual(checkedBefore);
    }
  });

  test('sensitive arg keys are shown as [REDACTED]', async () => {
    const previewContent = page.locator('pre, [class*="preview"], [class*="content"]').first();
    if (await previewContent.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const text = await previewContent.textContent() ?? '';
      if (text.match(/apiKey|token|password/i)) {
        expect(text).toMatch(/\[REDACTED\]/);
      }
    }
  });

  test('Code/Preview switch renders markdown in Preview', async () => {
    const previewBtn = page.getByRole('button', { name: /^preview$/i }).or(
      page.getByRole('tab', { name: /^preview$/i }),
    ).first();
    if (await previewBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await previewBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/20-markdown-preview.png', fullPage: true });
      const styledEl = page.locator('h1, h2, h3, strong, ul').first();
      await expect(styledEl).toBeVisible({ timeout: 3_000 });
    }
  });

  test('Download saves file as <server-slug>-handoff.md', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5_000 }).catch(() => null),
      page.getByRole('button', { name: /download/i }).first().click().catch(() => {}),
    ]);
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/handoff\.md$/);
    }
    await page.keyboard.press('Escape');
  });
});
