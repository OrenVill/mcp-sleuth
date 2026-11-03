import type { DiscoveredTool, MetaToolBinding, ToolResult } from '../../types';
import { extractToolDefs } from './parse';

/**
 * Turn a single meta-tool call result from Agent Chat into discovered tools,
 * using the same payload parser as the Dev Tools discovery strategies.
 */
export function discoverToolsFromMetaToolResult(
  meta: MetaToolBinding,
  result: ToolResult,
): DiscoveredTool[] {
  if (result.isError === true) return [];
  const parsed = extractToolDefs(result);
  return parsed.map((p) => ({
    ...p,
    source: { via: meta.toolName, kind: meta.kind },
  }));
}

export function isMetaToolCall(metaTools: MetaToolBinding[] | undefined, toolName: string): boolean {
  return (metaTools ?? []).some((m) => m.toolName === toolName);
}
