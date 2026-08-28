import { describe, expect, it, test } from 'vitest';
import { analyzeAgentReadiness, analyzeToolReadiness } from './agentReadiness';
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
describe('agent run issues', () => {
  const tool = {
    name: 'search',
    description: 'Searches the index for matching records.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The search text.' } },
      required: ['query'],
    },
  };
  const server = { id: 's1', name: 'One' };

  const summary = (over: Partial<import('./agent/types').AgentRunSummary>) => ({
    serverId: 's1',
    runs: 5,
    wrongToolPicks: 0,
    badArgDenials: 0,
    toolErrors: 0,
    unrecoveredErrors: 0,
    lastRunAt: 1,
    ...over,
  });

  it('adds no issue when no runs have happened', () => {
    const report = analyzeToolReadiness(tool, server, [], undefined);
    expect(report.issues.some((i) => i.id.startsWith('agent-'))).toBe(false);
  });

  it('adds no issue when runs were clean', () => {
    const report = analyzeToolReadiness(tool, server, [], summary({}));
    expect(report.issues.some((i) => i.id.startsWith('agent-'))).toBe(false);
  });

  it('flags repeated wrong-tool picks as high severity', () => {
    const report = analyzeToolReadiness(tool, server, [], summary({ wrongToolPicks: 2 }));
    const issue = report.issues.find((i) => i.id === 'agent-wrong-tool-picked');
    expect(issue?.severity).toBe('high');
    expect(issue?.message).toContain('2');
  });

  it('flags bad-argument denials', () => {
    const report = analyzeToolReadiness(tool, server, [], summary({ badArgDenials: 3 }));
    expect(report.issues.some((i) => i.id === 'agent-bad-arguments')).toBe(true);
  });

  it('flags runs that ended without recovering', () => {
    const report = analyzeToolReadiness(tool, server, [], summary({ unrecoveredErrors: 2 }));
    expect(report.issues.some((i) => i.id === 'agent-unrecovered-run')).toBe(true);
  });

  it('lowers the score when agent issues are present', () => {
    const clean = analyzeToolReadiness(tool, server, [], summary({}));
    const messy = analyzeToolReadiness(tool, server, [], summary({ wrongToolPicks: 2 }));
    expect(messy.score).toBeLessThan(clean.score);
  });
});
