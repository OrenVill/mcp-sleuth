import type { GlobalCliFlags } from '../contracts';
import { generateClaudeDesktopConfig, generateCursorConfig } from '../../lib/clientConfigExport';
import { generateHandoffReadme } from '../../lib/handoffReadme';
import { loadCallHistoryForServer } from '../core/appDataNode';
import { emitJson, emitMarkdown, emitOutput } from '../core/output';
import { EXIT_OK, runCommandSafe, withConnectedTools } from '../core/runContext';
import { EXIT_USAGE } from '../exitCodes';

export async function runExport(args: string[], flags: GlobalCliFlags): Promise<number> {
  const sub = args[0];
  if (!sub) {
    process.stderr.write('Usage: mcp-detective export handoff|tools|client-config\n');
    return EXIT_USAGE;
  }
  return runCommandSafe(async () => {
    if (sub === 'client-config') {
      const { server } = await (await import('../core/prelude')).resolveVaultAndServer(flags);
      const kind = args[1] ?? 'cursor';
      const input = {
        name: server.name,
        transport: server.transport,
        url: server.url,
        auth: server.auth,
        proxyThroughLocal: server.proxyThroughLocal,
        stdio: server.stdio,
        stdioEnv: server.stdioEnv,
      };
      const text =
        kind === 'claude'
          ? generateClaudeDesktopConfig(input)
          : generateCursorConfig(input);
      await emitOutput(text, flags);
      return EXIT_OK;
    }

    await withConnectedTools(flags, async ({ entry, server, tools }) => {
      if (sub === 'tools') {
        await emitJson(tools, flags);
        return;
      }
      if (sub === 'handoff') {
        const history = await loadCallHistoryForServer(server.id);
        const md = generateHandoffReadme({
          server: entry,
          history,
          options: { includeReadiness: true, includeSchemas: false },
        });
        await emitMarkdown(md, flags);
        return;
      }
      throw new Error(`Unknown export target "${sub}"`);
    });
    return EXIT_OK;
  });
}
