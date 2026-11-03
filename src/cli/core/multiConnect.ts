import type { StoredServer } from '../../lib/storage';
import type { ToolResult } from '../../types';
import { buildToolCatalog } from '../../lib/agent/toolCatalog';
import type { LlmToolSchema } from '../../lib/agent/types';
import { connectServer } from './mcpConnect';

export type ChatMcpDeps = {
  callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  getTools: () => LlmToolSchema[];
  resolve(llmName: string): { serverId: string; toolName: string } | null;
  disconnectAll: () => Promise<void>;
};

export async function connectScope(
  serverIds: string[],
  servers: StoredServer[],
): Promise<ChatMcpDeps> {
  const selected = servers.filter((s) => serverIds.includes(s.id));
  if (selected.length === 0) {
    throw new Error('No servers selected for chat scope.');
  }

  const connections = await Promise.all(selected.map((s) => connectServer(s)));
  const entries = selected.map((s, i) => ({
    ...s,
    status: 'connected' as const,
    tools: connections[i].tools,
  }));

  const catalog = buildToolCatalog(entries, serverIds);

  return {
    async callTool(serverId, toolName, args) {
      const idx = selected.findIndex((s) => s.id === serverId);
      if (idx < 0) throw new Error(`Server not in scope: ${serverId}`);
      return connections[idx].callTool(toolName, args);
    },
    getTools: () => catalog.tools,
    resolve: (llmName) => catalog.resolve(llmName),
    async disconnectAll() {
      await Promise.all(connections.map((c) => c.disconnect()));
    },
  };
}
