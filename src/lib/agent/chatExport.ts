import { DENIAL_TEXT } from './loop';
import type { AgentMessage, AgentToolCall, LlmConfig } from './types';

export const CHAT_EXPORT_FORMAT = 'mcp-detective.agent-chat' as const;
export const CHAT_EXPORT_VERSION = 1;

const DENIAL_PREFIX = 'The user denied';

const SENSITIVE_ARG_KEYS =
  /^(authorization|proxy-authorization|x-api-key|cookie|set-cookie)$/i;
const SENSITIVE_ARG_PATTERN = /key|token|secret|auth|cookie/i;

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

export interface ChatExport {
  format: typeof CHAT_EXPORT_FORMAT;
  version: typeof CHAT_EXPORT_VERSION;
  exportedAt: string;
  app: { name: 'mcp-detective'; version: string };
  model: ChatExportModel | null;
  servers: ChatExportServer[];
  messages: AgentMessage[];
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

function isSensitiveArgKey(key: string): boolean {
  return SENSITIVE_ARG_KEYS.test(key) || SENSITIVE_ARG_PATTERN.test(key);
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

function redactToolCall(call: AgentToolCall): AgentToolCall {
  return {
    ...call,
    args: redactUnknown(call.args) as Record<string, unknown>,
  };
}

function redactMessage(message: AgentMessage): AgentMessage {
  const text = scrubTextSecrets(message.text);
  if (message.role === 'assistant' && message.toolCalls) {
    return {
      ...message,
      text,
      toolCalls: message.toolCalls.map(redactToolCall),
    };
  }
  return { ...message, text };
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
    baseUrl: config.baseUrl,
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
    messages: input.messages.map(redactMessage),
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

function serverNameFor(call: AgentToolCall, servers: ChatExportServer[]): string {
  if (!call.serverId) return '(unresolved)';
  return servers.find((s) => s.id === call.serverId)?.name ?? call.serverId;
}

function toolResultStatus(result: AgentMessage | undefined): 'ok' | 'error' | 'denied' | 'pending' {
  if (!result) return 'pending';
  if (result.isError !== true) return 'ok';
  if (result.text.startsWith(DENIAL_PREFIX) || Object.values(DENIAL_TEXT).includes(result.text)) {
    return 'denied';
  }
  return 'error';
}

function renderToolBlock(
  call: AgentToolCall,
  result: AgentMessage | undefined,
  servers: ChatExportServer[],
): string {
  const name = serverNameFor(call, servers);
  const status = toolResultStatus(result);
  const lines = [
    `### Tool call: \`${name}\` › \`${call.toolName}\``,
    '**Arguments**',
    fenceFor(JSON.stringify(call.args, null, 2), 'json'),
  ];
  if (result) {
    lines.push(`**Result** (${status})`);
    lines.push(fenceFor(result.text, 'text'));
  } else if (status === 'pending') {
    lines.push('**Result** (pending)');
  }
  return lines.join('\n\n');
}

export function chatToMarkdown(exp: ChatExport): string {
  const resultsByCallId = new Map<string, AgentMessage>();
  for (const message of exp.messages) {
    if (message.role === 'tool' && message.toolCallId) {
      resultsByCallId.set(message.toolCallId, message);
    }
  }
  const paired = new Set(
    exp.messages
      .flatMap((message) => message.toolCalls ?? [])
      .map((call) => call.id)
      .filter((id) => resultsByCallId.has(id)),
  );

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
      if (message.toolCallId && paired.has(message.toolCallId)) continue;
      const status = toolResultStatus(message);
      body.push('## Tool result (unpaired)', '', `**Result** (${status})`, fenceFor(message.text, 'text'), '');
      continue;
    }
    body.push('## Assistant', '');
    if (message.text) body.push(message.text, '');
    for (const call of message.toolCalls ?? []) {
      body.push(renderToolBlock(call, resultsByCallId.get(call.id), exp.servers), '');
    }
  }

  return [...headerLines, '', '---', '', ...body].join('\n').trimEnd() + '\n';
}
