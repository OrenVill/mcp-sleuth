import type { ServerAuth } from '../types';
import { serverSlug } from './export';

export interface ClientConfigInput {
  name: string;
  url: string;
  auth?: ServerAuth;
  proxyThroughLocal?: boolean;
}

// ---------------------------------------------------------------------------
// Redaction helpers
// ---------------------------------------------------------------------------

function envVar(slug: string, suffix: string): string {
  const key = `${slug.toUpperCase().replace(/-/g, '_')}_${suffix}`;
  return `\${env:${key}}`;
}

/**
 * Build the Authorization header value for a bearer token, using an env
 * placeholder instead of the real secret.
 */
function bearerPlaceholder(slug: string): string {
  return `Bearer ${envVar(slug, 'TOKEN')}`;
}

/**
 * Build the Authorization header value for basic auth, using env placeholders.
 */
function basicPlaceholder(slug: string): string {
  return `Basic ${envVar(slug, 'CREDENTIALS')}`;
}

/**
 * Build headers object with redacted credentials. Returns undefined when auth
 * method is 'none' or unset.
 */
function buildHeaders(
  slug: string,
  auth: ServerAuth | undefined,
): Record<string, string> | undefined {
  if (!auth || auth.method === 'none') return undefined;

  if (auth.method === 'bearer') {
    return { Authorization: bearerPlaceholder(slug) };
  }

  if (auth.method === 'api_key') {
    const header = auth.apiKeyHeader ?? 'X-API-Key';
    return { [header]: envVar(slug, 'API_KEY') };
  }

  if (auth.method === 'basic') {
    return { Authorization: basicPlaceholder(slug) };
  }

  return undefined;
}

/**
 * VS Code uses ${input:VAR} syntax instead of ${env:VAR}.
 */
function buildHeadersVSCode(
  slug: string,
  auth: ServerAuth | undefined,
): Record<string, string> | undefined {
  if (!auth || auth.method === 'none') return undefined;

  const inputVar = (suffix: string) =>
    `\${input:${slug.toUpperCase().replace(/-/g, '_')}_${suffix}}`;

  if (auth.method === 'bearer') {
    return { Authorization: `Bearer ${inputVar('TOKEN')}` };
  }

  if (auth.method === 'api_key') {
    const header = auth.apiKeyHeader ?? 'X-API-Key';
    return { [header]: inputVar('API_KEY') };
  }

  if (auth.method === 'basic') {
    return { Authorization: `Basic ${inputVar('CREDENTIALS')}` };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Cursor  (~/.cursor/mcp.json)
// ---------------------------------------------------------------------------

/**
 * Generate a Cursor `mcp.json` snippet for the given server.
 * Auth secrets are replaced with env-variable placeholders.
 * The proxyThroughLocal flag does not change the exported URL — we always
 * export the real server URL so the snippet works outside this local session.
 */
export function generateCursorConfig(input: ClientConfigInput): string {
  const slug = serverSlug(input.name);
  const headers = buildHeaders(slug, input.auth);

  const entry: Record<string, unknown> = {
    url: input.url,
    ...(headers ? { headers } : {}),
  };

  return JSON.stringify({ mcpServers: { [slug]: entry } }, null, 2);
}

// ---------------------------------------------------------------------------
// Claude Desktop / Claude Code  (~/.claude/claude_desktop_config.json)
// ---------------------------------------------------------------------------

/**
 * Generate a Claude Desktop / Claude Code `mcpServers` config snippet.
 */
export function generateClaudeDesktopConfig(input: ClientConfigInput): string {
  const slug = serverSlug(input.name);
  const headers = buildHeaders(slug, input.auth);

  const entry: Record<string, unknown> = {
    type: 'http',
    url: input.url,
    ...(headers ? { headers } : {}),
  };

  return JSON.stringify({ mcpServers: { [slug]: entry } }, null, 2);
}

// ---------------------------------------------------------------------------
// VS Code  (.vscode/mcp.json)
// ---------------------------------------------------------------------------

/**
 * Generate a VS Code `mcp.json` snippet.
 * VS Code uses `servers` (not `mcpServers`) and `${input:VAR}` variable syntax.
 */
export function generateVSCodeConfig(input: ClientConfigInput): string {
  const slug = serverSlug(input.name);
  const headers = buildHeadersVSCode(slug, input.auth);

  const entry: Record<string, unknown> = {
    type: 'http',
    url: input.url,
    ...(headers ? { headers } : {}),
  };

  return JSON.stringify({ servers: { [slug]: entry } }, null, 2);
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export interface AllClientConfigs {
  cursor: string;
  claude: string;
  vscode: string;
}

/** Generate snippets for all supported MCP client applications. */
export function generateAllConfigs(input: ClientConfigInput): AllClientConfigs {
  return {
    cursor: generateCursorConfig(input),
    claude: generateClaudeDesktopConfig(input),
    vscode: generateVSCodeConfig(input),
  };
}
