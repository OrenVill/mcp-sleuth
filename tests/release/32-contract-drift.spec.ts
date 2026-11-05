import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, openDevTools } from './helpers';

test.describe.serial('§3.32 — Contract drift snapshots and diff', () => {
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

  test('Contract Drift tab captures a snapshot and shows drift summary', async () => {
    await openDevTools(page, 'Contract Drift');
    await page.getByPlaceholder('e.g. before upgrade').fill('release baseline');
    await page.getByRole('button', { name: 'Capture snapshot' }).click();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/Saved snapshots|release baseline/i);
    expect(bodyText).toMatch(/unchanged/i);
    await page.keyboard.press('Escape');
  });
});
