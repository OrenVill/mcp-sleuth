import type { DiscoveredTool } from '../../types';

/** Dedupe discovered tools by name; first entry wins (matches Dev Tools discovery). */
export function mergeDiscoveredTools(
  existing: DiscoveredTool[] | undefined,
  incoming: DiscoveredTool[],
): DiscoveredTool[] {
  const byName = new Map((existing ?? []).map((t) => [t.name, t]));
  for (const t of incoming) if (!byName.has(t.name)) byName.set(t.name, t);
  return Array.from(byName.values());
}
