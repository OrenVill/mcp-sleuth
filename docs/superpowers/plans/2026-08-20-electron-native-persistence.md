# Electron Native Persistence & Secrets (Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the desktop app OS-keychain vault auto-unlock, native save dialogs, and app data in the same `~/.mcp-explorer/` directory the CLI already uses — without changing the browser build's behaviour.

**Architecture:** Extend the Phase 1 `Host` interface with a `secrets` group and two app-data methods on `files`. The Electron implementations reach main over the Phase 2a IPC envelope. Main stores the vault at the CLI's existing `getVaultFilePath()` and seals a generated auto-unlock passphrase with `safeStorage`.

**Tech Stack:** Electron 43 `safeStorage` + `dialog`, existing `vault-file-handler.js` / `app-data-handler.js` path helpers, Vitest, Playwright `_electron`.

**Depends on:** Phase 2a, complete and merged.

**Source spec:** `docs/superpowers/specs/2026-08-20-electron-desktop-app-design.md`

---

## Verified environment facts

Checked against the installed toolchain — do not re-derive.

- `vault-file-handler.js:19` exports `getVaultFilePath()`; `app-data-handler.js:23` exports
  `getAppDataFilePath()`. Both honour `MCP_EXPLORER_DATA_DIR` and default under
  `~/.mcp-explorer/`. Electron main imports these directly, so desktop and CLI share state
  with no new path logic.
- App data on disk is **gzip**, not plain JSON (`app-data-handler.js` uses `zlib.gzip`).
- `safeStorage` exposes `isEncryptionAvailable()`, `encryptString()`, `decryptString()`, and
  `getSelectedStorageBackend()`.
- **On the development machine (WSL2, no keyring) `isEncryptionAvailable()` returns `false`
  and the backend is `basic_text`.** Auto-unlock will therefore *not* engage locally: the
  passphrase fallback is the path you will actually exercise by hand. Cover auto-unlock with
  unit tests and an injected fake, never by hoping the E2E host has a keyring.
- `src/lib/vault/vaultPersistence.ts:11` gates on `window.location.protocol !== 'file:'`.
  Under `app://` that is true, so today the Electron build issues a pointless
  `/__vault_storage` fetch that always fails before falling back to IndexedDB. This phase
  removes that.
- `src/App.tsx:130` bootstraps the vault via `getBootstrapPhase()`; `createVault`/`unlockVault`
  return a `CryptoKey` that App holds in `aesKeyRef`.

---

## Four deliberate design decisions

1. **The vault format does not change.** Electron generates a random high-entropy passphrase,
   seals it with `safeStorage`, and uses it to unlock the **existing PBKDF2 envelope**.
   `crypto.ts`, `envelope.ts`, and the encryption itself are untouched, so a vault file stays
   portable between the CLI and the desktop app.

2. **`basic_text` counts as unavailable.** A secure store is required to be *both*
   `isEncryptionAvailable()` and a backend other than `basic_text` — that backend encrypts
   with a hardcoded key, so treating it as secure would mean writing an effectively plaintext
   passphrase to disk. Electron 43 already returns `false` for it, but the semantics have
   shifted across versions, so check both.

3. **Bootstrap orchestration moves into `vault/service.ts`, not `App.tsx`.** A new
   `bootstrapVault()` returns a discriminated union and `App.tsx` switches on it. Without
   this, auto-unlock logic would accrete inside an already-large component.

4. **No keychain test backdoor.** The auto-unlock path is covered by unit tests against an
   injected fake secure store. Production code gets no `MCP_EXPLORER_FAKE_KEYCHAIN` escape
   hatch — a backdoor into secret storage is not worth the E2E convenience. E2E covers the
   passphrase fallback, which is what a keyring-less machine really does.

---

## File Structure

**Created:**

| File | Responsibility |
|------|---------------|
| `electron/secrets/store.js` | Vault envelope file I/O + `safeStorage`-sealed device passphrase. Dependencies injected. |
| `electron/secrets/store.test.js` | Auto-unlock generation, reuse, and the insecure-backend refusal. |
| `electron/appdata/store.js` | gzip read/write against `getAppDataFilePath()`. |
| `electron/appdata/store.test.js` | Round-trip and missing-file behaviour. |
| `electron/ipc/nativeHandlers.js` | `ipcMain.handle` for secrets, app data, and the save dialog. |
| `src/lib/host/browser/secretsBrowser.ts` | Today's `vaultPersistence` fetch+IDB logic, moved. |
| `src/lib/host/electron/secretsElectron.ts` | `SecretsHost` over the preload bridge. |
| `src/lib/host/electron/filesElectron.ts` | `FilesHost` over the preload bridge. |
| `src/lib/host/electron/secretsElectron.test.ts` | Drives both against a fake bridge. |
| `src/lib/vault/bootstrap.test.ts` | `bootstrapVault()` across all four states. |
| `tests/electron/04-native-persistence.spec.ts` | Vault file and app data land in a real directory. |

