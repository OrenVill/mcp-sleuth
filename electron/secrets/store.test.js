import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSecretsStore, isSecureBackend } from './store.js';

function fakeSafeStorage({ available = true, backend = 'gnome_libsecret' } = {}) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    // Obscures the plaintext the way a real keychain does, so the
    // "never writes the passphrase in the clear" assertion is meaningful.
    encryptString: (s) => Buffer.from(`sealed:${Buffer.from(s, 'utf8').toString('hex')}`, 'utf8'),
    decryptString: (b) =>
      Buffer.from(b.toString('utf8').replace(/^sealed:/, ''), 'hex').toString('utf8'),
  };
}

function fakeFs() {
  const files = new Map();
  return {
    files,
    readFile: vi.fn(async (p) => {
      if (!files.has(p)) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return files.get(p);
    }),
    writeFile: vi.fn(async (p, data) => {
      files.set(p, Buffer.isBuffer(data) ? data : Buffer.from(data));
    }),
    unlink: vi.fn(async (p) => {
      files.delete(p);
    }),
    mkdir: vi.fn(async () => undefined),
  };
}

describe('isSecureBackend', () => {
  it('accepts a real keyring', () => {
    expect(isSecureBackend(fakeSafeStorage({ backend: 'gnome_libsecret' }))).toBe(true);
  });

  it('rejects basic_text — it encrypts with a hardcoded key', () => {
    expect(isSecureBackend(fakeSafeStorage({ backend: 'basic_text' }))).toBe(false);
  });

  it('rejects an unavailable store', () => {
    expect(isSecureBackend(fakeSafeStorage({ available: false }))).toBe(false);
  });
});

describe('getAutoUnlockPassphrase', () => {
  let fs;
  let store;

  beforeEach(() => {
    fs = fakeFs();
    store = createSecretsStore({
      fs,
      safeStorage: fakeSafeStorage(),
      vaultPath: '/data/vault.json',
      devicePath: '/data/device-key.bin',
    });
  });

  it('generates and seals a passphrase on first call', async () => {
    const pass = await store.getAutoUnlockPassphrase();

    expect(typeof pass).toBe('string');
    expect(pass.length).toBeGreaterThanOrEqual(32);
    expect(fs.writeFile).toHaveBeenCalled();
    expect(fs.files.get('/data/device-key.bin').toString('utf8')).toContain('sealed:');
  });

  it('returns the same passphrase on the next call', async () => {
    const first = await store.getAutoUnlockPassphrase();
    fs.writeFile.mockClear();
    const second = await store.getAutoUnlockPassphrase();

    expect(second).toBe(first);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('never writes the passphrase in the clear', async () => {
    const pass = await store.getAutoUnlockPassphrase();
    const onDisk = fs.files.get('/data/device-key.bin').toString('utf8');

    expect(onDisk).not.toContain(pass);
  });

  it('returns null when there is no secure backend', async () => {
    const insecure = createSecretsStore({
      fs,
      safeStorage: fakeSafeStorage({ available: false, backend: 'basic_text' }),
      vaultPath: '/data/vault.json',
      devicePath: '/data/device-key.bin',
    });

    expect(await insecure.getAutoUnlockPassphrase()).toBeNull();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('envelope storage', () => {
  let fs;
  let store;

  beforeEach(() => {
    fs = fakeFs();
    store = createSecretsStore({
      fs,
      safeStorage: fakeSafeStorage(),
      vaultPath: '/data/vault.json',
      devicePath: '/data/device-key.bin',
    });
  });

  it('returns null when no vault file exists', async () => {
    expect(await store.loadEnvelope()).toBeNull();
  });

  it('round-trips an envelope as JSON', async () => {
    await store.saveEnvelope({ format: 'vault-v1', cipher: { ivB64: 'x' } });
    expect(await store.loadEnvelope()).toEqual({
      format: 'vault-v1',
      cipher: { ivB64: 'x' },
    });
  });

  it('returns null for a corrupt vault file rather than throwing', async () => {
    fs.files.set('/data/vault.json', Buffer.from('not json', 'utf8'));
    expect(await store.loadEnvelope()).toBeNull();
  });

  it('deletes the vault file', async () => {
    await store.saveEnvelope({ a: 1 });
    await store.deleteEnvelope();
    expect(await store.loadEnvelope()).toBeNull();
  });
});
