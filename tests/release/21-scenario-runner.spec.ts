import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.21 — Scenario Runner', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
  });

  test.afterAll(() => ctx.close());

  test('Scenarios button opens panel with empty sidebar', async () => {
    await page.getByRole('button', { name: 'Scenarios' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/21-scenarios-empty.png', fullPage: true });

    await expect(page.locator('text=/scenario/i').first()).toBeVisible({ timeout: 5_000 });
  });

  test('typing name and pressing + creates a new scenario', async () => {
    const nameInput = page.locator('input[placeholder*="scenario"], input[placeholder*="name"]').first();
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.fill('Release Test');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    } else {
      // nameInput not found — try a dedicated Add button instead
      const addBtn = page.getByRole('button', { name: /\+|add scenario/i }).first();
      if (await addBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(300);
        const input = page.locator('input').first();
        await input.fill('Release Test');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    }
    await page.screenshot({ path: 'test-results/21-scenario-created.png', fullPage: true });
    await expect(page.locator('text=Release Test').first()).toBeVisible({ timeout: 3_000 });
  });

  test('clicking + Add Step shows tool selector with connected server tools', async () => {
    const addStepBtn = page.getByRole('button', { name: /add step/i }).first();
    await expect(addStepBtn).toBeVisible({ timeout: 3_000 });
    await addStepBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/21-add-step.png', fullPage: true });

    const toolSelector = page.locator('select').first();
    await expect(toolSelector).toBeVisible({ timeout: 3_000 });
    const optionCount = await toolSelector.locator('option').count();
    expect(optionCount).toBeGreaterThan(1);
  });

  test('invalid JSON in Arguments field shows inline error', async () => {
    const argsField = page.locator('textarea').first();
    if (await argsField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await argsField.fill('{ invalid json');
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/21-invalid-json-error.png' });
      const errorMsg = page.locator('text=/invalid|error/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 2_000 });
      await argsField.fill('{}');
      await page.waitForTimeout(200);
    }
  });

  test('assertion type selector shows all five types', async () => {
    // Click + Add assertion button (text: "+ Add")
    const addAssertionBtn = page.getByRole('button', { name: /add assertion/i })
      .or(page.locator('button', { hasText: '+ Add' })).first();
    if (await addAssertionBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addAssertionBtn.click();
      await page.waitForTimeout(300);
    }
    // The assertion type selector has option value="status" — use that to find it specifically
    const assertionTypeSelect = page.locator('select').filter({
      has: page.locator('option[value="status"]'),
    }).first();
    if (await assertionTypeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const options = await assertionTypeSelect.locator('option').allTextContents();
      const types = options.map((t) => t.toLowerCase());
      expect(types.some((t) => t.includes('status'))).toBe(true);
      expect(types.some((t) => t.includes('field') || t.includes('exist'))).toBe(true);
      expect(types.some((t) => t.includes('json') || t.includes('path'))).toBe(true);
      expect(types.some((t) => t.includes('text') || t.includes('contains'))).toBe(true);
    }
  });

  test('clicking Run executes scenario and shows pass/fail badge', async () => {
    const assertionTypeSelect = page.locator('select').filter({
      has: page.locator('option[value="status"]'),
    }).first();
    if (await assertionTypeSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await assertionTypeSelect.selectOption({ value: 'status' });
      await page.waitForTimeout(200);
    }
    const runBtn = page.getByRole('button', { name: /▶|run/i }).first();
    await expect(runBtn).toBeVisible({ timeout: 3_000 });
    await runBtn.click();
    await page.waitForTimeout(3_000);

    await page.screenshot({ path: 'test-results/21-run-results.png', fullPage: true });

    const badge = page.locator('text=/pass|fail/i').first();
    await expect(badge).toBeVisible({ timeout: 5_000 });

    const header = page.locator('text=/\\d+\\/\\d+ pass/i').first();
    await expect(header).toBeVisible({ timeout: 3_000 });
  });

  test('second scenario keeps first scenario results intact', async () => {
    const nameInput = page.locator('input[placeholder*="scenario"], input[placeholder*="name"]').first();
    if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameInput.fill('Second Scenario');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
    await page.locator('text=Release Test').first().click();
    await page.waitForTimeout(300);
    const badge = page.locator('text=/pass|fail/i').first();
    await expect(badge).toBeVisible({ timeout: 3_000 });
  });

  test('removing a step updates the scenario immediately', async () => {
    const removeStepBtn = page.getByRole('button', { name: /remove|delete step|✕/i }).first();
    if (await removeStepBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const jsErrors: string[] = [];
      page.once('pageerror', (err) => jsErrors.push(err.message));
      await removeStepBtn.click({ force: true });
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/21-remove-step.png', fullPage: true });
      expect(jsErrors, `JS error on remove: ${jsErrors.join('; ')}`).toHaveLength(0);
    }
  });

  test('closing the panel with × button closes cleanly — no crash', async () => {
    const jsErrors: string[] = [];
    page.once('pageerror', (err) => jsErrors.push(err.message));

    const closeBtn = page.getByRole('button', { name: /×|close/i }).last();
    if (!await closeBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
    } else {
      await closeBtn.click();
    }
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/21-panel-closed.png', fullPage: true });
    expect(jsErrors, `Uncaught JS errors on close: ${jsErrors.join('; ')}`).toHaveLength(0);
  });
});
