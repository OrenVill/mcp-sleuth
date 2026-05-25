import { describe, expect, test } from 'vitest';
import { generateHandoffReadme, type HandoffReadmeInput } from './handoffReadme';
import type { ServerEntry } from '../types';

function makeServer(overrides: Partial<ServerEntry> = {}): ServerEntry {
  return {
    id: 'docs',
    name: 'Docs Server',
    url: 'https://docs.example.com/mcp',
    status: 'connected',
    tools: [
      {
        name: 'search_docs',
        description: 'Search documentation by query',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results' },
          },
          required: ['query'],
        },
      },
    ],
    ...overrides,
  };
}

function input(overrides: Partial<HandoffReadmeInput> = {}): HandoffReadmeInput {
  return {
    server: makeServer(),
    options: {},
    ...overrides,
  };
}

describe('handoffReadme', () => {
  test('includes server name as title', () => {
    const md = generateHandoffReadme(input());
    expect(md).toContain('# Docs Server');
  });

  test('includes server URL', () => {
    const md = generateHandoffReadme(input());
    expect(md).toContain('https://docs.example.com/mcp');
  });

  test('includes tool names and descriptions', () => {
    const md = generateHandoffReadme(input());
    expect(md).toContain('search_docs');
    expect(md).toContain('Search documentation by query');
  });

  test('includes parameter table for tools', () => {
    const md = generateHandoffReadme(input());
    expect(md).toContain('query');
    expect(md).toContain('string');
  });

  test('includes readiness section when includeReadiness is true', () => {
    const md = generateHandoffReadme(input({ options: { includeReadiness: true } }));
    expect(md).toContain('Agent Readiness');
    expect(md).toMatch(/\d+\/100/);
  });

  test('omits readiness section when includeReadiness is false', () => {
    const md = generateHandoffReadme(input({ options: { includeReadiness: false } }));
    expect(md).not.toContain('Agent Readiness');
  });

  test('includes schema details when includeSchemas is true', () => {
    const md = generateHandoffReadme(input({ options: { includeSchemas: true } }));
    expect(md).toContain('```json');
  });

  test('omits raw schema blocks when includeSchemas is false', () => {
    const md = generateHandoffReadme(input({ options: { includeSchemas: false } }));
    expect(md).not.toContain('```json');
  });

  test('includes examples section when history records are supplied', () => {
    const md = generateHandoffReadme(
      input({
        history: [
          {
            id: 'h1',
            timestamp: 1_000,
            serverId: 'docs',
            serverName: 'Docs Server',
            toolName: 'search_docs',
            args: { query: 'release notes' },
            result: { content: [{ type: 'text', text: 'v1.0 released' }] },
          },
        ],
        options: { includeExamples: true },
      }),
    );
    expect(md).toContain('Examples');
    expect(md).toContain('search_docs');
    expect(md).toContain('release notes');
  });

  test('redacts sensitive args when includeExamples is true', () => {
    const md = generateHandoffReadme(
      input({
        history: [
          {
            id: 'h2',
            timestamp: 1_000,
            serverId: 'docs',
            serverName: 'Docs Server',
            toolName: 'search_docs',
            args: { query: 'release', apiKey: 'super-secret' },
          },
        ],
        options: { includeExamples: true },
      }),
    );
    expect(md).not.toContain('super-secret');
    expect(md).toContain('[REDACTED]');
  });

  test('includes replay suites section when replaySuites are supplied', () => {
    const md = generateHandoffReadme(
      input({
        replaySuites: [
          {
            id: 'suite-1',
            name: 'Smoke Test',
            createdAt: 1_000,
            cases: [
              {
                id: 'case-1',
                serverId: 'docs',
                toolName: 'search_docs',
                args: { query: 'test' },
                expectedStatus: 'ok',
                expectedResult: null,
              },
            ],
          },
        ],
        options: { includeReplaySuites: true },
      }),
    );
    expect(md).toContain('Smoke Test');
    expect(md).toContain('search_docs');
  });

  test('omits suites section when includeReplaySuites is false', () => {
    const md = generateHandoffReadme(
      input({
        replaySuites: [{ id: 's1', name: 'Suite A', createdAt: 1_000, cases: [] }],
        options: { includeReplaySuites: false },
      }),
    );
    expect(md).not.toContain('Suite A');
  });

  test('generates consistent markdown (no undefined/null printed)', () => {
    const md = generateHandoffReadme(
      input({ options: { includeReadiness: true, includeSchemas: true } }),
    );
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('[object Object]');
  });
});
