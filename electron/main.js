import { app, net, protocol } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { APP_ORIGIN, APP_SCHEME, resolveAppPath } from './protocol.js';
import { createSessionManager } from './mcp/sessions.js';
import { registerMcpHandlers } from './ipc/mcpHandlers.js';
import { createWindow } from './window.js';

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, '..', 'dist');

// Must run before app ready, and before any top-level await.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let mainWindow = null;
const sessions = createSessionManager();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle(APP_SCHEME, (request) => {
      const filePath = resolveAppPath(request.url, distRoot);
      if (!filePath) return new Response('Not Found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    });

    registerMcpHandlers(sessions, () => mainWindow);

    mainWindow = createWindow();

    const devUrl = process.env.MCP_EXPLORER_DEV_URL;
    void mainWindow.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);

    app.on('activate', () => {
      if (mainWindow === null) {
        mainWindow = createWindow();
        void mainWindow.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    void sessions.closeAll();
  });
}
