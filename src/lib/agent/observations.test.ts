import { describe, expect, it } from 'vitest';
import { emptyRunSummary, summarizeRun } from './observations';
import type { AgentEvent, AgentToolCall } from './types';

const call: AgentToolCall = { id: 'c1', llmName: 'x', serverId: 's1', toolName: 'x', args: {} };
const NOW = 1_700_000_000_000;

describe('summarizeRun', () => {
  it('starts from an empty summary and counts one run', () => {
    const summary = summarizeRun(undefined, 's1', [{ type: 'done' }], NOW);
    expect(summary).toEqual({
      serverId: 's1',
      runs: 1,
      wrongToolPicks: 0,
      badArgDenials: 0,
      toolErrors: 0,
      unrecoveredErrors: 0,
      lastRunAt: NOW,
    });
  });

  it('accumulates onto a previous summary', () => {
    const first = summarizeRun(undefined, 's1', [{ type: 'done' }], NOW);
    const second = summarizeRun(first, 's1', [{ type: 'done' }], NOW + 1000);
    expect(second.runs).toBe(2);
    expect(second.lastRunAt).toBe(NOW + 1000);
  });

  it('counts a wrong-tool denial', () => {
    const events: AgentEvent[] = [
      { type: 'tool_denied', call, reason: 'wrong_tool' },
      { type: 'done' },
    ];
    expect(summarizeRun(undefined, 's1', events, NOW).wrongToolPicks).toBe(1);
  });

  it('counts a bad-arguments denial', () => {
    const events: AgentEvent[] = [
      { type: 'tool_denied', call, reason: 'bad_arguments' },
      { type: 'done' },
    ];
    expect(summarizeRun(undefined, 's1', events, NOW).badArgDenials).toBe(1);
  });

  it('does not attribute unsafe or unexplained denials to any counter', () => {
    const events: AgentEvent[] = [
      { type: 'tool_denied', call, reason: 'unsafe' },
      { type: 'tool_denied', call, reason: 'no_reason' },
      { type: 'done' },
    ];
    const summary = summarizeRun(undefined, 's1', events, NOW);
    expect(summary.wrongToolPicks).toBe(0);
    expect(summary.badArgDenials).toBe(0);
  });

  it('counts tool errors', () => {
    const events: AgentEvent[] = [
      { type: 'tool_result', call, text: 'boom', isError: true },
      { type: 'tool_result', call, text: 'fine', isError: false },
      { type: 'done' },
    ];
    expect(summarizeRun(undefined, 's1', events, NOW).toolErrors).toBe(1);
  });

  it('counts an unrecovered error when the run hit the turn limit', () => {
    const events: AgentEvent[] = [{ type: 'turn_limit', turns: 8 }];
    expect(summarizeRun(undefined, 's1', events, NOW).unrecoveredErrors).toBe(1);
  });

  it('counts an unrecovered error when the run ended on an error', () => {
    const events: AgentEvent[] = [{ type: 'error', message: 'nope' }];
    expect(summarizeRun(undefined, 's1', events, NOW).unrecoveredErrors).toBe(1);
  });

  it('does not count an unrecovered error for a run that finished cleanly', () => {
    const events: AgentEvent[] = [
      { type: 'tool_result', call, text: 'boom', isError: true },
      { type: 'done' },
    ];
    expect(summarizeRun(undefined, 's1', events, NOW).unrecoveredErrors).toBe(0);
  });
});

describe('emptyRunSummary', () => {
  it('zeroes every counter', () => {
    expect(emptyRunSummary('s1')).toMatchObject({ runs: 0, toolErrors: 0, lastRunAt: 0 });
  });
});
