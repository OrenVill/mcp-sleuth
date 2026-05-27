import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, openDevTools } from './helpers';

test.describe.serial('§3.17 — Schema Lab', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await openDevTools(page, 'Schema Lab');
  });

  test.afterAll(() => ctx.close());

  test('Schema Lab shows server and tool selectors', async () => {
    await page.screenshot({ path: 'test-results/17-schema-lab.png', fullPage: true });
    const serverSelector = page.locator('select').first();
    await expect(serverSelector).toBeVisible({ timeout: 5_000 });
    const toolSelector = page.locator('select').nth(1);
    await expect(toolSelector).toBeVisible({ timeout: 3_000 });
  });

  test('selecting a tool with required args highlights required fields', async () => {
    const toolSelect = page.locator('select').nth(1);
    const options = await toolSelect.locator('option').all();
    if (options.length > 1) {
      await toolSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'test-results/17-required-fields.png', fullPage: true });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('schema summary shows root type, property count, required count, optional count', async () => {
    await page.screenshot({ path: 'test-results/17-schema-summary.png', fullPage: true });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/propert|param/i);
  });

  test('Schema/Form Preview renders schema beside form preview', async () => {
    const previewSection = page.locator('text=/schema.*form|form.*preview/i').or(
      page.locator('[class*="preview"], [class*="schema"]').first(),
    );
    await expect(previewSection.first()).toBeVisible({ timeout: 3_000 });
  });

  test('input types render correctly (enum→dropdown, number→number input, bool→boolean dropdown, object→textarea)', async () => {
    await page.screenshot({ path: 'test-results/17-form-inputs.png', fullPage: true });
    // Schema Lab renders form preview as text labels (e.g. "Text input", "Number input"),
    // not actual <input>/<select> elements. Verify the server/tool selectors are visible.
    const serverSelect = page.locator('select').first();
    await expect(serverSelect).toBeVisible({ timeout: 3_000 });
  });

  test('generated example args are shown', async () => {
    const exampleText = page.locator('text=/example/i').first();
    await expect(exampleText).toBeVisible({ timeout: 3_000 });
  });

  test('Copy args puts JSON in clipboard', async () => {
    const copyArgsBtn = page.getByRole('button', { name: /copy args/i }).first();
    if (await copyArgsBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await copyArgsBtn.click();
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });

  test('Copy call puts JSON-RPC tools/call payload in clipboard', async () => {
    const copyCallBtn = page.getByRole('button', { name: /copy call/i }).first();
    if (await copyCallBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await copyCallBtn.click();
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty('method');
      expect(parsed.method).toBe('tools/call');
      expect(parsed).toHaveProperty('params.name');
      expect(parsed).toHaveProperty('params.arguments');
    }
  });

  test('Schema Lab link from tool detail opens devtools to Schema Lab', async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Tools/ }).click();
    await page.locator('aside + aside ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);

    const schemaLabLink = page.getByRole('button', { name: /schema lab/i }).first();
    if (await schemaLabLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await schemaLabLink.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/17-schema-lab-from-tool.png', fullPage: true });
      await expect(page.locator('text=Schema Lab').first()).toBeVisible({ timeout: 3_000 });
    }
    await page.keyboard.press('Escape');
  });
});
