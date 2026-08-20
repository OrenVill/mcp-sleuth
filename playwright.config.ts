import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The suite calls DELETE /__vault_storage and writes bookmarks/history through the
// app. Without this the target is the developer's real ~/.mcp-sleuth, so running
// the tests destroys their vault and overwrites their app data.
const E2E_DATA_DIR = join(tmpdir(), 'mcp-sleuth-release-e2e');

export default defineConfig({
  testDir: './tests/release',
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
  webServer: [
    {
      command: 'npm run build && node server.js',
      url: 'http://127.0.0.1:4173',
      env: { ...process.env, MCP_SLEUTH_DATA_DIR: E2E_DATA_DIR },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // MCP fixture the live-connection specs (05 onward) connect to.
      // Uses `port` rather than `url`: GET /mcp returns 406 by design, so a
      // URL health check would never go green.
      command: 'node tests/fixtures/http-mcp-server.mjs',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
