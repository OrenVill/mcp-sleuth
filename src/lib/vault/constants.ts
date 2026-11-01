/**
 * localStorage key for the pre-vault plaintext list.
 *
 * This names data written by OLD versions, under the old product name. It must
 * NOT be renamed with the product — doing so makes the key match nothing and
 * silently drops the migration path for anyone upgrading.
 */
export const LEGACY_SERVERS_STORAGE_KEY = 'mcp-explorer.servers.v1';

/** Same-origin HTTP path; Node/Vite serve the vault file (see `vault-file-handler.js`). */
export const VAULT_HTTP_PATH = '/__vault_storage';

export const IDB_NAME = 'mcp-sleuth';
/** Pre-rename database, read once so an existing browser vault is not orphaned. */
export const LEGACY_IDB_NAME = 'mcp-explorer';
export const IDB_STORE = 'vault';
export const IDB_RECORD_KEY = 'encrypted-servers';

export const FORMAT_VERSION = 'vault-v1' as const;

/**
 * PBKDF2-HMAC-SHA256 iterations for a newly created vault.
 *
 * 600k is the current OWASP figure; this was 310k, which was the 2023 one. It
 * matters on the browser and CLI path, where the user types the passphrase and
 * `vault.json` is the artefact an attacker would carry off and grind offline.
 * It is irrelevant on the desktop auto-unlock path, where the passphrase is 32
 * random bytes.
 *
 * Only new vaults are affected: every envelope records the iteration count it
 * was written with, and unlock uses that, so an existing vault keeps opening.
 */
export const PBKDF2_ITERATIONS = 600_000;
