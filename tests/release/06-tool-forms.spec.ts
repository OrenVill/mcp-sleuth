import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.6 — Tool forms — all input types', () => {
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

  async function selectFirstToolWithParam(
    page: Page,
    paramType: string,
  ): Promise<boolean> {
    const toolItems = page.locator('aside + aside ul li').filter({ hasText: /./ });
    const count = await toolItems.count();
    for (let i = 0; i < count; i++) {
      await toolItems.nth(i).click();
      await page.waitForTimeout(300);
      const input = page.locator(`input[type="${paramType}"]`).first();
      const select = paramType === 'select' ? page.locator('select').first() : null;
      const textarea = paramType === 'textarea' ? page.locator('textarea').first() : null;

      if (paramType === 'select' && select && await select.isVisible().catch(() => false)) return true;
      if (paramType === 'textarea' && textarea && await textarea.isVisible().catch(() => false)) return true;
      if (paramType !== 'select' && paramType !== 'textarea' && await input.isVisible().catch(() => false)) return true;
    }
    return false;
  }

  test('string parameter renders a text input', async () => {
    const found = await selectFirstToolWithParam(page, 'text');
    expect(found, 'No tool with a text input found — fixture server must expose a string param tool').toBe(true);
    await page.screenshot({ path: 'test-results/06-string-param.png' });
  });

  test('number parameter renders a number input', async () => {
    const found = await selectFirstToolWithParam(page, 'number');
    expect(found, 'No tool with a number input found').toBe(true);
    await page.screenshot({ path: 'test-results/06-number-param.png' });
  });

  test('boolean parameter renders a checkbox or toggle', async () => {
    const toolItems = page.locator('aside + aside ul li').filter({ hasText: /./ });
    const count = await toolItems.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      await toolItems.nth(i).click();
      await page.waitForTimeout(300);
      // Booleans may render as checkbox OR as a boolean dropdown (select with true/false)
      const checkbox = page.locator('input[type="checkbox"]').first();
      const boolSelect = page.locator('select').filter({ hasText: /true|false/i }).first();
      if (await checkbox.isVisible().catch(() => false)) { found = true; break; }
      if (await boolSelect.isVisible().catch(() => false)) { found = true; break; }
    }
    // Skip rather than fail if this fixture server has no boolean-param tool
    if (!found) { test.skip(true, 'No boolean-param tool on this fixture server'); return; }
    await page.screenshot({ path: 'test-results/06-boolean-param.png' });
  });

  test('enum parameter renders a select dropdown with options', async () => {
    const found = await selectFirstToolWithParam(page, 'select');
    expect(found, 'No tool with an enum select found').toBe(true);
    const select = page.locator('select').first();
    const optionCount = await select.locator('option').count();
    expect(optionCount).toBeGreaterThan(1);
    await page.screenshot({ path: 'test-results/06-enum-param.png' });
  });

  test('object/array parameter renders a textarea that accepts typed JSON', async () => {
    const found = await selectFirstToolWithParam(page, 'textarea');
    if (!found) { test.skip(true, 'No object/array-param tool on this fixture server'); return; }

    const textarea = page.locator('textarea').first();
    await textarea.click();
    await textarea.fill('{"key": "value"}');
    const value = await textarea.inputValue();
    expect(value).toBe('{"key": "value"}');
    await page.screenshot({ path: 'test-results/06-object-param.png' });
  });
});
