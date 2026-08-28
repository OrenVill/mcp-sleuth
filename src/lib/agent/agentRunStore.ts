import { getAppData, patchAppData } from '../appData';
import { summarizeRun } from './observations';
import type { AgentEvent, AgentRunSummaries, AgentRunSummary } from './types';

export function getAgentRunSummaries(): AgentRunSummaries {
  return getAppData().agentRuns;
}

export function getAgentRunSummary(serverId: string): AgentRunSummary | undefined {
  return getAgentRunSummaries()[serverId];
}

/**
 * Fold one finished run into the server's summary. Only derived counters are
 * written — the transcript holds raw output from the server under investigation
 * and is deliberately never persisted.
 */
export function recordAgentRun(
  serverId: string,
  events: AgentEvent[],
  now: number = Date.now(),
): AgentRunSummary {
  const summaries = getAgentRunSummaries();
  const next = summarizeRun(summaries[serverId], serverId, events, now);
  patchAppData({ agentRuns: { ...summaries, [serverId]: next } });
  return next;
}
