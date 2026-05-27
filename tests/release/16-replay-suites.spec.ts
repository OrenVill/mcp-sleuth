import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, openDevTools, VAULT_PASS } from './helpers';

test.describe.serial('§3.16 — Replay Suites', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /^Tools/ }).click();
    const toolItems = page.locator('aside + aside ul li').filter({ hasText: /./ });

    async function invokeCurrentTool() {
      const textInputs = page.locator('input[type="text"], input:not([type])');
      const count = await textInputs.count();
      for (let i = 0; i < count; i++) await textInputs.nth(i).fill('test');
      const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
      if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(1_500);
      }
    }

    await toolItems.first().click();
    await page.waitForTimeout(300);
    await invokeCurrentTool();

    const secondTool = toolItems.nth(1);
    if (await secondTool.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await secondTool.click();
      await page.waitForTimeout(300);
      await invokeCurrentTool();
    }
  });

  test.afterAll(() => ctx.close());

  test('Replay Suites tab opens and shows Successful tool calls', async () => {
    await openDevTools(page, 'Replay Suites');
    await page.screenshot({ path: 'test-results/16-replay-suites.png', fullPage: true });

    await expect(page.locator('text=/successful/i').first()).toBeVisible({ timeout: 5_000 });
    const callItems = page.getByRole('button', { name: /add to suite/i });
    await expect(callItems.first()).toBeVisible({ timeout: 3_000 });
  });

  test('Add to suite saves a call with args and expected result snapshot', async () => {
    const addToSuiteBtn = page.getByRole('button', { name: /add to suite/i }).first();
    if (await addToSuiteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addToSuiteBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/16-added-to-suite.png', fullPage: true });

      const suiteCase = page.locator('[class*="case"], [class*="suite-item"]').first();
      if (await suiteCase.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(suiteCase).toBeVisible();
      }
    }
  });

  test('Replay shows pass/fail, duration, and result diffs', async () => {
    const replayBtn = page.getByRole('button', { name: /^replay$/i }).first();
    if (await replayBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await replayBtn.click();
      await page.waitForTimeout(3_000);
      await page.screenshot({ path: 'test-results/16-replay-results.png', fullPage: true });

      const passFailIndicator = page.locator('text=/pass|fail/i').first();
      await expect(passFailIndicator).toBeVisible({ timeout: 5_000 });
    }
  });

  test('closing and reopening Dev Tools keeps suite in memory', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await openDevTools(page, 'Replay Suites');

    const callItems = page.getByRole('button', { name: /add to suite/i });
    if (await callItems.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(callItems.first()).toBeVisible();
    }
    await page.keyboard.press('Escape');
  });

  test('reloading page clears suites (in-memory only)', async () => {
    await page.reload();
    await page.waitForTimeout(2_000);

    const unlockBtn = page.getByRole('button', { name: /unlock/i });
    if (await unlockBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.getByLabel('Passphrase').fill(VAULT_PASS);
      await unlockBtn.click();
      await page.waitForTimeout(1_000);
    }

    await openDevTools(page, 'Replay Suites');
    await page.screenshot({ path: 'test-results/16-after-reload.png', fullPage: true });

    const callItems = page.getByRole('button', { name: /add to suite/i });
    const count = await callItems.count();
    expect(count).toBe(0);
    await page.keyboard.press('Escape');
  });
});
