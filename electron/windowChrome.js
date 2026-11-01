/**
 * Platform-specific BrowserWindow chrome options.
 *
 * Kept pure so unit tests can assert per-platform behavior without Electron.
 */

/** Must match the app header's height (see src/index.css `.app-titlebar`). */
export const TITLE_BAR_HEIGHT = 55;

/** Window surface colour — matches `#root` in index.css. */
export const WINDOW_BACKGROUND = '#09090b';

/** Caption button colour on Windows titleBarOverlay — zinc-400. */
export const WINDOWS_OVERLAY_SYMBOL = '#a1a1aa';

/**
 * Chrome-related `BrowserWindow` constructor options for the given platform.
 *
 * @param {NodeJS.Platform} platform
 */
export function resolveWindowChromeOptions(platform) {
  if (platform === 'darwin') {
    return {
      backgroundColor: WINDOW_BACKGROUND,
      titleBarStyle: 'hiddenInset',
    };
  }

  if (platform === 'win32') {
    // Aero Snap (Win + Arrow) needs a non-transparent window with a thick frame.
    // Custom renderer-drawn controls are replaced by native caption buttons in the
    // overlay region (see WindowControls.tsx / windowControls.ts).
    return {
      frame: false,
      backgroundColor: WINDOW_BACKGROUND,
      titleBarStyle: 'hidden',
      thickFrame: true,
      titleBarOverlay: {
        color: WINDOW_BACKGROUND,
        symbolColor: WINDOWS_OVERLAY_SYMBOL,
        height: TITLE_BAR_HEIGHT,
      },
    };
  }

  // Linux: transparency removes Chromium's 1px client border on frameless windows;
  // titleBarOverlay is unavailable on transparent windows, so controls stay custom.
  return {
    frame: false,
    transparent: true,
  };
}
