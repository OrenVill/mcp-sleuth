import { describe, expect, test } from 'vitest';
import {
  buildReplayCaseFromTrace,
  evaluateReplayCase,
  runReplaySuite,
  type ReplaySuite,
} from './replaySuites';
import type { ProtocolTraceEvent } from './protocolTrace';

function trace(overrides: Partial<ProtocolTraceEvent> = {}): ProtocolTraceEvent {
  return {
    id: 'trace-1',
    serverId: 'docs',
    method: 'tools/call',
    status: 'ok',
    startedAt: 1_000,
    durationMs: 42,
    params: { name: 'search_docs', arguments: { query: 'release' } },
    result: { content: [{ type: 'text', text: 'release checklist' }] },
    ...overrides,
  };
}

describe('replaySuites', () => {
  test('turns a successful manual tools/call trace into a replay case', () => {
    expect(buildReplayCaseFromTrace(trace(), 'Docs')).toEqual({
      id: 'trace-1',
      serverId: 'docs',
      serverName: 'Docs',
      toolName: 'search_docs',
      args: { query: 'release' },
      expectedStatus: 'ok',
      expectedResult: { content: [{ type: 'text', text: 'release checklist' }] },
      expectedDurationMs: 42,
    });
  });

  test('ignores traces that are not successful tool calls with object arguments', () => {
    expect(buildReplayCaseFromTrace(trace({ method: 'tools/list' }))).toBeNull();
    expect(buildReplayCaseFromTrace(trace({ status: 'error' }))).toBeNull();
    expect(
      buildReplayCaseFromTrace(trace({ params: { name: 'search_docs', arguments: 'bad' } })),
    ).toBeNull();
  });

  test('evaluates replayed output and reports result and duration differences', () => {
    const replayCase = buildReplayCaseFromTrace(trace(), 'Docs');
    if (!replayCase) throw new Error('expected replay case');

    expect(
      evaluateReplayCase(replayCase, {
        status: 'ok',
        durationMs: 90,
        result: { content: [{ type: 'text', text: 'new release checklist' }] },
      }),
    ).toEqual({
      caseId: 'trace-1',
      status: 'fail',
      durationMs: 90,
      result: { content: [{ type: 'text', text: 'new release checklist' }] },
      differences: [
        {
          path: 'result.content.0.text',
          label: 'Result changed',
          left: 'release checklist',
          right: 'new release checklist',
          kind: 'changed',
        },
        {
          path: 'durationMs',
          label: 'Duration changed',
          left: 42,
          right: 90,
          kind: 'changed',
        },
      ],
    });
  });

  test('runs suite cases sequentially through the supplied tool caller', async () => {
    const suite: ReplaySuite = {
      id: 'suite-1',
      name: 'Docs smoke test',
      createdAt: 1_000,
      cases: [
        {
          id: 'case-1',
          serverId: 'docs',
          serverName: 'Docs',
          toolName: 'search_docs',
          args: { query: 'release' },
          expectedStatus: 'ok',
          expectedResult: { content: [{ type: 'text', text: 'release checklist' }] },
        },
      ],
    };

    await expect(
      runReplaySuite(suite, async (testCase) => {
        expect(testCase.toolName).toBe('search_docs');
        return {
          status: 'ok',
          durationMs: 12,
          result: { content: [{ type: 'text', text: 'release checklist' }] },
        };
      }),
    ).resolves.toEqual([
      {
        caseId: 'case-1',
        status: 'pass',
        durationMs: 12,
        result: { content: [{ type: 'text', text: 'release checklist' }] },
        differences: [],
      },
    ]);
  });
});
