import { ipcMain, screen } from 'electron';
import { CHANNELS, fail, ok } from './channels.js';

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

function workAreaFor(win) {
  return screen.getDisplayMatching(win.getBounds()).workArea;
}

/** Returns the new maximised state. */
export function toggleMaximize(win) {
  // If the manager maximised it natively, undo that first — native maximise is
  // exactly what produces the offset/overflow on a frameless window.
  if (win.isMaximized()) {
    win.unmaximize();
    const previous = restoreBounds.get(win.id);
    if (previous) {
      win.setBounds(previous);
      restoreBounds.delete(win.id);
    }
    return false;
  }

  if (isFillingWorkArea(win.getBounds(), workAreaFor(win))) {
    const previous = restoreBounds.get(win.id);
    if (previous) win.setBounds(previous);
    restoreBounds.delete(win.id);
    return false;
  }

  restoreBounds.set(win.id, win.getBounds());
  win.setBounds(workAreaFor(win));
  return true;
}

export function isMaximized(win) {
  return win.isMaximized() || isFillingWorkArea(win.getBounds(), workAreaFor(win));
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
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
