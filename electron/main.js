import { app, net, protocol, safeStorage } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import * as nodeFs from 'node:fs/promises';
import * as nodeFsSync from 'node:fs';
import { APP_ORIGIN, APP_SCHEME, resolveAppPath } from './protocol.js';
import { createSessionManager } from './mcp/sessions.js';
import { registerMcpHandlers } from './ipc/mcpHandlers.js';
import { registerNativeHandlers } from './ipc/nativeHandlers.js';
import { forwardWindowState, registerWindowHandlers } from './ipc/windowHandlers.js';
import { createSecretsStore } from './secrets/store.js';
import { createAppDataStore } from './appdata/store.js';
import { createWindow } from './window.js';
import { applyApplicationMenu } from './menu.js';
import {
  attachWindowState,
  createWindowStateStore,
  getWindowStateFilePath,
} from './windowState.js';
import { getVaultFilePath } from '../vault-file-handler.js';
import { getAppDataFilePath } from '../app-data-handler.js';
import { isAlive, readLock } from '../daemon-lock.js';
import { migrateLegacyDataDir } from '../data-dir.js';

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

  app.whenReady().then(async () => {
    protocol.handle(APP_SCHEME, (request) => {
      const filePath = resolveAppPath(request.url, distRoot);
      if (!filePath) return new Response('Not Found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    });

    registerMcpHandlers(sessions, () => mainWindow);

    // safeStorage must not be touched before the app is ready, so the stores are
    // built here rather than at module top level.
    // Carry a pre-rename ~/.mcp-explorer vault across, once, before anything
    // resolves a path. Non-destructive and never throws.
    const migrated = migrateLegacyDataDir();
    if (migrated.length > 0) {
      console.log(`sleuth: migrated ${migrated.join(', ')} from ~/.mcp-explorer`);
    }

    const vaultPath = getVaultFilePath();
    const secrets = createSecretsStore({
      fs: nodeFs,
      safeStorage,
      vaultPath,
      devicePath: join(dirname(vaultPath), 'device-key.bin'),
    });
    const appData = createAppDataStore({ fs: nodeFs, filePath: getAppDataFilePath() });

    registerNativeHandlers({ secrets, appData, getWindow: () => mainWindow });
    registerWindowHandlers(() => mainWindow);

    // Replaces Electron's default menu, which carries Reload / Force Reload.
    applyApplicationMenu(process.platform, {
      devMode: Boolean(process.env.MCP_EXPLORER_DEV_URL),
    });

    const windowState = createWindowStateStore({
      fs: nodeFs,
      fsSync: nodeFsSync,
      filePath: getWindowStateFilePath(),
    });

    mainWindow = createWindow({ windowState });
    forwardWindowState(mainWindow);
    attachWindowState(mainWindow, windowState);

    const devUrl = process.env.MCP_EXPLORER_DEV_URL;
    void mainWindow.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);

    // The CLI daemon shares ~/.mcp-explorer/ and last write wins. Running both is
    // legitimate, just lossy, so warn rather than block.
    const lock = await readLock();
    if (lock && isAlive(lock.pid)) {
      console.warn(
        `mcp-explorer: the CLI daemon is running on port ${lock.port} and shares ` +
          `~/.mcp-explorer/. Changes may overwrite each other. Run "mcp-explorer stop" first.`,
      );
    }

    app.on('activate', () => {
      if (mainWindow === null) {
        mainWindow = createWindow({ windowState });
        forwardWindowState(mainWindow);
        attachWindowState(mainWindow, windowState);
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
