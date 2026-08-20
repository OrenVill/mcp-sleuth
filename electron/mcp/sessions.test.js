import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionManager, isValidServerId } from './sessions.js';

function fakeClient() {
  return {
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    listTools: vi.fn(async () => ({ tools: [{ name: 'echo' }] })),
    callTool: vi.fn(async () => ({ content: [] })),
    listResources: vi.fn(async () => ({ resources: [], resourceTemplates: [] })),
    readResource: vi.fn(async () => ({ contents: [] })),
    listPrompts: vi.fn(async () => ({ prompts: [] })),
    getPrompt: vi.fn(async () => ({ messages: [] })),
    setNotificationHandler: vi.fn(),
  };
}

describe('isValidServerId', () => {
  it('accepts ordinary ids', () => {
    expect(isValidServerId('srv-1')).toBe(true);
    expect(isValidServerId('a_B-9')).toBe(true);
  });

  it('rejects path traversal and separators', () => {
    expect(isValidServerId('../etc')).toBe(false);
    expect(isValidServerId('a/b')).toBe(false);
    expect(isValidServerId('')).toBe(false);
    expect(isValidServerId(null)).toBe(false);
  });
});

describe('sessionManager', () => {
  let client;
  let manager;

  beforeEach(() => {
    client = fakeClient();
    manager = createSessionManager({
      createClient: () => client,
      createHttpTransport: vi.fn(() => ({ close: vi.fn(async () => undefined) })),
      createStdioTransport: vi.fn(() => ({ close: vi.fn(async () => undefined) })),
    });
  });

  it('rejects an invalid serverId before touching the transport', async () => {
    await expect(manager.connect('../evil', 'https://x/mcp')).rejects.toThrow(
      /invalid server id/i,
    );
  });

  it('connects and reports the session', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    expect(client.connect).toHaveBeenCalled();
    expect(manager.isConnected('srv-1')).toBe(true);
  });

  it('returns the tool list', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    expect(await manager.listTools('srv-1')).toEqual([{ name: 'echo' }]);
  });

  it('throws the standard message when not connected', async () => {
    await expect(manager.callTool('srv-9', 'echo', {})).rejects.toThrow(
      'Not connected to server "srv-9"',
    );
  });

  it('closes the client on disconnect', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    await manager.disconnect('srv-1');
    expect(client.close).toHaveBeenCalled();
    expect(manager.isConnected('srv-1')).toBe(false);
  });

  it('replaces an existing session on reconnect', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    await manager.connect('srv-1', 'https://example.com/mcp');
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('renames resourceTemplates for the renderer', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    const result = await manager.listResources('srv-1');
    expect(result).toHaveProperty('resourceTemplates');
  });

  it('passes stdio params through to the transport factory', async () => {
    const createStdioTransport = vi.fn(() => ({ close: vi.fn(async () => undefined) }));
    manager = createSessionManager({
      createClient: () => client,
      createHttpTransport: vi.fn(),
      createStdioTransport,
    });

    await manager.connectStdio(
      'srv-2',
      { command: 'node', args: ['s.mjs'], cwd: '/tmp' },
      { FOO: 'bar' },
    );

    expect(createStdioTransport).toHaveBeenCalledWith({
      command: 'node',
      args: ['s.mjs'],
      cwd: '/tmp',
      env: { FOO: 'bar' },
    });
  });
});
