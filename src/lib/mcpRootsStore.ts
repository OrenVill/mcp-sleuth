import { getAppData, patchAppData } from './appData';

export interface McpRootEntry {
  uri: string;
  name?: string;
}

export const DEFAULT_MCP_ROOTS: McpRootEntry[] = [{ uri: 'file:///', name: 'Filesystem root' }];

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function getStoredMcpRoots(): McpRootEntry[] {
  const roots = getAppData().mcpRoots;
  if (!Array.isArray(roots) || roots.length === 0) {
    return DEFAULT_MCP_ROOTS.map((r) => ({ ...r }));
  }
  return roots
    .filter((r): r is McpRootEntry => Boolean(r && typeof r === 'object' && typeof r.uri === 'string'))
    .map((r) => ({ uri: r.uri, name: typeof r.name === 'string' ? r.name : undefined }));
}

export function setStoredMcpRoots(roots: McpRootEntry[]): void {
  const normalized = roots
    .filter((r) => r.uri.trim().length > 0)
    .map((r) => ({ uri: r.uri.trim(), name: r.name?.trim() || undefined }));
  patchAppData({
    version: 4,
    mcpRoots: normalized.length > 0 ? normalized : [...DEFAULT_MCP_ROOTS],
  });
  notify();
}

export function subscribeMcpRoots(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
