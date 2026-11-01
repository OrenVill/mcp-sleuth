import type { DiscoveryRun, ToolDef } from '../types';
import { detectMetaTools } from './discovery/detect';

/** Meta-tool names that should be re-discovered after a manual refresh. */
export function metaToolNamesWithDiscoveryRuns(
  discoveryRuns: Record<string, DiscoveryRun> | undefined,
): string[] {
  if (!discoveryRuns) return [];
  return Object.keys(discoveryRuns);
}

export function applyRefetchedTools(tools: ToolDef[]): {
  tools: ToolDef[];
  metaTools: ReturnType<typeof detectMetaTools>;
} {
  return { tools, metaTools: detectMetaTools(tools) };
}

export type ServerRefreshDeps = {
  refetchTools: (serverId: string) => Promise<ToolDef[]>;
  applyTools: (serverId: string, tools: ToolDef[]) => void;
  runDiscover: (serverId: string, metaToolName: string) => Promise<void>;
  clearDiscovered: (serverId: string) => void;
};

/**
 * Reload native tools for a connected server, then re-run discovery for every
 * meta-tool that had a prior discovery run. Does not disconnect.
 */
export async function refreshConnectedServerTools(
  serverId: string,
  discoveryRuns: Record<string, DiscoveryRun> | undefined,
  deps: ServerRefreshDeps,
): Promise<{ tools: ToolDef[]; metaTools: ReturnType<typeof detectMetaTools> }> {
  const tools = await deps.refetchTools(serverId);
  const applied = applyRefetchedTools(tools);
  deps.applyTools(serverId, applied.tools);
  const metaNames = metaToolNamesWithDiscoveryRuns(discoveryRuns);
  if (metaNames.length > 0) {
    deps.clearDiscovered(serverId);
    for (const name of metaNames) {
      await deps.runDiscover(serverId, name);
    }
  }
  return applied;
}
