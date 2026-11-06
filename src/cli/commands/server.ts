import { readFile } from 'node:fs/promises';
import * as clack from '@clack/prompts';
import type { GlobalCliFlags } from '../contracts';
import type { StoredServer } from '../../lib/storage';
import {
  mergeImportedServers,
  parseClientConfigJson,
} from '../../lib/clientConfigImport';
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

    if (sub === 'import') {
      let duplicate: 'replace' | 'skip' = 'replace';
      const pathArgs: string[] = [];
      for (const a of args.slice(1)) {
        if (a === '--skip') duplicate = 'skip';
        else pathArgs.push(a);
      }
      const filePath = pathArgs[0];
      let jsonText: string;
      if (filePath) {
        jsonText = await readFile(filePath, 'utf8');
      } else if (!process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        jsonText = Buffer.concat(chunks).toString('utf8').trim();
      } else {
        throw new CliUsageError(
          'Usage: mcp-detective server import [--skip] <mcp.json> (or pipe JSON on stdin)',
        );
      }
      if (!jsonText) {
        throw new CliUsageError('Import input is empty.');
      }
      const parsed = parseClientConfigJson(jsonText, {
        env: process.env as Record<string, string | undefined>,
      });
      if (parsed.servers.length === 0) {
        throw new Error(parsed.errors.join(' ') || 'No servers to import.');
      }
      const merged = mergeImportedServers(ctx.servers, parsed.servers, { duplicate });
      ctx.servers = merged.servers;
      await writeVaultToDisk(ctx);
      const summary = `Imported ${parsed.servers.length} (${merged.added} added, ${merged.updated} updated, ${merged.skipped} skipped)`;
      if (flags.json) {
        await emitJson(
          {
            format: parsed.format,
            added: merged.added,
            updated: merged.updated,
            skipped: merged.skipped,
            errors: parsed.errors,
            servers: ctx.servers,
          },
          flags,
        );
      } else {
        await emitMessage(summary, flags);
        if (parsed.errors.length > 0) {
          await emitMessage(parsed.errors.join('; '), flags);
        }
      }
      return EXIT_OK;
    }

    process.stderr.write('Usage: mcp-detective server list|add|remove|import\n');
    return EXIT_USAGE;
  });
}
