import { describe, expect, it, vi } from 'vitest';
import {
  applyRefetchedTools,
  metaToolNamesWithDiscoveryRuns,
  refreshConnectedServerTools,
} from './serverRefresh';
import type { ToolDef } from '../types';

const echoTool: ToolDef = {
  name: 'echo',
  description: 'Echo',
  inputSchema: { type: 'object', properties: {} },
};

const searchToolsMeta: ToolDef = {
  name: 'search_tools',
  description: 'Search tools',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
};

describe('metaToolNamesWithDiscoveryRuns', () => {
  it('returns keys from discoveryRuns', () => {
    expect(
      metaToolNamesWithDiscoveryRuns({
        search_tools: { status: 'done', startedAt: 0, probesAttempted: 1, callsMade: 1, toolsFound: 2 },
      }),
    ).toEqual(['search_tools']);
  });

  it('returns empty when there are no runs', () => {
    expect(metaToolNamesWithDiscoveryRuns(undefined)).toEqual([]);
  });
});

describe('applyRefetchedTools', () => {
  it('detects meta-tools from the new tool list', () => {
    const { tools, metaTools } = applyRefetchedTools([echoTool, searchToolsMeta]);
    expect(tools).toHaveLength(2);
    expect(metaTools.some((m) => m.toolName === 'search_tools')).toBe(true);
  });
});

describe('refreshConnectedServerTools', () => {
  it('refetches tools and re-runs discovery for prior meta-tool runs', async () => {
    const refetchTools = vi.fn(async () => [echoTool, searchToolsMeta]);
    const applyTools = vi.fn();
    const clearDiscovered = vi.fn();
    const runDiscover = vi.fn(async () => {});

    const result = await refreshConnectedServerTools(
      'srv-1',
      {
        search_tools: {
          status: 'done',
          startedAt: 0,
          probesAttempted: 1,
          callsMade: 1,
          toolsFound: 1,
        },
      },
      { refetchTools, applyTools, clearDiscovered, runDiscover },
    );

    expect(refetchTools).toHaveBeenCalledWith('srv-1');
    expect(applyTools).toHaveBeenCalledWith('srv-1', [echoTool, searchToolsMeta]);
    expect(clearDiscovered).toHaveBeenCalledWith('srv-1');
    expect(runDiscover).toHaveBeenCalledWith('srv-1', 'search_tools');
    expect(result.tools).toHaveLength(2);
  });

  it('skips discovery when there are no prior runs', async () => {
    const refetchTools = vi.fn(async () => [echoTool]);
    const clearDiscovered = vi.fn();
    const runDiscover = vi.fn(async () => {});

    await refreshConnectedServerTools('srv-1', {}, {
      refetchTools,
      applyTools: vi.fn(),
      clearDiscovered,
      runDiscover,
    });

    expect(clearDiscovered).not.toHaveBeenCalled();
    expect(runDiscover).not.toHaveBeenCalled();
  });

  it('propagates refetch failures', async () => {
    const refetchTools = vi.fn(async () => {
      throw new Error('network down');
    });
    await expect(
      refreshConnectedServerTools('srv-1', {}, {
        refetchTools,
        applyTools: vi.fn(),
        clearDiscovered: vi.fn(),
        runDiscover: vi.fn(),
      }),
    ).rejects.toThrow('network down');
  });
});
