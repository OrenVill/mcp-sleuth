import { BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { APP_ORIGIN } from './protocol.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090b',
    show: false,
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

  // Anything that tries to navigate away or open a window goes to the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.MCP_EXPLORER_DEV_URL;
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith(APP_ORIGIN);
    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  return win;
}
