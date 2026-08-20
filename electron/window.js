import { BrowserWindow } from 'electron';
import { openExternalUrl } from './externalLinks.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { APP_ORIGIN } from './protocol.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Must match the app header's height so the window controls sit inside it. */
export const TITLE_BAR_HEIGHT = 55;

export function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
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
    // Keeps the default menu's accelerators (Ctrl+C/V) registered but out of sight.
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

  win.once('ready-to-show', () => win.show());

  // Anything that tries to open a window goes to the user's real browser, never
  // a second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.MCP_EXPLORER_DEV_URL;
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith(APP_ORIGIN);
    if (!allowed) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });

  return win;
}
