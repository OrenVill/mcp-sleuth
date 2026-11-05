import { describe, it, expect } from 'vitest';
import { normalizeToolContract } from './contractSnapshots';
import { diffSnapshots } from './contractDrift';

describe('contractDrift', () => {
  it('detects added tools', () => {
    const base = {
      id: 'a',
      serverId: 's',
      serverName: 'S',
      createdAt: 1,
      tools: [normalizeToolContract({ name: 'a', inputSchema: { type: 'object' } })],
    };
    const next = {
      ...base,
      id: 'b',
      tools: [
        ...base.tools,
        normalizeToolContract({ name: 'b', inputSchema: { type: 'object' } }),
      ],
    };
    expect(diffSnapshots(base, next).addedToolNames).toEqual(['b']);
  });
});