**Modified:**

| File | Change |
|------|--------|
| `src/lib/host/types.ts` | Add `SecretsHost`; add `readAppData`/`writeAppData` to `FilesHost`. |
| `src/lib/host/browser/index.ts` | Include `secrets`. |
| `src/lib/host/electron/index.ts` | Use the Electron secrets and files hosts. |
| `src/lib/vault/vaultPersistence.ts` | Delegate to `host.secrets`. |
| `src/lib/vault/service.ts` | Add `bootstrapVault()`. |
| `src/lib/appData.ts` | Route file access through `host.files`. |
| `src/App.tsx:130` | Switch on `bootstrapVault()`. |
| `src/components/VaultSetup.tsx` | Fix the "stays in this browser" copy. |
| `electron/ipc/channels.js` | Add the native channels. |
| `electron/preload.cjs` | Expose the new channels. |
| `electron/mcp/sessions.js` + `electron/ipc/mcpHandlers.js` | Emit `mcp:closed` (the Phase 2a gap). |
| `electron/main.js` | Register native handlers; warn when a CLI daemon holds the lock. |

**Not touched:** `src/lib/vault/crypto.ts`, `envelope.ts`, `idb.ts`, `src/lib/mcpClient.ts`, `src/lib/protocolTrace.ts`, `proxy.js`, `server.js`, `tests/release/`.

---

## Task 1: Extend the Host interface

**Files:**
- Modify: `src/lib/host/types.ts`

- [ ] **Step 1: Add the interfaces**

In `src/lib/host/types.ts`, add `SecretsHost`, extend `FilesHost`, and add `secrets` to `Host`:

```ts
/** The encrypted vault envelope, opaque at this layer. */
export type VaultEnvelopeBlob = unknown;

export interface SecretsHost {
  loadEnvelope(): Promise<VaultEnvelopeBlob | null>;
  saveEnvelope(envelope: VaultEnvelopeBlob): Promise<void>;
  deleteEnvelope(): Promise<void>;
  /**
   * A device-managed passphrase that unlocks the vault without prompting, or null
   * when this platform has no secure store and the user must type one.
   */
  getAutoUnlockPassphrase(): Promise<string | null>;
}

export interface FilesHost {
  saveFile(filename: string, content: string, mimeType: string): void;
  /** Persisted app data (bookmarks, history, journals), or null if none stored. */
  readAppData(): Promise<unknown | null>;
  writeAppData(data: unknown): Promise<void>;
}

export interface Host {
  readonly kind: 'browser' | 'electron';
  readonly mcp: McpHost;
  readonly files: FilesHost;
  readonly secrets: SecretsHost;
}
```

Leave `McpHost` exactly as it is.

- [ ] **Step 2: Confirm the build now fails as expected**

Run: `npm run build`
Expected: FAIL — `browserHost` and `createElectronHost` no longer satisfy `Host`. The next
tasks fix that. This is the compiler telling you every implementation site.

- [ ] **Step 3: Commit after Task 3 (do not commit a broken build)**

---

## Task 2: Browser secrets host

Move today's persistence logic out of `vaultPersistence.ts` behind the interface. Behaviour
must not change for the web build.

**Files:**
- Create: `src/lib/host/browser/secretsBrowser.ts`
- Modify: `src/lib/host/browser/index.ts`

- [ ] **Step 1: Read the current implementation**

Run: `cat src/lib/vault/vaultPersistence.ts`

Note the three exported functions (`getVaultEnvelope`, `putVaultEnvelope`,
`deleteVaultRecord`), the `prefersVaultFileApi()` gate, and the one-time IDB→file migration.
All of that moves; none of it changes.

- [ ] **Step 2: Create the browser secrets host**

Create `src/lib/host/browser/secretsBrowser.ts` containing the **exact** bodies currently in
`vaultPersistence.ts`, re-exposed as a `SecretsHost`:

```ts
import { VAULT_HTTP_PATH } from '../../vault/constants';
import * as idb from '../../vault/idb';
import type { SecretsHost, VaultEnvelopeBlob } from '../types';

function prefersVaultFileApi(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol !== 'file:';
}
```

Then port `getVaultEnvelope`, `putVaultEnvelope`, `deleteVaultRecord`, `safeJsonParse`, and
`migrateIdbToFileIfPresent` verbatim, but **return raw unknown rather than parsed
envelopes** — parsing stays in `vaultPersistence.ts` so the envelope type does not leak into
the host layer. Assemble:

