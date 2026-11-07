import { getHost } from './host';
import { getStoredMcpRoots } from './mcpRootsStore';

/** Push persisted roots to the Electron main process (no-op in the browser build). */
export async function syncMcpRootsToHost(): Promise<void> {
  const host = getHost();
  if (!host.mcp.setMcpRoots) return;
  await host.mcp.setMcpRoots(getStoredMcpRoots());
}
