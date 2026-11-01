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
  // The provider names which allowlist main checks this URL against.
  provider: 'openai',
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
    const result = await service.listModels({ provider: 'openai', url: 'http://x/v1/models', headers: {} });
    expect(result).toEqual({ data: [{ id: 'a' }] });
  });
});

describe('provider target enforcement', () => {
  function service(fetchImpl) {
    return createLlmService({ fetchImpl });
  }

  const sender = { send: () => {} };

  it('fetches a legitimate provider endpoint', async () => {
    const seen = [];
    const svc = service(async (url) => {
      seen.push(url);
      return { ok: true, body: null, status: 200, statusText: 'OK', text: async () => '' };
    });
    await svc.start(sender, {
      requestId: 'r1',
      provider: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {},
      body: {},
    });
    expect(seen).toEqual(['https://api.openai.com/v1/chat/completions']);
  });

  it('never fetches a URL outside the provider paths', async () => {
    // The browser build has always constrained this. The desktop build took
    // whatever URL the renderer sent, which made it a full SSRF from main.
    const seen = [];
    const errors = [];
    const svc = service(async (url) => {
      seen.push(url);
      return { ok: true, body: null, status: 200, statusText: 'OK', text: async () => '' };
    });
    await svc.start(
      { send: (_channel, payload) => errors.push(payload) },
      {
        requestId: 'r2',
        provider: 'openai',
        url: 'http://169.254.169.254/latest/meta-data/',
        headers: {},
        body: {},
      },
    );
    expect(seen).toEqual([]);
    expect(errors.at(-1).message).toMatch(/not one the openai provider exposes/i);
  });

  it('refuses an unknown provider', async () => {
    const seen = [];
    const errors = [];
    const svc = service(async (url) => {
      seen.push(url);
      return { ok: true, body: null, status: 200, statusText: 'OK', text: async () => '' };
    });
    await svc.start(
      { send: (_channel, payload) => errors.push(payload) },
      { requestId: 'r3', provider: 'evil', url: 'http://internal/v1/models', headers: {}, body: {} },
    );
    expect(seen).toEqual([]);
    expect(errors.at(-1).message).toMatch(/not a recognised model provider/i);
  });

  it('applies the same rule to the model listing', async () => {
    const svc = service(async () => ({ ok: true, json: async () => ({}) }));
    await expect(
      svc.listModels({ provider: 'openai', url: 'http://127.0.0.1:9/admin', headers: {} }),
    ).rejects.toThrow(/not one the openai provider exposes/i);
  });

  it('refuses a non-http scheme', async () => {
    const svc = service(async () => ({ ok: true, json: async () => ({}) }));
    await expect(
      svc.listModels({ provider: 'openai', url: 'file:///etc/models', headers: {} }),
    ).rejects.toThrow(/http and https/i);
  });
});
