import { describe, expect, test } from 'vitest';
import { serializePromptMessages } from './promptSerialize';
import type { PromptMessage } from '../types';

describe('serializePromptMessages', () => {
  test('serializes a single user message', () => {
    const msgs: PromptMessage[] = [
      { role: 'user', content: { type: 'text', text: 'Hello world' } },
    ];
    expect(serializePromptMessages(msgs)).toBe('user: Hello world');
  });

  test('serializes multiple messages separated by blank lines', () => {
    const msgs: PromptMessage[] = [
      { role: 'user', content: { type: 'text', text: 'Say hi' } },
      { role: 'assistant', content: { type: 'text', text: 'Hi there!' } },
    ];
    expect(serializePromptMessages(msgs)).toBe('user: Say hi\n\nassistant: Hi there!');
  });

  test('falls back to JSON for non-text content', () => {
    const msgs: PromptMessage[] = [
      { role: 'user', content: { type: 'image', data: 'base64...' } as never },
    ];
    const result = serializePromptMessages(msgs);
    expect(result).toContain('user:');
    expect(result).toContain('"type": "image"');
  });

  test('returns empty string for empty array', () => {
    expect(serializePromptMessages([])).toBe('');
  });
});
