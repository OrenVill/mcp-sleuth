import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: { trace: 'on-first-retry' },
  // Only the fixtures — the Electron app serves its own renderer over app://.
  webServer: [
    {
      command: 'node tests/fixtures/http-mcp-server.mjs',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // TLS fixture for 09-self-signed-tls, with a certificate no CA signed.
      // `port` not `url`: a URL health check would have to trust it.
      command: 'node tests/fixtures/https-mcp-server.mjs 3004',
      port: 3004,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Scripted OpenAI-compatible model for 08-agent-chat.
      // 3003, not 3002: playwright.config.ts runs meta-mcp-server.mjs on 3002,
      // and `reuseExistingServer` would let this fixture silently stand in for it.
      command: 'node tests/fixtures/llm-server.mjs 3003',
      url: 'http://127.0.0.1:3003/v1/models',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
