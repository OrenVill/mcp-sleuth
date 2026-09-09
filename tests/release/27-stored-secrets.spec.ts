import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setupVault, waitForConnected, selectServer, FIXTURE_URL } from './helpers';

const STDIO_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/stdio-mcp-server.mjs',
);

const HTTP_SERVER_NAME = 'Basic Auth Server';
const STDIO_SERVER_NAME = 'Stdio Secret Server';
const PASSWORD = 'hunter2-should-never-appear';
const ENV_KEY = 'SLEUTH_TEST_SECRET';
const ENV_VALUE = 'env-secret-should-never-appear';
const MASK = '*****';
const LLM_KEY = 'sk-should-never-appear';
const LLM_BASE = 'http://127.0.0.1:3003/v1';

/**
 * Everything the open dialog exposes: every input value plus its markup. This is
 * what a copy, a devtools read, or a browser extension sees.
 */
async function dialogExposes(page: Page): Promise<string> {
  return page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll('form'));
    const form = forms[forms.length - 1];
    if (!form) throw new Error('no dialog form is open');
    const values = Array.from(form.querySelectorAll('input, textarea')).map(
      (field) => (field as HTMLInputElement).value,
    );
    return [...values, form.outerHTML].join('\n');
  });
}

async function openEdit(page: Page, serverName: string): Promise<void> {
  const row = page.locator('aside li').filter({ hasText: serverName });
  await row.hover();
  await row.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit MCP Server' })).toBeVisible();
}

test.describe.serial('§3.27 — Stored secrets never reach the edit form', () => {
  test('a saved Basic password is masked, kept on save, and absent from the DOM', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await setupVault(page);

    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Name').fill(HTTP_SERVER_NAME);
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(FIXTURE_URL);
    await page.getByRole('radio', { name: 'HTTP Basic' }).click({ force: true });
    await page.getByLabel('Username').fill('ada');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Add & connect' }).click();
    await page.locator('aside li').filter({ hasText: HTTP_SERVER_NAME }).waitFor();

    await openEdit(page, HTTP_SERVER_NAME);

    // The field stands in for the credential rather than holding it.
    const passwordField = page.getByLabel('Password', { exact: true });
    await expect(passwordField).toHaveValue(MASK);
    await expect(passwordField).toHaveAttribute('readonly', '');
    // The username is not a secret and is still shown.
    await expect(page.getByLabel('Username')).toHaveValue('ada');

    // The root of the bug: the plaintext must not be anywhere in the document.
    expect(await dialogExposes(page)).not.toContain(PASSWORD);

    // Change clears the field for a new value; Keep existing puts the mask back.
    await page.getByRole('button', { name: 'Change Password' }).click();
    await expect(passwordField).toHaveValue('');
    await expect(passwordField).not.toHaveAttribute('readonly', '');
    await page.getByRole('button', { name: 'Keep existing Password' }).click();
    await expect(passwordField).toHaveValue(MASK);

    // Saving an untouched field keeps the stored credential rather than blanking it.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Edit MCP Server' })).toBeHidden();
    await openEdit(page, HTTP_SERVER_NAME);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue(MASK);
    await expect(page.getByLabel('Username')).toHaveValue('ada');
    await page.getByLabel('Password', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/27-masked-basic-password.png' });
  });

  test('a saved Agent Chat provider key is masked when its model server is edited', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await setupVault(page);

    // With no model server configured, the chat overlay opens straight onto its form.
    await page.getByTestId('open-agent-chat').click();
    const form = page.getByTestId('llm-config-form');
    await expect(form).toBeVisible();
    await form.getByPlaceholder('Local Ollama').fill('Keyed LLM');
    await page.getByRole('textbox', { name: 'Base URL' }).fill(LLM_BASE);
    await page.getByLabel('API key (leave empty for local models)').fill(LLM_KEY);
    await form.getByRole('button', { name: 'Add server' }).click();
    await expect(form).toBeHidden();

    await page.getByTestId('llm-picker').click();
    await page.getByRole('button', { name: 'Edit “Keyed LLM”' }).click();
    await expect(form).toBeVisible();

    const keyField = page.getByLabel('API key (leave empty for local models)');
    await expect(keyField).toHaveValue(MASK);
    await expect(keyField).toHaveAttribute('readonly', '');
    expect(await dialogExposes(page)).not.toContain(LLM_KEY);
  });

  test('a stdio environment secret survives an untouched save', async ({ page }) => {
    test.setTimeout(90_000);
    await setupVault(page);

    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('radio', { name: 'Stdio' }).click({ force: true });
    await page.getByLabel('Name').fill(STDIO_SERVER_NAME);
    await page.getByLabel('Command').fill(process.execPath);
    await page.getByLabel('Arguments').fill(STDIO_FIXTURE);
    await page.getByLabel('Key').fill(ENV_KEY);
    await page.getByLabel('Value', { exact: true }).fill(ENV_VALUE);
    await page.getByRole('button', { name: 'Add & connect' }).click();

    await page.locator('aside li').filter({ hasText: STDIO_SERVER_NAME }).waitFor();
    await waitForConnected(page, STDIO_SERVER_NAME);
    await readEnvValue(page, ENV_VALUE);

    await openEdit(page, STDIO_SERVER_NAME);
    const valueField = page.getByLabel('Value', { exact: true });
    await expect(valueField).toHaveValue(MASK);
    await expect(valueField).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Key')).toHaveValue(ENV_KEY);
    expect(await dialogExposes(page)).not.toContain(ENV_VALUE);

    // Save without touching the value: the subprocess must still be spawned with it.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Edit MCP Server' })).toBeHidden();
    await waitForConnected(page, STDIO_SERVER_NAME);
    await readEnvValue(page, ENV_VALUE);
    await openEdit(page, STDIO_SERVER_NAME);
    await page.getByLabel('Value', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/27-stdio-env-preserved.png' });
  });
});

/** Call the fixture's `env_value` tool and assert the spawned process saw `expected`. */
async function readEnvValue(page: Page, expected: string): Promise<void> {
  await selectServer(page, STDIO_SERVER_NAME);
  await page.locator('aside + aside ul li').filter({ hasText: 'env_value' }).click();
  const nameInput = page
    .locator('div')
    .filter({ has: page.getByText('name', { exact: true }) })
    .locator('input[type="text"]')
    .first();
  await nameInput.fill(ENV_KEY);
  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.locator('main pre.shiki-block').filter({ hasText: expected })).toBeVisible({
    timeout: 15_000,
  });
}
