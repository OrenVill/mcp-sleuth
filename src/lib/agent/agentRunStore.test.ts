import { beforeEach, describe, expect, it } from 'vitest';
import { _resetCache, _seedCache } from '../appData';
import { getAgentRunSummaries, getAgentRunSummary, recordAgentRun } from './agentRunStore';
import type { AgentEvent } from './types';

const NOW = 1_700_000_000_000;

beforeEach(() => {
  _resetCache();
  _seedCache({ version: 2, bookmarks: [], history: [], observationJournals: {}, agentRuns: {} });
});

describe('agentRunStore', () => {
  it('returns undefined for a server with no runs', () => {
    expect(getAgentRunSummary('s1')).toBeUndefined();
  });

  it('records a run', () => {
    const events: AgentEvent[] = [{ type: 'done' }];
    recordAgentRun('s1', events, NOW);
    expect(getAgentRunSummary('s1')).toMatchObject({ serverId: 's1', runs: 1, lastRunAt: NOW });
  });

  it('accumulates across runs', () => {
    recordAgentRun('s1', [{ type: 'done' }], NOW);
    recordAgentRun('s1', [{ type: 'turn_limit', turns: 8 }], NOW + 1);
    const summary = getAgentRunSummary('s1');
    expect(summary).toMatchObject({ runs: 2, unrecoveredErrors: 1 });
  });

  it('keeps servers separate', () => {
    recordAgentRun('s1', [{ type: 'done' }], NOW);
    recordAgentRun('s2', [{ type: 'done' }], NOW);
    expect(Object.keys(getAgentRunSummaries())).toEqual(['s1', 's2']);
  });
});
