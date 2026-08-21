import { ipcMain } from 'electron';
import { CHANNELS, fail, ok } from './channels.js';
import { openExternalUrl } from '../externalLinks.js';

function handle(channel, code, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return ok(await fn(...args));
    } catch (err) {
      return fail(err, code);
    }
  });
}

/**
 * Expose the update service to the renderer, and forward the six-hourly result
 * to the window so a session that has been open all day still learns about a
 * release.
 *
 * Returns an unsubscribe for the push, so the service does not hold a reference
 * to a destroyed window.
 */
export function registerUpdateHandlers(service, getWindow) {
  handle(CHANNELS.updateGetStatus, 'E_UPDATE_STATUS', () => service.getStatus());
  handle(CHANNELS.updateCheck, 'E_UPDATE_CHECK', () => service.check({ manual: true }));
  handle(CHANNELS.updateSetAutoCheck, 'E_UPDATE_PREF', (enabled) =>
    service.setAutoCheck(enabled === true),
  );
  handle(CHANNELS.updateSkip, 'E_UPDATE_PREF', (version) => service.skip(version));
  handle(CHANNELS.updateDismiss, 'E_UPDATE_PREF', (version) => service.dismiss(version));

  // The renderer never supplies the URL: it is whatever the last check returned,
  // and openExternalUrl refuses anything that is not http(s).
  handle(CHANNELS.updateOpenRelease, 'E_UPDATE_OPEN', () => {
    const url = service.getReleaseUrl();
    if (!url) return false;
    return openExternalUrl(url);
  });

  return service.onAvailable((status) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(CHANNELS.updateAvailable, status);
    }
  });
}
