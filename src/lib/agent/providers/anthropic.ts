import type {
  AgentMessage,
  LlmConfig,
  LlmRequest,
  LlmStreamEvent,
  RawToolCall,
} from '../types';
import type { LlmProvider, LlmStreamParser, ProviderHttpRequest } from './types';

/**
 * Anthropic requires max_tokens on every request — there is no server-side
 * default. 4096 is enough for a tool-calling turn without inviting a runaway
 * response; the agent loop takes several turns anyway.
 */
const MAX_TOKENS = 4096;

/** The wire version this adapter's request and stream shapes were written for. */
const API_VERSION = '2023-06-01';

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | (TextBlock | ToolUseBlock | ToolResultBlock)[];
}

/** The block list of a trailing tool-result user turn, or null if there is none. */
function openToolResultTurn(message: AnthropicMessage | undefined): ToolResultBlock[] | null {
  if (message?.role !== 'user' || !Array.isArray(message.content)) return null;
  const blocks = message.content;
  return blocks[0]?.type === 'tool_result' ? (blocks as ToolResultBlock[]) : null;
}

/**
 * Anthropic has no `system` message and no `tool` role: the system prompt is a
 * top-level request field, and tool results come back as user content blocks.
 */
export function toAnthropicMessages(messages: AgentMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text });
      continue;
    }

    if (message.role === 'tool') {
      const block: ToolResultBlock = {
        type: 'tool_result',
        tool_use_id: message.toolCallId ?? '',
        content: message.text,
      };
      // Results for calls the model made in one turn belong in one user turn.
      // Splitting them teaches the model to stop requesting parallel calls.
      const open = openToolResultTurn(out.at(-1));
      if (open) open.push(block);
      else out.push({ role: 'user', content: [block] });
      continue;
    }

    if (!message.toolCalls || message.toolCalls.length === 0) {
      out.push({ role: 'assistant', content: message.text });
      continue;
    }

    const content: (TextBlock | ToolUseBlock)[] = [];
    if (message.text) content.push({ type: 'text', text: message.text });
    for (const call of message.toolCalls) {
      // The name the model emitted, not our resolved MCP tool name.
      content.push({ type: 'tool_use', id: call.id, name: call.llmName, input: call.args });
    }
    out.push({ role: 'assistant', content });
  }
  return out;
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    // A truncated or malformed argument stream is the model's bug, not ours.
    // Empty args reach the server, which rejects them, and the model sees why.
    return {};
  }
}

function authHeaders(config: LlmConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': API_VERSION,
  };
  // Anthropic authenticates with x-api-key, not an Authorization bearer token.
  if (config.apiKey) headers['x-api-key'] = config.apiKey;
  return { ...headers, ...(config.extraHeaders ?? {}) };
}

function createParser(): LlmStreamParser {
  let buffer = '';
  let text = '';
  let finished = false;
  // Keyed by the content block index the server assigns; text and tool_use
  // blocks share that numbering within a single message.
  const calls = new Map<number, { id: string; name: string; args: string }>();

  function finalEvent(): LlmStreamEvent {
    const toolCalls: RawToolCall[] = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        args: parseArgs(call.args),
      }));
    return { type: 'final', response: { text, toolCalls } };
  }

  function handlePayload(raw: string): LlmStreamEvent[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    const event = parsed as {
      type?: string;
      index?: number;
      content_block?: { type?: string; id?: string; name?: string };
      delta?: { type?: string; text?: string; partial_json?: string };
    };
    const index = typeof event.index === 'number' ? event.index : 0;

    if (event.type === 'message_stop') {
      finished = true;
      return [finalEvent()];
    }

    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      calls.set(index, {
        id: event.content_block.id ?? '',
        name: event.content_block.name ?? '',
        args: '',
      });
      return [];
    }

    if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
        text += delta.text;
        return [{ type: 'delta', text: delta.text }];
      }
      if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        const entry = calls.get(index) ?? { id: '', name: '', args: '' };
        entry.args += delta.partial_json;
        calls.set(index, entry);
      }
    }

    // ping, error, message_start, message_delta, content_block_stop: nothing to do.
    return [];
  }

  return {
    push(chunk: string): LlmStreamEvent[] {
      buffer += chunk;
      const events: LlmStreamEvent[] = [];
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline === -1) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        // `event:` lines duplicate the `type` field inside the payload.
        if (!line.startsWith('data:')) continue;
        events.push(...handlePayload(line.slice(5).trim()));
      }
      return events;
    },
    end(): LlmStreamEvent[] {
      // Some servers close the connection instead of sending message_stop.
      return finished ? [] : [finalEvent()];
    },
  };
}

export const anthropicProvider: LlmProvider = {
  id: 'anthropic',

  buildRequest(req: LlmRequest): ProviderHttpRequest {
    const body: Record<string, unknown> = {
      model: req.config.model,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
    };
    if (req.tools.length > 0) {
      body.tools = req.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        // Anthropic calls this input_schema; OpenAI calls the same thing parameters.
        input_schema: tool.parameters,
      }));
    }
    return {
      url: `${req.config.baseUrl}/messages`,
      headers: authHeaders(req.config),
      body,
    };
  },

  createStreamParser: createParser,

  modelsRequest(config: LlmConfig) {
    return { url: `${config.baseUrl}/models`, headers: authHeaders(config) };
  },

  parseModels(payload: unknown): string[] {
    const data = (payload as { data?: unknown })?.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((entry) => (entry as { id?: unknown })?.id)
      .filter((id): id is string => typeof id === 'string');
  },
};