```ts
export const browserSecretsHost: SecretsHost = {
  loadEnvelope,
  saveEnvelope,
  deleteEnvelope,
  // The browser has no OS secure store, so there is never an automatic unlock.
  async getAutoUnlockPassphrase() {
    return null;
  },
};
```

- [ ] **Step 3: Wire it into the browser host**

In `src/lib/host/browser/index.ts` add `secrets: browserSecretsHost` alongside `mcp` and
`files`, importing from `./secretsBrowser`.

Also add `readAppData` / `writeAppData` to `src/lib/host/browser/filesBrowser.ts`:

```ts
const APP_DATA_PATH = '/__app_data';

export const browserFilesHost: FilesHost = {
  saveFile(filename, content, mimeType) {
    /* existing implementation unchanged */
  },

  async readAppData() {
    const res = await fetch(APP_DATA_PATH, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`App data read failed (${res.status})`);
    return (await res.json()) as unknown;
  },

  async writeAppData(data) {
    const res = await fetch(APP_DATA_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`App data write failed (${res.status})`);
  },
};
```

Read `src/lib/appData.ts` first and match the exact request shape it uses today — the
migration path depends on a 404 being distinguishable from other failures.

- [ ] **Step 4: Point vaultPersistence at the host**

Rewrite `src/lib/vault/vaultPersistence.ts` to delegate, keeping its exported API and its
envelope parsing:

```ts
import { getHost } from '../host';
import { parseVaultEnvelope } from './envelope';
import type { VaultEnvelope } from './types';

export async function getVaultEnvelope(): Promise<VaultEnvelope | null> {
  return parseVaultEnvelope(await getHost().secrets.loadEnvelope());
}

export async function putVaultEnvelope(envelope: VaultEnvelope): Promise<void> {
  await getHost().secrets.saveEnvelope(envelope);
}

export async function deleteVaultRecord(): Promise<void> {
  await getHost().secrets.deleteEnvelope();
}
```

- [ ] **Step 5: Verify the browser path is unchanged**

Run: `npm run build && npm test`
Expected: build clean; all existing tests pass. Any vault test that mocked `fetch` or `idb`
directly may now need the host stubbed instead — read the failure before changing a test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/host/types.ts src/lib/host/browser/ src/lib/vault/vaultPersistence.ts
git commit -m "refactor(vault): route envelope persistence through the secrets host"
```

---

## Task 3: bootstrapVault()

**Files:**
- Modify: `src/lib/vault/service.ts`
- Create: `src/lib/vault/bootstrap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/vault/bootstrap.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/vault/bootstrap.test.ts`
Expected: FAIL — `bootstrapVault` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/vault/service.ts`:

```ts
import { getHost } from '../host';
import { loadLegacyServers } from '../storage';

export type VaultBootstrap =
  | { phase: 'ready'; aesKey: CryptoKey; servers: StoredServer[] }
  | { phase: 'needs-setup' }
  | { phase: 'needs-unlock' };

/**
 * Decide how the app should start.
 *
 * On a platform with a secure store the desktop app never prompts: a generated
 * device passphrase creates or unlocks the vault. Everywhere else this reduces to
 * the existing needs-setup / needs-unlock split.
 */
export async function bootstrapVault(): Promise<VaultBootstrap> {
  const envelope = await getVaultEnvelope();
  const autoPassphrase = await getHost().secrets.getAutoUnlockPassphrase();

  if (!autoPassphrase) {
    return envelope ? { phase: 'needs-unlock' } : { phase: 'needs-setup' };
  }

  if (envelope) {
    try {
      const { aesKey, servers } = await unlockVault(autoPassphrase);
      return { phase: 'ready', aesKey, servers };
    } catch {
      // A vault created before the secure store existed, or with a user-chosen
      // passphrase. Fall back to prompting rather than destroying it.
      return { phase: 'needs-unlock' };
    }
  }

  // loadLegacyServers() returns StoredServer[] | null — App.tsx:541 uses the same
  // `?? []` guard when creating a vault.
  const legacyServers = loadLegacyServers() ?? [];
  const aesKey = await createVault(autoPassphrase, legacyServers);
  return { phase: 'ready', aesKey, servers: legacyServers };
}
```

`loadLegacyServers` is exported from `src/lib/storage.ts:20`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/vault/bootstrap.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Switch App.tsx onto it**

In `src/App.tsx`, replace the `getBootstrapPhase()` call in the bootstrap effect
(around line 130):

```ts
      try {
        const result = await bootstrapVault();
        if (result.phase === 'ready') {
          aesKeyRef.current = result.aesKey;
          setServers(fromStoredServers(result.servers));
          setVaultPhase('ready');
        } else {
          setVaultPhase(result.phase);
        }
      } catch {
        setVaultError('Could not initialize vault.');
        setVaultPhase('needs-setup');
      }
```

