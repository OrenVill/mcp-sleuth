/**
 * Vault envelope storage and the device auto-unlock passphrase.
 *
 * The vault file is the *same* file the CLI uses (`getVaultFilePath()`), so a user
 * who switches between `npx mcp-sleuth` and the desktop app keeps one vault.
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

/**
 * The vault is encrypted and the device key is sealed by the OS keychain, but a
 * world-readable copy is exactly what lets another local account carry the vault
 * away and grind it offline. Owner-only, directory included.
 */
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export function createSecretsStore({ fs, safeStorage, vaultPath, devicePath }) {
  async function ensureDir(filePath) {
    await fs.mkdir(dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE });
  }

  /** `mode` applies on creation only, so a file an older version left readable
   *  is narrowed explicitly. Best-effort: Windows has no POSIX modes. */
  async function writePrivate(filePath, data) {
    await fs.writeFile(filePath, data, { mode: PRIVATE_FILE_MODE });
    try {
      await fs.chmod?.(filePath, PRIVATE_FILE_MODE);
    } catch {
      /* not every platform has them */
    }
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
      await writePrivate(vaultPath, Buffer.from(JSON.stringify(envelope), 'utf8'));
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
      await writePrivate(devicePath, safeStorage.encryptString(passphrase));
      return passphrase;
    },
  };
}
