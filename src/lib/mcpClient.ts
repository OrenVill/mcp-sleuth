import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ResourceEntry, ResourceTemplate, ResourceContent, PromptDef, PromptMessage, ServerAuth, ToolDef, ToolResult } from '../types';
import { traceOptionalProtocolCall, traceProtocolCall } from './protocolTrace';

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

export async function connect(
  serverId: string,
  url: string,
  auth?: ServerAuth,
  proxyThroughLocal = true,
): Promise<ToolDef[]> {
  await disconnect(serverId);

  const requestInit = requestInitFromAuth(auth);
  const transport = new StreamableHTTPClientTransport(
    transportUrlForServer(url, proxyThroughLocal),
    requestInit ? { requestInit } : undefined,
  );
  const client = new Client(
    { name: 'mcp-explorer', version: '0.1.0' },
    { capabilities: {} },
  );

  await traceProtocolCall(
    { serverId, method: 'initialize', params: { url, proxyThroughLocal } },
    () => client.connect(transport),
  );
  clients.set(serverId, client);
  transports.set(serverId, transport);

  const list = await traceProtocolCall(
    { serverId, method: 'tools/list' },
    () => client.listTools(),
  );
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
  const result = await traceProtocolCall(
    { serverId, method: 'tools/call', params: { name, arguments: args } },
    () => client.callTool({ name, arguments: args }),
  );
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
  const list = await traceProtocolCall(
    { serverId, method: 'tools/list', params: { refresh: true } },
    () => client.listTools(),
  );
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
  const result = await traceOptionalProtocolCall(
    { serverId, method: 'resources/list' },
    () => client.listResources(),
    { resources: [], resourceTemplates: [] },
  );
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
  const result = await traceProtocolCall(
    { serverId, method: 'resources/read', params: { uri } },
    () => client.readResource({ uri }),
  );
  return { contents: result.contents as unknown as ResourceContent[] };
}

export async function listPrompts(serverId: string): Promise<PromptDef[]> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await traceOptionalProtocolCall(
    { serverId, method: 'prompts/list' },
    () => client.listPrompts(),
    { prompts: [] },
  );
  return result.prompts as unknown as PromptDef[];
}

export async function getPrompt(
  serverId: string,
  name: string,
  args: Record<string, string>,
): Promise<PromptMessage[]> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await traceProtocolCall(
    { serverId, method: 'prompts/get', params: { name, arguments: args } },
    () => client.getPrompt({ name, arguments: args }),
  );
  return result.messages as unknown as PromptMessage[];
}
