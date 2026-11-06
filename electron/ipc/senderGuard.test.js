import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { isTrustedSender } from './senderGuard.js';

describe('isTrustedSender', () => {
  const ev = (url) => ({ senderFrame: { url } });

  beforeEach(() => {
    delete process.env.MCP_DETECTIVE_DEV_URL;
    delete process.env.MCP_SLEUTH_DEV_URL;
  });

  afterEach(() => {
    delete process.env.MCP_DETECTIVE_DEV_URL;
    delete process.env.MCP_SLEUTH_DEV_URL;
  });

  it('trusts the packaged app origin', () => {
    expect(isTrustedSender(ev('app://mcp-detective/index.html'))).toBe(true);
  });

  it('trusts the frame when MCP_DETECTIVE_DEV_URL matches (npm run electron:dev)', () => {
    process.env.MCP_DETECTIVE_DEV_URL = 'http://localhost:5173';
    expect(isTrustedSender(ev('http://localhost:5173/'))).toBe(true);
  });

  it('still trusts MCP_SLEUTH_DEV_URL for renamed installs', () => {
    process.env.MCP_SLEUTH_DEV_URL = 'http://127.0.0.1:5173';
    expect(isTrustedSender(ev('http://127.0.0.1:5173/'))).toBe(true);
  });

  it('uses MCP_DETECTIVE_DEV_URL when both env vars are set', () => {
    process.env.MCP_DETECTIVE_DEV_URL = 'http://localhost:5173';
    process.env.MCP_SLEUTH_DEV_URL = 'http://127.0.0.1:9999';
    expect(isTrustedSender(ev('http://localhost:5173/'))).toBe(true);
    expect(isTrustedSender(ev('http://127.0.0.1:9999/'))).toBe(false);
  });

  it('rejects a dev-server URL when no dev URL env is set', () => {
    expect(isTrustedSender(ev('http://localhost:5173/'))).toBe(false);
  });
});
