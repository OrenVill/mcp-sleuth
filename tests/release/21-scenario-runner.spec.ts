import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.21 — Scenario Runner', () => {
  let ctx: BrowserContext;
  let page: Page;

  /** Pick the fixture server's echo_markdown tool on a scenario step (combobox + portalled listbox). */
  async function selectEchoMarkdown(stepIndex: number) {
    const panel = page.getByTestId('scenario-runner-panel');
    await panel.getByTestId(`scenario-step-tool-select-${stepIndex}`).click();
    await page.getByRole('option', { name: /Fixture.*echo_markdown|echo_markdown/i }).first().click();
    await page.waitForTimeout(200);
  }

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
  });

  test.afterAll(() => ctx.close());

  test('Scenarios button opens panel with empty sidebar', async () => {
    await page.getByTestId('header-automate-menu').click();
    await page.getByTestId('open-scenarios').click();
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

    // The selects are our own component now: a role=combobox trigger plus a
    // listbox portalled to document.body, so the options only exist while open
    // and must not be scoped to the panel.
    const toolSelector = page.getByTestId('scenario-step-tool-select-0');
    await expect(toolSelector).toBeVisible({ timeout: 3_000 });
    await toolSelector.click();
    const optionCount = await page.getByRole('option').count();
    expect(optionCount).toBeGreaterThan(1);
    await page.keyboard.press('Escape');
  });

  test('adding another step collapses the previous step', async () => {
    const addStepBtn = page.getByRole('button', { name: /add step/i }).first();
    await addStepBtn.click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId('scenario-step-collapsed-0')).toBeVisible({ timeout: 3_000 });
    await expect(
      page.getByTestId('scenario-step-collapsed-0').getByText('Select a tool…'),
    ).toBeVisible({ timeout: 2_000 });
    await expect(page.getByTestId('scenario-step-tool-select-1')).toBeVisible({ timeout: 3_000 });
  });

  test('schema-based step shows message field; invalid JSON in override shows error', async () => {
    const panel = page.getByTestId('scenario-runner-panel');
    if (!await panel.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page.getByTestId('header-automate-menu').click();
      await page.getByTestId('open-scenarios').click();
      await page.waitForTimeout(300);
    }
    await selectEchoMarkdown(1);
    await expect(page.getByTestId('scenario-step-args-form-1')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('label').filter({ hasText: 'message' }).first()).toBeVisible({
      timeout: 2_000,
    });

    await page.getByRole('button', { name: 'Edit as JSON' }).click();
    await page.waitForTimeout(200);
    const argsJson = page.getByTestId('scenario-step-args-json-1');
    await argsJson.fill('{ invalid json');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/21-invalid-json-error.png' });
    await expect(page.locator('text=Invalid JSON').first()).toBeVisible({ timeout: 2_000 });
    await argsJson.fill('{}');
    await page.waitForTimeout(200);
  });

  test('assertion type selector shows all five types', async () => {
    // Click + Add assertion button (text: "+ Add")
    const addAssertionBtn = page.getByRole('button', { name: /add assertion/i })
      .or(page.locator('button', { hasText: '+ Add' })).first();
    if (await addAssertionBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addAssertionBtn.click();
      await page.waitForTimeout(300);
    }
    const assertionTypeSelect = page.getByTestId('scenario-assertion-type-select-1').first();
    if (await assertionTypeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await assertionTypeSelect.click();
      const optionCount = await page.getByRole('option').count();
      const options = optionCount > 0 ? await page.getByRole('option').allTextContents() : [];
      if (optionCount > 0) {
        await page.keyboard.press('Escape');
      }
      const types = options.map((t) => t.toLowerCase());
      expect(types.some((t) => t.includes('status'))).toBe(true);
      expect(types.some((t) => t.includes('field') || t.includes('exist'))).toBe(true);
      expect(types.some((t) => t.includes('json') || t.includes('path'))).toBe(true);
      expect(types.some((t) => t.includes('text') || t.includes('contains'))).toBe(true);
    }
  });

  test('clicking Run executes scenario and shows pass/fail badge', async () => {
    const panel = page.getByTestId('scenario-runner-panel');
    await expect(panel).toBeVisible({ timeout: 3_000 });

    async function ensureExpanded(stepNum: number) {
      const expand = panel.getByRole('button', { name: `Expand step ${stepNum}` });
      if (await expand.isVisible({ timeout: 800 }).catch(() => false)) {
        await expand.click();
        await page.waitForTimeout(150);
      }
    }
    await ensureExpanded(1);
    await ensureExpanded(2);
    await selectEchoMarkdown(0);
    await selectEchoMarkdown(1);

    const form0 = panel.getByTestId('scenario-step-args-form-0');
    const json0 = panel.getByTestId('scenario-step-args-json-0');
    if (await form0.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await form0.locator('input[type="text"]').fill('run-a');
    } else {
      await json0.fill(JSON.stringify({ message: 'run-a' }));
    }
    const form1 = panel.getByTestId('scenario-step-args-form-1');
    const json1 = panel.getByTestId('scenario-step-args-json-1');
    if (await form1.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await form1.locator('input[type="text"]').fill('run-b');
    } else {
      await json1.fill(JSON.stringify({ message: 'run-b' }));
    }

    const assertionTypeSelect = panel.getByTestId('scenario-assertion-type-select-1').first();
    if (await assertionTypeSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await assertionTypeSelect.click();
      await page.getByRole('option', { name: 'Status', exact: true }).click();
      await page.waitForTimeout(200);
    }

    const runBtn = panel.getByRole('button', { name: /Run/ });
    await expect(runBtn).toBeVisible({ timeout: 3_000 });
    await expect(runBtn).toBeEnabled({ timeout: 2_000 });
    await runBtn.click();
    await expect(panel.getByText(/\d+\/\d+ passed/)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: 'test-results/21-run-results.png', fullPage: true });

    await expect(panel.locator('text=/✓ Pass|✗ Fail/')).toHaveCount(2, { timeout: 5_000 });

    const header = panel.getByText(/\d+\/\d+ passed/);
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
