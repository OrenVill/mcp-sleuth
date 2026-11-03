import * as clack from '@clack/prompts';
import type { GlobalCliFlags } from '../contracts';
import { resolveVaultContext, CliUsageError } from '../core/prelude';
import { connectScope } from '../core/multiConnect';
import { runTerminalChat } from '../chat/terminalChat';
import type { ServerEntry } from '../../types';
import { EXIT_OK, runCommandSafe } from '../core/runContext';

export async function runChat(_args: string[], flags: GlobalCliFlags): Promise<number> {
  return runCommandSafe(async () => {
    const ctx = await resolveVaultContext(flags);
    if (ctx.llmConfigs.length === 0) {
      throw new Error('No LLM providers in vault. Run: mcp-detective provider add');
    }
    if (ctx.servers.length === 0) {
      throw new Error('No MCP servers in vault.');
    }

    let config = ctx.llmConfigs[0];
    let scopeIds = ctx.servers.map((s) => s.id);

    if (flags.providerId) {
      const found = ctx.llmConfigs.find((c) => c.id === flags.providerId);
      if (!found) throw new CliUsageError(`Unknown provider id ${flags.providerId}`);
      config = found;
    } else if (process.stdin.isTTY) {
      const picked = await clack.select({
        message: 'Model provider',
        options: ctx.llmConfigs.map((c) => ({
          value: c.id,
          label: c.model ? `${c.label} (${c.model})` : c.label,
        })),
      });
      if (clack.isCancel(picked)) throw new CliUsageError('Cancelled.');
      config = ctx.llmConfigs.find((c) => c.id === picked)!;
    }

    if (flags.servers) {
      scopeIds = flags.servers.split(',').map((s) => s.trim());
    } else if (process.stdin.isTTY) {
      const picked = await clack.multiselect({
        message: 'MCP servers in scope',
        options: ctx.servers.map((s) => ({ value: s.id, label: s.name })),
        required: true,
      });
      if (clack.isCancel(picked)) throw new CliUsageError('Cancelled.');
      scopeIds = picked as string[];
    }

    const deps = await connectScope(scopeIds, ctx.servers);
    const entries: ServerEntry[] = ctx.servers
      .filter((s) => scopeIds.includes(s.id))
      .map((s) => ({ ...s, status: 'connected' as const }));

    await runTerminalChat({ config, deps, servers: entries });
    return EXIT_OK;
  });
}
