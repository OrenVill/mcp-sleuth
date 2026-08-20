import { describe, expect, it, vi } from 'vitest';
import {
  createWindowStateStore,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  parseWindowState,
  resolveRestoredBounds,
} from './windowState.js';

/** A single 1920x1080 display with a 40px taskbar, as Electron reports it. */
const PRIMARY = { workArea: { x: 0, y: 40, width: 1920, height: 1040 } };
/** A second display to the right — the one that gets unplugged. */
const SECONDARY = { workArea: { x: 1920, y: 0, width: 1280, height: 1024 } };

const DEFAULTS = {
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  minWidth: MIN_WIDTH,
  minHeight: MIN_HEIGHT,
};

describe('resolveRestoredBounds — no usable saved state', () => {
  it('returns the defaults when nothing was saved', () => {
    expect(resolveRestoredBounds(null, [PRIMARY], DEFAULTS)).toEqual({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      maximized: false,
    });
  });

  it('omits x/y so Electron centres a fresh window', () => {
    const restored = resolveRestoredBounds(undefined, [PRIMARY], DEFAULTS);
    expect(restored.x).toBeUndefined();
    expect(restored.y).toBeUndefined();
  });

  it.each([
    ['a non-object', 'not json'],
    ['an array', [1, 2]],
    ['missing width', { x: 10, y: 10, height: 700 }],
    ['a NaN coordinate', { x: Number.NaN, y: 10, width: 1000, height: 700 }],
    ['an infinite size', { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 700 }],
    ['string numbers', { x: '10', y: '10', width: '1000', height: '700' }],
    ['a zero size', { x: 0, y: 0, width: 0, height: 700 }],
    ['a negative size', { x: 0, y: 0, width: -1000, height: 700 }],
  ])('falls back to the defaults for %s', (_label, saved) => {
    expect(parseWindowState(saved)).toBeNull();
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS)).toEqual({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      maximized: false,
    });
  });
});

describe('resolveRestoredBounds — normal restore', () => {
  it('returns saved bounds untouched when they fit the display', () => {
    const saved = { x: 300, y: 200, width: 1200, height: 800, maximized: false };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS)).toEqual({
      x: 300,
      y: 200,
      width: 1200,
      height: 800,
      maximized: false,
    });
  });

  it('carries the maximized flag through', () => {
    const saved = { x: 300, y: 200, width: 1200, height: 800, maximized: true };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS).maximized).toBe(true);
  });

  it('treats a missing maximized flag as not maximized', () => {
    const saved = { x: 300, y: 200, width: 1200, height: 800 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS).maximized).toBe(false);
  });

  it('rounds fractional bounds from a scaled display', () => {
    const saved = { x: 300.6, y: 200.2, width: 1200.4, height: 800.7 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS)).toMatchObject({
      x: 301,
      y: 200,
      width: 1200,
      height: 801,
    });
  });

  it('restores onto a secondary display it still overlaps', () => {
    const saved = { x: 2000, y: 100, width: 1000, height: 700 };
    expect(resolveRestoredBounds(saved, [PRIMARY, SECONDARY], DEFAULTS)).toEqual({
      x: 2000,
      y: 100,
      width: 1000,
      height: 700,
      maximized: false,
    });
  });
});

describe('resolveRestoredBounds — the display is gone or changed', () => {
  it('discards a position on an unplugged monitor', () => {
    // Saved on SECONDARY, which is no longer connected.
    const saved = { x: 2100, y: 200, width: 1000, height: 700 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS)).toEqual({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      maximized: false,
    });
  });

  it('discards a position left off the top of the screen', () => {
    const saved = { x: 200, y: -900, width: 1000, height: 700 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS).x).toBeUndefined();
  });

  it('discards a window with only a sliver on screen', () => {
    // 20px of the left edge peeking in is not enough to grab.
    const saved = { x: 1900, y: 200, width: 1000, height: 700 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS).x).toBeUndefined();
  });

  it('keeps the maximized intent even when the position is discarded', () => {
    const saved = { x: 2100, y: 200, width: 1000, height: 700, maximized: true };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS)).toEqual({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      maximized: true,
    });
  });

  it('falls back when no display information is available at all', () => {
    const saved = { x: 300, y: 200, width: 1200, height: 800 };
    expect(resolveRestoredBounds(saved, [], DEFAULTS).x).toBeUndefined();
    expect(resolveRestoredBounds(saved, undefined, DEFAULTS).x).toBeUndefined();
  });

  it('ignores malformed display entries', () => {
    const junk = [null, {}, { workArea: { x: 0, y: 0, width: 0, height: 0 } }];
    const saved = { x: 300, y: 200, width: 1200, height: 800 };
    expect(resolveRestoredBounds(saved, [...junk, PRIMARY], DEFAULTS)).toMatchObject({
      x: 300,
      y: 200,
    });
  });
});

