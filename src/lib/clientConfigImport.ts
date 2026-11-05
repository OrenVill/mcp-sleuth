import type { ServerAuth, ServerStdioConfig, ServerTransport } from '../types';
import type { StoredServer } from './storage';
import { makeId } from './serverRecord';
import { serverSlug } from './export';

export type ClientConfigFormat = 'cursor' | 'claude' | 'vscode' | 'unknown';

export interface ParsedClientConfigServer {
  configKey: string;
  name: string;
  transport: ServerTransport;
  url?: string;
  auth?: ServerAuth;
  stdio?: ServerStdioConfig;
  stdioEnv?: Record<string, string>;
  unresolvedEnv: string[];
}

export interface ParseClientConfigResult {
  format: ClientConfigFormat;
  servers: ParsedClientConfigServer[];
  errors: string[];
}

export interface MergeImportOptions {
  /** When an imported entry matches an existing server, replace it or skip. Default replace. */
  duplicate?: 'replace' | 'skip';
}

export interface MergeImportResult {
  servers: StoredServer[];
  added: number;
  updated: number;
  skipped: number;
}

const PLACEHOLDER_RE = /\$\{(?:env|input):([^}]+)\}/g;

function decodeBase64Utf8(b64: string): string {
  return globalThis.atob(b64);
}

export function resolvePlaceholderString(
  raw: string,
  env: Record<string, string | undefined>,
): { value: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const value = raw.replace(PLACEHOLDER_RE, (_match, varName: string) => {
    const resolved = env[varName];
    if (resolved === undefined || resolved === '') {
      unresolved.push(varName);
      return _match;
    }
    return resolved;
  });
  return { value, unresolved };
}

function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function detectFormat(root: Record<string, unknown>): ClientConfigFormat {
  if (root.mcpServers && typeof root.mcpServers === 'object') {
    const first = Object.values(root.mcpServers as Record<string, unknown>)[0];
    if (first && typeof first === 'object') {
      const entry = first as Record<string, unknown>;
      if (entry.type === 'http' || entry.type === 'stdio') return 'claude';
    }
    return 'cursor';
  }
  if (root.servers && typeof root.servers === 'object') return 'vscode';
  return 'unknown';
}

function getServerBlock(
  root: Record<string, unknown>,
): Record<string, Record<string, unknown>> | null {
  const block = root.mcpServers ?? root.servers;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  return block as Record<string, Record<string, unknown>>;
}

function parseAuthFromHeaders(
  headers: Record<string, string> | undefined,
  env: Record<string, string | undefined>,
  unresolvedAcc: string[],
): ServerAuth | undefined {
  if (!headers) return undefined;

  const resolved: Record<string, string> = {};
  for (const [key, raw] of Object.entries(headers)) {
    const { value, unresolved } = resolvePlaceholderString(String(raw), env);
    unresolvedAcc.push(...unresolved);
    resolved[key] = value;
  }

  const authHeader =
    resolved.Authorization ??
    resolved.authorization ??
    Object.entries(resolved).find(([k]) => k.toLowerCase() === 'authorization')?.[1];

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      if (token && !PLACEHOLDER_RE.test(token)) {
        return { method: 'bearer', bearerToken: token };
      }
    }
    if (authHeader.startsWith('Basic ')) {
      const b64 = authHeader.slice('Basic '.length);
      if (b64 && !PLACEHOLDER_RE.test(b64)) {
        try {
          const decoded = decodeBase64Utf8(b64);
          const colon = decoded.indexOf(':');
          if (colon >= 0) {
            return {
              method: 'basic',
              basicUsername: decoded.slice(0, colon),
              basicPassword: decoded.slice(colon + 1),
            };
          }
        } catch {
          /* leave auth unset */
        }
      }
    }
  }

  for (const [header, value] of Object.entries(resolved)) {
    if (header.toLowerCase() === 'authorization') continue;
    if (value && !PLACEHOLDER_RE.test(value)) {
      return { method: 'api_key', apiKeyHeader: header, apiKeyValue: value };
    }
  }

  return undefined;
}

function parseStdioEnv(
  envBlock: Record<string, unknown> | undefined,
  env: Record<string, string | undefined>,
  unresolvedAcc: string[],
): { stdioEnv?: Record<string, string>; envKeys: string[] } {
  if (!envBlock) return { envKeys: [] };
  const stdioEnv: Record<string, string> = {};
  const envKeys: string[] = [];
  for (const [key, raw] of Object.entries(envBlock)) {
    envKeys.push(key);
    const { value, unresolved } = resolvePlaceholderString(String(raw), env);
    unresolvedAcc.push(...unresolved);
    if (value && !PLACEHOLDER_RE.test(value)) {
      stdioEnv[key] = value;
    }
  }
  return {
    envKeys,
    stdioEnv: Object.keys(stdioEnv).length > 0 ? stdioEnv : undefined,
  };
}

