import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIXTURE_URL = 'http://localhost:3001/mcp';
export const VAULT_PASS = 'test-electron-pass-123';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  /** Where the app writes vault.json and data.gz — the CLI's directory shape. */
  dataDir: string;
  /** Where the save dialog is short-circuited to during E2E. */
  saveDir: string;
}

/**
 * Launch against a throwaway userData dir so every spec starts with an empty
 * vault and no leftover IndexedDB state.
 */
export async function launchApp(options: { dataDir?: string } = {}): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mcp-explorer-e2e-'));
  // Both must exist before launch: nativeHandlers writes into saveDir without mkdir.
  // Passing an existing dataDir relaunches against a vault created earlier, which
  // is the only way to reach the unlock screen.
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'mcp-explorer-data-'));
  const saveDir = mkdtempSync(join(tmpdir(), 'mcp-explorer-save-'));

  const app = await electron.launch({
    args: ['electron/main.js', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      MCP_EXPLORER_E2E: '1',
      MCP_EXPLORER_DATA_DIR: dataDir,
      MCP_EXPLORER_E2E_SAVE_DIR: saveDir,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, userDataDir, dataDir, saveDir };
}

export async function closeApp(
  launched: LaunchedApp,
  options: { keepDataDir?: boolean } = {},
): Promise<void> {
  await launched.app.close();
  const dirs = options.keepDataDir
    ? [launched.userDataDir, launched.saveDir]
    : [launched.userDataDir, launched.dataDir, launched.saveDir];
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Phase 2a still uses the passphrase vault; 2b replaces this with auto-unlock. */
export async function setupVault(page: Page): Promise<void> {
  await page.getByLabel('Passphrase', { exact: true }).fill(VAULT_PASS);
  await page.getByLabel('Confirm passphrase').fill(VAULT_PASS);
  await page.getByRole('button', { name: 'Create vault' }).click();
  await page.getByRole('button', { name: 'Add' }).waitFor({ timeout: 20_000 });
}

export async function waitForConnected(page: Page, name: string): Promise<void> {
  await page
    .locator('aside li')
    .filter({ hasText: name })
    .locator('.bg-emerald-400')
    .waitFor({ timeout: 20_000 });
}

export async function selectServer(page: Page, name: string): Promise<void> {
  await page.locator('aside li').filter({ hasText: name }).click();
}

/** Fill a tool-form field by its visible parameter label. */
export function paramInput(page: Page, label: string) {
  return page
    .locator('div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input[type="text"]')
    .first();
}
