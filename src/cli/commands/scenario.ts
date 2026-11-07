import { readFile } from 'node:fs/promises';
import type { GlobalCliFlags } from '../contracts';
import {
  parseScenarioFileJson,
  resolveServerIdForStep,
} from '../../lib/scenarioFile';
import { cleanToolArgs, runScenario } from '../../lib/scenarioRunner';
import { connectScope } from '../core/multiConnect';
import { emitJson, emitMessage } from '../core/output';
import { runCommandSafe } from '../core/runContext';
import { resolveServerByName } from '../core/vaultSession';
import { resolveVaultContext } from '../core/prelude';
import { EXIT_OK, EXIT_USAGE } from '../exitCodes';

export async function runScenarioCommand(args: string[], flags: GlobalCliFlags): Promise<number> {
  const sub = args[0];
  if (sub !== 'run') {
    process.stderr.write('Usage: mcp-detective scenario run <file.json> [--json] [--discover] [--server name|id]\n');
    return EXIT_USAGE;
  }
  const path = args[1];
  if (!path) {
    process.stderr.write('Usage: mcp-detective scenario run <file.json> [--json] [--discover] [--server name|id]\n');
    return EXIT_USAGE;
  }

  return runCommandSafe(async () => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseScenarioFileJson(raw);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }

    const { scenario, serverNames } = parsed.file;
    const ctx = await resolveVaultContext(flags);

    const singleServer = flags.server
      ? resolveServerByName(ctx.servers, flags.server)
      : undefined;

    const resolvedIds = new Set<string>();
    for (const step of scenario.steps) {
      resolvedIds.add(
        resolveServerIdForStep(step, ctx.servers, serverNames, singleServer),
      );
    }

    const deps = await connectScope([...resolvedIds], ctx.servers);
    try {
      const normalizedSteps = scenario.steps.map((step) => ({
        ...step,
        serverId: resolveServerIdForStep(step, ctx.servers, serverNames, singleServer),
      }));

      const run = await runScenario(
        { ...scenario, steps: normalizedSteps },
        async (step) => {
          try {
            const result = await deps.callTool(step.serverId, step.toolName, cleanToolArgs(step.args));
            return { status: 'success' as const, result };
          } catch (err) {
            return {
              status: 'error' as const,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      );

      if (flags.json) {
        await emitJson(run, flags);
      } else {
        await emitMessage(
          `${run.scenarioName}: ${run.status} (${run.passCount}/${run.passCount + run.failCount} steps)`,
          flags,
        );
      }

      return run.status === 'pass' ? EXIT_OK : 1;
    } finally {
      await deps.disconnectAll();
    }
  });
}
