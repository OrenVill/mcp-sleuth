import { describe, expect, it, vi } from 'vitest';
import { createLlmService } from './llmHandlers.js';

function fakeSender() {
  return { sent: [], send(channel, payload) { this.sent.push({ channel, payload }); } };
}

function streamingFetch(pieces, init = {}) {
  const encoder = new TextEncoder();
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    text: async () => pieces.join(''),
    json: async () => JSON.parse(pieces.join('')),
    body: new ReadableStream({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    }),
  }));
}

const payload = {
  requestId: 'r1',
  url: 'http://127.0.0.1:11434/v1/chat/completions',
  headers: { 'Content-Type': 'application/json' },
  body: { model: 'qwen3' },
};

describe('createLlmService', () => {
  it('streams chunks then done to the sender', async () => {
    const sender = fakeSender();
    const service = createLlmService({ fetchImpl: streamingFetch(['abc', 'def']) });
    await service.start(sender, payload);
    expect(sender.sent).toEqual([
      { channel: 'chunk', payload: { requestId: 'r1', chunk: 'abc' } },
      { channel: 'chunk', payload: { requestId: 'r1', chunk: 'def' } },
      { channel: 'done', payload: { requestId: 'r1' } },
    ]);
  });

  it('sends an error with the upstream status when the request fails', async () => {
    const sender = fakeSender();
    const service = createLlmService({
      fetchImpl: streamingFetch(['bad key'], { ok: false, status: 401, statusText: 'Unauthorized' }),
    });
    await service.start(sender, payload);
    expect(sender.sent).toEqual([
      { channel: 'error', payload: { requestId: 'r1', message: '401 Unauthorized: bad key' } },
    ]);
  });

  it('sends an error when fetch throws', async () => {
    const sender = fakeSender();
    const service = createLlmService({
      fetchImpl: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
    });
    await service.start(sender, payload);
    expect(sender.sent[0]).toEqual({
      channel: 'error',
      payload: { requestId: 'r1', message: 'ECONNREFUSED' },
    });
  });

  it('aborts an in-flight request', async () => {
    const service = createLlmService({ fetchImpl: streamingFetch(['x']) });
    const sender = fakeSender();
    const running = service.start(sender, payload);
    service.abort('r1');
    await running;
    // Aborting an unknown id is a no-op rather than a throw.
    expect(() => service.abort('does-not-exist')).not.toThrow();
  });

  it('lists models', async () => {
    const service = createLlmService({
      fetchImpl: streamingFetch(['{"data":[{"id":"a"}]}']),
    });
    const result = await service.listModels({ url: 'http://x/v1/models', headers: {} });
    expect(result).toEqual({ data: [{ id: 'a' }] });
  });
});
