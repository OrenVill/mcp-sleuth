import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ResourceEntry, ResourceTemplate, ResourceContent, PromptDef, PromptMessage, ServerAuth, ToolDef, ToolResult } from '../types';

const clients = new Map<string, Client>();
const transports = new Map<string, StreamableHTTPClientTransport>();

function proxiedUrl(target: string): URL {
  // Always route through the local same-origin proxy so localhost MCP servers
  // without CORS headers (and any cross-origin server) work in the browser.
  const base = window.location.origin;
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

export async function connect(
  serverId: string,
  url: string,
  auth?: ServerAuth,
): Promise<ToolDef[]> {
  await disconnect(serverId);

  const requestInit = requestInitFromAuth(auth);
  const transport = new StreamableHTTPClientTransport(
    proxiedUrl(url),
    requestInit ? { requestInit } : undefined,
  );
  const client = new Client(
    { name: 'mcp-explorer', version: '0.1.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  clients.set(serverId, client);
  transports.set(serverId, transport);

  const list = await client.listTools();
  return list.tools as unknown as ToolDef[];
}

export async function disconnect(serverId: string): Promise<void> {
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

export async function callTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const client = clients.get(serverId);
  if (!client) {
    throw new Error(`Not connected to server "${serverId}"`);
  }
  const result = await client.callTool({ name, arguments: args });
  return result as unknown as ToolResult;
}

export function isConnected(serverId: string): boolean {
  return clients.has(serverId);
}

/**
 * Re-fetch the tool list for an already-connected server.
 * Returns an empty array if the server is disconnected.
 */
export async function refetchTools(serverId: string): Promise<ToolDef[]> {
  const client = clients.get(serverId);
  if (!client) return [];
  const list = await client.listTools();
  return list.tools as unknown as ToolDef[];
}

/**
 * Subscribe to `notifications/tools/list_changed` for a connected server.
 * Returns an unsubscribe function. No-op if disconnected.
 */
export function onToolsChanged(serverId: string, handler: () => void): () => void {
  const client = clients.get(serverId);
  if (!client) return () => {};
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    handler();
  });
  return () => {
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {});
  };
}

export async function listResources(
  serverId: string,
): Promise<{ resources: ResourceEntry[]; templates: ResourceTemplate[] }> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await client.listResources();
  const resources = (result.resources ?? []) as unknown as ResourceEntry[];
  const templates = (result.resourceTemplates ?? []) as unknown as ResourceTemplate[];
  return { resources, templates };
}

export async function readResource(
  serverId: string,
  uri: string,
): Promise<{ contents: ResourceContent[] }> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await client.readResource({ uri });
  return { contents: result.contents as unknown as ResourceContent[] };
}

export async function listPrompts(serverId: string): Promise<PromptDef[]> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await client.listPrompts();
  return result.prompts as unknown as PromptDef[];
}

export async function getPrompt(
  serverId: string,
  name: string,
  args: Record<string, string>,
): Promise<PromptMessage[]> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await client.getPrompt({ name, arguments: args });
  return result.messages as unknown as PromptMessage[];
}
