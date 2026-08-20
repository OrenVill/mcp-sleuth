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
