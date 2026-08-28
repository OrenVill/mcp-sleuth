import { describe, expect, it, vi } from 'vitest';
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../../agent/types';
import { createLlmElectron } from './llmElectron';

const config: LlmConfig = {
  id: 'l1',
  label: 'Local',
  provider: 'openai',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'qwen3',
};
const request: LlmRequest = { config, system: 'sys', messages: [], tools: [] };

/** A bridge stand-in that lets the test drive the push channels by hand. */
function fakeBridge() {
  const handlers: Record<string, ((p: unknown) => void)[]> = {
    chunk: [],
    done: [],
    error: [],
  };
  const emit = (kind: keyof typeof handlers, payload: unknown) =>
    handlers[kind].forEach((h) => h(payload));
  return {
    emit,
    started: [] as unknown[],
    aborted: [] as unknown[],
    llmChatStart: vi.fn(async function (this: void, payload: unknown) {
      bridge.started.push(payload);
      return { ok: true, value: true };
    }),
    llmChatAbort: vi.fn(async (requestId: unknown) => {
      bridge.aborted.push(requestId);
      return { ok: true, value: true };
    }),
    llmListModels: vi.fn(async () => ({ ok: true, value: { data: [{ id: 'a' }] } })),
    onLlmChunk: (h: (p: unknown) => void) => {
      handlers.chunk.push(h);
      return () => {};
    },
    onLlmDone: (h: (p: unknown) => void) => {
      handlers.done.push(h);
      return () => {};
    },
    onLlmError: (h: (p: unknown) => void) => {
      handlers.error.push(h);
      return () => {};
    },
  };
}
let bridge = fakeBridge();

async function collect(iterable: AsyncIterable<LlmStreamEvent>) {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe('createLlmElectron', () => {
  it('parses chunks pushed from main into events', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    const iterable = host.chat(request, new AbortController().signal);
    const pending = collect(iterable);

    // Let the generator subscribe before main starts pushing.
    await Promise.resolve();
    const requestId = (bridge.started[0] as { requestId: string }).requestId;
    bridge.emit('chunk', { requestId, chunk: 'data: {"choices":[{"delta":{"content":"hi"}}]}\n' });
    bridge.emit('chunk', { requestId, chunk: 'data: [DONE]\n' });
    bridge.emit('done', { requestId });

    expect(await pending).toEqual([
      { type: 'delta', text: 'hi' },
      { type: 'final', response: { text: 'hi', toolCalls: [] } },
    ]);
  });

  it('ignores chunks belonging to another request', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    const pending = collect(host.chat(request, new AbortController().signal));
    await Promise.resolve();
    const requestId = (bridge.started[0] as { requestId: string }).requestId;
    bridge.emit('chunk', { requestId: 'someone-else', chunk: 'data: [DONE]\n' });
    bridge.emit('chunk', { requestId, chunk: 'data: [DONE]\n' });
    bridge.emit('done', { requestId });
    expect(await pending).toEqual([{ type: 'final', response: { text: '', toolCalls: [] } }]);
  });

  it('rejects when main reports an error', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    const pending = collect(host.chat(request, new AbortController().signal));
    await Promise.resolve();
    const requestId = (bridge.started[0] as { requestId: string }).requestId;
    bridge.emit('error', { requestId, message: '401 Unauthorized' });
    await expect(pending).rejects.toThrow('401 Unauthorized');
  });

  it('tells main to abort when the signal fires', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    const controller = new AbortController();
    const pending = collect(host.chat(request, controller.signal));
    await Promise.resolve();
    const requestId = (bridge.started[0] as { requestId: string }).requestId;
    controller.abort();
    bridge.emit('error', { requestId, message: 'aborted' });
    await expect(pending).rejects.toThrow();
    expect(bridge.aborted).toEqual([requestId]);
  });

  it('lists models through the bridge', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    expect(await host.listModels(config)).toEqual(['a']);
  });
});
