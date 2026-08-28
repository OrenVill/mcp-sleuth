import { getProvider } from '../../agent/providers';
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../../agent/types';
import type { LlmHost } from '../types';

const LLM_PROXY_PATH = '/__llm_proxy';

/**
 * Provider calls go through the local proxy rather than straight from the page:
 * Anthropic requires an explicit browser opt-in header, and Ollama rejects
 * cross-origin requests unless the user set OLLAMA_ORIGINS. Same-origin makes
 * local models work without the user configuring anything.
 */
function proxyUrl(provider: string, target: string): string {
  const params = new URLSearchParams({ provider, target });
  return `${LLM_PROXY_PATH}?${params.toString()}`;
}

async function describeFailure(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  const detail = body.trim().slice(0, 300);
  return detail
    ? `${res.status} ${res.statusText}: ${detail}`
    : `${res.status} ${res.statusText}`;
}

export const llmBrowser: LlmHost = {
  async *chat(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const provider = getProvider(req.config.provider);
    const { url, headers, body } = provider.buildRequest(req);

    const res = await fetch(proxyUrl(provider.id, url), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(await describeFailure(res));
    }

    const parser = provider.createStreamParser();
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          for (const event of parser.push(value)) yield event;
        }
      }
    } finally {
      reader.releaseLock();
    }
    for (const event of parser.end()) yield event;
  },

  async listModels(config: LlmConfig): Promise<string[]> {
    const provider = getProvider(config.provider);
    const { url, headers } = provider.modelsRequest(config);
    const res = await fetch(proxyUrl(provider.id, url), { headers });
    if (!res.ok) throw new Error(await describeFailure(res));
    return provider.parseModels(await res.json());
  },
};
