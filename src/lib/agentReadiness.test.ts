import { describe, expect, test } from 'vitest';
import { analyzeAgentReadiness } from './agentReadiness';
import type { ServerEntry, ToolDef } from '../types';
import type { ProtocolTraceEvent } from './protocolTrace';

function serverWithTools(tools: ToolDef[]): ServerEntry {
  return {
    id: 'docs',
    name: 'Docs server',
    url: 'http://localhost:3000/mcp',
    status: 'connected',
    tools,
  };
}

describe('agentReadiness', () => {
  test('scores a well-described structured tool as agent ready', () => {
    const report = analyzeAgentReadiness([
      serverWithTools([
        {
          name: 'search_docs',
          description: 'Search the documentation corpus by natural language query.',
          inputSchema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query.',
              },
              mode: {
                type: 'string',
                description: 'Search strategy to use.',
                enum: ['semantic', 'keyword'],
                default: 'semantic',
              },
              limit: {
                type: 'integer',
                description: 'Maximum number of matching documents to return.',
                minimum: 1,
                maximum: 20,
                default: 5,
              },
            },
          },
        },
      ]),
    ]);

    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.verdict).toBe('excellent');
    expect(report.quickWins).toEqual([]);
  });

  test('accepts descriptive camelCase tool names without requiring snake_case', () => {
    const report = analyzeAgentReadiness([
      serverWithTools([
        {
          name: 'searchDocs',
          description: 'Search the documentation corpus by natural language query.',
          inputSchema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query.',
              },
            },
          },
        },
      ]),
    ]);

    expect(report.issues.map((issue) => issue.id)).not.toContain('tool-name-generic');
    expect(report.tools[0].verdict).toBe('excellent');
  });

  test('penalizes vague tool names, missing descriptions, and weak parameter metadata', () => {
    const report = analyzeAgentReadiness([
      serverWithTools([
        {
          name: 'query',
          inputSchema: {
            type: 'object',
            required: ['q', 'mode'],
            properties: {
              q: { type: 'string' },
              mode: { type: 'string' },
              filters: {
                type: 'object',
                properties: {
                  owner: { type: 'string' },
                },
              },
            },
          },
        },
      ]),
    ]);

    expect(report.verdict).toBe('not-ready');
    expect(report.tools[0].score).toBeLessThan(70);
    expect(report.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        'tool-name-generic',
        'tool-description-missing',
        'parameter-description-missing',
        'broad-string-without-enum',
        'complex-schema-simplified',
      ]),
    );
    expect(report.quickWins[0]).toContain('descriptions');
  });

  test('critical schema failures cap the server verdict even when other checks are minor', () => {
    const report = analyzeAgentReadiness([
      serverWithTools([
        {
          name: 'create_issue',
          description: 'Create an issue in the tracker.',
          inputSchema: {
            type: 'string',
            required: ['title'],
            properties: {},
          },
        },
      ]),
    ]);

    expect(report.score).toBeLessThan(70);
    expect(report.verdict).toBe('not-ready');
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        id: 'schema-root-not-object',
        severity: 'critical',
        toolName: 'create_issue',
      }),
    );
  });

  test('uses recent traces to warn about unstable result shapes and unclear errors', () => {
    const traces: ProtocolTraceEvent[] = [
      {
        id: 'trace-1',
        serverId: 'docs',
        method: 'tools/call',
        params: { name: 'search_docs', arguments: { query: 'auth' } },
        status: 'ok',
        startedAt: 1,
        finishedAt: 2,
        durationMs: 1,
        result: { content: [{ type: 'text', text: 'plain text result' }] },
      },
      {
        id: 'trace-2',
        serverId: 'docs',
        method: 'tools/call',
        params: { name: 'search_docs', arguments: { query: 'auth' } },
        status: 'error',
        startedAt: 3,
        finishedAt: 4,
        durationMs: 1,
        error: 'bad',
      },
    ];

    const report = analyzeAgentReadiness(
      [
        serverWithTools([
          {
            name: 'search_docs',
            description: 'Search the documentation corpus by natural language query.',
            inputSchema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language search query.',
                },
              },
            },
          },
        ]),
      ],
      traces,
    );

    expect(report.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining(['unstructured-text-result', 'unclear-error-message']),
    );
  });
});
