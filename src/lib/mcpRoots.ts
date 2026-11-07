export { DEFAULT_MCP_ROOTS, type McpRootEntry } from './mcpRootsStore';
export { getStoredMcpRoots, setStoredMcpRoots, subscribeMcpRoots } from './mcpRootsStore';

import { getStoredMcpRoots } from './mcpRootsStore';

/** Roots returned for MCP `roots/list` in the browser (main process uses IPC sync). */
export function listMcpRoots(): Array<{ uri: string; name?: string }> {
  return getStoredMcpRoots();
}
