import { describe, expect, it } from 'vitest';
import type { LlmConfig, LlmRequest } from '../types';
import { openaiProvider, toOpenAiMessages } from './openai';

const config: LlmConfig = {
  id: 'l1',
  label: 'Local',
  provider: 'openai',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'qwen3',
};

const request: LlmRequest = {
  config,
  system: 'you are a test',
  messages: [{ role: 'user', text: 'list my repos' }],
  tools: [
    {
      name: 'list_repos',
      description: 'lists repos',
      parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    },
  ],
};

/** Feed a whole SSE body through the parser and return every event it produced. */
function runParser(body: string) {
  const parser = openaiProvider.createStreamParser();
  const events = [...parser.push(body), ...parser.end()];
  return events;
}

describe('toOpenAiMessages', () => {
  it('puts the system prompt first', () => {
    expect(toOpenAiMessages('sys', [])[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('serializes an assistant tool call using the name the model emitted', () => {
    const messages = toOpenAiMessages('sys', [
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          { id: 'c1', llmName: 'list_repos', serverId: 's1', toolName: 'list_repos', args: { limit: 20 } },
        ],
      },
    ]);
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'list_repos', arguments: '{"limit":20}' },
        },
      ],
    });
  });

  it('serializes a tool result against its call id', () => {
    const messages = toOpenAiMessages('sys', [
      { role: 'tool', text: '20 repos', toolCallId: 'c1' },
    ]);
    expect(messages[1]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '20 repos' });
  });
});

describe('openaiProvider.buildRequest', () => {
  it('targets the chat completions endpoint', () => {
    expect(openaiProvider.buildRequest(request).url).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    );
  });

  it('omits Authorization when there is no key, for local models', () => {
    expect(openaiProvider.buildRequest(request).headers.Authorization).toBeUndefined();
  });

  it('sends a bearer token when a key is configured', () => {
    const withKey = { ...request, config: { ...config, apiKey: 'sk-test' } };
    expect(openaiProvider.buildRequest(withKey).headers.Authorization).toBe('Bearer sk-test');
  });

  it('merges extra headers', () => {
    const withHeaders = {
      ...request,
      config: { ...config, extraHeaders: { 'X-Trace': 'on' } },
    };
    expect(openaiProvider.buildRequest(withHeaders).headers['X-Trace']).toBe('on');
  });

  it('sends the tool catalog as function definitions', () => {
    const body = openaiProvider.buildRequest(request).body as Record<string, unknown>;
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'list_repos',
          description: 'lists repos',
          parameters: { type: 'object', properties: { limit: { type: 'number' } } },
        },
      },
    ]);
    expect(body.stream).toBe(true);
  });

  it('omits tools entirely when the catalog is empty', () => {
    const noTools = { ...request, tools: [] };
    const body = openaiProvider.buildRequest(noTools).body as Record<string, unknown>;
    expect(body.tools).toBeUndefined();
  });
});

describe('openaiProvider stream parsing', () => {
  it('emits text deltas and a final response', () => {
    const events = runParser(
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n' +
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n' +
        'data: [DONE]\n',
    );
    expect(events).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'final', response: { text: 'Hello', toolCalls: [] } },
    ]);
  });

  it('reassembles a tool call streamed across several chunks', () => {
    const events = runParser(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"list_re"}}]}}]}\n' +
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"pos","arguments":"{\\"lim"}}]}}]}\n' +
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"it\\":20}"}}]}}]}\n' +
        'data: [DONE]\n',
    );
    expect(events.at(-1)).toEqual({
      type: 'final',
      response: { text: '', toolCalls: [{ id: 'c1', name: 'list_repos', args: { limit: 20 } }] },
    });
  });

  it('handles a line split across two push calls', () => {
    const parser = openaiProvider.createStreamParser();
    expect(parser.push('data: {"choices":[{"delta":{"con')).toEqual([]);
    expect(parser.push('tent":"hi"}}]}\n')).toEqual([{ type: 'delta', text: 'hi' }]);
  });

  it('emits a final event when the stream ends without [DONE]', () => {
    const events = runParser('data: {"choices":[{"delta":{"content":"hi"}}]}\n');
    expect(events.at(-1)).toEqual({ type: 'final', response: { text: 'hi', toolCalls: [] } });
  });

  it('does not emit a second final event after [DONE]', () => {
    const events = runParser('data: {"choices":[{"delta":{"content":"hi"}}]}\ndata: [DONE]\n');
    expect(events.filter((e) => e.type === 'final')).toHaveLength(1);
  });

  it('ignores unparseable payloads rather than throwing', () => {
    expect(() => runParser('data: {oh no\ndata: [DONE]\n')).not.toThrow();
  });

  it('falls back to empty arguments when the model streams invalid JSON', () => {
    const events = runParser(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"x","arguments":"{oops"}}]}}]}\n' +
        'data: [DONE]\n',
    );
    expect(events.at(-1)).toMatchObject({
      response: { toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
    });
  });
});

describe('openaiProvider model listing', () => {
  it('targets the models endpoint', () => {
    expect(openaiProvider.modelsRequest(config).url).toBe('http://127.0.0.1:11434/v1/models');
  });

  it('extracts model ids', () => {
    expect(openaiProvider.parseModels({ data: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
  });

  it('returns an empty list for an unexpected payload', () => {
    expect(openaiProvider.parseModels({ nope: true })).toEqual([]);
  });
});