Read the existing `handleVaultUnlock` to copy the exact way it converts stored servers into
state — reuse that helper rather than inventing a new conversion.

- [ ] **Step 6: Verify**

Run: `npm run build && npm test`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vault/service.ts src/lib/vault/bootstrap.test.ts src/App.tsx
git commit -m "feat(vault): add bootstrapVault with optional automatic unlock"
```

---

## Task 4: Electron secrets store in main

**Files:**
- Create: `electron/secrets/store.js`
- Test: `electron/secrets/store.test.js`

- [ ] **Step 1: Write the failing test**

Create `electron/secrets/store.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSecretsStore, isSecureBackend } from './store.js';

function fakeSafeStorage({ available = true, backend = 'gnome_libsecret' } = {}) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (s) => Buffer.from(`sealed:${s}`, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^sealed:/, ''),
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- electron/secrets/store.test.js`
Expected: FAIL — `Cannot find module './store.js'`.

- [ ] **Step 3: Write the implementation**

Create `electron/secrets/store.js`:

```js
/**
 * Vault envelope storage and the device auto-unlock passphrase.
 *
 * The vault file is the *same* file the CLI uses (`getVaultFilePath()`), so a user
 * who switches between `npx mcp-explorer` and the desktop app keeps one vault.
 *
 * The vault format is unchanged: Electron does not replace PBKDF2, it just stores a
 * generated passphrase in the OS keychain so the user is never prompted.
 *
 * Dependencies are injected so this is unit-testable without Electron or real files.
 */
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

/**
 * A secure store must be available AND not the `basic_text` backend, which
 * "encrypts" with a hardcoded key and would put the passphrase on disk in
 * effectively plain text.
 */
export function isSecureBackend(safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  try {
    return safeStorage.getSelectedStorageBackend() !== 'basic_text';
  } catch {
    // Not implemented on this platform (macOS/Windows) — availability is enough.
    return true;
  }
}

export function createSecretsStore({ fs, safeStorage, vaultPath, devicePath }) {
  async function ensureDir(filePath) {
    await fs.mkdir(dirname(filePath), { recursive: true });
  }

  return {
    async loadEnvelope() {
      try {
        const raw = await fs.readFile(vaultPath);
        return JSON.parse(raw.toString('utf8'));
      } catch {
        return null;
      }
    },

    async saveEnvelope(envelope) {
      await ensureDir(vaultPath);
      await fs.writeFile(vaultPath, Buffer.from(JSON.stringify(envelope), 'utf8'));
    },

    async deleteEnvelope() {
      try {
        await fs.unlink(vaultPath);
      } catch {
        /* already gone */
      }
    },

    async getAutoUnlockPassphrase() {
      if (!isSecureBackend(safeStorage)) return null;

      try {
        const sealed = await fs.readFile(devicePath);
        const existing = safeStorage.decryptString(sealed);
        if (existing) return existing;
      } catch {
        /* no device key yet, or it no longer decrypts — generate a new one */
      }

      const passphrase = randomBytes(32).toString('base64');
      await ensureDir(devicePath);
      await fs.writeFile(devicePath, safeStorage.encryptString(passphrase));
      return passphrase;
    },
  };
}
```

Note the regeneration branch: if the sealed key fails to decrypt (a different OS user, a
reset keychain), a fresh passphrase is generated. `bootstrapVault()` then fails to unlock the
existing envelope and falls back to prompting rather than destroying the vault.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/secrets/store.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add electron/secrets/
git commit -m "feat(electron): add keychain-sealed auto-unlock and vault file storage"
```

---

## Task 5: Electron app-data store in main

**Files:**
- Create: `electron/appdata/store.js`
- Test: `electron/appdata/store.test.js`

- [ ] **Step 1: Write the failing test**

