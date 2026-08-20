// CommonJS on purpose — sandboxed preload scripts cannot be ES modules.
const { contextBridge, ipcRenderer } = require('electron');

// Kept in sync with electron/ipc/channels.js. A sandboxed preload cannot import
// an ESM module from the app tree, so the names are duplicated here deliberately.
const INVOKE = [
  'mcp:windowMinimize',
  'mcp:windowMaximizeToggle',
  'mcp:windowClose',
  'mcp:windowIsMaximized',
  'mcp:connect',
  'mcp:connectStdio',
  'mcp:disconnect',
  'mcp:listTools',
  'mcp:callTool',
  'mcp:listResources',
  'mcp:readResource',
  'mcp:listPrompts',
  'mcp:getPrompt',
  'mcp:loadEnvelope',
  'mcp:saveEnvelope',
  'mcp:deleteEnvelope',
  'mcp:autoUnlockPassphrase',
  'mcp:saveFile',
  'mcp:readAppData',
  'mcp:writeAppData',
];

const api = {
  kind: 'electron',
  // macOS keeps native traffic lights, so the renderer only draws its own
  // window controls on the other platforms.
  platform: process.platform,
  invoke(channel, ...args) {
    if (!INVOKE.includes(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  onToolsChanged(handler) {
    const listener = (_event, serverId) => handler(serverId);
    ipcRenderer.on('mcp:toolsChanged', listener);
    return () => ipcRenderer.removeListener('mcp:toolsChanged', listener);
  },
  onMaximizedChanged(handler) {
    const listener = (_event, maximized) => handler(maximized);
    ipcRenderer.on('mcp:windowMaximizedChanged', listener);
    return () => ipcRenderer.removeListener('mcp:windowMaximizedChanged', listener);
  },
  onClosed(handler) {
    const listener = (_event, serverId) => handler(serverId);
    ipcRenderer.on('mcp:closed', listener);
    return () => ipcRenderer.removeListener('mcp:closed', listener);
  },
};

contextBridge.exposeInMainWorld('mcpExplorer', Object.freeze(api));
