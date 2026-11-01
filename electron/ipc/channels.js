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
  // llm
  llmChatStart: 'mcp:llmChatStart',
  llmChatAbort: 'mcp:llmChatAbort',
  llmListModels: 'mcp:llmListModels',
  // files + app data
  saveFile: 'mcp:saveFile',
  readAppData: 'mcp:readAppData',
  writeAppData: 'mcp:writeAppData',
  // main → renderer pushes
  toolsChanged: 'mcp:toolsChanged',
  closed: 'mcp:closed',
  updateAvailable: 'mcp:updateAvailable',
  llmChunk: 'mcp:llmChunk',
  llmDone: 'mcp:llmDone',
  llmError: 'mcp:llmError',
};

/**
 * True when an IPC message came from Sleuth's own renderer document.
 *
 * A sandboxed frame gets no preload and so cannot reach IPC at all, which makes
 * this belt to that braces: it is here so that no future change — a relaxed
 * sandbox, a second BrowserWindow, a webview — silently hands the main process
 * a caller that can name a command to spawn or a URL to fetch.
 *
 * Origin equality, not a prefix: `app://mcp-sleuth.evil.example` starts with the
 * app origin as a string and is a different origin entirely.
 */
export function isTrustedSenderUrl(url, { appOrigin, devUrl } = {}) {
  if (typeof url !== 'string' || url.length === 0) return false;
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }
  // A custom scheme can serialise its origin as "null" depending on how it was
  // registered, so fall back to comparing the origin-shaped prefix exactly.
  const originOf = (candidate) => {
    try {
      const parsed = new URL(candidate);
      return parsed.origin === 'null' ? `${parsed.protocol}//${parsed.host}` : parsed.origin;
    } catch {
      return null;
    }
  };
  const actual = origin === 'null' ? originOf(url) : origin;
  if (actual === null) return false;
  if (appOrigin && actual === originOf(appOrigin)) return true;
  if (devUrl && actual === originOf(devUrl)) return true;
  return false;
}

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
