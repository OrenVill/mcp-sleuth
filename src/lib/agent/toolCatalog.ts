import type { ServerEntry } from '../../types';
import { getAllTools } from '../serverTools';
import type { LlmToolSchema } from './types';

const MAX_NAME_LENGTH = 64;

export interface CatalogEntry {
  llmName: string;
  serverId: string;
  toolName: string;
  schema: LlmToolSchema;
}

export interface CatalogCollision {
  llmName: string;
  keptServerId: string;
  droppedServerId: string;
  droppedServerName: string;
}

export interface ToolCatalog {
  entries: CatalogEntry[];
  tools: LlmToolSchema[];
  collisions: CatalogCollision[];
  resolve(llmName: string): { serverId: string; toolName: string } | null;
}

/** Providers accept ^[A-Za-z0-9_-]{1,64}$ for a function name. */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_NAME_LENGTH);
}

/**
 * Names are sent raw, never namespaced. Namespacing would paper over the
 * cross-server collision that opting extra servers in exists to expose, so a
 * collision is surfaced in `collisions` instead of being renamed away.
 */
export function buildToolCatalog(
  servers: ServerEntry[],
  selectedServerIds: string[],
): ToolCatalog {
  const selected = new Set(selectedServerIds);
  const entries: CatalogEntry[] = [];
  const collisions: CatalogCollision[] = [];
  const byName = new Map<string, CatalogEntry>();

  for (const server of servers) {
    if (!selected.has(server.id) || server.status !== 'connected') continue;
    for (const tool of getAllTools(server)) {
      const llmName = sanitizeToolName(tool.name);
      const existing = byName.get(llmName);
      if (existing) {
        collisions.push({
          llmName,
          keptServerId: existing.serverId,
          droppedServerId: server.id,
          droppedServerName: server.name,
        });
        continue;
      }
      const entry: CatalogEntry = {
        llmName,
        serverId: server.id,
        toolName: tool.name,
        schema: {
          name: llmName,
          description: tool.description ?? '',
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        },
      };
      byName.set(llmName, entry);
      entries.push(entry);
    }
  }

  return {
    entries,
    tools: entries.map((entry) => entry.schema),
    collisions,
    resolve(llmName) {
      const entry = byName.get(llmName);
      return entry ? { serverId: entry.serverId, toolName: entry.toolName } : null;
    },
  };
}
