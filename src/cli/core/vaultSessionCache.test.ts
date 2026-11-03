import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { deriveAesGcmKey, randomBytes } from '../../lib/vault/crypto';
import {
  VAULT_SESSION_TTL_MS,
  clearVaultSession,
  resetVaultSessionMemoryForTests,
  loadCachedAesKey,
  rememberUnlockedVault,
  touchVaultSession,
} from './vaultSessionCache';

const fileStore = new Map<string, string>();

vi.mock('../../../data-dir.js', () => ({
  getDataDir: () => '/data',
  writePrivateFile: vi.fn(async (filePath: string, data: string) => {
    fileStore.set(filePath, data);
  }),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(async (filePath: string, encoding?: string) => {
      if (fileStore.has(filePath)) {
        const data = fileStore.get(filePath)!;
        return encoding ? data : Buffer.from(data);
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    unlink: vi.fn(async (filePath: string) => {
      fileStore.delete(filePath);
    }),
  };
});

async function sampleAesKey(): Promise<CryptoKey> {
  return deriveAesGcmKey('cli-session-test', randomBytes(16), 1000);
}

const SESSION_PATH = '/data/cli-vault-session.json';

describe('vault session TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a 30-minute window', () => {
    const start = Date.now();
    vi.advanceTimersByTime(VAULT_SESSION_TTL_MS - 1);
    expect(Date.now() - start).toBeLessThan(VAULT_SESSION_TTL_MS);
    vi.advanceTimersByTime(1);
    expect(Date.now() - start).toBe(VAULT_SESSION_TTL_MS);
  });
});

describe('vault session cache', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    fileStore.clear();
    delete process.env.MCP_DETECTIVE_VAULT_PASSPHRASE;
    await clearVaultSession();
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.MCP_DETECTIVE_VAULT_PASSPHRASE;
    await clearVaultSession();
    fileStore.clear();
  });

  it('persists an unlocked vault for 30 minutes', async () => {
    const key = await sampleAesKey();
    await rememberUnlockedVault(key);

    const raw = fileStore.get(SESSION_PATH);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as { expiresAt: number };
    expect(parsed.expiresAt).toBe(Date.now() + VAULT_SESSION_TTL_MS);
  });

  it('reloads the cached key in a new process-like invocation', async () => {
    const key = await sampleAesKey();
    await rememberUnlockedVault(key);
    resetVaultSessionMemoryForTests();

    const cached = await loadCachedAesKey({});
    expect(cached).not.toBeNull();
    const exported = await crypto.subtle.exportKey('raw', cached!);
    const original = await crypto.subtle.exportKey('raw', key);
    expect(new Uint8Array(exported)).toEqual(new Uint8Array(original));
  });

  it('slides expiry forward on touch (each CLI command)', async () => {
    const key = await sampleAesKey();
    await rememberUnlockedVault(key);
    const first = JSON.parse(fileStore.get(SESSION_PATH)!) as { expiresAt: number };

    vi.advanceTimersByTime(5 * 60 * 1000);
    await touchVaultSession();

    const second = JSON.parse(fileStore.get(SESSION_PATH)!) as { expiresAt: number };
    expect(second.expiresAt).toBeGreaterThan(first.expiresAt);
    expect(second.expiresAt).toBe(Date.now() + VAULT_SESSION_TTL_MS);
  });

  it('returns null when the session file is expired', async () => {
    const key = await sampleAesKey();
    await rememberUnlockedVault(key);
    vi.advanceTimersByTime(VAULT_SESSION_TTL_MS + 1);

    const cached = await loadCachedAesKey({});
    expect(cached).toBeNull();
  });

  it('skips cache when MCP_DETECTIVE_VAULT_PASSPHRASE is set', async () => {
    const key = await sampleAesKey();
    await rememberUnlockedVault(key);
    process.env.MCP_DETECTIVE_VAULT_PASSPHRASE = 'scripted';

    const cached = await loadCachedAesKey({});
    expect(cached).toBeNull();
  });

  it('touchVaultSession reads from disk when memory was cleared', async () => {
    const key = await sampleAesKey();
    await rememberUnlockedVault(key);
    resetVaultSessionMemoryForTests();

    vi.advanceTimersByTime(60_000);
    await touchVaultSession();
    const updated = JSON.parse(fileStore.get(SESSION_PATH)!) as { expiresAt: number };
    expect(updated.expiresAt).toBe(Date.now() + VAULT_SESSION_TTL_MS);
  });
});
