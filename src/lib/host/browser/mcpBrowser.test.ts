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

vi.mock('../../stdioSession', () => ({
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

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { stdioBridgeMcpUrl } from '../../stdioParse';
import { browserMcpHost, requestInitFromAuth, transportUrlForServer } from './mcpBrowser';

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

describe('requestInitFromAuth', () => {
  it('returns undefined when auth is absent or disabled', () => {
    expect(requestInitFromAuth(undefined)).toBeUndefined();
    expect(requestInitFromAuth({ method: 'none' })).toBeUndefined();
  });

  it('builds a bearer header', () => {
    const init = requestInitFromAuth({ method: 'bearer', bearerToken: 'abc' });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer abc');
  });
});

describe('browserMcpHost.connectStdio', () => {
  beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
  });

  it('starts the bridge before connecting the HTTP client', async () => {
    const stdio = { command: 'node', args: ['server.mjs'] };
    await browserMcpHost.connectStdio('srv-1', stdio, { FOO: 'bar' });

    expect(startStdioSession).toHaveBeenCalledWith('srv-1', stdio, { FOO: 'bar' });
    expect(callOrder).toEqual(['startStdio', 'clientConnect']);

    const bridgeUrl = stdioBridgeMcpUrl('srv-1', 'http://127.0.0.1:4173');
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(new URL(bridgeUrl), undefined);
  });

  it('reports the session as connected afterwards', async () => {
    await browserMcpHost.connectStdio('srv-2', { command: 'node', args: [] }, {});
    expect(browserMcpHost.isConnected('srv-2')).toBe(true);
  });
});

describe('browserMcpHost.disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops the stdio session and clears connection state', async () => {
    await browserMcpHost.connectStdio('srv-3', { command: 'node', args: [] }, {});
    await browserMcpHost.disconnect('srv-3');

    expect(stopStdioSession).toHaveBeenCalledWith('srv-3');
    expect(browserMcpHost.isConnected('srv-3')).toBe(false);
  });
});
