import { STDIO_BRIDGE_PREFIX } from './stdioParse';
import type { ServerStdioConfig } from '../types';

export async function startStdioSession(
  serverId: string,
  stdio: ServerStdioConfig,
  env: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${STDIO_BRIDGE_PREFIX}/${encodeURIComponent(serverId)}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command: stdio.command,
      args: stdio.args,
      cwd: stdio.cwd,
      env,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404) {
      throw new Error(
        'Stdio requires the local explorer server. Run npm run dev or mcp-explorer instead of opening dist/index.html directly.',
      );
    }
    throw new Error(body || `Stdio bridge start failed (${res.status})`);
  }
}

export async function stopStdioSession(serverId: string): Promise<void> {
  await fetch(`${STDIO_BRIDGE_PREFIX}/${encodeURIComponent(serverId)}`, {
    method: 'DELETE',
  }).catch(() => {
    /* best-effort */
  });
}
