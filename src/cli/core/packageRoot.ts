import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Repository / npm package root (CLI bundle lives at dist/cli/main.js). */
export function cliPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function completionScriptPath(): string {
  return resolve(cliPackageRoot(), 'completions', 'mcp-detective.bash');
}
