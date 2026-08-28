import type {
  AgentMessage,
  LlmConfig,
  LlmRequest,
  LlmStreamEvent,
  RawToolCall,
} from '../types';
import type { LlmProvider, LlmStreamParser, ProviderHttpRequest } from './types';

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface GeminiFunctionResponse {
  name: string;
  response: { content: string };
}

type GeminiPart =
  | { text: string }
  | { functionCall: GeminiFunctionCall }
  | { functionResponse: GeminiFunctionResponse };

interface GeminiContent {
  /** Gemini calls the assistant "model"; there is no "assistant" role. */
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/**
 * Gemini keys a functionResponse by tool *name*, but our transcript only
 * records the call id on a tool message. Walking the messages in order lets a
 * tool result recover the name the model emitted from the assistant turn that
 * requested it.
 */
function toolNamesByCallId(messages: AgentMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) continue;
    for (const call of message.toolCalls) names.set(call.id, call.llmName);
  }
  return names;
}

export function toGeminiContents(messages: AgentMessage[]): GeminiContent[] {
  const names = toolNamesByCallId(messages);
  const out: GeminiContent[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', parts: [{ text: message.text }] });
      continue;
    }

    if (message.role === 'tool') {
      const callId = message.toolCallId ?? '';
      // No matching call means a truncated or hand-edited transcript. Fall back
      // to the id, which is at least traceable, rather than dropping the result
      // and leaving the model's function call unanswered.
      const name = names.get(callId) ?? (callId || 'unknown_tool');
      out.push({
        // A functionResponse rides on a *user* content, not a model one.
        role: 'user',
        parts: [{ functionResponse: { name, response: { content: message.text } } }],
      });
      continue;
    }

    const parts: GeminiPart[] = [];
    if (message.text) parts.push({ text: message.text });
    for (const call of message.toolCalls ?? []) {
      // The name the model emitted, not our resolved MCP tool name.
      parts.push({ functionCall: { name: call.llmName, args: call.args } });
    }
    out.push({ role: 'model', parts });
  }

  return out;
}

function asArgs(value: unknown): Record<string, unknown> {
  // A non-object args payload is the model's bug, not ours. Empty args reach
  // the server, which rejects them, and the model sees why.
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function authHeaders(config: LlmConfig): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.apiKey) headers['x-goog-api-key'] = config.apiKey;
  return { ...headers, ...(config.extraHeaders ?? {}) };
}

function createParser(): LlmStreamParser {
  let buffer = '';
  let text = '';
  let finished = false;
  const calls: RawToolCall[] = [];

  function handlePayload(raw: string): LlmStreamEvent[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    const parts = (
      parsed as { candidates?: { content?: { parts?: unknown } }[] }
    )?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return [];

    const events: LlmStreamEvent[] = [];
    for (const part of parts as { text?: unknown; functionCall?: unknown }[]) {
      if (typeof part?.text === 'string' && part.text.length > 0) {
        text += part.text;
        events.push({ type: 'delta', text: part.text });
      }
      const call = part?.functionCall as { name?: unknown; args?: unknown } | undefined;
      if (call && typeof call.name === 'string') {
        // Gemini assigns no call id, so synthesise one that is stable within
        // the turn; the agent loop correlates results by it.
        calls.push({ id: `gemini-${calls.length}`, name: call.name, args: asArgs(call.args) });
      }
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
      // Gemini has no [DONE] terminator: closing the body is the end of the
      // turn, so the final event is always flushed here — but only once.
      if (finished) return [];
      finished = true;
      return [{ type: 'final', response: { text, toolCalls: calls } }];
    },
  };
}

export const geminiProvider: LlmProvider = {
  id: 'gemini',

  buildRequest(req: LlmRequest): ProviderHttpRequest {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: toGeminiContents(req.messages),
    };
    if (req.tools.length > 0) {
      // One tools entry holding every declaration, not one entry per tool.
      body.tools = [
        {
          functionDeclarations: req.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
        },
      ];
    }
    return {
      url: `${req.config.baseUrl}/models/${req.config.model}:streamGenerateContent?alt=sse`,
      headers: authHeaders(req.config),
      body,
    };
  },

  createStreamParser: createParser,

  modelsRequest(config: LlmConfig) {
    return { url: `${config.baseUrl}/models`, headers: authHeaders(config) };
  },

  parseModels(payload: unknown): string[] {
    const models = (payload as { models?: unknown })?.models;
    if (!Array.isArray(models)) return [];
    return models
      .map((entry) => (entry as { name?: unknown })?.name)
      .filter((name): name is string => typeof name === 'string')
      // Gemini reports "models/gemini-2.0-flash"; buildRequest interpolates the
      // bare name back into the path, so strip the prefix here.
      .map((name) => (name.startsWith('models/') ? name.slice('models/'.length) : name));
  },
};