Create `electron/appdata/store.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createAppDataStore } from './store.js';

function fakeFs(initial = new Map()) {
  return {
    files: initial,
    readFile: vi.fn(async (p) => {
      if (!initial.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return initial.get(p);
    }),
    writeFile: vi.fn(async (p, data) => initial.set(p, data)),
    mkdir: vi.fn(async () => undefined),
  };
}

describe('appDataStore', () => {
  it('returns null when the file does not exist', async () => {
    const store = createAppDataStore({ fs: fakeFs(), filePath: '/data/data.gz' });
    expect(await store.read()).toBeNull();
  });

  it('round-trips through gzip', async () => {
    const fs = fakeFs();
    const store = createAppDataStore({ fs, filePath: '/data/data.gz' });

    await store.write({ version: 1, bookmarks: ['a'] });
    expect(await store.read()).toEqual({ version: 1, bookmarks: ['a'] });
  });

  it('writes gzip, not plain JSON — the CLI reads the same file', async () => {
    const fs = fakeFs();
    const store = createAppDataStore({ fs, filePath: '/data/data.gz' });

    await store.write({ version: 1 });
    const written = fs.files.get('/data/data.gz');
    expect(written[0]).toBe(0x1f);
    expect(written[1]).toBe(0x8b);
  });

  it('reads a file written by the CLI handler', async () => {
    const files = new Map([['/data/data.gz', gzipSync(JSON.stringify({ version: 1, bookmarks: ['x'] }))]]);
    const store = createAppDataStore({ fs: fakeFs(files), filePath: '/data/data.gz' });

    expect(await store.read()).toEqual({ version: 1, bookmarks: ['x'] });
  });

  it('returns null for a corrupt file rather than throwing', async () => {
    const files = new Map([['/data/data.gz', Buffer.from('garbage')]]);
    const store = createAppDataStore({ fs: fakeFs(files), filePath: '/data/data.gz' });

    expect(await store.read()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- electron/appdata/store.test.js`
Expected: FAIL — `Cannot find module './store.js'`.

- [ ] **Step 3: Write the implementation**

Create `electron/appdata/store.js`:

```js
/**
 * Bookmarks, call history, and observation journals, stored gzip-compressed at the
 * same path the CLI uses (`getAppDataFilePath()`), so both share one file.
 */
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { dirname } from 'node:path';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export function createAppDataStore({ fs, filePath }) {
  return {
    async read() {
      try {
        const compressed = await fs.readFile(filePath);
        return JSON.parse((await gunzipAsync(compressed)).toString('utf8'));
      } catch {
        return null;
      }
    },

    async write(data) {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, await gzipAsync(Buffer.from(JSON.stringify(data), 'utf8')));
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/appdata/store.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add electron/appdata/
git commit -m "feat(electron): add gzip app-data store sharing the CLI's file"
```

---

## Task 6: Native IPC handlers, channels, and preload

**Files:**
- Modify: `electron/ipc/channels.js`
- Create: `electron/ipc/nativeHandlers.js`
- Modify: `electron/preload.cjs`
- Modify: `electron/main.js`

- [ ] **Step 1: Add the channels**

In `electron/ipc/channels.js`, add to `CHANNELS`:

```js
  // secrets
  loadEnvelope: 'mcp:loadEnvelope',
  saveEnvelope: 'mcp:saveEnvelope',
  deleteEnvelope: 'mcp:deleteEnvelope',
  autoUnlockPassphrase: 'mcp:autoUnlockPassphrase',
  // files + app data
  saveFile: 'mcp:saveFile',
  readAppData: 'mcp:readAppData',
  writeAppData: 'mcp:writeAppData',
```

The existing test asserts every channel starts with `mcp:` and that there are no duplicates,
so it covers these automatically. Update the channel-count expectation in Task 5 Step 2 of the
Phase 2a plan if you re-run it: it is now 18.

- [ ] **Step 2: Write the handlers**

Create `electron/ipc/nativeHandlers.js`:

```js
import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHANNELS, fail, ok } from './channels.js';

function handle(channel, code, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return ok(await fn(...args));
    } catch (err) {
      return fail(err, code);
    }
  });
}

export function registerNativeHandlers({ secrets, appData, getWindow }) {
  handle(CHANNELS.loadEnvelope, 'E_VAULT_READ', () => secrets.loadEnvelope());
  handle(CHANNELS.saveEnvelope, 'E_VAULT_WRITE', (envelope) => secrets.saveEnvelope(envelope));
  handle(CHANNELS.deleteEnvelope, 'E_VAULT_DELETE', () => secrets.deleteEnvelope());
  handle(CHANNELS.autoUnlockPassphrase, 'E_KEYCHAIN', () => secrets.getAutoUnlockPassphrase());

  handle(CHANNELS.readAppData, 'E_APPDATA_READ', () => appData.read());
  handle(CHANNELS.writeAppData, 'E_APPDATA_WRITE', (data) => appData.write(data));

  handle(CHANNELS.saveFile, 'E_SAVE_FILE', async (filename, content) => {
    // Playwright cannot drive a native dialog, so E2E writes to a fixed directory.
    const e2eDir = process.env.MCP_EXPLORER_E2E_SAVE_DIR;
    if (e2eDir) {
      const target = join(e2eDir, filename);
      await writeFile(target, content, 'utf8');
      return target;
    }

    const win = getWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: filename,
    });
    if (canceled || !filePath) return null;
    await writeFile(filePath, content, 'utf8');
    return filePath;
  });
}
```

- [ ] **Step 3: Expose them in the preload**

