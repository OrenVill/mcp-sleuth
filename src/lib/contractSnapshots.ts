import type { JsonSchema, ServerEntry, ToolDef } from '../types';
import { getAllTools } from './serverTools';

export interface ToolContract {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface ContractSnapshot {
  id: string;
  serverId: string;
  serverName: string;
  createdAt: number;
  label?: string;
  tools: ToolContract[];
}

export type ContractSnapshotsStore = Record<string, ContractSnapshot[]>;

const MAX_SNAPSHOTS_PER_SERVER = 30;

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function normalizeToolContract(tool: ToolDef): ToolContract {
  const description = tool.description?.trim();
  return {
    name: tool.name,
    ...(description ? { description } : {}),
    inputSchema: sortKeysDeep(tool.inputSchema) as JsonSchema,
  };
}

function newSnapshotId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildSnapshotFromServer(
  server: Pick<ServerEntry, 'id' | 'name' | 'tools' | 'discovered'>,
  label?: string,
  overrides?: Pick<ContractSnapshot, 'id' | 'createdAt'>,
): ContractSnapshot {
  const tools = getAllTools(server as ServerEntry).map(normalizeToolContract);
  tools.sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: overrides?.id ?? newSnapshotId(),
    serverId: server.id,
    serverName: server.name,
    createdAt: overrides?.createdAt ?? Date.now(),
    ...(label?.trim() ? { label: label.trim() } : {}),
    tools,
  };
}

export function trimSnapshotsForServer(snapshots: ContractSnapshot[]): ContractSnapshot[] {
  return [...snapshots].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SNAPSHOTS_PER_SERVER);
}

export function upsertSnapshotInStore(
  store: ContractSnapshotsStore,
  snapshot: ContractSnapshot,
): ContractSnapshotsStore {
  const existing = store[snapshot.serverId] ?? [];
  const withoutDup = existing.filter((s) => s.id !== snapshot.id);
  return { ...store, [snapshot.serverId]: trimSnapshotsForServer([snapshot, ...withoutDup]) };
}

export function removeSnapshotFromStore(
  store: ContractSnapshotsStore,
  serverId: string,
  snapshotId: string,
): ContractSnapshotsStore {
  const existing = store[serverId];
  if (!existing?.length) return store;
  const next = existing.filter((s) => s.id !== snapshotId);
  if (next.length === existing.length) return store;
  if (next.length === 0) {
    const rest = { ...store };
    delete rest[serverId];
    return rest;
  }
  return { ...store, [serverId]: next };
}
