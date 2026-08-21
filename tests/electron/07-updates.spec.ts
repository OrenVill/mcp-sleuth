import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { closeApp, launchApp, setupVault, type LaunchedApp } from './helpers';

/**
 * §3.25 — update notifications (desktop).
 *
 * The app is pointed at a local stand-in for GitHub's /releases/latest through
 * MCP_SLEUTH_UPDATE_FEED_URL, so these run offline and announce whatever the
 * test wants. Nothing is ever downloaded or installed: the builds are unsigned,
 * so the notifier only ever opens the release page.
 */

const INSTALLED_VERSION: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
const NEWER_VERSION = '99.0.0';

function releasePayload(version: string) {
  return {
    tag_name: `v${version}`,
    name: `v${version}`,
    draft: false,
    prerelease: false,
    html_url: `https://github.com/OrenVill/mcp-sleuth/releases/tag/v${version}`,
    published_at: new Date().toISOString(),
    body: '### Features\n\n* **updates:** notify on a new release',
  };
}

let server: Server;
let feedUrl: string;
/** Flipped per-test, so one server can serve every scenario. */
let respond: (res: import('node:http').ServerResponse) => void;

test.beforeAll(async () => {
  server = createServer((_req, res) => respond(res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  feedUrl = `http://127.0.0.1:${port}/releases/latest`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function serveRelease(version: string): void {
  respond = (res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(releasePayload(version)));
  };
}

async function launchAgainstFeed(dataDir?: string): Promise<LaunchedApp> {
  return launchApp({ dataDir, env: { MCP_SLEUTH_UPDATE_FEED_URL: feedUrl } });
}

test.describe('§3.25 update notifications', () => {
  test('announces a newer release in a banner', async () => {
    serveRelease(NEWER_VERSION);
    const launched = await launchAgainstFeed();
    try {
      await setupVault(launched.page);

      const banner = launched.page.getByTestId('update-banner');
      await expect(banner).toBeVisible({ timeout: 20_000 });
      await expect(banner).toContainText(`Sleuth ${NEWER_VERSION}`);
      await expect(banner).toContainText(INSTALLED_VERSION);
      await expect(banner.getByRole('button', { name: 'Download' })).toBeVisible();
    } finally {
      await closeApp(launched);
    }
  });

  test('expands the release notes in place', async () => {
    serveRelease(NEWER_VERSION);
    const launched = await launchAgainstFeed();
    try {
      await setupVault(launched.page);
      const banner = launched.page.getByTestId('update-banner');
      await expect(banner).toBeVisible({ timeout: 20_000 });

      await banner.getByRole('button', { name: /What's new/ }).click();
      await expect(launched.page.getByTestId('update-release-notes')).toContainText('notify');
    } finally {
      await closeApp(launched);
    }
  });

  test('the header pill turns into the new version and offers the controls', async () => {
    serveRelease(NEWER_VERSION);
    const launched = await launchAgainstFeed();
    try {
      await setupVault(launched.page);
      const pill = launched.page.getByTestId('version-pill');
      await expect(pill).toContainText(NEWER_VERSION, { timeout: 20_000 });

      await pill.click();
      const popover = launched.page.getByTestId('version-popover');
      await expect(popover).toContainText(`Sleuth ${INSTALLED_VERSION}`);
      await expect(popover.getByRole('checkbox')).toBeChecked();
      await expect(popover.getByRole('button', { name: 'Check now' })).toBeVisible();
    } finally {
      await closeApp(launched);
    }
  });

  test('shows the installed version and no banner when up to date', async () => {
    serveRelease(INSTALLED_VERSION);
    const launched = await launchAgainstFeed();
    try {
      await setupVault(launched.page);
      const pill = launched.page.getByTestId('version-pill');
      await expect(pill).toContainText(`v${INSTALLED_VERSION}`);

      await pill.click();
      await expect(launched.page.getByTestId('version-popover')).toContainText('Up to date');
      await expect(launched.page.getByTestId('update-banner')).toHaveCount(0);
    } finally {
      await closeApp(launched);
    }
  });

  test('Later hides the banner but keeps the badge, and the choice survives a restart', async () => {
    serveRelease(NEWER_VERSION);
    const launched = await launchAgainstFeed();
    const dataDir = launched.dataDir;
    try {
      await setupVault(launched.page);
      const banner = launched.page.getByTestId('update-banner');
      await expect(banner).toBeVisible({ timeout: 20_000 });

      await banner.getByRole('button', { name: 'Later' }).click();
      await expect(banner).toHaveCount(0);
      // The badge is the reminder that replaces it.
      await expect(launched.page.getByTestId('version-pill')).toContainText(NEWER_VERSION);
    } finally {
      await closeApp(launched, { keepDataDir: true });
    }

    const relaunched = await launchAgainstFeed(dataDir);
    try {
      await relaunched.page.getByLabel('Passphrase', { exact: true }).waitFor({ timeout: 20_000 });
      // The dismissal is recorded on disk, beside window-state.json.
      const state = JSON.parse(readFileSync(`${dataDir}/update-state.json`, 'utf8'));
      expect(state.dismissedVersion).toBe(NEWER_VERSION);
    } finally {
      await closeApp(relaunched);
    }
  });

  test('Skip silences the badge too, and is written to update-state.json', async () => {
    serveRelease(NEWER_VERSION);
    const launched = await launchAgainstFeed();
    try {
      await setupVault(launched.page);
      const banner = launched.page.getByTestId('update-banner');
      await expect(banner).toBeVisible({ timeout: 20_000 });

      await banner.getByRole('button', { name: 'Skip' }).click();
      await expect(banner).toHaveCount(0);
      await expect(launched.page.getByTestId('version-pill')).toContainText(
        `v${INSTALLED_VERSION}`,
      );

      const state = JSON.parse(readFileSync(`${launched.dataDir}/update-state.json`, 'utf8'));
      expect(state.skippedVersion).toBe(NEWER_VERSION);
    } finally {
      await closeApp(launched);
    }
  });

  test('the automatic check can be switched off, and that persists', async () => {
    serveRelease(NEWER_VERSION);
    const launched = await launchAgainstFeed();
    try {
      await setupVault(launched.page);
      await launched.page.getByTestId('version-pill').click();

      const toggle = launched.page.getByTestId('version-popover').getByRole('checkbox');
      await expect(toggle).toBeChecked();

      // click(), not uncheck(): the box is controlled by state that round-trips
      // through IPC, so it re-renders checked for a frame before main answers.
      await toggle.click();
      await expect(toggle).not.toBeChecked();

      await expect
        .poll(
          () => JSON.parse(readFileSync(`${launched.dataDir}/update-state.json`, 'utf8')).autoCheck,
          { timeout: 10_000 },
        )
        .toBe(false);
    } finally {
      await closeApp(launched);
    }
  });

  test('a failed check reports itself only when the user asked for it', async () => {
    respond = (res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'API rate limit exceeded' }));
    };
    const launched = await launchAgainstFeed();
    try {
      await setupVault(launched.page);
      await launched.page.getByTestId('version-pill').click();

      const popover = launched.page.getByTestId('version-popover');
      // Nothing surfaced from the automatic check on startup.
      await expect(popover).not.toContainText('rate limit');

      await popover.getByRole('button', { name: 'Check now' }).click();
      await expect(popover).toContainText(/rate limit/i, { timeout: 15_000 });
    } finally {
      await closeApp(launched);
    }
  });
});
