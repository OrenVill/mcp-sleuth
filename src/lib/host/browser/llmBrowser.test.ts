import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../../agent/types';
import { llmBrowser } from './llmBrowser';

const config: LlmConfig = {
  id: 'l1',
  label: 'Local',
  provider: 'openai',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'qwen3',
};

const request: LlmRequest = { config, system: 'sys', messages: [], tools: [] };

/** A Response whose body streams the given text in the given pieces. */
function streamingResponse(pieces: string[], init: { ok?: boolean; status?: number } = {}) {
  const encoder = new TextEncoder();
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    }),
    text: async () => pieces.join(''),
    json: async () => JSON.parse(pieces.join('')),
  } as unknown as Response;
}

async function drain(iterable: AsyncIterable<LlmStreamEvent>) {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('llmBrowser.chat', () => {
  it('posts through the same-origin proxy with the provider and target', async () => {
    const fetchMock = vi.fn(async () => streamingResponse(['data: [DONE]\n']));
    vi.stubGlobal('fetch', fetchMock);

    await drain(llmBrowser.chat(request, new AbortController().signal));

    // The mock is declared zero-arg, so its recorded calls are typed as an empty
    // tuple. Widen them to what fetch was actually invoked with.
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const url = String(calls[0][0]);
    expect(url).toContain('/__llm_proxy?provider=openai');
    expect(url).toContain(
      `target=${encodeURIComponent('http://127.0.0.1:11434/v1/chat/completions')}`,
    );
    expect(calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('parses the provider stream into events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamingResponse([
          'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
          'data: [DONE]\n',
        ]),
      ),
    );
    const events = await drain(llmBrowser.chat(request, new AbortController().signal));
    expect(events).toEqual([
      { type: 'delta', text: 'hi' },
      { type: 'final', response: { text: 'hi', toolCalls: [] } },
    ]);
  });

  it('reassembles an event split across two network chunks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamingResponse(['data: {"choices":[{"delta":{"con', 'tent":"hi"}}]}\ndata: [DONE]\n']),
      ),
    );
    const events = await drain(llmBrowser.chat(request, new AbortController().signal));
    expect(events[0]).toEqual({ type: 'delta', text: 'hi' });
  });

  it('throws with the upstream status and body on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: null,
        text: async () => 'invalid api key',
      })),
    );
    await expect(drain(llmBrowser.chat(request, new AbortController().signal))).rejects.toThrow(
      /401 Unauthorized: invalid api key/,
    );
  });
});

describe('llmBrowser.listModels', () => {
  it('reads model ids through the proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamingResponse(['{"data":[{"id":"a"},{"id":"b"}]}'])),
    );
    expect(await llmBrowser.listModels(config)).toEqual(['a', 'b']);
  });
});
