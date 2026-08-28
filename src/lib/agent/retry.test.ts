import { describe, expect, it } from 'vitest';
import { historyForRetry } from './retry';
import type { AgentMessage } from './types';

const user = (text: string): AgentMessage => ({ role: 'user', text });
const assistant = (text: string, callIds: string[] = []): AgentMessage => ({
  role: 'assistant',
  text,
  toolCalls: callIds.map((id) => ({
    id,
    llmName: 'echo',
    serverId: 's1',
    toolName: 'echo',
    args: {},
  })),
});
const result = (toolCallId: string): AgentMessage => ({
  role: 'tool',
  text: 'ok',
  toolCallId,
});

describe('historyForRetry', () => {
  it('leaves a history whose tool calls were all answered alone', () => {
    const messages = [user('hi'), assistant('', ['a']), result('a'), assistant('done')];
    expect(historyForRetry(messages)).toEqual(messages);
  });

  it('keeps a plain failed turn intact, which is the common retry', () => {
    // A model or transport failure appends nothing, so the history still ends
    // at the user's message and is re-sendable as-is.
    const messages = [user('hi')];
    expect(historyForRetry(messages)).toEqual(messages);
  });

  it('drops a trailing assistant turn whose call was never answered', () => {
    // What Stop mid-tool-loop leaves behind. Anthropic and Gemini both reject
    // a tool call with no result, so re-sending this verbatim fails.
    const messages = [user('hi'), assistant('', ['a'])];
    expect(historyForRetry(messages)).toEqual([user('hi')]);
  });

  it('drops a partially answered turn along with its orphaned result', () => {
    const messages = [user('hi'), assistant('', ['a', 'b']), result('a')];
    expect(historyForRetry(messages)).toEqual([user('hi')]);
  });

  it('prunes back past more than one unanswered turn', () => {
    const messages = [
      user('hi'),
      assistant('', ['a']),
      result('a'),
      assistant('', ['b']),
      assistant('', ['c']),
    ];
    expect(historyForRetry(messages)).toEqual([user('hi'), assistant('', ['a']), result('a')]);
  });

  it('keeps an answered turn that is followed by nothing else', () => {
    const messages = [user('hi'), assistant('', ['a']), result('a')];
    expect(historyForRetry(messages)).toEqual(messages);
  });

  it('returns nothing when there is nothing left to re-send', () => {
    expect(historyForRetry([])).toEqual([]);
    expect(historyForRetry([assistant('', ['a'])])).toEqual([]);
  });
});
