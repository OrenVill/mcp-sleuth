import { resolve } from 'node:path';
import * as clack from '@clack/prompts';
import { cliPackageRoot } from '../core/packageRoot';
import {
  completionScriptExists,
  installBashCompletions,
} from '../core/bashCompletions';
import { EXIT_OK, EXIT_ERROR } from '../exitCodes';

export async function runAddCompletions(args: string[]): Promise<number> {
  const writeOnly = args.includes('--write-only');

  if (process.platform === 'win32') {
    process.stderr.write('mcp-detective: bash completion requires macOS or Linux.\n');
    return EXIT_ERROR;
  }

  if (!completionScriptExists()) {
    process.stderr.write(
      'mcp-detective: completion script missing. Run npm run build or reinstall the package.\n',
    );
    return EXIT_ERROR;
  }

  const nodeCliEntry = resolve(cliPackageRoot(), 'bin', 'mcp-detective.js');
  const { bashrc, created } = installBashCompletions({
    completionScript: resolve(cliPackageRoot(), 'completions', 'mcp-detective.bash'),
    nodeCliEntry,
  });

  if (writeOnly) {
    process.stdout.write(`source '${bashrc.replace(/'/g, `'\\''`)}'\n`);
    return EXIT_OK;
  }

  if (process.stdout.isTTY) {
    clack.intro('Install bash tab completion');
    if (created) {
      clack.log.success(`Added completion block to ${bashrc}`);
    } else {
      clack.log.info(`Updated completion block in ${bashrc}`);
    }
    clack.note(
      [
        'Run once in this terminal:',
        '',
        `  source ${bashrc}`,
        '',
        'After that, `mcp-detective add-completions` reloads completion in the current shell.',
        'New terminals load it automatically from ~/.bashrc.',
      ].join('\n'),
      'Activate',
    );
    clack.outro('Done');
  } else {
    process.stderr.write(`Updated ${bashrc}\n`);
    process.stderr.write(`Run: source ${bashrc}\n`);
  }

  return EXIT_OK;
}
