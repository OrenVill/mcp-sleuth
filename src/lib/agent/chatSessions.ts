import type { AgentMessage } from './types';

/** Three fixed Agent Chat workspaces; transcripts persist here (not unbounded history). */
export const AGENT_CHAT_SLOT_COUNT = 3 as const;

export interface AgentChatSlotPersisted {
  id: string;
  /** User-visible tab label */
  label: string;
  messages: AgentMessage[];
  /** Mirrors AgentChatPanel — which LLM config is selected for this slot */
  activeConfigId: string | null;
  selectedServerIds: string[];
  inputDraft: string;
  updatedAt: number;
}

function isAgentMessage(value: unknown): value is AgentMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool') return false;
  if (typeof m.text !== 'string') return false;
  return true;
}

export function parseAgentChatSlots(raw: unknown): AgentChatSlotPersisted[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const slots: AgentChatSlotPersisted[] = [];
  for (let i = 0; i < AGENT_CHAT_SLOT_COUNT; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      slots.push(defaultAgentChatSlot(i));
      continue;
    }
    const o = entry as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : `chat-slot-${i}`;
    const label =
      typeof o.label === 'string' && o.label.trim().length > 0 ? o.label.trim() : `Chat ${i + 1}`;
    const messages = Array.isArray(o.messages)
      ? (o.messages as unknown[]).filter(isAgentMessage)
      : [];
    const activeConfigId = o.activeConfigId === null || typeof o.activeConfigId === 'string'
      ? (o.activeConfigId as string | null)
      : null;
    const selectedServerIds = Array.isArray(o.selectedServerIds)
      ? (o.selectedServerIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const inputDraft = typeof o.inputDraft === 'string' ? o.inputDraft : '';
    const updatedAt = typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : 0;
    slots.push({
      id,
      label,
      messages,
      activeConfigId,
      selectedServerIds,
      inputDraft,
      updatedAt,
    });
  }
  return slots;
}

export function defaultAgentChatSlot(index: number): AgentChatSlotPersisted {
  return {
    id: `chat-slot-${index}`,
    label: `Chat ${index + 1}`,
    messages: [],
    activeConfigId: null,
    selectedServerIds: [],
    inputDraft: '',
    updatedAt: 0,
  };
}

export function createDefaultAgentChatSlots(): AgentChatSlotPersisted[] {
  return [0, 1, 2].map((i) => defaultAgentChatSlot(i));
}
