import { parseArgv } from './argv';
import { EXIT_OK, EXIT_USAGE } from './exitCodes';
import { commandRegistry, printHelp } from './commands/registry';
import { initCliTheme } from './core/cliTheme';

export async function runCli(argv: string[]): Promise<number> {
  initCliTheme();
  const { command, rest, flags } = parseArgv(argv);

  if (!command || command === 'help') {
    printHelp();
    return EXIT_OK;
  }

  const handler = commandRegistry[command];
  if (!handler) {
    process.stderr.write(`mcp-detective: unknown command "${command}"\n`);
    printHelp();
    return EXIT_USAGE;
  }

  return handler(rest, flags);
}
