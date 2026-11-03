import { runAddCompletions } from './addCompletions';
import type { CommandHandler } from '../contracts';
import { runAudit } from './audit';
import { runCall } from './call';
import { runChat } from './chat';
import { runExport } from './exportCmd';
import { runProvider } from './provider';
import { runReadiness } from './readiness';
import { runServer } from './server';

export const commandRegistry: Record<string, CommandHandler> = {
  chat: runChat,
  readiness: runReadiness,
  audit: runAudit,
  export: runExport,
  call: runCall,
  provider: runProvider,
  server: runServer,
  'add-completions': runAddCompletions,
};

export function printHelp(): void {
  process.stdout.write(`mcp-detective — terminal CLI

Subcommands:
  readiness              Agent Readiness report
  audit permission|injection
  export handoff|tools|client-config
  call <tool> [--args JSON]
  provider list|add|remove
  server list|add|remove
  chat                   Agent Chat (alias: tui)
  add-completions        Install bash tab completion (~/.bashrc)
  help

Global flags: --server, --json, -o/--output, --passphrase-file, --discover
Env: MCP_DETECTIVE_VAULT_PASSPHRASE, MCP_DETECTIVE_DATA_DIR

Vault: interactive unlock is remembered for 30 minutes (cli-vault-session.json in the data dir).

Browser UI (default): run mcp-detective with no subcommand.
`);
}
