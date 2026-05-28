import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STDIO_BRIDGE_PREFIX,
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
