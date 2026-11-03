import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
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
import {
  chainHandler,
  isConnectionDeadError,
  isSessionLostError,
  isSseDisconnectSuspect,
} from '../../mcpSessionRecovery';
import { recordCompletedProtocolTrace } from '../../protocolTrace';
import { stdioBridgeMcpUrl } from '../../stdioParse';
import { startStdioSession, stopStdioSession } from '../../stdioSession';
import type { McpConnectOptions, McpHost } from '../types';

const clients = new Map<string, Client>();
const transports = new Map<string, StreamableHTTPClientTransport>();

type HttpConnectionMeta = {
  kind: 'http';
  url: string;
  auth: ServerAuth | undefined;
  proxyThroughLocal: boolean;
  options: McpConnectOptions;
};

type StdioBridgeMeta = {
  kind: 'stdio-bridge';
  stdio: ServerStdioConfig;
  env: Record<string, string>;
};

type ConnectionMeta = HttpConnectionMeta | StdioBridgeMeta;

const connectionMeta = new Map<string, ConnectionMeta>();
const closedListeners = new Set<(serverId: string) => void>();
const reconnectedListeners = new Set<(serverId: string) => void>();
const reconnectInflight = new Map<string, Promise<void>>();

/**
 * Where the SDK actually sends requests for a server.
 *
 * `allowSelfSigned` only reaches the local proxy. A direct browser connection
 * is subject to the browser's own certificate checks and no page can waive
 * them, which is why the form says the option needs local proxying.
 */
export function transportUrlForServer(
  target: string,
  proxyThroughLocal = true,
  baseOrigin?: string,
  options: { allowSelfSigned?: boolean } = {},
): URL {
  if (!proxyThroughLocal) return new URL(target);

  const base = baseOrigin ?? window.location.origin;
  const url = new URL(`/__mcp_proxy?target=${encodeURIComponent(target)}`, base);
  if (options.allowSelfSigned) url.searchParams.set('insecureTls', '1');
  return url;
}

/** UTF-8 safe Base64 (for HTTP Basic credentials beyond Latin-1). */
function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

/** Builds RequestInit headers from persisted MCP auth (StreamableHTTPClientTransport merges these on every request). */
export function requestInitFromAuth(auth: ServerAuth | undefined): RequestInit | undefined {
  if (!auth || auth.method === 'none') return undefined;

  const headers = new Headers();

  switch (auth.method) {
    case 'bearer': {
      const t = auth.bearerToken?.trim();
      if (t) headers.set('Authorization', `Bearer ${t}`);
      break;
    }
    case 'api_key': {
      const name = auth.apiKeyHeader?.trim();
      const value = auth.apiKeyValue?.trim();
      if (name && value) headers.set(name, value);
      break;
    }
    case 'basic': {
      const u = auth.basicUsername ?? '';
      const p = auth.basicPassword ?? '';
      headers.set('Authorization', `Basic ${utf8ToBase64(`${u}:${p}`)}`);
      break;
    }
    default:
      break;
  }

  if ([...headers.keys()].length === 0) return undefined;
  return { headers };
}

function emitClosed(serverId: string) {
  for (const listener of closedListeners) listener(serverId);
}

function emitReconnected(serverId: string) {
  for (const listener of reconnectedListeners) listener(serverId);
}

async function releaseHttpConnection(serverId: string, { notifyClosed = false } = {}): Promise<void> {
  const client = clients.get(serverId);
  if (client) {
    try {
      await client.close();
    } catch {
      /* ignore close errors */
    }
    clients.delete(serverId);
  }
  const transport = transports.get(serverId);
  if (transport) {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    transports.delete(serverId);
  }
  connectionMeta.delete(serverId);
  if (notifyClosed) emitClosed(serverId);
}

function attachTransportHandlers(serverId: string, client: Client, transport: StreamableHTTPClientTransport) {
  const handleClose = () => {
    if (transports.get(serverId) === transport) {
      void releaseHttpConnection(serverId, { notifyClosed: true });
    }
  };

  transport.onclose = chainHandler(
    transport.onclose as ((...args: unknown[]) => void) | undefined,
    handleClose,
  );

  transport.onerror = chainHandler(
    transport.onerror as ((...args: unknown[]) => void) | undefined,
    (err) => {
    if (transports.get(serverId) !== transport) return;
    void (async () => {
      if (isSseDisconnectSuspect(err)) {
        try {
          await client.ping();
          return;
        } catch (pingErr) {
          if (!isSessionLostError(pingErr)) return;
        }
      } else if (!isSessionLostError(err)) {
        return;
      }
    })();
  });
}

async function openHttpSession(
  serverId: string,
  url: string,
  auth: ServerAuth | undefined,
  proxyThroughLocal: boolean,
  options: McpConnectOptions = {},
): Promise<void> {
  const requestInit = requestInitFromAuth(auth);
  const transport = new StreamableHTTPClientTransport(
    transportUrlForServer(url, proxyThroughLocal, undefined, options),
    requestInit ? { requestInit } : undefined,
  );
  const client = new Client({ name: 'mcp-detective', version: '0.1.0' }, { capabilities: {} });

  await client.connect(transport);
  attachTransportHandlers(serverId, client, transport);
  clients.set(serverId, client);
  transports.set(serverId, transport);
}

