import { ipcMain } from 'electron';
import { CHANNELS, fail, ok } from './channels.js';

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
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  handle(CHANNELS.windowClose, () => {
    getWindow()?.close();
  });

  handle(CHANNELS.windowIsMaximized, () => Boolean(getWindow()?.isMaximized()));
}

/** Push maximise-state changes so the renderer's toggle icon stays in sync. */
export function forwardWindowState(win) {
  const send = () => {
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNELS.windowMaximizedChanged, win.isMaximized());
    }
  };
  win.on('maximize', send);
  win.on('unmaximize', send);
}
