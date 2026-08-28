import type { AgentEvent, AgentRunSummary } from './types';

export function emptyRunSummary(serverId: string): AgentRunSummary {
  return {
    serverId,
    runs: 0,
    wrongToolPicks: 0,
    badArgDenials: 0,
    toolErrors: 0,
    unrecoveredErrors: 0,
    lastRunAt: 0,
  };
}

/**
 * Reduce one run's events into the compact per-server record that Agent
 * Readiness consumes. Deliberately lossy: transcripts are never persisted,
 * because they hold raw tool output from the server under investigation.
 *
 * `unsafe` and `no_reason` denials feed no counter on purpose. If every reason
 * scored, users would be pushed into miscategorising a refusal to make it count.
 */
export function summarizeRun(
  previous: AgentRunSummary | undefined,
  serverId: string,
  events: AgentEvent[],
  now: number,
): AgentRunSummary {
  const base = previous ?? emptyRunSummary(serverId);
  let { wrongToolPicks, badArgDenials, toolErrors, unrecoveredErrors } = base;

  for (const event of events) {
    if (event.type === 'tool_denied') {
      if (event.reason === 'wrong_tool') wrongToolPicks += 1;
      if (event.reason === 'bad_arguments') badArgDenials += 1;
    }
    if (event.type === 'tool_result' && event.isError) toolErrors += 1;
  }

  const last = events.at(-1);
  if (last?.type === 'turn_limit' || last?.type === 'error') unrecoveredErrors += 1;

  return {
    serverId,
    runs: base.runs + 1,
    wrongToolPicks,
    badArgDenials,
    toolErrors,
    unrecoveredErrors,
    lastRunAt: now,
  };
}