In `electron/preload.cjs`, add the seven new channel names to the `INVOKE` allow-list.
Keep the list literal — a sandboxed preload cannot import the ESM `channels.js`.

- [ ] **Step 4: Wire main**

In `electron/main.js`, construct the stores and register the handlers inside
`app.whenReady()`, after `registerMcpHandlers`:

```js
import { safeStorage } from 'electron';
import * as nodeFs from 'node:fs/promises';
import { join } from 'node:path';
import { getVaultFilePath } from '../vault-file-handler.js';
import { getAppDataFilePath } from '../app-data-handler.js';
import { createSecretsStore } from './secrets/store.js';
import { createAppDataStore } from './appdata/store.js';
import { registerNativeHandlers } from './ipc/nativeHandlers.js';
```

```js
    const vaultPath = getVaultFilePath();
    const secrets = createSecretsStore({
      fs: nodeFs,
      safeStorage,
      vaultPath,
      devicePath: join(dirname(vaultPath), 'device-key.bin'),
    });
    const appData = createAppDataStore({ fs: nodeFs, filePath: getAppDataFilePath() });

    registerNativeHandlers({ secrets, appData, getWindow: () => mainWindow });
```

`safeStorage` must not be touched before `app.whenReady()`, which is why the stores are built
inside the ready handler rather than at module top level. Add `dirname` to the existing
`node:path` import.

- [ ] **Step 5: Verify main still parses**

Run: `node --check electron/main.js && node --check electron/ipc/nativeHandlers.js && node --check electron/preload.cjs`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/ electron/main.js electron/preload.cjs
git commit -m "feat(electron): add native IPC handlers for secrets, app data, and save dialog"
```

---

## Task 7: Electron secrets and files hosts in the renderer

**Files:**
- Create: `src/lib/host/electron/secretsElectron.ts`
- Create: `src/lib/host/electron/filesElectron.ts`
- Modify: `src/lib/host/electron/index.ts`
- Test: `src/lib/host/electron/secretsElectron.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/host/electron/secretsElectron.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/host/electron/secretsElectron.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

Create `src/lib/host/electron/secretsElectron.ts`:

```ts
import type { SecretsHost, VaultEnvelopeBlob } from '../types';
import { type ElectronBridge, unwrapEnvelope } from './mcpElectron';

export function createElectronSecretsHost(bridge: ElectronBridge): SecretsHost {
  return {
    async loadEnvelope() {
      return unwrapEnvelope<VaultEnvelopeBlob | null>(await bridge.invoke('mcp:loadEnvelope'));
    },
    async saveEnvelope(envelope) {
      unwrapEnvelope<void>(await bridge.invoke('mcp:saveEnvelope', envelope));
    },
    async deleteEnvelope() {
      unwrapEnvelope<void>(await bridge.invoke('mcp:deleteEnvelope'));
    },
    async getAutoUnlockPassphrase() {
      return unwrapEnvelope<string | null>(await bridge.invoke('mcp:autoUnlockPassphrase'));
    },
  };
}
```

Create `src/lib/host/electron/filesElectron.ts`:

```ts
import type { FilesHost } from '../types';
import { type ElectronBridge, unwrapEnvelope } from './mcpElectron';

export function createElectronFilesHost(bridge: ElectronBridge): FilesHost {
  return {
    // FilesHost.saveFile is synchronous by contract; the dialog is fire-and-forget.
    saveFile(filename, content, mimeType) {
      void bridge
        .invoke('mcp:saveFile', filename, content, mimeType)
        .then((envelope) => unwrapEnvelope<string | null>(envelope))
        .catch((err: unknown) => {
          console.error('mcp-explorer: save failed', err);
        });
    },
    async readAppData() {
      return unwrapEnvelope<unknown | null>(await bridge.invoke('mcp:readAppData'));
    },
    async writeAppData(data) {
      unwrapEnvelope<void>(await bridge.invoke('mcp:writeAppData', data));
    },
  };
}
```

This needs `unwrap` exported from `mcpElectron.ts`. Rename the existing private `unwrap`
there to `unwrapEnvelope` and export it, updating its call sites in that file.

Update `src/lib/host/electron/index.ts`:

```ts
export function createElectronHost(bridge: ElectronBridge): Host {
  return {
    kind: 'electron',
    mcp: createElectronMcpHost(bridge),
    files: createElectronFilesHost(bridge),
    secrets: createElectronSecretsHost(bridge),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/host/electron/`
