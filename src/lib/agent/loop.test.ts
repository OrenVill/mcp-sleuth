import { describe, expect, it, vi } from 'vitest';
import type { ToolResult } from '../../types';
import { DENIAL_TEXT, runAgentTurn } from './loop';
import type {
  AgentEvent,
  GateDecision,
  LlmConfig,
  LlmStreamEvent,
  LlmResponse,
} from './types';

const config: LlmConfig = {
  id: 'l1',
  label: 'Test',
  provider: 'openai',
  baseUrl: 'http://x/v1',
  model: 'test',
};

/** Returns a sendToModel that yields the given scripted responses in order. */
function scriptedModel(responses: LlmResponse[]) {
  let index = 0;
  return async function* (): AsyncIterable<LlmStreamEvent> {
    const response = responses[index++] ?? { text: 'done', toolCalls: [] };
    if (response.text) yield { type: 'delta', text: response.text };
    yield { type: 'final', response };
  };
}

const okResult = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });

async function collect(
  iterable: AsyncGenerator<AgentEvent, unknown>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function deps(over: Partial<Parameters<typeof runAgentTurn>[0]> = {}) {
  return {
    sendToModel: scriptedModel([{ text: 'hello', toolCalls: [] }]),
    callTool: vi.fn(async () => okResult('tool ran')),
    gate: vi.fn(async (): Promise<GateDecision> => ({ kind: 'allow', remember: false })),
    resolve: (name: string) => ({ serverId: 's1', toolName: name }),
    maxTurns: 8,
    signal: new AbortController().signal,
    ...over,
  };
}

const init = { config, system: 'you are a test', tools: [] };

describe('runAgentTurn', () => {
  it('emits deltas then a message then done when no tools are called', async () => {
    const events = await collect(runAgentTurn(deps(), { ...init, messages: [] }));
    expect(events.map((e) => e.type)).toEqual(['model_delta', 'model_message', 'done']);
  });

  it('calls an approved tool and feeds the result back to the model', async () => {
    const callTool = vi.fn(async () => okResult('20 repos'));
    const events = await collect(
      runAgentTurn(
        deps({
          callTool,
          sendToModel: scriptedModel([
            { text: '', toolCalls: [{ id: 'c1', name: 'list_repos', args: { limit: 20 } }] },
            { text: 'You have 20.', toolCalls: [] },
          ]),
        }),
        { ...init, messages: [] },
      ),
    );
    expect(callTool).toHaveBeenCalledWith('s1', 'list_repos', { limit: 20 });
    expect(events.map((e) => e.type)).toEqual([
      'model_message',
      'tool_requested',
      'tool_allowed',
      'tool_result',
      'model_delta',
      'model_message',
      'done',
    ]);
  });

  it('feeds a denial back to the model instead of aborting the run', async () => {
    const callTool = vi.fn(async () => okResult('never'));
    const events = await collect(
      runAgentTurn(
        deps({
          callTool,
          gate: async (): Promise<GateDecision> => ({ kind: 'deny', reason: 'wrong_tool' }),
          sendToModel: scriptedModel([
            { text: '', toolCalls: [{ id: 'c1', name: 'rm_rf', args: {} }] },
            { text: 'Understood, trying another way.', toolCalls: [] },
          ]),
        }),
        { ...init, messages: [] },
      ),
    );
    expect(callTool).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'tool_denied')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('records the denial reason in the message fed to the model', async () => {
    const gen = runAgentTurn(
      deps({
        gate: async (): Promise<GateDecision> => ({ kind: 'deny', reason: 'bad_arguments' }),
        sendToModel: scriptedModel([
          { text: '', toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
          { text: 'ok', toolCalls: [] },
        ]),
      }),
      { ...init, messages: [] },
    );
    let messages: unknown;
    // Drain, keeping the generator's return value.
    for (;;) {
      const next = await gen.next();
      if (next.done) {
        messages = next.value;
        break;
      }
    }
    expect(JSON.stringify(messages)).toContain(DENIAL_TEXT.bad_arguments);
  });

  it('feeds a tool error back rather than throwing', async () => {
    const events = await collect(
      runAgentTurn(
        deps({
          callTool: vi.fn(async () => {
            throw new Error('connection refused');
          }),
          sendToModel: scriptedModel([
            { text: '', toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
            { text: 'That failed.', toolCalls: [] },
          ]),
        }),
        { ...init, messages: [] },
      ),
    );
    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toMatchObject({ isError: true, text: 'connection refused' });
  });

  it('reports an unresolvable tool name back to the model', async () => {
    const callTool = vi.fn(async () => okResult('never'));
    const events = await collect(
      runAgentTurn(
        deps({
          callTool,
          resolve: () => null,
          sendToModel: scriptedModel([
            { text: '', toolCalls: [{ id: 'c1', name: 'ghost', args: {} }] },
            { text: 'ok', toolCalls: [] },
          ]),
        }),
        { ...init, messages: [] },
      ),
    );
    expect(callTool).not.toHaveBeenCalled();
    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toMatchObject({ isError: true });
  });

  it('stops at the turn limit', async () => {
    let n = 0;
    const events = await collect(
      runAgentTurn(
        deps({
          maxTurns: 3,
          sendToModel: async function* (): AsyncIterable<LlmStreamEvent> {
            yield {
              type: 'final',
              response: { text: '', toolCalls: [{ id: `c${n++}`, name: 'loop', args: {} }] },
            };
          },
        }),
        { ...init, messages: [] },
      ),
    );
    expect(events.at(-1)).toEqual({ type: 'turn_limit', turns: 3 });
  });

  it('emits an error when the model call throws', async () => {
    const events = await collect(
      runAgentTurn(
        deps({
          sendToModel: async function* (): AsyncIterable<LlmStreamEvent> {
            throw new Error('401 Unauthorized');
            // eslint-disable-next-line no-unreachable
            yield { type: 'final', response: { text: '', toolCalls: [] } };
          },
        }),
        { ...init, messages: [] },
      ),
    );
    expect(events.at(-1)).toEqual({ type: 'error', message: '401 Unauthorized' });
  });

  it('stops immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      runAgentTurn(deps({ signal: controller.signal }), { ...init, messages: [] }),
    );
    expect(events).toEqual([{ type: 'error', message: 'Run cancelled' }]);
  });

  it('passes the accumulated history to each model call', async () => {
    const seen: number[] = [];
    const sendToModel = async function* (req: { messages: unknown[] }) {
      seen.push(req.messages.length);
      yield {
        type: 'final' as const,
        response:
          seen.length === 1
            ? { text: '', toolCalls: [{ id: 'c1', name: 'x', args: {} }] }
            : { text: 'done', toolCalls: [] },
      };
    };
    await collect(
      runAgentTurn(deps({ sendToModel }), {
        ...init,
        messages: [{ role: 'user', text: 'go' }],
      }),
    );
    // turn 1: the user message. turn 2: user + assistant + tool result.
    expect(seen).toEqual([1, 3]);
  });
});
