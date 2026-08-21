import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_UPDATE_STATE, createUpdateStateStore, normaliseState } from './store.js';

function memoryFs(initial = null) {
  const files = new Map();
  if (initial !== null) files.set('/data/update-state.json', initial);
  return {
    files,
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async (path) => {
      if (!files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(path);
    }),
    writeFile: vi.fn(async (path, contents) => {
      files.set(path, contents);
    }),
  };
}

const PATH = '/data/update-state.json';

describe('normaliseState', () => {
  it('defaults to checking automatically', () => {
    expect(normaliseState(null)).toEqual(DEFAULT_UPDATE_STATE);
    expect(DEFAULT_UPDATE_STATE.autoCheck).toBe(true);
  });

  it('keeps a well-formed state', () => {
    const state = {
      autoCheck: false,
      skippedVersion: '1.3.0',
      dismissedVersion: '1.2.0',
      lastCheckedAt: 1755780000000,
    };
    expect(normaliseState(state)).toEqual(state);
  });

  it.each([
    ['a string', 'nope'],
    ['an array', []],
    ['a number', 7],
  ])('falls back to the defaults for %s', (_label, raw) => {
    expect(normaliseState(raw)).toEqual(DEFAULT_UPDATE_STATE);
  });

  it('only accepts a literal false for autoCheck, so a corrupt field keeps checks on', () => {
    expect(normaliseState({ autoCheck: 'no' }).autoCheck).toBe(true);
    expect(normaliseState({ autoCheck: 0 }).autoCheck).toBe(true);
    expect(normaliseState({ autoCheck: false }).autoCheck).toBe(false);
  });

  it('drops version fields that are not versions', () => {
    expect(normaliseState({ skippedVersion: 42 }).skippedVersion).toBeNull();
    expect(normaliseState({ dismissedVersion: '' }).dismissedVersion).toBeNull();
    expect(normaliseState({ skippedVersion: 'nightly' }).skippedVersion).toBeNull();
  });

  it('drops a non-finite timestamp', () => {
    expect(normaliseState({ lastCheckedAt: 'yesterday' }).lastCheckedAt).toBeNull();
    expect(normaliseState({ lastCheckedAt: Number.NaN }).lastCheckedAt).toBeNull();
  });

  it('ignores unknown keys rather than carrying them forward', () => {
    expect(normaliseState({ autoCheck: true, rogue: 1 })).toEqual(DEFAULT_UPDATE_STATE);
  });
});

describe('createUpdateStateStore', () => {
  it('returns the defaults when the file does not exist', async () => {
    const store = createUpdateStateStore({ fs: memoryFs(), filePath: PATH });
    await expect(store.read()).resolves.toEqual(DEFAULT_UPDATE_STATE);
  });

  it('returns the defaults when the file is corrupt', async () => {
    const store = createUpdateStateStore({ fs: memoryFs('{ not json'), filePath: PATH });
    await expect(store.read()).resolves.toEqual(DEFAULT_UPDATE_STATE);
  });

  it('round-trips a write', async () => {
    const fs = memoryFs();
    const store = createUpdateStateStore({ fs, filePath: PATH });
    await store.write({ ...DEFAULT_UPDATE_STATE, skippedVersion: '2.0.0' });
    await expect(store.read()).resolves.toMatchObject({ skippedVersion: '2.0.0' });
    expect(fs.mkdir).toHaveBeenCalled();
  });

  it('normalises on write, so nothing rogue reaches disk', async () => {
    const fs = memoryFs();
    const store = createUpdateStateStore({ fs, filePath: PATH });
    await store.write({ autoCheck: false, rogue: 'x' });
    expect(JSON.parse(fs.files.get(PATH))).toEqual({
      ...DEFAULT_UPDATE_STATE,
      autoCheck: false,
    });
  });

  it('patches a field without disturbing the rest', async () => {
    const fs = memoryFs(JSON.stringify({ ...DEFAULT_UPDATE_STATE, skippedVersion: '1.5.0' }));
    const store = createUpdateStateStore({ fs, filePath: PATH });
    const next = await store.update({ autoCheck: false });
    expect(next).toMatchObject({ autoCheck: false, skippedVersion: '1.5.0' });
  });

  it('never throws when the disk write fails — a preference is not worth a crash', async () => {
    const fs = memoryFs();
    fs.writeFile = vi.fn().mockRejectedValue(new Error('EROFS'));
    const store = createUpdateStateStore({ fs, filePath: PATH });
    await expect(store.write(DEFAULT_UPDATE_STATE)).resolves.toBeDefined();
  });
});
