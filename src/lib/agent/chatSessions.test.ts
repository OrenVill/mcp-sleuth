import { describe, it, expect } from 'vitest';
import {
  AGENT_CHAT_SLOT_COUNT,
  createDefaultAgentChatSlots,
  defaultAgentChatSlot,
  parseAgentChatSlots,
} from './chatSessions';

describe('chatSessions', () => {
  it('createDefaultAgentChatSlots has three labelled slots', () => {
    const slots = createDefaultAgentChatSlots();
    expect(slots).toHaveLength(AGENT_CHAT_SLOT_COUNT);
    expect(slots[0].label).toBe('Chat 1');
    expect(slots[2].id).toBe('chat-slot-2');
  });

  it('parseAgentChatSlots normalizes short arrays and bad entries', () => {
    const parsed = parseAgentChatSlots([
      { id: 'a', label: '  A  ', messages: [], activeConfigId: null, selectedServerIds: [], inputDraft: '', updatedAt: 1 },
      'oops',
    ]);
    expect(parsed).toHaveLength(AGENT_CHAT_SLOT_COUNT);
    expect(parsed![0].label).toBe('A');
    expect(parsed![1].label).toBe('Chat 2');
  });

  it('defaultAgentChatSlot produces stable ids', () => {
    expect(defaultAgentChatSlot(1).label).toBe('Chat 2');
  });
});
