import type { GlobalCliFlags } from '../contracts';
import { analyzeAgentReadiness } from '../../lib/agentReadiness';
import { serverReadinessMarkdown } from '../../lib/agentReadinessMarkdown';
import { emitJson, emitOutput } from '../core/output';
import { EXIT_OK, runCommandSafe, withConnectedTools } from '../core/runContext';

export async function runReadiness(_args: string[], flags: GlobalCliFlags): Promise<number> {
  return runCommandSafe(async () => {
    await withConnectedTools(flags, async ({ entry }) => {
      const report = analyzeAgentReadiness([entry]);
      if (flags.json) {
        await emitJson(report, flags);
      } else {
        const md = serverReadinessMarkdown(entry.name, report.tools, report.quickWins);
        await emitOutput(md, flags);
      }
    });
    return EXIT_OK;
  });
}
