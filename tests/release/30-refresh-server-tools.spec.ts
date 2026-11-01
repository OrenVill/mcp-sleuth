import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  setupVault,
  addFixtureServer,
  addAwesomeServer,
  openDevTools,
  waitForConnected,
} from './helpers';

test.describe.serial('§3.30 — Per-server refresh', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
  });

  test.afterAll(() => ctx.close());

  test('connected server shows Refresh tools and stays connected after refresh', async () => {
    const row = page.locator('aside li').filter({ hasText: 'Fixture' });
    const refreshBtn = row.getByRole('button', { name: 'Refresh tools' });
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toBeEnabled();

    const toolCount = row.getByText(/\d+ tools?/);
    const countBefore = await toolCount.textContent();

    await refreshBtn.click();
    await expect(row.getByText('Refreshing…')).toBeVisible({ timeout: 3_000 });
    await expect(row.getByText('Refreshing…')).not.toBeVisible({ timeout: 15_000 });

    await expect(row.locator('.bg-emerald-400')).toBeVisible();
    await expect(toolCount).toHaveText(countBefore ?? '');
    await expect(row.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  });

  test('disconnected server does not offer an enabled Refresh tools control', async () => {
    const row = page.locator('aside li').filter({ hasText: 'Fixture' });
    await row.getByRole('button', { name: 'Disconnect' }).click();
    await expect(row.getByRole('button', { name: 'Refresh tools' })).not.toBeVisible();
    await row.getByRole('button', { name: 'Connect' }).click();
    await waitForConnected(page, 'Fixture');
  });

  test('refresh records tools/list with refresh flag in Protocol Inspector', async () => {
    await openDevTools(page, 'Protocol Inspector');
    await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
    await page.keyboard.press('Escape');

    const row = page.locator('aside li').filter({ hasText: 'Fixture' });
    await row.getByRole('button', { name: 'Refresh tools' }).click();
    await expect(row.getByText('Refreshing…')).not.toBeVisible({ timeout: 15_000 });

    await openDevTools(page, 'Protocol Inspector');
    const listEntry = page.locator('span.font-mono').filter({ hasText: 'tools/list' }).first();
    await expect(listEntry).toBeVisible({ timeout: 5_000 });
    await listEntry.click();
    await expect(page.locator('text="refresh": true').first()).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Escape');
  });

  test('failed refresh shows an error and keeps the server connected', async () => {
    await page.route(/__mcp_proxy/, (route) => route.abort('failed'));
    const row = page.locator('aside li').filter({ hasText: 'Fixture' });
    await row.getByRole('button', { name: 'Refresh tools' }).click();
    await expect(row.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
    await expect(row.locator('.bg-emerald-400')).toBeVisible();
    await page.unroute(/__mcp_proxy/);
    await row.getByRole('button', { name: 'Refresh tools' }).click();
    await expect(row.getByText('Refreshing…')).not.toBeVisible({ timeout: 15_000 });
    await expect(row.locator('[role="alert"]')).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe.serial('§3.30 — Refresh re-runs meta-tool discovery', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addAwesomeServer(page);
    await page.locator('aside + aside').getByText('search_tools').first().click();
    await page.getByRole('button', { name: /discover/i }).first().click();
    await page.waitForTimeout(3_000);
    await expect(page.locator('text=/discovered|found/i').first()).toBeVisible({ timeout: 15_000 });
  });

  test.afterAll(() => ctx.close());

  test('Refresh from the server list re-runs discovery', async () => {
    const row = page.locator('aside li').filter({ hasText: 'awesome-mcp-servers' });
    await row.getByRole('button', { name: 'Refresh tools' }).click();
    await expect(row.getByText('Refreshing…')).toBeVisible({ timeout: 3_000 });
    await expect(row.getByText('Refreshing…')).not.toBeVisible({ timeout: 60_000 });
    await expect(page.locator('text=/discovered|found/i').first()).toBeVisible({ timeout: 10_000 });
  });
});
