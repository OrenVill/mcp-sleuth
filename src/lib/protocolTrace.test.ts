import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  clearProtocolTraces,
  getProtocolTraces,
  subscribeProtocolTraces,
  traceOptionalProtocolCall,
  traceProtocolCall,
} from './protocolTrace';

describe('protocolTrace', () => {
  beforeEach(() => {
    clearProtocolTraces();
    vi.useRealTimers();
  });

  test('records successful protocol calls with duration and cloned payloads', async () => {
    vi.setSystemTime(1_000);
    const params = { name: 'echo', arguments: { text: 'hello' } };

    const promise = traceProtocolCall(
      { serverId: 'fixture', method: 'tools/call', params },
      async () => {
        vi.setSystemTime(1_025);
        return { content: [{ type: 'text', text: 'hello' }] };
      },
    );
    params.arguments.text = 'mutated';

    await expect(promise).resolves.toEqual({ content: [{ type: 'text', text: 'hello' }] });
    expect(getProtocolTraces()).toMatchObject([
      {
        serverId: 'fixture',
        method: 'tools/call',
        status: 'ok',
        durationMs: 25,
        params: { name: 'echo', arguments: { text: 'hello' } },
        result: { content: [{ type: 'text', text: 'hello' }] },
      },
    ]);
  });

  test('records failed protocol calls without swallowing the original error', async () => {
    vi.setSystemTime(2_000);
    const err = new Error('connection refused');

    await expect(
      traceProtocolCall(
        { serverId: 'fixture', method: 'initialize' },
        async () => {
          vi.setSystemTime(2_010);
          throw err;
        },
      ),
    ).rejects.toBe(err);

    expect(getProtocolTraces()).toMatchObject([
      {
        serverId: 'fixture',
        method: 'initialize',
        status: 'error',
        durationMs: 10,
        error: 'connection refused',
      },
    ]);
  });

  test('records method-not-found optional calls as unsupported and returns fallback', async () => {
    const result = await traceOptionalProtocolCall(
      { serverId: 'fixture', method: 'resources/list' },
      async () => {
        throw new Error('MCP error -32601: Method not found');
      },
      { resources: [], resourceTemplates: [] },
    );

    expect(result).toEqual({ resources: [], resourceTemplates: [] });
    expect(getProtocolTraces()).toMatchObject([
      {
        serverId: 'fixture',
        method: 'resources/list',
        status: 'unsupported',
        result: { resources: [], resourceTemplates: [] },
        error: 'Server does not support this optional MCP capability.',
      },
    ]);
  });

  test('still records non-method-not-found optional call failures as errors', async () => {
    await expect(
      traceOptionalProtocolCall(
        { serverId: 'fixture', method: 'prompts/list' },
        async () => {
          throw new Error('HTTP 500');
        },
        { prompts: [] },
      ),
    ).rejects.toThrow('HTTP 500');

    expect(getProtocolTraces()).toMatchObject([
      {
        serverId: 'fixture',
        method: 'prompts/list',
        status: 'error',
        error: 'HTTP 500',
      },
    ]);
  });

  test('redacts obvious secret fields from captured payloads', async () => {
    await traceProtocolCall(
      {
        serverId: 'fixture',
        method: 'tools/call',
        params: {
          headers: { Authorization: 'Bearer token' },
          arguments: {
            apiKey: 'secret',
            nested: { password: 'hunter2' },
            visible: 'safe',
          },
        },
      },
      async () => ({
        token: 'response-token',
        content: [{ type: 'text', text: 'ok' }],
      }),
    );

    expect(getProtocolTraces()[0]).toMatchObject({
      params: {
        headers: { Authorization: '[redacted]' },
        arguments: {
          apiKey: '[redacted]',
          nested: { password: '[redacted]' },
          visible: 'safe',
        },
      },
      result: {
        token: '[redacted]',
        content: [{ type: 'text', text: 'ok' }],
      },
    });
  });

  test('notifies subscribers and clears traces', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProtocolTraces(listener);

    await traceProtocolCall({ serverId: 'fixture', method: 'tools/list' }, async () => ({ tools: [] }));
    clearProtocolTraces();
    unsubscribe();
    await traceProtocolCall({ serverId: 'fixture', method: 'prompts/list' }, async () => ({ prompts: [] }));

    expect(listener).toHaveBeenCalledTimes(3);
    expect(getProtocolTraces()).toHaveLength(1);
  });

  test('keeps only the newest 200 traces', async () => {
    for (let i = 0; i < 205; i++) {
      await traceProtocolCall({ serverId: 'fixture', method: `call/${i}` }, async () => i);
    }

    const traces = getProtocolTraces();
    expect(traces).toHaveLength(200);
    expect(traces[0].method).toBe('call/204');
    expect(traces.at(-1)?.method).toBe('call/5');
  });
});
