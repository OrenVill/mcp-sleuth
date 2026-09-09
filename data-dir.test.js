import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import {
  DATA_DIR_NAME,
  LEGACY_DATA_DIR_NAME,
  filesToMigrate,
  getDataDir,
  getLegacyDataDir,
  mkdirPrivate,
  writePrivateFile,
  isDefaultDataDir,
  migrateLegacyDataDir,
} from './data-dir.js';

describe('getDataDir', () => {
  it('prefers the current env var', () => {
    expect(getDataDir({ MCP_SLEUTH_DATA_DIR: '/a' })).toBe('/a');
  });

  it('still honours the pre-rename env var', () => {
    // Scripts and CI written before the rename must keep working.
    expect(getDataDir({ MCP_EXPLORER_DATA_DIR: '/b' })).toBe('/b');
  });

  it('prefers the current var when both are set', () => {
    expect(getDataDir({ MCP_SLEUTH_DATA_DIR: '/a', MCP_EXPLORER_DATA_DIR: '/b' })).toBe('/a');
  });

  it('falls back to a home directory', () => {
    expect(getDataDir({})).toMatch(/\.mcp-sleuth$/);
  });
});

describe('directory names', () => {
  // The rest of this suite injects both paths, so it cannot catch the real
  // defaults being wrong. A rename that rewrote LEGACY_DATA_DIR_NAME to match
  // DATA_DIR_NAME made migration a silent no-op and every other test still passed.
  it('keeps the pre-rename directory distinct from the current one', () => {
    expect(LEGACY_DATA_DIR_NAME).not.toBe(DATA_DIR_NAME);
  });

  it('names the directories the shipped versions actually used', () => {
    expect(DATA_DIR_NAME).toBe('.mcp-sleuth');
    expect(LEGACY_DATA_DIR_NAME).toBe('.mcp-explorer');
  });

  it('resolves the two to different absolute paths', () => {
    expect(getLegacyDataDir()).not.toBe(getDataDir({}));
    expect(getLegacyDataDir().endsWith('.mcp-explorer')).toBe(true);
  });
});

describe('isDefaultDataDir', () => {
  it('is true with no override', () => {
    expect(isDefaultDataDir({})).toBe(true);
  });

  it('is false when either override is set', () => {
    expect(isDefaultDataDir({ MCP_SLEUTH_DATA_DIR: '/x' })).toBe(false);
    expect(isDefaultDataDir({ MCP_EXPLORER_DATA_DIR: '/x' })).toBe(false);
  });
});

describe('filesToMigrate', () => {
  it('takes known data files that are missing', () => {
    expect(filesToMigrate(['vault.json', 'data.gz'], [])).toEqual(['vault.json', 'data.gz']);
  });

  it('never overwrites a file that already exists', () => {
    // Post-rename data is authoritative; migration must not clobber it.
    expect(filesToMigrate(['vault.json', 'data.gz'], ['vault.json'])).toEqual(['data.gz']);
  });

  it('ignores the daemon lock — it names a stale PID', () => {
    expect(filesToMigrate(['daemon.json'], [])).toEqual([]);
  });

  it('ignores unknown files', () => {
    expect(filesToMigrate(['secrets.txt', 'notes.md'], [])).toEqual([]);
  });

  it('returns nothing when the legacy directory is empty', () => {
    expect(filesToMigrate([], [])).toEqual([]);
  });
});

function fakeFs(tree) {
  const copied = [];
  return {
    copied,
    existsSync: (p) => p in tree,
    readdirSync: (p) => tree[p] ?? [],
    mkdirSync: vi.fn(),
    copyFileSync: (from, to) => copied.push([from, to]),
  };
}