Expected: PASS — 9 existing MCP tests plus 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/host/electron/
git commit -m "feat(host): add Electron secrets and files hosts"
```

---

## Task 8: Route appData through the host

**Files:**
- Modify: `src/lib/appData.ts`

- [ ] **Step 1: Read the current implementation**

Run: `cat src/lib/appData.ts`

`initAppData()` currently fetches `/__app_data` directly and has a 404 → migrate-from-
localStorage path. Keep that orchestration exactly as it is; only the transport changes.

- [ ] **Step 2: Replace direct fetch with the host**

Replace the `prefersFileApi()` gate and the `fetch(APP_DATA_PATH)` calls with
`getHost().files.readAppData()` / `writeAppData()`. A `null` return means "no stored data",
which is the same signal the old 404 branch used — route it to the identical migration code.

Keep the `localStorage` fallback for when the host call throws: the static-build case
(`dist/index.html` opened directly) has no server and must still work.

- [ ] **Step 3: Verify**

Run: `npm run build && npm test`
Expected: clean. `src/lib/appData.test.ts` exists — read any failure carefully; the migration
behaviour must not change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/appData.ts
git commit -m "refactor(appdata): route persistence through the files host"
```

---

## Task 9: Close the Phase 2a gaps

**Files:**
- Modify: `electron/mcp/sessions.js`
- Modify: `electron/ipc/mcpHandlers.js`
- Modify: `electron/main.js`
- Modify: `src/components/VaultSetup.tsx`

- [ ] **Step 1: Emit mcp:closed when a transport drops**

In `electron/mcp/sessions.js`, add a `closed` listener set alongside `toolsChangedListeners`,
and in `open()` attach to the transport:

```js
    transport.onclose = () => {
      if (sessions.get(serverId)?.transport === transport) {
        sessions.delete(serverId);
        for (const listener of closedListeners) listener(serverId);
      }
    };
```

Expose `onClosed(listener)` mirroring `onToolsChanged`. In
`electron/ipc/mcpHandlers.js`, forward it to the renderer via `CHANNELS.closed`, exactly as
`toolsChanged` is forwarded.

Add a test to `electron/mcp/sessions.test.js`:

```js
  it('drops the session and notifies when the transport closes', async () => {
    const transport = { close: vi.fn(async () => undefined) };
    manager = createSessionManager({
      createClient: () => client,
      createHttpTransport: () => transport,
      createStdioTransport: vi.fn(),
    });
    const closed = [];
    manager.onClosed((id) => closed.push(id));

    await manager.connect('srv-1', 'https://x/mcp');
    expect(manager.isConnected('srv-1')).toBe(true);

    transport.onclose();

    expect(manager.isConnected('srv-1')).toBe(false);
    expect(closed).toEqual(['srv-1']);
  });
```

Run: `npm test -- electron/mcp/sessions.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 2: Warn when a CLI daemon is already running**

In `electron/main.js`, inside the ready handler, check the CLI lock and log a warning — the
two processes share `~/.mcp-explorer/` and last-write-wins:

```js
import { isAlive, readLock } from '../daemon-lock.js';
```

```js
    const lock = await readLock();
    if (lock && isAlive(lock.pid)) {
      console.warn(
        `mcp-explorer: the CLI daemon is running on port ${lock.port} and shares ` +
          `~/.mcp-explorer/. Changes may overwrite each other. Run "mcp-explorer stop" first.`,
      );
    }
```

This is a warning, not a block: running both is legitimate, just lossy.

- [ ] **Step 3: Fix the vault copy**

`src/components/VaultSetup.tsx` says the vault "stays in this browser", which is wrong in a
desktop window. Make the copy host-aware using `getHost().kind`, or reword it neutrally
(for example "stored encrypted on this device"). Read the component and keep its existing
tone.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add electron/ src/components/VaultSetup.tsx
git commit -m "fix(electron): emit mcp:closed, warn on CLI daemon, correct vault copy"
```

---

## Task 10: E2E coverage

**Files:**
- Create: `tests/electron/04-native-persistence.spec.ts`
- Modify: `tests/electron/helpers.ts`

- [ ] **Step 1: Give the launcher a real data directory**

In `tests/electron/helpers.ts`, extend `launchApp()` to set `MCP_EXPLORER_DATA_DIR` and
`MCP_EXPLORER_E2E_SAVE_DIR` to fresh temp directories, and return both paths on
`LaunchedApp` so specs can assert against them. Keep the existing `--user-data-dir` handling.

- [ ] **Step 2: Write the spec**

Create `tests/electron/04-native-persistence.spec.ts` covering:

- After `setupVault`, a `vault.json` exists in `MCP_EXPLORER_DATA_DIR` — proving the desktop
  app writes the same file the CLI reads, not IndexedDB.
- After adding a server and reloading the window, the server is still listed.
- Adding a bookmark produces a gzip `data.gz` in the same directory (assert the `1f 8b`
  magic bytes).
- Exporting from the Export dialog writes a file into `MCP_EXPLORER_E2E_SAVE_DIR`.

