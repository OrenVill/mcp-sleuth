import { runAddCompletions } from './addCompletions';
import type { CommandHandler } from '../contracts';
import { runAudit } from './audit';
import { runCall } from './call';
import { runChat } from './chat';
import { runExport } from './exportCmd';
import { runProvider } from './provider';
import { runReadiness } from './readiness';
import { runServer } from './server';
import { paint, sgr, terminalColorsEnabled } from '../chat/terminalTheme';

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
  const h = (text: string) => (terminalColorsEnabled() ? paint(sgr.brand, text) : text);
  const dim = (text: string) => (terminalColorsEnabled() ? paint(sgr.muted, text) : text);
  const cmd = (text: string) => (terminalColorsEnabled() ? paint(sgr.accent, text) : text);

  process.stdout.write(`${h('mcp-detective')} ${dim('— terminal CLI')}

${dim('Subcommands:')}
  ${cmd('readiness')}              Agent Readiness report
  ${cmd('audit')} permission|injection
  ${cmd('export')} handoff|tools|client-config
  ${cmd('call')} <tool> [--args JSON]
  ${cmd('provider')} list|add|remove
  ${cmd('server')} list|add|remove
  ${cmd('chat')}                   Agent Chat (alias: tui)
  ${cmd('add-completions')}        Install bash tab completion (~/.bashrc)
  ${cmd('help')}

${dim('Global flags:')} --server, --json, -o/--output, --passphrase-file, --discover
${dim('Env:')} MCP_DETECTIVE_VAULT_PASSPHRASE, MCP_DETECTIVE_DATA_DIR

${dim('Vault:')} interactive unlock is remembered for 30 minutes (cli-vault-session.json in the data dir).

${dim('Browser UI (default):')} run mcp-detective with no subcommand.
`);
}
