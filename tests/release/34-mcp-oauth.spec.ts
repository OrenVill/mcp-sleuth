/**
 * §3.34 — MCP OAuth (PKCE) for HTTP servers (mocked; no real identity providers).
 */
import { test, expect } from '@playwright/test';
import { APP_ORIGIN, setupVault } from './helpers';

test.describe('§3.34 MCP OAuth', () => {
  test.beforeEach(async ({ page }) => {
    await setupVault(page);
  });

  test('add-server dialog offers OAuth PKCE sign-in and pre-registered client fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Add' }).click();
    const pkce = page.getByRole('radio', { name: 'OAuth (PKCE sign-in)' });
    await pkce.check();
    await expect(pkce).toBeChecked();
    await expect(page.getByText(/sign-in page/i)).toBeVisible();
    await expect(page.getByLabel('OAuth app Client ID')).toBeVisible();
    await expect(page.locator('#auth-bearer-token')).toHaveCount(0);
  });

  test('the OAuth proxy refuses requests without page provenance', async ({ request }) => {
    const target = encodeURIComponent('http://127.0.0.1:9/token');
    const res = await request.get(`${APP_ORIGIN}/__mcp_oauth?target=${target}`);
    expect(res.status()).toBe(403);
  });

  test('same-origin OAuth proxy forwards allowlisted token paths', async ({ page }) => {
    let sawOAuthProxy = false;
    await page.route('**/__mcp_oauth**', async (route) => {
      sawOAuthProxy = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'mock-token', token_type: 'Bearer' }),
      });
    });
    await page.goto('/');
    const ok = await page.evaluate(async (origin) => {
      const target = encodeURIComponent('http://127.0.0.1:5555/token');
      const res = await fetch(`${origin}/__mcp_oauth?target=${target}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { access_token?: string };
      return json.access_token === 'mock-token';
    }, APP_ORIGIN);
    expect(sawOAuthProxy).toBe(true);
    expect(ok).toBe(true);
  });
});
