import type { ServerTransport } from '../types';

export const STDIO_BRIDGE_PREFIX = '/__mcp_stdio';

export function parseArgsLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function hasDuplicateEnvKeys(rows: { key: string; value: string }[]): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function envRowsToMap(rows: { key: string; value: string }[]): {
  env: Record<string, string>;
  envKeys: string[];
} {
  const env: Record<string, string> = {};
  const envKeys: string[] = [];
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    envKeys.push(key);
    env[key] = row.value;
  }
  return { env, envKeys };
}

export function stdioBridgeMcpUrl(
  serverId: string,
  baseOrigin: string = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:4173',
): string {
  return `${baseOrigin}${STDIO_BRIDGE_PREFIX}/${encodeURIComponent(serverId)}/mcp`;
}

export function defaultTransport(entry: { transport?: ServerTransport }): ServerTransport {
  return entry.transport ?? 'http';
}
