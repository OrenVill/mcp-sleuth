import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ToolDef, ToolResult } from '../../types';
import type { StoredServer } from '../../lib/storage';

let sessionManagerModule: {
  createSessionManager: typeof import('../../../mcp/sessions.js').createSessionManager;
} | null = null;

async function loadSessionManager() {
  if (!sessionManagerModule) {
    const here = dirname(fileURLToPath(import.meta.url));
    const root = resolve(here, '..', '..');
    sessionManagerModule = await import(pathToFileURL(resolve(root, 'mcp/sessions.js')).href);
  }
  return sessionManagerModule;
}

function mcpToolToDef(tool: { name: string; description?: string; inputSchema?: unknown }): ToolDef {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: (tool.inputSchema ?? { type: 'object' }) as ToolDef['inputSchema'],
  };
}

export type ConnectedServer = {
  tools: ToolDef[];
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  listResources(): Promise<{ resources: unknown[]; resourceTemplates: unknown[] }>;
  listPrompts(): Promise<unknown[]>;
  disconnect(): Promise<void>;
};

export async function connectServer(stored: StoredServer): Promise<ConnectedServer> {
  const mod = await loadSessionManager();
  const { createSessionManager } = mod;
  const manager = createSessionManager();
  const id = stored.id;

  if (stored.transport === 'stdio' && stored.stdio) {
    await manager.connectStdio(id, stored.stdio, stored.stdioEnv ?? {});
  } else {
    const url = stored.url?.trim();
    if (!url) throw new Error(`Server "${stored.name}" has no URL.`);
    await manager.connect(id, url, stored.auth, {
      allowSelfSigned: stored.allowSelfSigned === true,
    });
  }

  const rawTools = await manager.listTools(id);
  const tools = rawTools.map(mcpToolToDef);

  return {
    tools,
    async callTool(name, args) {
      const result = await manager.callTool(id, name, args);
      return result as ToolResult;
    },
    async listResources() {
      return manager.listResources(id);
    },
    async listPrompts() {
      return manager.listPrompts(id);
    },
    async disconnect() {
      await manager.disconnect(id);
      await manager.closeAll();
    },
  };
}
