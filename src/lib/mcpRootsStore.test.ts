import { beforeEach, describe, expect, it } from 'vitest';
import { _resetCache, _seedCache } from './appData';
import { DEFAULT_MCP_ROOTS, getStoredMcpRoots, setStoredMcpRoots } from './mcpRootsStore';

describe('mcpRootsStore', () => {
  beforeEach(() => {
    _resetCache();
    _seedCache({ version: 4, bookmarks: [], history: [], observationJournals: {}, agentRuns: {} });
  });

  it('returns defaults when nothing is stored', () => {
    expect(getStoredMcpRoots()).toEqual(DEFAULT_MCP_ROOTS);
  });

  it('persists roots in app data', () => {
    setStoredMcpRoots([{ uri: 'file:///tmp/project', name: 'Project' }]);
    expect(getStoredMcpRoots()).toEqual([{ uri: 'file:///tmp/project', name: 'Project' }]);
  });
});
