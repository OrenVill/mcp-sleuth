import * as clack from '@clack/prompts';
import type { GlobalCliFlags } from '../contracts';
import type { StoredServer } from '../../lib/storage';
import { emitJson, emitMessage, emitTabList } from '../core/output';
import { resolveVaultContext, CliUsageError } from '../core/prelude';
import { writeVaultToDisk } from '../core/vaultSession';
import { EXIT_OK, runCommandSafe } from '../core/runContext';
import { EXIT_USAGE } from '../exitCodes';

export async function runServer(args: string[], flags: GlobalCliFlags): Promise<number> {
  const sub = args[0] ?? 'list';
  return runCommandSafe(async () => {
    const ctx = await resolveVaultContext(flags);

    if (sub === 'list') {
      if (flags.json) {
        await emitJson(ctx.servers, flags);
      } else {
        await emitTabList(
          ['id', 'name', 'transport'],
          ctx.servers.map((s) => [s.id, s.name, s.transport ?? 'http']),
          flags,
        );
      }
      return EXIT_OK;
    }

    if (sub === 'remove') {
      const id = args[1] ?? flags.server;
      if (!id) throw new CliUsageError('Usage: mcp-detective server remove <name|id>');
      ctx.servers = ctx.servers.filter((s) => s.id !== id && s.name !== id);
      await writeVaultToDisk(ctx);
      return EXIT_OK;
    }

    if (sub === 'add') {
      if (!process.stdin.isTTY) {
        throw new CliUsageError('server add requires an interactive terminal.');
      }
      const name = await clack.text({ message: 'Server name' });
      if (clack.isCancel(name)) throw new CliUsageError('Cancelled.');
      const transport = await clack.select({
        message: 'Transport',
        options: [
          { value: 'http', label: 'HTTP' },
          { value: 'stdio', label: 'Stdio' },
        ],
      });
      if (clack.isCancel(transport)) throw new CliUsageError('Cancelled.');

      const entry: StoredServer = {
        id: `srv-${Date.now()}`,
        name: String(name),
        url: '',
        transport: transport as StoredServer['transport'],
      };

      if (transport === 'http') {
        const url = await clack.text({ message: 'MCP URL' });
        if (clack.isCancel(url)) throw new CliUsageError('Cancelled.');
        entry.url = String(url);
      } else {
        const command = await clack.text({ message: 'Command' });
        if (clack.isCancel(command)) throw new CliUsageError('Cancelled.');
        const argsLine = await clack.text({ message: 'Args (space-separated)' });
        if (clack.isCancel(argsLine)) throw new CliUsageError('Cancelled.');
        entry.stdio = {
          command: String(command),
          args: String(argsLine || '')
            .split(/\s+/)
            .filter(Boolean),
        };
      }

      ctx.servers.push(entry);
      await writeVaultToDisk(ctx);
      await emitMessage(`Added server ${entry.name} (${entry.id})`, flags);
      return EXIT_OK;
    }

    process.stderr.write('Usage: mcp-detective server list|add|remove\n');
    return EXIT_USAGE;
  });
}
