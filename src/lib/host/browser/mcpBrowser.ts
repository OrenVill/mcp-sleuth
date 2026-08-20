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
import { stdioBridgeMcpUrl } from '../../stdioParse';
import { startStdioSession, stopStdioSession } from '../../stdioSession';
import type { McpHost } from '../types';

const clients = new Map<string, Client>();
const transports = new Map<string, StreamableHTTPClientTransport>();

export function transportUrlForServer(
  target: string,
  proxyThroughLocal = true,
  baseOrigin?: string,
): URL {
  if (!proxyThroughLocal) return new URL(target);

  const base = baseOrigin ?? window.location.origin;
  return new URL(`/__mcp_proxy?target=${encodeURIComponent(target)}`, base);
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

async function releaseHttpConnection(serverId: string): Promise<void> {
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
}

async function openHttpSession(
  serverId: string,
  url: string,
  auth: ServerAuth | undefined,
  proxyThroughLocal: boolean,
): Promise<void> {
  const requestInit = requestInitFromAuth(auth);
  const transport = new StreamableHTTPClientTransport(
    transportUrlForServer(url, proxyThroughLocal),
    requestInit ? { requestInit } : undefined,
  );
  const client = new Client({ name: 'mcp-sleuth', version: '0.1.0' }, { capabilities: {} });

  await client.connect(transport);
  clients.set(serverId, client);
  transports.set(serverId, transport);
}

function requireClient(serverId: string): Client {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  return client;
}

export const browserMcpHost: McpHost = {
  async connect(serverId, url, auth, proxyThroughLocal) {
    await releaseHttpConnection(serverId);
    await stopStdioSession(serverId);
    await openHttpSession(serverId, url, auth, proxyThroughLocal);
  },

  async connectStdio(serverId, stdio: ServerStdioConfig, env) {
    await stopStdioSession(serverId);
    await startStdioSession(serverId, stdio, env);
    await releaseHttpConnection(serverId);
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
    const list = await requireClient(serverId).listTools();
    return list.tools as unknown as ToolDef[];
  },

  async callTool(serverId, name, args) {
    const result = await requireClient(serverId).callTool({ name, arguments: args });
    return result as unknown as ToolResult;
  },

  async listResources(serverId) {
    const result = await requireClient(serverId).listResources();
    return {
      resources: (result.resources ?? []) as unknown as ResourceEntry[],
      resourceTemplates: (result.resourceTemplates ?? []) as unknown as ResourceTemplate[],
    };
  },

  async readResource(serverId, uri) {
    const result = await requireClient(serverId).readResource({ uri });
    return { contents: result.contents as unknown as ResourceContent[] };
  },

  async listPrompts(serverId) {
    const result = await requireClient(serverId).listPrompts();
    return (result.prompts ?? []) as unknown as PromptDef[];
  },

  async getPrompt(serverId, name, args) {
    const result = await requireClient(serverId).getPrompt({ name, arguments: args });
    return result.messages as unknown as PromptMessage[];
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
};
