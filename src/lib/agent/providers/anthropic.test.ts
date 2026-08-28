import { describe, expect, it } from 'vitest';
import type { LlmConfig, LlmRequest } from '../types';
import { anthropicProvider, toAnthropicMessages } from './anthropic';

const config: LlmConfig = {
  id: 'a1',
  label: 'Claude',
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-opus-5',
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
  const parser = anthropicProvider.createStreamParser();
  return [...parser.push(body), ...parser.end()];
}

describe('toAnthropicMessages', () => {
  it('does not put the system prompt in the message list', () => {
    // Anthropic takes `system` as a top-level request field, not a message.
    expect(toAnthropicMessages([{ role: 'user', text: 'hi' }])).toEqual([
      { role: 'user', content: 'hi' },
    ]);
  });

  it('serializes an assistant tool call using the name the model emitted', () => {
    const messages = toAnthropicMessages([
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          {
            id: 'c1',
            llmName: 'list_repos',
            serverId: 's1',
            toolName: 'list-repos',
            args: { limit: 20 },
          },
        ],
      },
    ]);
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'c1', name: 'list_repos', input: { limit: 20 } }],
    });
  });

  it('keeps assistant prose alongside its tool calls', () => {
    const messages = toAnthropicMessages([
      {
        role: 'assistant',
        text: 'looking now',
        toolCalls: [
          { id: 'c1', llmName: 'list_repos', serverId: 's1', toolName: 'list_repos', args: {} },
        ],
      },
    ]);
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'looking now' },
        { type: 'tool_use', id: 'c1', name: 'list_repos', input: {} },
      ],
    });
  });

  it('sends a tool result as a user message, since Anthropic has no tool role', () => {
    const messages = toAnthropicMessages([{ role: 'tool', text: '20 repos', toolCallId: 'c1' }]);
    expect(messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'c1', content: '20 repos' }],
    });
  });

  it('merges consecutive tool results into one user message', () => {
    const messages = toAnthropicMessages([
      { role: 'tool', text: 'a', toolCallId: 'c1' },
      { role: 'tool', text: 'b', toolCallId: 'c2' },
    ]);
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'c1', content: 'a' },
          { type: 'tool_result', tool_use_id: 'c2', content: 'b' },
        ],
      },
    ]);
  });

  it('does not merge a tool result into a plain user turn', () => {
    const messages = toAnthropicMessages([
      { role: 'user', text: 'hi' },
      { role: 'tool', text: 'a', toolCallId: 'c1' },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'user', content: 'hi' });
  });
});

describe('anthropicProvider.buildRequest', () => {
  it('targets the messages endpoint', () => {
    expect(anthropicProvider.buildRequest(request).url).toBe(
      'https://api.anthropic.com/v1/messages',
    );
  });

  it('omits the api key header when no key is configured', () => {
    expect(anthropicProvider.buildRequest(request).headers['x-api-key']).toBeUndefined();
  });

  it('sends the key as x-api-key rather than a bearer token', () => {
    const withKey = { ...request, config: { ...config, apiKey: 'sk-ant-test' } };
    const headers = anthropicProvider.buildRequest(withKey).headers;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers.Authorization).toBeUndefined();
  });

  it('pins the API version', () => {
    expect(anthropicProvider.buildRequest(request).headers['anthropic-version']).toBe('2023-06-01');
  });

  it('merges extra headers', () => {
    const withHeaders = { ...request, config: { ...config, extraHeaders: { 'X-Trace': 'on' } } };
    expect(anthropicProvider.buildRequest(withHeaders).headers['X-Trace']).toBe('on');
  });

  it('sends the system prompt as a top-level field, not a message', () => {
    const body = anthropicProvider.buildRequest(request).body as Record<string, unknown>;
    expect(body.system).toBe('you are a test');
    expect(body.messages).toEqual([{ role: 'user', content: 'list my repos' }]);
    expect(body.stream).toBe(true);
  });

  it('always sends max_tokens, which the API requires', () => {
    const body = anthropicProvider.buildRequest(request).body as Record<string, unknown>;
    expect(body.max_tokens).toBe(4096);
  });

  it('sends the tool catalog with input_schema', () => {
    const body = anthropicProvider.buildRequest(request).body as Record<string, unknown>;
    expect(body.tools).toEqual([
      {
        name: 'list_repos',
        description: 'lists repos',
        input_schema: { type: 'object', properties: { limit: { type: 'number' } } },
      },
    ]);
  });

  it('omits tools entirely when the catalog is empty', () => {
    const noTools = { ...request, tools: [] };
    const body = anthropicProvider.buildRequest(noTools).body as Record<string, unknown>;
    expect(body.tools).toBeUndefined();
  });
});

