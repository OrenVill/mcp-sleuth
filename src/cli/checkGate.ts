import type { AgentReadinessReport } from '../lib/agentReadiness';
import type { PromptInjectionReport } from '../lib/promptInjectionScan';
import type { ReplayCaseResult } from '../lib/replaySuites';
import {
  EXIT_CHECK_INJECTION,
  EXIT_CHECK_READINESS,
  EXIT_CHECK_REPLAY,
  EXIT_OK,
} from './exitCodes';

export interface CheckGateReadinessSlice {
  passed: boolean;
  score: number;
  minReadiness: number;
  verdict: AgentReadinessReport['verdict'];
}

export interface CheckGateInjectionSlice {
  enabled: boolean;
  passed: boolean;
  findingCount: number;
  scannedToolCount: number;
}

export interface CheckGateReplaySlice {
  enabled: boolean;
  passed: boolean;
  caseCount: number;
  failedCaseIds: string[];
}

export interface CheckGateResult {
  ok: boolean;
  exitCode: number;
  readiness: CheckGateReadinessSlice;
  injection: CheckGateInjectionSlice;
  replay: CheckGateReplaySlice;
}

export function resolveCheckExitCode(input: {
  readinessPassed: boolean;
  failOnInjection: boolean;
  injectionPassed: boolean;
  replayEnabled: boolean;
  replayPassed: boolean;
}): number {
  if (!input.readinessPassed) return EXIT_CHECK_READINESS;
  if (input.failOnInjection && !input.injectionPassed) return EXIT_CHECK_INJECTION;
  if (input.replayEnabled && !input.replayPassed) return EXIT_CHECK_REPLAY;
  return EXIT_OK;
}

export function evaluateCheckGate(input: {
  readiness: AgentReadinessReport;
  minReadiness: number;
  failOnInjection: boolean;
  injection: PromptInjectionReport;
  replayEnabled: boolean;
  replayResults: ReplayCaseResult[];
}): CheckGateResult {
  const readinessPassed = input.readiness.score >= input.minReadiness;
  const injectionPassed = input.injection.findings.length === 0;
  const replayPassed =
    !input.replayEnabled ||
    (input.replayResults.length > 0 &&
      input.replayResults.every((result) => result.status === 'pass'));

  const exitCode = resolveCheckExitCode({
    readinessPassed,
    failOnInjection: input.failOnInjection,
    injectionPassed,
    replayEnabled: input.replayEnabled,
    replayPassed,
  });

  return {
    ok: exitCode === EXIT_OK,
    exitCode,
    readiness: {
      passed: readinessPassed,
      score: input.readiness.score,
      minReadiness: input.minReadiness,
      verdict: input.readiness.verdict,
    },
    injection: {
      enabled: input.failOnInjection,
      passed: injectionPassed,
      findingCount: input.injection.findings.length,
      scannedToolCount: input.injection.scannedToolCount,
    },
    replay: {
      enabled: input.replayEnabled,
      passed: replayPassed,
      caseCount: input.replayResults.length,
      failedCaseIds: input.replayResults
        .filter((result) => result.status !== 'pass')
        .map((result) => result.caseId),
    },
  };
}