function parseServerEntry(
  configKey: string,
  entry: Record<string, unknown>,
  env: Record<string, string | undefined>,
): ParsedClientConfigServer | null {
  const unresolvedEnv: string[] = [];
  const isStdio =
    typeof entry.command === 'string' || entry.type === 'stdio';

  if (isStdio && typeof entry.command === 'string') {
    const args = Array.isArray(entry.args)
      ? entry.args.map((a) => String(a))
      : [];
    const { stdioEnv, envKeys } = parseStdioEnv(
      entry.env as Record<string, unknown> | undefined,
      env,
      unresolvedEnv,
    );
    const stdio: ServerStdioConfig = {
      command: entry.command,
      args,
      ...(typeof entry.cwd === 'string' ? { cwd: entry.cwd } : {}),
      ...(envKeys.length > 0 ? { envKeys } : {}),
    };
    const name = slugToDisplayName(configKey);
    return {
      configKey,
      name,
      transport: 'stdio',
      stdio,
      stdioEnv,
      unresolvedEnv: [...new Set(unresolvedEnv)],
    };
  }

  const url = typeof entry.url === 'string' ? entry.url : undefined;
  if (!url) return null;

  const headers =
    entry.headers && typeof entry.headers === 'object' && !Array.isArray(entry.headers)
      ? (entry.headers as Record<string, string>)
      : undefined;
  const auth = parseAuthFromHeaders(headers, env, unresolvedEnv);

  const name = slugToDisplayName(configKey);
  return {
    configKey,
    name,
    transport: 'http',
    url,
    auth,
    unresolvedEnv: [...new Set(unresolvedEnv)],
  };
}

export function parseClientConfigJson(
  jsonText: string,
  options?: { env?: Record<string, string | undefined> },
): ParseClientConfigResult {
  const env = options?.env ?? {};
  const errors: string[] = [];

  let root: unknown;
  try {
    root = JSON.parse(jsonText);
  } catch {
    return { format: 'unknown', servers: [], errors: ['Invalid JSON'] };
  }

  if (!root || typeof root !== 'object') {
    return { format: 'unknown', servers: [], errors: ['Config must be a JSON object'] };
  }

  const obj = root as Record<string, unknown>;
  const format = detectFormat(obj);
  const block = getServerBlock(obj);
  if (!block) {
    return {
      format,
      servers: [],
      errors: ['No mcpServers or servers block found'],
    };
  }

  const servers: ParsedClientConfigServer[] = [];
  for (const [configKey, rawEntry] of Object.entries(block)) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      errors.push(`Skipped "${configKey}": not an object`);
      continue;
    }
    const parsed = parseServerEntry(configKey, rawEntry as Record<string, unknown>, env);
    if (!parsed) {
      errors.push(`Skipped "${configKey}": missing url or command`);
      continue;
    }
    servers.push(parsed);
  }

  if (servers.length === 0 && errors.length === 0) {
    errors.push('No importable servers found');
  }

  return { format, servers, errors };
}

function parsedToStored(
  parsed: ParsedClientConfigServer,
  existingIds: Set<string>,
): StoredServer {
  const slug = serverSlug(parsed.name);
  const preferredId = parsed.configKey === slug ? parsed.configKey : slug;
  const id = existingIds.has(preferredId) ? preferredId : makeId(parsed.name, existingIds);
  existingIds.add(id);

  return {
    id,
    name: parsed.name,
    url: parsed.url ?? '',
    transport: parsed.transport,
    auth: parsed.auth,
    stdio: parsed.stdio,
    stdioEnv: parsed.stdioEnv,
    proxyThroughLocal: parsed.transport === 'http' ? true : undefined,
    custom: true,
  };
}

function findExistingIndex(
  existing: StoredServer[],
  parsed: ParsedClientConfigServer,
  stored: StoredServer,
): number {
  const slug = serverSlug(parsed.name);
  return existing.findIndex(
    (s) =>
      s.id === stored.id ||
      s.id === parsed.configKey ||
      serverSlug(s.name) === slug ||
      serverSlug(s.name) === parsed.configKey ||
      (parsed.transport === 'http' &&
        s.transport !== 'stdio' &&
        parsed.url &&
        s.url === parsed.url),
  );
}

export function mergeImportedServers(
  existing: StoredServer[],
  imported: ParsedClientConfigServer[],
  options?: MergeImportOptions,
): MergeImportResult {
  const duplicate = options?.duplicate ?? 'replace';
  const next = [...existing];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const ids = new Set(next.map((s) => s.id));

  for (const parsed of imported) {
    const stored = parsedToStored(parsed, ids);
    const idx = findExistingIndex(next, parsed, stored);

    if (idx >= 0) {
      if (duplicate === 'skip') {
        skipped++;
        continue;
      }
      next[idx] = { ...stored, id: next[idx].id };
      updated++;
      continue;
    }

    next.push(stored);
    added++;
  }

  return { servers: next, added, updated, skipped };
}
