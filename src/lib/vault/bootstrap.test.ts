import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetHost, setHost } from '../host';
import type { Host, SecretsHost } from '../host/types';
import { bootstrapVault, createVault } from './service';

let stored: unknown = null;
let autoPass: string | null = null;

function install(): void {
  const secrets: SecretsHost = {
    loadEnvelope: async () => stored,
    saveEnvelope: async (e) => {
      stored = e;
    },
    deleteEnvelope: async () => {
      stored = null;
    },
    getAutoUnlockPassphrase: async () => autoPass,
  };
  setHost({ kind: 'electron', secrets } as unknown as Host);
}

beforeEach(() => {
  stored = null;
  autoPass = null;
  install();
});

afterEach(() => {
  resetHost();
  vi.clearAllMocks();
});

describe('bootstrapVault', () => {
  it('needs setup when there is no vault and no auto-unlock', async () => {
    expect(await bootstrapVault()).toEqual({ phase: 'needs-setup' });
  });

  it('needs unlock when a vault exists and there is no auto-unlock', async () => {
    autoPass = 'device-secret';
    await createVault('device-secret', []);
    autoPass = null;

    expect(await bootstrapVault()).toEqual({ phase: 'needs-unlock' });
  });

  it('creates and unlocks a vault when auto-unlock is available', async () => {
    autoPass = 'device-secret';
    const result = await bootstrapVault();

    expect(result.phase).toBe('ready');
    expect(stored).not.toBeNull();
  });

  it('unlocks an existing vault with the device passphrase', async () => {
    autoPass = 'device-secret';
    await createVault('device-secret', [
      { id: 'srv-1', name: 'One', url: 'https://x/mcp' },
    ] as never);

    const result = await bootstrapVault();
    expect(result.phase).toBe('ready');
    if (result.phase === 'ready') {
      expect(result.servers).toHaveLength(1);
    }
  });

  it('falls back to needs-unlock when the device passphrase does not fit', async () => {
    autoPass = 'user-chose-this';
    await createVault('user-chose-this', []);
    autoPass = 'a-different-device-secret';

    expect(await bootstrapVault()).toEqual({ phase: 'needs-unlock' });
  });
});
