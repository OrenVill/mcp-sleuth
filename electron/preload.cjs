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
  'mcp:updateGetStatus',
  'mcp:updateCheck',
  'mcp:updateSetAutoCheck',
  'mcp:updateSkip',
  'mcp:updateDismiss',
  'mcp:updateOpenRelease',
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
  onUpdateAvailable(handler) {
    const listener = (_event, status) => handler(status);
    ipcRenderer.on('mcp:updateAvailable', listener);
    return () => ipcRenderer.removeListener('mcp:updateAvailable', listener);
  },
  onClosed(handler) {
    const listener = (_event, serverId) => handler(serverId);
    ipcRenderer.on('mcp:closed', listener);
    return () => ipcRenderer.removeListener('mcp:closed', listener);
  },

  // LLM traffic leaves main, so it cannot ride the generic `invoke` allowlist:
  // the response is streamed back on push channels keyed by request id.
  llmChatStart: (payload) => ipcRenderer.invoke('mcp:llmChatStart', payload),
  llmChatAbort: (requestId) => ipcRenderer.invoke('mcp:llmChatAbort', requestId),
  llmListModels: (payload) => ipcRenderer.invoke('mcp:llmListModels', payload),
  onLlmChunk: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('mcp:llmChunk', listener);
    return () => ipcRenderer.removeListener('mcp:llmChunk', listener);
  },
  onLlmDone: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('mcp:llmDone', listener);
    return () => ipcRenderer.removeListener('mcp:llmDone', listener);
  },
  onLlmError: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('mcp:llmError', listener);
    return () => ipcRenderer.removeListener('mcp:llmError', listener);
  },
};

contextBridge.exposeInMainWorld('mcpSleuth', Object.freeze(api));
