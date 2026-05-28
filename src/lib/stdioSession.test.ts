import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startStdioSession, stopStdioSession } from './stdioSession';
import type { ServerStdioConfig } from '../types';

describe('stdioSession', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs start payload to bridge', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    const stdio: ServerStdioConfig = { command: 'node', args: ['server.mjs'] };
    await startStdioSession('srv-1', stdio, { FOO: 'bar' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/__mcp_stdio/srv-1/start',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'node',
          args: ['server.mjs'],
          cwd: undefined,
          env: { FOO: 'bar' },
        }),
      }),
    );
  });

  it('throws friendly error when bridge returns 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' });
    await expect(
      startStdioSession('x', { command: 'node', args: [] }, {}),
    ).rejects.toThrow(/local explorer server/i);
  });

  it('DELETEs session on stop', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    await stopStdioSession('srv-1');
    expect(fetchMock).toHaveBeenCalledWith('/__mcp_stdio/srv-1', { method: 'DELETE' });
  });
});