async function reconnectSession(serverId: string): Promise<void> {
  const inflight = reconnectInflight.get(serverId);
  if (inflight) return inflight;

  const job = (async () => {
    const meta = connectionMeta.get(serverId);
    if (!meta) throw new Error(`Not connected to server "${serverId}"`);
    const saved = meta;
    await releaseHttpConnection(serverId);
    if (saved.kind === 'stdio-bridge') {
      await stopStdioSession(serverId);
    }
    try {
      if (saved.kind === 'http') {
        await openHttpSession(
          serverId,
          saved.url,
          saved.auth,
          saved.proxyThroughLocal,
          saved.options,
        );
        connectionMeta.set(serverId, saved);
      } else {
        await startStdioSession(serverId, saved.stdio, saved.env);
        connectionMeta.set(serverId, saved);
        await openHttpSession(serverId, stdioBridgeMcpUrl(serverId), undefined, false);
      }
      recordCompletedProtocolTrace({
        serverId,
        method: 'initialize',
        params: { reconnect: true },
      });
      emitReconnected(serverId);
    } catch (err) {
      if (saved.kind === 'stdio-bridge') {
        await stopStdioSession(serverId);
      }
      await releaseHttpConnection(serverId);
      connectionMeta.delete(serverId);
      emitClosed(serverId);
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Server restarted and could not be reconnected: ${detail}`, { cause: err });
    }
  })().finally(() => {
    reconnectInflight.delete(serverId);
  });

  reconnectInflight.set(serverId, job);
  return job;
}

async function withSessionRecovery<T>(serverId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isSessionLostError(err)) {
      await reconnectSession(serverId);
      return await fn();
    }
    if (isConnectionDeadError(err)) {
      await releaseHttpConnection(serverId);
      emitClosed(serverId);
    }
    throw err;
  }
}

function requireClient(serverId: string): Client {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  return client;
}

export const browserMcpHost: McpHost = {
  async connect(serverId, url, auth, proxyThroughLocal, options) {
    await releaseHttpConnection(serverId);
    await stopStdioSession(serverId);
    connectionMeta.set(serverId, {
      kind: 'http',
      url,
      auth,
      proxyThroughLocal,
      options: options ?? {},
    });
    await openHttpSession(serverId, url, auth, proxyThroughLocal, options ?? {});
  },

  async connectStdio(serverId, stdio: ServerStdioConfig, env) {
    await stopStdioSession(serverId);
    await releaseHttpConnection(serverId);
    await startStdioSession(serverId, stdio, env);
    connectionMeta.set(serverId, { kind: 'stdio-bridge', stdio, env });
    await openHttpSession(serverId, stdioBridgeMcpUrl(serverId), undefined, false);
  },

  async disconnect(serverId) {
    await releaseHttpConnection(serverId);
    await stopStdioSession(serverId);
  },

  isConnected(serverId) {
    return clients.has(serverId);
  },

  async listTools(serverId) {
    return withSessionRecovery(serverId, async () => {
      const list = await requireClient(serverId).listTools();
      return list.tools as unknown as ToolDef[];
    });
  },

  async callTool(serverId, name, args) {
    return withSessionRecovery(serverId, async () => {
      const result = await requireClient(serverId).callTool({ name, arguments: args });
      return result as unknown as ToolResult;
    });
  },

  async listResources(serverId) {
    return withSessionRecovery(serverId, async () => {
      const result = await requireClient(serverId).listResources();
      return {
        resources: (result.resources ?? []) as unknown as ResourceEntry[],
        resourceTemplates: (result.resourceTemplates ?? []) as unknown as ResourceTemplate[],
      };
    });
  },

  async readResource(serverId, uri) {
    return withSessionRecovery(serverId, async () => {
      const result = await requireClient(serverId).readResource({ uri });
      return { contents: result.contents as unknown as ResourceContent[] };
    });
  },

  async listPrompts(serverId) {
    return withSessionRecovery(serverId, async () => {
      const result = await requireClient(serverId).listPrompts();
      return (result.prompts ?? []) as unknown as PromptDef[];
    });
  },

  async getPrompt(serverId, name, args) {
    return withSessionRecovery(serverId, async () => {
      const result = await requireClient(serverId).getPrompt({ name, arguments: args });
      return result.messages as unknown as PromptMessage[];
    });
  },

  onToolsChanged(serverId, handler) {
    const client = clients.get(serverId);
    if (!client) return () => {};
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      handler();
    });
    return () => {
      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {});
    };
  },

  onClosed(handler) {
    closedListeners.add(handler);
    return () => closedListeners.delete(handler);
  },

  onReconnected(handler) {
    reconnectedListeners.add(handler);
    return () => reconnectedListeners.delete(handler);
  },
};
