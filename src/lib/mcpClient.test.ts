import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProtocolTraces, getProtocolTraces } from './protocolTrace';
import { resetHost, setHost } from './host';
import type { Host, McpHost } from './host/types';

function makeFakeMcp(overrides: Partial<McpHost> = {}): McpHost {
  return {
    connect: vi.fn(async () => undefined),
    connectStdio: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    isConnected: vi.fn(() => true),
    listTools: vi.fn(async () => [{ name: 'echo', description: 'Echo' }]),
    callTool: vi.fn(async () => ({ content: [] })),
    listResources: vi.fn(async () => ({ resources: [], resourceTemplates: [] })),
    readResource: vi.fn(async () => ({ contents: [] })),
    listPrompts: vi.fn(async () => []),
    getPrompt: vi.fn(async () => []),
    onToolsChanged: vi.fn(() => () => {}),
    ...overrides,
  } as unknown as McpHost;
}

function install(mcp: McpHost): void {
  setHost({ kind: 'browser', mcp, files: { saveFile: vi.fn() } } as unknown as Host);
}

let mcp: McpHost;

beforeEach(() => {
  clearProtocolTraces();
  mcp = makeFakeMcp();
  install(mcp);
});

afterEach(() => {
  resetHost();
  vi.clearAllMocks();
});

describe('connect', () => {
  it('delegates to the host and returns its tool list', async () => {
    const { connect } = await import('./mcpClient');
    const tools = await connect('srv-1', 'https://example.com/mcp', undefined, true);

    expect(mcp.connect).toHaveBeenCalledWith('srv-1', 'https://example.com/mcp', undefined, true);
    expect(tools).toEqual([{ name: 'echo', description: 'Echo' }]);
  });

  it('traces initialize then tools/list', async () => {
    const { connect } = await import('./mcpClient');
    await connect('srv-1', 'https://example.com/mcp', undefined, true);

    const methods = getProtocolTraces().map((e) => e.method);
    expect(methods).toContain('initialize');
    expect(methods).toContain('tools/list');
  });
});

describe('connectStdio', () => {
  it('traces initialize with the command instead of a bridge URL', async () => {
    const { connectStdio } = await import('./mcpClient');
    await connectStdio('srv-1', { command: 'node', args: ['server.mjs'] }, { FOO: 'bar' });

    expect(mcp.connectStdio).toHaveBeenCalledWith(
      'srv-1',
      { command: 'node', args: ['server.mjs'] },
      { FOO: 'bar' },
    );

    const initialize = getProtocolTraces().find((e) => e.method === 'initialize');
    expect(initialize?.params).toEqual({
      transport: 'stdio',
      command: 'node',
      args: ['server.mjs'],
    });
  });

  it('never puts env in the trace', async () => {
    const { connectStdio } = await import('./mcpClient');
    await connectStdio('srv-1', { command: 'node', args: [] }, { SECRET: 'hunter2' });

    expect(JSON.stringify(getProtocolTraces())).not.toContain('hunter2');
  });
});

describe('callTool', () => {
  it('traces tools/call', async () => {
    const { callTool } = await import('./mcpClient');
    await callTool('srv-1', 'echo', { text: 'hi' });

    expect(mcp.callTool).toHaveBeenCalledWith('srv-1', 'echo', { text: 'hi' });
    expect(getProtocolTraces().map((e) => e.method)).toContain('tools/call');
  });

  it('throws without tracing when the server is disconnected', async () => {
    mcp = makeFakeMcp({ isConnected: vi.fn(() => false) });
    install(mcp);
    const { callTool } = await import('./mcpClient');

    await expect(callTool('srv-1', 'echo', {})).rejects.toThrow(
      'Not connected to server "srv-1"',
    );
    expect(getProtocolTraces()).toHaveLength(0);
  });
});

describe('listResources', () => {
  it('renames resourceTemplates to templates', async () => {
    mcp = makeFakeMcp({
      listResources: vi.fn(async () => ({
        resources: [{ uri: 'file:///a', name: 'a' }],
        resourceTemplates: [{ uriTemplate: 'file:///{p}', name: 't' }],
      })),
    } as unknown as Partial<McpHost>);
    install(mcp);
    const { listResources } = await import('./mcpClient');

    const result = await listResources('srv-1');
    expect(result.resources).toHaveLength(1);
    expect(result.templates).toHaveLength(1);
  });
});

describe('refetchTools', () => {
  it('returns an empty array when disconnected', async () => {
    mcp = makeFakeMcp({ isConnected: vi.fn(() => false) });
    install(mcp);
    const { refetchTools } = await import('./mcpClient');

    expect(await refetchTools('srv-1')).toEqual([]);
  });
});

describe('disconnect', () => {
  it('delegates to the host', async () => {
    const { disconnect } = await import('./mcpClient');
    await disconnect('srv-1');
    expect(mcp.disconnect).toHaveBeenCalledWith('srv-1');
  });
});
