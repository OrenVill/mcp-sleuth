import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STDIO_BRIDGE_PREFIX,
  guardStdioRequest,
  handleStdioBridge,
  isLoopbackRequest,
  isValidServerId,
  parseStdioPath,
  startSession,
  stopSession,
} from './stdio-bridge.js';

const fixtureScript = join(
  dirname(fileURLToPath(import.meta.url)),
  'tests/fixtures/stdio-mcp-server.mjs',
);

describe('stdio-bridge routing', () => {
  it('isValidServerId accepts slug ids', () => {
    expect(isValidServerId('fixture-server')).toBe(true);
    expect(isValidServerId('../etc')).toBe(false);
  });

  it('isLoopbackRequest allows loopback remote addresses', () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: {} })).toBe(true);
    expect(isLoopbackRequest({ socket: { remoteAddress: '::1' }, headers: {} })).toBe(true);
    expect(isLoopbackRequest({ socket: { remoteAddress: '10.0.0.5' }, headers: {} })).toBe(false);
  });

  it('parseStdioPath extracts action', () => {
    expect(parseStdioPath(`${STDIO_BRIDGE_PREFIX}/my-id/start`)).toEqual({
      serverId: 'my-id',
      action: 'start',
    });
    expect(parseStdioPath(`${STDIO_BRIDGE_PREFIX}/my-id/mcp`)).toEqual({
      serverId: 'my-id',
      action: 'mcp',
    });
    expect(parseStdioPath(`${STDIO_BRIDGE_PREFIX}/my-id`)).toEqual({
      serverId: 'my-id',
      action: 'stop',
    });
    expect(parseStdioPath('/__mcp_proxy')).toBeNull();
  });
});

/** A request as Sleuth's own page makes it. */
function pageRequest({ headers = {}, ...overrides } = {}) {
  return {
    method: 'POST',
    url: `${STDIO_BRIDGE_PREFIX}/fixture/start`,
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
    headers: {
      host: '127.0.0.1:4173',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      ...headers,
    },
  };
}

function recordingRes() {
  return {
    statusCode: 0,
    body: '',
    headersSent: false,
    writeHead(status) {
      this.statusCode = status;
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    },
  };
}

describe('guardStdioRequest', () => {
  it('admits the app page starting a session', () => {
    expect(guardStdioRequest(pageRequest(), 'start')).toEqual({ ok: true });
  });

  it('refuses a cross-site request from the same machine', () => {
    // The socket is still 127.0.0.1: the browser makes the request on the
    // attacker page's behalf. This was a drive-by remote code execution.
    const req = pageRequest({ headers: { 'sec-fetch-site': 'cross-site' } });
    expect(guardStdioRequest(req, 'start')).toEqual({ ok: false, reason: 'origin' });
  });

  it('refuses a start that dodges preflight with a simple content type', () => {
    const req = pageRequest({ headers: { 'content-type': 'text/plain;charset=UTF-8' } });
    expect(guardStdioRequest(req, 'start')).toEqual({ ok: false, reason: 'content-type' });
  });

  it('refuses a rebound hostname even when the browser calls it same-origin', () => {
    const req = pageRequest({ headers: { host: 'rebind.evil.example:4173' } });
    expect(guardStdioRequest(req, 'start', { host: '127.0.0.1', port: 4173 })).toEqual({
      ok: false,
      reason: 'host',
    });
  });

  it('still refuses a non-loopback peer outright', () => {
    const req = pageRequest({ socket: { remoteAddress: '10.0.0.5' } });
    expect(guardStdioRequest(req, 'start')).toEqual({ ok: false, reason: 'loopback' });
  });

  it('does not demand JSON on the routes that are not /start', () => {
    const req = pageRequest({ method: 'GET', headers: { 'content-type': undefined } });
    expect(guardStdioRequest(req, 'mcp')).toEqual({ ok: true });
  });
});

describe('handleStdioBridge provenance', () => {
  it('never reaches the spawner for a cross-origin start', async () => {
    const res = recordingRes();
    await handleStdioBridge(
      pageRequest({ headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' } }),
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatch(/only for the Sleuth page/i);
  });
});

describe('stdio-bridge integration', () => {
  it(
    'starts session and lists tools via stdio client',
    async () => {
      const serverId = `fixture-${process.pid}-${Date.now()}`;
      let session;
      try {
        session = await startSession(serverId, {
          command: process.execPath,
          args: [fixtureScript],
        });
        const result = await session.stdioClient.listTools();
        expect(result.tools.some((tool) => tool.name === 'echo')).toBe(true);
      } finally {
        await stopSession(serverId);
      }
    },
    30_000,
  );
});
