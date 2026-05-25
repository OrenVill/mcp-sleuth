import { describe, expect, test } from 'vitest';
import { diffProtocolTraces } from './protocolDiff';
import type { ProtocolTraceEvent } from './protocolTrace';

function trace(overrides: Partial<ProtocolTraceEvent>): ProtocolTraceEvent {
  return {
    id: 'trace-a',
    serverId: 'docs',
    method: 'tools/call',
    status: 'ok',
    startedAt: 1_000,
    durationMs: 20,
    params: { name: 'search_docs', arguments: { query: 'release', limit: 3 } },
    result: { content: [{ type: 'text', text: '3 results' }] },
    ...overrides,
  };
}

describe('protocolDiff', () => {
  test('summarizes params, result, status, duration, error, and unsupported changes', () => {
    const left = trace({});
    const right = trace({
      id: 'trace-b',
      status: 'unsupported',
      durationMs: 75,
      params: { name: 'search_docs', arguments: { query: 'vault', limit: 3 } },
      result: { content: [{ type: 'text', text: '1 result' }] },
      error: 'Server does not support this optional MCP capability.',
    });

    expect(diffProtocolTraces(left, right)).toEqual([
      {
        path: 'params.arguments.query',
        label: 'Params changed',
        left: 'release',
        right: 'vault',
        kind: 'changed',
      },
      {
        path: 'result.content.0.text',
        label: 'Result changed',
        left: '3 results',
        right: '1 result',
        kind: 'changed',
      },
      {
        path: 'status',
        label: 'Status changed',
        left: 'ok',
        right: 'unsupported',
        kind: 'changed',
      },
      {
        path: 'durationMs',
        label: 'Duration changed',
        left: 20,
        right: 75,
        kind: 'changed',
      },
      {
        path: 'error',
        label: 'Error changed',
        left: undefined,
        right: 'Server does not support this optional MCP capability.',
        kind: 'added',
      },
      {
        path: 'unsupported',
        label: 'Unsupported capability changed',
        left: false,
        right: true,
        kind: 'changed',
      },
    ]);
  });

  test('returns an empty diff for equivalent event payloads', () => {
    const left = trace({ id: 'trace-a', startedAt: 1_000 });
    const right = trace({ id: 'trace-b', startedAt: 2_000 });

    expect(diffProtocolTraces(left, right)).toEqual([]);
  });
});
