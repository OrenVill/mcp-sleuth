import type { ToolResult } from '../types';
import { diffValues, type ProtocolDiffEntry } from './protocolDiff';
import type { ProtocolTraceEvent } from './protocolTrace';

export interface ReplayCase {
  id: string;
  serverId: string;
  serverName?: string;
  toolName: string;
  args: Record<string, unknown>;
  expectedStatus: 'ok';
  expectedResult: unknown;
  expectedDurationMs?: number;
}

export interface ReplaySuite {
  id: string;
  name: string;
  createdAt: number;
  cases: ReplayCase[];
}

export interface ReplayCallOutcome {
  status: 'ok' | 'error';
  result?: ToolResult | unknown;
  error?: string;
  durationMs?: number;
}

export interface ReplayCaseResult {
  caseId: string;
  status: 'pass' | 'fail';
  durationMs?: number;
  result?: unknown;
  error?: string;
  differences: ProtocolDiffEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function buildReplayCaseFromTrace(
  trace: ProtocolTraceEvent,
  serverName?: string,
): ReplayCase | null {
  if (trace.method !== 'tools/call' || trace.status !== 'ok') return null;
  if (!isRecord(trace.params)) return null;

  const toolName = trace.params.name;
  const args = trace.params.arguments;
  if (typeof toolName !== 'string' || !isRecord(args)) return null;

  return {
    id: trace.id,
    serverId: trace.serverId,
    serverName,
    toolName,
    args,
    expectedStatus: 'ok',
    expectedResult: trace.result,
    expectedDurationMs: trace.durationMs,
  };
}

export function evaluateReplayCase(
  testCase: ReplayCase,
  outcome: ReplayCallOutcome,
): ReplayCaseResult {
  const differences: ProtocolDiffEntry[] = [];

  differences.push(...diffValues(testCase.expectedStatus, outcome.status, 'status'));
  differences.push(...diffValues(testCase.expectedResult, outcome.result, 'result'));

  if (
    testCase.expectedDurationMs !== undefined &&
    outcome.durationMs !== undefined &&
    outcome.durationMs > Math.ceil(testCase.expectedDurationMs * 1.25)
  ) {
    differences.push(...diffValues(testCase.expectedDurationMs, outcome.durationMs, 'durationMs'));
  }

  if (outcome.error !== undefined) {
    differences.push(...diffValues(undefined, outcome.error, 'error'));
  }

  return {
    caseId: testCase.id,
    status: differences.length === 0 ? 'pass' : 'fail',
    durationMs: outcome.durationMs,
    result: outcome.result,
    error: outcome.error,
    differences,
  };
}

export async function runReplaySuite(
  suite: ReplaySuite,
  call: (testCase: ReplayCase) => Promise<ReplayCallOutcome>,
): Promise<ReplayCaseResult[]> {
  const results: ReplayCaseResult[] = [];

  for (const testCase of suite.cases) {
    try {
      const outcome = await call(testCase);
      results.push(evaluateReplayCase(testCase, outcome));
    } catch (error) {
      results.push(
        evaluateReplayCase(testCase, {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return results;
}
