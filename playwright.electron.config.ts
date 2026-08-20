import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: { trace: 'on-first-retry' },
  webServer: {
    // Only the MCP fixture — the Electron app serves its own renderer over app://.
    command: 'node tests/fixtures/http-mcp-server.mjs',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
