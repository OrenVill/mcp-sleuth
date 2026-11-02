import { describe, expect, it } from 'vitest';
import type { MetaToolBinding, ToolResult } from '../../types';
import { discoverToolsFromMetaToolResult, isMetaToolCall } from './chatDiscovery';

const meta: MetaToolBinding = {
  toolName: 'list_tools',
  kind: 'bulk_list',
  confidence: 0.9,
};

const bulkListResult = (tools: { name: string; description?: string }[]): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ tools }) }],
});

describe('discoverToolsFromMetaToolResult', () => {
  it('parses a bulk-list payload and tags source', () => {
    const discovered = discoverToolsFromMetaToolResult(
      meta,
      bulkListResult([
        { name: 'alpha', description: 'A' },
        { name: 'beta' },
      ]),
    );
    expect(discovered).toHaveLength(2);
    expect(discovered[0]).toMatchObject({
      name: 'alpha',
      source: { via: 'list_tools', kind: 'bulk_list' },
    });
  });

  it('returns nothing for an error result', () => {
    expect(
      discoverToolsFromMetaToolResult(meta, {
        content: [{ type: 'text', text: 'fail' }],
        isError: true,
      }),
    ).toEqual([]);
  });

  it('handles search-style payloads with a results array', () => {
    const searchMeta: MetaToolBinding = { toolName: 'search_tools', kind: 'search', confidence: 0.8 };
    const discovered = discoverToolsFromMetaToolResult(
      searchMeta,
      bulkListResult([{ name: 'found_one' }]),
    );
    expect(discovered[0]?.source).toEqual({ via: 'search_tools', kind: 'search' });
  });
});

describe('isMetaToolCall', () => {
  it('matches a bound meta-tool name', () => {
    expect(isMetaToolCall([meta], 'list_tools')).toBe(true);
    expect(isMetaToolCall([meta], 'echo')).toBe(false);
  });
});
