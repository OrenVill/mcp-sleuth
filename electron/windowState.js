/**
 * Window bounds persistence: remember size, position, and the maximised flag so a
 * restart puts the window back where the user left it.
 *
 * The state file is a sibling of the CLI's app-data file (`getAppDataFilePath()`),
 * so `MCP_SLEUTH_DATA_DIR` keeps working and no new directory is invented.
 *
 * The restore decision (`resolveRestoredBounds`) is pure so it can be unit-tested
 * without Electron: it is the part that has to cope with an unplugged monitor, a
 * resolution change, or a corrupt file. File access is injected the way
 * `secrets/store.js` and `appdata/store.js` inject it.
 */
import { dirname, join } from 'node:path';
import { getAppDataFilePath } from '../app-data-handler.js';
import { isMaximized, toggleMaximize } from './ipc/windowHandlers.js';

/** Matches the BrowserWindow defaults in window.js. */
export const DEFAULT_WIDTH = 1440;
export const DEFAULT_HEIGHT = 900;
export const MIN_WIDTH = 900;
export const MIN_HEIGHT = 600;

export const DEFAULT_WINDOW = {
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  minWidth: MIN_WIDTH,
  minHeight: MIN_HEIGHT,
};

/** Long enough that a drag or resize writes once, short enough to survive a crash. */
export const SAVE_DEBOUNCE_MS = 400;

/**
 * How much of the window has to land on a display for the saved position to count
 * as reachable. Anything less and the user would have to guess where the window
 * went, so we fall back to the centred default instead.
 */
const MIN_VISIBLE_WIDTH = 80;
const MIN_VISIBLE_HEIGHT = 40;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

/** Accepts an Electron display (`{ workArea }`) or a bare rect. */
function workAreaOf(display) {
  if (!display || typeof display !== 'object') return null;
  const rect = display.workArea ?? display.bounds ?? display;
  if (!rect || typeof rect !== 'object') return null;
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function intersection(a, b) {
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
  };
}

/** Returns a normalised state, or null when the file was missing or malformed. */
export function parseWindowState(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const { x, y, width, height } = saved;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    maximized: saved.maximized === true,
  };
}

/**
 * Decide the bounds to open with.
 *
 * - No saved state, or malformed state -> the defaults, with no x/y so Electron
 *   centres the window.
 * - Saved bounds that no longer land on any connected display (monitor unplugged,
 *   resolution changed) -> the defaults, so the window never opens off-screen.
 * - Otherwise the saved bounds, shrunk to fit the display's work area and floored
 *   at the minimum window size, then nudged fully inside that work area.
 *
 * `displays` is `screen.getAllDisplays()` (or plain rects, for tests).
 */
export function resolveRestoredBounds(saved, displays, defaults = DEFAULT_WINDOW) {
  const minWidth = defaults.minWidth ?? MIN_WIDTH;
  const minHeight = defaults.minHeight ?? MIN_HEIGHT;
  const fallback = {
    width: Math.max(defaults.width ?? DEFAULT_WIDTH, minWidth),
    height: Math.max(defaults.height ?? DEFAULT_HEIGHT, minHeight),
    maximized: false,
  };

  const state = parseWindowState(saved);
  if (!state) return fallback;

  const areas = (Array.isArray(displays) ? displays : []).map(workAreaOf).filter(Boolean);

  // Pick the display the window overlaps most, ignoring displays it barely touches.
  let target = null;
  let bestArea = 0;
  for (const area of areas) {
    const overlap = intersection(state, area);
    if (overlap.width < Math.min(MIN_VISIBLE_WIDTH, state.width)) continue;
    if (overlap.height < Math.min(MIN_VISIBLE_HEIGHT, state.height)) continue;
    const covered = overlap.width * overlap.height;
    if (covered > bestArea) {
      target = area;
      bestArea = covered;
    }
  }

  // Off-screen, or no display information at all: keep the maximised intent but
  // drop the position.
  if (!target) return { ...fallback, maximized: state.maximized };

  const width = Math.max(Math.min(state.width, target.width), minWidth);
  const height = Math.max(Math.min(state.height, target.height), minHeight);

  return {
    x: clamp(state.x, target.x, Math.max(target.x, target.x + target.width - width)),
    y: clamp(state.y, target.y, Math.max(target.y, target.y + target.height - height)),
    width,
    height,
    maximized: state.maximized,
  };
}

export function getWindowStateFilePath() {
  return join(dirname(getAppDataFilePath()), 'window-state.json');
}

/**
 * `fs` is `node:fs/promises`; `fsSync` is `node:fs`. The synchronous pair exists
 * only for the `close` path — an awaited write there can lose the race against
 * process exit.
 */
export function createWindowStateStore({ fs, fsSync = null, filePath }) {
  function parse(raw) {
    try {
      return JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    } catch {
      return null;
    }
  }

  return {
    filePath,

    readSync() {
      if (!fsSync?.readFileSync) return null;
      try {
        return parse(fsSync.readFileSync(filePath, 'utf8'));
      } catch {
        return null;
      }
    },

    async read() {
      try {
        return parse(await fs.readFile(filePath, 'utf8'));
      } catch {
        return null;
      }
    },

    async write(state) {
      try {
        await fs.mkdir(dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(state), 'utf8');
      } catch {
        /* window position is a convenience; never fail the app over it */
      }
    },

    writeSync(state) {
      if (!fsSync?.writeFileSync) return;
      try {
        fsSync.mkdirSync(dirname(filePath), { recursive: true });
        fsSync.writeFileSync(filePath, JSON.stringify(state), 'utf8');
      } catch {
        /* same */
      }
    },
  };
}

/**
 * Restore a maximised window using the app's own work-area sizing rather than the
 * window manager's `maximize()`, which offsets and overflows a frameless window.
 * `toggleMaximize` also records the pre-maximise bounds, so the renderer's Restore
 * button returns to the size that was saved.
 */
export function applyMaximized(win, { isMax = isMaximized, toggle = toggleMaximize } = {}) {
  if (!isMax(win)) toggle(win);
}

/** Persist bounds on resize/move (debounced) and on close. Returns a detach fn. */
export function attachWindowState(win, store, options = {}) {
  const {
    debounceMs = SAVE_DEBOUNCE_MS,
    isMax = isMaximized,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = options;

  if (!win || !store) return () => {};

  // The bounds to reopen at are the *un*maximised ones; a maximised window would
  // otherwise overwrite them with the work area and lose the user's real size.
  let normal = win.getBounds();
  let timer = null;

  function snapshot() {
    if (win.isDestroyed?.()) return null;
    // Minimised bounds are meaningless on some platforms.
    if (win.isMinimized?.()) return { ...normal, maximized: false };
    const maximized = isMax(win);
    if (!maximized) normal = win.getBounds();
    return { ...normal, maximized };
  }

  function cancel() {
    if (timer) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  function schedule() {
    cancel();
    timer = setTimeoutFn(() => {
      timer = null;
      const state = snapshot();
      if (state) void store.write(state);
    }, debounceMs);
  }

  function onClose() {
    cancel();
    const state = snapshot();
    if (state) store.writeSync(state);
  }

  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('close', onClose);

  return () => {
    cancel();
    win.off?.('resize', schedule);
    win.off?.('move', schedule);
    win.off?.('close', onClose);
  };
}
