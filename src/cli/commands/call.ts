import type { GlobalCliFlags } from '../contracts';
import { emitJson } from '../core/output';
import { EXIT_OK, runCommandSafe, withConnectedTools } from '../core/runContext';
import { EXIT_USAGE } from '../exitCodes';

export async function runCall(args: string[], flags: GlobalCliFlags): Promise<number> {
  const toolName = args[0];
  if (!toolName) {
    process.stderr.write('Usage: mcp-detective call <tool> [--args JSON]\n');
    return EXIT_USAGE;
  }
  let toolArgs: Record<string, unknown> = {};
  const argsIdx = args.indexOf('--args');
  if (argsIdx >= 0 && args[argsIdx + 1]) {
    toolArgs = JSON.parse(args[argsIdx + 1]) as Record<string, unknown>;
  }

  return runCommandSafe(async () => {
    let exit = EXIT_OK;
    await withConnectedTools(flags, async ({ connected }) => {
      try {
        const result = await connected.callTool(toolName, toolArgs);
        await emitJson(result, flags);
      } catch {
        exit = 1;
        throw new Error(`Tool call failed: ${toolName}`);
      }
    });
    return exit;
  });
}
