import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createElectronMcpHost, type ElectronBridge, type IpcEnvelope } from './mcpElectron';

type InvokeMock = Mock<(channel: string, ...args: unknown[]) => Promise<IpcEnvelope<unknown>>>;
type SubscribeMock = Mock<(handler: (serverId: string) => void) => () => void>;

type BridgeMock = ElectronBridge & {
  invoke: InvokeMock;
  onToolsChanged: SubscribeMock;
  onClosed: SubscribeMock;
};

function makeBridge(overrides: Partial<BridgeMock> = {}): BridgeMock {
  const invoke: InvokeMock = vi.fn(async (channel) => {
    if (channel === 'mcp:listTools') return { ok: true, value: [{ name: 'echo' }] };
    return { ok: true, value: undefined };
  });
  const onToolsChanged: SubscribeMock = vi.fn(() => () => {});
  const onClosed: SubscribeMock = vi.fn(() => () => {});
  return {
    kind: 'electron' as const,
    invoke,
    onToolsChanged,
    onClosed,
    ...overrides,
  };
}

let bridge: ReturnType<typeof makeBridge>;

beforeEach(() => {
  bridge = makeBridge();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('connect', () => {
  it('invokes the connect channel', async () => {
    const host = createElectronMcpHost(bridge);
    await host.connect('srv-1', 'https://example.com/mcp', undefined, true);

    expect(bridge.invoke).toHaveBeenCalledWith(
      'mcp:connect',
      'srv-1',
      'https://example.com/mcp',
      undefined,
    );
  });

  it('does NOT forward proxyThroughLocal — Electron never proxies', async () => {
    const host = createElectronMcpHost(bridge);
    await host.connect('srv-1', 'https://example.com/mcp', undefined, true);

    const args = bridge.invoke.mock.calls[0];
    expect(args).toHaveLength(4);
  });

  it('marks the server connected in the local mirror', async () => {
    const host = createElectronMcpHost(bridge);
    expect(host.isConnected('srv-1')).toBe(false);
    await host.connect('srv-1', 'https://example.com/mcp', undefined, true);
    expect(host.isConnected('srv-1')).toBe(true);
  });

  it('leaves the mirror clear when connect fails', async () => {
    bridge.invoke = vi.fn(async () => ({
      ok: false,
      error: { code: 'E_CONNECT', message: 'refused' },
    }));
    const host = createElectronMcpHost(bridge);

    await expect(host.connect('srv-1', 'https://x/mcp', undefined, true)).rejects.toThrow(
      'refused',
    );
    expect(host.isConnected('srv-1')).toBe(false);
  });

  it('surfaces the error code', async () => {
    bridge.invoke = vi.fn(async () => ({
      ok: false,
      error: { code: 'E_CONNECT', message: 'refused' },
    }));
    const host = createElectronMcpHost(bridge);

    await expect(host.connect('srv-1', 'https://x/mcp', undefined, true)).rejects.toMatchObject({
      code: 'E_CONNECT',
    });
  });
});

describe('disconnect', () => {
  it('clears the mirror', async () => {
    const host = createElectronMcpHost(bridge);
    await host.connect('srv-1', 'https://x/mcp', undefined, true);
    await host.disconnect('srv-1');
    expect(host.isConnected('srv-1')).toBe(false);
  });
});

describe('connectStdio', () => {
  it('forwards the stdio config and env', async () => {
    const host = createElectronMcpHost(bridge);
    const stdio = { command: 'node', args: ['s.mjs'] };
    await host.connectStdio('srv-2', stdio, { FOO: 'bar' });

    expect(bridge.invoke).toHaveBeenCalledWith('mcp:connectStdio', 'srv-2', stdio, {
      FOO: 'bar',
    });
    expect(host.isConnected('srv-2')).toBe(true);
  });
});

describe('onToolsChanged', () => {
  it('only fires the handler for the matching server', async () => {
    let push: ((serverId: string) => void) | null = null;
    bridge.onToolsChanged = vi.fn((handler: (serverId: string) => void) => {
      push = handler;
      return () => {};
    });

    const host = createElectronMcpHost(bridge);
    const handler = vi.fn();
    host.onToolsChanged('srv-1', handler);

    push!('srv-2');
    expect(handler).not.toHaveBeenCalled();

    push!('srv-1');
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('listResources', () => {
  it('returns the resourceTemplates shape mcpClient expects', async () => {
    bridge.invoke = vi.fn(async () => ({
      ok: true,
      value: { resources: [{ uri: 'file:///a' }], resourceTemplates: [] },
    }));
    const host = createElectronMcpHost(bridge);

    const result = await host.listResources('srv-1');
    expect(result.resources).toHaveLength(1);
    expect(result.resourceTemplates).toEqual([]);
  });
});
