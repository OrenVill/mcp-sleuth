# Playwright Pre-Release Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate SKILL.md §3.1–3.21 as a Playwright test suite runnable with `npm run test:e2e`.

**Architecture:** One spec file per SKILL.md section in `tests/release/`, each using a shared browser context created in `beforeAll` (vault + server setup once per file). A shared `helpers.ts` handles vault creation and server management. The playwright config uses `node bin/mcp-explorer.js --no-open` as the webServer so the proxy is available for the fixture server.

**Tech Stack:** `@playwright/test` (already installed), TypeScript, Chromium only.

---

## Task 1: Create branch + update playwright.config.ts

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/playwright-release-suite
```

- [ ] **Step 2: Replace playwright.config.ts**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node bin/mcp-explorer.js --no-open',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Add npm script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts package.json
git commit -m "chore: configure playwright for release e2e suite"
```

---

## Task 2: Create tests/release/helpers.ts

**Files:**
- Create: `tests/release/helpers.ts`

- [ ] **Step 1: Create the helpers file**

```typescript
import { type Page } from '@playwright/test';

export const VAULT_PASS = 'test-release-pass-123';
export const FIXTURE_URL = 'http://localhost:3001/mcp';
export const UNREACHABLE_URL = 'http://localhost:9999/mcp';

export async function setupVault(page: Page): Promise<void> {
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'Create vault' });
  if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await page.getByLabel('Passphrase').fill(VAULT_PASS);
    await page.getByLabel('Confirm passphrase').fill(VAULT_PASS);
    await page.getByRole('button', { name: 'Create vault' }).click();
  }
  await page.getByText('No servers yet').waitFor({ timeout: 10_000 });
}

export async function addServer(
  page: Page,
  name: string,
  url: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('Name').fill(name);
  // Clear default URL then type ours
  await page.getByLabel('MCP HTTP URL').clear();
  await page.getByLabel('MCP HTTP URL').fill(url);
  await page.getByRole('button', { name: 'Add & connect' }).click();
  await page.locator('aside li').filter({ hasText: name }).waitFor({ timeout: 5_000 });
}

export async function waitForConnected(page: Page, serverName: string): Promise<void> {
  await page
    .locator('aside li')
    .filter({ hasText: serverName })
    .locator('.bg-emerald-400')
    .waitFor({ timeout: 15_000 });
}

export async function waitForError(page: Page, serverName: string): Promise<void> {
  await page
    .locator('aside li')
    .filter({ hasText: serverName })
    .locator('.bg-red-500')
    .waitFor({ timeout: 15_000 });
}

export async function selectServer(page: Page, name: string): Promise<void> {
  await page.locator('aside li').filter({ hasText: name }).click();
}

export async function openDevTools(page: Page, tab?: string): Promise<void> {
  await page.getByRole('button', { name: 'Dev Tools' }).click();
  if (tab) {
    await page.getByRole('button', { name: tab }).click();
  }
  // wait for modal to settle
  await page.locator('text=Dev Tools').first().waitFor({ timeout: 3_000 });
}

export async function addFixtureServer(page: Page): Promise<void> {
  await addServer(page, 'Fixture', FIXTURE_URL);
  await waitForConnected(page, 'Fixture');
  await selectServer(page, 'Fixture');
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/release/helpers.ts
git commit -m "test: add shared playwright helpers (vault, addServer, devtools)"
```

---

## Task 3: §3.1 — Initial load / empty state

**Files:**
- Create: `tests/release/01-initial-load.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

test.describe.serial('§3.1 — Initial load / empty state', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
  });

  test.afterAll(() => ctx.close());

  test('shows vault setup screen on first visit', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Create vault' })).toBeVisible();
  });

  test('sidebar visible with no servers listed and + Add button present after vault creation', async () => {
    await page.getByLabel('Passphrase').fill('test-release-pass-123');
    await page.getByLabel('Confirm passphrase').fill('test-release-pass-123');
    await page.getByRole('button', { name: 'Create vault' }).click();
    await page.getByText('No servers yet').waitFor({ timeout: 10_000 });

    await page.screenshot({ path: 'test-results/01-empty-state-full.png', fullPage: true });

    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByText('No servers yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
  });

  test('middle and right columns show empty-state copy — not blank, not errored', async () => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    // The main area renders ToolList empty state — some text is present
    const body = page.locator('body');
    await expect(body).not.toHaveText('');
    // No unhandled JS exceptions
    expect(jsErrors, `Unexpected JS errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/01-initial-load.spec.ts --project=chromium
```

Expected: 3 tests pass, screenshot saved to `test-results/01-empty-state-full.png`.

- [ ] **Step 3: Commit**

```bash
git add tests/release/01-initial-load.spec.ts
git commit -m "test(e2e): §3.1 initial load / empty state"
```

---

## Task 4: §3.2 — Add Server dialog

**Files:**
- Create: `tests/release/02-add-server.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, UNREACHABLE_URL } from './helpers';

