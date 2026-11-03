import { DENIAL_TEXT } from './loop';
import type { AgentMessage, AgentToolCall, LlmConfig } from './types';

export const CHAT_EXPORT_FORMAT = 'mcp-detective.agent-chat' as const;
export const CHAT_EXPORT_VERSION = 2;

const DENIAL_PREFIX = 'The user denied';

/** HTTP header names redacted in full when used as argument keys. */
const SENSITIVE_HEADER_KEYS =
  /^(authorization|proxy-authorization|x-api-key|cookie|set-cookie)$/i;

/** Underscore/hyphen segments that mark a key as credential-bearing. */
const SENSITIVE_KEY_SEGMENTS = new Set([
  'token',
  'secret',
  'password',
  'apikey',
  'authorization',
  'cookie',
  'bearer',
]);

const TEXT_SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
  /\bghp_[A-Za-z0-9]+\b/g,
  /\bBasic\s+[A-Za-z0-9+/=]+\b/gi,
];

export interface ChatExportServer {
  id: string;
  name: string;
}

export interface ChatExportModel {
  label: string;
  provider: LlmConfig['provider'];
  model: string;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
}

export interface ChatExportToolResult {
  /** Plain-text tool output (never double-encoded JSON). */
  text?: string;
  /** Parsed JSON when the raw tool text was valid JSON. */
  content?: unknown;
  /** Present only when the tool returned an error or denial. */
  isError?: true;
}

export interface ChatExportToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Omitted when identical to `toolName`. */
  llmName?: string;
  /** Omitted when the export lists only one resolved server. */
  serverId?: string;
  /** Set when the model named a tool that could not be mapped to a server. */
  unresolved?: true;
  result?: ChatExportToolResult;
}

export interface ChatExportMessageUser {
  role: 'user';
  text: string;
}

export interface ChatExportMessageAssistant {
  role: 'assistant';
  text?: string;
  toolCalls?: ChatExportToolCall[];
}

/** Orphan tool results that could not be paired with an assistant call. */
export interface ChatExportMessageOrphanTool {
  role: 'tool';
  toolCallId: string;
  result: ChatExportToolResult;
}

export type ChatExportMessage =
  | ChatExportMessageUser
  | ChatExportMessageAssistant
  | ChatExportMessageOrphanTool;

export interface ChatExport {
  format: typeof CHAT_EXPORT_FORMAT;
  version: typeof CHAT_EXPORT_VERSION;
  exportedAt: string;
  app: { name: 'mcp-detective'; version: string };
  model: ChatExportModel | null;
  servers: ChatExportServer[];
  messages: ChatExportMessage[];
}

export interface ChatExportInput {
  messages: AgentMessage[];
  config: LlmConfig | null;
  servers: ChatExportServer[];
  exportedAt: Date;
  appVersion: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO-8601 with a numeric offset, for the export header. */
export function formatExportedAt(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = pad2(Math.floor(abs / 60));
  const om = pad2(abs % 60);
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}` +
    `${sign}${oh}:${om}`
  );
}

/** Local timestamp for default download filenames (`YYYY-MM-DD-HHmm`). */
export function chatExportFilename(format: 'md' | 'json', date: Date): string {
  const stamp = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
  return `mcp-detective-chat-${stamp}.${format === 'md' ? 'md' : 'json'}`;
}

function normalizeArgKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

function isSensitiveArgKey(key: string): boolean {
  if (SENSITIVE_HEADER_KEYS.test(key)) return true;
  const norm = normalizeArgKey(key);
  if (/^api[_-]?key$/.test(norm)) return true;
  if (
    /^(access|refresh|auth)[_-]token$/.test(norm) ||
    /^(client[_-])?secret$/.test(norm) ||
    norm === 'password' ||
    norm === 'bearer'
  ) {
    return true;
  }
  const segments = norm.split('_').filter(Boolean);
  return segments.some((seg) => SENSITIVE_KEY_SEGMENTS.has(seg));
}

function redactUnknown(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? scrubTextSecrets(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveArgKey(key) ? '[REDACTED]' : redactUnknown(val);
  }
  return out;
}

export function scrubTextSecrets(text: string): string {
  let out = text;
  for (const pattern of TEXT_SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function redactToolCallArgs(call: AgentToolCall): Record<string, unknown> {
  return redactUnknown(call.args) as Record<string, unknown>;
}

/** Strip credentials and query strings from a model base URL. */
export function sanitizeModelBaseUrl(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    let out = u.toString();
    if (out.endsWith('/') && baseUrl.replace(/\/$/, '') !== baseUrl) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return baseUrl;
  }
}

function tryParseJsonToolText(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function exportToolResult(result: AgentMessage): ChatExportToolResult {
  const parsed = tryParseJsonToolText(result.text);
  const out: ChatExportToolResult =
    parsed !== undefined
      ? { content: redactUnknown(parsed) }
      : { text: scrubTextSecrets(result.text) };
  if (result.isError === true) out.isError = true;
  return out;
}

function exportToolCall(
  call: AgentToolCall,
  result: AgentMessage | undefined,
  singleServer: boolean,
): ChatExportToolCall {
  const out: ChatExportToolCall = {
    id: call.id,
    toolName: call.toolName,
    args: redactToolCallArgs(call),
  };
  if (call.llmName !== call.toolName) out.llmName = call.llmName;
  if (!call.serverId) {
    out.unresolved = true;
  } else if (!singleServer) {
    out.serverId = call.serverId;
  }
  if (result) out.result = exportToolResult(result);
  return out;
}

function collectPairedCallIds(messages: AgentMessage[]): Set<string> {
  const paired = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) continue;
    for (const call of message.toolCalls) {
      paired.add(call.id);
    }
  }
  return paired;
}

function buildExportMessages(
  messages: AgentMessage[],
  servers: ChatExportServer[],
): ChatExportMessage[] {
  const resultsByCallId = new Map<string, AgentMessage>();
  for (const message of messages) {
    if (message.role === 'tool' && message.toolCallId) {
      resultsByCallId.set(message.toolCallId, message);
    }
  }
  const assistantCallIds = collectPairedCallIds(messages);
  const singleServer = servers.length === 1;
  const out: ChatExportMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', text: scrubTextSecrets(message.text) });
      continue;
    }
    if (message.role === 'tool') {
      const id = message.toolCallId;
      if (id && assistantCallIds.has(id)) continue;
      if (id) {
        out.push({
          role: 'tool',
          toolCallId: id,
          result: exportToolResult(message),
        });
      }
      continue;
    }
    const entry: ChatExportMessageAssistant = { role: 'assistant' };
    const text = scrubTextSecrets(message.text);
    if (text) entry.text = text;
    if (message.toolCalls && message.toolCalls.length > 0) {
      entry.toolCalls = message.toolCalls.map((call) =>
        exportToolCall(call, resultsByCallId.get(call.id), singleServer),
      );
    }
    out.push(entry);
  }
  return out;
}

function redactModel(config: LlmConfig | null): ChatExportModel | null {
  if (!config) return null;
  const extraHeaders = config.extraHeaders
    ? Object.fromEntries(
        Object.keys(config.extraHeaders).map((name) => [name, '[REDACTED]']),
      )
    : undefined;
  return {
    label: config.label,
    provider: config.provider,
    model: config.model,
    baseUrl: sanitizeModelBaseUrl(config.baseUrl),
    ...(extraHeaders && Object.keys(extraHeaders).length > 0 ? { extraHeaders } : {}),
  };
}

export function buildChatExport(input: ChatExportInput): ChatExport {
  return {
    format: CHAT_EXPORT_FORMAT,
    version: CHAT_EXPORT_VERSION,
    exportedAt: formatExportedAt(input.exportedAt),
    app: { name: 'mcp-detective', version: input.appVersion },
    model: redactModel(input.config),
    servers: [...input.servers],
    messages: buildExportMessages(input.messages, input.servers),
  };
}

export function chatToJson(exp: ChatExport): string {
  return JSON.stringify(exp, null, 2);
}

function fenceFor(content: string, lang: string): string {
  let ticks = 3;
  while (content.includes('`'.repeat(ticks))) ticks += 1;
  const fence = '`'.repeat(ticks);
  return `${fence}${lang}\n${content}\n${fence}`;
}

