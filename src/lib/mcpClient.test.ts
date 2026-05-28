import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callOrder, startStdioSession, stopStdioSession, clientConnect } = vi.hoisted(() => {
  const callOrder: string[] = [];
  const startStdioSession = vi.fn(async () => {
    callOrder.push('startStdio');
  });
  const stopStdioSession = vi.fn(async () => undefined);
  const clientConnect = vi.fn(async () => {
    callOrder.push('clientConnect');
  });
  return { callOrder, startStdioSession, stopStdioSession, clientConnect };
});

vi.mock('./stdioSession', () => ({
  startStdioSession,
  stopStdioSession,
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(function Client() {
    return {
      connect: clientConnect,
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'echo', description: 'Echo' }] }),
      close: vi.fn().mockResolvedValue(undefined),
      setNotificationHandler: vi.fn(),
    };
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(function StreamableHTTPClientTransport() {
    return { close: vi.fn().mockResolvedValue(undefined) };
  }),
}));

import { connectStdio, disconnect, transportUrlForServer } from './mcpClient';
import { stdioBridgeMcpUrl } from './stdioParse';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

describe('transportUrlForServer', () => {
  it('routes through the local proxy by default', () => {
    const url = transportUrlForServer(
      'https://example.com/mcp?tenant=a',
      undefined,
      'http://127.0.0.1:4173',
    );

    expect(url.toString()).toBe(
      'http://127.0.0.1:4173/__mcp_proxy?target=https%3A%2F%2Fexample.com%2Fmcp%3Ftenant%3Da',
    );
  });

  it('uses the real server URL when local proxying is disabled', () => {
    const url = transportUrlForServer(
      'https://example.com/mcp',
      false,
      'http://127.0.0.1:4173',
    );

    expect(url.toString()).toBe('https://example.com/mcp');
  });
});

describe('connectStdio', () => {
  beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
  });

  it('starts bridge then connects HTTP client', async () => {
    const stdio = { command: 'node', args: ['server.mjs'] };
    const tools = await connectStdio('srv-1', stdio, { FOO: 'bar' });

    expect(startStdioSession).toHaveBeenCalledWith('srv-1', stdio, { FOO: 'bar' });
    expect(callOrder).toEqual(['startStdio', 'clientConnect']);
    expect(tools).toEqual([{ name: 'echo', description: 'Echo' }]);

    const bridgeUrl = stdioBridgeMcpUrl('srv-1', 'http://127.0.0.1:4173');
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      new URL(bridgeUrl),
      undefined,
    );
  });
});

describe('disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops stdio session after client teardown', async () => {
    await disconnect('srv-1');
    expect(stopStdioSession).toHaveBeenCalledWith('srv-1');
  });
});
