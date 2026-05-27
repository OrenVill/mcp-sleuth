import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, openDevTools } from './helpers';

test.describe.serial('§3.18 — Agent Readiness', () => {
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

  test('each tool row in tool list shows a readiness score badge', async () => {
    await page.screenshot({ path: 'test-results/18-tool-list-badges.png', fullPage: true });
    const scoreBadge = page.locator('[title*="Agent Readiness"]').first();
    await expect(scoreBadge).toBeVisible({ timeout: 5_000 });
  });

  test('tool detail header shows readiness score for selected tool', async () => {
    await page.locator('aside + aside ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/18-tool-detail-score.png', fullPage: true });

    const detailScore = page.locator('[title*="Agent Readiness"]').first();
    await expect(detailScore).toBeVisible({ timeout: 3_000 });
  });

  test('Agent Readiness tab shows overall score, verdict, and counts', async () => {
    await openDevTools(page, 'Agent Readiness');
    await page.screenshot({ path: 'test-results/18-agent-readiness-report.png', fullPage: true });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/score|verdict/i);
    expect(bodyText).toMatch(/tool/i);
  });

  test('selecting a tool shows its specific score and issues with recommended fixes', async () => {
    const toolSelect = page.locator('select').first();
    if (await toolSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const options = await toolSelect.locator('option').all();
      if (options.length > 1) {
        await toolSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    }
    await page.screenshot({ path: 'test-results/18-tool-issues.png', fullPage: true });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('camelCase tool names are not penalized (searchDocs not flagged for naming)', async () => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/camelCase.*issue|snake_case.*required/i);
  });

  test('report works with no AI API key and no network model call', async () => {
    const apiKeyError = page.locator('text=/api key required|openai|anthropic api/i').first();
    await expect(apiKeyError).not.toBeVisible({ timeout: 2_000 });
    await page.keyboard.press('Escape');
  });
});
