/**
 * The directory holding the vault, app data, daemon lock, and window state.
 *
 * The product was renamed from "Sleuth" to "Sleuth". Existing installs keep
 * their data in `~/.mcp-sleuth`, including encrypted vaults that cannot be
 * recreated, so this module migrates it once — non-destructively, leaving the old
 * directory in place so a downgrade still works.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DATA_DIR_NAME = '.mcp-sleuth';
export const LEGACY_DATA_DIR_NAME = '.mcp-sleuth';

/** Files worth carrying across a rename. */
export const MIGRATABLE_FILES = [
  'vault.json',
  'data.gz',
  'window-state.json',
  'device-key.bin',
];

export function getDataDir(env = process.env) {
  return (
    env.MCP_SLEUTH_DATA_DIR ??
    // Honoured for compatibility with scripts written before the rename.
    // Deliberately the OLD name — do not "fix" this to match the new one.
    env.MCP_EXPLORER_DATA_DIR ??
    join(homedir(), DATA_DIR_NAME)
  );
}

/**
 * True when the data directory is the default location.
 *
 * An explicit override means "use exactly this directory", so importing another
 * directory's vault into it would be wrong — and it would also let a developer's
 * real vault leak into a throwaway test directory.
 */
export function isDefaultDataDir(env = process.env) {
  return !env.MCP_SLEUTH_DATA_DIR && !env.MCP_EXPLORER_DATA_DIR;
}

export function getLegacyDataDir() {
  return join(homedir(), LEGACY_DATA_DIR_NAME);
}

/**
 * Which files to copy across.
 *
 * Only known data files, and only when the destination does not already have
 * one — a file in the new directory is always authoritative, so re-running this
 * can never clobber newer data. `daemon.json` is deliberately excluded: it is a
 * runtime lock naming a PID that is meaningless after a restart.
 */
export function filesToMigrate(legacyEntries, currentEntries) {
  const present = new Set(currentEntries);
  return MIGRATABLE_FILES.filter(
    (name) => legacyEntries.includes(name) && !present.has(name),
  );
}

/**
 * Copy pre-rename data into the current directory, once. Returns the names
 * copied. Never throws: a failed migration must not stop the app starting.
 */
export function migrateLegacyDataDir({
  dataDir = getDataDir(),
  legacyDir = getLegacyDataDir(),
  isDefault = isDefaultDataDir(),
  fs = { existsSync, readdirSync, mkdirSync, copyFileSync },
} = {}) {
  try {
    // Only ever migrate into the default location.
    if (!isDefault) return [];
    if (dataDir === legacyDir) return [];
    if (!fs.existsSync(legacyDir)) return [];

    const current = fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [];
    const names = filesToMigrate(fs.readdirSync(legacyDir), current);
    if (names.length === 0) return [];

    fs.mkdirSync(dataDir, { recursive: true });
    for (const name of names) {
      fs.copyFileSync(join(legacyDir, name), join(dataDir, name));
    }
    return names;
  } catch {
    return [];
  }
}
