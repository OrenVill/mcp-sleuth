/**
 * IPC contract shared by the Electron main process and the renderer host.
 *
 * Pure module: no Electron imports, so both sides and the unit tests can load it.
 *
 * Every handler returns an envelope rather than throwing, because Electron wraps
 * anything thrown inside `ipcMain.handle` in a generic Error with a mangled
 * message, and prototypes do not survive the boundary.
 */

export const CHANNELS = {
  connect: 'mcp:connect',
  connectStdio: 'mcp:connectStdio',
  disconnect: 'mcp:disconnect',
  listTools: 'mcp:listTools',
  callTool: 'mcp:callTool',
  listResources: 'mcp:listResources',
  readResource: 'mcp:readResource',
  listPrompts: 'mcp:listPrompts',
  getPrompt: 'mcp:getPrompt',
  // secrets
  loadEnvelope: 'mcp:loadEnvelope',
  saveEnvelope: 'mcp:saveEnvelope',
  deleteEnvelope: 'mcp:deleteEnvelope',
  autoUnlockPassphrase: 'mcp:autoUnlockPassphrase',
  // window chrome
  windowMinimize: 'mcp:windowMinimize',
  windowMaximizeToggle: 'mcp:windowMaximizeToggle',
  windowClose: 'mcp:windowClose',
  windowIsMaximized: 'mcp:windowIsMaximized',
  windowMaximizedChanged: 'mcp:windowMaximizedChanged',
  // updates
  updateGetStatus: 'mcp:updateGetStatus',
  updateCheck: 'mcp:updateCheck',
  updateSetAutoCheck: 'mcp:updateSetAutoCheck',
  updateSkip: 'mcp:updateSkip',
  updateDismiss: 'mcp:updateDismiss',
  updateOpenRelease: 'mcp:updateOpenRelease',
  // files + app data
  saveFile: 'mcp:saveFile',
  readAppData: 'mcp:readAppData',
  writeAppData: 'mcp:writeAppData',
  // main → renderer pushes
  toolsChanged: 'mcp:toolsChanged',
  closed: 'mcp:closed',
  updateAvailable: 'mcp:updateAvailable',
};

export function ok(value) {
  return { ok: true, value };
}

export function fail(error, code = 'E_UNKNOWN') {
  return {
    ok: false,
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

// There is deliberately no `unwrap` here. Main only ever produces envelopes; the
// renderer consumes them, and its typed version lives in
// src/lib/host/electron/mcpElectron.ts. A sandboxed preload cannot import this
// ESM module anyway, so a shared consumer would not help.
