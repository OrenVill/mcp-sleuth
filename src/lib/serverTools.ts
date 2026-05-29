import type { ServerEntry, ToolDef } from '../types';

/** Native MCP tools plus discovered tools (deduped by name). */
export function getAllTools(server: ServerEntry): ToolDef[] {
  const nativeTools = server.tools ?? [];
  const nativeNames = new Set(nativeTools.map((tool) => tool.name));
  const discoveredTools = (server.discovered ?? []).filter((tool) => !nativeNames.has(tool.name));
  return [...nativeTools, ...discoveredTools];
}

export function getConnectedServers(servers: ServerEntry[]): ServerEntry[] {
  return servers.filter((server) => server.status === 'connected');
}