function serverNameFor(call: ChatExportToolCall, servers: ChatExportServer[]): string {
  if (call.unresolved) return '(unresolved)';
  if (!call.serverId) {
    if (servers.length === 1) return servers[0]!.name;
    return '(unresolved)';
  }
  return servers.find((s) => s.id === call.serverId)?.name ?? call.serverId;
}

function toolResultStatus(result: ChatExportToolResult | undefined): 'ok' | 'error' | 'denied' | 'pending' {
  if (!result) return 'pending';
  if (result.isError !== true) return 'ok';
  const text = result.text ?? '';
  if (text.startsWith(DENIAL_PREFIX) || Object.values(DENIAL_TEXT).includes(text)) {
    return 'denied';
  }
  return 'error';
}

function formatToolResultBody(result: ChatExportToolResult): string {
  if (result.content !== undefined) {
    return JSON.stringify(result.content, null, 2);
  }
  return result.text ?? '';
}

function renderToolBlock(
  call: ChatExportToolCall,
  servers: ChatExportServer[],
): string {
  const name = serverNameFor(call, servers);
  const status = toolResultStatus(call.result);
  const lines = [
    `### Tool call: \`${name}\` › \`${call.toolName}\``,
    '**Arguments**',
    fenceFor(JSON.stringify(call.args, null, 2), 'json'),
  ];
  if (call.result) {
    lines.push(`**Result** (${status})`);
    lines.push(fenceFor(formatToolResultBody(call.result), call.result.content !== undefined ? 'json' : 'text'));
  } else if (status === 'pending') {
    lines.push('**Result** (pending)');
  }
  return lines.join('\n\n');
}

export function chatToMarkdown(exp: ChatExport): string {
  const headerLines = [
    '# MCP Detective chat',
    '',
    `- **Exported:** ${exp.exportedAt}`,
  ];
  if (exp.model) {
    headerLines.push(
      `- **Model:** ${exp.model.label} (${exp.model.provider} / ${exp.model.model})`,
    );
  } else {
    headerLines.push('- **Model:** _(none)_');
  }
  if (exp.servers.length > 0) {
    headerLines.push(`- **Servers:** ${exp.servers.map((s) => s.name).join(', ')}`);
  } else {
    headerLines.push('- **Servers:** _(none)_');
  }

  const body: string[] = [];
  for (const message of exp.messages) {
    if (message.role === 'user') {
      body.push('## User', '', message.text, '');
      continue;
    }
    if (message.role === 'tool') {
      const status = toolResultStatus(message.result);
      body.push(
        '## Tool result (unpaired)',
        '',
        `**Result** (${status})`,
        fenceFor(formatToolResultBody(message.result), message.result.content !== undefined ? 'json' : 'text'),
        '',
      );
      continue;
    }
    body.push('## Assistant', '');
    if (message.text) body.push(message.text, '');
    for (const call of message.toolCalls ?? []) {
      body.push(renderToolBlock(call, exp.servers), '');
    }
  }

  return [...headerLines, '', '---', '', ...body].join('\n').trimEnd() + '\n';
}
