import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer, APP_ORIGIN } from './helpers';

/**
 * §3.28 — Untrusted content from an MCP server
 *
 * Everything the app renders from a connected server is hostile input. Two
 * defences are asserted here because both used to be absent:
 *
 * - The HTML resource preview ran with `sandbox="allow-scripts"`. The sandbox
 *   held, but script still executed, and a frame that merely looks like the app
 *   is enough — Sleuth is open source, so a server can reproduce the vault
 *   unlock panel and collect what the user types into it.
 * - The page shipped no Content-Security-Policy, so nothing stood behind the
 *   markdown escaping if it were ever bypassed.
 */
test.describe.serial('§3.28 — Untrusted content from an MCP server', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
  });

  test.afterAll(() => ctx.close());

  test('the document is served with a Content-Security-Policy', async ({ request }) => {
    // Fetched out of band rather than with the shared page: navigating would
    // drop the unlocked vault the rest of this spec depends on.
    const response = await request.get(`${APP_ORIGIN}/`);
    const csp = response.headers()['content-security-policy'];
    expect(csp, 'index.html must carry a CSP').toBeTruthy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test('an HTML resource previews without executing its script', async () => {
    // The fixture's HTML resource loads /script-ran.png from a <script>. If the
    // frame ever runs script again, that request appears and this fails.
    const beacons: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('script-ran.png')) beacons.push(req.url());
    });

    await page.getByRole('button', { name: /Resources/i }).click();
    const htmlResource = page
      .locator('aside + aside ul li')
      .filter({ hasText: /page\.html/i })
      .first();
    await htmlResource.click();
    await page.getByRole('button', { name: 'Read', exact: true }).click();

    // readResource is a round trip; the toggle only renders once it lands.
    const preview = page.getByRole('button', { name: 'Preview', exact: true });
    await preview.waitFor({ state: 'visible', timeout: 10_000 });
    await preview.click();

    const frame = page.locator('iframe');
    await expect(frame).toBeVisible({ timeout: 5_000 });

    // Fully sandboxed: no scripts, no same-origin, no forms, no navigation.
    await expect(frame).toHaveAttribute('sandbox', '');
    await expect(page.getByText(/scripts and forms disabled/i)).toBeVisible();

    await page.waitForTimeout(1_000);
    expect(beacons, 'the preview must not run server-supplied script').toEqual([]);
  });

  test('the local endpoints refuse a request that did not come from the page', async ({
    request,
  }) => {
    // A request from outside the browser carries neither Sec-Fetch-Site nor a
    // matching Origin. This is the shape a hostile page's fetch has once the
    // browser labels it cross-site, and it must be refused everywhere.
    for (const path of ['/__vault_storage', '/__app_data', '/__mcp_proxy?target=http://x/']) {
      const res = await request.get(`${APP_ORIGIN}${path}`);
      expect(res.status(), `${path} must refuse an unattributed request`).toBe(403);
    }
  });

  test('the stdio bridge refuses a cross-site start', async ({ request }) => {
    // This exact request used to spawn the named process.
    const res = await request.post(`${APP_ORIGIN}/__mcp_stdio/probe/start`, {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        Origin: 'https://evil.example',
        'Sec-Fetch-Site': 'cross-site',
      },
      data: JSON.stringify({ command: 'node', args: ['-e', 'process.exit(0)'] }),
    });
    expect(res.status()).toBe(403);
  });
});
