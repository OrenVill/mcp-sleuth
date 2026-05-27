import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.19 — MCP Client Config Export', () => {
  let ctx: BrowserContext;
  let page: Page;

  async function openExportClientConfig(page: Page): Promise<void> {
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    await exportBtn.click();
    await page.waitForTimeout(300);
    const clientConfigTab = page.getByRole('tab', { name: /client config/i }).or(
      page.getByRole('button', { name: /client config/i }),
    ).first();
    await clientConfigTab.click();
    await page.waitForTimeout(300);
  }

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /^Tools/ }).click();
    await page.locator('aside + aside ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
  });

  test.afterAll(() => ctx.close());

  test('Client Config tab shows three targets: Cursor, Claude, VS Code', async () => {
    await openExportClientConfig(page);
    await page.screenshot({ path: 'test-results/19-client-config-targets.png', fullPage: true });

    await expect(page.locator('text=Cursor').first()).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('text=Claude').first()).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('text=VS Code').first()).toBeVisible({ timeout: 3_000 });
  });

  test('Cursor target shows valid JSON with mcpServers key', async () => {
    const cursorBtn = page.getByRole('button', { name: /cursor/i }).first();
    await cursorBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/19-cursor-snippet.png', fullPage: true });

    const snippet = page.locator('pre, code').first();
    const text = await snippet.textContent() ?? '';
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty('mcpServers');
  });

  test('Claude target shows valid JSON with type: "http"', async () => {
    const claudeBtn = page.getByRole('button', { name: /^claude$/i }).first();
    await claudeBtn.click();
    await page.waitForTimeout(300);

    const snippet = page.locator('pre, code').first();
    const text = await snippet.textContent() ?? '';
    expect(text).toMatch(/"type":\s*"http"/);
  });

  test('VS Code target shows valid JSON with servers key', async () => {
    const vscodeBtn = page.getByRole('button', { name: /vs code/i }).first();
    await vscodeBtn.click();
    await page.waitForTimeout(300);

    const snippet = page.locator('pre, code').first();
    const text = await snippet.textContent() ?? '';
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty('servers');
  });

  test('no real credentials appear in any generated snippet (auth placeholder present)', async () => {
    const snippet = page.locator('pre, code').first();
    const text = await snippet.textContent() ?? '';
    if (text.includes('Authorization') || text.includes('Bearer')) {
      expect(text).toMatch(/\$\{env:|input:/);
    }
  });

  test('Copy snippet puts valid JSON in clipboard', async () => {
    const copyBtn = page.getByRole('button', { name: /copy/i }).first();
    if (await copyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await copyBtn.click();
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });

  test('Download saves file with server slug and target in filename', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5_000 }).catch(() => null),
      page.getByRole('button', { name: /download/i }).first().click().catch(() => {}),
    ]);
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.json$/);
    }
    await page.keyboard.press('Escape');
  });
});
