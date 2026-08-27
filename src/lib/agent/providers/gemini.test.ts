import { describe, expect, it } from 'vitest';
import type { LlmConfig, LlmRequest } from '../types';
import { geminiProvider, toGeminiContents } from './gemini';

const config: LlmConfig = {
  id: 'g1',
  label: 'Gemini',
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-2.0-flash',
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
  const parser = geminiProvider.createStreamParser();
  return [...parser.push(body), ...parser.end()];
}

describe('toGeminiContents', () => {
  it('maps a user message to a user content', () => {
    expect(toGeminiContents([{ role: 'user', text: 'hi' }])).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
    ]);
  });

  it('uses the model role for assistant turns', () => {
    expect(toGeminiContents([{ role: 'assistant', text: 'hello' }])).toEqual([
      { role: 'model', parts: [{ text: 'hello' }] },
    ]);
  });

  it('serializes an assistant tool call using the name the model emitted', () => {
    const contents = toGeminiContents([
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          {
            id: 'gemini-0',
            llmName: 'list_repos',
            serverId: 's1',
            toolName: 'listRepos',
            args: { limit: 20 },
          },
        ],
      },
    ]);
    expect(contents).toEqual([
      { role: 'model', parts: [{ functionCall: { name: 'list_repos', args: { limit: 20 } } }] },
    ]);
  });

  it('keeps assistant prose alongside its function calls', () => {
    const contents = toGeminiContents([
      {
        role: 'assistant',
        text: 'looking that up',
        toolCalls: [
          { id: 'gemini-0', llmName: 'list_repos', serverId: 's1', toolName: 'list_repos', args: {} },
        ],
      },
    ]);
    expect(contents[0].parts).toEqual([
      { text: 'looking that up' },
      { functionCall: { name: 'list_repos', args: {} } },
    ]);
  });

  it('sends a tool result as a user content keyed by the called tool name', () => {
    const contents = toGeminiContents([
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          {
            id: 'gemini-0',
            llmName: 'list_repos',
            serverId: 's1',
            toolName: 'listRepos',
            args: {},
          },
        ],
      },
      { role: 'tool', text: '20 repos', toolCallId: 'gemini-0' },
    ]);
    expect(contents[1]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'list_repos', response: { content: '20 repos' } } }],
    });
  });

  it('picks the matching call when the assistant turn requested several tools', () => {
    const contents = toGeminiContents([
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          { id: 'gemini-0', llmName: 'list_repos', serverId: 's1', toolName: 'list_repos', args: {} },
          { id: 'gemini-1', llmName: 'read_file', serverId: 's1', toolName: 'read_file', args: {} },
        ],
      },
      { role: 'tool', text: 'file body', toolCallId: 'gemini-1' },
    ]);
    expect(contents[1]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'read_file', response: { content: 'file body' } } }],
    });
  });

  it('falls back to the call id as the name when no matching call is found', () => {
    const contents = toGeminiContents([{ role: 'tool', text: 'orphan', toolCallId: 'gemini-7' }]);
    expect(contents[0]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'gemini-7', response: { content: 'orphan' } } }],
    });
  });

  it('falls back to a placeholder name when the tool result has no call id at all', () => {
    const contents = toGeminiContents([{ role: 'tool', text: 'orphan' }]);
    expect(contents[0]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'unknown_tool', response: { content: 'orphan' } } }],
    });
  });
});

describe('geminiProvider.buildRequest', () => {
  it('targets the streaming generateContent endpoint in SSE mode', () => {
    expect(geminiProvider.buildRequest(request).url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse',
    );
  });

  it('omits the api key header when there is no key', () => {
    expect(geminiProvider.buildRequest(request).headers['x-goog-api-key']).toBeUndefined();
  });

  it('sends the api key header when a key is configured', () => {
    const withKey = { ...request, config: { ...config, apiKey: 'AIza-test' } };
    expect(geminiProvider.buildRequest(withKey).headers['x-goog-api-key']).toBe('AIza-test');
  });

  it('merges extra headers', () => {
    const withHeaders = { ...request, config: { ...config, extraHeaders: { 'X-Trace': 'on' } } };
    expect(geminiProvider.buildRequest(withHeaders).headers['X-Trace']).toBe('on');
  });

  it('sends the system prompt as systemInstruction, not as a message', () => {
    const body = geminiProvider.buildRequest(request).body as Record<string, unknown>;
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'you are a test' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'list my repos' }] }]);
  });

  it('sends the whole catalog as one functionDeclarations entry', () => {
    const twoTools = {
      ...request,
      tools: [
        ...request.tools,
        { name: 'read_file', description: 'reads', parameters: { type: 'object' as const } },
      ],
    };
    const body = geminiProvider.buildRequest(twoTools).body as Record<string, unknown>;
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'list_repos',
            description: 'lists repos',
            parameters: { type: 'object', properties: { limit: { type: 'number' } } },
          },
          { name: 'read_file', description: 'reads', parameters: { type: 'object' } },
        ],
      },
    ]);
  });

  it('omits tools entirely when the catalog is empty', () => {
    const noTools = { ...request, tools: [] };
    const body = geminiProvider.buildRequest(noTools).body as Record<string, unknown>;
    expect(body.tools).toBeUndefined();
  });
});