describe('anthropicProvider stream parsing', () => {
  it('emits text deltas and a final response', () => {
    const events = runParser(
      'event: content_block_delta\n' +
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n' +
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}\n' +
        'data: {"type":"message_stop"}\n',
    );
    expect(events).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'final', response: { text: 'Hello', toolCalls: [] } },
    ]);
  });

  it('reassembles a tool call streamed across several chunks', () => {
    const events = runParser(
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"c1","name":"list_repos"}}\n' +
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"lim"}}\n' +
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"it\\":20}"}}\n' +
        'data: {"type":"content_block_stop","index":0}\n' +
        'data: {"type":"message_stop"}\n',
    );
    expect(events.at(-1)).toEqual({
      type: 'final',
      response: { text: '', toolCalls: [{ id: 'c1', name: 'list_repos', args: { limit: 20 } }] },
    });
  });

  it('keeps text and tool calls from the same message apart by block index', () => {
    const events = runParser(
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n' +
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"on it"}}\n' +
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"c1","name":"x"}}\n' +
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n' +
        'data: {"type":"message_stop"}\n',
    );
    expect(events.at(-1)).toEqual({
      type: 'final',
      response: { text: 'on it', toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
    });
  });

  it('handles a line split across two push calls', () => {
    const parser = anthropicProvider.createStreamParser();
    expect(parser.push('data: {"type":"content_block_delta","index":0,"delta":{"ty')).toEqual([]);
    expect(parser.push('pe":"text_delta","text":"hi"}}\n')).toEqual([{ type: 'delta', text: 'hi' }]);
  });

  it('emits a final event when the stream ends without message_stop', () => {
    const events = runParser(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n',
    );
    expect(events.at(-1)).toEqual({ type: 'final', response: { text: 'hi', toolCalls: [] } });
  });

  it('does not emit a second final event after message_stop', () => {
    const events = runParser(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n' +
        'data: {"type":"message_stop"}\n',
    );
    expect(events.filter((e) => e.type === 'final')).toHaveLength(1);
  });

  it('ignores unparseable payloads rather than throwing', () => {
    expect(() => runParser('data: {oh no\ndata: {"type":"message_stop"}\n')).not.toThrow();
  });

  it('ignores events it does not model, such as ping and error', () => {
    const events = runParser(
      'data: {"type":"ping"}\n' +
        'data: {"type":"error","error":{"type":"overloaded_error"}}\n' +
        'data: {"type":"message_stop"}\n',
    );
    expect(events).toEqual([{ type: 'final', response: { text: '', toolCalls: [] } }]);
  });

  it('falls back to empty arguments when the model streams invalid JSON', () => {
    const events = runParser(
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"c1","name":"x"}}\n' +
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{oops"}}\n' +
        'data: {"type":"message_stop"}\n',
    );
    expect(events.at(-1)).toMatchObject({
      response: { toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
    });
  });
});

describe('anthropicProvider model listing', () => {
  it('targets the models endpoint with the same headers', () => {
    const withKey = { ...config, apiKey: 'sk-ant-test' };
    const req = anthropicProvider.modelsRequest(withKey);
    expect(req.url).toBe('https://api.anthropic.com/v1/models');
    expect(req.headers['x-api-key']).toBe('sk-ant-test');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('extracts model ids', () => {
    expect(anthropicProvider.parseModels({ data: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
  });

  it('returns an empty list for an unexpected payload', () => {
    expect(anthropicProvider.parseModels({ nope: true })).toEqual([]);
  });
});
