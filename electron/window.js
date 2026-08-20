import { BrowserWindow, screen } from 'electron';
import { openExternalUrl } from './externalLinks.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { APP_ORIGIN } from './protocol.js';
import { isDevToolsShortcut, isReloadShortcut } from './menu.js';
import {
  applyMaximized,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  resolveRestoredBounds,
} from './windowState.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Must match the app header's height so the window controls sit inside it. */
export const TITLE_BAR_HEIGHT = 55;

/**
 * `windowState` is the store from windowState.js. It is optional so the window can
 * still be created (at default size) if state persistence is unavailable.
 */
export function createWindow({ windowState = null } = {}) {
  const restored = resolveRestoredBounds(
    windowState?.readSync?.() ?? null,
    screen.getAllDisplays(),
    { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT },
  );

  const win = new BrowserWindow({
    // Omitting x/y (no restorable position) lets Electron centre the window.
    ...(restored.x !== undefined ? { x: restored.x, y: restored.y } : {}),
    width: restored.width,
    height: restored.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    // Transparent windows must not paint an opaque colour underneath; the page's
    // own background provides it.
    ...(process.platform === 'darwin' ? { backgroundColor: '#09090b' } : {}),
    show: false,
    // macOS keeps its native traffic lights, which sit cleanly over the content
    // and draw no border.
    //
    // Everywhere else the window is fully frameless AND transparent. Transparency
    // is the only setting that removes Chromium's light 1px client-side border —
    // `frame: false`, `titleBarStyle: 'hidden'`, `hasShadow: false`, and
    // `thickFrame: false` all still draw it. The cost is that the native
    // titleBarOverlay controls are unavailable, so the renderer draws its own
    // (see src/components/WindowControls.tsx) and routes them back over IPC.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' }
      : { frame: false, transparent: true }),
    // The menu (see menu.js) keeps Ctrl+C/V and friends registered; the bar itself
    // stays out of sight.
    autoHideMenuBar: true,
    webPreferences: {
      // The renderer displays tool descriptions, markdown, and images from
      // untrusted MCP servers. It must never get Node.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(here, 'preload.cjs'),
    },
  });

  win.once('ready-to-show', () => {
    // Sizing to the work area ourselves, exactly as the renderer's Maximize button
    // does — the manager's maximize() offsets and overflows a frameless window.
    // Applied here rather than in the constructor: some window managers ignore
    // geometry set before the window is realised.
    if (restored.maximized) applyMaximized(win);
    win.show();
  });

  // A desktop app must not reload out from under the user: a reload drops every
  // live MCP connection. DevTools chords go too — this is an application, not a
  // browser — except under `npm run electron:dev`, which sets a dev URL.
  const devMode = Boolean(process.env.MCP_SLEUTH_DEV_URL);
  win.webContents.on('before-input-event', (event, input) => {
    if (isReloadShortcut(input) || (!devMode && isDevToolsShortcut(input))) {
      event.preventDefault();
    }
  });

  // Anything that tries to open a window goes to the user's real browser, never
  // a second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.MCP_SLEUTH_DEV_URL;
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith(APP_ORIGIN);
    if (!allowed) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });

  return win;
}
