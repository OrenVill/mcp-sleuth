import { ipcMain } from 'electron';
import { CHANNELS, fail, ok } from './channels.js';

/** Wrap a handler so every rejection crosses IPC as a structured envelope. */
function handle(channel, code, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return ok(await fn(...args));
    } catch (err) {
      return fail(err, code);
    }
  });
}

export function registerMcpHandlers(sessions, getWindow) {
  handle(CHANNELS.connect, 'E_CONNECT', (id, url, auth) => sessions.connect(id, url, auth));
  handle(CHANNELS.connectStdio, 'E_CONNECT_STDIO', (id, stdio, env) =>
    sessions.connectStdio(id, stdio, env),
  );
  handle(CHANNELS.disconnect, 'E_DISCONNECT', (id) => sessions.disconnect(id));
  handle(CHANNELS.listTools, 'E_LIST_TOOLS', (id) => sessions.listTools(id));
  handle(CHANNELS.callTool, 'E_CALL_TOOL', (id, name, args) => sessions.callTool(id, name, args));
  handle(CHANNELS.listResources, 'E_LIST_RESOURCES', (id) => sessions.listResources(id));
  handle(CHANNELS.readResource, 'E_READ_RESOURCE', (id, uri) => sessions.readResource(id, uri));
  handle(CHANNELS.listPrompts, 'E_LIST_PROMPTS', (id) => sessions.listPrompts(id));
  handle(CHANNELS.getPrompt, 'E_GET_PROMPT', (id, name, args) =>
    sessions.getPrompt(id, name, args),
  );

  function push(channel) {
    return (serverId) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, serverId);
      }
    };
  }

  const unsubscribers = [
    sessions.onToolsChanged(push(CHANNELS.toolsChanged)),
    sessions.onClosed(push(CHANNELS.closed)),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