describe('migrateLegacyDataDir', () => {
  it('copies a pre-rename vault into the new directory', () => {
    const fs = fakeFs({ '/legacy': ['vault.json', 'data.gz'] });
    const names = migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', isDefault: true, fs });

    expect(names).toEqual(['vault.json', 'data.gz']);
    expect(fs.copied).toEqual([
      [join('/legacy', 'vault.json'), join('/new', 'vault.json')],
      [join('/legacy', 'data.gz'), join('/new', 'data.gz')],
    ]);
  });

  it('leaves the legacy directory in place so a downgrade still works', () => {
    const fs = fakeFs({ '/legacy': ['vault.json'] });
    migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', isDefault: true, fs });
    // Copy, never move: nothing is unlinked.
    expect(fs.copied).toHaveLength(1);
  });

  it('does nothing when there is no legacy directory', () => {
    const fs = fakeFs({});
    expect(migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', isDefault: true, fs })).toEqual([]);
  });

  it('does nothing on a second run', () => {
    const fs = fakeFs({ '/legacy': ['vault.json'], '/new': ['vault.json'] });
    expect(migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', isDefault: true, fs })).toEqual([]);
  });

  it('does not migrate into an explicitly overridden directory', () => {
    // An override means "use exactly this directory". Migrating into it would
    // also drag a developer's real vault into a throwaway test directory.
    const fs = fakeFs({ '/legacy': ['vault.json'] });
    const names = migrateLegacyDataDir({
      dataDir: '/custom',
      legacyDir: '/legacy',
      isDefault: false,
      fs,
    });

    expect(names).toEqual([]);
    expect(fs.copied).toEqual([]);
  });

  it('is a no-op when both paths are the same', () => {
    const fs = fakeFs({ '/same': ['vault.json'] });
    expect(migrateLegacyDataDir({ dataDir: '/same', legacyDir: '/same', isDefault: true, fs })).toEqual([]);
  });

  it('never throws — a failed migration must not stop startup', () => {
    const fs = {
      existsSync: () => true,
      readdirSync: () => {
        throw new Error('EACCES');
      },
      mkdirSync: vi.fn(),
      copyFileSync: vi.fn(),
    };
    expect(() => migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', isDefault: true, fs })).not.toThrow();
    expect(migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', isDefault: true, fs })).toEqual([]);
  });
});

describe('private file modes', () => {
  it('creates the data directory owner-only', async () => {
    const calls = [];
    await mkdirPrivate('/tmp/x/y', {
      mkdir: async (dir, opts) => calls.push([dir, opts]),
    });
    expect(calls).toEqual([['/tmp/x/y', { recursive: true, mode: 0o700 }]]);
  });

  it('writes a data file owner-only', async () => {
    // The vault is encrypted, but a world-readable copy is what makes an
    // offline attack on it available to every other account on the box.
    const calls = [];
    await writePrivateFile('/tmp/x/vault.json', 'blob', {
      mkdir: async () => {},
      writeFile: async (file, data, opts) => calls.push([file, data, opts]),
      chmod: async () => {},
    });
    expect(calls).toEqual([['/tmp/x/vault.json', 'blob', { mode: 0o600 }]]);
  });

  it('narrows a file an older version left world-readable', async () => {
    const chmods = [];
    await writePrivateFile('/tmp/x/vault.json', 'blob', {
      mkdir: async () => {},
      writeFile: async () => {},
      chmod: async (file, mode) => chmods.push([file, mode]),
    });
    expect(chmods).toEqual([['/tmp/x/vault.json', 0o600]]);
  });

  it('does not fail a write when the platform has no POSIX modes', async () => {
    await expect(
      writePrivateFile('/tmp/x/vault.json', 'blob', {
        mkdir: async () => {},
        writeFile: async () => {},
        chmod: async () => {
          throw new Error('ENOTSUP');
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('creates the parent directory before writing', async () => {
    const order = [];
    await writePrivateFile('/tmp/x/data.gz', Buffer.from('z'), {
      mkdir: async () => order.push('mkdir'),
      writeFile: async () => order.push('write'),
      chmod: async () => {},
    });
    expect(order).toEqual(['mkdir', 'write']);
  });
});
