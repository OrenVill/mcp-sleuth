import { describe, expect, it, vi } from 'vitest';
import type { ElectronBridge, IpcEnvelope } from './mcpElectron';
import { createElectronSecretsHost } from './secretsElectron';
import { createElectronFilesHost } from './filesElectron';

function bridgeReturning(value: unknown): ElectronBridge {
  return {
    kind: 'electron',
    invoke: vi.fn(async (): Promise<IpcEnvelope<unknown>> => ({ ok: true, value })),
    onToolsChanged: () => () => {},
    onClosed: () => () => {},
  };
}

describe('electron secrets host', () => {
  it('loads the envelope over IPC', async () => {
    const bridge = bridgeReturning({ format: 'vault-v1' });
    const host = createElectronSecretsHost(bridge);

    expect(await host.loadEnvelope()).toEqual({ format: 'vault-v1' });
    expect(bridge.invoke).toHaveBeenCalledWith('mcp:loadEnvelope');
  });

  it('returns the auto-unlock passphrase', async () => {
    const host = createElectronSecretsHost(bridgeReturning('device-pass'));
    expect(await host.getAutoUnlockPassphrase()).toBe('device-pass');
  });

  it('returns null when the platform has no secure store', async () => {
    const host = createElectronSecretsHost(bridgeReturning(null));
    expect(await host.getAutoUnlockPassphrase()).toBeNull();
  });

  it('never falls back to a passphrase when the keychain call fails', async () => {
    const bridge: ElectronBridge = {
      kind: 'electron',
      invoke: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'E_KEYCHAIN', message: 'denied' },
      })),
      onToolsChanged: () => () => {},
      onClosed: () => () => {},
    };
    const host = createElectronSecretsHost(bridge);

    await expect(host.getAutoUnlockPassphrase()).rejects.toThrow('denied');
  });
});

describe('electron files host', () => {
  it('sends the save request over IPC', async () => {
    const bridge = bridgeReturning('/home/u/out.md');
    const host = createElectronFilesHost(bridge);

    host.saveFile('out.md', '# hi', 'text/markdown');
    await vi.waitFor(() =>
      expect(bridge.invoke).toHaveBeenCalledWith('mcp:saveFile', 'out.md', '# hi', 'text/markdown'),
    );
  });

  it('round-trips app data', async () => {
    const bridge = bridgeReturning({ version: 1 });
    const host = createElectronFilesHost(bridge);

    expect(await host.readAppData()).toEqual({ version: 1 });
  });
});
