import { describe, expect, it } from 'vitest';
import { analyzeAgentReadiness } from '../lib/agentReadiness';
import { scanPromptInjection } from '../lib/promptInjectionScan';
import { evaluateCheckGate, resolveCheckExitCode } from './checkGate';
import {
  EXIT_CHECK_INJECTION,
  EXIT_CHECK_READINESS,
  EXIT_CHECK_REPLAY,
  EXIT_OK,
} from './exitCodes';
import type { ServerEntry } from '../types';

const connectedEntry = (tools: ServerEntry['tools']): ServerEntry => ({
  id: 'srv-1',
  name: 'Fixture',
  url: 'http://127.0.0.1:3001/mcp',
  transport: 'http',
  status: 'connected',
  tools,
});

describe('resolveCheckExitCode', () => {
  it('returns OK when all enabled gates pass', () => {
    expect(
      resolveCheckExitCode({
        readinessPassed: true,
        failOnInjection: true,
        injectionPassed: true,
        replayEnabled: true,
        replayPassed: true,
      }),
    ).toBe(EXIT_OK);
  });

  it('prefers readiness over injection and replay', () => {
    expect(
      resolveCheckExitCode({
        readinessPassed: false,
        failOnInjection: true,
        injectionPassed: false,
        replayEnabled: true,
        replayPassed: false,
      }),
    ).toBe(EXIT_CHECK_READINESS);
  });

  it('returns injection when readiness passes and fail-on-injection finds issues', () => {
    expect(
      resolveCheckExitCode({
        readinessPassed: true,
        failOnInjection: true,
        injectionPassed: false,
        replayEnabled: false,
        replayPassed: true,
      }),
    ).toBe(EXIT_CHECK_INJECTION);
  });

  it('returns replay when earlier gates pass', () => {
    expect(
      resolveCheckExitCode({
        readinessPassed: true,
        failOnInjection: false,
        injectionPassed: true,
        replayEnabled: true,
        replayPassed: false,
      }),
    ).toBe(EXIT_CHECK_REPLAY);
  });
});

describe('evaluateCheckGate', () => {
  it('passes with default min readiness on well-described tools', () => {
    const entry = connectedEntry([
      {
        name: 'search_documents',
        description: 'Search indexed documents by keyword and return matching snippets.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query text' },
          },
          required: ['query'],
        },
      },
    ]);
    const readiness = analyzeAgentReadiness([entry]);
    const injection = scanPromptInjection([entry]);
    const gate = evaluateCheckGate({
      readiness,
      minReadiness: 70,
      failOnInjection: false,
      injection,
      replayEnabled: false,
      replayResults: [],
    });
    expect(gate.ok).toBe(true);
    expect(gate.exitCode).toBe(EXIT_OK);
    expect(gate.readiness.score).toBeGreaterThanOrEqual(70);
  });

  it('fails readiness when score is below threshold', () => {
    const entry = connectedEntry([
      {
        name: 'run',
        description: 'Do something.',
        inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
      },
    ]);
    const readiness = analyzeAgentReadiness([entry]);
    const injection = scanPromptInjection([entry]);
    const gate = evaluateCheckGate({
      readiness,
      minReadiness: 100,
      failOnInjection: false,
      injection,
      replayEnabled: false,
      replayResults: [],
    });
    expect(gate.ok).toBe(false);
    expect(gate.exitCode).toBe(EXIT_CHECK_READINESS);
  });
});