describe('resolveRestoredBounds — clamping to the work area', () => {
  it('shrinks a saved size larger than the display', () => {
    // Saved on a 2560x1440 monitor, reopened on the 1920x1080 one.
    const saved = { x: 0, y: 0, width: 2560, height: 1400 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS)).toEqual({
      x: 0,
      y: 40,
      width: 1920,
      height: 1040,
      maximized: false,
    });
  });

  it('pulls a window that overhangs the right edge back inside', () => {
    const saved = { x: 1500, y: 100, width: 1000, height: 700 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS)).toMatchObject({
      x: 920,
      y: 100,
      width: 1000,
      height: 700,
    });
  });

  it('respects the taskbar: never above the work area origin', () => {
    const saved = { x: 100, y: 0, width: 1000, height: 700 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS).y).toBe(40);
  });

  it('never returns a size below the minimum', () => {
    const saved = { x: 100, y: 100, width: 400, height: 200 };
    expect(resolveRestoredBounds(saved, [PRIMARY], DEFAULTS)).toMatchObject({
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
    });
  });

  it('keeps the minimum size even on a display smaller than the minimum', () => {
    // A 800x600 work area cannot hold a 900x600 window; the floor wins and the
    // window is pinned to the work-area origin.
    const tiny = { workArea: { x: 0, y: 0, width: 800, height: 500 } };
    const saved = { x: 10, y: 10, width: 700, height: 450 };
    expect(resolveRestoredBounds(saved, [tiny], DEFAULTS)).toEqual({
      x: 0,
      y: 0,
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
      maximized: false,
    });
  });

  it('floors the defaults at the minimum too', () => {
    const restored = resolveRestoredBounds(null, [PRIMARY], { width: 100, height: 100 });
    expect(restored).toEqual({ width: MIN_WIDTH, height: MIN_HEIGHT, maximized: false });
  });
});

/** Injected fs, mirroring appdata/store.test.js — never touches the real disk. */
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

function fakeFsSync(files) {
  return {
    readFileSync: vi.fn((p) => {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(p);
    }),
    writeFileSync: vi.fn((p, data) => files.set(p, data)),
    mkdirSync: vi.fn(() => undefined),
  };
}

const PATH = '/data/window-state.json';

describe('createWindowStateStore', () => {
  it('returns null when the file does not exist', async () => {
    const fs = fakeFs();
    const store = createWindowStateStore({ fs, fsSync: fakeFsSync(fs.files), filePath: PATH });
    expect(await store.read()).toBeNull();
    expect(store.readSync()).toBeNull();
  });

  it('returns null for a corrupt file rather than throwing', async () => {
    const fs = fakeFs(new Map([[PATH, '{ not json']]));
    const store = createWindowStateStore({ fs, fsSync: fakeFsSync(fs.files), filePath: PATH });
    expect(await store.read()).toBeNull();
    expect(store.readSync()).toBeNull();
  });

  it('round-trips a state through the async path', async () => {
    const fs = fakeFs();
    const store = createWindowStateStore({ fs, filePath: PATH });
    const state = { x: 10, y: 20, width: 1200, height: 800, maximized: false };

    await store.write(state);
    expect(fs.mkdir).toHaveBeenCalledWith('/data', { recursive: true });
    expect(await store.read()).toEqual(state);
  });

  it('writes synchronously for the close path', () => {
    const fs = fakeFs();
    const fsSync = fakeFsSync(fs.files);
    const store = createWindowStateStore({ fs, fsSync, filePath: PATH });

    store.writeSync({ x: 1, y: 2, width: 1000, height: 700, maximized: true });
    expect(fsSync.writeFileSync).toHaveBeenCalled();
    expect(store.readSync()).toEqual({ x: 1, y: 2, width: 1000, height: 700, maximized: true });
  });

  it('swallows write failures — window position is never worth crashing over', async () => {
    const fs = fakeFs();
    fs.writeFile = vi.fn(async () => {
      throw new Error('EACCES');
    });
    const fsSync = fakeFsSync(fs.files);
    fsSync.writeFileSync = vi.fn(() => {
      throw new Error('EACCES');
    });
    const store = createWindowStateStore({ fs, fsSync, filePath: PATH });

    await expect(store.write({ x: 0, y: 0, width: 1, height: 1 })).resolves.toBeUndefined();
    expect(() => store.writeSync({ x: 0, y: 0, width: 1, height: 1 })).not.toThrow();
  });

  it('is a no-op on the sync path when no sync fs is injected', () => {
    const store = createWindowStateStore({ fs: fakeFs(), filePath: PATH });
    expect(store.readSync()).toBeNull();
    expect(() => store.writeSync({ x: 0, y: 0, width: 1, height: 1 })).not.toThrow();
  });
});
