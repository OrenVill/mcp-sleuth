import { readFile } from 'node:fs/promises';
import type { GlobalCliFlags } from '../contracts';
import { analyzeAgentReadiness } from '../../lib/agentReadiness';
import { scanPromptInjection } from '../../lib/promptInjectionScan';
import {
  runReplaySuite,
  type ReplayCase,
  type ReplaySuite,
} from '../../lib/replaySuites';
import { evaluateCheckGate } from '../checkGate';
import { emitJson, emitMessage } from '../core/output';
import { runCommandSafe, withConnectedTools } from '../core/runContext';
import { EXIT_USAGE } from '../exitCodes';

const DEFAULT_MIN_READINESS = 70;

function isReplaySuite(value: unknown): value is ReplaySuite {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return false;
  if (!Array.isArray(record.cases)) return false;
  return record.cases.every(isReplayCase);
}

function isReplayCase(value: unknown): value is ReplayCase {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.serverId === 'string' &&
    typeof record.toolName === 'string' &&
    record.expectedStatus === 'ok' &&
    record.args !== null &&
    typeof record.args === 'object' &&
    !Array.isArray(record.args)
  );
}

async function loadReplaySuite(path: string): Promise<ReplaySuite> {
  const raw = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isReplaySuite(parsed)) {
    throw new Error(`Invalid replay suite JSON: ${path}`);
  }
  return parsed;
}

function resolveMinReadiness(flags: GlobalCliFlags): number {
  if (flags.minReadiness === undefined) return DEFAULT_MIN_READINESS;
  if (!Number.isFinite(flags.minReadiness) || flags.minReadiness < 0 || flags.minReadiness > 100) {
    throw new Error('--min-readiness must be a number from 0 to 100');
  }
  return flags.minReadiness;
}

export async function runCheck(_args: string[], flags: GlobalCliFlags): Promise<number> {
  if (!flags.server) {
    process.stderr.write('Usage: mcp-detective check --server <name|id> [--min-readiness N] [--fail-on-injection] [--replay path.json] [--discover] [--json]\n');
    return EXIT_USAGE;
  }

  return runCommandSafe(async () => {
    const minReadiness = resolveMinReadiness(flags);
    const failOnInjection = flags.failOnInjection === true;
    const replayPath = flags.replay;

    let exitCode = 0;

    await withConnectedTools(flags, async ({ entry, connected }) => {
      const readiness = analyzeAgentReadiness([entry]);
      const injection = scanPromptInjection([entry]);

      let replayResults: Awaited<ReturnType<typeof runReplaySuite>> = [];
      let replayEnabled = false;

      if (replayPath) {
        replayEnabled = true;
        const suite = await loadReplaySuite(replayPath);
        const cases = suite.cases.filter((testCase) => testCase.serverId === entry.id);
        if (cases.length === 0) {
          throw new Error(
            `Replay suite "${suite.name}" has no cases for server id ${entry.id} (${entry.name})`,
          );
        }
        replayResults = await runReplaySuite({ ...suite, cases }, async (testCase) => {
          const started = Date.now();
          try {
            const result = await connected.callTool(testCase.toolName, testCase.args);
            return { status: 'ok' as const, result, durationMs: Date.now() - started };
          } catch (error) {
            return {
              status: 'error' as const,
              error: error instanceof Error ? error.message : String(error),
              durationMs: Date.now() - started,
            };
          }
        });
      }

      const gate = evaluateCheckGate({
        readiness,
        minReadiness,
        failOnInjection,
        injection,
        replayEnabled,
        replayResults,
      });

      exitCode = gate.exitCode;

      const payload = {
        ok: gate.ok,
        server: { id: entry.id, name: entry.name },
        readiness: {
          ...gate.readiness,
          report: readiness,
        },
        injection: {
          ...gate.injection,
          findings: failOnInjection || flags.json ? injection.findings : undefined,
        },
        replay: {
          ...gate.replay,
          results: replayEnabled ? replayResults : undefined,
        },
      };

      if (flags.json) {
        await emitJson(payload, flags);
      } else {
        const parts = [
          gate.ok ? 'check passed' : 'check failed',
          `readiness ${gate.readiness.score}/${gate.readiness.minReadiness} (${gate.readiness.passed ? 'ok' : 'fail'})`,
        ];
        if (failOnInjection) {
          parts.push(
            `injection ${gate.injection.findingCount} finding(s) (${gate.injection.passed ? 'ok' : 'fail'})`,
          );
        }
        if (replayEnabled) {
          parts.push(
            `replay ${gate.replay.caseCount - gate.replay.failedCaseIds.length}/${gate.replay.caseCount} passed`,
          );
        }
        await emitMessage(parts.join(' · '), flags);
      }
    });

    return exitCode;
  });
}
