import { ipcMain, screen } from 'electron';
import { CHANNELS, fail, ok } from './channels.js';
import { UNTRUSTED_SENDER_CODE, isTrustedSender } from './senderGuard.js';

/** Bounds to return to when un-maximising, keyed by window id. */
const restoreBounds = new Map();

/**
 * True when `bounds` already fills `workArea`.
 *
 * A frameless window cannot rely on `isMaximized()`: window managers maximise to
 * the screen plus the frame thickness, so a frameless window ends up offset and
 * overflowing. We size to the work area ourselves and compare against it, with a
 * small tolerance for managers that round.
 */
export function isFillingWorkArea(bounds, workArea, tolerance = 2) {
  return (
    Math.abs(bounds.x - workArea.x) <= tolerance &&
    Math.abs(bounds.y - workArea.y) <= tolerance &&
    Math.abs(bounds.width - workArea.width) <= tolerance &&
    Math.abs(bounds.height - workArea.height) <= tolerance
  );
}

/**
 * True when `bounds` sits entirely inside `displayBounds`.
 *
 * Used to judge whether the manager's own maximise behaved. Some managers
 * maximise to the screen *plus* frame thickness, leaving a frameless window
 * offset down-right and overflowing; that is what the self-sizing fallback
 * below exists for.
 */
export function fitsWithinDisplay(bounds, displayBounds, tolerance = 2) {
  return (
    bounds.x >= displayBounds.x - tolerance &&
    bounds.y >= displayBounds.y - tolerance &&
    bounds.x + bounds.width <= displayBounds.x + displayBounds.width + tolerance &&
    bounds.y + bounds.height <= displayBounds.y + displayBounds.height + tolerance
  );
}

/**
 * True when `bounds` looks like a real maximise of `displayBounds`.
 *
 * Two distinct failures have to be caught, and neither alone is sufficient:
 *
 * - The manager maximised to the screen *plus* frame thickness, leaving a
 *   frameless window offset and overflowing -> `fitsWithinDisplay` rejects it.
 * - No window manager is running at all (xvfb, bare CI images), so `maximize()`
 *   silently does nothing. The untouched window still fits the display, so only
 *   the coverage test catches it.
 *
 * The threshold is proportional rather than edge-to-edge so a taskbar or a side
 * dock still counts as maximised.
 */
export function looksMaximized(bounds, displayBounds, minCoverage = 0.8) {
  if (!fitsWithinDisplay(bounds, displayBounds)) return false;
  const displayArea = displayBounds.width * displayBounds.height;
  if (displayArea <= 0) return false;
  return (bounds.width * bounds.height) / displayArea >= minCoverage;
}

/** How long to give the manager to apply a maximise before judging the result. */
export const NATIVE_MAXIMIZE_CHECK_MS = 200;

/** Display ids where the manager's maximise was seen to overflow. */
const nativeMaximizeBroken = new Set();

/**
 * Windows asked to maximise whose geometry has not settled yet, mapped to a
 * function that abandons the attempt.
 *
 * The renderer is told "maximised" as soon as the request goes out, which flips
 * its button to Restore. Without this, a click during that window finds a
 * window that is not geometrically maximised yet and maximises it a second time.
 */
const pendingMaximize = new Map();

function workAreaFor(win) {
  return screen.getDisplayMatching(win.getBounds()).workArea;
}

/**
 * Maximise via the manager, then check it.
 *
 * The manager is preferred over sizing to `screen.workArea` ourselves because
 * `workArea` does not always reflect the host's reserved area: under WSLg it is
 * identical to the full display bounds, so self-sizing produces a window that
 * covers the Windows taskbar. The compositor knows the real usable area.
 *
 * When the manager gets it wrong instead, the result is undone and we size to
 * the work area after all — and that display is remembered, so the next
 * maximise skips the native attempt and its visible correction.
 */
function maximizeViaManager(
  win,
  display,
  { delay = NATIVE_MAXIMIZE_CHECK_MS, timer = setTimeout, clear = clearTimeout } = {},
) {
  win.maximize();
  const handle = timer(() => {
    pendingMaximize.delete(win.id);
    if (win.isDestroyed?.()) return;
    if (looksMaximized(win.getBounds(), display.bounds)) return;
    nativeMaximizeBroken.add(display.id);
    win.unmaximize();
    win.setBounds(display.workArea);
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNELS.windowMaximizedChanged, true);
    }
  }, delay);
  pendingMaximize.set(win.id, () => {
    clear(handle);
    pendingMaximize.delete(win.id);
  });
}