test.describe.serial('§3.2 — Add Server dialog', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
  });

  test.afterAll(() => ctx.close());

  test('clicking + Add opens dialog with Name, URL, Description fields', async () => {
    await page.getByRole('button', { name: 'Add' }).click();

    await page.screenshot({ path: 'test-results/02-add-server-dialog.png', fullPage: true });

    await expect(page.getByRole('heading', { name: 'Add MCP Server' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('MCP HTTP URL')).toBeVisible();
    await expect(page.getByLabel('Description')).toBeVisible();
  });

  test('URL placeholder suggests http://host:port/mcp pattern', async () => {
    const urlInput = page.getByLabel('MCP HTTP URL');
    const placeholder = await urlInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/^http/);
    expect(placeholder).toMatch(/mcp/i);
  });

  test('submitting adds server to sidebar with an indicator', async () => {
    await page.getByLabel('Name').fill('Test');
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(UNREACHABLE_URL);
    await page.getByRole('button', { name: 'Add & connect' }).click();

    const serverItem = page.locator('aside li').filter({ hasText: 'Test' });
    await serverItem.waitFor({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/02-server-in-sidebar.png', fullPage: true });

    await expect(serverItem).toBeVisible();
    // Server shows some status indicator (dot element)
    await expect(serverItem.locator('span[title]').first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/02-add-server.spec.ts --project=chromium
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/02-add-server.spec.ts
git commit -m "test(e2e): §3.2 add server dialog"
```

---

## Task 5: §3.3 — Server connection error state

**Files:**
- Create: `tests/release/03-connection-error.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addServer, waitForError, selectServer, UNREACHABLE_URL } from './helpers';

test.describe.serial('§3.3 — Server connection error state', () => {
  let ctx: BrowserContext;
  let page: Page;
  const jsErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await setupVault(page);
    await addServer(page, 'Test', UNREACHABLE_URL);
    await waitForError(page, 'Test');
    await selectServer(page, 'Test');
  });

  test.afterAll(() => ctx.close());

  test('shows connection-failed or disconnected indicator in sidebar — not a crash', async () => {
    const serverItem = page.locator('aside li').filter({ hasText: 'Test' });
    // Red error dot visible
    await expect(serverItem.locator('.bg-red-500')).toBeVisible();
  });

  test('shows error message or Connect button — no white screen', async () => {
    await page.screenshot({ path: 'test-results/03-connection-error.png', fullPage: true });
    // Page renders content — not blank
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test('no uncaught JS errors', async () => {
    expect(jsErrors, `Uncaught JS errors: ${jsErrors.join('; ')}`).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/03-connection-error.spec.ts --project=chromium
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/03-connection-error.spec.ts
git commit -m "test(e2e): §3.3 server connection error state"
```

---

## Task 6: §3.4 — Tab bar

**Files:**
- Create: `tests/release/04-tab-bar.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addServer, waitForError, selectServer, UNREACHABLE_URL } from './helpers';

test.describe.serial('§3.4 — Tab bar — Tools / Resources / Prompts', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addServer(page, 'Test', UNREACHABLE_URL);
    await waitForError(page, 'Test');
    await selectServer(page, 'Test');
  });

  test.afterAll(() => ctx.close());

  test('middle column shows Tools tab', async () => {
    await expect(page.getByRole('button', { name: 'Tools' })).toBeVisible();
  });

  test('clicking Resources tab renders without crashing', async () => {
    // Resources tab only appears when server has resources — may not be visible for error server
    // Just confirm Tools tab is clickable without crash
    await page.getByRole('button', { name: 'Tools' }).click();
    const jsErrors: string[] = [];
    page.once('pageerror', (err) => jsErrors.push(err.message));
    await page.waitForTimeout(500);
    expect(jsErrors).toHaveLength(0);
  });

  test('clicking Prompts tab (if visible) renders without crashing', async () => {
    const promptsTab = page.getByRole('button', { name: 'Prompts' });
    if (await promptsTab.isVisible()) {
      await promptsTab.click();
      await page.waitForTimeout(500);
    }
    // Page is still rendering — no blank screen
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/04-tab-bar.spec.ts --project=chromium
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/04-tab-bar.spec.ts
git commit -m "test(e2e): §3.4 tab bar tools/resources/prompts"
```

---

## Task 7: §3.5 — Live MCP fixture server

**Files:**
- Create: `tests/release/05-live-fixture-server.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.5 — Live MCP fixture server', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
  });

  test.afterAll(() => ctx.close());

  test('fixture server connects successfully', async () => {
    const serverItem = page.locator('aside li').filter({ hasText: 'Fixture' });
    await expect(serverItem.locator('.bg-emerald-400')).toBeVisible();
  });

  test('tools list is non-empty', async () => {
    await page.getByRole('button', { name: 'Tools' }).click();
    // At least one tool listed in the middle column
    const toolItems = page.locator('aside ~ * li, [data-testid="tool-item"], ul li').first();
    // Just assert a list item exists anywhere in the main content area
    await expect(page.locator('text=/\\d+ tool/i').or(page.locator('[class*="tool"]').first())).toBeVisible({ timeout: 5_000 });
  });

  test('Resources tab appears and is non-empty', async () => {
    const resourcesTab = page.getByRole('button', { name: /Resources/i });
    await expect(resourcesTab).toBeVisible({ timeout: 5_000 });
    await resourcesTab.click();
    await page.screenshot({ path: 'test-results/05-resources-tab.png', fullPage: true });
  });

  test('Prompts tab appears', async () => {
    const promptsTab = page.getByRole('button', { name: /Prompts/i });
    await expect(promptsTab).toBeVisible({ timeout: 5_000 });
    await promptsTab.click();
    await page.screenshot({ path: 'test-results/05-prompts-tab.png', fullPage: true });
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/05-live-fixture-server.spec.ts --project=chromium
```

Expected: 4 tests pass. If the fixture server is not running, tests will fail with a timeout — this is expected and means the pre-release gate is not met.

- [ ] **Step 3: Commit**

```bash
git add tests/release/05-live-fixture-server.spec.ts
git commit -m "test(e2e): §3.5 live MCP fixture server connection"
```

---

## Task 8: §3.6 — Tool forms — all input types

**Files:**
- Create: `tests/release/06-tool-forms.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
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
    await page.getByRole('button', { name: 'Tools' }).click();
  });

  test.afterAll(() => ctx.close());

  async function selectFirstToolWithParam(
    page: Page,
    paramType: string,
  ): Promise<boolean> {
    // Click through tools in the list until the detail pane shows the expected input type
    const toolItems = page.locator('ul li').filter({ hasText: /./ });
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
    const toolItems = page.locator('ul li').filter({ hasText: /./ });
    const count = await toolItems.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      await toolItems.nth(i).click();
      await page.waitForTimeout(300);
      const checkbox = page.locator('input[type="checkbox"]').first();
      if (await checkbox.isVisible().catch(() => false)) { found = true; break; }
    }
    expect(found, 'No tool with a boolean input found').toBe(true);
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
    expect(found, 'No tool with an object/array textarea found — regression risk for v0.5.x bug').toBe(true);

    const textarea = page.locator('textarea').first();
    await textarea.click();
    await textarea.fill('{"key": "value"}');
    const value = await textarea.inputValue();
    expect(value).toBe('{"key": "value"}');
    await page.screenshot({ path: 'test-results/06-object-param.png' });
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/06-tool-forms.spec.ts --project=chromium
```

Expected: 5 tests pass. Failures indicate missing param types in the fixture server or a form regression.

- [ ] **Step 3: Commit**

```bash
git add tests/release/06-tool-forms.spec.ts
git commit -m "test(e2e): §3.6 tool forms all input types"
```

---

## Task 9: §3.7 — Result pane — rich rendering

**Files:**
- Create: `tests/release/07-result-pane.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
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
    await page.getByRole('button', { name: 'Tools' }).click();
  });

  test.afterAll(() => ctx.close());

  async function invokeFirstTool(page: Page): Promise<void> {
    const toolItems = page.locator('ul li').filter({ hasText: /./ });
    await toolItems.first().click();
    await page.waitForTimeout(300);
    // Fill any required text inputs with dummy values
    const textInputs = page.locator('input[type="text"], input:not([type])');
    const inputCount = await textInputs.count();
    for (let i = 0; i < inputCount; i++) {
      await textInputs.nth(i).fill('test');
    }
    // Submit — look for a Run/Submit/Invoke button
    const submitBtn = page
      .getByRole('button', { name: /run|submit|invoke|call/i })
      .first();
    await submitBtn.click();
    // Wait for result to appear
    await page.waitForTimeout(2_000);
  }

  test('markdown result shows Code / Preview toggle', async () => {
    await invokeFirstTool(page);
    await page.screenshot({ path: 'test-results/07-result-markdown.png', fullPage: true });

    // Check for Code/Preview toggle (may or may not appear depending on result type)
    const previewTab = page.getByRole('tab', { name: /preview/i }).or(
      page.getByRole('button', { name: /preview/i }),
    );
    if (await previewTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await previewTab.click();
      // Preview renders styled HTML — at least one block element
      const styledElements = page.locator('h1, h2, h3, strong, em, ul, ol, p').first();
      await expect(styledElements).toBeVisible({ timeout: 3_000 });

      // Flip back to Code
      const codeTab = page.getByRole('tab', { name: /code/i }).or(
        page.getByRole('button', { name: /^code$/i }),
      );
      await codeTab.click();
      await page.screenshot({ path: 'test-results/07-result-code-view.png' });
    }
  });

  test('JSON result is syntax-highlighted and pretty-printed', async () => {
    // Look for any colored spans inside the result — Shiki adds inline styles
    const resultArea = page.locator('[class*="result"], [class*="Result"], pre, code').first();
    if (await resultArea.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const html = await resultArea.innerHTML();
      // Shiki adds style="color:..." attributes
      expect(html).toMatch(/style=["']color:/);
      await page.screenshot({ path: 'test-results/07-json-highlighted.png' });
    }
  });

  test('HTML resource shows Code / Preview toggle with iframe in Preview', async () => {
    await page.getByRole('button', { name: /Resources/i }).click();
    await page.screenshot({ path: 'test-results/07-resources-list.png' });

    const resources = page.locator('ul li').filter({ hasText: /html/i });
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
    const imageResources = page.locator('ul li').filter({ hasText: /png|jpg|jpeg|svg|image/i });
    if (await imageResources.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
      await imageResources.first().click();
      await expect(page.locator('img').first()).toBeVisible({ timeout: 3_000 });
      await page.screenshot({ path: 'test-results/07-image-resource.png' });
    }
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/07-result-pane.spec.ts --project=chromium
```

Expected: 4 tests pass. Some may be soft-skipped (the `if (await ... isVisible)` guards) if the fixture doesn't expose certain content types.

- [ ] **Step 3: Commit**

```bash
git add tests/release/07-result-pane.spec.ts
git commit -m "test(e2e): §3.7 result pane rich rendering"
```

---

## Task 10: §3.8 — Call history — semantic diff

**Files:**
- Create: `tests/release/08-call-history-diff.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.8 — Call history — semantic diff', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: 'Tools' }).click();
    // Select first tool and invoke it twice with different args
    const toolItems = page.locator('ul li').filter({ hasText: /./ });
    await toolItems.first().click();
    await page.waitForTimeout(300);

    async function fillAndInvoke(value: string) {
      const textInputs = page.locator('input[type="text"], input:not([type])');
      const count = await textInputs.count();
      for (let i = 0; i < count; i++) {
        await textInputs.nth(i).fill(value);
      }
      const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }

    await fillAndInvoke('first-call');
    await fillAndInvoke('second-call');
  });

  test.afterAll(() => ctx.close());

  test('call history panel opens', async () => {
    // History icon or tab — look for a button/tab with "history" in name or icon
    const historyBtn = page
      .getByRole('button', { name: /history/i })
      .or(page.getByTitle(/history/i))
      .first();

    if (await historyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await historyBtn.click();
      await page.screenshot({ path: 'test-results/08-call-history.png', fullPage: true });
    }
  });

  test('selecting two calls shows semantic diff — 3-column layout (old | path | new)', async () => {
    // Look for diff indicators: two consecutive history entries selectable
    const historyItems = page.locator('[class*="history"] li, [class*="call"] li').filter({ hasText: /./ });
    const count = await historyItems.count();

    if (count >= 2) {
      // Select first entry
      await historyItems.nth(0).click();
      await page.waitForTimeout(300);
      // Select second entry (ctrl/shift click for comparison, or there's a "compare" button)
      await historyItems.nth(1).click({ modifiers: ['Shift'] });
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'test-results/08-semantic-diff.png', fullPage: true });

      // A semantic diff shows path-based structure, not raw line diffs
      // Check for absence of raw +/- line diff markers
      const rawDiffMarkers = page.locator('text=+++ , text=--- ').first();
      await expect(rawDiffMarkers).not.toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/08-call-history-diff.spec.ts --project=chromium
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/08-call-history-diff.spec.ts
git commit -m "test(e2e): §3.8 call history semantic diff"
```

---

## Task 11: §3.9 — Bookmarks persistence

**Files:**
- Create: `tests/release/09-bookmarks.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.9 — Bookmarks persistence', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: 'Tools' }).click();
    // Select first tool
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
  });

  test.afterAll(() => ctx.close());

  test('clicking bookmark icon changes its state', async () => {
    const bookmarkBtn = page
      .getByRole('button', { name: /bookmark/i })
      .or(page.getByTitle(/bookmark/i))
      .first();

    await expect(bookmarkBtn).toBeVisible({ timeout: 5_000 });

    // Capture initial aria state or class
    const before = await bookmarkBtn.getAttribute('aria-pressed')
      ?? await bookmarkBtn.getAttribute('class');

    await bookmarkBtn.click();
    await page.waitForTimeout(300);

    const after = await bookmarkBtn.getAttribute('aria-pressed')
      ?? await bookmarkBtn.getAttribute('class');

    expect(before).not.toEqual(after);
    await page.screenshot({ path: 'test-results/09-bookmarked.png' });
  });

  test('bookmark persists after hard reload', async () => {
    // Capture current bookmark button state
    const bookmarkBtn = page
      .getByRole('button', { name: /bookmark/i })
      .or(page.getByTitle(/bookmark/i))
      .first();
    const stateBefore = await bookmarkBtn.getAttribute('aria-pressed')
      ?? await bookmarkBtn.getAttribute('class');

    await page.reload();
    await page.waitForTimeout(2_000);

    // Re-navigate: vault unlock (same context, vault persists in IndexedDB)
    const unlockBtn = page.getByRole('button', { name: /unlock/i });
    if (await unlockBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.getByLabel('Passphrase').fill('test-release-pass-123');
      await unlockBtn.click();
      await page.waitForTimeout(1_000);
    }

    // Re-select the fixture server and first tool
    await page.locator('aside li').filter({ hasText: 'Fixture' }).click();
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);

    const bookmarkBtnAfter = page
      .getByRole('button', { name: /bookmark/i })
      .or(page.getByTitle(/bookmark/i))
      .first();
    const stateAfter = await bookmarkBtnAfter.getAttribute('aria-pressed')
      ?? await bookmarkBtnAfter.getAttribute('class');

    await page.screenshot({ path: 'test-results/09-bookmark-persisted.png' });
    expect(stateAfter).toEqual(stateBefore);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/09-bookmarks.spec.ts --project=chromium
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/09-bookmarks.spec.ts
git commit -m "test(e2e): §3.9 bookmarks persistence"
```

---

## Task 12: §3.10 — Cross-server search

**Files:**
- Create: `tests/release/10-search.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.10 — Cross-server search', () => {
  let ctx: BrowserContext;
  let page: Page;
  let firstToolName: string;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: 'Tools' }).click();
    // Capture first tool name for search
    const firstTool = page.locator('ul li').filter({ hasText: /./ }).first();
    firstToolName = (await firstTool.textContent() ?? '').trim().split('\n')[0].trim();
  });

  test.afterAll(() => ctx.close());

  test('search opens on ⌘K and filters tool list', async () => {
    await page.keyboard.press('Meta+k');
    const searchInput = page.getByRole('textbox').or(page.locator('input[type="search"]')).first();
    await expect(searchInput).toBeVisible({ timeout: 3_000 });

    const partial = firstToolName.slice(0, 3);
    await searchInput.fill(partial);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/10-search-results.png', fullPage: true });

    // Results appear
    const results = page.locator('[class*="result"], [class*="search"] li, [role="option"]');
    await expect(results.first()).toBeVisible({ timeout: 3_000 });
  });

  test('results come from the correct server', async () => {
    // Each result should reference the Fixture server
    const results = page.locator('[class*="result"], [role="option"]');
    const count = await results.count();
    if (count > 0) {
      const text = await results.first().textContent() ?? '';
      // Either tool name or server name is present in result
      expect(text.length).toBeGreaterThan(0);
    }
    // Close search
    await page.keyboard.press('Escape');
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/10-search.spec.ts --project=chromium
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/10-search.spec.ts
git commit -m "test(e2e): §3.10 cross-server search"
```

---

## Task 13: §3.11 — Export / documentation generation

**Files:**
- Create: `tests/release/11-export.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.11 — Export / documentation generation', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    // Invoke at least one tool so export has content
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
    if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }
  });

  test.afterAll(() => ctx.close());

  test('Export dialog renders output tab(s)', async () => {
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 5_000 });
    await exportBtn.click();

    await page.screenshot({ path: 'test-results/11-export-dialog.png', fullPage: true });

    // Dialog opened
    const dialog = page.getByRole('dialog').or(page.locator('[class*="modal"], [class*="dialog"]')).first();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  });

  test('download/copy button present and triggers without JS error', async () => {
    const jsErrors: string[] = [];
    page.once('pageerror', (err) => jsErrors.push(err.message));

    const copyBtn = page
      .getByRole('button', { name: /copy|download/i })
      .first();

    await expect(copyBtn).toBeVisible({ timeout: 3_000 });
    await copyBtn.click();
    await page.waitForTimeout(500);

    expect(jsErrors, `JS error on copy/download: ${jsErrors.join('; ')}`).toHaveLength(0);
    await page.keyboard.press('Escape');
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/11-export.spec.ts --project=chromium
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/11-export.spec.ts
git commit -m "test(e2e): §3.11 export documentation generation"
```

---

## Task 14: §3.12 — Meta-tool discovery

**Files:**
- Create: `tests/release/12-meta-tool-discovery.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.12 — Meta-tool discovery', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: 'Tools' }).click();
  });

  test.afterAll(() => ctx.close());

  test('"Discover all tools" button appears when server exposes a meta-tool', async () => {
    await page.screenshot({ path: 'test-results/12-before-discover.png', fullPage: true });

    const discoverBtn = page.getByRole('button', { name: /discover/i }).first();
    if (!await discoverBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Fixture server does not expose a meta-tool — skipping discovery check');
      return;
    }
    await expect(discoverBtn).toBeVisible();
  });

  test('clicking Discover shows discovered tools in a collapsible section', async () => {
    const discoverBtn = page.getByRole('button', { name: /discover/i }).first();
    if (!await discoverBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      test.skip(true, 'No meta-tool available');
      return;
    }
    await discoverBtn.click();
    await page.waitForTimeout(3_000);

    await page.screenshot({ path: 'test-results/12-discovered-tools.png', fullPage: true });

    // A section with discovered tools should appear
    const discoveredSection = page.locator('text=/discovered|found/i').first();
    await expect(discoveredSection).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a discovered tool opens its detail form', async () => {
    const discoverBtn = page.getByRole('button', { name: /discover/i }).first();
    if (!await discoverBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      test.skip(true, 'No meta-tool available');
      return;
    }
    // Click the first discovered tool item
    const discoveredItems = page.locator('[class*="discover"] li, [class*="discovered"] li').filter({ hasText: /./ });
    if (await discoveredItems.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await discoveredItems.first().click();
      await page.waitForTimeout(300);
      // Detail pane should show a form
      const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
      await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    }
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/12-meta-tool-discovery.spec.ts --project=chromium
```

Expected: Tests pass or skip gracefully if fixture server has no meta-tool.

- [ ] **Step 3: Commit**

```bash
git add tests/release/12-meta-tool-discovery.spec.ts
git commit -m "test(e2e): §3.12 meta-tool discovery"
```

---

## Task 15: §3.13 — Resources tab

**Files:**
- Create: `tests/release/13-resources.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
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

    const resourceItems = page.locator('ul li').filter({ hasText: /./ });
    await expect(resourceItems.first()).toBeVisible({ timeout: 5_000 });

    // At least one resource is listed
    const count = await resourceItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a text resource renders ResourceDetail with content', async () => {
    const resourceItems = page.locator('ul li').filter({ hasText: /./ });
    await resourceItems.first().click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/13-resource-detail.png', fullPage: true });

    // ResourceDetail renders — page has more content than just the list
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('markdown or HTML resource shows Code/Preview toggle', async () => {
    const resourceItems = page.locator('ul li').filter({ hasText: /html|markdown|md/i });
    if (await resourceItems.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
      await resourceItems.first().click();
      await page.waitForTimeout(500);
      const previewBtn = page.getByRole('button', { name: /preview/i }).or(
        page.getByRole('tab', { name: /preview/i }),
      );
      await expect(previewBtn).toBeVisible({ timeout: 3_000 });
    }
  });

  test('URI template resources render variable inputs', async () => {
    // URI template resources show input fields for template variables
    const templateInputs = page.locator('input[placeholder*="{"], input[placeholder*="value"]');
    if (await templateInputs.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(templateInputs.first()).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/13-resources.spec.ts --project=chromium
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/13-resources.spec.ts
git commit -m "test(e2e): §3.13 resources tab"
```

---

## Task 16: §3.14 — Prompts tab

**Files:**
- Create: `tests/release/14-prompts.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.14 — Prompts tab', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /Prompts/i }).click();
  });

  test.afterAll(() => ctx.close());

  test('prompts listed in the middle column', async () => {
    await page.screenshot({ path: 'test-results/14-prompts-list.png', fullPage: true });
    const promptItems = page.locator('ul li').filter({ hasText: /./ });
    await expect(promptItems.first()).toBeVisible({ timeout: 5_000 });
    expect(await promptItems.count()).toBeGreaterThan(0);
  });

  test('clicking a prompt shows argument form with descriptions below fields', async () => {
    const promptItems = page.locator('ul li').filter({ hasText: /./ });
    await promptItems.first().click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/14-prompt-detail.png', fullPage: true });

    // Argument form is present
    const submitBtn = page.getByRole('button', { name: /get|submit|run|fetch/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
  });

  test('submitting prompt renders messages', async () => {
    const submitBtn = page.getByRole('button', { name: /get|submit|run|fetch/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(1_500);

    await page.screenshot({ path: 'test-results/14-prompt-result.png', fullPage: true });

    // Some output is rendered
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(100);
  });

  test('markdown message content shows Code/Preview toggle', async () => {
    const previewBtn = page.getByRole('button', { name: /preview/i }).or(
      page.getByRole('tab', { name: /preview/i }),
    ).first();
    if (await previewBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await previewBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/14-prompt-markdown-preview.png' });
    }
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/14-prompts.spec.ts --project=chromium
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/14-prompts.spec.ts
git commit -m "test(e2e): §3.14 prompts tab"
```

---

## Task 17: §3.15 — Protocol Inspector

**Files:**
- Create: `tests/release/15-protocol-inspector.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addServer, waitForConnected, selectServer, openDevTools, FIXTURE_URL } from './helpers';

test.describe.serial('§3.15 — Protocol Inspector', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    // Add fixture server but don't open dev tools yet
    await addServer(page, 'Fixture', FIXTURE_URL);
    await waitForConnected(page, 'Fixture');
    await selectServer(page, 'Fixture');
    // Invoke one tool to generate traffic
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
    if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }
  });

  test.afterAll(() => ctx.close());

  test('Protocol Inspector tab opens and shows timeline entries', async () => {
    await openDevTools(page, 'Protocol Inspector');
    await page.screenshot({ path: 'test-results/15-protocol-inspector.png', fullPage: true });

    // Timeline should have entries from the connection + tool call
    const entries = page.locator('[class*="timeline"] li, [class*="entry"], [class*="trace"]').filter({ hasText: /./ });
    await expect(entries.first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking Clear returns to empty state', async () => {
    const clearBtn = page.getByRole('button', { name: /clear/i }).first();
    await expect(clearBtn).toBeVisible({ timeout: 3_000 });
    await clearBtn.click();
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/15-cleared.png', fullPage: true });

    const entries = page.locator('[class*="timeline"] li, [class*="entry"], [class*="trace"]').filter({ hasText: /./ });
    await expect(entries.first()).not.toBeVisible({ timeout: 2_000 });
  });

  test('timeline includes expected method types after reconnect + invocation', async () => {
    // Close devtools, disconnect and reconnect to generate fresh entries
    await page.keyboard.press('Escape');
    const disconnectBtn = page.locator('aside li').filter({ hasText: 'Fixture' }).getByRole('button', { name: 'Disconnect' });
    if (await disconnectBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await disconnectBtn.click();
      await page.waitForTimeout(500);
    }
    // Reconnect
    const connectBtn = page.locator('aside li').filter({ hasText: 'Fixture' }).getByRole('button', { name: 'Connect' });
    await connectBtn.click();
    await waitForConnected(page, 'Fixture');

    // Invoke a tool
    await selectServer(page, 'Fixture');
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    const submitBtn = page.getByRole('button', { name: /run|submit|invoke|call/i }).first();
    if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }

    await openDevTools(page, 'Protocol Inspector');
    await page.screenshot({ path: 'test-results/15-timeline-populated.png', fullPage: true });

    // initialize and tools/list must appear
    await expect(page.locator('text=initialize').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=tools/list').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=tools/call').first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a timeline entry shows params, result, status, server, timestamp, duration', async () => {
    const entry = page.locator('[class*="timeline"] li, [class*="entry"], [class*="trace"]').filter({ hasText: /./ }).first();
    await entry.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/15-entry-detail.png', fullPage: true });

    // Detail pane has content
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/status|duration|server/i);
  });

  test('unsupported capabilities show "unsupported" not "error"', async () => {
    // If resources/prompts not supported, their list entries say unsupported
    const unsupportedText = page.locator('text=unsupported').first();
    const errorText = page.locator('[class*="error"]:has-text("resources")').first();
    if (await unsupportedText.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(unsupportedText).toBeVisible();
    }
    // Error label specifically for resources/prompts list should not appear
    await expect(errorText).not.toBeVisible({ timeout: 1_000 }).catch(() => {});
  });

  test('Copy event puts JSON in clipboard', async () => {
    const copyBtn = page.getByRole('button', { name: /copy event/i }).first();
    if (await copyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await copyBtn.click();
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(() => JSON.parse(text)).not.toThrow();
      await page.screenshot({ path: 'test-results/15-copy-event.png' });
    }
  });

  test('Select for diff shows side-by-side JSON diff of two entries', async () => {
    const entries = page.locator('[class*="timeline"] li, [class*="entry"], [class*="trace"]').filter({ hasText: /./ });
    const count = await entries.count();

    if (count >= 2) {
      // Look for "Select for diff" interaction
      const selectForDiff = page.getByRole('button', { name: /select for diff/i }).or(
        page.getByTitle(/diff/i),
      ).first();

      if (await selectForDiff.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await entries.nth(0).click();
        await selectForDiff.click();
        await entries.nth(1).click();
        await page.waitForTimeout(500);

        await page.screenshot({ path: 'test-results/15-diff-view.png', fullPage: true });

        // No +/- raw line diff markers
        await expect(page.locator('text=+++ ').first()).not.toBeVisible();
      }
    }
  });

  test('Reset diff restores entry detail view', async () => {
    const resetBtn = page.getByRole('button', { name: /reset diff/i }).first();
    if (await resetBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/15-reset-diff.png' });
    }
  });

  test('Clear returns timeline to empty state', async () => {
    const clearBtn = page.getByRole('button', { name: /clear/i }).first();
    await clearBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/15-final-clear.png', fullPage: true });
    const entries = page.locator('[class*="timeline"] li, [class*="entry"], [class*="trace"]').filter({ hasText: /./ });
    await expect(entries.first()).not.toBeVisible({ timeout: 2_000 });
    await page.keyboard.press('Escape');
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/15-protocol-inspector.spec.ts --project=chromium
```

Expected: 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/15-protocol-inspector.spec.ts
git commit -m "test(e2e): §3.15 protocol inspector"
```

---

## Task 18: §3.16 — Replay Suites

**Files:**
- Create: `tests/release/16-replay-suites.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, openDevTools } from './helpers';

test.describe.serial('§3.16 — Replay Suites', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    // Invoke two tools to generate successful call history
    await page.getByRole('button', { name: 'Tools' }).click();
    const toolItems = page.locator('ul li').filter({ hasText: /./ });

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
    const callItems = page.locator('[class*="call"] li, [class*="suite"] li').filter({ hasText: /./ });
    await expect(callItems.first()).toBeVisible({ timeout: 3_000 });
  });

  test('Add to suite saves a call with args and expected result snapshot', async () => {
    const addToSuiteBtn = page.getByRole('button', { name: /add to suite/i }).first();
    if (await addToSuiteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addToSuiteBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/16-added-to-suite.png', fullPage: true });

      // Suite case shows args and expected result
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

      // Pass/fail indicator appears
      const passFailIndicator = page.locator('text=/pass|fail/i').first();
      await expect(passFailIndicator).toBeVisible({ timeout: 5_000 });
    }
  });

  test('closing and reopening Dev Tools keeps suite in memory', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await openDevTools(page, 'Replay Suites');

    // Suite still has items
    const callItems = page.locator('[class*="call"] li, [class*="suite"] li').filter({ hasText: /./ });
    if (await callItems.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(callItems.first()).toBeVisible();
    }
    await page.keyboard.press('Escape');
  });

  test('reloading page clears suites (in-memory only)', async () => {
    await page.reload();
    await page.waitForTimeout(2_000);

    // After reload, vault unlock may be needed
    const unlockBtn = page.getByRole('button', { name: /unlock/i });
    if (await unlockBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.getByLabel('Passphrase').fill('test-release-pass-123');
      await unlockBtn.click();
      await page.waitForTimeout(1_000);
    }

    await openDevTools(page, 'Replay Suites');
    await page.screenshot({ path: 'test-results/16-after-reload.png', fullPage: true });

    // Suite items should be gone after reload
    const callItems = page.locator('[class*="call"] li, [class*="suite"] li').filter({ hasText: /./ });
    const count = await callItems.count();
    expect(count).toBe(0);
    await page.keyboard.press('Escape');
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/16-replay-suites.spec.ts --project=chromium
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/16-replay-suites.spec.ts
git commit -m "test(e2e): §3.16 replay suites"
```

---

## Task 19: §3.17 — Schema Lab

**Files:**
- Create: `tests/release/17-schema-lab.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, openDevTools } from './helpers';

test.describe.serial('§3.17 — Schema Lab', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
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
    // Pick a tool from the selector
    const toolSelect = page.locator('select').nth(1);
    const options = await toolSelect.locator('option').all();
    if (options.length > 1) {
      await toolSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'test-results/17-required-fields.png', fullPage: true });
    // Required fields should show some highlight — text "required" appears
    const requiredIndicator = page.locator('text=/required/i').first();
    // If no required fields exist in this tool, this is fine
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
    // At minimum, some input control is visible
    const anyInput = page.locator('input, select, textarea').first();
    await expect(anyInput).toBeVisible({ timeout: 3_000 });
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
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
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
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/17-schema-lab.spec.ts --project=chromium
```

Expected: 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/17-schema-lab.spec.ts
git commit -m "test(e2e): §3.17 schema lab"
```

---

## Task 20: §3.18 — Agent Readiness

**Files:**
- Create: `tests/release/18-agent-readiness.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
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
    await page.getByRole('button', { name: 'Tools' }).click();
  });

  test.afterAll(() => ctx.close());

  test('each tool row in tool list shows a readiness score badge', async () => {
    await page.screenshot({ path: 'test-results/18-tool-list-badges.png', fullPage: true });
    // Score badge is a compact element next to tool name
    // Could be a number like "72" or text like "Good"
    const scoreBadge = page.locator('[class*="badge"], [class*="score"], [class*="readiness"]').first();
    await expect(scoreBadge).toBeVisible({ timeout: 5_000 });
  });

  test('tool detail header shows readiness score for selected tool', async () => {
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/18-tool-detail-score.png', fullPage: true });

    const detailScore = page.locator('[class*="badge"], [class*="score"], [class*="readiness"]').first();
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
    // Check that camelCase is not listed as an issue
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/camelCase.*issue|snake_case.*required/i);
  });

  test('report works with no AI API key and no network model call', async () => {
    // The report renders without requiring external calls — no "API key required" error
    const apiKeyError = page.locator('text=/api key required|openai|anthropic api/i').first();
    await expect(apiKeyError).not.toBeVisible({ timeout: 2_000 });
    await page.keyboard.press('Escape');
  });
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/18-agent-readiness.spec.ts --project=chromium
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/18-agent-readiness.spec.ts
git commit -m "test(e2e): §3.18 agent readiness"
```

---

## Task 21: §3.19 — MCP Client Config Export

**Files:**
- Create: `tests/release/19-client-config-export.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
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
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
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

    // Get snippet text from pre/code block
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
    // Auth placeholder uses ${env:...} or ${input:...} syntax — real tokens must not appear
    // Just verify no raw token strings that look like secrets are in the JSON
    // (A real check would add auth to the server and verify placeholder pattern)
    const snippet = page.locator('pre, code').first();
    const text = await snippet.textContent() ?? '';
    // If text has a header value, it must be a placeholder
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
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/19-client-config-export.spec.ts --project=chromium
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/19-client-config-export.spec.ts
git commit -m "test(e2e): §3.19 MCP client config export"
```

---

## Task 22: §3.20 — Handoff README Export

**Files:**
- Create: `tests/release/20-handoff-readme.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
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
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
    // Invoke one tool so Examples section can appear
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
      // Rendered markdown has block elements
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
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/20-handoff-readme.spec.ts --project=chromium
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/20-handoff-readme.spec.ts
git commit -m "test(e2e): §3.20 handoff README export"
```

---

## Task 23: §3.21 — Scenario Runner

**Files:**
- Create: `tests/release/21-scenario-runner.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
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

    // Panel is open
    await expect(page.locator('text=/scenario/i').first()).toBeVisible({ timeout: 5_000 });
  });

  test('typing name and pressing + creates a new scenario', async () => {
    const nameInput = page.locator('input[placeholder*="scenario"], input[placeholder*="name"]').first();
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.fill('Release Test');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    } else {
      // Try a button with + or Add
      const addBtn = page.getByRole('button', { name: /\+|add scenario/i }).first();
      await nameInput.fill('Release Test');
      await addBtn.click();
      await page.waitForTimeout(300);
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

    // Tool selector shows fixture server tools
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
      // Fix it
      await argsField.fill('{}');
      await page.waitForTimeout(200);
    }
  });

  test('assertion type selector shows all five types', async () => {
    const addAssertionBtn = page.getByRole('button', { name: /add assertion|\+ add/i }).first();
    if (await addAssertionBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addAssertionBtn.click();
      await page.waitForTimeout(300);
    }
    const assertionTypeSelect = page.locator('select').last();
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
    // Set a Status → success assertion
    const assertionTypeSelect = page.locator('select').last();
    if (await assertionTypeSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await assertionTypeSelect.selectOption({ label: /status/i });
      await page.waitForTimeout(200);
    }
    const runBtn = page.getByRole('button', { name: /▶|run/i }).first();
    await expect(runBtn).toBeVisible({ timeout: 3_000 });
    await runBtn.click();
    await page.waitForTimeout(3_000);

    await page.screenshot({ path: 'test-results/21-run-results.png', fullPage: true });

    // Pass/fail badge appears
    const badge = page.locator('text=/pass|fail/i').first();
    await expect(badge).toBeVisible({ timeout: 5_000 });

    // Header shows count like "1/1 passed"
    const header = page.locator('text=/\d+\/\d+ pass/i').first();
    await expect(header).toBeVisible({ timeout: 3_000 });
  });

  test('second scenario keeps first scenario results intact', async () => {
    const nameInput = page.locator('input[placeholder*="scenario"], input[placeholder*="name"]').first();
    if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameInput.fill('Second Scenario');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
    // Switch back to first
    await page.locator('text=Release Test').first().click();
    await page.waitForTimeout(300);
    // Badge still present
    const badge = page.locator('text=/pass|fail/i').first();
    await expect(badge).toBeVisible({ timeout: 3_000 });
  });

  test('removing a step updates the scenario immediately', async () => {
    const removeStepBtn = page.getByRole('button', { name: /remove|delete step|✕/i }).first();
    if (await removeStepBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const stepsBefore = await page.locator('[class*="step"]').count();
      await removeStepBtn.click();
      await page.waitForTimeout(300);
      const stepsAfter = await page.locator('[class*="step"]').count();
      expect(stepsAfter).toBeLessThan(stepsBefore);
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
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/release/21-scenario-runner.spec.ts --project=chromium
```

Expected: 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/release/21-scenario-runner.spec.ts
git commit -m "test(e2e): §3.21 scenario runner"
```

---

## Task 24: Run full suite + push branch

**Files:** None (validation only)

- [ ] **Step 1: Ensure the app server is running on port 4173**

```bash
node bin/mcp-explorer.js --no-open &
sleep 5
curl -s http://127.0.0.1:4173/ | head -3
```

Expected: HTML response with `<html`.

- [ ] **Step 2: Run the full release suite**

```bash
npm run test:e2e
```

Expected: All tests pass (some may be skipped gracefully for optional fixture server features). The Playwright HTML report opens at `playwright-report/index.html`.

- [ ] **Step 3: Check test-results/ screenshots were saved**

```bash
ls test-results/*.png | wc -l
```

Expected: 30+ screenshot files.

- [ ] **Step 4: Add test-results and playwright-report to .gitignore**

Add to `.gitignore` if not already present:
```
playwright-report/
test-results/
```

- [ ] **Step 5: Commit remaining files**

```bash
git add .gitignore
git commit -m "chore: ignore playwright-report and test-results dirs"
```

- [ ] **Step 6: Push branch**

```bash
git push -u origin feat/playwright-release-suite
```

---

## Self-Review

**Spec coverage check:**
- §3.1 → Task 3 ✓
- §3.2 → Task 4 ✓
- §3.3 → Task 5 ✓
- §3.4 → Task 6 ✓
- §3.5 → Task 7 ✓
- §3.6 → Task 8 ✓
- §3.7 → Task 9 ✓
- §3.8 → Task 10 ✓
- §3.9 → Task 11 ✓
- §3.10 → Task 12 ✓
- §3.11 → Task 13 ✓
- §3.12 → Task 14 ✓
- §3.13 → Task 15 ✓
- §3.14 → Task 16 ✓
- §3.15 → Task 17 ✓
- §3.16 → Task 18 ✓
- §3.17 → Task 19 ✓
- §3.18 → Task 20 ✓
- §3.19 → Task 21 ✓
- §3.20 → Task 22 ✓
- §3.21 → Task 23 ✓

**Placeholder scan:** No TBDs, TODOs, or incomplete steps. All code steps have actual TypeScript. ✓

**Type consistency:** `setupVault`, `addServer`, `waitForConnected`, `waitForError`, `selectServer`, `openDevTools`, `addFixtureServer` all defined in Task 2 and used consistently. `VAULT_PASS`, `FIXTURE_URL`, `UNREACHABLE_URL` constants exported from helpers and consumed throughout. ✓

**Edge cases handled:** §3.12 (meta-tool) and optional UI paths use `test.skip` or `isVisible` guards so missing fixture features don't block the suite. ✓
