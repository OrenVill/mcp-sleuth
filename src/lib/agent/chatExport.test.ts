import { describe, expect, test } from 'vitest';
import type { AgentMessage, LlmConfig } from './types';
import {
  CHAT_EXPORT_VERSION,
  buildChatExport,
  chatExportFilename,
  chatToJson,
  chatToMarkdown,
  scrubTextSecrets,
} from './chatExport';

const config: LlmConfig = {
  id: 'c1',
  label: 'Test model',
  provider: 'openai',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-test',
  apiKey: 'sk-secret-key-should-never-appear',
  extraHeaders: { 'X-Custom': 'header-secret-value' },
};

const servers = [{ id: 's1', name: 'Fixture server' }];

function exportAt(messages: AgentMessage[], at = new Date('2026-11-02T17:30:00Z')) {
  return buildChatExport({
    messages,
    config,
    servers,
    exportedAt: at,
    appVersion: '2.0.1',
  });
}

describe('chatExport', () => {
  test('plain Q&A markdown and JSON version', () => {
    const messages: AgentMessage[] = [
      { role: 'user', text: 'Hello?' },
      { role: 'assistant', text: 'Hi there.' },
    ];
    const exp = exportAt(messages);
    const md = chatToMarkdown(exp);
    expect(md).toContain('## User');
    expect(md).toContain('Hello?');
    expect(md).toContain('## Assistant');
    expect(md).toContain('Hi there.');
    const json = JSON.parse(chatToJson(exp)) as { version: number };
    expect(json.version).toBe(CHAT_EXPORT_VERSION);
  });

  test('pairs a successful tool call with its result', () => {
    const messages: AgentMessage[] = [
      { role: 'user', text: 'Run it' },
      {
        role: 'assistant',
        text: 'On it.',
        toolCalls: [
          {
            id: 'call_1',
            llmName: 'echo',
            serverId: 's1',
            toolName: 'echo_markdown',
            args: { message: 'hi' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call_1', text: 'echo: hi', isError: false },
      { role: 'assistant', text: 'Done.' },
    ];
    const md = chatToMarkdown(exportAt(messages));
    expect(md).toContain('### Tool call: `Fixture server` › `echo_markdown`');
    expect(md).toContain('**Result** (ok)');
    expect(md).toContain('echo: hi');
  });

  test('marks tool errors and denials', () => {
    const denied: AgentMessage[] = [
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          {
            id: 'c1',
            llmName: 'x',
            serverId: 's1',
            toolName: 'bad',
            args: {},
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'c1',
        text: 'The user denied this call: this is not the right tool for the request. Choose a different tool.',
        isError: true,
      },
    ];
    expect(chatToMarkdown(exportAt(denied))).toContain('**Result** (denied)');

    const errored: AgentMessage[] = [
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          { id: 'c2', llmName: 'x', serverId: 's1', toolName: 'boom', args: {} },
        ],
      },
      { role: 'tool', toolCallId: 'c2', text: 'exploded', isError: true },
    ];
    expect(chatToMarkdown(exportAt(errored))).toContain('**Result** (error)');
  });

  test('multiple tool calls in one assistant turn', () => {
    const messages: AgentMessage[] = [
      {
        role: 'assistant',
        text: 'Two calls',
        toolCalls: [
          { id: 'a', llmName: 't1', serverId: 's1', toolName: 'one', args: { n: 1 } },
          { id: 'b', llmName: 't2', serverId: 's1', toolName: 'two', args: { n: 2 } },
        ],
      },
      { role: 'tool', toolCallId: 'a', text: 'r1', isError: false },
      { role: 'tool', toolCallId: 'b', text: 'r2', isError: false },
    ];
    const md = chatToMarkdown(exportAt(messages));
    expect(md).toContain('› `one`');
    expect(md).toContain('› `two`');
    expect(md).toContain('r1');
    expect(md).toContain('r2');
  });

  test('unresolved tool uses (unresolved) server label', () => {
    const messages: AgentMessage[] = [
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          { id: 'u', llmName: 'missing', serverId: '', toolName: 'missing', args: {} },
        ],
      },
      { role: 'tool', toolCallId: 'u', text: 'No tool named "missing"', isError: true },
    ];
    expect(chatToMarkdown(exportAt(messages))).toContain('`(unresolved)` › `missing`');
  });

  test('orphan tool message is rendered separately', () => {
    const messages: AgentMessage[] = [
      { role: 'tool', toolCallId: 'orphan', text: 'lost result', isError: false },
    ];
    const md = chatToMarkdown(exportAt(messages));
    expect(md).toContain('## Tool result (unpaired)');
    expect(md).toContain('lost result');
  });

  test('fence length escapes triple backticks in tool output', () => {
    const messages: AgentMessage[] = [
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          { id: 'f', llmName: 't', serverId: 's1', toolName: 'fence', args: {} },
        ],
      },
      { role: 'tool', toolCallId: 'f', text: 'line\n```\ncode\n```', isError: false },
    ];
    const md = chatToMarkdown(exportAt(messages));
    expect(md).toContain('````text');
    expect(md).toContain('```\ncode\n```');
    expect(md.trimEnd().endsWith('````')).toBe(true);
  });

  test('redacts apiKey, extraHeaders, sensitive args, and bearer tokens in text', () => {
    const messages: AgentMessage[] = [
      { role: 'user', text: 'Use Bearer eyJhbGciOiJIUzI1NiJ9.token' },
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          {
            id: 'sec',
            llmName: 't',
            serverId: 's1',
            toolName: 'authy',
            args: {
              Authorization: 'Bearer secret-token',
              apiKey: 'ghp_abc123xyz',
              safe: 'visible',
            },
          },
        ],
      },
      { role: 'tool', toolCallId: 'sec', text: 'token sk-live-abcdefghijklmnop', isError: false },
    ];
    const exp = exportAt(messages);
    const blob = chatToJson(exp);
    expect(blob).not.toContain('sk-secret-key-should-never-appear');
    expect(blob).not.toContain('header-secret-value');
    expect(blob).not.toContain('Bearer secret-token');
    expect(blob).not.toContain('ghp_abc123xyz');
    expect(blob).not.toContain('sk-live-abcdefghijklmnop');
    expect(blob).toContain('[REDACTED]');
    expect(exp.model?.extraHeaders).toEqual({ 'X-Custom': '[REDACTED]' });
    expect(exp.messages[1].toolCalls?.[0].args).toEqual({
      Authorization: '[REDACTED]',
      apiKey: '[REDACTED]',
      safe: 'visible',
    });
    expect(scrubTextSecrets('prefix sk-1234567890123456 suffix')).toContain('[REDACTED]');
  });

  test('chatExportFilename uses local date parts', () => {
    const date = new Date(2026, 10, 2, 9, 5, 0);
    expect(chatExportFilename('md', date)).toBe('mcp-detective-chat-2026-11-02-0905.md');
    expect(chatExportFilename('json', date)).toBe('mcp-detective-chat-2026-11-02-0905.json');
  });

  test('JSON messages round-trip shape', () => {
    const messages: AgentMessage[] = [
      { role: 'user', text: 'Q' },
      {
        role: 'assistant',
        text: 'A',
        toolCalls: [
          { id: '1', llmName: 'n', serverId: 's1', toolName: 't', args: { q: 'x' } },
        ],
      },
      { role: 'tool', toolCallId: '1', text: 'out', isError: false },
    ];
    const parsed = JSON.parse(chatToJson(exportAt(messages))) as {
      format: string;
      messages: AgentMessage[];
    };
    expect(parsed.format).toBe('mcp-detective.agent-chat');
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[1].toolCalls?.[0].toolName).toBe('t');
  });
});
