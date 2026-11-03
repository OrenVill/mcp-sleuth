import { requireAllowedTarget } from '../../../llm-targets.js';
import type { AgentMessage, LlmConfig, LlmStreamEvent, LlmToolSchema } from '../../lib/agent/types';
import { getProvider } from '../../lib/agent/providers/index';

export async function* streamChat(
  config: LlmConfig,
  req: {
    system: string;
    messages: AgentMessage[];
    tools: LlmToolSchema[];
  },
  signal: AbortSignal,
): AsyncGenerator<LlmStreamEvent> {
  const provider = getProvider(config.provider);
  const built = provider.buildRequest({ config, ...req });
  requireAllowedTarget(config.provider, built.url);

  const headers = { ...built.headers };
  if (config.apiKey?.trim()) {
    if (config.provider === 'anthropic') {
      headers['x-api-key'] = config.apiKey.trim();
    } else if (config.provider !== 'gemini') {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }
  }

  const res = await fetch(built.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(built.body),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => '')).trim().slice(0, 300);
    throw new Error(detail ? `${res.status}: ${detail}` : `LLM request failed (${res.status})`);
  }

  const parser = provider.createStreamParser();
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        yield event;
      }
    }
  }
  for (const event of parser.end()) {
    yield event;
  }
}
