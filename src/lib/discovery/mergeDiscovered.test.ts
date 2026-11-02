import { describe, expect, it } from 'vitest';
import type { DiscoveredTool } from '../../types';
import { mergeDiscoveredTools } from './mergeDiscovered';

const tool = (name: string): DiscoveredTool => ({
  name,
  inputSchema: { type: 'object' },
  source: { via: 'list_tools', kind: 'bulk_list' },
});

describe('mergeDiscoveredTools', () => {
  it('merges new names into an empty list', () => {
    expect(mergeDiscoveredTools(undefined, [tool('a'), tool('b')])).toHaveLength(2);
  });

  it('keeps the first entry when names collide', () => {
    const first = { ...tool('a'), description: 'first' };
    const second = { ...tool('a'), description: 'second' };
    const merged = mergeDiscoveredTools([first], [second]);
    expect(merged).toHaveLength(1);
    expect(merged[0].description).toBe('first');
  });

  it('appends tools that are not already present', () => {
    const merged = mergeDiscoveredTools([tool('a')], [tool('b')]);
    expect(merged.map((t) => t.name)).toEqual(['a', 'b']);
  });
});
