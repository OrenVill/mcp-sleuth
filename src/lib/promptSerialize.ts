import type { PromptMessage } from '../types';

export function serializePromptMessages(messages: PromptMessage[]): string {
  return messages
    .map((m) => {
      const text =
        m.content.type === 'text' && m.content.text !== undefined
          ? m.content.text
          : JSON.stringify(m.content, null, 2);
      return `${m.role}: ${text}`;
    })
    .join('\n\n');
}
