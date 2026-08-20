import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { filesToMigrate, getDataDir, migrateLegacyDataDir } from './data-dir.js';

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
    const names = migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', fs });

    expect(names).toEqual(['vault.json', 'data.gz']);
    expect(fs.copied).toEqual([
      [join('/legacy', 'vault.json'), join('/new', 'vault.json')],
      [join('/legacy', 'data.gz'), join('/new', 'data.gz')],
    ]);
  });

  it('leaves the legacy directory in place so a downgrade still works', () => {
    const fs = fakeFs({ '/legacy': ['vault.json'] });
    migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', fs });
    // Copy, never move: nothing is unlinked.
    expect(fs.copied).toHaveLength(1);
  });

  it('does nothing when there is no legacy directory', () => {
    const fs = fakeFs({});
    expect(migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', fs })).toEqual([]);
  });

  it('does nothing on a second run', () => {
    const fs = fakeFs({ '/legacy': ['vault.json'], '/new': ['vault.json'] });
    expect(migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', fs })).toEqual([]);
  });

  it('is a no-op when both paths are the same', () => {
    const fs = fakeFs({ '/same': ['vault.json'] });
    expect(migrateLegacyDataDir({ dataDir: '/same', legacyDir: '/same', fs })).toEqual([]);
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
    expect(() => migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', fs })).not.toThrow();
    expect(migrateLegacyDataDir({ dataDir: '/new', legacyDir: '/legacy', fs })).toEqual([]);
  });
});
