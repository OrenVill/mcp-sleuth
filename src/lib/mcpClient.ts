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
} from '../types';
import { getHost } from './host';
import type { McpHost } from './host/types';
import { traceOptionalProtocolCall, traceProtocolCall } from './protocolTrace';

function mcp(): McpHost {
  return getHost().mcp;
}

/**
 * Throws before a trace span is opened, so calls to a disconnected server
 * do not appear in the Protocol Inspector.
 */
function requireConnected(host: McpHost, serverId: string): void {
  if (!host.isConnected(serverId)) {
    throw new Error(`Not connected to server "${serverId}"`);
  }
}

export async function connect(
  serverId: string,
  url: string,
  auth?: ServerAuth,
  proxyThroughLocal = true,
): Promise<ToolDef[]> {
  const host = mcp();
  await traceProtocolCall(
    { serverId, method: 'initialize', params: { url, proxyThroughLocal } },
    () => host.connect(serverId, url, auth, proxyThroughLocal),
  );
  return traceProtocolCall({ serverId, method: 'tools/list' }, () => host.listTools(serverId));
}

export async function connectStdio(
  serverId: string,
  stdio: ServerStdioConfig,
  stdioEnv: Record<string, string> = {},
): Promise<ToolDef[]> {
  const host = mcp();
  await traceProtocolCall(
    {
      serverId,
      method: 'initialize',
      // `env` is deliberately excluded: it can hold secrets.
      params: { transport: 'stdio', command: stdio.command, args: stdio.args },
    },
    () => host.connectStdio(serverId, stdio, stdioEnv),
  );
  return traceProtocolCall({ serverId, method: 'tools/list' }, () => host.listTools(serverId));
}

export async function disconnect(serverId: string): Promise<void> {
  await mcp().disconnect(serverId);
}

export async function callTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const host = mcp();
  requireConnected(host, serverId);
  return traceProtocolCall(
    { serverId, method: 'tools/call', params: { name, arguments: args } },
    () => host.callTool(serverId, name, args),
  );
}

export function isConnected(serverId: string): boolean {
  return mcp().isConnected(serverId);
}

/**
 * Re-fetch the tool list for an already-connected server.
 * Returns an empty array if the server is disconnected.
 */
export async function refetchTools(serverId: string): Promise<ToolDef[]> {
  const host = mcp();
  if (!host.isConnected(serverId)) return [];
  return traceProtocolCall({ serverId, method: 'tools/list', params: { refresh: true } }, () =>
    host.listTools(serverId),
  );
}

/**
 * Subscribe to `notifications/tools/list_changed` for a connected server.
 * Returns an unsubscribe function. No-op if disconnected.
 */
export function onToolsChanged(serverId: string, handler: () => void): () => void {
  return mcp().onToolsChanged(serverId, handler);
}

export async function listResources(
  serverId: string,
): Promise<{ resources: ResourceEntry[]; templates: ResourceTemplate[] }> {
  const host = mcp();
  requireConnected(host, serverId);
  const result = await traceOptionalProtocolCall(
    { serverId, method: 'resources/list' },
    () => host.listResources(serverId),
    { resources: [], resourceTemplates: [] },
  );
  return { resources: result.resources, templates: result.resourceTemplates };
}

export async function readResource(
  serverId: string,
  uri: string,
): Promise<{ contents: ResourceContent[] }> {
  const host = mcp();
  requireConnected(host, serverId);
  return traceProtocolCall({ serverId, method: 'resources/read', params: { uri } }, () =>
    host.readResource(serverId, uri),
  );
}

export async function listPrompts(serverId: string): Promise<PromptDef[]> {
  const host = mcp();
  requireConnected(host, serverId);
  return traceOptionalProtocolCall(
    { serverId, method: 'prompts/list' },
    () => host.listPrompts(serverId),
    [] as PromptDef[],
  );
}

export async function getPrompt(
  serverId: string,
  name: string,
  args: Record<string, string>,
): Promise<PromptMessage[]> {
  const host = mcp();
  requireConnected(host, serverId);
  return traceProtocolCall(
    { serverId, method: 'prompts/get', params: { name, arguments: args } },
    () => host.getPrompt(serverId, name, args),
  );
}
