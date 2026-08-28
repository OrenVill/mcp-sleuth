import type { AgentMessage } from './types';

/**
 * The history a retry can actually be sent with.
 *
 * A failed model turn appends nothing, so the usual retry is the history
 * untouched. Stop is the exception: aborting mid-tool-loop can leave an
 * assistant turn whose tool calls never got results, and Anthropic and Gemini
 * both reject that shape outright — so the retry would fail on the request
 * rather than on the thing that failed the first time.
 *
 * Such a turn is dropped along with anything after it, including the results of
 * its siblings: a partially answered turn cannot be repaired, only re-asked.
 */
export function historyForRetry(messages: AgentMessage[]): AgentMessage[] {
  const answered = new Set(
    messages
      .filter((message) => message.role === 'tool' && message.toolCallId)
      .map((message) => message.toolCallId as string),
  );

  let end = messages.length;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const calls = messages[i].toolCalls;
    if (!calls?.length) continue;
    if (calls.every((call) => answered.has(call.id))) break;
    // Truncating rather than splicing: a turn the model never finished cannot
    // be followed by anything worth keeping.
    end = i;
  }

  return end === messages.length ? messages : messages.slice(0, end);
}
