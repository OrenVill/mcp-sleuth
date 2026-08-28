import type { JsonSchema } from '../../types';

// --- Conversation ---

export type AgentRole = 'user' | 'assistant' | 'tool';

/** A tool call after the LLM's raw name has been resolved to a server. */
export interface AgentToolCall {
  /** Provider-assigned call id; correlates the request with its result. */
  id: string;
  /**
   * The name the model used. Kept separate from `toolName` because provider
   * adapters must re-serialize prior assistant turns using the name the model
   * itself emitted, which sanitizeToolName may have altered.
   */
  llmName: string;
  /** Empty when the model named a tool we could not resolve. */
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface AgentMessage {
  role: AgentRole;
  /** Prose. Empty on an assistant turn that only requested tools. */
  text: string;
  /** Present on assistant messages that requested tools. */
  toolCalls?: AgentToolCall[];
  /** Present on tool messages; matches AgentToolCall.id. */
  toolCallId?: string;
  isError?: boolean;
}

// --- Gating ---

export type DenyReason = 'wrong_tool' | 'bad_arguments' | 'unsafe' | 'no_reason';

export type GateDecision =
  | { kind: 'allow'; remember: boolean }
  | { kind: 'deny'; reason: DenyReason };

/** What the UI must offer for a pending call. */
export type GateVerdict = 'auto' | 'ask' | 'ask_locked';

// --- Events ---

export type AgentEvent =
  | { type: 'model_delta'; text: string }
  | { type: 'model_message'; message: AgentMessage }
  | { type: 'tool_requested'; call: AgentToolCall }
  | { type: 'tool_allowed'; call: AgentToolCall; remembered: boolean }
  | { type: 'tool_denied'; call: AgentToolCall; reason: DenyReason }
  | { type: 'tool_result'; call: AgentToolCall; text: string; isError: boolean }
  | { type: 'turn_limit'; turns: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

// --- Providers ---

export type LlmProviderId = 'openai' | 'anthropic' | 'gemini';

export interface LlmConfig {
  id: string;
  label: string;
  provider: LlmProviderId;
  /** No trailing slash. e.g. https://api.openai.com/v1, http://127.0.0.1:11434/v1 */
  baseUrl: string;
  model: string;
  /** Absent for local models. */
  apiKey?: string;
  extraHeaders?: Record<string, string>;
}

export interface LlmToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface LlmRequest {
  config: LlmConfig;
  system: string;
  messages: AgentMessage[];
  tools: LlmToolSchema[];
}

/** A tool call exactly as the provider named it, before resolution. */
export interface RawToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmResponse {
  text: string;
  toolCalls: RawToolCall[];
}

export type LlmStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'final'; response: LlmResponse };

// --- Persisted signal ---

export interface AgentRunSummary {
  serverId: string;
  runs: number;
  wrongToolPicks: number;
  badArgDenials: number;
  toolErrors: number;
  unrecoveredErrors: number;
  lastRunAt: number;
}

export type AgentRunSummaries = Record<string, AgentRunSummary>;

export const DEFAULT_MAX_TURNS = 8;
