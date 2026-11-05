import { describe, it, expect } from 'vitest';
import type { ServerEntry, ToolDef } from '../types';
import { buildSnapshotFromServer, sortKeysDeep } from './contractSnapshots';

describe('contractSnapshots', () => {
  it('sortKeysDeep stabilizes keys', () => {
    expect(Object.keys(sortKeysDeep({ b: 1, a: 2 }) as object)).toEqual(['a', 'b']);
  });

  it('buildSnapshotFromServer captures tools', () => {
    const tool: ToolDef = { name: 'echo', inputSchema: { type: 'object' } };
    const server: ServerEntry = {
      id: 's1',
      name: 'Fixture',
      url: 'http://localhost/mcp',
      status: 'connected',
      tools: [tool],
    };
    expect(buildSnapshotFromServer(server, 'baseline').tools).toHaveLength(1);
  });
});