Use the selectors already proven in `tests/electron/02-http-direct.spec.ts` and
`tests/release/11-export.spec.ts` rather than inventing new ones.

**Do not** attempt to E2E the auto-unlock path: the development machine has no keyring, so
`getAutoUnlockPassphrase()` returns null there and the app correctly prompts. Auto-unlock is
covered by the Task 3 and Task 4 unit tests.

- [ ] **Step 3: Run the Electron suite**

Run: `xvfb-run -a npx playwright test --config playwright.electron.config.ts`
Expected: the Phase 2a specs plus the new ones all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/electron/
git commit -m "test(electron): cover native vault, app data, and save-dialog persistence"
```

---

## Task 11: Prove the browser path is still intact

- [ ] **Step 1: Confirm the release specs are untouched**

Run: `git status --short tests/release/`
Expected: no output.

- [ ] **Step 2: Run the browser release suite**

Run: `npx playwright test tests/release/`
Expected: 99 passed.

This is the load-bearing check for this phase: `vaultPersistence.ts` and `appData.ts` both
changed, and specs 01, 09, and 22 exercise vault creation, bookmark persistence, and the
observation journal respectively.

- [ ] **Step 3: Confirm the CLI still works end to end**

Run: `npm run build && node server.js &` then visit `http://127.0.0.1:4173/`, create a vault,
add a server, and confirm `~/.mcp-explorer/vault.json` updates. Stop the server afterwards.

This is the only check that the file-backed browser path still writes where the CLI expects.

---

## Definition of done

- [ ] `npm run build`, `npm run lint`, and `npm test` all pass.
- [ ] `npx playwright test tests/release/` passes 99/99 with `tests/release/` unmodified.
- [ ] `xvfb-run -a npx playwright test --config playwright.electron.config.ts` passes.
- [ ] The desktop app writes `vault.json` and `data.gz` into `~/.mcp-explorer/`, the same
      files the CLI uses.
- [ ] On a machine with no keyring the app still prompts for a passphrase and works.
- [ ] The device passphrase never appears in plaintext on disk.
- [ ] `src/lib/vault/crypto.ts` and `envelope.ts` are unmodified.

Packaging, CI, and user-facing docs are Phase 3.

---

## Phase 2b outcome — COMPLETE

Verified: `npm run build`, `npm run lint`, 289 unit tests, 99/99 browser release specs with
`tests/release/` unmodified, and 20/20 Electron E2E specs.

### Corrections made to this plan during execution

1. **Task 2 would have caused data loss.** The plan said to move the persistence logic and
   "return raw unknown", dropping `parseVaultEnvelope`. But the original code used that
   parse for *decisions*, not just for its return value: it deletes the IndexedDB record
   only when the HTTP body is a valid envelope, and migrates IDB→file only when the IDB
   value is valid. Without validation, a server returning unrelated JSON would delete a
   good IDB vault. `secretsBrowser.ts` now uses `isVaultEnvelope` as a boolean predicate,
   keeping the `SecretsHost` signatures opaque.

2. **The plan's fake `safeStorage` was self-contradictory.** It was
   `encryptString: (s) => Buffer.from('sealed:' + s)` — a passthrough embedding the
   plaintext — while the next test asserted the passphrase never appears on disk. The fake
   now hex-encodes, as a real keychain would. `store.js` itself was correct.

3. **Task 10's app-data trigger was wrong.** The bookmark toggle lives in `ToolList` as a
   `☆` icon, not a button matching `/bookmark/i`, so the guarded click silently skipped and
   nothing wrote app data. The spec now invokes a tool, which appends to call history
   (`src/lib/history.ts:24` → `patchAppData`).

4. **Servers persist across reload but connections do not**, so the persistence spec has to
   click Connect after reloading. That is correct app behaviour, not a bug.

### Unrelated hazard found and fixed

`tests/release/helpers.ts` sends `DELETE /__vault_storage` on every `setupVault()`, and the
release suite did not isolate `MCP_EXPLORER_DATA_DIR` — so running it deleted the
developer's real `~/.mcp-explorer/vault.json` and overwrote their `data.gz`. The static
server in `playwright.config.ts` now runs against a temp directory. `tests/release/` itself
is unchanged.

### Carried into Phase 3

- `electron/main.js` imports `../vault-file-handler.js`, `../app-data-handler.js`, and
  `../daemon-lock.js` from the repo root. The electron-builder `files` config must include
  them or the packaged app fails at startup.
- The `preload.cjs` channel allow-list is hand-duplicated from `channels.js`; a channel
  added to one and not the other fails only at runtime.
- ESLint still does not cover `electron/**/*.js` (see the Phase 2a notes).
- Auto-unlock has no E2E coverage because no CI or dev machine here has a keyring. It is
  covered by unit tests against an injected fake.
