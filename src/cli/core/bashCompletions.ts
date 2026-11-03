import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { completionScriptPath } from './packageRoot';

export const BASHRC_MARKER_START = '# >>> mcp-detective completions (managed) >>>';
export const BASHRC_MARKER_END = '# <<< mcp-detective completions (managed) <<<';

export function bashrcPath(): string {
  return join(homedir(), '.bashrc');
}

export function buildBashrcManagedBlock(options: {
  completionScript: string;
  nodeCliEntry: string;
}): string {
  const { completionScript, nodeCliEntry } = options;
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return `${BASHRC_MARKER_START}
MCP_DETECTIVE_CLI=${q(nodeCliEntry)}
MCP_DETECTIVE_COMPLETIONS=${q(completionScript)}
if [[ -f "$MCP_DETECTIVE_COMPLETIONS" ]]; then
  # shellcheck source=/dev/null
  source "$MCP_DETECTIVE_COMPLETIONS"
fi
mcp-detective() {
  if [[ "\${1:-}" == "add-completions" ]]; then
    node "\$MCP_DETECTIVE_CLI" add-completions --write-only || return \$?
    # shellcheck source=/dev/null
    source "\${HOME}/.bashrc"
    echo "mcp-detective: tab completion loaded."
    return 0
  fi
  node "\$MCP_DETECTIVE_CLI" "\$@"
}
mcp-sleuth() { mcp-detective "\$@"; }
${BASHRC_MARKER_END}`;
}

export function installBashCompletions(options: {
  completionScript: string;
  nodeCliEntry: string;
}): { bashrc: string; created: boolean } {
  const bashrc = bashrcPath();
  const block = buildBashrcManagedBlock(options);
  let content = existsSync(bashrc) ? readFileSync(bashrc, 'utf8') : '';
  let created = false;

  if (content.includes(BASHRC_MARKER_START)) {
    const start = content.indexOf(BASHRC_MARKER_START);
    const end = content.indexOf(BASHRC_MARKER_END);
    if (end === -1) throw new Error('Corrupt ~/.bashrc: missing mcp-detective end marker.');
    content = content.slice(0, start) + block + content.slice(end + BASHRC_MARKER_END.length);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    content += `\n${block}\n`;
    created = true;
  }

  writeFileSync(bashrc, content, 'utf8');
  return { bashrc, created };
}

export function completionScriptExists(): boolean {
  return existsSync(completionScriptPath());
}
