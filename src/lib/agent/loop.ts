import type { ToolResult } from '../../types';
import type {
  AgentEvent,
  AgentMessage,
  AgentToolCall,
  DenyReason,
  GateDecision,
  LlmConfig,
  LlmStreamEvent,
  LlmToolSchema,
} from './types';

/**
 * A denial is fed back to the model rather than aborting the run: how a model
 * recovers from a refused tool is itself an agent-readiness finding. The reason
 * is included so the model can adapt rather than blindly retry.
 */
export const DENIAL_TEXT: Record<DenyReason, string> = {
  wrong_tool:
    'The user denied this call: this is not the right tool for the request. Choose a different tool.',
  bad_arguments:
    'The user denied this call: the arguments are wrong. Reconsider the arguments before retrying.',
  unsafe: 'The user denied this call as unsafe. Do not retry it.',
  no_reason: 'The user denied this call.',
};

export interface AgentLoopDeps {
  sendToModel(
    req: { config: LlmConfig; system: string; messages: AgentMessage[]; tools: LlmToolSchema[] },
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent>;
  callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult>;
  gate(call: AgentToolCall): Promise<GateDecision>;
  resolve(llmName: string): { serverId: string; toolName: string } | null;
  maxTurns: number;
  signal: AbortSignal;
}

export interface AgentTurnInit {
  config: LlmConfig;
  system: string;
  tools: LlmToolSchema[];
  messages: AgentMessage[];
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Flattens an MCP tool result into the plain text a model can consume. */
export function toolResultText(result: ToolResult): string {
  const parts = result.content
    .map((item) => (typeof item.text === 'string' ? item.text : JSON.stringify(item)))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : '(no content)';
}

/**
 * The model <-> tool cycle. Yields events for the UI; returns the final message
 * history. Performs no network or MCP work itself — everything is injected, so
 * every branch below is reachable in a unit test.
 */
export async function* runAgentTurn(
  deps: AgentLoopDeps,
  init: AgentTurnInit,
): AsyncGenerator<AgentEvent, AgentMessage[]> {
  const messages: AgentMessage[] = [...init.messages];

  for (let turn = 0; turn < deps.maxTurns; turn++) {
    if (deps.signal.aborted) {
      yield { type: 'error', message: 'Run cancelled' };
      return messages;
    }

    let final: LlmStreamEvent | null = null;
    try {
      for await (const event of deps.sendToModel(
        { config: init.config, system: init.system, messages, tools: init.tools },
        deps.signal,
      )) {
        if (event.type === 'delta') {
          yield { type: 'model_delta', text: event.text };
        } else {
          final = event;
        }
      }
    } catch (err) {
      yield { type: 'error', message: errorText(err) };
      return messages;
    }

    if (!final || final.type !== 'final') {
      yield { type: 'error', message: 'The model stream ended without a response.' };
      return messages;
    }

    const raw = final.response.toolCalls;
    const calls: AgentToolCall[] = raw.map((rawCall) => {
      const target = deps.resolve(rawCall.name);
      return {
        id: rawCall.id,
        llmName: rawCall.name,
        serverId: target?.serverId ?? '',
        toolName: target?.toolName ?? rawCall.name,
        args: rawCall.args,
      };
    });

    const assistant: AgentMessage = {
      role: 'assistant',
      text: final.response.text,
      toolCalls: calls.length > 0 ? calls : undefined,
    };
    messages.push(assistant);
    yield { type: 'model_message', message: assistant };

    if (calls.length === 0) {
      yield { type: 'done' };
      return messages;
    }

    for (const call of calls) {
      if (deps.signal.aborted) {
        yield { type: 'error', message: 'Run cancelled' };
        return messages;
      }

      if (!call.serverId) {
        const text = `No tool named "${call.toolName}" is available. Use one of the provided tools.`;
        messages.push({ role: 'tool', toolCallId: call.id, text, isError: true });
        yield { type: 'tool_result', call, text, isError: true };
        continue;
      }

      yield { type: 'tool_requested', call };
      const decision = await deps.gate(call);

      if (decision.kind === 'deny') {
        const text = DENIAL_TEXT[decision.reason];
        yield { type: 'tool_denied', call, reason: decision.reason };
        messages.push({ role: 'tool', toolCallId: call.id, text, isError: true });
        continue;
      }

      yield { type: 'tool_allowed', call, remembered: decision.remember };

      try {
        const result = await deps.callTool(call.serverId, call.toolName, call.args);
        const text = toolResultText(result);
        const isError = result.isError === true;
        messages.push({ role: 'tool', toolCallId: call.id, text, isError });
        yield { type: 'tool_result', call, text, isError };
      } catch (err) {
        const text = errorText(err);
        messages.push({ role: 'tool', toolCallId: call.id, text, isError: true });
        yield { type: 'tool_result', call, text, isError: true };
      }
    }
  }

  yield { type: 'turn_limit', turns: deps.maxTurns };
  return messages;
}