/**
 * Put the window back to `bounds` once the manager has finished un-maximising.
 *
 * `unmaximize()` is asynchronous on Linux and the manager reinstates its own
 * remembered geometry as it settles, so bounds applied before that lose the
 * race — the window keeps its size but lands wherever the manager decided.
 * The timeout covers managers that never emit the event.
 */
function restoreWhenUnmaximized(win, bounds, { delay = NATIVE_MAXIMIZE_CHECK_MS, timer = setTimeout } = {}) {
  const apply = () => {
    if (win.isDestroyed?.()) return;
    win.setBounds(bounds);
  };
  // Applied twice on purpose, and `setBounds` is idempotent. The event fires
  // before the geometry has settled on at least one compositor, and a manager
  // that never emits it needs the timer — whichever lands second wins, and both
  // ask for the same thing.
  win.once('unmaximize', apply);
  timer(apply, delay);
}

/** Returns the new maximised state. */
export function toggleMaximize(win) {
  // Restore clicked while a maximise we requested is still in flight: abandon
  // it, undo anything the manager already did, and put the bounds back.
  const abandon = pendingMaximize.get(win.id);
  if (abandon) {
    abandon();
    const previous = restoreBounds.get(win.id);
    restoreBounds.delete(win.id);
    if (win.isMaximized()) {
      if (previous) restoreWhenUnmaximized(win, previous);
      win.unmaximize();
    } else if (previous) {
      win.setBounds(previous);
    }
    return false;
  }

  // If the manager maximised it natively, undo that first — native maximise is
  // exactly what produces the offset/overflow on a frameless window.
  if (win.isMaximized()) {
    const previous = restoreBounds.get(win.id);
    restoreBounds.delete(win.id);
    if (previous) restoreWhenUnmaximized(win, previous);
    win.unmaximize();
    return false;
  }

  if (isFillingWorkArea(win.getBounds(), workAreaFor(win))) {
    const previous = restoreBounds.get(win.id);
    if (previous) win.setBounds(previous);
    restoreBounds.delete(win.id);
    return false;
  }

  restoreBounds.set(win.id, win.getBounds());
  const display = screen.getDisplayMatching(win.getBounds());
  if (nativeMaximizeBroken.has(display.id)) {
    win.setBounds(display.workArea);
  } else {
    maximizeViaManager(win, display);
  }
  return true;
}

export function isMaximized(win) {
  // A requested-but-unsettled maximise counts, so a resize event mid-flight does
  // not flip the renderer's button back to Maximize.
  return (
    pendingMaximize.has(win.id) ||
    win.isMaximized() ||
    isFillingWorkArea(win.getBounds(), workAreaFor(win))
  );
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) {
      return fail(new Error('Untrusted sender'), UNTRUSTED_SENDER_CODE);
    }
    try {
      return ok(await fn(...args));
    } catch (err) {
      return fail(err, 'E_WINDOW');
    }
  });
}

/**
 * The window is frameless, so minimise/maximise/close are drawn by the renderer
 * and routed back here. Frameless is required because Chromium draws a light 1px
 * client-side border around any window that keeps its own frame or merely hides
 * the title bar.
 */
export function registerWindowHandlers(getWindow) {
  handle(CHANNELS.windowMinimize, () => {
    getWindow()?.minimize();
  });

  handle(CHANNELS.windowMaximizeToggle, () => {
    const win = getWindow();
    if (!win) return false;
    const maximized = toggleMaximize(win);
    // Sizing to the work area does not raise the native maximize/unmaximize
    // events, so tell the renderer directly.
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNELS.windowMaximizedChanged, maximized);
    }
    return maximized;
  });

  handle(CHANNELS.windowClose, () => {
    getWindow()?.close();
  });

  handle(CHANNELS.windowIsMaximized, () => {
    const win = getWindow();
    return win ? isMaximized(win) : false;
  });
}

/** Push maximise-state changes so the renderer's toggle icon stays in sync. */
export function forwardWindowState(win) {
  const send = () => {
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNELS.windowMaximizedChanged, isMaximized(win));
    }
  };
  win.on('maximize', send);
  win.on('unmaximize', send);
  win.on('resize', send);
}
