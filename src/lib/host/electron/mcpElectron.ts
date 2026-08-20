import type {
  PromptDef,
  PromptMessage,
  ResourceContent,
  ResourceEntry,
  ResourceTemplate,
  ServerAuth,
  ServerStdioConfig,
  ToolDef,
  ToolResult,
} from '../../../types';
import type { McpHost } from '../types';

export interface IpcFailure {
  ok: false;
  error: { code: string; message: string };
}
export interface IpcSuccess<T> {
  ok: true;
  value: T;
}
export type IpcEnvelope<T> = IpcSuccess<T> | IpcFailure;

export interface ElectronBridge {
  readonly kind: 'electron';
  invoke(channel: string, ...args: unknown[]): Promise<IpcEnvelope<unknown>>;
  onToolsChanged(handler: (serverId: string) => void): () => void;
  onClosed(handler: (serverId: string) => void): () => void;
}

/** Rethrow an IPC failure as an Error carrying `.code`. */
function unwrap<T>(envelope: IpcEnvelope<unknown>): T {
  if (envelope.ok) return envelope.value as T;
  const err = new Error(envelope.error.message) as Error & { code?: string };
  err.code = envelope.error.code;
  throw err;
}

export function createElectronMcpHost(bridge: ElectronBridge): McpHost {
  // `McpHost.isConnected` is synchronous, and the only synchronous IPC blocks the
  // renderer. Mirror the state locally instead, and let main correct it via `onClosed`.
  const connected = new Set<string>();

  bridge.onClosed((serverId) => connected.delete(serverId));

  async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
    return unwrap<T>(await bridge.invoke(channel, ...args));
  }

  return {
    async connect(serverId, url, auth: ServerAuth | undefined) {
      // proxyThroughLocal is intentionally dropped: main issues the request from
      // Node, so there is no CORS problem and nothing to proxy.
      await call<void>('mcp:connect', serverId, url, auth);
      connected.add(serverId);
    },

    async connectStdio(serverId, stdio: ServerStdioConfig, env) {
      await call<void>('mcp:connectStdio', serverId, stdio, env);
      connected.add(serverId);
    },

    async disconnect(serverId) {
      try {
        await call<void>('mcp:disconnect', serverId);
      } finally {
        connected.delete(serverId);
      }
    },

    isConnected(serverId) {
      return connected.has(serverId);
    },

    listTools(serverId) {
      return call<ToolDef[]>('mcp:listTools', serverId);
    },

    callTool(serverId, name, args) {
      return call<ToolResult>('mcp:callTool', serverId, name, args);
    },

    listResources(serverId) {
      return call<{ resources: ResourceEntry[]; resourceTemplates: ResourceTemplate[] }>(
        'mcp:listResources',
        serverId,
      );
    },

    readResource(serverId, uri) {
      return call<{ contents: ResourceContent[] }>('mcp:readResource', serverId, uri);
    },

    listPrompts(serverId) {
      return call<PromptDef[]>('mcp:listPrompts', serverId);
    },

    getPrompt(serverId, name, args) {
      return call<PromptMessage[]>('mcp:getPrompt', serverId, name, args);
    },

    onToolsChanged(serverId, handler) {
      return bridge.onToolsChanged((changedId) => {
        if (changedId === serverId) handler();
      });
    },
  };
}
