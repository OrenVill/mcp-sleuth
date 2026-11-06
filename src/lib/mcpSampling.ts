import { getHost } from './host';
import type { LlmConfig } from './agent/types';

/** Turn an MCP sampling/createMessage request into a single user message for the LLM proxy. */
export function samplingPromptFromParams(params: unknown): string {
  if (!params || typeof params !== 'object') return '';
  const messages = (params as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const first = messages[0] as { content?: unknown };
  const content = first.content;
  if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
    const block = content as { type?: string; text?: string };
    if (block.type === 'text' && typeof block.text === 'string') return block.text;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
        const text = (part as { text?: string }).text;
        if (typeof text === 'string') return text;
      }
    }
  }
  return JSON.stringify(params);
}

export async function runApprovedSampling(
  params: unknown,
  llm: LlmConfig,
): Promise<{ model: string; role: 'assistant'; content: { type: 'text'; text: string } }> {
  const prompt = samplingPromptFromParams(params);
  const host = getHost();
  const controller = new AbortController();
  let text = '';
  for await (const event of host.llm.chat(
    {
      config: llm,
      system: 'You are helping an MCP server via sampling/createMessage. Reply concisely.',
      messages: [{ role: 'user', text: prompt }],
      tools: [],
    },
    controller.signal,
  )) {
    if (event.type === 'delta') text += event.text;
    if (event.type === 'final') text = event.response.text || text;
  }
  return {
    model: llm.model,
    role: 'assistant',
    content: { type: 'text', text: text || '(empty model response)' },
  };
}
