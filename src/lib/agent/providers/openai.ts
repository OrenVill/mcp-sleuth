import type {
  AgentMessage,
  LlmConfig,
  LlmRequest,
  LlmStreamEvent,
  RawToolCall,
} from '../types';
import type { LlmProvider, LlmStreamParser, ProviderHttpRequest } from './types';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

export function toOpenAiMessages(system: string, messages: AgentMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text });
      continue;
    }
    if (message.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: message.toolCallId ?? '',
        content: message.text,
      });
      continue;
    }
    const assistant: OpenAiMessage = { role: 'assistant', content: message.text || null };
    if (message.toolCalls && message.toolCalls.length > 0) {
      assistant.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        // The name the model emitted, not our resolved MCP tool name.
        function: { name: call.llmName, arguments: JSON.stringify(call.args) },
      }));
    }
    out.push(assistant);
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return { ...headers, ...(config.extraHeaders ?? {}) };
}

function createParser(): LlmStreamParser {
  let buffer = '';
  let text = '';
  let finished = false;
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
    if (raw === '[DONE]') {
      finished = true;
      return [finalEvent()];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    const delta = (parsed as { choices?: { delta?: Record<string, unknown> }[] })?.choices?.[0]
      ?.delta;
    if (!delta) return [];

    const events: LlmStreamEvent[] = [];
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      text += delta.content;
      events.push({ type: 'delta', text: delta.content });
    }

    const fragments = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const fragment of fragments as {
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }[]) {
      const index = typeof fragment.index === 'number' ? fragment.index : 0;
      const entry = calls.get(index) ?? { id: '', name: '', args: '' };
      if (fragment.id) entry.id = fragment.id;
      if (fragment.function?.name) entry.name += fragment.function.name;
      if (fragment.function?.arguments) entry.args += fragment.function.arguments;
      calls.set(index, entry);
    }
    return events;
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
        if (!line.startsWith('data:')) continue;
        events.push(...handlePayload(line.slice(5).trim()));
      }
      return events;
    },
    end(): LlmStreamEvent[] {
      // Some servers close the connection instead of sending [DONE].
      return finished ? [] : [finalEvent()];
    },
  };
}

export const openaiProvider: LlmProvider = {
  id: 'openai',

  buildRequest(req: LlmRequest): ProviderHttpRequest {
    const body: Record<string, unknown> = {
      model: req.config.model,
      messages: toOpenAiMessages(req.system, req.messages),
      stream: true,
    };
    if (req.tools.length > 0) {
      body.tools = req.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }
    return {
      url: `${req.config.baseUrl}/chat/completions`,
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
