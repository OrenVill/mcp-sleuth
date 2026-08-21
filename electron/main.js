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
import { registerUpdateHandlers } from './ipc/updateHandlers.js';
import { createUpdateService } from './update/service.js';
import { createUpdateStateStore, getUpdateStateFilePath } from './update/store.js';
import { fetchLatestRelease, resolveFeedUrl } from './update/feed.js';
import { resolveCurrentVersion } from './update/appVersion.js';
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

// A throw anywhere in main used to take the app down with no window, no dialog,
// and nothing on screen. Log it and keep running: the MCP sessions and the
// user's unsaved vault state are worth more than a clean exit.
process.on('uncaughtException', (err) => {
  console.error('sleuth: uncaught exception in main', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('sleuth: unhandled rejection in main', reason);
});

let mainWindow = null;
let updateService = null;
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
    // Carry a pre-rename ~/.mcp-sleuth vault across, once, before anything
    // resolves a path. Non-destructive and never throws.
    const migrated = migrateLegacyDataDir();
    if (migrated.length > 0) {
      console.log(`sleuth: migrated ${migrated.join(', ')} from ~/.mcp-sleuth`);
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

    // The notifier only ever opens the release page: the builds are unsigned, so
    // nothing here downloads or installs. See docs/superpowers/specs.
    updateService = createUpdateService({
      // Not app.getVersion() alone: unpackaged it reports Electron's version,
      // because package.json deliberately has no `main` field.
      currentVersion: resolveCurrentVersion({ fallback: app.getVersion() }),
      store: createUpdateStateStore({ fs: nodeFs, filePath: getUpdateStateFilePath() }),
      // Electron's net.fetch, not Node's: it uses Chromium's stack and therefore
      // the system proxy settings.
      fetchRelease: () => fetchLatestRelease({ fetch: net.fetch, url: resolveFeedUrl() }),
    });
    registerUpdateHandlers(updateService, () => mainWindow);

    // Replaces Electron's default menu, which carries Reload / Force Reload.
    applyApplicationMenu(process.platform, {
      devMode: Boolean(process.env.MCP_SLEUTH_DEV_URL),
    });

    const windowState = createWindowStateStore({
      fs: nodeFs,
      fsSync: nodeFsSync,
      filePath: getWindowStateFilePath(),
    });

    mainWindow = createWindow({ windowState });
    forwardWindowState(mainWindow);

    // The renderer can be killed by an OOM or a GPU fault. Without this the
    // window goes blank with no explanation and no way back.
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error(`sleuth: renderer gone (${details.reason})`);
      if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reload();
      }
    });

    mainWindow.webContents.on('unresponsive', () => {
      console.warn('sleuth: renderer unresponsive');
    });
    attachWindowState(mainWindow, windowState);

    const devUrl = process.env.MCP_SLEUTH_DEV_URL;
    void mainWindow.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);

    // Schedules its own first check; nothing happens if the user switched
    // checking off, and a failure is logged rather than surfaced.
    void updateService.start();

    // The CLI daemon shares ~/.mcp-sleuth/ and last write wins. Running both is
    // legitimate, just lossy, so warn rather than block.
    const lock = await readLock();
    if (lock && isAlive(lock.pid)) {
      console.warn(
        `mcp-sleuth: the CLI daemon is running on port ${lock.port} and shares ` +
          `~/.mcp-sleuth/. Changes may overwrite each other. Run "mcp-sleuth stop" first.`,
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
    updateService?.stop();
    void sessions.closeAll();
  });
}
