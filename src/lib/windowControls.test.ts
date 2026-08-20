import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { hasCustomWindowControls, windowControls } from './windowControls';

interface Envelope {
  ok: boolean;
  value?: unknown;
  error?: { code: string; message: string };
}

// Typed explicitly: an inferred mock widens `ok: true` to boolean and gives the
// call tuple zero elements, so neither the reassignments nor `calls[0][0]` typecheck.
type InvokeMock = Mock<(channel: string, ...args: unknown[]) => Promise<Envelope>>;

function installBridge(
  platform: string | undefined,
  invoke: InvokeMock = vi.fn(async () => ({ ok: true, value: true })) as InvokeMock,
) {
  const onMaximizedChanged = vi.fn(() => () => {});
  vi.stubGlobal('window', { mcpSleuth: { platform, invoke, onMaximizedChanged } });
  return { invoke, onMaximizedChanged };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('hasCustomWindowControls', () => {
  it('is false in the browser build', () => {
    vi.stubGlobal('window', {});
    expect(hasCustomWindowControls()).toBe(false);
  });

  it('is false on macOS, which keeps native traffic lights', () => {
    installBridge('darwin');
    expect(hasCustomWindowControls()).toBe(false);
  });

  it('is true on Windows and Linux, where the window is frameless', () => {
    installBridge('win32');
    expect(hasCustomWindowControls()).toBe(true);
    vi.unstubAllGlobals();
    installBridge('linux');
    expect(hasCustomWindowControls()).toBe(true);
  });
});

describe('windowControls', () => {
  it('routes each action to its channel', async () => {
    const { invoke } = installBridge('linux');

    windowControls.minimize();
    windowControls.toggleMaximize();
    windowControls.close();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));

    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      'mcp:windowMinimize',
      'mcp:windowMaximizeToggle',
      'mcp:windowClose',
    ]);
  });

  it('reports the maximized state', async () => {
    installBridge('linux', vi.fn(async () => ({ ok: true, value: true })) as InvokeMock);
    expect(await windowControls.isMaximized()).toBe(true);
  });

  it('returns null instead of throwing when the IPC call fails', async () => {
    installBridge(
      'linux',
      vi.fn(async () => ({ ok: false, error: { code: 'E_WINDOW', message: 'x' } })) as InvokeMock,
    );
    expect(await windowControls.isMaximized()).toBeNull();
  });

  it('is inert in the browser build', async () => {
    vi.stubGlobal('window', {});
    expect(await windowControls.isMaximized()).toBeNull();
    expect(() => windowControls.close()).not.toThrow();
  });

  it('subscribes to maximize changes and returns an unsubscribe', () => {
    const { onMaximizedChanged } = installBridge('linux');
    const off = windowControls.onMaximizedChanged(() => {});

    expect(onMaximizedChanged).toHaveBeenCalledOnce();
    expect(typeof off).toBe('function');
  });

  it('returns a no-op unsubscribe when there is no bridge', () => {
    vi.stubGlobal('window', {});
    expect(() => windowControls.onMaximizedChanged(() => {})()).not.toThrow();
  });
});
