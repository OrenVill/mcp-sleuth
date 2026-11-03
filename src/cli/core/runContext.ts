import type { ServerEntry, ToolDef } from '../../types';
import type { StoredServer } from '../../lib/storage';
import type { GlobalCliFlags } from '../contracts';
import { EXIT_ERROR, EXIT_OK } from '../exitCodes';
import { maybeDiscoverTools } from './discovery';
import { connectServer } from './mcpConnect';
import { CliUsageError, resolveVaultAndServer, usageExitCode } from './prelude';

export async function withConnectedTools<T>(
  flags: GlobalCliFlags,
  fn: (ctx: {
    server: StoredServer;
    tools: ToolDef[];
    entry: ServerEntry;
    connected: Awaited<ReturnType<typeof connectServer>>;
  }) => Promise<T>,
): Promise<T> {
  const { server } = await resolveVaultAndServer(flags);
  const connected = await connectServer(server);
  try {
    let tools = connected.tools;
    tools = await maybeDiscoverTools(server, connected, tools, flags.discover === true);
    const entry: ServerEntry = { ...server, status: 'connected', tools };
    return await fn({ server, tools, entry, connected });
  } finally {
    await connected.disconnect();
  }
}

export async function runCommandSafe(run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof CliUsageError) {
      process.stderr.write(`mcp-detective: ${err.message}\n`);
      return usageExitCode(err);
    }
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`mcp-detective: ${message}\n`);
    return EXIT_ERROR;
  }
}

export { EXIT_OK, EXIT_ERROR };