describe('geminiProvider stream parsing', () => {
  it('emits text deltas and a final response', () => {
    const events = runParser(
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n' +
        'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n',
    );
    expect(events).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'final', response: { text: 'Hello', toolCalls: [] } },
    ]);
  });

  it('synthesises a stable id per function call, since Gemini assigns none', () => {
    const events = runParser(
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"list_repos","args":{"limit":20}}}]}}]}\n' +
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"read_file","args":{"path":"a"}}}]}}]}\n',
    );
    expect(events.at(-1)).toEqual({
      type: 'final',
      response: {
        text: '',
        toolCalls: [
          { id: 'gemini-0', name: 'list_repos', args: { limit: 20 } },
          { id: 'gemini-1', name: 'read_file', args: { path: 'a' } },
        ],
      },
    });
  });

  it('reads several parts out of one payload', () => {
    const events = runParser(
      'data: {"candidates":[{"content":{"parts":[{"text":"ok "},{"functionCall":{"name":"x","args":{}}}]}}]}\n',
    );
    expect(events).toEqual([
      { type: 'delta', text: 'ok ' },
      {
        type: 'final',
        response: { text: 'ok ', toolCalls: [{ id: 'gemini-0', name: 'x', args: {} }] },
      },
    ]);
  });

  it('handles a line split across two push calls', () => {
    const parser = geminiProvider.createStreamParser();
    expect(parser.push('data: {"candidates":[{"content":{"parts":[{"te')).toEqual([]);
    expect(parser.push('xt":"hi"}]}}]}\n')).toEqual([{ type: 'delta', text: 'hi' }]);
  });

  it('emits the final event on end, since the stream has no terminator', () => {
    const parser = geminiProvider.createStreamParser();
    const pushed = parser.push('data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n');
    expect(pushed.some((e) => e.type === 'final')).toBe(false);
    expect(parser.end()).toEqual([{ type: 'final', response: { text: 'hi', toolCalls: [] } }]);
  });

  it('does not emit a second final event', () => {
    const parser = geminiProvider.createStreamParser();
    parser.push('data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n');
    expect(parser.end()).toHaveLength(1);
    expect(parser.end()).toEqual([]);
  });

  it('ignores unparseable payloads rather than throwing', () => {
    expect(() => runParser('data: {oh no\n')).not.toThrow();
  });

  it('ignores payloads with no candidates', () => {
    const events = runParser('data: {"usageMetadata":{"totalTokenCount":3}}\n');
    expect(events).toEqual([{ type: 'final', response: { text: '', toolCalls: [] } }]);
  });

  it('falls back to empty arguments when a function call carries no usable args', () => {
    const events = runParser(
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"x","args":"nope"}}]}}]}\n',
    );
    expect(events.at(-1)).toMatchObject({
      response: { toolCalls: [{ id: 'gemini-0', name: 'x', args: {} }] },
    });
  });
});

describe('geminiProvider model listing', () => {
  it('targets the models endpoint', () => {
    expect(geminiProvider.modelsRequest(config).url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models',
    );
  });

  it('sends the api key header when a key is configured', () => {
    expect(geminiProvider.modelsRequest({ ...config, apiKey: 'AIza-test' }).headers['x-goog-api-key']).toBe(
      'AIza-test',
    );
  });

  it('strips the models/ prefix so the name can be interpolated back into the path', () => {
    expect(
      geminiProvider.parseModels({
        models: [{ name: 'models/gemini-2.0-flash' }, { name: 'models/gemini-1.5-pro' }],
      }),
    ).toEqual(['gemini-2.0-flash', 'gemini-1.5-pro']);
  });

  it('returns an empty list for an unexpected payload', () => {
    expect(geminiProvider.parseModels({ nope: true })).toEqual([]);
  });
});
